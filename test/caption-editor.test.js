// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import { CaptionEditor } from "../src/tui/caption-editor.js";
import { InputDecoder } from "../src/tui/navigation.js";
import { prepareStatusPayload } from "../src/status-media.js";

test("captions can be entered, edited, cleared, empty or skipped", async () => {
  const editor = new CaptionEditor();
  editor.handle({ name: "text", text: "Hello ✨" });
  editor.handle({ name: "left" }); editor.handle({ name: "text", text: "world " });
  assert.equal(editor.handle({ name: "enter" }).value, "Hello world ✨");
  const again = new CaptionEditor(editor.value); again.handle({ name: "clear" });
  assert.equal(again.handle({ name: "enter" }).value, "");
  assert.equal(editor.handle({ name: "escape" }).value, "");
  for (const caption of ["", undefined]) assert.equal(Object.hasOwn((await prepareStatusPayload({ kind: "video", file: "video.mp4" }, caption)).content, "caption"), false);
});

test("Unicode, combining characters, emoji and newlines survive paste and editing", () => {
  const value = "  café e\u0301 👨‍👩‍👧‍👦\n日本語 ✨  ";
  const editor = new CaptionEditor(value);
  assert.equal(editor.handle({ name: "enter" }).value, value);
  editor.handle({ name: "newline" }); assert.equal(editor.value, value + "\n");
  const family = new CaptionEditor("a👨‍👩‍👧‍👦"); family.handle({ name: "backspace" }); assert.equal(family.value, "a");
  const decoded = new CaptionEditor(); const input = new InputDecoder((key) => decoded.handle(key));
  const bytes = Buffer.from("\x1b[200~" + value + "\x1b[31mred\x1b[0m\x1b[201~");
  for (const byte of bytes) input.feed(Buffer.from([byte]));
  assert.equal(decoded.value, value + "red"); input.close();
});

test("unsupported escape commands are never stored in a caption", () => {
  const editor = new CaptionEditor(); const input = new InputDecoder((key) => editor.handle(key));
  input.feed("hello\x1b[99~world\x1b]0;title\x07"); input.close();
  assert.equal(editor.value, "helloworld");
});
