// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { jidNormalizedUser } from "@whiskeysockets/baileys";
import { formatBytes, inspectMedia, prepareStatusPayload } from "./status-media.js";
import { log } from "./logger.js";

export async function publishStatus(socket, {
  uploadPath,
  caption,
  statusRecipients
}) {
  const media = await inspectMedia(uploadPath);
  const senderJid = jidNormalizedUser(socket.user?.id);

  if (!senderJid) {
    throw new Error("JID akun pengirim tidak valid; upload dibatalkan.");
  }

  const normalizedRecipients = statusRecipients
    .map((jid) => jidNormalizedUser(jid))
    .filter(Boolean);

  const fanoutRecipients = [...new Set([senderJid, ...normalizedRecipients])];
  const { content, dimensions } = await prepareStatusPayload(media, caption);

  log.info(`File       : ${media.filename}`);
  log.info(`Ukuran     : ${formatBytes(media.size)}`);
  if (dimensions) log.info(`Resolusi   : ${dimensions}`);
  log.info(`Audiens    : ${normalizedRecipients.length} penerima + akun pengirim`);
  log.info("Kualitas   : file sumber dipertahankan; tidak ada re-encoding di CLI");
  log.info("Mengunggah Status…");

  const result = await socket.sendMessage("status@broadcast", content, {
    broadcast: true,
    statusJidList: fanoutRecipients,
    mediaUploadTimeoutMs: 180000
  });

  const messageId = result?.key?.id;
  if (messageId) {
    log.success("Permintaan upload diterima oleh Baileys.");
    log.info(`Message ID : ${messageId}`);
  } else {
    log.warn("Baileys tidak mengembalikan Message ID.");
  }
  log.info("Periksa My Status dan visibilitas pada penerima untuk memastikan publikasi.");
  return result;
}
