import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatBytes, inspectMedia } from "./status-media.js";
import { log } from "./logger.js";

const execFileAsync = promisify(execFile);

export async function launchNativeStatus({ uploadPath, caption = "" }) {
  const media = await inspectMedia(uploadPath, { native: true });
  const bridgeUri = "whatsapp-hd://status?" +
    new URLSearchParams({ media_path: media.file }).toString();

  try {
    await execFileAsync("termux-open", [bridgeUri], { timeout: 30000 });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("termux-open tidak tersedia. Jalankan: pkg install termux-tools");
    }
    throw error;
  }

  log.success("Android Status Bridge dibuka.");
  log.info(`File   : ${media.filename}`);
  log.info(`Ukuran : ${formatBytes(media.size)}`);
  log.info("Tinjau preview dan audiens di WhatsApp, lalu tekan Send.");
  if (caption) log.warn("Caption tidak otomatis diisi oleh Android Bridge.");
}
