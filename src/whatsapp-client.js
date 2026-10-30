import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import { log, errorMessage } from "./logger.js";
import {
  loadStatusAudience,
  parseStatusPrivacy,
  resolveStatusRecipients,
  saveStatusAudience,
  STATUS_MODES
} from "./status-audience.js";
import { normalizePhoneNumber } from "./cli-options.js";
import { publishStatus } from "./status-publisher.js";

const AUTH_DIR = process.env.WA_AUTH_DIR || "./auth_info";
const AUDIENCE_FILE = process.env.WA_AUDIENCE_FILE || "./status-audience.json";

export async function runWhatsAppClient({ options, readline }) {
  let stopped = false;
  let starting = false;
  let reconnectTimer;
  let uploadStarted = false;
  let socket;
  let statusPrivacy = null;
  let audienceWritePromise = Promise.resolve();

  try {
    statusPrivacy = await loadStatusAudience(AUDIENCE_FILE);
    if (statusPrivacy) {
      log.info(`Audiens tersimpan: ${STATUS_MODES[statusPrivacy.mode]} (${statusPrivacy.userJid.length} kontak)`);
    }
  } catch (error) {
    log.warn("Cache audiens tidak dapat dibaca: " + errorMessage(error));
  }

  const baileysLogger = pino({ level: options.trace ? "trace" : "silent" });

  function rememberStatusPrivacy(value) {
    const parsed = parseStatusPrivacy(value);
    if (!parsed) {
      log.warn("WhatsApp mengirim mode privasi Status yang belum dikenal; cache tidak diubah.");
      return;
    }

    statusPrivacy = parsed.privacy;
    audienceWritePromise = saveStatusAudience(AUDIENCE_FILE, statusPrivacy)
      .then(() => {
        log.success(
          `Audiens tersinkron: ${STATUS_MODES[statusPrivacy.mode]} ` +
          `(${statusPrivacy.userJid.length} kontak)`
        );
        if (parsed.invalidCount) {
          log.warn(`${parsed.invalidCount} JID tidak valid diabaikan.`);
        }
      })
      .catch((error) => {
        log.error("Gagal menyimpan cache audiens: " + errorMessage(error));
      });
  }

  async function syncStatusAudience(activeSocket) {
    if (typeof activeSocket.resyncAppState !== "function") {
      log.warn("Baileys tidak menyediakan resyncAppState; audiens tidak dapat diperbarui.");
      return;
    }

    log.info("Menyinkronkan privasi Status…");
    try {
      await activeSocket.resyncAppState(["regular_high"], false);
      await audienceWritePromise;
    } catch (error) {
      log.warn("Sinkronisasi audiens gagal: " + errorMessage(error));
    }

    if (statusPrivacy) {
      log.info(
        `Mode audiens: ${STATUS_MODES[statusPrivacy.mode]} ` +
        `(${statusPrivacy.userJid.length} kontak)`
      );
    } else {
      log.warn(
        'Data audiens belum tersedia. Ubah/simpan pengaturan "Only share with…" di WhatsApp, ' +
        "lalu jalankan --sync-audience."
      );
    }
  }

  async function handleConnected(activeSocket) {
    log.success("WhatsApp terhubung.");
    await syncStatusAudience(activeSocket);

    if (options.syncAudienceOnly) {
      log.success("Sinkronisasi audiens selesai.");
      stopped = true;
      readline.close();
      process.exit(0);
    }

    if (!options.uploadPath || uploadStarted) return;

    let recipients;
    try {
      recipients = resolveStatusRecipients({
        manualRecipients: options.recipients,
        statusPrivacy
      });
    } catch (error) {
      log.error("Upload dibatalkan: " + errorMessage(error));
      return;
    }

    uploadStarted = true;
    try {
      await publishStatus(activeSocket, {
        uploadPath: options.uploadPath,
        caption: options.caption,
        statusRecipients: recipients
      });
    } catch (error) {
      uploadStarted = false;
      log.error("Upload Status gagal: " + errorMessage(error));
    }
  }

  async function connect() {
    if (starting || stopped) return;
    starting = true;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      socket = makeWASocket({
        auth: state,
        logger: baileysLogger,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000
      });

      socket.ev.on("creds.update", saveCreds);
      socket.ev.on("settings.update", (update) => {
        if (update?.setting === "statusPrivacy") {
          rememberStatusPrivacy(update.value);
        }
      });

      socket.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "connecting") log.info("Menghubungkan ke WhatsApp…");
        if (connection === "open") await handleConnected(socket);
        if (connection !== "close") return;

        const status = lastDisconnect?.error?.output?.statusCode;
        if (status === DisconnectReason.loggedOut) {
          stopped = true;
          log.error("Sesi WhatsApp sudah logout. Hubungkan ulang melalui Linked devices.");
          readline.close();
          return;
        }

        const reason = lastDisconnect?.error?.message;
        log.warn("Koneksi terputus" + (status ? ` (kode ${status})` : "") +
          (reason ? `: ${errorMessage(reason)}` : ""));

        if (!stopped && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined;
            connect().catch((error) => log.error("Reconnect gagal: " + errorMessage(error)));
          }, 3000);
        }
      });

      if (!state.creds.registered) {
        const input = await readline.question("Nomor WhatsApp (contoh 08123456789): ");
        const number = normalizePhoneNumber(input);
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const code = await socket.requestPairingCode(number);
          log.success("Kode pairing: " + code);
          log.info("Masukkan di WhatsApp → Perangkat tertaut → Tautkan dengan nomor telepon.");
        } catch (error) {
          log.error("Gagal meminta kode pairing: " + errorMessage(error));
        }
      } else {
        log.info("Sesi tersimpan ditemukan.");
      }
    } finally {
      starting = false;
    }
  }

  await connect();

  return function stop() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    readline.close();
    try {
      socket?.end?.(new Error("CLI stopped"));
    } catch {
      // Shutdown is best-effort; no credentials or cache files are removed.
    }
  };
}
