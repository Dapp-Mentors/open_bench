// src/lib/auth/passkey.ts
//
// WebAuthn / Passkey helpers using @simplewebauthn/server.
//
// FIX: Replaced the in-memory `challengeStore` Map with DB-backed challenge
// storage (PasskeyChallenge model). The in-memory store is wiped on every
// serverless cold start, which broke passkey auth/registration whenever the
// Node process restarted between the GET (generate options) and POST (verify)
// calls. Challenges now persist in Postgres with a 5-minute TTL and are
// cleaned up after use.
//
// Required schema addition — add this model to schema.prisma:
//
//   model PasskeyChallenge {
//     id        String   @id @default(cuid())
//     key       String   @unique   // e.g. "reg:userId" | "first-reg:tempId" | "auth:challenge"
//     challenge String
//     expiresAt DateTime
//   }
//
// Then run: npx prisma migrate dev --name add_passkey_challenge

import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
    AuthenticationResponseJSON,
    RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma/client";
import { createId } from "@paralleldrive/cuid2";

const RP_NAME = "OpenBench";
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── WebAuthn config (read from DB, cached in process) ──────────────────────

let _rpId: string | null = null;
let _origin: string | null = null;

async function getWebauthnConfig(): Promise<{ rpId: string; origin: string }> {
    if (_rpId && _origin) return { rpId: _rpId, origin: _origin };

    try {
        const settings = await prisma.appSettings.findUnique({
            where: { id: "default" },
            select: { webauthnRpId: true, webauthnOrigin: true },
        });
        if (settings?.webauthnRpId && settings?.webauthnOrigin) {
            _rpId = settings.webauthnRpId;
            _origin = settings.webauthnOrigin;
            return { rpId: _rpId!, origin: _origin! };
        }
    } catch {
        // ignore — fall back to env
    }

    return {
        rpId: process.env.WEBAUTHN_RP_ID ?? "localhost",
        origin: process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000",
    };
}

// ── DB-backed challenge store ───────────────────────────────────────────────

async function storeChallenge(key: string, challenge: string): Promise<void> {
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await prisma.passkeyChallenge.upsert({
        where: { key },
        update: { challenge, expiresAt },
        create: { key, challenge, expiresAt },
    });
}

async function getChallenge(key: string): Promise<string | null> {
    const row = await prisma.passkeyChallenge.findUnique({ where: { key } });
    if (!row) return null;
    if (row.expiresAt < new Date()) {
        // Expired — clean up and treat as missing
        await prisma.passkeyChallenge.delete({ where: { key } }).catch(() => { });
        return null;
    }
    return row.challenge;
}

async function deleteChallenge(key: string): Promise<void> {
    await prisma.passkeyChallenge.delete({ where: { key } }).catch(() => { });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function credentialDescriptor(id: string): { id: BufferSource; type: "public-key" } {
    return {
        id: Buffer.from(id, "base64url"),
        type: "public-key" as const,
    };
}

// ── Registration (existing user adding a passkey) ───────────────────────────

export async function generatePasskeyRegistrationOptions(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { passkeys: true },
    });
    if (!user) throw new Error("User not found");

    const { rpId } = await getWebauthnConfig();
    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rpId,
        userID: user.id,
        userName: user.email ?? userId,
        userDisplayName: user.name ?? user.email ?? userId,
        attestationType: "none",
        excludeCredentials: user.passkeys.map((pk) => credentialDescriptor(pk.credentialId)),
        authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "required",
            authenticatorAttachment: "platform",
        },
    });

    await storeChallenge(`reg:${userId}`, options.challenge);
    return options;
}

export async function verifyPasskeyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    passkeyName?: string
) {
    const expectedChallenge = await getChallenge(`reg:${userId}`);
    if (!expectedChallenge) throw new Error("No pending registration challenge (expired or missing)");

    const { rpId, origin } = await getWebauthnConfig();
    const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
        throw new Error("Passkey registration verification failed");
    }

    await deleteChallenge(`reg:${userId}`);

    const info = verification.registrationInfo;

    await prisma.passkey.create({
        data: {
            userId,
            credentialId: response.id,
            publicKey: Buffer.from(info.credentialPublicKey).toString("base64url"),
            counter: BigInt(info.counter),
            deviceType: info.credentialDeviceType,
            backedUp: info.credentialBackedUp,
            transports: response.response.transports
                ? JSON.stringify(response.response.transports)
                : null,
            name: passkeyName ?? "Passkey",
        },
    });

    return { verified: true };
}

// ── First-time registration (no existing account) ───────────────────────────

export async function generateFirstTimePasskeyOptions() {
    const tempId = createId();

    const { rpId } = await getWebauthnConfig();
    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rpId,
        userID: tempId,
        userName: tempId,
        userDisplayName: "User",
        attestationType: "none",
        excludeCredentials: [],
        authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
            authenticatorAttachment: "platform",
        },
    });

    await storeChallenge(`first-reg:${tempId}`, options.challenge);
    return { options, tempId };
}

export async function verifyFirstTimePasskeyRegistration(
    tempId: string,
    response: RegistrationResponseJSON
) {
    const expectedChallenge = await getChallenge(`first-reg:${tempId}`);
    if (!expectedChallenge) throw new Error("No pending first-time registration challenge (expired or missing)");

    const { rpId, origin } = await getWebauthnConfig();
    const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
        throw new Error("First-time passkey registration verification failed");
    }

    await deleteChallenge(`first-reg:${tempId}`);

    const info = verification.registrationInfo;

    // FIX: Use a NULL email instead of a fake "@passkey.openbench.local" address.
    // The User model has `email String @unique` — using a generated fake email
    // risks collisions and misleads any email-sending logic. Passkey-only users
    // have no email; the unique constraint is satisfied by leaving it null.
    // NOTE: This requires changing the schema: email String? @unique
    // If you cannot change the schema right now, use a truly unique sentinel:
    //   email: `passkey-${createId()}@noemail.invalid`
    // but prefer nullable email for correctness.
    const user = await prisma.user.create({
        data: {
            name: "User",
            email: `passkey-${createId()}@noemail.invalid`, // unique; update schema to nullable when possible
            role: "user",
        },
    });

    await prisma.passkey.create({
        data: {
            userId: user.id,
            credentialId: response.id,
            publicKey: Buffer.from(info.credentialPublicKey).toString("base64url"),
            counter: BigInt(info.counter),
            deviceType: info.credentialDeviceType,
            backedUp: info.credentialBackedUp,
            transports: response.response.transports
                ? JSON.stringify(response.response.transports)
                : null,
            name: "My fingerprint",
        },
    });

    return { verified: true, user };
}

// ── Authentication ──────────────────────────────────────────────────────────

export async function generatePasskeyAuthOptions() {
    const { rpId } = await getWebauthnConfig();
    const options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: "required",
        allowCredentials: undefined, // Allow discoverable (resident) credentials
    });

    await storeChallenge(`auth:${options.challenge}`, options.challenge);
    return options;
}

export async function verifyPasskeyAuth(response: AuthenticationResponseJSON) {
    const passkey = await prisma.passkey.findUnique({
        where: { credentialId: response.id },
        include: { user: true },
    });
    if (!passkey) throw new Error("Passkey not found");

    // Decode clientDataJSON to extract the challenge the browser actually used
    const clientData = JSON.parse(
        Buffer.from(response.response.clientDataJSON, "base64url").toString("utf-8")
    );
    const responseChallenge = clientData.challenge;

    const storedChallenge = await getChallenge(`auth:${responseChallenge}`);
    if (!storedChallenge) throw new Error("No pending authentication challenge (expired or missing)");

    const { rpId, origin } = await getWebauthnConfig();
    const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: storedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        authenticator: {
            credentialID: Buffer.from(passkey.credentialId, "base64url"),
            credentialPublicKey: Buffer.from(passkey.publicKey, "base64url"),
            counter: Number(passkey.counter),
            transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
        },
    });

    if (!verification.verified) throw new Error("Passkey authentication failed");

    await deleteChallenge(`auth:${responseChallenge}`);

    await prisma.passkey.update({
        where: { id: passkey.id },
        data: {
            counter: BigInt(verification.authenticationInfo.newCounter),
            lastUsedAt: new Date(),
        },
    });

    return passkey.user;
}