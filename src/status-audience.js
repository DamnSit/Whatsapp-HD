// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { privateDirectory } from "./storage/paths.js";

export const STATUS_MODES = Object.freeze({
  0: "Only share with…",
  1: "My contacts except…",
  2: "My contacts",
  3: "Close Friends"
});

export function normalizeSyncedJid(value) {
  const jid = String(value ?? "").trim();
  const match = /^(\d{5,25})(?::\d+)?@(s\.whatsapp\.net|lid)$/.exec(jid);
  return match ? `${match[1]}@${match[2]}` : null;
}

export function parseStatusPrivacy(value) {
  if (typeof value?.mode !== "number" && !(typeof value?.mode === "string" && /^[0-3]$/.test(value.mode.trim()))) return null;
  const mode = Number(value.mode);
  if (!Number.isInteger(mode) || !Object.hasOwn(STATUS_MODES, mode)) return null;

  const rawJids = Array.isArray(value?.userJid) ? value.userJid : [];
  const normalized = rawJids.map(normalizeSyncedJid);
  const userJid = [...new Set(normalized.filter(Boolean))];

  return {
    privacy: { mode, userJid },
    invalidCount: normalized.filter((jid) => !jid).length
  };
}

export async function loadStatusAudience(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    const result = parseStatusPrivacy(parsed);
    if (!result) return null;
    return {
      ...result.privacy,
      updatedAt: validTimestamp(parsed.updatedAt),
      invalidCount: result.invalidCount + (Number.isInteger(parsed.invalidCount) && parsed.invalidCount >= 0 ? parsed.invalidCount : 0)
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveStatusAudience(filePath, privacy) {
  const parsed = parseStatusPrivacy(privacy);
  if (!parsed) throw new Error("Invalid Status privacy mode.");
  const record = { ...parsed.privacy,
    invalidCount: parsed.invalidCount + (privacy.invalidCount || 0),
    updatedAt: validTimestamp(privacy.updatedAt) || new Date().toISOString() };
  await privateDirectory(path.dirname(filePath), false);
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600, flag: "wx" });
    await rename(temporary, filePath);
    if (process.platform !== "win32") await chmod(filePath, 0o600);
  } finally { await rm(temporary, { force: true }); }
  return record;
}

function validTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function audienceIndicator(privacy, { fresh = false, warning = "", now = Date.now() } = {}) {
  const parsed = parseStatusPrivacy(privacy);
  const updatedAt = validTimestamp(privacy?.updatedAt);
  const stale = !fresh || !updatedAt || Date.parse(updatedAt) > now;
  const base = { cached: Boolean(parsed), updatedAt,
    invalidCount: (parsed?.invalidCount || 0) + (privacy?.invalidCount || 0),
    mode: parsed ? STATUS_MODES[parsed.privacy.mode] : "Unknown",
    automatic: parsed?.privacy.mode === 0, stale,
    warning: warning || (parsed && stale ? "Cached data — sync required to refresh" : "") };
  if (!parsed) return { ...base, state: "unknown", count: null, label: "UNKNOWN", validation: "! SYNC REQUIRED" };
  if (!base.automatic) return { ...base, state: "unsupported", count: null, label: "UNSUPPORTED MODE", validation: "! MANUAL RECIPIENTS REQUIRED" };
  const count = parsed.privacy.userJid.length;
  return { ...base, count, label: `${count} CONTACTS`, state: count ? "valid" : "empty",
    validation: count ? "✓ VALID" : "! EMPTY AUDIENCE" };
}

export function resolveStatusRecipients({ manualRecipients, statusPrivacy }) {
  if (manualRecipients?.length) {
    const normalized = manualRecipients.map(normalizeSyncedJid);
    if (normalized.some((jid) => !jid)) throw new Error("Invalid manual recipient JID.");
    return [...new Set(normalized)];
  }

  statusPrivacy = parseStatusPrivacy(statusPrivacy)?.privacy;

  if (!statusPrivacy) {
    throw new Error(
      "Status audience is not synchronized. Run whatsapp-hd --sync-audience, " +
      "then check your Status privacy settings in WhatsApp."
    );
  }

  if (statusPrivacy.mode !== 0) {
    const modeName = STATUS_MODES[statusPrivacy.mode] ?? "unknown";
    throw new Error(
      `Privacy mode "${modeName}" is not supported for automatic audience selection. ` +
      'Use "Only share with…" or specify recipients with --to.'
    );
  }

  if (statusPrivacy.userJid.length === 0) {
    throw new Error(
      'The "Only share with…" audience is synchronized, but its recipient list is empty. ' +
      "Check the selected contacts, then run --sync-audience again."
    );
  }

  return statusPrivacy.userJid;
}
