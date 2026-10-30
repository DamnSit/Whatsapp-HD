import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseCliOptions, usageText } from "./src/cli-options.js";
import { installSensitiveConsoleFilter, log, errorMessage } from "./src/logger.js";
import { runWhatsAppClient } from "./src/whatsapp-client.js";

installSensitiveConsoleFilter();

let stopClient;

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  if (options.help) {
    console.log(usageText());
    return;
  }

  const terminal = readline.createInterface({ input: stdin, output: stdout });

  try {
    stopClient = await runWhatsAppClient({ options, readline: terminal });
  } catch (error) {
    terminal.close();
    throw error;
  }
}

function shutdown() {
  stopClient?.();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

main().catch((error) => {
  log.error(errorMessage(error));
  process.exitCode = 1;
});
