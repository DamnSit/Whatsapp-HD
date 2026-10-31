// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Supply the independent consumer installation directory.");
const consumer = path.resolve(process.argv[2]);
const installed = path.join(consumer, "node_modules/whatsapp-hd");
const require = createRequire(path.join(installed, "package.json"));
const { Curve } = await import(pathToFileURL(require.resolve("@whiskeysockets/baileys")));
const { installSignatureVerification, verifySignalSignature } = await import(pathToFileURL(path.join(installed, "src/security/signatures.js")));
installSignatureVerification();
const identity = Curve.generateKeyPair(), message = Buffer.from("Packaged signature verification");
const signature = Curve.sign(identity.private, message), invalid = Buffer.from(signature);
invalid[0] ^= 1;
assert.equal(verifySignalSignature(identity.public, message, signature), true);
assert.equal(Curve.verify(identity.public, message, signature), true);
assert.equal(Curve.verify(identity.public, message, invalid), false);

const seen = new Set();
let declarations = 0;
async function checkManifest(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const packageRequire = createRequire(file);
  if (manifest.dependencies?.zod) {
    assert.equal(manifest.dependencies.zod, "4.6.7");
    const zod = JSON.parse(await readFile(packageRequire.resolve("zod/package.json"), "utf8"));
    assert.equal(zod.version, "4.6.7");
    declarations++;
  }
  for (const name of Object.keys(manifest.dependencies || {})) {
    if (name.startsWith("@jimp/")) await checkManifest(packageRequire.resolve(`${name}/package.json`));
  }
}
const jimpManifest = require.resolve("jimp/package.json");
await checkManifest(jimpManifest);
assert.equal(declarations, 16);

const { Jimp } = await import(pathToFileURL(path.join(path.dirname(jimpManifest), "dist/esm/index.js")));
const { inspectMedia, prepareStatusPayload } = await import(pathToFileURL(path.join(installed, "src/status-media.js")));
for (const [extension, mime] of [["png", "image/png"], ["jpg", "image/jpeg"]]) {
  const image = new Jimp({ width: 64, height: 32, color: 0x3399ffff });
  const original = await image.getBuffer(mime);
  const file = path.join(consumer, `Whatsapp-HD-validation-${randomUUID()}.${extension}`);
  await writeFile(file, original, { flag: "wx" });
  try {
    const media = await inspectMedia(file);
    const { content } = await prepareStatusPayload(media, "Original caption ✨");
    assert.equal(content.image.url, file);
    assert.equal(content.caption, "Original caption ✨");
    assert.equal(content.width, 64); assert.equal(content.height, 32);
    const thumbnail = await Jimp.read(Buffer.from(content.jpegThumbnail, "base64"));
    assert.equal(thumbnail.width, 32); assert.equal(thumbnail.height, 16);
    assert.deepEqual(await readFile(file), original);
  } finally { await unlink(file); }
}
console.log("Independent package passed signature checks, 16 Zod declarations, PNG/JPEG decoding and byte preservation.");
