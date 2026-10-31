// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { readFile } from "node:fs/promises";
import { Renderer, fit, width, wrap } from "./renderer.js";
import { tint, padded, panel, dashboardPanel, menuRows, detailRows } from "./theme.js";
import { InputDecoder, navigate } from "./navigation.js";
import { CaptionEditor, graphemes } from "./caption-editor.js";
import { MAIN_MENU, dashboardLines } from "./dashboard.js";
import { accountScreen } from "./account-screen.js";
import { settingsLines } from "./settings-screen.js";
import { uploadScreen } from "./upload-screen.js";
import { createWhatsAppClient } from "../whatsapp-client.js";
import { setLogSink } from "../logger.js";
import { initializeStorage } from "../storage/paths.js";

export class TerminalUI {
  constructor({ input = process.stdin, output = process.stdout, version = "", onExit = () => {},
    animate = process.env.WA_REDUCED_MOTION !== "1" && process.env.TERM !== "dumb", now = () => performance.now() } = {}) {
    this.renderer = new Renderer(input, output); this.input = input; this.output = output;
    this.version = version; this.onExit = onExit; this.closed = false; this.logs = [];
    this.animate = animate; this.now = now; this.frame = 0; this.screenStartedAt = now();
    this.controller = new AbortController(); this.signal = this.controller.signal;
    this.decoder = new InputDecoder((key) => { try { this.handle(key); } catch (error) { this.close(error); } });
    this.onData = (data) => this.decoder.feed(data);
    this.onResize = () => { try { this.renderer.invalidate(); this.render(); } catch (error) { this.close(error); } };
    this.onSignal = () => this.close();
    this.onFatal = () => this.renderer.stop();
  }
  start() {
    this.renderer.start(); this.input.on("data", this.onData); this.output.on("resize", this.onResize);
    process.on("SIGINT", this.onSignal); process.on("SIGTERM", this.onSignal);
    process.on("exit", this.onFatal); process.on("uncaughtExceptionMonitor", this.onFatal);
  }
  close(error) {
    if (this.closed) return;
    this.stopMotion();
    this.closed = true; this.error = error; this.controller.abort(); this.decoder.close();
    this.input.off("data", this.onData); this.output.off("resize", this.onResize);
    process.off("SIGINT", this.onSignal); process.off("SIGTERM", this.onSignal);
    process.off("exit", this.onFatal); process.off("uncaughtExceptionMonitor", this.onFatal);
    this.finish?.(null); this.finish = undefined;
    this.renderer.stop();
    this.stopPromise = Promise.resolve(this.onExit()).catch((failure) => { this.error ||= failure; });
  }
  notify({ level, message }) {
    this.logs.push(`${level.toUpperCase()}: ${message}`);
    this.logs = this.logs.slice(-8);
    if (this.screen?.busy) { this.screen.lines = this.logs; this.render(); }
  }
  stopMotion() { clearInterval(this.animationTimer); this.animationTimer = undefined; }
  startMotion() {
    this.stopMotion(); this.frame = 0; this.screenStartedAt = this.now();
    if (!this.animate || this.closed || !this.screen) return;
    this.animationTimer = setInterval(() => {
      try {
        if (this.closed) { this.stopMotion(); return; }
        this.frame++; this.render();
        if (!this.screen?.busy && this.now() - this.screenStartedAt >= 320) this.stopMotion();
      } catch (error) { this.close(error); }
    }, 80);
    this.animationTimer.unref();
  }
  setScreen(screen) { this.screen = screen; this.startMotion(); }
  handle(key) {
    if (key.name === "interrupt") { this.close(); return; }
    if (this.closed || !this.screen) return;
    if (this.screen.editor) {
      const result = this.screen.editor.handle(key);
      if (result?.done) { this.stopMotion(); const done = this.finish; this.finish = undefined; done?.(result); }
      else this.render();
      return;
    }
    if (key.name === "text" && key.text.toLowerCase() === "q") { this.close(); return; }
    if (this.screen.busy) {
      if (key.name === "escape") this.screen.cancel?.();
      return;
    }
    if (key.name === "escape") { this.stopMotion(); const done = this.finish; this.finish = undefined; done?.(null); return; }
    if (key.name === "enter") { this.stopMotion(); const done = this.finish; this.finish = undefined; done?.(this.screen.selected); return; }
    if (key.name === "pageup" || key.name === "pagedown") {
      this.screen.scroll = Math.max(0, this.screen.scroll + (key.name === "pageup" ? -1 : 1) * Math.max(1, this.renderer.rows - 6));
      this.screen.focus = false;
    } else {
      const selected = navigate(this.screen.selected, key.name, this.screen.items.length);
      if (selected !== this.screen.selected) this.startMotion();
      this.screen.selected = selected; this.screen.focus = true;
    }
    this.render();
  }
  render() {
    if (this.closed || !this.screen) return;
    const r = this.renderer, columns = Math.min(88, r.columns - 4), rows = r.rows;
    if (rows < 10 || columns < 22) { r.draw(wrap("Enlarge terminal. Q / Ctrl+C exit.", r.columns)); return; }
    const offset = " ".repeat(Math.floor((r.columns - columns) / 2));
    const elapsed = Math.max(0, this.now() - this.screenStartedAt);
    const progress = this.animate ? Math.min(1, elapsed / 320) : 1;
    const accent = Math.min(columns, Math.round(4 + progress * 12));
    const brand = tint(r, "WHATSAPP ", "text", true) + tint(r, "HD", "mint", true);
    const version = tint(r, this.version ? `v${this.version}` : "", "muted");
    const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][this.frame % 10];
    const badge = this.screen.busy ? tint(r, `${spinner} WORKING`, "mint") : columns >= 48 ? tint(r, "t.me/XurXuo", "muted") : "";
    const title = tint(r, fit(this.screen.title.toUpperCase(), columns - width(badge) - 1), "muted");
    const header = ["", padded(brand, columns - width(version)) + version,
      padded(title, columns - width(badge)) + badge,
      tint(r, "─".repeat(accent), "mint") + tint(r, "─".repeat(columns - accent), "border")];
    const rule = tint(r, "─".repeat(columns), "border");
    const capacity = rows - 7;
    let content, footer, secondary = "", more = false;
    if (this.screen.editor) {
      const editor = this.screen.editor;
      const chars = graphemes(editor.value);
      const before = chars.slice(0, editor.cursor).join("");
      const marked = before + "▏" + chars.slice(editor.cursor).join("");
      const details = detailRows(r, this.screen.details || [], columns).slice(0, Math.max(0, capacity - 5));
      if (details.length) details.push("");
      const fieldRows = Math.max(1, capacity - details.length - 2);
      const inner = columns - 4;
      content = wrap(marked, inner);
      const caretLine = wrap(before + "▏", inner).length - 1;
      const offset = Math.max(0, caretLine - fieldRows + 1);
      const field = editor.value ? content.slice(offset, offset + fieldRows).map((line) => tint(r, line))
        : [tint(r, "▏", "mint", true) + tint(r, fit(" Write your caption…", inner - 1), "muted")];
      while (field.length < fieldRows) field.push("");
      content = [...details, ...panel(r, "CAPTION", field, columns)];
      footer = "Enter Save · Ctrl+J Newline";
      secondary = "Ctrl+U Clear · Esc Skip";
    } else {
      const source = typeof this.screen.lines === "function" ? this.screen.lines() : this.screen.lines;
      if (this.screen.busy) {
        const trackWidth = Math.max(6, Math.min(24, columns - 8)), travel = trackWidth - 4;
        const position = this.frame % (travel * 2), start = position <= travel ? position : travel * 2 - position;
        const track = Array.from({ length: trackWidth }, (_, i) => tint(r, "━", i >= start && i < start + 4 ? "mint" : "border")).join("");
        const timer = `${Math.floor(elapsed / 1000)}s`;
        const activity = tint(r, `${spinner}  Processing`, "mint", true);
        content = panel(r, "IN PROGRESS", [padded(activity, columns - 4 - timer.length) + tint(r, timer, "muted"), "", track], columns);
        const available = Math.max(0, capacity - content.length - 1);
        if (available) content.push("", ...detailRows(r, source, columns).slice(-available));
        footer = this.screen.cancel ? "Esc Cancel · Q Exit" : "Q Exit";
        secondary = "Ctrl+C Exit";
      }
      else {
        const dashboard = Boolean(this.screen.dashboardState);
        const state = dashboard ? this.screen.dashboardState() : undefined;
        content = dashboard ? dashboardPanel(r, state, columns) : detailRows(r, source, columns);
        content.push("", tint(r, dashboard ? "PUBLISH & MANAGE" : "ACTIONS", "muted"));
        const starts = [];
        menuRows(r, this.screen.items, this.screen.selected, columns, { dashboard, glow: this.animate && elapsed < 160 }).forEach((line, i) => {
          starts.push(content.length);
          content.push(line);
        });
        if (dashboard) content.push("", ...wrap("Counts = synced JIDs, not phone contacts.", columns).map((line) => tint(r, line, "muted")));
        let scroll = this.screen.scroll;
        const focused = starts[this.screen.selected] ?? 0;
        if (this.screen.focus) {
          if (focused < scroll) scroll = focused;
          if (focused >= scroll + capacity) scroll = focused - capacity + 1;
        }
        scroll = Math.max(0, Math.min(scroll, content.length - capacity));
        this.screen.scroll = scroll;
        more = content.length > capacity;
        content = content.slice(scroll, scroll + capacity);
        footer = "↑↓ Move · Enter Select";
        secondary = "Esc Back · Q Exit" + (more ? " · PgUp/PgDn" : "");
      }
    }
    while (content.length < capacity) content.push("");
    r.draw([...header, ...content.slice(0, capacity), rule, tint(r, fit(footer, columns), "mint"), tint(r, fit(secondary, columns), "muted")].map((line) => offset + line));
  }
  menu(title, lines, items, selected = 0, { dashboardState } = {}) {
    if (this.closed) return Promise.resolve(null);
    this.setScreen({ title, lines, items, selected, scroll: 0, focus: true, dashboardState });
    return new Promise((resolve) => { this.finish = resolve; this.render(); });
  }
  message(title, lines) { return this.menu(title, lines, ["Back"]); }
  editCaption(value = "", title = "Caption", details = []) {
    if (this.closed) return Promise.resolve({ value: "", skipped: true });
    this.setScreen({ title, details, editor: new CaptionEditor(value) });
    return new Promise((resolve) => { this.finish = (result) => resolve(result || { value: "", skipped: true }); this.render(); });
  }
  async question(prompt) {
    const previous = this.screen;
    try {
      const result = await this.editCaption("", "Pair WhatsApp", [prompt]);
      if (result.skipped || this.closed) throw new Error("Pairing cancelled.");
      return result.value;
    } finally { this.setScreen(previous); this.render(); }
  }
  async busy(title, operation, { cancellable = false, lines = ["Please wait…"] } = {}) {
    if (this.closed) throw new DOMException("Application closed", "AbortError");
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    this.signal.addEventListener("abort", onAbort, { once: true });
    this.logs = []; this.setScreen({ title, busy: true, lines, ...(cancellable ? { cancel: () => controller.abort() } : {}) }); this.render();
    const busyScreen = this.screen;
    try { return await operation(controller.signal); }
    catch (error) {
      if (cancellable && controller.signal.aborted && error.name === "AbortError") return null;
      throw error;
    } finally {
      this.signal.removeEventListener("abort", onAbort);
      if (this.screen === busyScreen) this.stopMotion();
    }
  }
}

export async function runTui({ input, output, createClient = createWhatsAppClient } = {}) {
  const { version } = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  let client;
  const ui = new TerminalUI({ input, output, version, onExit: () => client?.stop() });
  try {
    ui.start();
    setLogSink((entry) => ui.notify(entry));
    const paths = await initializeStorage();
    client = await createClient({ paths, question: (prompt) => ui.question(prompt), onState: () => ui.render() });
    if (ui.closed) { await client.stop(); return; }
    if (paths.notices.length) await ui.message("Session preserved", paths.notices);
    let selection = 0;
    while (!ui.closed) {
      const choice = await ui.menu("Dashboard", () => dashboardLines(client.getState()), MAIN_MENU, selection, { dashboardState: () => client.getState() });
      if (choice === null) { if (ui.closed) break; continue; }
      selection = choice;
      try {
        if (choice === 0) await uploadScreen(ui, client);
        if (choice === 1) { await ui.busy("Sync Status Audience", () => client.syncAudience()); await ui.message("Audience synchronization", dashboardLines(client.getState())); }
        if (choice === 2) { await ui.busy("Connect WhatsApp", async () => { await client.connect(); await client.syncAudience(); }); await ui.message("Connection", dashboardLines(client.getState())); }
        if (choice === 3) await accountScreen(ui, client);
        if (choice === 4) await ui.message("Settings / Help", settingsLines(paths));
        if (choice === 5) ui.close();
      } catch (error) { if (!ui.closed) await ui.message("Unable to complete action", [error.message]); }
    }
  } finally {
    ui.close();
    await ui.stopPromise;
    setLogSink(undefined);
  }
  if (ui.error) throw ui.error;
}
