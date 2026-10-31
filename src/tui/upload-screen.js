// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 XurXuo (DamnSit)

import { withPickedMedia } from "../android/file-picker.js";
import { parseManualRecipients } from "../cli-options.js";
import { audienceIndicator, resolveStatusRecipients } from "../status-audience.js";
import { formatBytes } from "../status-media.js";
import { errorMessage } from "../logger.js";

export function uploadOptions(media, draft) {
  return { uploadPath: media.file, caption: draft.caption, recipients: draft.recipients };
}

export async function uploadScreen(ui, client, { pickMedia = withPickedMedia } = {}) {
  const draft = { caption: "", recipients: [], recipientInput: "" };
  let changeMedia = true;
  while (changeMedia && !ui.closed) {
    changeMedia = false;
    await ui.busy("Choose media · Android file picker", (signal) => pickMedia(undefined, async (media) => {
      const mediaInfo = [`File: ${media.filename}`, `${media.format} · ${formatBytes(media.size)}`,
        ...(media.width ? [`${media.width} × ${media.height}`] : [])];
      draft.caption = (await ui.editCaption(draft.caption, "Add caption", mediaInfo)).value;
      while (!ui.closed) {
        const state = client.getState();
        const indicator = audienceIndicator(state.privacy, state);
        let recipients, audienceError;
        try { recipients = resolveStatusRecipients({ manualRecipients: draft.recipients, statusPrivacy: state.privacy }); }
        catch (error) { audienceError = error.message; }
        const lines = [
          `File: ${media.filename}`,
          ...(!media.originalNameAvailable ? ["Temporary copy name; provider filename unavailable."] : []),
          `Format: ${media.format} · Size: ${formatBytes(media.size)}`,
          ...(media.width ? [`Resolution: ${media.width} × ${media.height}`] : []),
          `Audience: ${recipients ? `${recipients.length} recipients + sender` : "Not ready"}`,
          `Source: ${draft.recipients.length ? "MANUAL OVERRIDE" : "Synchronized audience"}`,
          ...(draft.recipients.length ? [draft.recipientInput] : [indicator.mode, ...(indicator.warning ? ["! " + indicator.warning] : [])]),
          ...(audienceError ? [audienceError] : []),
          "Caption:", draft.caption || "None",
          "Confirm upload?"
        ];
        const action = await ui.menu("Upload confirmation", lines, ["Confirm Upload", "Edit Caption", "Clear Caption", "Skip Caption", "Manual Recipients", "Use Synced Audience", "Connect / Sync Audience", "Change Media", "Cancel"]);
        if (action === null || action === 8) return;
        if (action === 1) draft.caption = (await ui.editCaption(draft.caption, "Edit caption", mediaInfo)).value;
        if (action === 2 || action === 3) draft.caption = "";
        if (action === 4) {
          const result = await ui.editCaption(draft.recipientInput, "Manual recipients", ["International numbers separated by commas.", "This overrides the synced audience for this upload only."]);
          if (!result.skipped) {
            try { const parsed = parseManualRecipients(result.value); draft.recipients = parsed; draft.recipientInput = result.value; }
            catch (error) { await ui.message("Invalid recipient", [error.message, "Use international numbers separated by commas."]); }
          }
        }
        if (action === 5) { draft.recipients = []; draft.recipientInput = ""; }
        if (action === 6) {
          try { await ui.busy("Connect / Sync Audience", () => client.syncAudience()); }
          catch (error) { await ui.message("Synchronization failed", [error.message]); }
        }
        if (action === 7) { changeMedia = true; return; }
        if (action === 0) {
          if (!recipients) { await ui.message("Audience required", [audienceError, "Sync the audience or enter an explicit manual override."]); continue; }
          // Freeze the reviewed list. Do not silently change the confirmed audience
          // if a settings event arrives while the upload connects.
          const options = uploadOptions(media, { ...draft, recipients });
          try {
            await ui.busy("Uploading Status", () => client.upload(options));
          } catch (error) {
            await ui.message("Failed", [`Error: ${errorMessage(error)}`]);
            return;
          }
          await ui.message("Successful", ["Upload request sent."]);
          return;
        }
      }
    }, { signal: signal || ui.signal }), { cancellable: true, lines: ["Choose a file in Android, then wait for it to finish copying.", "After cancelling in Android, press Esc here to go back."] });
  }
}
