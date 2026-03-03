// ── Card ────────────────────────────────────────────────────────────────────

export interface Card {
  id: string
  provider: string
  customLabel?: string
  lastFour?: string
  statementCloseDay: number   // 1–31
  dueDay: number              // 1–31
  creditLimit?: number
  color?: string              // hex
  createdAt: string           // ISO timestamp
}

export function cardDisplayName(card: Card): string {
  return [card.provider, card.customLabel, card.lastFour]
    .filter(Boolean)
    .join(' ')
    .trim()
}

// ── Statement ────────────────────────────────────────────────────────────────

export type StatementStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid'

export interface Statement {
  id: string
  cardId: string
  cycleMonth: string          // "YYYY-MM"
  statementBalance: number
  minimumDue: number
  dueDate: string             // ISO date "YYYY-MM-DD"
  createdAt: string
}

// ── Payment ──────────────────────────────────────────────────────────────────

export interface Payment {
  id: string
  statementId: string
  amount: number
  paidDate: string            // ISO date "YYYY-MM-DD"
  note?: string
  createdAt: string
}

// ── PayCycle ─────────────────────────────────────────────────────────────────

export type PayFrequency = 'semimonthly' | 'biweekly' | 'monthly' | 'custom'

export interface PayCycle {
  id: string
  label: string
  frequency: PayFrequency
  anchorDate: string          // ISO date — a known past pay date
  isPrimary: boolean
  createdAt: string
}

// ── IncomeEvent ───────────────────────────────────────────────────────────────

export interface IncomeEvent {
  id: string
  label: string
  amount?: number
  expectedDate?: string       // ISO date
  receivedDate?: string       // ISO date; null until confirmed
  isConfirmed: boolean
  note?: string
  createdAt: string
}

// ── DigestLog ─────────────────────────────────────────────────────────────────

export interface DigestLog {
  id: string
  sentAt: string              // ISO timestamp
  payPeriod: string           // human label e.g. "Mar 15"
  message: string             // the composed SMS text
  cardIds: string[]
}

// ── ScheduledDigest ───────────────────────────────────────────────────────────
// Stored locally; a copy (phone + message + sendAt) is also sent to the relay.

export interface ScheduledDigest {
  id: string
  relayToken: string          // single-use random token sent to relay
  message: string
  sendAt: string              // ISO timestamp
  createdAt: string
}
