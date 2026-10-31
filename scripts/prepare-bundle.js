// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(new URL("../package.json", import.meta.url));
const jimpFile = require.resolve("jimp/package.json");
const jimp = JSON.parse(await readFile(jimpFile, "utf8"));
if (jimp.version !== "1.6.1") throw new Error("Revalidate the Jimp bundle before changing its version.");

const seen = new Set();
const updates = [];
async function collect(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const packageRequire = createRequire(file);
  if (manifest.dependencies?.zod) {
    const zod = JSON.parse(await readFile(packageRequire.resolve("zod/package.json"), "utf8"));
    if (zod.version !== "4.6.7") throw new Error("The Jimp bundle must resolve the tested Zod 4.6.7.");
    manifest.dependencies.zod = "4.6.7";
    updates.push({ file, manifest });
  }
  for (const name of Object.keys(manifest.dependencies || {})) {
    if (name.startsWith("@jimp/")) await collect(packageRequire.resolve(`${name}/package.json`));
  }
}
await collect(jimpFile);
if (updates.length !== 16) throw new Error("Revalidate the Jimp bundle: expected 16 Zod dependency declarations.");
// Align the shipped manifests with the already-tested override, preserving all
// upstream license and author fields. Validate the complete set before writing.
for (const { file, manifest } of updates) await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared ${updates.length} Jimp manifests with bundled Zod 4.6.7.`);
