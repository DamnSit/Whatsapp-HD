# WhatsApp HD

A small Node.js CLI intended to run locally in Termux on Android. It uses Baileys to send image/video Status updates from local files to a selected recipient list.

> **Important limitation:** a Status can be visible to selected contacts without appearing under "My Status" on the sender's primary WhatsApp app. This symptom has also been reported by users of other Baileys-based tools ([Evolution API issue #2528](https://github.com/evolution-foundation/evolution-api/issues/2528)); the report does not establish a confirmed fix. This project provides an experimental `--include-self` option to test whether adding the sender's own phone-number JID to the audience helps the sender's linked devices receive the Status. It is not guaranteed to synchronize the primary app's Status UI.

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

Use comma-separated phone numbers to target more than one contact. The script does not set WhatsApp's account-level Status privacy settings; make sure those settings allow the intended contacts to view your Status.

## Experimental workaround for sender visibility

When the target contact can view a Status but it does not appear under "My Status" on the sender's main phone, test with `--include-self`:

```sh
node index.js --upload "/storage/emulated/0/Download/video.mp4" --to 62812xxxxxxx --caption "Hello" --include-self
```

This adds the sender's own phone-number JID to the same audience list as the selected contacts. It does not add any other external contacts. The option is experimental: verify the result on both phones. Do not assume it worked merely because an ID was returned.

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
- [x] Experimental `--include-self` option for testing sender-device visibility
- [ ] Verified sender-side Status UI synchronization across WhatsApp versions
- [ ] Confirmed upstream fix for Baileys Status/LID edge cases
