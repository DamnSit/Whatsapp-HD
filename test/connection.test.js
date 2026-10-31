// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createWhatsAppClient } from "../src/whatsapp-client.js";
import { initializeStorage } from "../src/storage/paths.js";
import { temporary } from "./helpers.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function setup(t, { question = async () => "081234567890", registered = false } = {}) {
  const paths = await initializeStorage({ env: { WA_DATA_DIR: await temporary(t) }, legacyDirs: [] });
  const events = new EventEmitter(), sockets = [], reports = [];
  const silent = Object.fromEntries(["info", "warn", "error", "success"].map((level) => [level, (message) => reports.push({ level, message })]));
  const client = await createWhatsAppClient({ paths, question, report: silent, dependencies: {
    connectTimeout: 100, reconnectDelay: 10,
    useMultiFileAuthState: async () => ({ state: { creds: { registered }, keys: { set: async () => {} } }, saveCreds: async () => {} }),
    makeWASocket: () => {
      const socket = { ev: new EventEmitter(), requested: [], ended: false,
        requestPairingCode: async (number) => { socket.requested.push(number); return "ABCD1234"; },
        end: () => { socket.ended = true; } };
      sockets.push(socket); events.emit("socket", socket); return socket;
    }
  } });
  t.after(() => client.stop());
  return { client, events, sockets, paths, reports };
}

test("phone entry uses no socket or timeout; pairing waits for the ready event", async (t) => {
  const answer = deferred(), asked = deferred();
  const h = await setup(t, { question: () => { asked.resolve(); return answer.promise; } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = h.client.connect();
  let settled = false; pending.then(() => { settled = true; }, () => { settled = true; });
  await asked.promise;
  t.mock.timers.tick(1000); await Promise.resolve();
  assert.equal(settled, false); assert.equal(h.sockets.length, 0);
  const created = once(h.events, "socket"); answer.resolve("081234567890");
  const [socket] = await created;
  assert.deepEqual(socket.requested, []);
  socket.ev.emit("connection.update", { qr: "handshake-ready" });
  await Promise.resolve();
  assert.deepEqual(socket.requested, ["6281234567890"]);
  assert.equal(h.client.getState().pairingCode, "ABCD1234");
  socket.ev.emit("connection.update", { qr: "refreshed" });
  assert.equal(socket.requested.length, 1);
  socket.ev.emit("connection.update", { connection: "open" });
  await pending; assert.equal(h.client.getState().pairingCode, null);
});

test("a closed pairing socket retries without another phone prompt or a stale code", async (t) => {
  let questions = 0;
  const h = await setup(t, { question: async () => { questions++; return "081234567890"; } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = once(h.events, "socket"), pending = h.client.connect();
  const [socket] = await first;
  socket.ev.emit("connection.update", { qr: "ready" }); await Promise.resolve();
  assert.equal(h.client.getState().pairingCode, "ABCD1234");
  await Promise.resolve();
  socket.ev.emit("connection.update", { connection: "close", lastDisconnect: { error: new Error("network interrupted") } });
  assert.equal(h.client.getState().pairingCode, null);
  const next = once(h.events, "socket"); t.mock.timers.tick(10);
  const [retry] = await next;
  retry.ev.emit("connection.update", { qr: "ready" }); await Promise.resolve();
  assert.deepEqual(retry.requested, ["6281234567890"]); assert.equal(questions, 1);
  retry.ev.emit("connection.update", { connection: "open" }); await pending;
});

test("certificate rejection fails immediately and preserves existing auth files", async (t) => {
  const h = await setup(t, { registered: true });
  const creds = path.join(h.paths.authDir, "creds.json"); await writeFile(creds, "saved session");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const created = once(h.events, "socket"), pending = h.client.connect();
  const rejected = assert.rejects(pending, /noise certificate signature invalid/);
  const [socket] = await created;
  socket.ev.emit("connection.update", { connection: "close", lastDisconnect: { error: Object.assign(new Error("noise certificate signature invalid"), { output: { statusCode: 400 } }) } });
  await rejected; t.mock.timers.tick(1000); await Promise.resolve();
  assert.equal(h.sockets.length, 1); assert.equal(await readFile(creds, "utf8"), "saved session");
});

test("connection timeout retains the actual disconnect reason", async (t) => {
  const h = await setup(t, { registered: true });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const created = once(h.events, "socket"), pending = h.client.connect();
  const rejected = assert.rejects(pending, /Last connection error: network interrupted/);
  const [socket] = await created;
  socket.ev.emit("connection.update", { connection: "close", lastDisconnect: { error: new Error("network interrupted") } });
  t.mock.timers.tick(100); await rejected;
});

test("exiting during phone input never starts a connection", async (t) => {
  const answer = deferred(), asked = deferred();
  const h = await setup(t, { question: () => { asked.resolve(); return answer.promise; } });
  const pending = h.client.connect(), rejected = assert.rejects(pending, /Connection closed/);
  await asked.promise; await h.client.stop(); await rejected;
  answer.resolve("081234567890"); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.sockets.length, 0);
});
