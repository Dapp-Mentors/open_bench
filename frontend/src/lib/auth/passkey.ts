// src/lib/auth/passkey.ts
//
// WebAuthn / Passkey helpers using @simplewebauthn/server.

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
const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";

const challengeStore = new Map<string, string>();

function credentialDescriptor(id: string): { id: BufferSource; type: "public-key" } {
    return {
        id: Buffer.from(id, "base64url"),
        type: "public-key" as const,
    };
}

// ── Registration flows (these already work) ─────────────────────────────────

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
        excludeCredentials: user.passkeys.map((pk) => credentialDescriptor(pk.credentialId)),
        authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "required",
            authenticatorAttachment: "platform",
        },
    });

    challengeStore.set(`reg:${userId}`, options.challenge);
    return options;
}

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

// First-time registration
export async function generateFirstTimePasskeyOptions() {
    const tempId = createId();

    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
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

    challengeStore.set(`first-reg:${tempId}`, options.challenge);
    return { options, tempId };
}

export async function verifyFirstTimePasskeyRegistration(
    tempId: string,
    response: RegistrationResponseJSON
) {
    const expectedChallenge = challengeStore.get(`first-reg:${tempId}`);
    if (!expectedChallenge) throw new Error("No pending first-time registration challenge");

    const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
        throw new Error("First-time passkey registration verification failed");
    }

    challengeStore.delete(`first-reg:${tempId}`);

    const info = verification.registrationInfo;

    const user = await prisma.user.create({
        data: {
            name: "User",
            email: `${createId()}@passkey.openbench.local`,
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

// ── Authentication (fixed for fingerprint-first login) ──────────────────────
export async function generatePasskeyAuthOptions() {
    const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: "required",           // Forces biometric prompt
        allowCredentials: undefined,            // Allow discoverable (resident) credentials
    });

    challengeStore.set(`auth:${options.challenge}`, options.challenge);
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

    // Look up the specific challenge that was sent to the browser
    const storedChallenge = challengeStore.get(`auth:${responseChallenge}`);
    if (!storedChallenge) throw new Error("No pending authentication challenge for this response");

    const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: storedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        authenticator: {
            credentialID: Buffer.from(passkey.credentialId, "base64url"),
            credentialPublicKey: Buffer.from(passkey.publicKey, "base64url"),
            counter: Number(passkey.counter),
            transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
        },
    });

    if (!verification.verified) throw new Error("Passkey authentication failed");

    challengeStore.delete(`auth:${responseChallenge}`);

    await prisma.passkey.update({
        where: { id: passkey.id },
        data: {
            counter: BigInt(verification.authenticationInfo.newCounter),
            lastUsedAt: new Date(),
        },
    });

    return passkey.user;
}