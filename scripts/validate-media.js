// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

// Optional integration check: run in Termux after installing FFmpeg.
// All media is synthetic; no WhatsApp connection or account is used.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "../src/media-decoder.js";
import { formatMediaInfo, inspectMedia, prepareStatusPayload } from "../src/status-media.js";

const directory = await mkdtemp(path.join(os.tmpdir(), "whatsapp-hd-media-validation-"));
try {
  for (const [extension, format] of [["jpg", "JPEG"], ["png", "PNG"], ["webp", "WebP"], ["mp4", "MP4"], ["m4v", "M4V"]]) {
    const file = path.join(directory, `sample.${extension}`);
    const kind = ["mp4", "m4v"].includes(extension) ? "video" : "image";
    await runFfmpeg(["-f", "lavfi", "-i", "color=c=blue:s=96x64:r=10:d=0.3",
      ...(kind === "image" ? ["-frames:v", "1"] : ["-c:v", "mpeg4", "-f", "mp4", "-brand", extension === "m4v" ? "M4V " : "isom"]), file]);
    const original = await readFile(file);
    const media = await inspectMedia(file, { expectedKind: kind });
    assert.equal(media.format, format);
    assert.equal(media.width, 96); assert.equal(media.height, 64);
    if (kind === "video") assert.equal(media.fps, 10);
    const caption = "  Media validation ✨\nSecond line  ";
    const { content } = await prepareStatusPayload(media, caption);
    assert.equal(content[kind].url, file);
    assert.equal(content.caption, caption);
    if (kind === "image") {
      assert.equal(media.width, 96);
      assert.equal(media.height, 64);
      assert.ok(content.jpegThumbnail.length > 0);
    }
    assert.deepEqual(await readFile(file), original);
    await assert.rejects(inspectMedia(file, { expectedKind: kind === "image" ? "video" : "image" }));
    const broken = path.join(directory, `truncated.${extension}`);
    await writeFile(broken, original.subarray(0, Math.floor(original.length / 2)));
    await assert.rejects(inspectMedia(broken));
    console.log(`${formatMediaInfo(media)}: decoded, original bytes preserved, caption preserved, wrong type and truncation rejected`);
  }
  for (const [rate, expected] of [["60", 60], ["60000/1001", 60000 / 1001]]) {
    const file = path.join(directory, `video-${expected.toFixed(2)}.mp4`);
    await runFfmpeg(["-f", "lavfi", "-i", `color=c=blue:s=1920x1080:r=${rate}:d=0.1`, "-c:v", "mpeg4", "-f", "mp4", file]);
    const original = await readFile(file), media = await inspectMedia(file);
    assert.equal(media.width, 1920); assert.equal(media.height, 1080);
    assert.ok(Math.abs(media.fps - expected) < 0.000001);
    assert.deepEqual(await readFile(file), original);
    console.log(`${formatMediaInfo(media)}: real video metadata verified`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
