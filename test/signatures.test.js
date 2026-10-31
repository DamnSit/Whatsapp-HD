// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Curve, generateSignalPubKey, initAuthCreds } from "@whiskeysockets/baileys";
import { installSignatureVerification, makeVerifiedSignalRepository, verifySignalSignature } from "../src/security/signatures.js";
import { createWhatsAppClient } from "../src/whatsapp-client.js";
import { initializeStorage } from "../src/storage/paths.js";
import { temporary } from "./helpers.js";

const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {}, success() {} };
const aliceJid = "628111111111:1@s.whatsapp.net";
const bobJid = "628222222222:1@s.whatsapp.net";

function peer(t) {
  const creds = initAuthCreds();
  const data = Object.create(null);
  const keys = {
    async get(type, ids) {
      return Object.fromEntries(ids.filter((id) => data[type]?.[id]).map((id) => [id, data[type][id]]));
    },
    async set(update) {
      for (const [type, rows] of Object.entries(update)) Object.assign(data[type] ||= Object.create(null), rows);
    },
    async transaction(operation) { return operation(); }
  };
  const repository = makeVerifiedSignalRepository({ creds, keys }, logger);
  t.after(() => repository.close());
  return { creds, repository, data };
}

function bundle(creds) {
  return {
    registrationId: creds.registrationId,
    identityKey: generateSignalPubKey(creds.signedIdentityKey.public),
    signedPreKey: {
      keyId: creds.signedPreKey.keyId,
      publicKey: generateSignalPubKey(creds.signedPreKey.keyPair.public),
      signature: Buffer.from(creds.signedPreKey.signature)
    }
  };
}

test("signature verification accepts valid signatures and rejects changed signatures, messages and keys", () => {
  const identity = Curve.generateKeyPair();
  const message = Buffer.from("Whatsapp-HD signature regression");
  const signature = Curve.sign(identity.private, message);
  assert.equal(verifySignalSignature(identity.public, message, signature), true);
  assert.equal(verifySignalSignature(generateSignalPubKey(identity.public), message, signature), true);
  const changed = Buffer.from(signature); changed[0] ^= 1;
  assert.equal(verifySignalSignature(identity.public, message, changed), false);
  assert.equal(verifySignalSignature(identity.public, Buffer.from("different message"), signature), false);
  assert.equal(verifySignalSignature(Curve.generateKeyPair().public, message, signature), false);
  assert.equal(verifySignalSignature(identity.public, message, signature.subarray(0, 63)), false);
  assert.equal(verifySignalSignature(undefined, message, signature), false);
});

test("the shared Baileys verifier rejects invalid signatures after repeated installation", () => {
  const identity = Curve.generateKeyPair();
  const message = Buffer.from("Noise and pairing use the shared verifier");
  const signature = Curve.sign(identity.private, message);
  installSignatureVerification(); installSignatureVerification();
  assert.equal(Curve.verify(identity.public, message, signature), true);
  const changed = Buffer.from(signature); changed[0] ^= 1;
  assert.equal(Curve.verify(identity.public, message, changed), false);
});

test("an invalid signed pre-key cannot create or replace an E2EE session", async (t) => {
  const alice = peer(t), bob = peer(t);
  const invalid = bundle(bob.creds); invalid.signedPreKey.signature[0] ^= 1;
  await assert.rejects(alice.repository.injectE2ESession({ jid: bobJid, session: invalid }), /Invalid signed pre-key signature/);
  assert.equal((await alice.repository.validateSession(bobJid)).exists, false);
  assert.equal(Object.keys(alice.data.session || {}).length, 0);
  await alice.repository.injectE2ESession({ jid: bobJid, session: bundle(bob.creds) });
  const before = await alice.repository.getSessionInfo(bobJid);
  await assert.rejects(alice.repository.injectE2ESession({ jid: bobJid, session: invalid }), /Invalid signed pre-key signature/);
  assert.deepEqual(await alice.repository.getSessionInfo(bobJid), before);
  await assert.rejects(alice.repository.injectE2ESession({ jid: bobJid, session: {} }), /Invalid signed pre-key signature/);
});

test("verified signed pre-keys preserve real Signal encryption and decryption", async (t) => {
  const alice = peer(t), bob = peer(t);
  await alice.repository.injectE2ESession({ jid: bobJid, session: bundle(bob.creds) });
  const plaintext = Buffer.from("Original Status payload ✨\nsecond line");
  const encrypted = await alice.repository.encryptMessage({ jid: bobJid, data: plaintext });
  assert.equal(encrypted.type, "pkmsg");
  const decrypted = await bob.repository.decryptMessage({ jid: aliceJid, type: encrypted.type, ciphertext: encrypted.ciphertext });
  assert.deepEqual(Buffer.from(decrypted), plaintext);
});

test("the WhatsApp client installs both signature protections before creating its socket", async (t) => {
  const paths = await initializeStorage({ env: { WA_DATA_DIR: await temporary(t) }, legacyDirs: [] });
  const identity = Curve.generateKeyPair(), message = Buffer.from("client initialization");
  const invalid = Curve.sign(identity.private, message); invalid[0] ^= 1;
  let checked = false;
  const client = await createWhatsAppClient({ paths, report: logger, dependencies: {
    logger,
    useMultiFileAuthState: async () => ({ state: { creds: { registered: true }, keys: { set: async () => {} } }, saveCreds: async () => {} }),
    makeWASocket: (options) => {
      assert.equal(Curve.verify(identity.public, message, invalid), false);
      assert.equal(options.makeSignalRepository, makeVerifiedSignalRepository);
      checked = true;
      const ev = new EventEmitter();
      setImmediate(() => ev.emit("connection.update", { connection: "open" }));
      return { ev, user: { id: aliceJid }, end() {} };
    }
  } });
  t.after(() => client.stop());
  await client.connect();
  assert.equal(checked, true);
});
