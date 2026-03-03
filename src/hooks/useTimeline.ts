import { useState, useEffect, useCallback } from 'react'
import { payCycles as payCyclesDb, incomeEvents as incomeEventsDb } from '../db'
import { buildIncomeTimeline, bucketCardsByIncome } from '../lib/timeline'
import type { PayCycle, IncomeEvent } from '../types'
import type { StatementWithStatus } from './useStatements'
import type { DashboardBucket, IncomePoint } from '../lib/timeline'
import type { Card } from '../types'

export function useTimeline(
  cryptoKey: CryptoKey | null,
  cards: Card[],
  statements: StatementWithStatus[]
) {
  const [payCycles, setPayCycles] = useState<PayCycle[]>([])
  const [incomeEvents, setIncomeEvents] = useState<IncomeEvent[]>([])
  const [timeline, setTimeline] = useState<IncomePoint[]>([])
  const [buckets, setBuckets] = useState<DashboardBucket[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!cryptoKey) return
    setLoading(true)
    try {
      const [cycles, events] = await Promise.all([
        payCyclesDb.getAll(cryptoKey),
        incomeEventsDb.getAll(cryptoKey),
      ])
      setPayCycles(cycles)
      setIncomeEvents(events)
    } finally {
      setLoading(false)
    }
  }, [cryptoKey])

  useEffect(() => { reload() }, [reload])

  // Recompute timeline and buckets whenever inputs change
  useEffect(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const tl = buildIncomeTimeline(payCycles, incomeEvents, now)
    setTimeline(tl)

    // Build card → due date summaries from current statements
    const summaries = cards.map(card => {
      const stmt = statements
        .filter(s => s.cardId === card.id)
        .sort((a, b) => b.cycleMonth.localeCompare(a.cycleMonth))[0]

      return {
        cardId: card.id,
        dueDate: stmt ? new Date(stmt.dueDate + 'T00:00:00') : new Date(9999, 0, 1),
        minimumDue: stmt ? Math.max(0, stmt.minimumDue - stmt.totalPaid) : 0,
      }
    })

    const b = bucketCardsByIncome(summaries, tl)
    setBuckets(b)
  }, [payCycles, incomeEvents, cards, statements])

  return { payCycles, incomeEvents, timeline, buckets, loading, reload }
}
