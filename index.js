import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { parseCliOptions, usageText } from "./src/cli-options.js";
import { log, errorMessage, installSensitiveConsoleFilter } from "./src/logger.js";
import { launchNativeStatus } from "./src/native-bridge.js";
import { runWhatsAppClient } from "./src/whatsapp-client.js";

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  if (options.help) {
    stdout.write(usageText() + "\n");
    return;
  }

  if (options.nativeStatusOnly) {
    await launchNativeStatus({
      uploadPath: options.uploadPath,
      caption: options.caption
    });
    return;
  }

  installSensitiveConsoleFilter();

  const readline = createInterface({ input: stdin, output: stdout });
  let stopClient = () => readline.close();

  process.once("SIGINT", () => {
    log.info("Menghentikan Whatsapp-HD…");
    stopClient();
    process.exit(0);
  });

  try {
    stopClient = await runWhatsAppClient({ options, readline });
  } catch (error) {
    log.error(errorMessage(error));
    readline.close();
    process.exitCode = 1;
  }
}

main().catch((error) => {
  log.error(errorMessage(error));
  process.exitCode = 1;
});
