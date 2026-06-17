// src/lib/auth/passkey.ts
//
// WebAuthn / Passkey helpers using @simplewebauthn/server.
// These run server-side only (API routes).

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

const RP_NAME = "OpenBench";
const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";

// In-memory challenge store (replace with Redis in production for multi-instance)
const challengeStore = new Map<string, string>();

// BufferSource-compatible credential descriptor helper
function credentialDescriptor(id: string): { id: BufferSource; type: "public-key" } {
    return {
        id: Buffer.from(id, "base64url"),
        type: "public-key" as const,
    };
}

// ── Registration (adding a new passkey to an existing account) ────────────────

/** Generate registration options for a logged-in user. */
export async function generatePasskeyRegistrationOptions(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { passkeys: true },
    });

    if (!user) throw new Error("User not found");

    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userID: user.id,
        userName: user.email ?? userId,
        userDisplayName: user.name ?? user.email ?? userId,
        attestationType: "none",
        // Exclude already-registered credentials so the browser doesn't offer duplicates
        excludeCredentials: user.passkeys.map((pk) => credentialDescriptor(pk.credentialId)),
        authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "preferred",
        },
    });

    // Store challenge keyed by userId for verification
    challengeStore.set(`reg:${userId}`, options.challenge);

    return options;
}

/** Verify and save a new passkey credential. */
export async function verifyPasskeyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    passkeyName?: string
) {
    const expectedChallenge = challengeStore.get(`reg:${userId}`);
    if (!expectedChallenge) throw new Error("No pending registration challenge");

    const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
        throw new Error("Passkey registration verification failed");
    }

    challengeStore.delete(`reg:${userId}`);

    const info = verification.registrationInfo;

    await prisma.passkey.create({
        data: {
            userId,
            credentialId: response.id,
            // Use the verified credentialPublicKey from the registration response
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

// ── Authentication (signing in with a passkey) ────────────────────────────────

/** Generate authentication options (challenge) for passkey sign-in. */
export async function generatePasskeyAuthOptions(email?: string) {
    let allowCredentials: { id: string; type: "public-key" }[] = [];

    if (email) {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { passkeys: true },
        });
        if (user?.passkeys.length) {
            allowCredentials = user.passkeys.map((pk) => ({
                id: pk.credentialId,
                type: "public-key" as const,
            }));
        }
    }

    const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: "preferred",
        allowCredentials: allowCredentials.length
            ? allowCredentials.map((c) => credentialDescriptor(c.id))
            : undefined,
    });

    // Challenge keyed by a temporary key; returned in the options for the client to echo back
    challengeStore.set(`auth:${options.challenge}`, options.challenge);

    return options;
}

/** Verify passkey authentication and return the user if valid. */
export async function verifyPasskeyAuth(response: AuthenticationResponseJSON) {
    const passkey = await prisma.passkey.findUnique({
        where: { credentialId: response.id },
        include: { user: true },
    });

    if (!passkey) throw new Error("Passkey not found");

    const allChallenges = [...challengeStore.entries()];
    const matchingEntry = allChallenges.find(([k]) => k.startsWith("auth:"));
    if (!matchingEntry) throw new Error("No pending authentication challenge");

    const [challengeKey, expectedChallengeValue] = matchingEntry;

    const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: expectedChallengeValue,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        authenticator: {
            credentialID: Buffer.from(passkey.credentialId, "base64url"),
            credentialPublicKey: Buffer.from(passkey.publicKey, "base64url"),
            counter: Number(passkey.counter),
            transports: passkey.transports
                ? JSON.parse(passkey.transports)
                : undefined,
        },
    });

    if (!verification.verified) throw new Error("Passkey authentication failed");

    challengeStore.delete(challengeKey);

    // Update counter to prevent replay attacks
    await prisma.passkey.update({
        where: { id: passkey.id },
        data: {
            counter: BigInt(verification.authenticationInfo.newCounter),
            lastUsedAt: new Date(),
        },
    });

    return passkey.user;
}