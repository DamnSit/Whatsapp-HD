// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { stripVTControlCharacters } from "node:util";
import { cleanText } from "./navigation.js";
import { graphemes } from "./caption-editor.js";

export function cellWidth(character) {
  if (/^[\p{Mark}\u200d\ufe0f]+$/u.test(character)) return 0;
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(character)) return 2;
  const cp = character.codePointAt(0);
  return cp >= 0x1100 && (cp <= 0x115f || cp >= 0x2e80 && cp <= 0xa4cf || cp >= 0xac00 && cp <= 0xd7a3 || cp >= 0xf900 && cp <= 0xfaff || cp >= 0xfe10 && cp <= 0xfe6f || cp >= 0xff00 && cp <= 0xff60 || cp >= 0x20000) ? 2 : 1;
}
export function width(text) { return graphemes(stripVTControlCharacters(text)).reduce((sum, c) => sum + cellWidth(c), 0); }
export function fit(text, columns, suffix = "…") {
  columns = Math.max(0, columns);
  const plain = cleanText(text).replace(/[\n\t]/g, " ");
  if (width(plain) <= columns) return plain;
  const ending = width(suffix) <= columns ? suffix : "";
  let result = "", cells = 0;
  for (const character of graphemes(plain)) {
    const next = cellWidth(character);
    if (cells + next > columns - width(ending)) break;
    result += character; cells += next;
  }
  return result + ending;
}
function clipStyled(text, columns) {
  let result = "", cells = 0;
  for (const token of text.match(/\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]+/g) || []) {
    if (token.startsWith("\x1b")) { result += token; continue; }
    for (const character of graphemes(token)) {
      const next = cellWidth(character);
      if (cells + next > columns) return result;
      result += character; cells += next;
    }
  }
  return result;
}
export function wrap(text, columns) {
  columns = Math.max(1, columns);
  const lines = []; let line = "", cells = 0;
  for (const c of graphemes(cleanText(text).replace(/\t/g, "    "))) {
    if (c === "\n") { lines.push(line); line = ""; cells = 0; continue; }
    const n = cellWidth(c);
    if (cells + n > columns && line) { lines.push(line); line = ""; cells = 0; }
    line += c; cells += n;
  }
  lines.push(line); return lines;
}

export class Renderer {
  constructor(input = process.stdin, output = process.stdout) {
    this.input = input; this.output = output; this.previous = []; this.started = false;
    this.color = !process.env.NO_COLOR && process.env.TERM !== "dumb";
  }
  get columns() { return Math.max(8, this.output.columns || 80); }
  get rows() { return Math.max(3, this.output.rows || 24); }
  get baseStyle() { return "38;2;220;230;240;48;2;10;16;24"; }
  style(text, code) { return this.color ? `\x1b[${code}m${text}\x1b[0m\x1b[${this.baseStyle}m` : text; }
  start() {
    if (!this.input.isTTY || !this.output.isTTY || !this.input.setRawMode) throw new Error("The dashboard needs an interactive terminal. Use --help for CLI commands.");
    this.wasRaw = this.input.isRaw;
    // Fresh stdin has readableFlowing=null but isPaused() returns false.
    // Resume it only for the TUI, then pause it so it cannot keep Node alive.
    this.wasPaused = this.input.isPaused() || this.input.readableFlowing !== true;
    this.started = true;
    try {
      this.input.setRawMode(true); this.input.resume();
      this.output.write("\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?2004h\x1b[2J\x1b[H");
    } catch (error) { this.stop(); throw error; }
  }
  invalidate() { this.previous = []; if (this.started) this.output.write("\x1b[2J"); }
  draw(lines) {
    if (!this.started) return;
    const visible = Array.from({ length: this.rows }, (_, index) => {
      const line = clipStyled(lines[index] || "", this.columns);
      const fill = " ".repeat(Math.max(0, this.columns - width(line)));
      return this.color ? `\x1b[${this.baseStyle}m${line}\x1b[0m\x1b[${this.baseStyle}m${fill}\x1b[0m` : line + fill;
    });
    let update = "";
    for (let i = 0; i < Math.max(visible.length, this.previous.length); i++) {
      const line = visible[i] || "";
      if (line !== this.previous[i]) update += `\x1b[${i + 1};1H\x1b[2K${line}`;
    }
    if (update) this.output.write(update);
    this.previous = visible;
  }
  stop() {
    if (!this.started) return;
    this.started = false;
    try { this.input.setRawMode(Boolean(this.wasRaw)); }
    finally {
      if (this.wasPaused) this.input.pause();
      this.output.write("\x1b[0m\x1b[?2004l\x1b[?7h\x1b[?25h\x1b[?1049l");
    }
  }
}
