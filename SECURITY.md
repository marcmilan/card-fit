# card-fit — Security & Trust Model

This document explains precisely what card-fit protects, how, and where the trust boundaries are. It is intended for technical users who want to verify the zero-knowledge claim rather than take it on faith.

---

## Core principle

The server cannot read your financial data. This is structural — not a policy statement — and it is verifiable because this codebase is open source.

---

## What stays on your device

Everything except the pre-composed SMS text at send time:

- All card data (provider, last four, credit limit, color)
- All statement data (balance, minimum due, due date)
- All payment history
- Your pay cycle schedule
- Your income events
- Your passphrase (never transmitted, never stored anywhere)
- Your encryption key (lives in memory only while the app is unlocked)

---

## Encryption

**Key derivation:** Your passphrase is run through Argon2id (via `hash-wasm`) with a random per-device salt. The output is a 256-bit key.

**At rest:** Every record in IndexedDB is encrypted individually using AES-256-GCM (Web Crypto API — browser-native, no library). The `id` field is stored in plaintext for indexing; the payload is always ciphertext.

**Salt:** Stored in `localStorage` unencrypted. The salt is not secret — it prevents rainbow table attacks on the passphrase. Without the passphrase, the salt is useless.

**Key lifetime:** The derived key lives in React state (in memory) only. It is never written to disk, never transmitted, and is discarded when you tap Lock or close the app.

---

## Biometric unlock

The app uses the WebAuthn PRF extension (following Bitwarden's pattern) to wrap the derived key:

1. After initial key derivation, the key is wrapped using a PRF output from the device's secure enclave (Face ID / fingerprint)
2. The wrapped key is stored in IndexedDB (encrypted, useless without the PRF output)
3. On subsequent unlocks, biometrics gate access to the PRF output, which unwraps the key
4. Your passphrase remains the recovery path

---

## SMS relay

The relay is the only component where a narrow trust exception applies. Here is the exact scope:

**What the relay receives:**
- A pre-composed SMS text string (e.g. `"3 cards due before Mar 15: Chase Freedom..."`)
- A phone number in E.164 format
- A scheduled send time
- A single-use random token (not tied to identity)

**What the relay does not receive:**
- Any structured card data, balances, or financial records
- Your passphrase or encryption key
- Any user identity or account information

**What the relay does with what it receives:**
- Holds the message and phone number in memory until `send_at`
- Sends the SMS via Twilio
- Deletes the record immediately after sending
- Logs nothing (no message content, no phone numbers)

**Token design:**
Each scheduled message uses a fresh random UUID as its token. There is no `user_id` — the relay has no concept of a user. Compromising the relay DB reveals only pending unsent messages, not history. After sending, nothing remains.

**Verifiability:**
The relay code is in `relay/` in this repository. You can self-host it. The zero-knowledge claim for financial data is maintained end-to-end; the relay is a disclosed, scoped exception for the final SMS text only.

---

## Screenshot OCR

Tesseract.js runs entirely in the browser. The image file is processed in memory and immediately discarded — it is never stored in IndexedDB, never uploaded to any server, and never retained by the app in any form.

The original screenshot remains in your photo library until you choose to delete it. The app prompts you to do this after each OCR run.

---

## What card-fit does not do

- No analytics or telemetry of any kind
- No ad networks
- No account creation, no email, no identity
- No bank credential linking
- No server-side storage of financial data

---

## Threat model

**Protected against:**
- Server compromise (relay or future sync server) — attacker sees only ciphertext or pending SMS text
- Database exfiltration — all financial records are AES-256-GCM encrypted at rest
- Passphrase brute-force — Argon2id with 64 MB memory cost makes this computationally expensive

**Not protected against:**
- Compromise of the device itself (if your device is compromised, the in-memory key can be extracted while the app is unlocked)
- A malicious relay that logs messages before sending — mitigated by self-hosting or auditing the open source relay code

---

*This document is the source of truth for the card-fit trust model. If the code contradicts this document, the code is wrong — file an issue.*
