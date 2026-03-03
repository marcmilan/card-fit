import { openDB, type IDBPDatabase } from 'idb'
import { encryptRecord, decryptRecord, type EncryptedRecord } from '../crypto'
import type { Card, Statement, Payment, PayCycle, IncomeEvent, DigestLog, ScheduledDigest } from '../types'

// ── Schema ────────────────────────────────────────────────────────────────────

const DB_NAME = 'card-fit'
const DB_VERSION = 1

// Each store holds: { id: string (plaintext index), iv, ciphertext }
interface StoredRecord {
  id: string
  iv: number[]
  ciphertext: number[]
}

type StoreName =
  | 'cards'
  | 'statements'
  | 'payments'
  | 'payCycles'
  | 'incomeEvents'
  | 'digestLogs'
  | 'scheduledDigests'

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const stores: StoreName[] = [
        'cards',
        'statements',
        'payments',
        'payCycles',
        'incomeEvents',
        'digestLogs',
        'scheduledDigests',
      ]
      for (const name of stores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
    },
  })
}

// ── Generic CRUD ──────────────────────────────────────────────────────────────

async function put<T extends { id: string }>(
  store: StoreName,
  record: T,
  key: CryptoKey
): Promise<void> {
  const db = await getDB()
  const encrypted = await encryptRecord(record, key)
  const stored: StoredRecord = { id: record.id, ...encrypted }
  await db.put(store, stored)
}

async function get<T>(
  store: StoreName,
  id: string,
  key: CryptoKey
): Promise<T | undefined> {
  const db = await getDB()
  const stored: StoredRecord | undefined = await db.get(store, id)
  if (!stored) return undefined
  return decryptRecord<T>({ iv: stored.iv, ciphertext: stored.ciphertext }, key)
}

async function getAll<T>(store: StoreName, key: CryptoKey): Promise<T[]> {
  const db = await getDB()
  const all: StoredRecord[] = await db.getAll(store)
  return Promise.all(
    all.map(stored =>
      decryptRecord<T>({ iv: stored.iv, ciphertext: stored.ciphertext } as EncryptedRecord, key)
    )
  )
}

async function remove(store: StoreName, id: string): Promise<void> {
  const db = await getDB()
  await db.delete(store, id)
}

// ── Cards ─────────────────────────────────────────────────────────────────────

export const cards = {
  put: (record: Card, key: CryptoKey) => put('cards', record, key),
  get: (id: string, key: CryptoKey) => get<Card>('cards', id, key),
  getAll: (key: CryptoKey) => getAll<Card>('cards', key),
  delete: (id: string) => remove('cards', id),
}

// ── Statements ────────────────────────────────────────────────────────────────

export const statements = {
  put: (record: Statement, key: CryptoKey) => put('statements', record, key),
  get: (id: string, key: CryptoKey) => get<Statement>('statements', id, key),
  getAll: (key: CryptoKey) => getAll<Statement>('statements', key),
  delete: (id: string) => remove('statements', id),
}

// ── Payments ──────────────────────────────────────────────────────────────────

export const payments = {
  put: (record: Payment, key: CryptoKey) => put('payments', record, key),
  get: (id: string, key: CryptoKey) => get<Payment>('payments', id, key),
  getAll: (key: CryptoKey) => getAll<Payment>('payments', key),
  delete: (id: string) => remove('payments', id),
}

// ── PayCycles ─────────────────────────────────────────────────────────────────

export const payCycles = {
  put: (record: PayCycle, key: CryptoKey) => put('payCycles', record, key),
  get: (id: string, key: CryptoKey) => get<PayCycle>('payCycles', id, key),
  getAll: (key: CryptoKey) => getAll<PayCycle>('payCycles', key),
  delete: (id: string) => remove('payCycles', id),
}

// ── IncomeEvents ──────────────────────────────────────────────────────────────

export const incomeEvents = {
  put: (record: IncomeEvent, key: CryptoKey) => put('incomeEvents', record, key),
  get: (id: string, key: CryptoKey) => get<IncomeEvent>('incomeEvents', id, key),
  getAll: (key: CryptoKey) => getAll<IncomeEvent>('incomeEvents', key),
  delete: (id: string) => remove('incomeEvents', id),
}

// ── DigestLogs ────────────────────────────────────────────────────────────────

export const digestLogs = {
  put: (record: DigestLog, key: CryptoKey) => put('digestLogs', record, key),
  get: (id: string, key: CryptoKey) => get<DigestLog>('digestLogs', id, key),
  getAll: (key: CryptoKey) => getAll<DigestLog>('digestLogs', key),
  delete: (id: string) => remove('digestLogs', id),
}

// ── ScheduledDigests ──────────────────────────────────────────────────────────

export const scheduledDigests = {
  put: (record: ScheduledDigest, key: CryptoKey) => put('scheduledDigests', record, key),
  get: (id: string, key: CryptoKey) => get<ScheduledDigest>('scheduledDigests', id, key),
  getAll: (key: CryptoKey) => getAll<ScheduledDigest>('scheduledDigests', key),
  delete: (id: string) => remove('scheduledDigests', id),
}
