// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { Jimp } from "jimp";
import { inspectMedia, prepareStatusPayload } from "../src/status-media.js";
import { publishStatus } from "../src/status-publisher.js";
import { imageFile, mp4, temporary, webp } from "./helpers.js";

for (const [ext, format] of [["jpg", "JPEG"], ["png", "PNG"]]) test(`detects and validates ${format} without modifying original bytes`, async (t) => {
  const file = await imageFile(await temporary(t), ext), original = await readFile(file);
  const media = await inspectMedia(file, { expectedKind: "image" });
  assert.equal(media.format, format); assert.equal(media.width, 48); assert.equal(media.height, 32);
  const payload = await prepareStatusPayload(media, " Caption ✨\nline two ");
  assert.equal(payload.content.image.url, file); assert.equal(payload.content.caption, " Caption ✨\nline two ");
  assert.deepEqual(await readFile(file), original);
});

test("WebP requires a preview decoder because existing Jimp codecs cannot decode it", async (t) => {
  const dir = await temporary(t), file = path.join(dir, "image.webp");
  await writeFile(file, webp);
  await assert.rejects(Jimp.read(file), /Mime|MIME|format|type/i);
  let calls = 0;
  const decodeWebp = async (source) => { assert.equal(source, file); calls++; return Buffer.from("jpeg preview"); };
  const media = await inspectMedia(file, { decodeWebp });
  assert.equal(media.format, "WebP"); assert.equal(media.width, 1);
  const { content } = await prepareStatusPayload(media, "", { decodeWebp });
  assert.equal(content.image.url, file); assert.equal(calls, 2); assert.equal(Object.hasOwn(content, "caption"), false);
});

for (const [brand, format, ext] of [["isom", "MP4", "mp4"], ["M4V ", "M4V", "m4v"]]) test(`validates ${format} ftyp brands and calls the video decoder`, async (t) => {
  const file = path.join(await temporary(t), "video." + ext); await writeFile(file, mp4(brand));
  let checked = false;
  const media = await inspectMedia(file, { decodeVideo: async () => { checked = true; } });
  assert.equal(media.format, format); assert.equal(checked, true);
  const { content } = await prepareStatusPayload(media, "test"); assert.equal(content.video.url, file); assert.equal(content.mimetype, "video/mp4");
});

test("rejects empty, unsupported, incomplete, mismatched media and decoder failures", async (t) => {
  const dir = await temporary(t), image = await imageFile(dir);
  const wrong = path.join(dir, "fake.jpg"); await writeFile(wrong, await readFile(image));
  await assert.rejects(inspectMedia(wrong), /extension/);
  await assert.rejects(inspectMedia(image, { expectedKind: "video" }), /Select/);
  const file = path.join(dir, "video.mp4");
  for (const data of [Buffer.alloc(0), Buffer.from("unsupported"), mp4().subarray(0, 35), mp4("qt  ")]) {
    await writeFile(file, data); await assert.rejects(inspectMedia(file, { decodeVideo: async () => {} }));
  }
  await writeFile(file, mp4());
  await assert.rejects(inspectMedia(file, { expectedKind: "image" }), /Select/);
  await assert.rejects(inspectMedia(file, { decodeVideo: async () => { throw new Error("decoder rejected corrupt frames"); } }), /corrupt/);
  await writeFile(image, (await readFile(image)).subarray(0, 60));
  await assert.rejects(inspectMedia(image), /Incomplete|incomplete/);
});

test("existing publisher preserves sender normalization, fan-out, payload and caption", async (t) => {
  const file = await imageFile(await temporary(t)); const caption = "  Unicode ✨\n第二行  "; let request;
  const socket = { user: { id: "62811111111:12@s.whatsapp.net" }, sendMessage: async (...args) => { request = args; return { key: { id: "mock" } }; } };
  await publishStatus(socket, { uploadPath: file, caption, statusRecipients: ["62822222222@s.whatsapp.net", "62822222222@s.whatsapp.net"] });
  assert.equal(request[0], "status@broadcast"); assert.equal(request[1].image.url, file); assert.equal(request[1].caption, caption);
  assert.deepEqual(request[2], { broadcast: true, statusJidList: ["62811111111@s.whatsapp.net", "62822222222@s.whatsapp.net"], mediaUploadTimeoutMs: 180000 });
});
