// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chmod, copyFile, cp, lstat, mkdir, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";

export function resolveStoragePaths(env = process.env, home = os.homedir()) {
  const dataDir = path.resolve(env.WA_DATA_DIR || path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "whatsapp-hd"));
  return {
    dataDir,
    authDir: path.resolve(env.WA_AUTH_DIR || path.join(dataDir, "auth_info")),
    audienceFile: path.resolve(env.WA_AUDIENCE_FILE || path.join(dataDir, "status-audience.json"))
  };
}

export async function exists(file) {
  try { await lstat(file); return true; } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function privateDirectory(directory, harden = true) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (harden && process.platform !== "win32") await chmod(directory, 0o700);
}

const migrationMarker = (dataDir) => path.join(dataDir, ".legacy-session-migrated");

export async function recordLegacyMigration({ dataDir }) {
  await privateDirectory(dataDir, false);
  try { await writeFile(migrationMarker(dataDir), new Date().toISOString() + "\n", { mode: 0o600, flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
}

async function hardenAuth(directory) {
  if (process.platform === "win32") return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await chmod(file, 0o700); await hardenAuth(file); }
    else if (entry.isFile()) await chmod(file, 0o600);
  }
}

export async function initializeStorage({ env = process.env, home = os.homedir(),
  legacyDirs = [process.cwd(), fileURLToPath(new URL("../../", import.meta.url))] } = {}) {
  const paths = resolveStoragePaths(env, home);
  const notices = [];
  await privateDirectory(paths.dataDir);
  await privateDirectory(path.dirname(paths.authDir), false);
  await privateDirectory(path.dirname(paths.audienceFile), false);

  // Copy once, exclusively, and leave the original session untouched. Overrides
  // opt out of migration, so a deliberate second account never inherits a cache.
  if (!env.WA_AUTH_DIR && !env.WA_DATA_DIR && !env.WA_AUDIENCE_FILE && !await exists(paths.authDir) && !await exists(migrationMarker(paths.dataDir))) {
    const candidates = [];
    for (const directory of new Set(legacyDirs.map((item) => path.resolve(item)))) {
      if (await exists(path.join(directory, "auth_info", "creds.json"))) candidates.push(directory);
    }
    if (candidates.length > 1) throw new Error("Multiple legacy sessions found. Set WA_AUTH_DIR and WA_AUDIENCE_FILE to the session you want to keep.");
    if (candidates.length === 1) {
      const source = candidates[0];
      await mkdir(paths.authDir, { mode: 0o700 });
      for (const entry of await readdir(path.join(source, "auth_info"))) {
        await cp(path.join(source, "auth_info", entry), path.join(paths.authDir, entry), { recursive: true, force: false, errorOnExist: true });
      }
      const oldAudience = path.join(source, "status-audience.json");
      if (await exists(oldAudience) && !await exists(paths.audienceFile)) {
        await copyFile(oldAudience, paths.audienceFile, constants.COPYFILE_EXCL);
        if (process.platform !== "win32") await chmod(paths.audienceFile, 0o600);
      }
      await recordLegacyMigration(paths);
      notices.push(`Copied the legacy session from ${source}. Original files were preserved.`);
    }
  }
  await privateDirectory(paths.authDir);
  await hardenAuth(paths.authDir);
  return { ...paths, notices };
}
