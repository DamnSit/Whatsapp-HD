// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { recordLegacyMigration } from "../storage/paths.js";

export async function validateLogoutPaths({ authDir, audienceFile, dataDir }) {
  const auth = path.resolve(authDir);
  const audience = path.resolve(audienceFile);
  const forbidden = [path.parse(auth).root, os.homedir(), process.cwd(), dataDir].filter(Boolean).map((value) => path.resolve(value));
  if (forbidden.includes(auth) || auth === audience || audience.startsWith(auth + path.sep)) {
    throw new Error("Unsafe authentication/cache path. Use a dedicated auth_info directory and a separate audience file.");
  }
  for (const [target, directory] of [[auth, true], [audience, false]]) {
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw new Error("Refusing logout cleanup of a linked or unexpected path: " + target);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

export async function removeLoggedOutData(paths) {
  await validateLogoutPaths(paths);
  // Preserved legacy credentials must not be imported again after unlinking.
  // Also covers sessions migrated before the marker was introduced.
  await recordLegacyMigration(paths);
  await rm(paths.authDir, { recursive: true, force: true });
  await rm(paths.audienceFile, { force: true });
}

// Detach producers and drain writes before removal, including logout events.
export async function logoutAccount({ remoteLogout, quiesce, paths, remove = removeLoggedOutData }) {
  await validateLogoutPaths(paths);
  await remoteLogout();
  await quiesce();
  await remove(paths);
}
