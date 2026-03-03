import { useState, useEffect, useCallback } from 'react'
import { incomeEvents as incomeEventsDb } from '../db'
import type { IncomeEvent } from '../types'

export function useIncomeEvents(cryptoKey: CryptoKey | null) {
  const [incomeEvents, setIncomeEvents] = useState<IncomeEvent[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!cryptoKey) return
    setLoading(true)
    try {
      const all = await incomeEventsDb.getAll(cryptoKey)
      // Sort: unconfirmed expected first, then confirmed, both by date
      all.sort((a, b) => {
        const da = a.expectedDate ?? a.receivedDate ?? ''
        const db = b.expectedDate ?? b.receivedDate ?? ''
        return da.localeCompare(db)
      })
      setIncomeEvents(all)
    } finally {
      setLoading(false)
    }
  }, [cryptoKey])

  useEffect(() => { reload() }, [reload])

  return { incomeEvents, loading, reload }
}
