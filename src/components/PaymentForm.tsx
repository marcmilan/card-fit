import { useState } from 'react'
import { payments as paymentsDb } from '../db'
import { useCryptoKey } from '../context/CryptoKeyContext'
import type { StatementWithStatus } from '../hooks/useStatements'
import { cardDisplayName } from '../types'
import type { Card, Payment } from '../types'

interface PaymentFormProps {
  card: Card
  statement: StatementWithStatus
  onSave: () => void
  onCancel: () => void
}

function randomId() {
  return crypto.randomUUID()
}

function today() {
  return new Date().toISOString().split('T')[0]
}

export default function PaymentForm({ card, statement, onSave, onCancel }: PaymentFormProps) {
  const { cryptoKey } = useCryptoKey()
  const remaining = Math.max(0, statement.minimumDue - statement.totalPaid)

  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : String(statement.minimumDue))
  const [paidDate, setPaidDate] = useState(today())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!cryptoKey) return

    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('enter a valid amount'); return }
    if (!paidDate) { setError('date is required'); return }

    setSaving(true)
    try {
      const payment: Payment = {
        id: randomId(),
        statementId: statement.id,
        amount: amt,
        paidDate,
        note: note || undefined,
        createdAt: new Date().toISOString(),
      }
      await paymentsDb.put(payment, cryptoKey)
      onSave()
    } catch {
      setError('failed to save, try again')
      setSaving(false)
    }
  }

  const statusAfter = () => {
    const newTotal = statement.totalPaid + parseFloat(amount || '0')
    if (newTotal >= statement.statementBalance) return '🎉 paid in full'
    if (newTotal >= statement.minimumDue) return '✓ minimum covered'
    return null
  }

  const preview = statusAfter()

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-bold text-lg">record payment</h2>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white transition text-xl leading-none">×</button>
        </div>

        <p className="text-zinc-500 text-sm mb-1">{cardDisplayName(card)}</p>
        <p className="text-zinc-600 text-xs mb-6">
          {statement.cycleMonth} · ${statement.minimumDue} min · ${statement.statementBalance} balance
        </p>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">amount paid</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min={0.01}
                step={0.01}
                autoFocus
                className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
              />
            </div>
          </div>

          {/* Quick amount chips */}
          <div className="flex gap-2 flex-wrap">
            {[statement.minimumDue, statement.statementBalance].filter((v, i, a) => a.indexOf(v) === i).map(amt => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(String(amt))}
                className="px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-violet-500 text-xs transition"
              >
                ${amt} {amt === statement.minimumDue ? '(min)' : '(full)'}
              </button>
            ))}
          </div>

          {preview && (
            <p className="text-emerald-400 text-xs px-1">{preview}</p>
          )}

          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">date paid</label>
            <input
              type="date"
              value={paidDate}
              onChange={e => setPaidDate(e.target.value)}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">note (optional)</label>
            <input
              type="text"
              placeholder="e.g. partial, rest next week"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
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
              {saving ? 'saving…' : 'record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
