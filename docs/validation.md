# Validation — 1 November 2026

The TUI implementation is available in this working tree. The npm executable is `whatsapp-hd`; package and global-installation checks are documented below.

## Version 1.0.3 pairing and TUI validation

The phone's published 1.0.2 TUI showed the phone-number prompt as a multiline CAPTION editor, then waited without useful progress until its 180-second connection timeout. Source inspection confirmed that the socket and timeout started before phone entry, pairing used a fixed one-second delay instead of connection readiness, and messages received during input could be absent from the restored busy screen. These are reproduced lifecycle/UI defects; the original phone disconnect reason remains unknown.

Version 1.0.3 collects the number before opening a socket, starts the timeout afterwards, requests a pairing code on Baileys' ready/QR event, and retries with the entered number without another prompt. Terminal connection rejections fail immediately; timeouts retain the last disconnect reason. Signature verification remains enforced. Connection and audience synchronization have separate progress screens.

Phone and manual-recipient fields use single-line input; captions retain multiline Unicode editing. Pairing codes appear in a persistent centered panel with bold contrasting colors, including at 26 columns × 10 rows and in split-screen layouts, and disappear on connection or disconnection. The extra dashboard sentence about synced JIDs was removed; audience counts retain their existing meaning and calculation. Menu labels are **03 Connect | Reconnect** and **05 Settings | Help**.

The syntax check, all **64 tests**, CLI help and audit passed on Windows; the audit reported **0 vulnerabilities**, with dependencies unchanged. A live PC handshake using temporary in-memory credentials passed strict certificate verification and reached pairing readiness without requesting a code, linking an account or publishing Status. Full pairing and these changes still require Termux validation. The preview uses a sample code.

## Automated checks

| Environment | Results |
| --- | --- |
| Windows, Node.js 24.22.1 | Syntax check, 49 tests and CLI help passed; the dependency audit found 0 vulnerabilities, with dependencies unchanged by the appearance refresh |
| Infinix X6873, Android 16, ZeroTermux 0.118.3.64, Node.js 26.12.1 | Syntax check, 49 tests and CLI help passed after the appearance refresh; the previous dependency audit found 0 vulnerabilities, with dependencies unchanged |
| Same phone, FFmpeg 9.0.2 | Real JPEG, PNG, WebP, MP4 and M4V fixtures decoded successfully; source bytes and multiline Unicode captions preserved; wrong media types and truncated files rejected |

The Android check used `$HOME/Whatsapp-HD` with a separate `WA_DATA_DIR`, so automated tests did not require a WhatsApp account. `src/status-publisher.js` and `package-lock.json` are unchanged. The publisher regression test checks normalized sender inclusion, recipient fan-out, original source paths and caption forwarding.

Two additional storage regressions verify that restarting after successful logout cannot re-import preserved legacy credentials, including sessions migrated by an older version. The originals remain intact. Audience tests also verify that blank, boolean and malformed privacy modes cannot be interpreted as a valid ALLOW_LIST cache.

## npm package validation

The `whatsapp-hd@1.0.0` package exposes `whatsapp-hd` through its executable entry point. The package allowlist includes runtime JavaScript, README and validation notes. Jimp and its JavaScript dependency tree are bundled with the tested Zod fix; npm installs the remaining dependencies. Consumer installations do not inherit repository-level dependency overrides, and npm 12 no longer supports shrinkwrap files.

A fresh consumer installation of the tarball on Windows, Node.js 24.22.1 and npm 12.2.0, ran `whatsapp-hd --help` outside the source checkout and reported **0 vulnerabilities**. The syntax check and all **50 tests** passed; the global-command help changes also passed the CLI tests. GitHub CI builds the package and checks an independent consumer installation and its audit. The source TUI has the Android validation recorded below; a fresh global installation in Termux is a separate user check.

A fresh global installation on the same Windows machine also passed `whatsapp-hd --help` outside the checkout. An isolated source installation with npm 12.2.0 completed in 29 seconds with **0 vulnerabilities**. CI pins npm 12.2.0 and uses `npm ci`; older npm versions were observed repeatedly replacing Zod during source dependency resolution until the job timed out.

## Version 1.0.2 security validation

On Windows, Node.js 24.22.1 and npm 12.2.0, the syntax check and all **55 tests** passed. Five new security regressions reject altered signatures and signed pre-keys, prevent invalid bundles from creating or replacing a session, preserve an actual Signal encryption/decryption round trip, and verify installation of the protections before socket creation.

A fresh installation of the 1.0.2 release archive outside the checkout passed the packaged signature checks, all 16 bundled Zod declaration/resolution checks, PNG/JPEG decoding and thumbnail generation with unchanged source bytes, and CLI help. Its audit reported **0 vulnerabilities**, and `npm ls --all --omit=optional` passed without invalid dependency edges. npm 12 blocked the Baileys Node-version check and Protobuf version-warning install scripts; the compiled package still passed those runtime checks without them.

The source-only Zod override remains in the repository. The release builder stages the bundled graph with matching declarations and omits that override from the published manifest. CI uses this builder and validates the independent installation. See [security review](security-review.md) for the two reproduced verification failures and the protections.

Fresh live pairing and WhatsApp Status delivery after signature hardening have not been repeated. The earlier Android/media checks below predate that change; this validation did not access the user's Termux account or upload a Status.

## Unified Upload Media menu

The dashboard now has six actions, beginning with **Upload Media**. Images and videos share the same native picker and their type is detected from file contents. The remaining actions retain their original behavior at their new positions.

On the Infinix X6873 in ZeroTermux, Node.js 26.12.1, the updated syntax check, all **50 tests**, CLI help, and the FFmpeg integration check passed. The additional regression changes a selected PNG to MP4 through the unified upload workflow while retaining the caption, checking uploaded source bytes, rejecting an unsupported document, and cleaning temporary picker directories. The FFmpeg integration decoded JPEG, PNG, WebP, MP4, and M4V and verified caption and original-byte preservation.

Evidence: `Whatsapp-HD-upload-media-validation.log` in the parent workspace and `/sdcard/Download/Whatsapp-HD-upload-media-validation.log` on the phone. The updated dashboard rendered with one **Upload Media** action and six menu entries. Android DocumentsUI opened from that action, and a selected PNG reached Upload Confirmation. These checks use isolated application data and do not publish a live WhatsApp Status.

## Appearance refresh

The refreshed dashboard and caption screen rendered on the same phone in ZeroTermux. The terminal now has an opaque dark canvas, mint highlights, a compact account/audience panel, numbered actions and a bordered caption field. Layout follows terminal dimensions, including changes when the Android keyboard opens or closes.

The header credit is `t.me/XurXuo`. Upload result screens use **Successful** for a completed request and **Failed** with its error for a rejected request.

Short header and selection transitions run for 320 ms. Busy screens animate a spinner and an indeterminate activity bar every 80 ms; idle screens stop their animation timer. Two new tests verify that loading updates without log messages, exit stops subsequent writes, reduced motion is static, and narrow/wide layouts stay within the terminal cell width while retaining accurate audience counts. `WA_REDUCED_MOTION=1` disables animation; `NO_COLOR=1` disables colors. The publisher and dependencies are unchanged.

Reproduce the standard checks:

```sh
npm run check
npm test
npm audit
node index.js --help
```

Run the additional decoder integration check after installing FFmpeg:

```sh
node scripts/validate-media.js
```

This generates synthetic fixtures in a unique temporary directory and removes them in `finally`. It never connects to WhatsApp.

## Android picker status

The dashboard has rendered in ZeroTermux on the connected phone. `pkg install -y termux-api` completed with exit code 0 and reported that **termux-api 0.60.0 is already the newest version**. The `termux-storage-get` executable is present.

The **Termux:API Android companion (`com.termux.api`) 0.53.0 is now installed** and shares the installed ZeroTermux application's Android UID. Both the command-line package and a compatible Android companion are required.

The picker now detects an absent companion even when Android's package query returns exit code 1 with empty output. If package visibility is denied, it does not misreport that as absence. Cancellation waits for the picker process to close before removing its temporary directory. Both cases have regression coverage.

The native probe exposed a separate issue: this companion returns exit code 0 while DocumentsUI is still open, before copying the chosen file. Treating exit 0 as completion caused the TUI to remove its temporary directory and return to the dashboard prematurely. The picker now waits up to two minutes for the destination's size and modification time to remain unchanged for one second, then applies the existing signature/container/decoder validation. API errors printed on stdout are also reported even when the command exits successfully. Delayed copying, cancellation after early exit, timeout and stdout errors have regression coverage.

Native cancellation is not reported by this API version. After cancelling DocumentsUI, **Esc in the terminal** cancels the pending selection and returns to the dashboard without exiting. The screen and Help describe this action. Q/Ctrl+C still exits safely.

The following checks passed through the actual dashboard and Android DocumentsUI using the earlier separate Upload Image / Upload Video menus. The current dashboard combines these into **Upload Media** and detects image/video content automatically:

- **Upload Image:** a real PNG fixture reached Add Caption and Upload Confirmation with PNG, 231 B and 96 × 64 metadata.
- **Upload Video:** a real MP4 fixture reached Add Caption and Upload Confirmation with MP4 and 1.0 KB metadata.
- Ordinary caption input, Ctrl+J newlines and Save displayed two separate caption lines on the confirmation screen. Edit Caption and Ctrl+U were exercised; skipping the video caption displayed None.
- Selecting the PNG through Upload Video displayed the wrong-media-type error instead of opening the caption editor.
- Selecting an unsupported document through Android DocumentsUI displayed the unsupported-signature error, with a Back action.
- Cancelling DocumentsUI and pressing Esc returned to the dashboard. Exiting with Q returned to the shell.
- The cleanup probe reported `PICKER_TEMP_DIRECTORIES=[]` and `SOURCE_HASHES_UNCHANGED`. No validation Node or API-helper process remained after exit.

The native fixtures were generated separately in shared Downloads; no account connection or live upload was triggered. Small local-provider files were tested. Large, slow or stalled providers remain unverified: the quiet-period check is a heuristic because the companion supplies no copy-completion event, and such copies may time out or fail validation.

The on-device exit check exposed initially idle stdin keeping Node alive after terminal restoration. The renderer now releases input that it resumed itself, with regression coverage. After the fix, **Q** returned to the shell with `TUI_EXIT=0`, `icanon` and `echo` restored, and no validation Node process remaining.

An additional probe exercised the real image picker, ZeroTermux clipboard paste, caption editor and Confirm Upload action with a local fake client. The two-line caption included leading/trailing spaces, Japanese text, a combining accent, a sparkle and a family emoji. Assertions confirmed that the caption reached the client's upload method unchanged and the picked PNG bytes exactly matched the source. This captured one upload locally without connecting to WhatsApp. After Q, the evidence file reported `uploadsCapturedLocally: 1`, `captionMatched: true`, `sourceBytesMatched: true` and `clipboardRestored: true`; no validation Node process remained. The clipboard was restored to its previous value.

## Remaining interactive checks

1. Select large/slow provider copies through Android DocumentsUI. Empty files and truncated media already have automated coverage.
2. Pair or reconnect a chosen test account, sync an ALLOW_LIST, and compare the displayed JID count and timestamp with the received privacy record.
3. Explicitly confirm an image and video upload with selected test recipients, then verify My Status and recipient visibility. A returned Message ID does not prove publication.
4. On a disposable test session, confirm Logout and verify remote unlinking and local cleanup. Repeat a network failure and verify credentials remain.

No live publication or remote logout is claimed by the automated test results.
