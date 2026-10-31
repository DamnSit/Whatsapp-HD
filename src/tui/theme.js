// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { fit, width, wrap } from "./renderer.js";
import { audienceIndicator } from "../status-audience.js";

const colors = {
  text: "220;230;240", muted: "133;149;169", border: "43;59;76",
  mint: "83;229;190", blue: "117;181;255", warning: "246;195;104"
};
export const tint = (renderer, text, color = "text", bold = false) =>
  renderer.style(text, `${bold ? "1;" : ""}38;2;${colors[color] || colors.text}`);
export function padded(text, columns) {
  const value = width(text) > columns ? fit(text, columns) : text;
  return value + " ".repeat(Math.max(0, columns - width(value)));
}
export function panel(renderer, title, lines, columns, color = "border") {
  const inner = columns - 4;
  const label = ` ${fit(title, Math.max(0, columns - 6))} `;
  return [
    tint(renderer, "╭─", color) + tint(renderer, label, "mint", true) + tint(renderer, "─".repeat(Math.max(0, columns - width(label) - 3)) + "╮", color),
    ...lines.map((line) => tint(renderer, "│", color) + " " + padded(line, inner) + " " + tint(renderer, "│", color)),
    tint(renderer, "╰" + "─".repeat(columns - 2) + "╯", color)
  ];
}
function metric(renderer, label, value, columns, color = "text") {
  const labelColumns = 11;
  const key = label.padEnd(labelColumns);
  return tint(renderer, key, "muted") + tint(renderer, fit(value, columns - labelColumns), color);
}
export function dashboardPanel(renderer, state, columns) {
  const audience = audienceIndicator(state.privacy, state), inner = columns - 4;
  const validation = audience.state === "valid" ? "VALID" : audience.state === "empty" ? "EMPTY" : "SYNC REQUIRED";
  const audienceText = audience.state === "unsupported" ? "MANUAL REQUIRED" : `${audience.label} · ${validation}`;
  const connectionColor = state.connection === "Connected" ? "mint" : /connect|pair/i.test(state.connection) && state.connection !== "Disconnected" ? "blue" : "muted";
  const sync = audience.cached ? state.fresh ? state.sync || "Synchronized" : "Cached · refresh required" : "No cache · sync required";
  const updated = audience.updatedAt ? new Date(audience.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";
  const lines = [
    metric(renderer, "WHATSAPP", state.connection || "Disconnected", inner, connectionColor),
    metric(renderer, "AUDIENCE", audienceText, inner, audience.state === "valid" ? "mint" : "warning"),
    metric(renderer, "PRIVACY", `${audience.mode} / ${audience.automatic ? "Auto" : "Manual"}`, inner),
    metric(renderer, "SYNC", sync, inner, state.fresh ? "mint" : "warning"),
    metric(renderer, "UPDATED", updated, inner, "muted"),
    ...(audience.invalidCount ? [metric(renderer, "IGNORED", `${audience.invalidCount} invalid JIDs`, inner, "warning")] : []),
    ...(state.warning ? wrap("! " + state.warning, inner).map((line) => tint(renderer, line, "warning")) : [])
  ];
  return panel(renderer, "STATUS OVERVIEW", lines, columns);
}
const actionHints = ["Image / video", "Refresh recipients", "Pair / reconnect", "Session & logout", "Controls & setup", "Keep session"];
export function menuRows(renderer, items, selected, columns, { dashboard = false, glow = false } = {}) {
  return items.map((item, index) => {
    const active = index === selected;
    const prefix = `${active ? "›" : " "} ${String(index + 1).padStart(2, "0")}  `;
    const hint = dashboard && columns >= 62 ? actionHints[index] || "" : "";
    const available = columns - width(prefix) - (hint ? width(hint) + 3 : 0) - 1;
    const label = prefix + fit(item, available);
    const row = padded(label, hint ? columns - width(hint) - 2 : columns) + (hint ? " " + hint + " " : "");
    return active
      ? renderer.style(row, `1;38;2;${glow ? "230;255;248" : "160;250;220"};48;2;${glow ? "23;75;62" : "17;53;45"}`)
      : tint(renderer, row, index === items.length - 1 ? "muted" : "text");
  });
}
export function detailRows(renderer, lines, columns) {
  return lines.flatMap((line) => wrap(line, columns).map((part) => {
    if (/^[A-Z][A-Z &/]+$/.test(part)) return tint(renderer, part, "mint", true);
    if (/^(?:!|Warning|Error|Unsupported)/i.test(part)) return tint(renderer, part, "warning");
    const separator = part.indexOf(":");
    return separator >= 0 && separator < 24
      ? tint(renderer, part.slice(0, separator + 1), "muted") + tint(renderer, part.slice(separator + 1))
      : tint(renderer, part);
  }));
}
