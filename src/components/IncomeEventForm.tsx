import { useState } from 'react'
import { incomeEvents as incomeEventsDb } from '../db'
import { useCryptoKey } from '../context/CryptoKeyContext'
import type { IncomeEvent } from '../types'

interface IncomeEventFormProps {
  existing?: IncomeEvent
  onSave: () => void
  onCancel: () => void
}

function randomId() { return crypto.randomUUID() }

export default function IncomeEventForm({ existing, onSave, onCancel }: IncomeEventFormProps) {
  const { cryptoKey } = useCryptoKey()

  const [label, setLabel] = useState(existing?.label ?? '')
  const [amount, setAmount] = useState(existing?.amount ? String(existing.amount) : '')
  const [expectedDate, setExpectedDate] = useState(existing?.expectedDate ?? '')
  const [isConfirmed, setIsConfirmed] = useState(existing?.isConfirmed ?? false)
  const [receivedDate, setReceivedDate] = useState(existing?.receivedDate ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!cryptoKey) return
    if (!label.trim()) { setError('give this a name'); return }
    if (!expectedDate && !receivedDate) { setError('add at least an expected date'); return }

    setSaving(true)
    try {
      const event: IncomeEvent = {
        id: existing?.id ?? randomId(),
        label: label.trim(),
        amount: amount ? parseFloat(amount) : undefined,
        expectedDate: expectedDate || undefined,
        receivedDate: isConfirmed ? (receivedDate || expectedDate || undefined) : undefined,
        isConfirmed,
        note: note || undefined,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }
      await incomeEventsDb.put(event, cryptoKey)
      onSave()
    } catch {
      setError('failed to save, try again')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-bold text-lg">
            {existing ? 'edit income' : 'log income'}
          </h2>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white transition text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <input
            type="text"
            placeholder="label (e.g. Acme invoice, Q1 retainer)"
            value={label}
            onChange={e => setLabel(e.target.value)}
            autoFocus
            className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />

          {/* Amount — optional */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
            <input
              type="number"
              placeholder="amount (optional)"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={0} step={0.01}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">expected date</label>
            <input
              type="date"
              value={expectedDate}
              onChange={e => setExpectedDate(e.target.value)}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          {/* Confirmed toggle */}
          <div className="flex items-center justify-between rounded-2xl bg-zinc-800 border border-zinc-700 px-4 py-3">
            <div>
              <p className="text-white text-sm font-medium">got paid ✓</p>
              <p className="text-zinc-500 text-xs">mark as received</p>
            </div>
            <button
              type="button"
              onClick={() => setIsConfirmed(c => !c)}
              className={`w-11 h-6 rounded-full transition-colors relative ${isConfirmed ? 'bg-emerald-500' : 'bg-zinc-700'}`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isConfirmed ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {isConfirmed && (
            <div>
              <label className="text-zinc-400 text-xs mb-1.5 block">received date</label>
              <input
                type="date"
                value={receivedDate}
                onChange={e => setReceivedDate(e.target.value)}
                placeholder={expectedDate}
                className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
              />
            </div>
          )}

          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">note (optional)</label>
            <input
              type="text"
              placeholder="e.g. net 30, expecting by end of month"
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
              {saving ? 'saving…' : 'save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
