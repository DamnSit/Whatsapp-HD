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
    else if (argument === "--sync-audience") options.syncAudienceOnly = true;
    else if (OPTION_VALUES.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Opsi ${argument} membutuhkan nilai.`);
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
    "WhatsApp HD — Termux CLI",
    "",
    "Perintah:",
    "  node index.js                                      Hubungkan akun WhatsApp",
    "  node index.js --sync-audience                      Sinkronisasi audiens Status",
    '  node index.js --upload "/path/status.jpg"          Unggah Status via Baileys',
    '  node index.js --upload "/path/video.mp4" --caption "Teks"',
    '  node index.js --upload "/path/status.jpg" --to 62812xxxxxxx',
    "",
    "Opsi:",
    "  --upload PATH       File gambar/video yang akan diunggah",
    "  --caption TEXT      Caption Status",
    "  --to NUMBERS        Override penerima, pisahkan beberapa nomor dengan koma",
    "  --sync-audience     Sinkronkan pengaturan privasi Status lalu keluar",
    "  --trace             Aktifkan log diagnostik Baileys",
    "  --help, -h          Tampilkan bantuan",
    "",
    'Catatan: otomatisasi audiens saat ini mendukung mode "Only share with...".',
    "Pesan ID dari Baileys bukan bukti bahwa Status sudah terbit."
  ].join("\n");
}
