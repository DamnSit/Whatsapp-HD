// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhoneNumber,
  parseCliOptions,
  parseManualRecipients
} from "../src/cli-options.js";

test("parses upload arguments, caption, and recipient override", () => {
  const options = parseCliOptions([
    "--upload", "/storage/emulated/0/Download/status.jpg",
    "--caption", "Malam kota",
    "--to", "08123456789,628111111111",
    "--trace"
  ]);

  assert.equal(options.uploadPath, "/storage/emulated/0/Download/status.jpg");
  assert.equal(options.caption, "Malam kota");
  assert.equal(options.trace, true);
  assert.deepEqual(options.recipients, [
    "08123456789@s.whatsapp.net",
    "628111111111@s.whatsapp.net"
  ]);
});

test("normalizes Indonesian local phone numbers", () => {
  assert.equal(normalizePhoneNumber("0812-3456-7890"), "6281234567890");
  assert.equal(normalizePhoneNumber("+62 812 3456 7890"), "6281234567890");
});

test("rejects missing option values and unknown switches", () => {
  assert.throws(() => parseCliOptions(["--upload", "--trace"]), /membutuhkan nilai/);
  assert.throws(() => parseCliOptions(["--mystery"]), /tidak dikenal/);
});

test("rejects invalid recipient numbers", () => {
  assert.throws(() => parseManualRecipients("abc"), /tidak valid/);
});

test("connect bypass flag and empty/multiline CLI captions remain supported", () => {
  assert.equal(parseCliOptions(["--connect"]).connectOnly, true);
  const caption = "  Malam ✨\n第二行 👨‍👩‍👧‍👦  ";
  assert.equal(parseCliOptions(["--caption", caption]).caption, caption);
  assert.equal(parseCliOptions(["--caption", ""]).caption, "");
});
