// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createWhatsAppClient } from "../src/whatsapp-client.js";
import { exists, initializeStorage } from "../src/storage/paths.js";
import { temporary } from "./helpers.js";

const silent = { info() {}, error() {}, warn() {}, success() {} };
async function setup(t, customize = {}) {
  const paths = await initializeStorage({ env: { WA_DATA_DIR: await temporary(t) }, legacyDirs: [] });
  const creds = path.join(paths.authDir, "creds.json");
  await writeFile(creds, "session"); await writeFile(paths.audienceFile, JSON.stringify({ mode: 0, userJid: ["62812345678@s.whatsapp.net"] }));
  const sockets = []; let remoteCalls = 0, published;
  const client = await createWhatsAppClient({ paths, report: silent, dependencies: {
    reconnectDelay: 10, connectTimeout: 2000,
    useMultiFileAuthState: async () => ({ state: { creds: { registered: true }, keys: { set: async () => {} } }, saveCreds: async () => { await new Promise((resolve) => setTimeout(resolve, 10)); await writeFile(creds, "saved"); } }),
    makeWASocket: () => {
      const ev = new EventEmitter();
      const socket = { ev, user: { id: "62811111111:1@s.whatsapp.net" }, end: () => ev.emit("connection.update", { connection: "close" }),
        resyncAppState: async () => {},
        logout: async () => { remoteCalls++; if (customize.logout) await customize.logout(socket); },
        ...customize.socket };
      sockets.push(socket); setImmediate(() => ev.emit("connection.update", { connection: "open" })); return socket;
    },
    publishStatus: async (...args) => { published = args; return { key: { id: "mock" } }; }
  } });
  t.after(() => client.stop());
  await client.connect();
  return { client, paths, creds, sockets, calls: () => remoteCalls, published: () => published };
}

test("successful remote logout drains credential writes, clears cache and never reconnects", async (t) => {
  const h = await setup(t, { logout: async (socket) => { socket.ev.emit("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } }); } });
  h.sockets[0].ev.emit("creds.update", {});
  await h.client.logout();
  h.sockets[0].ev.emit("creds.update", {});
  h.sockets[0].ev.emit("settings.update", { setting: "statusPrivacy", value: { mode: 0, userJid: [] } });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(await exists(h.creds), false); assert.equal(await exists(h.paths.audienceFile), false);
  assert.equal(h.calls(), 1); assert.equal(h.sockets.length, 1); assert.equal(h.client.getState().privacy, null);
  await h.client.logout(); assert.equal(h.calls(), 1);
});

test("network logout failure preserves credentials and audience cache", async (t) => {
  const h = await setup(t, { logout: async () => { throw new Error("network failed"); } });
  const cache = await readFile(h.paths.audienceFile, "utf8");
  await assert.rejects(h.client.logout(), /network failed/);
  assert.equal(await readFile(h.creds, "utf8"), "session"); assert.equal(await readFile(h.paths.audienceFile, "utf8"), cache);
  await new Promise((resolve) => setTimeout(resolve, 30)); assert.equal(h.sockets.length, 1);
});

test("an explicit logged-out event confirms logout even if its operation rejects", async (t) => {
  const h = await setup(t, { logout: async (socket) => { socket.ev.emit("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } } }); throw new Error("closed"); } });
  await h.client.logout(); assert.equal(await exists(h.creds), false);
});

test("Exit never calls logout, keeps data and cancels a queued reconnect", async (t) => {
  const h = await setup(t); h.sockets[0].ev.emit("connection.update", { connection: "close" });
  await h.client.stop(); await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(h.calls(), 0); assert.equal(h.sockets.length, 1);
  assert.equal(await exists(h.creds), true); assert.equal(await exists(h.paths.audienceFile), true);
});

test("sync with no new record never refreshes the cached timestamp", async (t) => {
  const h = await setup(t); const before = h.client.getState().privacy.updatedAt;
  await h.client.syncAudience(); assert.equal(h.client.getState().fresh, false); assert.equal(h.client.getState().privacy.updatedAt, before);
  h.sockets[0].ev.emit("settings.update", { setting: "statusPrivacy", value: { mode: 0, userJid: ["62822222222@s.whatsapp.net", "bad"] } });
  assert.equal(h.client.getState().fresh, true); assert.equal(h.client.getState().privacy.invalidCount, 1);
  await h.client.stop(); assert.equal(JSON.parse(await readFile(h.paths.audienceFile, "utf8")).invalidCount, 1);
});

test("shared upload service forwards the caption unchanged to the existing publisher", async (t) => {
  const h = await setup(t); const caption = "  🌙\nمرحبا  ";
  await h.client.upload({ uploadPath: "original.jpg", caption });
  assert.deepEqual(h.published()[1], { uploadPath: "original.jpg", caption, statusRecipients: ["62812345678@s.whatsapp.net"] });
});
