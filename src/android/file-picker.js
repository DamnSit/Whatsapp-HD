// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rename, rm, stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { inspectMedia } from "../status-media.js";

export const PICKER_HELP = "Install the package with: pkg install termux-api. Also install the Termux:API Android companion app from a source compatible with your Termux/ZeroTermux installation. The package alone is not the Android app.";

export async function checkApiCompanion({ run = promisify(execFile), signal,
  android = process.platform === "android" || Boolean(process.env.PREFIX?.includes("/com.termux/")) } = {}) {
  if (!android) return;
  try {
    const options = { timeout: 5000, signal, windowsHide: true };
    let stdout;
    try { ({ stdout } = await run("/system/bin/pm", ["path", "com.termux.api"], options)); }
    catch (error) {
      // Android's pm returns exit 1 with no output for an absent package.
      // Permission errors and timeouts do not establish absence.
      if (error.code !== 1 || error.stdout !== "" || error.stderr?.trim()) throw error;
      stdout = "";
    }
    if (stdout.includes("package:")) return;
    // Some Android versions deny package queries. Only diagnose absence when
    // package queries demonstrably work for the host application.
    const host = await run("/system/bin/pm", ["path", "com.termux"], options);
    if (host.stdout.includes("package:")) throw new Error("Termux:API Android companion is missing. " + PICKER_HELP);
  } catch (error) {
    if (error.name === "AbortError" || error.message.startsWith("Termux:API")) throw error;
  }
}

export async function waitForPickedFile(destination, { signal, timeout = 120000, interval = 250, settle = 1000 } = {}) {
  const started = Date.now();
  let previous, unchangedSince;
  while (Date.now() - started < timeout) {
    signal?.throwIfAborted();
    try {
      const info = await stat(destination);
      const current = `${info.size}:${info.mtimeMs}`;
      if (current !== previous) { previous = current; unchangedSince = Date.now(); }
      else if (Date.now() - unchangedSince >= settle) return true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      previous = undefined; unchangedSince = undefined;
    }
    await delay(interval, undefined, { signal });
  }
  throw new Error("No file received from Android within two minutes. Choose a file again; after cancelling in Android, press Esc in the terminal to go back.");
}

export async function launchPicker(destination, { spawnProcess = spawn, signal, checkCompanion = checkApiCompanion, waitForFile = waitForPickedFile } = {}) {
  await checkCompanion({ signal });
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawnProcess("termux-storage-get", [destination], { shell: false, detached: grouped, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], signal });
    const abort = () => {
      try {
        // termux-storage-get is a shell wrapper. Stop its API helper too, or
        // inherited pipes keep Node alive after the user has exited the TUI.
        if (grouped && child.pid) process.kill(-child.pid, "SIGTERM");
        else child.kill?.();
      } catch { /* the command may already have exited */ }
    };
    signal?.addEventListener("abort", abort, { once: true });
    let stderr = "", stdout = "";
    child.stdout?.on("data", (data) => { stdout = (stdout + data).slice(-2000); });
    child.stderr?.on("data", (data) => { stderr = (stderr + data).slice(-2000); });
    child.once("error", (error) => {
      // Abort emits an error before the wrapper/helper has finished exiting.
      // Wait for close so finally cannot remove a destination still in use.
      if (error.name === "AbortError" && signal?.aborted) return;
      signal?.removeEventListener("abort", abort);
      reject(error.code === "ENOENT" ? new Error(PICKER_HELP) : error);
    });
    child.once("close", (code, killed) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) { reject(new DOMException("Picker cancelled", "AbortError")); return; }
      if (code !== 0) {
        if (/cancel/i.test(stderr) || code === 130 || killed) resolve(false);
        else reject(new Error(`File picker exited (${code}). ${stderr.trim()} ${PICKER_HELP}`));
      } else if (/^\s*ERROR:/m.test(stdout)) reject(new Error(stdout.trim()));
      else {
        // Termux:API 0.53.0 closes its command socket immediately after opening
        // DocumentsUI. The selected file arrives later, independently of exit 0.
        // Wait for the copy to stop changing before validating its contents.
        waitForFile(destination, { signal }).then(resolve, reject);
      }
    });
  });
}

export async function withPickedMedia(kind, useMedia, { signal, pick = launchPicker, inspect = inspectMedia, temporaryRoot = os.tmpdir() } = {}) {
  const directory = await mkdtemp(path.join(temporaryRoot, "whatsapp-hd-picker-"));
  const destination = path.join(directory, "selection");
  try {
    if (!await pick(destination, { signal })) return null;
    let media;
    try { media = await inspect(destination, { expectedKind: kind, allowNoExtension: true, signal }); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    // DocumentsUI does not return the provider's original filename. Infer only
    // the temporary copy's extension, after its actual content has been checked.
    const file = destination + media.detectedExtension;
    await rename(destination, file);
    media = { ...media, file, filename: path.basename(file), extension: media.detectedExtension, originalNameAvailable: false };
    return await useMedia(media);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
