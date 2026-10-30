# WhatsApp HD

A small Node.js CLI intended to run locally in Termux on Android. It uses Baileys to send image/video Status updates from local files.

## Requirements

- Android with Termux
- Node.js 20 or newer (Node.js LTS is recommended)
- A WhatsApp account you control
- Internet access

No root access, VPS, or WebView is required.

## Install in Termux

```sh
pkg update
pkg install nodejs-lts git
git clone https://github.com/DamnSit/Whatsapp-HD.git
cd Whatsapp-HD
npm install
npm run check
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

The script does not change Status Privacy in the official app. The connected sender JID (`sock.user.id`) is also prepended to Baileys' `statusJidList` so the sender account can receive its own Status. `--to` remains available for manual recipient selection and overrides the synced audience list (the sender is still included separately).

## Native WhatsApp Status mode (recommended for sender-side visibility)

Baileys can send a Status broadcast to the selected recipients, but a successful Baileys send does not guarantee that the post is synchronized into **My Status** in the official WhatsApp app. The repository has reports of this same sender-side visibility problem.

For a native handoff, use Meta's Android **Share to WhatsApp Status** integration:

```sh
node index.js --native-status --upload "/storage/emulated/0/Download/status.jpg"
```

This mode does not connect through Baileys. It resolves the media file through Android MediaStore and opens WhatsApp's official Status editor using the `https://wa.me/status` deep link and `SHARE_TO_STATUS` intent. Review the preview and audience inside WhatsApp, then tap **Send** yourself. WhatsApp's current Status Privacy setting remains authoritative; this tool does not change it.

Grant Termux shared-storage/media access first if needed:

```sh
termux-setup-storage
```

The media must be indexed by Android MediaStore. If it is not found, open the file once in Gallery or select it from WhatsApp's own media picker. The CLI caption is not prefilled in this native mode; add it in the WhatsApp editor.

This native handoff is experimental until verified on the target Android/WhatsApp build. Keep the existing Baileys `--upload` mode available for comparison.

## Supported media

Supported extensions: JPG, JPEG, PNG, WebP, MP4, and M4V. Jimp generates image thumbnails in pure JavaScript so image uploads do not depend on a native `sharp` build. Videos may use FFmpeg for thumbnail extraction; if FFmpeg is unavailable, Baileys can still upload the media but may omit its preview thumbnail. The script does not re-encode media, and WhatsApp may still compress uploads.

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
- [x] Include the sender's own JID in Baileys Status device fan-out (does not guarantee sender UI synchronization)
- [x] Experimental Meta Share-to-WhatsApp-Status native handoff mode
- [ ] Verify native handoff and sender-side visibility on target Android/WhatsApp builds
- [ ] Support newer custom audience lists and Close Friends
- [ ] Resolve CONTACTS / DENY_LIST modes from a complete synced contact set
- [ ] Verified sender-side Status UI synchronization across WhatsApp versions
- [ ] Confirmed upstream fix for Baileys Status/LID edge cases
