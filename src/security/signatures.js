// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { createRequire } from "node:module";
import { Curve, generateSignalPubKey } from "@whiskeysockets/baileys";
import { makeLibSignalRepository } from "@whiskeysockets/baileys/lib/Signal/libsignal.js";

// Resolve the same libsignal instance used by Baileys, including nested installs.
const localRequire = createRequire(import.meta.url);
const baileysRequire = createRequire(localRequire.resolve("@whiskeysockets/baileys/lib/Utils/crypto.js"));
const signalCurve = baileysRequire("libsignal/src/curve.js");

export function verifySignalSignature(publicKey, message, signature) {
  try {
    // libsignal 6 returns false for an invalid signature. Do not pass its
    // fourth isInit argument: true bypasses signature verification entirely.
    return signalCurve.verifySignature(generateSignalPubKey(publicKey), message, signature) === true;
  } catch {
    return false;
  }
}

export function installSignatureVerification() {
  // Baileys' shared Curve object is also used by pairing and Noise certificate
  // validation. Its original wrapper discards libsignal's boolean result.
  Curve.verify = verifySignalSignature;
}

export function makeVerifiedSignalRepository(...args) {
  const repository = makeLibSignalRepository(...args);
  const injectSession = repository.injectE2ESession.bind(repository);
  repository.injectE2ESession = async (options) => {
    const session = options?.session;
    if (!verifySignalSignature(session?.identityKey, session?.signedPreKey?.publicKey, session?.signedPreKey?.signature)) {
      throw new Error("Invalid signed pre-key signature.");
    }
    return injectSession(options);
  };
  return repository;
}
