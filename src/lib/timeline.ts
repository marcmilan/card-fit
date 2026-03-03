import type { PayCycle, IncomeEvent } from '../types'

// ── Income date projection ────────────────────────────────────────────────────

/**
 * Project future pay dates from a PayCycle, starting from anchorDate.
 * Returns up to `count` dates on or after `from`.
 */
export function projectPayDates(cycle: PayCycle, from: Date, count = 6): Date[] {
  const anchor = new Date(cycle.anchorDate + 'T00:00:00')
  const results: Date[] = []

  switch (cycle.frequency) {
    case 'semimonthly':
      // Pays on two fixed days per month derived from anchorDate day
      // Anchor day and anchor day + 15 (mod month)
      return projectSemimonthly(anchor, from, count)

    case 'biweekly':
      return projectBiweekly(anchor, from, count)

    case 'monthly':
      return projectMonthly(anchor, from, count)

    case 'custom':
      // Custom cycles return no projected dates — user manages via IncomeEvents
      return results
  }

  return results
}

function projectSemimonthly(anchor: Date, from: Date, count: number): Date[] {
  // Derive the two pay days from the anchor
  const day1 = anchor.getDate()
  const day2 = day1 <= 15 ? day1 + 15 : day1 - 15

  const [lo, hi] = [Math.min(day1, day2), Math.max(day1, day2)]
  const results: Date[] = []

  // Start from a couple months before `from` to avoid missing edge cases
  let year = from.getFullYear()
  let month = from.getMonth() - 1
  if (month < 0) { month = 11; year-- }

  while (results.length < count) {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const d1 = new Date(year, month, Math.min(lo, daysInMonth))
    const d2 = new Date(year, month, Math.min(hi, daysInMonth))

    for (const d of [d1, d2]) {
      if (d >= from) results.push(d)
      if (results.length >= count) break
    }

    month++
    if (month > 11) { month = 0; year++ }
  }

  return results
}

function projectBiweekly(anchor: Date, from: Date, count: number): Date[] {
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
  const results: Date[] = []

  // Find the first pay date >= from by stepping forward/backward from anchor
  let current = new Date(anchor)

  // Step forward to reach `from`
  while (current < from) {
    current = new Date(current.getTime() + 2 * MS_PER_WEEK)
  }
  // Step back one cycle in case we overshot
  const prev = new Date(current.getTime() - 2 * MS_PER_WEEK)
  if (prev >= from) current = prev

  while (results.length < count) {
    if (current >= from) results.push(new Date(current))
    current = new Date(current.getTime() + 2 * MS_PER_WEEK)
  }

  return results
}

function projectMonthly(anchor: Date, from: Date, count: number): Date[] {
  const results: Date[] = []
  const anchorDay = anchor.getDate()

  let year = from.getFullYear()
  let month = from.getMonth() - 1
  if (month < 0) { month = 11; year-- }

  while (results.length < count) {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const d = new Date(year, month, Math.min(anchorDay, daysInMonth))
    if (d >= from) results.push(d)

    month++
    if (month > 11) { month = 0; year++ }
  }

  return results
}

// ── Unified income timeline ───────────────────────────────────────────────────

export interface IncomePoint {
  date: Date
  label: string
  isConfirmed: boolean      // false = projected/expected
  incomeEventId?: string    // set if from an IncomeEvent
  payCycleId?: string       // set if from a PayCycle projection
}

/**
 * Merge projected PayCycle dates and IncomeEvents into a single
 * ordered timeline of upcoming income points.
 */
export function buildIncomeTimeline(
  cycles: PayCycle[],
  events: IncomeEvent[],
  from: Date,
  horizonDays = 90
): IncomePoint[] {
  const horizon = new Date(from.getTime() + horizonDays * 86400000)
  const points: IncomePoint[] = []

  // From pay cycles
  for (const cycle of cycles) {
    const dates = projectPayDates(cycle, from, 12)
    for (const d of dates) {
      if (d <= horizon) {
        points.push({
          date: d,
          label: cycle.label,
          isConfirmed: false,
          payCycleId: cycle.id,
        })
      }
    }
  }

  // From income events (both expected and confirmed)
  for (const event of events) {
    const dateStr = event.receivedDate ?? event.expectedDate
    if (!dateStr) continue
    const d = new Date(dateStr + 'T00:00:00')
    if (d >= from && d <= horizon) {
      points.push({
        date: d,
        label: event.label,
        isConfirmed: event.isConfirmed,
        incomeEventId: event.id,
      })
    }
  }

  // Deduplicate: if a PayCycle date and an IncomeEvent land on the same day, prefer the event
  const deduped = points.reduce<IncomePoint[]>((acc, pt) => {
    const existing = acc.find(p => sameDay(p.date, pt.date) && p.payCycleId && pt.incomeEventId)
    if (existing) {
      // Replace projected cycle date with the confirmed event
      return acc.map(p => (p === existing ? pt : p))
    }
    return [...acc, pt]
  }, [])

  return deduped.sort((a, b) => a.date.getTime() - b.date.getTime())
}

// ── Dashboard bucketing ───────────────────────────────────────────────────────

export type BucketId = string   // ISO date string of the income point, or 'unassigned'

export interface DashboardBucket {
  id: BucketId
  label: string           // "Mar 15" or "Unassigned"
  incomePoint?: IncomePoint
  cardIds: string[]
  totalMinimum: number
  isUnassigned: boolean
}

interface CardDueSummary {
  cardId: string
  dueDate: Date
  minimumDue: number
}

/**
 * Bucket cards by the income point immediately before their due date.
 * A card belongs to the income period whose pay date is the nearest one
 * on or before the card's due date — i.e. "which paycheck pays this card".
 *
 * If no income point precedes a due date within the horizon, it's unassigned.
 */
export function bucketCardsByIncome(
  cards: CardDueSummary[],
  timeline: IncomePoint[]
): DashboardBucket[] {
  const bucketMap = new Map<string, DashboardBucket>()
  const unassigned: DashboardBucket = {
    id: 'unassigned',
    label: 'Unassigned',
    cardIds: [],
    totalMinimum: 0,
    isUnassigned: true,
  }

  for (const card of cards) {
    // Find income points that are on or before this card's due date
    // The card is paid FROM the income that arrives before it's due
    const preceding = timeline.filter(p => p.date <= card.dueDate)
    const assignedTo = preceding[preceding.length - 1]  // most recent income before due date

    if (!assignedTo) {
      unassigned.cardIds.push(card.cardId)
      unassigned.totalMinimum += card.minimumDue
      continue
    }

    const key = assignedTo.date.toISOString()
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        id: key,
        label: formatIncomeLabel(assignedTo),
        incomePoint: assignedTo,
        cardIds: [],
        totalMinimum: 0,
        isUnassigned: false,
      })
    }

    const bucket = bucketMap.get(key)!
    bucket.cardIds.push(card.cardId)
    bucket.totalMinimum += card.minimumDue
  }

  const buckets = Array.from(bucketMap.values())
    .sort((a, b) => a.incomePoint!.date.getTime() - b.incomePoint!.date.getTime())

  if (unassigned.cardIds.length > 0) buckets.push(unassigned)

  return buckets
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatIncomeLabel(point: IncomePoint): string {
  const dateStr = point.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${point.label} · ${dateStr}`
}

export function isTightWindow(dueDate: Date, incomeDate: Date): boolean {
  const diff = Math.round((dueDate.getTime() - incomeDate.getTime()) / 86400000)
  return diff >= 0 && diff <= 2
}

export function isEarlyPayOpportunity(dueDate: Date, previousIncomeDate: Date | undefined, nextIncomeDate: Date | undefined): boolean {
  if (!previousIncomeDate || !nextIncomeDate) return false
  // Card due after next income — could be paid early from current income
  return dueDate > nextIncomeDate && dueDate > previousIncomeDate
}
