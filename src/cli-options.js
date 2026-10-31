// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

const OPTION_VALUES = new Set(["--upload", "--caption", "--to"]);
export const PAIRING_HINT = "IMPORTANT: Split-screen (Termux + WhatsApp) is recommended to keep the pairing code visible.";

export function normalizePhoneNumber(input) {
  let number = String(input ?? "").replace(/\D/g, "");
  if (number.startsWith("0")) number = "62" + number.slice(1);
  if (!/^\d{8,15}$/.test(number)) {
    throw new Error("Invalid phone number. Use international format, for example: 6281234567890.");
  }
  return number;
}

export function parseManualRecipients(input = "") {
  return String(input).split(",").map((value) => value.trim()).filter(Boolean).map((value) => {
    const digits = value.replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(digits)) throw new Error("Invalid recipient number: " + value);
    return digits + "@s.whatsapp.net";
  });
}

export function parseCliOptions(argv) {
  const options = {
    help: false,
    trace: false,
    connectOnly: false,
    syncAudienceOnly: false,
    uploadPath: undefined,
    caption: "",
    recipientInput: "",
    recipients: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--trace") options.trace = true;
    else if (argument === "--connect") options.connectOnly = true;
    else if (argument === "--sync-audience") options.syncAudienceOnly = true;
    else if (OPTION_VALUES.has(argument)) {
      const value = argv[index + 1];
      if (value === undefined || (argument !== "--caption" && !value) || value.startsWith("--")) throw new Error(`Option ${argument} requires a value.`);
      if (argument === "--upload") options.uploadPath = value;
      if (argument === "--caption") options.caption = value;
      if (argument === "--to") options.recipientInput = value;
      index += 1;
    } else {
      throw new Error("Unknown option: " + argument);
    }
  }

  options.recipients = parseManualRecipients(options.recipientInput);
  return options;
}

export function usageText() {
  return [
    "",
    "Whatsapp-HD — Interactive Termux application",
    "",
    "Commands:",
    "  whatsapp-hd                                       Interactive dashboard",
    "  whatsapp-hd --connect                             Connect your WhatsApp account",
    "  whatsapp-hd --sync-audience                       Sync Status audience",
    '  whatsapp-hd --upload "/path/status.jpg"            Upload Status via Baileys',
    '  whatsapp-hd --upload "/path/video.mp4" --caption "Text"',
    '  whatsapp-hd --upload "/path/status.jpg" --to 62812xxxxxxx',
    "",
    "Options:",
    "  --upload PATH       Image/video file to upload",
    "  --caption TEXT      Status caption",
    "  --to NUMBERS        Override recipients with comma-separated phone numbers",
    "  --sync-audience     Sync Status privacy settings, then exit",
    "  --connect           Start connection/pairing directly",
    "  --trace             Enable Baileys diagnostic logs",
    "  --help, -h          Show help",
    "",
    "From a source checkout: node index.js [options].",
    PAIRING_HINT,
    'Note: automatic audience selection currently supports "Only share with...".',
    "A Baileys Message ID does not prove that a Status was published.",
    "",
    "Copyright (C) 2026 XurXuo (DamnSit).",
    "Dual license: GPLv3 OR AGPLv3 (versions 3 only). You may choose either; no warranty.",
    "License: https://github.com/DamnSit/Whatsapp-HD/blob/main/LICENSE"
  ].join("\n");
}
