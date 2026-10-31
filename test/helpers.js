// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Jimp } from "jimp";

export async function temporary(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "whatsapp-hd-test-"));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
export async function imageFile(dir, extension = "png") {
  const file = path.join(dir, "source." + extension);
  const image = new Jimp({ width: 48, height: 32, color: 0x6699ffff });
  await writeFile(file, await image.getBuffer(extension === "png" ? "image/png" : "image/jpeg"));
  return file;
}
export const webp = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
export function box(type, data) {
  const header = Buffer.alloc(8); header.writeUInt32BE(data.length + 8); header.write(type, 4); return Buffer.concat([header, data]);
}
export function mp4(brand = "isom") {
  return Buffer.concat([box("ftyp", Buffer.concat([Buffer.from(brand), Buffer.alloc(4), Buffer.from("mp42")])), box("moov", Buffer.concat([box("mvhd", Buffer.alloc(24)), box("trak", box("mdia", Buffer.alloc(4)))])), box("mdat", Buffer.alloc(8, 1))]);
}
