// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

const OPTION_VALUES = new Set(["--upload", "--caption", "--to"]);

export function normalizePhoneNumber(input) {
  let number = String(input ?? "").replace(/\D/g, "");
  if (number.startsWith("0")) number = "62" + number.slice(1);
  if (!/^\d{8,15}$/.test(number)) {
    throw new Error("Nomor tidak valid. Gunakan format internasional, contoh: 62812xxxxxxx.");
  }
  return number;
}

export function parseManualRecipients(input = "") {
  return String(input).split(",").map((value) => value.trim()).filter(Boolean).map((value) => {
    const digits = value.replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(digits)) throw new Error("Nomor penerima tidak valid: " + value);
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
      if (value === undefined || (argument !== "--caption" && !value) || value.startsWith("--")) throw new Error(`Opsi ${argument} membutuhkan nilai.`);
      if (argument === "--upload") options.uploadPath = value;
      if (argument === "--caption") options.caption = value;
      if (argument === "--to") options.recipientInput = value;
      index += 1;
    } else {
      throw new Error("Opsi tidak dikenal: " + argument);
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
    "Perintah:",
    "  whatsapp-hd                                       Interactive dashboard",
    "  whatsapp-hd --connect                             Hubungkan akun WhatsApp",
    "  whatsapp-hd --sync-audience                       Sinkronisasi audiens Status",
    '  whatsapp-hd --upload "/path/status.jpg"            Unggah Status via Baileys',
    '  whatsapp-hd --upload "/path/video.mp4" --caption "Teks"',
    '  whatsapp-hd --upload "/path/status.jpg" --to 62812xxxxxxx',
    "",
    "Opsi:",
    "  --upload PATH       File gambar/video yang akan diunggah",
    "  --caption TEXT      Caption Status",
    "  --to NUMBERS        Override penerima, pisahkan beberapa nomor dengan koma",
    "  --sync-audience     Sinkronkan pengaturan privasi Status lalu keluar",
    "  --connect           Jalankan koneksi/pairing langsung tanpa TUI",
    "  --trace             Aktifkan log diagnostik Baileys",
    "  --help, -h          Tampilkan bantuan",
    "",
    "Dari source checkout: node index.js [opsi].",
    'Catatan: otomatisasi audiens saat ini mendukung mode "Only share with...".',
    "Pesan ID dari Baileys bukan bukti bahwa Status sudah terbit.",
    "",
    "Copyright (C) 2026 XurXuo (DamnSit).",
    "Dual license: GPLv3 OR AGPLv3 (versions 3 only). You may choose either; no warranty.",
    "License: https://github.com/DamnSit/Whatsapp-HD/blob/main/LICENSE"
  ].join("\n");
}
