// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Jimp, ResizeStrategy } from "jimp";
import { detectSignature, validateImageContainer, validateVideo } from "./media-signatures.js";
import { probeVideoMetadata, validateVideoFrames, webpPreview } from "./media-decoder.js";

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMediaInfo(media) {
  const parts = [media.format, formatBytes(media.size)];
  if (media.width && media.height) parts.push(`${media.width}x${media.height}`);
  else if (media.kind === "video") parts.push("Resolution unavailable");
  if (media.kind === "video") parts.push(Number.isFinite(media.fps) && media.fps > 0 ? `${Number(media.fps.toFixed(2))}FPS` : "FPS unavailable");
  return parts.join(" · ");
}

export async function inspectMedia(inputPath, { expectedKind, allowNoExtension = false, signal, decodeVideo = validateVideoFrames, probeVideo = probeVideoMetadata, decodeWebp = webpPreview } = {}) {
  if (!inputPath) throw new Error("--upload membutuhkan path file.");

  const file = path.resolve(inputPath);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) {
    throw new Error("File tidak ditemukan, bukan file biasa, atau berukuran 0 byte.");
  }

  const extension = path.extname(file).toLowerCase();
  const handle = await open(file, "r");
  let detected, width, height, fps;
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    detected = detectSignature(header.subarray(0, bytesRead));
    if (!(allowNoExtension && !extension) && !detected.extensions.includes(extension)) throw new Error("Filename extension does not match actual media content.");
    if (expectedKind && detected.kind !== expectedKind) throw new Error(`Select an ${expectedKind} file for Upload ${expectedKind}.`);
    if (detected.kind === "video") {
      detected.format = await validateVideo(handle, info.size);
      if (detected.format === "M4V") detected.extension = ".m4v";
      await decodeVideo(file, { signal });
      ({ width, height, fps } = await probeVideo(file, { signal }));
    } else {
      const bytes = await readFile(file);
      validateImageContainer(bytes, detected.format);
      if (detected.format === "WebP") {
        // Jimp's installed codecs do not decode WebP. FFmpeg validates it and
        // produces only a thumbnail; the original file remains the upload source.
        await decodeWebp(file, { signal });
        const type = bytes.toString("ascii", 12, 16);
        if (type === "VP8X") { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3); }
        else if (type === "VP8L") { const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
        else if (type === "VP8 ") { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
        if (!width || !height) throw new Error("Invalid WebP dimensions.");
      } else { const decoded = await Jimp.read(bytes); width = decoded.width; height = decoded.height; }
    }
  } finally { await handle.close(); }

  return {
    file,
    filename: path.basename(file),
    extension,
    size: info.size,
    kind: detected.kind,
    format: detected.format,
    detectedExtension: detected.extension,
    width, height, fps
  };
}

export async function prepareStatusPayload(media, caption = "", { decodeWebp = webpPreview } = {}) {
  if (media.kind === "image") {
    // Preview metadata only; the original source path is uploaded unchanged.
    const image = media.format === "WebP" ? { width: media.width, height: media.height } : await Jimp.read(media.file);
    const thumbnail = media.format === "WebP" ? await decodeWebp(media.file) : await image.clone()
      .resize({ w: 32, mode: ResizeStrategy.BILINEAR })
      .getBuffer("image/jpeg", { quality: 50 });

    return {
      content: {
        image: { url: media.file },
        jpegThumbnail: thumbnail.toString("base64"),
        width: image.width,
        height: image.height,
        ...(caption ? { caption } : {})
      },
      dimensions: `${image.width}×${image.height}`
    };
  }

  return {
    content: {
      video: { url: media.file },
      mimetype: "video/mp4",
      ...(caption ? { caption } : {})
    },
    dimensions: null
  };
}
