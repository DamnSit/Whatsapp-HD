#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseCliOptions, usageText } from "./src/cli-options.js";
import { installSensitiveConsoleFilter, log, errorMessage } from "./src/logger.js";
import { runWhatsAppClient } from "./src/whatsapp-client.js";
import { runTui } from "./src/tui/app.js";

installSensitiveConsoleFilter();
process.umask(0o077);

async function main() {
  const argv = process.argv.slice(2);
  const options = parseCliOptions(argv);

  if (options.help) {
    console.log(usageText());
    return;
  }

  if (argv.length === 0) { await runTui(); return; }

  const terminal = readline.createInterface({ input: stdin, output: stdout });
  let client, shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    terminal.close();
    await client?.stop();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await runWhatsAppClient({ options, readline: terminal, onClient: (value) => { client = value; if (shuttingDown) void value.stop(); } });
  } catch (error) {
    terminal.close();
    throw error;
  }
}

main().catch((error) => {
  log.error(errorMessage(error));
  process.exitCode = 1;
});
