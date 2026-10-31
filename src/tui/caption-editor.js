// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { cleanText } from "./navigation.js";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const graphemes = (text) => Array.from(segmenter.segment(text), (entry) => entry.segment);

export class CaptionEditor {
  constructor(value = "") { this.value = cleanText(value); this.cursor = graphemes(this.value).length; }
  handle(key) {
    const chars = graphemes(this.value);
    if (key.name === "enter") return { done: true, value: this.value };
    if (key.name === "escape") return { done: true, value: "", skipped: true };
    if (key.name === "clear") { this.value = ""; this.cursor = 0; return; }
    if (key.name === "left") this.cursor = Math.max(0, this.cursor - 1);
    if (key.name === "right") this.cursor = Math.min(chars.length, this.cursor + 1);
    if (key.name === "home") { while (this.cursor > 0 && chars[this.cursor - 1] !== "\n") this.cursor--; }
    if (key.name === "end") { while (this.cursor < chars.length && chars[this.cursor] !== "\n") this.cursor++; }
    if (key.name === "up" || key.name === "down") {
      let start = this.cursor;
      while (start > 0 && chars[start - 1] !== "\n") start--;
      const column = this.cursor - start;
      if (key.name === "up" && start > 0) {
        const end = start - 1; let previous = end;
        while (previous > 0 && chars[previous - 1] !== "\n") previous--;
        this.cursor = Math.min(previous + column, end);
      } else if (key.name === "down") {
        let end = this.cursor; while (end < chars.length && chars[end] !== "\n") end++;
        if (end < chars.length) { const next = end + 1; end = next; while (end < chars.length && chars[end] !== "\n") end++; this.cursor = Math.min(next + column, end); }
      }
    }
    if (key.name === "backspace" && this.cursor > 0) chars.splice(--this.cursor, 1);
    if (key.name === "delete") chars.splice(this.cursor, 1);
    if (["text", "newline", "tab"].includes(key.name)) {
      const text = cleanText(key.name === "newline" ? "\n" : key.name === "tab" ? "\t" : key.text);
      const before = chars.slice(0, this.cursor).join("") + text;
      this.value = before + chars.slice(this.cursor).join("");
      this.cursor = graphemes(before).length;
    } else this.value = chars.join("");
  }
}
