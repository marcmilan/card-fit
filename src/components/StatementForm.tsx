import { useState } from 'react'
import { statements as statementsDb } from '../db'
import { useCryptoKey } from '../context/CryptoKeyContext'
import { cardDisplayName } from '../types'
import type { Card, Statement } from '../types'

interface StatementFormProps {
  card: Card
  existing?: Statement
  onSave: () => void
  onCancel: () => void
}

function randomId() {
  return crypto.randomUUID()
}

function currentCycleMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function StatementForm({ card, existing, onSave, onCancel }: StatementFormProps) {
  const { cryptoKey } = useCryptoKey()

  const [cycleMonth, setCycleMonth] = useState(existing?.cycleMonth ?? currentCycleMonth())
  const [statementBalance, setStatementBalance] = useState(existing?.statementBalance ? String(existing.statementBalance) : '')
  const [minimumDue, setMinimumDue] = useState(existing?.minimumDue ? String(existing.minimumDue) : '')
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Default due date from card.dueDay if not set
  function inferDueDate() {
    if (dueDate) return
    const [year, month] = cycleMonth.split('-').map(Number)
    const day = Math.min(card.dueDay, new Date(year, month, 0).getDate())
    setDueDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!cryptoKey) return

    const balance = parseFloat(statementBalance)
    const minimum = parseFloat(minimumDue)

    if (isNaN(balance) || balance < 0) { setError('enter a valid balance'); return }
    if (isNaN(minimum) || minimum < 0) { setError('enter a valid minimum due'); return }
    if (!dueDate) { setError('due date is required'); return }

    setSaving(true)
    try {
      const statement: Statement = {
        id: existing?.id ?? randomId(),
        cardId: card.id,
        cycleMonth,
        statementBalance: balance,
        minimumDue: minimum,
        dueDate,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }
      await statementsDb.put(statement, cryptoKey)
      onSave()
    } catch {
      setError('failed to save, try again')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-bold text-lg">update statement</h2>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white transition text-xl leading-none">×</button>
        </div>

        <p className="text-zinc-500 text-sm mb-6">{cardDisplayName(card)}</p>

        <form onSubmit={handleSave} className="space-y-3">
          {/* Cycle month */}
          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">billing cycle</label>
            <input
              type="month"
              value={cycleMonth}
              onChange={e => setCycleMonth(e.target.value)}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          {/* Statement balance */}
          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">statement balance</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
              <input
                type="number"
                placeholder="0.00"
                value={statementBalance}
                onChange={e => setStatementBalance(e.target.value)}
                min={0}
                step={0.01}
                className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
              />
            </div>
          </div>

          {/* Minimum due */}
          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">minimum due</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
              <input
                type="number"
                placeholder="0.00"
                value={minimumDue}
                onChange={e => setMinimumDue(e.target.value)}
                min={0}
                step={0.01}
                className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
              />
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              onFocus={inferDueDate}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          {error && <p className="text-red-400 text-xs px-1">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-2xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 py-3 text-sm font-medium transition"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3 text-sm transition"
            >
              {saving ? 'saving…' : 'save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
