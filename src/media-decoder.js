// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { spawn } from "node:child_process";

export function runFfmpeg(args, { spawnProcess = spawn, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess("ffmpeg", ["-nostdin", "-v", "error", "-xerror", ...args], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], signal });
    const output = []; let stderr = "", size = 0;
    child.stdout.on("data", (data) => { size += data.length; if (size <= 1024 * 1024) output.push(data); else child.kill(); });
    child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-2000); });
    child.once("error", (error) => reject(error.code === "ENOENT" ? new Error("Media decoding needs FFmpeg. In Termux run: pkg install ffmpeg") : error));
    child.once("close", (code) => code === 0 && size <= 1024 * 1024 ? resolve(Buffer.concat(output)) : reject(new Error("Invalid, incomplete or undecodable media: " + stderr.trim())));
  });
}

export async function webpPreview(file, options) {
  return runFfmpeg(["-i", file, "-frames:v", "1", "-vf", "scale=32:-1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"], options);
}

export async function validateVideoFrames(file, options) {
  await runFfmpeg(["-i", file, "-map", "0:v:0", "-f", "null", "-"], options);
}

export function probeVideoMetadata(file, { spawnProcess = spawn, signal } = {}) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawnProcess("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate", "-of", "json", "-i", file], {
      shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], signal
    });
    let stdout = "", stderr = "", failure;
    child.stdout.on("data", (data) => {
      stdout += data;
      if (stdout.length > 64 * 1024) {
        failure = new Error("Video metadata exceeds the expected size.");
        stdout = ""; child.kill();
      }
    });
    child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-2000); });
    child.once("error", (error) => {
      failure = error.code === "ENOENT" ? new Error("Video metadata needs FFprobe. In Termux run: pkg install ffmpeg") : error;
    });
    child.once("close", (code) => {
      if (signal?.aborted) { reject(new DOMException("Media inspection cancelled", "AbortError")); return; }
      if (failure) { reject(failure); return; }
      if (code !== 0) { reject(new Error("Cannot read video metadata: " + stderr.trim())); return; }
      try {
        const stream = JSON.parse(stdout).streams?.[0];
        if (!Number.isSafeInteger(stream?.width) || stream.width <= 0 || !Number.isSafeInteger(stream.height) || stream.height <= 0) {
          throw new Error("Video metadata has no valid dimensions.");
        }
        const rate = String(stream.avg_frame_rate ?? "").split("/");
        const fps = rate.length <= 2 ? Number(rate[0]) / (rate.length === 2 ? Number(rate[1]) : 1) : NaN;
        resolve({ width: stream.width, height: stream.height, fps: Number.isFinite(fps) && fps > 0 ? fps : undefined });
      } catch (error) { reject(new Error("Cannot read video metadata: " + error.message)); }
    });
  });
}
