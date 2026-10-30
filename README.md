# WhatsApp HD

A modular Node.js CLI for Termux on Android. It uses Baileys to publish image/video Status updates from local files while preserving the source media bytes on the client.

## CLI architecture

The Termux CLI is split into small modules so upload behavior and diagnostics can be maintained independently:

- `index.js`: entry point and signal handling
- `src/cli-options.js`: argument parsing and help output
- `src/whatsapp-client.js`: Baileys connection, pairing, reconnect, and event handling
- `src/status-audience.js`: Status privacy cache and recipient resolution
- `src/status-media.js`: source-file validation and thumbnail metadata
- `src/status-publisher.js`: Status fan-out and publish request
- `src/native-bridge.js`: optional Android Sharesheet handoff
- `src/logger.js`: consistent CLI output and sensitive console-log filtering

The Baileys publishing path intentionally keeps the original image/video file as the upload source. The generated 32 px JPEG is only the `jpegThumbnail` message preview; it is not used as the uploaded image. Sender JID normalization before `statusJidList` is preserved because it was part of the successful sender-side visibility fix.

### CLI output

Normal mode uses concise Indonesian log messages with consistent levels: `INFO`, `WARN`, `ERROR`, and `SUCCESS`. Baileys' internal logger is silent by default. Add `--trace` only for troubleshooting; protocol traces can contain sensitive metadata and should not be shared without review.

## Requirements

- Android with Termux
- Node.js 20 or newer (Node.js LTS is recommended)
- A WhatsApp account you control
- Internet access

No root access, VPS, or WebView is required.

## Project structure

- `index.js` — small CLI entry point and command routing.
- `src/cli-options.js` — argument parsing and help text.
- `src/whatsapp-client.js` — Baileys connection, pairing, reconnect, and lifecycle.
- `src/status-audience.js` — Status privacy parsing, local cache, and recipient selection.
- `src/status-media.js` — media validation and payload preparation. Original image/video files are passed to Baileys without re-encoding.
- `src/status-publisher.js` — sender JID normalization and Status fan-out.
- `src/native-bridge.js` — optional Android Sharesheet handoff.
- `src/logger.js` — consistent CLI output and filtering of known sensitive Signal session dumps.
- `test/` — unit tests for CLI parsing and audience handling.

Normal logs use concise `[INFO]`, `[OK]`, `[WARN]`, and `[ERROR]` labels. `--trace` enables verbose Baileys diagnostics; trace output can contain sensitive protocol metadata and should be redacted before sharing.

## Install in Termux

```sh
pkg update
pkg install nodejs-lts git
git clone https://github.com/DamnSit/Whatsapp-HD.git
cd Whatsapp-HD
npm install
npm run check
npm test
```

If npm reports that dependency install scripts are blocked, review them before approving. Baileys and protobufjs use install scripts; only approve scripts for packages you trust.

## First-time pairing

```sh
node index.js
```

Enter your WhatsApp number when prompted. Then open WhatsApp on your primary phone:

**Settings → Linked devices → Link a device → Link with phone number**

Enter the pairing code printed by Termux. Wait until the CLI reports that WhatsApp is connected.

Credentials are stored in `./auth_info`. Keep this directory private. Do not commit it, upload it, or share its contents.

## Automatic Status audience sync

Baileys v7 exposes WhatsApp's `statusPrivacy` App State mutation through the `settings.update` event. Whatsapp-HD listens for that event and stores the decoded audience mode and JIDs locally in `status-audience.json`.

Run a sync check:

```sh
node index.js --sync-audience
```

For the automatic path, set WhatsApp Status Privacy to **Only share with…** in the official app. Then upload without `--to`:

Image:

```sh
node index.js --upload "/storage/emulated/0/Pictures/status.jpg"
```

Video with a caption:

```sh
node index.js --upload "/storage/emulated/0/Download/video.mp4" --caption "Hello"
```

The CLI refreshes the `regular_high` App State collection when it connects. If no Status privacy record is received, edit and save the selected audience in the official WhatsApp app, run `node index.js --sync-audience` again, and check the reported mode and recipient count.

**Safety limitation:** automatic recipient expansion currently supports only the classic **Only share with…** mode (`ALLOW_LIST`) when Baileys returns its `userJid` list. The current Baileys protobuf does not fully model newer custom audience lists or close-friends list structures. **My contacts**, **My contacts except…**, custom lists, and Close Friends are not guessed or expanded. In those modes the script refuses automatic upload; use `--to` only as an intentional manual override.

The script does not change Status Privacy in the official app. The sender account JID is normalized with Baileys' `jidNormalizedUser` before it is prepended to `statusJidList`. This matters because Baileys treats a device-qualified JID as one explicit device; the normalized user JID lets Baileys enumerate the account's linked devices for Status fan-out. This improves the chance that the primary phone receives the sender's own Status, but does not guarantee that every WhatsApp version will show it in **My Status**. `--to` remains available for manual recipient selection and overrides the synced audience list (the sender account is still included separately).

## Native WhatsApp Status bridge (optional manual fallback)

This route hands the media to WhatsApp's native Sharesheet/editor. In the device test for this project, the resulting Status looked more compressed than the Baileys upload. Prefer the Baileys CLI route when preserving the clearer result is the priority; use this bridge when you specifically need the native WhatsApp editor and are willing to accept its processing.

For a native handoff, install the **Whatsapp-HD Status Bridge** APK before using this command:

1. Open this repository's **Actions** tab on GitHub.
2. Open the latest successful **Build Status Bridge** workflow run.
3. Download the `whatsapp-hd-status-bridge-debug` artifact and install the APK inside it.
4. In Termux, run `termux-setup-storage` and allow the bridge to access the requested photos/videos when Android asks.

Then run:

```sh
node index.js --native-status --upload "/storage/emulated/0/Download/status.jpg"
```

The CLI launches the installed Android helper. The helper copies the selected media into its private cache, exposes it through an Android `FileProvider` URI, and uses the Android 14+ Sharesheet custom-action/proxy Activity flow for WhatsApp's **Share to Status** integration. On older Android versions it launches the same WhatsApp Status intent directly for result.

If Android does not grant access to the supplied path, the helper opens the system document picker so you can select the media manually. Review the preview and audience in WhatsApp, then tap **Send** yourself. WhatsApp's current Status Privacy setting remains authoritative; this tool does not change it or silently publish posts.

The native bridge is separate from the Node.js CLI and must be installed once. Its APK is built by GitHub Actions from `android-helper/`. The native bridge does not prefill `--caption`; add a caption in the WhatsApp editor.

This handoff still needs end-to-end testing on the target Android/WhatsApp build. A successful handoff does not by itself prove that a Status was published or visible to recipients.

## Supported media

Supported extensions for Baileys uploads: JPG, JPEG, PNG, WebP, MP4, and M4V. Jimp generates a small JPEG preview thumbnail for image metadata. The original image is still passed to Baileys using its original file path; the CLI does not resize or re-encode the upload. Videos are passed from their original file path as well. WhatsApp's server-side processing may still vary by media type and account/app version.

Grant shared-storage access in Termux if needed:

```sh
termux-setup-storage
```

## Diagnostics

```sh
node index.js --sync-audience
node index.js --upload "/storage/emulated/0/Download/video.mp4" --trace
```

Trace logs can contain sensitive protocol metadata and cryptographic session details. Review and redact logs before sharing them. A successful `sendMessage()` return and message ID alone do not confirm publication. Check the sender UI and ask a selected recipient to confirm visibility.

Do not repeatedly delete or reset `auth_info` to troubleshoot Status visibility. Session authentication and Status publication/synchronization are separate problems.

Keep both `auth_info/` and `status-audience.json` private. The latter contains the recipient JIDs synced from your WhatsApp account.

## Project status

- [x] Termux / Node.js CLI scaffold
- [x] Pairing-code flow and local multi-file auth
- [x] Local image/video path handling
- [x] Optional caption and manual recipient override
- [x] Listen for Baileys `statusPrivacy` App State updates
- [x] Persist the decoded ALLOW_LIST recipient JIDs locally
- [x] Automatic audience mode for classic "Only share with…"
- [x] Normalize the sender account JID before Baileys Status device fan-out
- [x] Verify Status appears in My Status on the tested Android device
- [x] Kotlin Android Status Bridge companion app and FileProvider handoff
- [x] Android 14+ Sharesheet custom action and foreground proxy Activity flow
- [x] System document-picker fallback when direct media-path access is unavailable
- [ ] Build and verify native handoff and sender-side visibility on target Android/WhatsApp builds
- [ ] Support newer custom audience lists and Close Friends
- [ ] Resolve CONTACTS / DENY_LIST modes from a complete synced contact set
- [ ] Verify sender-side Status UI synchronization across additional WhatsApp/Android versions
- [ ] Confirmed upstream fix for Baileys Status/LID edge cases
