import { useState, useEffect, useCallback } from 'react'
import { statements as statementsDb, payments as paymentsDb } from '../db'
import type { Statement, Payment, StatementStatus } from '../types'

export interface StatementWithStatus extends Statement {
  status: StatementStatus
  payments: Payment[]
  totalPaid: number
}

export function useStatements(cryptoKey: CryptoKey | null) {
  const [statements, setStatements] = useState<StatementWithStatus[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!cryptoKey) return
    setLoading(true)
    try {
      const [allStatements, allPayments] = await Promise.all([
        statementsDb.getAll(cryptoKey),
        paymentsDb.getAll(cryptoKey),
      ])

      const enriched: StatementWithStatus[] = allStatements.map(s => {
        const linked = allPayments.filter(p => p.statementId === s.id)
        const totalPaid = linked.reduce((sum, p) => sum + p.amount, 0)
        const status = computeStatus(totalPaid, s.minimumDue, s.statementBalance)
        return { ...s, payments: linked, totalPaid, status }
      })

      setStatements(enriched)
    } finally {
      setLoading(false)
    }
  }, [cryptoKey])

  useEffect(() => {
    reload()
  }, [reload])

  return { statements, loading, reload }
}

function computeStatus(
  totalPaid: number,
  minimumDue: number,
  statementBalance: number
): StatementStatus {
  if (totalPaid === 0) return 'unpaid'
  if (totalPaid >= statementBalance) return 'overpaid'
  if (totalPaid >= minimumDue) return 'paid'
  return 'partial'
}
