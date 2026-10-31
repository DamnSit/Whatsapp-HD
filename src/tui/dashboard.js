import { audienceIndicator } from "../status-audience.js";

export const MAIN_MENU = ["Upload Media", "Sync Status Audience", "Connect / Reconnect WhatsApp", "Account Management", "Settings / Help", "Exit"];

export function dashboardLines(state) {
  const audience = audienceIndicator(state.privacy, state);
  return [
    `WhatsApp           ${state.connection}`,
    `Status Audience    ${audience.label}`,
    `Audience Validation ${audience.validation}`,
    `Privacy Mode       ${audience.mode}`,
    `Automatic audience ${audience.automatic ? "Supported (ALLOW_LIST)" : "Unavailable"}`,
    `Synchronization    ${state.sync}`,
    `Last sync          ${audience.updatedAt ? new Date(audience.updatedAt).toLocaleString() : "Unknown"}`,
    `Cache              ${audience.cached ? "Available" : "Unavailable"}`,
    ...(audience.invalidCount ? [`Invalid JIDs        ${audience.invalidCount} ignored`] : []),
    ...(audience.warning ? [`! ${audience.warning}`] : []),
    "Counts are synchronized recipient JIDs, not total phone contacts."
  ];
}
