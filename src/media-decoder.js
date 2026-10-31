// SPDX-License-Identifier: GPL-3.0-only
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
