// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { probeVideoMetadata } from "../src/media-decoder.js";

function probeOutput(value, validate = () => {}) {
  return (command, args, options) => {
    validate(command, args, options);
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    setImmediate(() => { child.stdout.emit("data", JSON.stringify(value)); child.emit("close", 0); });
    return child;
  };
}

test("FFprobe reads source dimensions and average FPS with shell characters kept in the filename", async () => {
  const source = "a path/video;not-a-command.mp4";
  const metadata = await probeVideoMetadata(source, { spawnProcess: probeOutput({ streams: [{ width: 1920, height: 1080, avg_frame_rate: "60000/1001" }] }, (command, args, options) => {
    assert.equal(command, "ffprobe"); assert.equal(args.at(-1), source); assert.equal(options.shell, false);
  }) });
  assert.equal(metadata.width, 1920); assert.equal(metadata.height, 1080);
  assert.ok(Math.abs(metadata.fps - 59.94005994) < 0.000001);
});

test("unavailable average FPS is not replaced with a guessed rate", async () => {
  for (const avg_frame_rate of ["0/0", "0/1", "N/A", "60/0", undefined]) {
    const metadata = await probeVideoMetadata("video.mp4", { spawnProcess: probeOutput({ streams: [{ width: 1080, height: 1920, avg_frame_rate, r_frame_rate: "60/1" }] }) });
    assert.equal(metadata.fps, undefined); assert.equal(metadata.width, 1080);
  }
});

test("missing video streams and invalid source dimensions are rejected", async () => {
  for (const streams of [[], [{ width: 0, height: 1080 }], [{ width: 1920, height: "1080" }]]) {
    await assert.rejects(probeVideoMetadata("video.mp4", { spawnProcess: probeOutput({ streams }) }), /valid dimensions/);
  }
});

test("missing FFprobe has installation guidance and cancellation waits for process close", async () => {
  await assert.rejects(probeVideoMetadata("video.mp4", { spawnProcess: () => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    setImmediate(() => { child.emit("error", Object.assign(new Error("missing"), { code: "ENOENT" })); child.emit("close", -2); });
    return child;
  } }), /pkg install ffmpeg/);
  const controller = new AbortController(); let child, settled = false;
  const pending = probeVideoMetadata("video.mp4", { signal: controller.signal, spawnProcess: () => {
    child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); return child;
  } });
  pending.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  controller.abort(); child.emit("error", new DOMException("Cancelled", "AbortError"));
  await Promise.resolve(); assert.equal(settled, false);
  child.emit("close", 1); await rejected;
});
