// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

// Container validation is independent of filenames and does not modify bytes.
export function detectSignature(header) {
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return { format: "JPEG", kind: "image", extension: ".jpg", extensions: [".jpg", ".jpeg"] };
  if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { format: "PNG", kind: "image", extension: ".png", extensions: [".png"] };
  if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") return { format: "WebP", kind: "image", extension: ".webp", extensions: [".webp"] };
  if (["ftyp", "free", "wide", "skip"].includes(header.toString("ascii", 4, 8))) return { format: "MP4", kind: "video", extension: ".mp4", extensions: [".mp4", ".m4v"] };
  throw new Error("Unsupported signature. Select JPEG, PNG, WebP, MP4 or M4V.");
}

export async function readAt(handle, length, position) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new Error("Incomplete media file.");
  return buffer;
}

export async function validateVideo(handle, size) {
  let position = 0, hasFtyp = false, hasMovie = false, hasData = false, m4v = false;
  while (position < size) {
    if (size - position < 8) throw new Error("Incomplete MP4 box header.");
    const header = await readAt(handle, Math.min(16, size - position), position);
    const type = header.toString("ascii", 4, 8);
    let length = header.readUInt32BE(0), headerSize = 8;
    if (length === 1) { if (header.length < 16) throw new Error("Incomplete MP4 box."); length = Number(header.readBigUInt64BE(8)); headerSize = 16; }
    if (length === 0) length = size - position;
    if (!Number.isSafeInteger(length) || length < headerSize || position + length > size) throw new Error("Invalid or incomplete MP4 box.");
    if (type === "ftyp") {
      if (length < headerSize + 8 || (length - headerSize) % 4 || length > 4096) throw new Error("Invalid MP4 ftyp box.");
      const brands = await readAt(handle, length - headerSize, position + headerSize);
      const values = [brands.toString("ascii", 0, 4)];
      for (let i = 8; i < brands.length; i += 4) values.push(brands.toString("ascii", i, i + 4));
      if (!values.some((brand) => /^(isom|iso[2-9]|mp4[12]|avc1|M4V |M4VH|M4VP)$/.test(brand)) || /^(heic|heix|mif1|avif|qt  )$/.test(values[0])) throw new Error("Unsupported ISO media brand; select an MP4/M4V video.");
      hasFtyp = true; m4v = values.some((brand) => brand.startsWith("M4V"));
    }
    if (type === "moov") {
      // Require bounded movie/track boxes; decoding is checked separately.
      let child = position + headerSize, movieHeader = false, track = false;
      while (child < position + length) {
        if (position + length - child < 8) throw new Error("Incomplete MP4 movie metadata.");
        const box = await readAt(handle, 8, child);
        const n = box.readUInt32BE(0), name = box.toString("ascii", 4, 8);
        if (n < 8 || child + n > position + length) throw new Error("Invalid MP4 movie metadata.");
        if (name === "mvhd" && n >= 28) movieHeader = true;
        if (name === "trak" && n > 8) track = true;
        child += n;
      }
      hasMovie = movieHeader && track;
    }
    if (type === "mdat" && length > headerSize) hasData = true;
    position += length;
  }
  if (!hasFtyp || !hasMovie || !hasData) throw new Error("Incomplete MP4/M4V: ftyp, movie metadata and media data are required.");
  return m4v ? "M4V" : "MP4";
}

export function validateImageContainer(bytes, format) {
  if (format === "JPEG") {
    if (bytes.lastIndexOf(Buffer.from([0xff, 0xd9])) < 4) throw new Error("Incomplete JPEG: missing end marker.");
    return;
  }
  if (format === "PNG") {
    let offset = 8, imageData = false, ended = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), name = bytes.toString("ascii", offset + 4, offset + 8);
      if (offset + size + 12 > bytes.length) throw new Error("Incomplete PNG chunk.");
      if (offset === 8 && (name !== "IHDR" || size !== 13)) throw new Error("Invalid PNG header.");
      if (name === "IDAT" && size) imageData = true;
      offset += size + 12;
      if (name === "IEND") { ended = size === 0 && offset === bytes.length; break; }
    }
    if (!imageData || !ended) throw new Error("Invalid or incomplete PNG.");
    return;
  }
  if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error("Invalid or incomplete WebP RIFF container.");
  let offset = 12, hasImage = false;
  while (offset + 8 <= bytes.length) {
    const name = bytes.toString("ascii", offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length) throw new Error("Incomplete WebP chunk.");
    if (["VP8 ", "VP8L", "ANMF"].includes(name) && length > 0) hasImage = true;
    offset += 8 + length + (length % 2);
  }
  if (!hasImage || offset !== bytes.length) throw new Error("Invalid WebP image data.");
}
