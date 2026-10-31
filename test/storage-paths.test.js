// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { initializeStorage, resolveStoragePaths } from "../src/storage/paths.js";
import { temporary } from "./helpers.js";
import { logoutAccount } from "../src/account/logout.js";

test("stable path precedence: XDG, home, base and per-file overrides", () => {
  const home = path.resolve("home-test"), xdg = path.resolve("xdg-test"), base = path.resolve("base-test");
  assert.equal(resolveStoragePaths({}, home).dataDir, path.join(home, ".local", "share", "whatsapp-hd"));
  assert.equal(resolveStoragePaths({ XDG_DATA_HOME: xdg }, home).dataDir, path.join(xdg, "whatsapp-hd"));
  const paths = resolveStoragePaths({ XDG_DATA_HOME: xdg, WA_DATA_DIR: base, WA_AUTH_DIR: "custom-auth", WA_AUDIENCE_FILE: "custom.json" }, home);
  assert.equal(paths.dataDir, base); assert.equal(paths.authDir, path.resolve("custom-auth")); assert.equal(paths.audienceFile, path.resolve("custom.json"));
});

test("initialization copies a legacy session once without overwriting either session", async (t) => {
  const root = await temporary(t), legacy = path.join(root, "legacy"), env = { XDG_DATA_HOME: path.join(root, "xdg") };
  await mkdir(path.join(legacy, "auth_info"), { recursive: true });
  await writeFile(path.join(legacy, "auth_info", "creds.json"), "original");
  await writeFile(path.join(legacy, "status-audience.json"), "cached");
  const paths = await initializeStorage({ env, legacyDirs: [legacy] });
  assert.equal(paths.notices.length, 1);
  assert.equal(await readFile(path.join(paths.authDir, "creds.json"), "utf8"), "original");
  assert.equal(await readFile(paths.audienceFile, "utf8"), "cached");
  await writeFile(path.join(paths.authDir, "creds.json"), "new-session");
  await initializeStorage({ env, legacyDirs: [legacy] });
  assert.equal(await readFile(path.join(paths.authDir, "creds.json"), "utf8"), "new-session");
  assert.equal(await readFile(path.join(legacy, "auth_info", "creds.json"), "utf8"), "original");
});

test("a successful logout is not undone by importing preserved legacy credentials again", async (t) => {
  const root = await temporary(t), legacy = path.join(root, "legacy"), env = { XDG_DATA_HOME: path.join(root, "xdg") };
  await mkdir(path.join(legacy, "auth_info"), { recursive: true });
  await writeFile(path.join(legacy, "auth_info", "creds.json"), "original-session");
  await writeFile(path.join(legacy, "status-audience.json"), "original-cache");
  const paths = await initializeStorage({ env, legacyDirs: [legacy] });
  await logoutAccount({ paths, remoteLogout: async () => {}, quiesce: async () => {} });
  const restarted = await initializeStorage({ env, legacyDirs: [legacy] });
  assert.deepEqual(restarted.notices, []);
  await assert.rejects(readFile(path.join(restarted.authDir, "creds.json")), { code: "ENOENT" });
  await assert.rejects(readFile(restarted.audienceFile), { code: "ENOENT" });
  assert.equal(await readFile(path.join(legacy, "auth_info", "creds.json"), "utf8"), "original-session");
  assert.equal(await readFile(path.join(legacy, "status-audience.json"), "utf8"), "original-cache");
});

test("logout also prevents importing a legacy session migrated by an older version", async (t) => {
  const root = await temporary(t), legacy = path.join(root, "legacy"), env = { XDG_DATA_HOME: path.join(root, "xdg") };
  const paths = resolveStoragePaths(env);
  for (const directory of [path.join(legacy, "auth_info"), paths.authDir]) {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "creds.json"), "preserved-session");
  }
  await logoutAccount({ paths, remoteLogout: async () => {}, quiesce: async () => {} });
  const restarted = await initializeStorage({ env, legacyDirs: [legacy] });
  await assert.rejects(readFile(path.join(restarted.authDir, "creds.json")), { code: "ENOENT" });
  assert.equal(await readFile(path.join(legacy, "auth_info", "creds.json"), "utf8"), "preserved-session");
});
