import { argon2id, argon2Verify } from 'hash-wasm'

// ── Constants ────────────────────────────────────────────────────────────────

const SALT_STORAGE_KEY = 'card-fit:salt'

// Argon2id parameters — conservative for a mobile PWA
const ARGON2_TIME_COST = 3
const ARGON2_MEMORY_COST = 65536  // 64 MB
const ARGON2_PARALLELISM = 1
const ARGON2_HASH_LENGTH = 32     // 256-bit key

// ── Salt ─────────────────────────────────────────────────────────────────────

export function getOrCreateSalt(): Uint8Array {
  const stored = localStorage.getItem(SALT_STORAGE_KEY)
  if (stored) {
    return new Uint8Array(JSON.parse(stored) as number[])
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  localStorage.setItem(SALT_STORAGE_KEY, JSON.stringify(Array.from(salt)))
  return salt
}

export function hasSalt(): boolean {
  return localStorage.getItem(SALT_STORAGE_KEY) !== null
}

// ── Key derivation ────────────────────────────────────────────────────────────

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const hashHex = await argon2id({
    password: passphrase,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_TIME_COST,
    memorySize: ARGON2_MEMORY_COST,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'hex',
  })

  // Convert hex string to raw bytes
  const keyBytes = new Uint8Array(hashHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,       // not extractable
    ['encrypt', 'decrypt']
  )
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

export interface EncryptedRecord {
  iv: number[]
  ciphertext: number[]
}

export async function encryptRecord<T>(data: T, key: CryptoKey): Promise<EncryptedRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(data))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
  }
}

export async function decryptRecord<T>(record: EncryptedRecord, key: CryptoKey): Promise<T> {
  const iv = new Uint8Array(record.iv)
  const ciphertext = new Uint8Array(record.ciphertext)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}
