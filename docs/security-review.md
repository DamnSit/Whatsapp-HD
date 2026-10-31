# Security review — 31 October 2026

Version 1.0.2 rejects invalid cryptographic signatures in Baileys pairing/Noise verification and outgoing Signal session creation. The existing Baileys Status engine remains in use.

The offline review reproduced two problems with Baileys 7.0.0-rc14 and libsignal 6.0.0:

- libsignal returns `false` for an incorrect signature. Baileys' `Curve.verify` ignores that return value and returns `true` unless an exception is thrown. Pairing and Noise certificate checks use that shared wrapper.
- libsignal's outgoing session builder passes `isInit: true`, which bypasses signed pre-key verification. An altered signature was accepted and a session created in the reproduction.

The application installs a verifier that requires the underlying check to return `true`, and supplies a Signal repository that verifies signed pre-keys before delegating session creation. The underlying verifier is called without the bypass flag. Key storage, identity-change handling, PN/LID mapping, group encryption and the existing publisher remain delegated to Baileys.

Tests reject altered signatures, messages and identity keys; malformed signatures; and invalid signed pre-key bundles. A rejected bundle cannot create or replace a session. Valid signed pre-keys still allow an actual Signal encryption/decryption round trip. A client test checks that both protections are installed before socket creation. An independent installation of the packed artifact checks the shared verifier and the media workflow.

All 55 source tests and the syntax check passed on Windows with Node.js 24.22.1 and npm 12.2.0. The independent archive installation passed signature verification, PNG/JPEG thumbnail generation and original-byte preservation, all 16 Zod declaration/resolution checks, CLI help, and npm ls without invalid dependency edges. Its audit reported 0 vulnerabilities. These results do not replace a fresh live pairing/Status check.

This review does not establish an end-to-end interception exploit, verify every certificate-chain property, or audit the entire dependency tree. Baileys still automatically accepts peer identity-key changes; this change does not introduce manual safety-number verification or claim peer identities have been independently verified. Fresh live pairing and Status delivery after signature hardening remain device checks.

## Zod and Socket

The Socket web page for version 1.0.1 reports `CVE-2023-54404` / `GHSA-mrhx-c7xc-m3w5` on `zod@3.25.76`. A fresh npm installation instead resolves all 16 relevant Jimp packages to the bundled Zod 4.6.7. The GitHub advisory lists `<4.6.6` as affected and 4.6.6 as the first patched version.

The official [CVE record](https://www.cve.org/CVERecord?id=CVE-2023-54404) has been **REJECTED** since 28 October 2026. Its CNA states that the reported memory growth is proportional to input already allocated by JSON.parse and reflects expected validation behavior. The [GitHub advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) still shows High severity without a withdrawal timestamp in the snapshot checked on 31 October; those sources are not yet synchronized.

Version 1.0.2 pins Jimp 1.6.1 and Zod 4.6.7. Before packing, it validates all 16 Jimp Zod resolutions and aligns their shipped dependency declarations with 4.6.7. This fixes the `npm ls` mismatch without modifying the third-party JavaScript. CI checks an independent package installation with `npm audit`, `npm ls`, signature checks and PNG/JPEG decoding with unchanged original source bytes. This does not promise that Socket will remove every behavioral, maintenance or license alert.

The release builder stages only runtime files and dependencies marked as bundled in the source lockfile. It removes source-only `overrides` from the staged package manifest before calling npm pack, because npm rejects bundled packages that still declare those overrides. The source manifest and lockfile remain intact.

The project remains licensed under **GPL-3.0-only OR AGPL-3.0-only**; recipients may choose either. Detection of both license texts as AND by a scanner does not change that declaration.
