# Validation — 31 October 2026

The TUI implementation is available in this working tree. Global npm installation remains a separate phase.

## Automated checks

| Environment | Results |
| --- | --- |
| Windows, Node.js 24.22.1 | Syntax check, 49 tests and CLI help passed; the dependency audit found 0 vulnerabilities, with dependencies unchanged by the appearance refresh |
| Infinix X6873, Android 16, ZeroTermux 0.118.3.64, Node.js 26.12.1 | Syntax check, 49 tests and CLI help passed after the appearance refresh; the previous dependency audit found 0 vulnerabilities, with dependencies unchanged |
| Same phone, FFmpeg 9.0.2 | Real JPEG, PNG, WebP, MP4 and M4V fixtures decoded successfully; source bytes and multiline Unicode captions preserved; wrong media types and truncated files rejected |

The Android check used `$HOME/Whatsapp-HD` with a separate `WA_DATA_DIR`, so automated tests did not require a WhatsApp account. `src/status-publisher.js` and `package-lock.json` are unchanged. The publisher regression test checks normalized sender inclusion, recipient fan-out, original source paths and caption forwarding.

Two additional storage regressions verify that restarting after successful logout cannot re-import preserved legacy credentials, including sessions migrated by an older version. The originals remain intact. Audience tests also verify that blank, boolean and malformed privacy modes cannot be interpreted as a valid ALLOW_LIST cache.

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
