// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

const COLORS = {
  info: "\u001b[36m",
  success: "\u001b[32m",
  warn: "\u001b[33m",
  error: "\u001b[31m",
  reset: "\u001b[0m"
};

const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb");
let sink;

export function setLogSink(value) {
  sink = value;
}

function write(level, message, stream = process.stdout) {
  if (sink) { sink({ level, message: String(message) }); return; }
  const label = level.toUpperCase().padEnd(5);
  const color = useColor ? COLORS[level] : "";
  const reset = useColor ? COLORS.reset : "";
  stream.write(`[${color}${label}${reset}] ${String(message)}\n`);
}

export const log = Object.freeze({
  info: (message) => write("info", message),
  success: (message) => write("success", message),
  warn: (message) => write("warn", message, process.stderr),
  error: (message) => write("error", message, process.stderr)
});

export function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return message.replace(/[\r\n\t]+/g, " ").trim().slice(0, 400) || "Unknown error";
}

export function installSensitiveConsoleFilter() {
  const sensitivePrefixes = [
    "Closing session:",
    "Closing stale open session",
    "Closing open session",
    "Removing old closed session:",
    "Opening session:"
  ];

  const isSensitive = (values) => values.some((value) => {
    if (typeof value === "string") {
      return sensitivePrefixes.some((prefix) => value.startsWith(prefix));
    }

    return value !== null &&
      typeof value === "object" &&
      value.constructor?.name === "SessionEntry";
  });

  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const original = console[level].bind(console);
    console[level] = (...values) => {
      if (!isSensitive(values)) original(...values);
    };
  }
}
