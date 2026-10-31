// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadStatusAudience,
  parseStatusPrivacy,
  resolveStatusRecipients,
  saveStatusAudience,
  audienceIndicator,
  STATUS_MODES
} from "../src/status-audience.js";

test("parses and de-duplicates valid Status audience JIDs", () => {
  const parsed = parseStatusPrivacy({
    mode: 0,
    userJid: [
      "628123456789@s.whatsapp.net",
      "628123456789@s.whatsapp.net",
      "1234567890123@lid",
      "not-a-jid"
    ]
  });

  assert.equal(parsed.privacy.mode, 0);
  assert.equal(parsed.privacy.userJid.length, 2);
  assert.equal(parsed.invalidCount, 1);
  assert.equal(STATUS_MODES[0], "Only share with…");
});

test("ignores unknown privacy modes", () => {
  assert.equal(parseStatusPrivacy({ mode: 99, userJid: [] }), null);
  for (const mode of [false, true, " ", [], [0], {}]) {
    assert.equal(parseStatusPrivacy({ mode, userJid: ["628123456789@s.whatsapp.net"] }), null);
    assert.equal(audienceIndicator({ mode, userJid: ["628123456789@s.whatsapp.net"] }).state, "unknown");
  }
});

test("saves and reloads the local audience cache", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "whatsapp-hd-"));
  const filePath = path.join(directory, "status-audience.json");
  const privacy = {
    mode: 0,
    userJid: ["628123456789@s.whatsapp.net"]
  };

  try {
    await saveStatusAudience(filePath, privacy);
    const raw = JSON.parse(await readFile(filePath, "utf8"));
    const loaded = await loadStatusAudience(filePath);

    assert.equal(raw.mode, 0);
    assert.deepEqual(loaded.userJid, privacy.userJid);
    assert.equal(loaded.updatedAt, raw.updatedAt);
    assert.equal(loaded.invalidCount, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("audience states count only normalized unique JIDs and retain sync metadata", () => {
  const privacy = { mode: 0, userJid: ["628123456789:3@s.whatsapp.net", "628123456789@s.whatsapp.net", "bad"], updatedAt: "2026-01-01T00:00:00Z" };
  const valid = audienceIndicator(privacy, { fresh: true });
  assert.equal(valid.count, 1); assert.equal(valid.invalidCount, 1);
  assert.equal(valid.state, "valid"); assert.equal(valid.validation, "✓ VALID");
  assert.equal(valid.stale, false);
  assert.equal(audienceIndicator(privacy).stale, true);
  assert.match(audienceIndicator(privacy).warning, /Cached/);
  assert.equal(audienceIndicator({ mode: 0, userJid: [] }).state, "empty");
  const unsupported = audienceIndicator({ mode: 2, userJid: [] });
  assert.equal(unsupported.state, "unsupported"); assert.equal(unsupported.count, null);
  assert.equal(unsupported.automatic, false);
  assert.equal(audienceIndicator(null).state, "unknown");
  assert.equal(audienceIndicator({ mode: null }).state, "unknown");
  assert.equal(audienceIndicator({ ...privacy, updatedAt: "garbage" }, { fresh: true }).stale, true);
  assert.equal(audienceIndicator({ ...privacy, updatedAt: "2099-01-01" }, { fresh: true }).stale, true);
});

test("recipient resolution normalizes and deduplicates again at the upload boundary", () => {
  assert.deepEqual(resolveStatusRecipients({ statusPrivacy: { mode: 0, userJid: ["12345678:2@s.whatsapp.net", "12345678@s.whatsapp.net", "bad"] } }), ["12345678@s.whatsapp.net"]);
  assert.throws(() => resolveStatusRecipients({ statusPrivacy: { mode: 0, userJid: ["bad"] } }), /empty/);
});

test("uses explicit recipient override when provided", () => {
  const recipients = ["628123456789@s.whatsapp.net"];
  assert.deepEqual(
    resolveStatusRecipients({ manualRecipients: recipients, statusPrivacy: null }),
    recipients
  );
});

test("refuses automatic upload for unsupported audience modes", () => {
  assert.throws(
    () => resolveStatusRecipients({
      manualRecipients: [],
      statusPrivacy: { mode: 2, userJid: [] }
    }),
    /not supported/
  );
});
