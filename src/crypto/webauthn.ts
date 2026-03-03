/**
 * Biometric unlock via WebAuthn PRF extension (Bitwarden pattern).
 *
 * Flow:
 *   Setup:    passphrase → Argon2id → masterKey
 *             → generate random symmetricKey
 *             → WebAuthn create credential with PRF extension
 *             → PRF output wraps symmetricKey (AES-KW)
 *             → store: { credentialId, wrappedKey, salt } in localStorage
 *
 *   Unlock:   WebAuthn get assertion with same PRF extension
 *             → PRF output → unwrap symmetricKey
 *             → symmetricKey in memory
 *
 * The symmetricKey IS the CryptoKey used for all IndexedDB encryption.
 * The masterKey (from Argon2id) is only used during initial setup and
 * as a recovery path — it is not stored.
 *
 * Browser support: Chrome 116+, Firefox 126+, Safari 17.5+
 * Falls back gracefully — passphrase entry remains available if PRF is unsupported.
 */

const STORAGE_KEY = 'card-fit:webauthn'

interface StoredCredential {
  credentialId: string    // base64url
  wrappedKey: string      // base64url — AES-KW wrapped CryptoKey
  prfSalt: string         // base64url — fixed salt for PRF evaluation
}

// ── Availability check ────────────────────────────────────────────────────────

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  )
}

export function hasBiometricCredential(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null
}

// ── Setup ─────────────────────────────────────────────────────────────────────

/**
 * Register a WebAuthn credential and wrap the provided CryptoKey with its PRF output.
 * Call this after the user sets their passphrase for the first time.
 */
export async function setupBiometric(keyToWrap: CryptoKey): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false

  try {
    const prfSalt = crypto.getRandomValues(new Uint8Array(32))
    const userId = crypto.getRandomValues(new Uint8Array(16))

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'card-fit', id: window.location.hostname },
        user: {
          id: userId,
          name: 'card-fit-user',
          displayName: 'card-fit user',
        },
        pubKeyCredParams: [
          { alg: -7,  type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          userVerification: 'required',
          residentKey: 'preferred',
        },
        extensions: {
          prf: {
            eval: { first: prfSalt.buffer as ArrayBuffer },
          },
        } as AuthenticationExtensionsClientInputs,
        timeout: 60000,
      },
    }) as PublicKeyCredential | null

    if (!credential) return false

    const extResults = credential.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } }
    }
    const prfOutput = extResults?.prf?.results?.first
    if (!prfOutput) {
      // PRF extension not supported by this authenticator
      return false
    }

    // Derive a wrapping key from the PRF output
    const wrappingKey = await crypto.subtle.importKey(
      'raw',
      prfOutput,
      { name: 'AES-KW' },
      false,
      ['wrapKey', 'unwrapKey']
    )

    // Wrap the symmetric key
    const wrappedKeyBuffer = await crypto.subtle.wrapKey(
      'raw',
      keyToWrap,
      wrappingKey,
      'AES-KW'
    )

    const stored: StoredCredential = {
      credentialId: bufferToBase64url(credential.rawId),
      wrappedKey: bufferToBase64url(wrappedKeyBuffer),
      prfSalt: bufferToBase64url(prfSalt.buffer as ArrayBuffer),
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    return true
  } catch (err) {
    console.warn('biometric setup failed:', err)
    return false
  }
}

// ── Unlock ────────────────────────────────────────────────────────────────────

/**
 * Use biometrics to unwrap the stored CryptoKey.
 * Returns null if the user cancels, biometrics fail, or PRF is unsupported.
 */
export async function unlockWithBiometric(): Promise<CryptoKey | null> {
  if (!isWebAuthnAvailable() || !hasBiometricCredential()) return null

  const stored: StoredCredential = JSON.parse(localStorage.getItem(STORAGE_KEY)!)

  try {
    const prfSalt = base64urlToBuffer(stored.prfSalt)
    const credentialId = base64urlToBuffer(stored.credentialId)

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: credentialId, type: 'public-key' }],
        userVerification: 'required',
        extensions: {
          prf: {
            eval: { first: prfSalt },
          },
        } as AuthenticationExtensionsClientInputs,
        timeout: 60000,
      },
    }) as PublicKeyCredential | null

    if (!assertion) return null

    const extResults = assertion.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } }
    }
    const prfOutput = extResults?.prf?.results?.first
    if (!prfOutput) return null

    const wrappingKey = await crypto.subtle.importKey(
      'raw',
      prfOutput,
      { name: 'AES-KW' },
      false,
      ['unwrapKey']
    )

    const wrappedKey = base64urlToBuffer(stored.wrappedKey)

    return await crypto.subtle.unwrapKey(
      'raw',
      wrappedKey,
      wrappingKey,
      'AES-KW',
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    )
  } catch (err) {
    console.warn('biometric unlock failed:', err)
    return null
  }
}

/**
 * Remove the stored biometric credential (e.g. when user disables biometrics in settings).
 */
export function clearBiometricCredential(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Base64url helpers ─────────────────────────────────────────────────────────

function bufferToBase64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64urlToBuffer(b64: string): ArrayBuffer {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    b64.length + (4 - (b64.length % 4)) % 4, '='
  )
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
