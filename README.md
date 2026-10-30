# WhatsApp HD

A small Node.js CLI intended to run locally in Termux on Android. It uses Baileys to send image/video Status updates from local files to a selected recipient list.

> **Important audience detail:** configure Status Privacy in the official WhatsApp app first (for example, "Only share with…"). Baileys additionally requires an explicit `statusJidList` to prepare encryption and device fan-out. The current Baileys API does not expose the exact contacts selected in WhatsApp's custom Status audience, so this CLI's `--to` must currently contain the same recipients. The CLI does not alter the privacy setting in WhatsApp.

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

## Upload a Status to selected contacts

Image:

```sh
node index.js --upload "/storage/emulated/0/Pictures/status.jpg" --to 62812xxxxxxx
```

Video with a caption:

```sh
node index.js --upload "/storage/emulated/0/Download/video.mp4" --to 62812xxxxxxx --caption "Hello"
```

Use comma-separated phone numbers to supply multiple JIDs to Baileys. Before uploading, set the intended audience in the official WhatsApp app (for example, **Updates → Status Privacy → Only share with…**). The `--to` option is the transport recipient list Baileys needs for device encryption/fan-out; it does not change the privacy setting in WhatsApp. For now, you need to keep the two lists aligned manually because Baileys does not expose the exact custom audience list saved by the WhatsApp app.

## Supported media

Supported extensions: JPG, JPEG, PNG, WebP, MP4, and M4V. The script does not re-encode media, but WhatsApp may still compress uploads. This is not a guarantee of original-quality delivery.

Grant shared-storage access in Termux if needed:

```sh
termux-setup-storage
```

## Diagnostics

```sh
node index.js --upload "/storage/emulated/0/Download/video.mp4" --to 62812xxxxxxx --trace
```

Trace logs can contain sensitive protocol metadata and cryptographic session details. Review and redact logs before sharing them. Check for a server ACK with `error="479"`, recipient `receipt` events, or `type="read"` receipts. A successful `sendMessage()` return and message ID alone do not confirm publication.

Do not repeatedly delete or reset `auth_info` to troubleshoot Status visibility. Session authentication and Status publication/synchronization are separate problems.

## Project status

- [x] Termux / Node.js CLI scaffold
- [x] Pairing-code flow and local multi-file auth
- [x] Local image/video path handling
- [x] Optional caption and recipient list
- [x] Explicit warning that a returned message ID is not delivery confirmation
- [ ] Read and reuse the official WhatsApp app's custom Status audience automatically (not exposed by current Baileys API)
- [ ] Verified sender-side Status UI synchronization across WhatsApp versions
- [ ] Confirmed upstream fix for Baileys Status/LID edge cases
