import type { Card, Statement, Payment, IncomeEvent } from '../types'
import { cardDisplayName } from '../types'
import type { IncomePoint } from './timeline'

export interface DigestCard {
  card: Card
  statement: Statement
  payments: Payment[]
  totalPaid: number
  minimumRemaining: number
  daysUntilDue: number
  isTight: boolean      // due within 2 days of income landing
}

export interface DigestPayload {
  cards: DigestCard[]
  incomePoint: IncomePoint
  totalRemaining: number
  appUrl: string
}

// ── Compose ───────────────────────────────────────────────────────────────────

/**
 * Compose the SMS digest text from a set of cards due in the next pay period.
 * This runs entirely client-side — the output is what gets sent to the relay.
 */
export function composeDigest(payload: DigestPayload): string {
  const { cards, incomePoint, totalRemaining, appUrl } = payload
  const unpaid = cards.filter(c => c.minimumRemaining > 0)

  if (unpaid.length === 0) {
    return `✓ all cards paid before ${formatIncomeDate(incomePoint.date)} — nice work!\n${appUrl}`
  }

  const dateStr = formatIncomeDate(incomePoint.date)
  const lines: string[] = [`${unpaid.length} card${unpaid.length === 1 ? '' : 's'} due before ${dateStr}:`]

  for (const c of unpaid) {
    const name = cardDisplayName(c.card).padEnd(20, ' ')
    const min = `$${c.minimumRemaining} min`
    const due = `due ${formatShortDate(new Date(c.statement.dueDate + 'T00:00:00'))}`
    const tight = c.isTight ? ' ⚠️' : ''
    lines.push(`${name}  ${min.padEnd(10)} (${due})${tight}`)
  }

  lines.push(`Total minimum: $${totalRemaining}`)
  lines.push(appUrl)

  return lines.join('\n')
}

/**
 * Compose an urgency fallback digest — tone is different.
 * Used when a card is due within 3 days and no income is confirmed.
 */
export function composeUrgencyDigest(
  cards: DigestCard[],
  appUrl: string
): string {
  if (cards.length === 0) return ''

  const lines = [`Heads up: ${cards.length} card${cards.length === 1 ? '' : 's'} due soon, no income logged yet:`]

  for (const c of cards) {
    const name = cardDisplayName(c.card)
    const days = c.daysUntilDue
    const due = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
    lines.push(`${name} — $${c.minimumRemaining} min, due ${due}`)
  }

  lines.push(appUrl)
  return lines.join('\n')
}

// ── Builder ───────────────────────────────────────────────────────────────────

export interface DigestInput {
  cards: Card[]
  statements: Statement[]
  payments: Payment[]
  incomePoint: IncomePoint
  appUrl?: string
}

/**
 * Build a DigestPayload from raw data for a given income point.
 * Only includes cards that are due before this income point's date.
 */
export function buildDigestPayload(input: DigestInput): DigestPayload {
  const { cards, statements, payments, incomePoint, appUrl = '' } = input
  const now = new Date(); now.setHours(0, 0, 0, 0)

  const digestCards: DigestCard[] = []

  for (const card of cards) {
    // Find the most recent statement
    const stmt = statements
      .filter(s => s.cardId === card.id)
      .sort((a, b) => b.cycleMonth.localeCompare(a.cycleMonth))[0]

    if (!stmt) continue

    const dueDate = new Date(stmt.dueDate + 'T00:00:00')

    // Only include cards due on or before the income point date
    if (dueDate > incomePoint.date) continue

    const cardPayments = payments.filter(p => p.statementId === stmt.id)
    const totalPaid = cardPayments.reduce((sum, p) => sum + p.amount, 0)
    const minimumRemaining = Math.max(0, stmt.minimumDue - totalPaid)

    const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / 86400000)
    const isTight = Math.round((dueDate.getTime() - incomePoint.date.getTime()) / 86400000) <= 2

    digestCards.push({
      card,
      statement: stmt,
      payments: cardPayments,
      totalPaid,
      minimumRemaining,
      daysUntilDue,
      isTight,
    })
  }

  // Sort by days until due ascending
  digestCards.sort((a, b) => a.daysUntilDue - b.daysUntilDue)

  const totalRemaining = digestCards.reduce((sum, c) => sum + c.minimumRemaining, 0)

  return { cards: digestCards, incomePoint, totalRemaining, appUrl }
}

// ── Urgency check ─────────────────────────────────────────────────────────────

/**
 * Find cards due within 3 days with unpaid minimum and no confirmed income.
 */
export function findUrgentCards(
  cards: Card[],
  statements: Statement[],
  payments: Payment[],
  confirmedIncomeEvents: IncomeEvent[]
): DigestCard[] {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const threeDays = new Date(now.getTime() + 3 * 86400000)

  // Is there any confirmed income in the next 3 days?
  const hasIncomeSoon = confirmedIncomeEvents.some(e => {
    const d = new Date((e.receivedDate ?? e.expectedDate ?? '') + 'T00:00:00')
    return d >= now && d <= threeDays
  })

  if (hasIncomeSoon) return []  // income logged, no urgency needed

  const urgent: DigestCard[] = []

  for (const card of cards) {
    const stmt = statements
      .filter(s => s.cardId === card.id)
      .sort((a, b) => b.cycleMonth.localeCompare(a.cycleMonth))[0]

    if (!stmt) continue

    const dueDate = new Date(stmt.dueDate + 'T00:00:00')
    if (dueDate < now || dueDate > threeDays) continue

    const cardPayments = payments.filter(p => p.statementId === stmt.id)
    const totalPaid = cardPayments.reduce((sum, p) => sum + p.amount, 0)
    const minimumRemaining = Math.max(0, stmt.minimumDue - totalPaid)

    if (minimumRemaining <= 0) continue

    const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / 86400000)

    urgent.push({
      card,
      statement: stmt,
      payments: cardPayments,
      totalPaid,
      minimumRemaining,
      daysUntilDue,
      isTight: false,
    })
  }

  return urgent.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatIncomeDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
