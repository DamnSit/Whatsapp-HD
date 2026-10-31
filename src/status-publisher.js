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
    throw new Error("Invalid sender account JID; upload cancelled.");
  }

  const normalizedRecipients = statusRecipients
    .map((jid) => jidNormalizedUser(jid))
    .filter(Boolean);

  const fanoutRecipients = [...new Set([senderJid, ...normalizedRecipients])];
  const { content, dimensions } = await prepareStatusPayload(media, caption);

  log.info(`File       : ${media.filename}`);
  log.info(`Size       : ${formatBytes(media.size)}`);
  if (dimensions) log.info(`Resolution : ${dimensions}`);
  log.info(`Audience   : ${normalizedRecipients.length} recipients + sender account`);
  log.info("Quality    : original source file preserved; no CLI re-encoding");
  log.info("Uploading Status…");

  const result = await socket.sendMessage("status@broadcast", content, {
    broadcast: true,
    statusJidList: fanoutRecipients,
    mediaUploadTimeoutMs: 180000
  });

  const messageId = result?.key?.id;
  if (messageId) {
    log.success("Upload request accepted by Baileys.");
    log.info(`Message ID : ${messageId}`);
  } else {
    log.warn("Baileys did not return a Message ID.");
  }
  log.info("Check My Status and recipient visibility to confirm publication.");
  return result;
}
