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
    assert.deepEqual(loaded, privacy);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
    /belum didukung/
  );
});
