# WhatsApp HD

A small Node.js CLI intended to run locally in Termux on Android. It uses Baileys to link a WhatsApp device and attempt to publish image/video Status updates from local files.

> **Important limitation:** this project currently pins `@whiskeysockets/baileys@7.0.0-rc14`. Baileys has a reported issue where Status sends on LID-migrated accounts receive server ACK `479` even though `sendMessage()` returns a message ID. A message ID is not proof that a Status was published. See [Baileys issue #2794](https://github.com/WhiskeySockets/Baileys/issues/2794). This project logs the limitation; it does not claim to have fixed Baileys' underlying PN-to-LID recipient resolution.

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
```

## First-time pairing

```sh
node index.js
```

Enter your WhatsApp number when prompted. Then open WhatsApp on your primary phone:

**Settings → Linked devices → Link a device → Link with phone number**

Enter the pairing code printed by Termux. Wait until the CLI reports that WhatsApp is connected.

Credentials are stored in `./auth_info`. Keep this directory private. Do not commit it, upload it, or share its contents.

## Upload an image Status

Use an absolute path to a local file and include the intended recipient numbers in international format:

```sh
node index.js --upload "/storage/emulated/0/Pictures/status.jpg" --to 62812xxxxxxx
```

## Upload a video Status with caption

```sh
node index.js --upload "/storage/emulated/0/Download/video.mp4" --to 62812xxxxxxx,62813xxxxxxx --caption "Hello"
```

Supported extensions: JPG, JPEG, PNG, WebP, MP4, and M4V. The script does not re-encode media, but WhatsApp may still compress it. This is not a guarantee of original-quality delivery.

Grant shared-storage access in Termux if needed:

```sh
termux-setup-storage
```

## Diagnostics

```sh
node index.js --upload "/storage/emulated/0/Download/video.mp4" --to 62812xxxxxxx --trace
```

Trace logs can contain sensitive protocol metadata. Review and redact logs before sharing them. If the Status is absent, look for a server ACK with `error="479"`. If present, the current Baileys version may be rejecting the Status request even though a message ID was returned.

## Current status

- [x] Termux / Node.js CLI scaffold
- [x] Pairing-code flow and local multi-file auth
- [x] Local image/video path handling
- [x] Optional caption and recipient list
- [x] Explicit warning that a returned message ID is not delivery confirmation
- [ ] Confirmed working Status publishing on LID-migrated accounts
- [ ] Upstream fix or tested patch for Baileys ACK 479

Do not repeatedly delete or reset `auth_info` to troubleshoot a Status publishing issue. Session authentication and Status delivery are separate problems.
