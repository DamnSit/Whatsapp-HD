// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await check(file);
    else if (file.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exitCode = 1;
    }
  }
}
const result = spawnSync(process.execPath, ["--check", "index.js"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = 1;
for (const directory of ["src", "test", "scripts"]) await check(directory);
