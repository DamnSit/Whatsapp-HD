// SPDX-License-Identifier: GPL-3.0-only OR AGPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { PAIRING_HINT } from "../cli-options.js";

export function settingsLines(paths) {
  return ["↑ / ↓ Navigate · Enter Select · Esc Back", "Q Exit from menus · Ctrl+C Exit anywhere",
    "APPEARANCE", "Dark canvas, mint highlights, short screen/menu transitions and animated loading. WA_REDUCED_MOTION=1 disables animation; NO_COLOR=1 disables colors.",
    "CAPTIONS", "Enter saves; Ctrl+J inserts a newline; Ctrl+U clears; Esc skips. Q is text while editing.",
    "Arrow keys, Home/End, Backspace/Delete edit text. Unicode/emoji and bracketed paste are supported.",
    "PAIRING", PAIRING_HINT,
    "ANDROID PICKER", "pkg install termux-api ffmpeg",
    "Install a compatible Termux:API Android companion app as well. ZeroTermux may provide its own API integration.",
    "The picker allows all files (*/*); content is validated after selection. Provider filenames are unavailable; selection.jpg/mp4/etc is a temporary copy name.",
    "After cancelling the Android picker, press Esc in the terminal to go back. File copies have a two-minute timeout.",
    "Original media bytes are preserved. FFmpeg only validates video and makes WebP preview thumbnails.",
    "ACCOUNT & STORAGE", `Data: ${paths.dataDir}`, `Auth: ${paths.authDir}`, `Audience: ${paths.audienceFile}`,
    "Exit closes this process and keeps your session. Logout unlinks WhatsApp, then clears credentials and the audience cache after remote success.",
    "AUDIENCE", "Automatic resolution supports Only share with… (ALLOW_LIST). Cached counts remain marked until a new privacy record arrives.",
    "CLI", "whatsapp-hd --help · source checkout: node index.js --help", "--connect · --sync-audience · --upload PATH", "--caption TEXT · --to NUMBERS · --trace",
    "Verify every upload in My Status and with selected recipients. A Message ID alone does not prove publication.",
    "LICENSE & COPYRIGHT", "Copyright (C) 2026 XurXuo (DamnSit).",
    "Dual license: GPLv3 OR AGPLv3 (versions 3 only). You may choose either; no warranty.",
    "License: https://github.com/DamnSit/Whatsapp-HD/blob/main/LICENSE"];
}
