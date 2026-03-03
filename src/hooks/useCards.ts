import { useState, useEffect, useCallback } from 'react'
import { cards as cardsDb } from '../db'
import type { Card } from '../types'

export function useCards(cryptoKey: CryptoKey | null) {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!cryptoKey) return
    setLoading(true)
    try {
      const all = await cardsDb.getAll(cryptoKey)
      all.sort((a, b) => a.provider.localeCompare(b.provider))
      setCards(all)
    } finally {
      setLoading(false)
    }
  }, [cryptoKey])

  useEffect(() => {
    reload()
  }, [reload])

  return { cards, loading, reload }
}
