// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TerminalUI } from "../src/tui/app.js";
import { Renderer, width, wrap } from "../src/tui/renderer.js";
import { MAIN_MENU } from "../src/tui/dashboard.js";
import { uploadScreen } from "../src/tui/upload-screen.js";
import { withPickedMedia } from "../src/android/file-picker.js";
import { inspectMedia } from "../src/status-media.js";
import { imageFile, mp4, temporary } from "./helpers.js";

function terminal() {
  const input = new EventEmitter(), output = new EventEmitter();
  Object.assign(input, { isTTY: true, isRaw: false, isPaused: () => true, pause() {}, resume() {}, setRawMode(value) { this.isRaw = value; } });
  Object.assign(output, { isTTY: true, columns: 40, rows: 20, data: "", write(text) { this.data += text; } });
  return { input, output };
}

test("menu arrow navigation, Enter, Escape, resize and safe Q cleanup", async () => {
  const streams = terminal(); let stopped = 0;
  const ui = new TerminalUI({ ...streams, onExit: () => { stopped++; } });
  ui.start();
  const menu = ui.menu("Dashboard", ["Status"], ["Image", "Video", "Exit"]);
  streams.input.emit("data", "\x1b[B\r"); assert.equal(await menu, 1);
  const back = ui.menu("Back", [], ["Choose"]); ui.handle({ name: "escape" }); assert.equal(await back, null);
  ui.menu("Dashboard", ["wide ".repeat(30)], ["Exit"]);
  streams.output.columns = 25; streams.output.emit("resize");
  streams.input.emit("data", "q"); await ui.stopPromise;
  assert.equal(streams.input.isRaw, false); assert.equal(stopped, 1); assert.match(streams.output.data, /\x1b\[\?25h/);
  assert.equal(streams.input.listenerCount("data"), 0);
});

test("error restoration, Ctrl+C and minimal redraws", async () => {
  const streams = terminal(); const renderer = new Renderer(streams.input, streams.output);
  renderer.start(); renderer.draw(["same"]); const length = streams.output.data.length; renderer.draw(["same"]); assert.equal(streams.output.data.length, length); renderer.stop();
  const ui = new TerminalUI(streams); ui.start(); ui.menu("Error", [], ["Back"]);
  ui.renderer.draw = () => { throw new Error("render failed"); };
  streams.output.emit("resize"); await ui.stopPromise;
  assert.equal(ui.error.message, "render failed"); assert.equal(streams.input.isRaw, false);
  const second = new TerminalUI(terminal()); second.start(); second.handle({ name: "interrupt" }); await second.stopPromise; assert.equal(second.closed, true);
});

test("Escape cancels a pending picker without exiting and the next operation remains usable", async () => {
  const ui = new TerminalUI(terminal()); ui.start();
  try {
    const pending = ui.busy("Choose image", (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }), { cancellable: true });
    ui.handle({ name: "escape" });
    assert.equal(await pending, null);
    assert.equal(ui.closed, false);
    assert.equal(ui.signal.aborted, false);
    assert.equal(await ui.busy("Next operation", async (signal) => !signal.aborted), true);
  } finally { ui.close(); await ui.stopPromise; }
});

test("mobile wrapping preserves Unicode and fits terminal cells", () => {
  for (const line of wrap("日本語 👨‍👩‍👧‍👦 e\u0301 ".repeat(5), 12)) assert.ok(width(line) <= 12);
});

test("exit releases initially idle stdin without pausing an existing input consumer", () => {
  for (const flowing of [null, true]) {
    const { input, output } = terminal(); let paused = false;
    Object.assign(input, { readableFlowing: flowing, isPaused: () => false, pause() { paused = true; } });
    const renderer = new Renderer(input, output);
    renderer.start(); renderer.stop();
    assert.equal(paused, flowing !== true);
    assert.equal(input.isRaw, false);
  }
});

test("confirmation edits/clear survive backwards navigation and forward the final caption", async () => {
  const choices = [1, 2, 1, 0], captions = ["original", "edited", "  final ✨\nline two  "]; let sent, picked = 0;
  const ui = { closed: false, busy: async (_title, fn) => fn(), editCaption: async () => ({ value: captions.shift() }), menu: async () => choices.shift(), message: async () => {} };
  const client = { getState: () => ({ privacy: { mode: 0, userJid: ["62812345678@s.whatsapp.net"] } }), upload: async (options) => { sent = options; return { key: { id: "mock" } }; } };
  await uploadScreen(ui, client, { pickMedia: async (_kind, use) => { picked++; return use({ file: "original.png", filename: "original.png", format: "PNG", size: 123, originalNameAvailable: true }); } });
  assert.equal(picked, 1); assert.equal(sent.caption, "  final ✨\nline two  "); assert.equal(sent.uploadPath, "original.png");
});

test("Upload Media can change from image to video while preserving the caption and source bytes", async (t) => {
  const root = await temporary(t), image = await imageFile(root), video = path.join(root, "source.mp4");
  await writeFile(video, mp4());
  const files = [image, video], choices = [7, 0], formats = [];
  let selected = 0, sent, sentBytes;
  const ui = {
    closed: false,
    busy: async (_title, operation) => operation(),
    editCaption: async (caption) => ({ value: caption || "Caption ✨\nline two" }),
    menu: async (_title, lines) => { formats.push(lines.find((line) => line.startsWith("Format:"))); return choices.shift(); },
    message: async () => {}
  };
  const client = {
    getState: () => ({ privacy: { mode: 0, userJid: ["62812345678@s.whatsapp.net"] } }),
    upload: async (options) => { sent = options; sentBytes = await readFile(options.uploadPath); }
  };
  await uploadScreen(ui, client, { pickMedia: (kind, use) => withPickedMedia(kind, use, {
    temporaryRoot: root,
    pick: async (destination) => { await copyFile(files[selected++], destination); return true; },
    inspect: (file, options) => inspectMedia(file, { ...options, decodeVideo: async () => {} })
  }) });
  assert.equal(selected, 2);
  assert.match(formats[0], /PNG/); assert.match(formats[1], /MP4/);
  assert.equal(path.extname(sent.uploadPath), ".mp4");
  assert.equal(sent.caption, "Caption ✨\nline two");
  assert.deepEqual(sentBytes, await readFile(video));
  assert.deepEqual((await readdir(root)).sort(), ["source.mp4", "source.png"]);
  await assert.rejects(uploadScreen(ui, client, { pickMedia: (kind, use) => withPickedMedia(kind, use, {
    temporaryRoot: root,
    pick: async (destination) => { await writeFile(destination, "unsupported document"); return true; }
  }) }), /Unsupported signature/);
  assert.deepEqual((await readdir(root)).sort(), ["source.mp4", "source.png"]);
});

test("loading animates without log messages and exit stops every animation write", async () => {
  const streams = terminal(), ui = new TerminalUI({ ...streams, animate: true });
  let complete;
  ui.start();
  const pending = ui.busy("Upload", () => new Promise((resolve) => { complete = resolve; }));
  try {
    const initial = streams.output.data;
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.notEqual(streams.output.data, initial);
    assert.equal(ui.logs.length, 0);
    ui.close();
    const restored = streams.output.data;
    complete(); await pending; await ui.stopPromise;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(streams.output.data, restored);
    assert.equal(ui.animationTimer, undefined);
    assert.equal(streams.input.isRaw, false);
  } finally { ui.close(); complete?.(); }
});

test("reduced motion keeps loading static and small layouts never exceed terminal cells", async () => {
  const streams = terminal(), ui = new TerminalUI({ ...streams, animate: false });
  ui.start();
  let complete;
  const pending = ui.busy("Upload", () => new Promise((resolve) => { complete = resolve; }));
  try {
    const initial = streams.output.data;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(streams.output.data, initial);
    assert.equal(ui.animationTimer, undefined);
    complete(); await pending;
    const state = { connection: "Disconnected", privacy: { mode: 0, userJid: ["62812345678@s.whatsapp.net", "62812345678:1@s.whatsapp.net", "62899999999@s.whatsapp.net", "bad"] }, fresh: false };
    for (const columns of [26, 32, 40, 80, 120]) {
      streams.output.columns = columns;
      ui.menu("Dashboard", [], MAIN_MENU, 0, { dashboardState: () => state });
      for (const row of ui.renderer.previous) assert.ok(width(row) <= columns, `${columns} columns: ${width(row)}`);
      if (columns >= 40) {
        const display = ui.renderer.previous.join("\n");
        assert.match(display, /2 CONTACTS/);
        assert.match(display, /Cached/);
        assert.match(display, /1 invalid JIDs/);
      }
    }
  } finally { ui.close(); await ui.stopPromise; }
});
