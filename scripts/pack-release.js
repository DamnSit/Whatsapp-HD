// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./prepare-bundle.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.resolve(process.argv[2] || process.cwd());
await mkdir(destination, { recursive: true });
const tempRoot = await realpath(os.tmpdir());
const stage = await mkdtemp(path.join(tempRoot, "Whatsapp-HD-pack-"));
try {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  // Overrides are source-install instructions. All bundle declarations have
  // already been aligned; consumers must receive the verified actual graph.
  delete manifest.overrides;
  for (const script of ["check", "test", "pack:release", "prepublishOnly"]) delete manifest.scripts[script];
  await writeFile(path.join(stage, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const file of ["index.js", "src", "README.md", "LICENSE", "LICENSE-GPL-3.0.txt", "LICENSE-AGPL-3.0.txt", "NOTICE", "docs", "scripts/prepare-bundle.js"]) {
    const target = path.join(stage, file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(root, file), target, { recursive: true });
  }
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  for (const [file, entry] of Object.entries(lock.packages)) {
    if (!entry.inBundle) continue;
    const source = path.resolve(root, file);
    const target = path.resolve(stage, file);
    if (!file.startsWith("node_modules/") || path.relative(root, source).startsWith("..") || path.relative(stage, target).startsWith("..")) {
      throw new Error("Bundled package path escapes the staging directory.");
    }
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
  // npm_execpath identifies the npm CLI already running this script. Avoid a
  // shell wrapper so this works consistently on Windows and Termux.
  if (!process.env.npm_execpath) throw new Error("Run this build with npm run pack:release.");
  const result = spawnSync(process.execPath, [process.env.npm_execpath, "pack", "--ignore-scripts", "--json", "--pack-destination", destination], { cwd: stage, encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "npm pack failed.");
  const metadata = JSON.parse(result.stdout);
  const packed = Array.isArray(metadata) ? metadata[0] : metadata[manifest.name];
  if (packed?.name !== manifest.name || packed.version !== manifest.version) throw new Error("Unexpected npm package metadata.");
  await writeFile(path.join(destination, `Whatsapp-HD-npm-pack-${manifest.version}.json`), JSON.stringify(metadata, null, 2) + "\n");
  console.log(`Created ${packed.filename}: ${packed.size} bytes, ${packed.entryCount} files.`);
} finally {
  const resolved = await realpath(stage);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("Whatsapp-HD-pack-")) {
    throw new Error("Refusing to remove a staging path outside the allocated temporary directory.");
  }
  await rm(resolved, { recursive: true, force: true });
}
