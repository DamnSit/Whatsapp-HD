import { readFile, writeFile } from "node:fs/promises";

export const STATUS_MODES = Object.freeze({
  0: "Only share with…",
  1: "My contacts except…",
  2: "My contacts",
  3: "Close Friends"
});

export function normalizeSyncedJid(value) {
  const jid = String(value ?? "").trim();
  return /^\d{5,25}@(s\.whatsapp\.net|lid)$/.test(jid) ? jid : null;
}

export function parseStatusPrivacy(value) {
  const mode = Number(value?.mode);
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
    return result?.privacy ?? null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveStatusAudience(filePath, privacy) {
  await writeFile(
    filePath,
    JSON.stringify({
      mode: privacy.mode,
      userJid: privacy.userJid,
      updatedAt: new Date().toISOString()
    }, null, 2),
    { mode: 0o600 }
  );
}

export function resolveStatusRecipients({ manualRecipients, statusPrivacy }) {
  if (manualRecipients?.length) return manualRecipients;

  if (!statusPrivacy) {
    throw new Error(
      "Audiens Status belum tersinkron. Jalankan node index.js --sync-audience, " +
      "lalu periksa kembali pengaturan privasi Status di WhatsApp."
    );
  }

  if (statusPrivacy.mode !== 0) {
    const modeName = STATUS_MODES[statusPrivacy.mode] ?? "unknown";
    throw new Error(
      `Mode privasi "${modeName}" belum didukung untuk pemilihan otomatis. ` +
      'Gunakan "Only share with…" atau tentukan penerima dengan --to.'
    );
  }

  if (statusPrivacy.userJid.length === 0) {
    throw new Error(
      'Mode "Only share with…" tersinkron, tetapi daftar penerimanya kosong. ' +
      "Periksa kontak terpilih lalu jalankan --sync-audience kembali."
    );
  }

  return statusPrivacy.userJid;
}
