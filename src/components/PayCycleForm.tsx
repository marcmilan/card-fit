import { useState } from 'react'
import { payCycles as payCyclesDb } from '../db'
import { useCryptoKey } from '../context/CryptoKeyContext'
import type { PayCycle, PayFrequency } from '../types'

interface PayCycleFormProps {
  existing?: PayCycle
  isPrimary?: boolean
  onSave: () => void
  onCancel: () => void
}

const FREQUENCY_OPTIONS: { value: PayFrequency; label: string; description: string }[] = [
  { value: 'semimonthly', label: '1st & 15th', description: 'twice a month on fixed days' },
  { value: 'biweekly',    label: 'every 2 weeks', description: 'every other Friday (or your day)' },
  { value: 'monthly',     label: 'monthly', description: 'once a month on a fixed day' },
  { value: 'custom',      label: 'irregular', description: 'no fixed schedule — I\'ll log each one' },
]

function randomId() { return crypto.randomUUID() }

function todayISO() { return new Date().toISOString().split('T')[0] }

export default function PayCycleForm({ existing, isPrimary, onSave, onCancel }: PayCycleFormProps) {
  const { cryptoKey } = useCryptoKey()

  const [label, setLabel] = useState(existing?.label ?? (isPrimary ? 'Salary' : ''))
  const [frequency, setFrequency] = useState<PayFrequency>(existing?.frequency ?? 'semimonthly')
  const [anchorDate, setAnchorDate] = useState(existing?.anchorDate ?? todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!cryptoKey) return
    if (!label.trim()) { setError('give this income source a name'); return }
    if (!anchorDate) { setError('pick a recent pay date as anchor'); return }

    setSaving(true)
    try {
      const cycle: PayCycle = {
        id: existing?.id ?? randomId(),
        label: label.trim(),
        frequency,
        anchorDate,
        isPrimary: existing?.isPrimary ?? (isPrimary ?? false),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }
      await payCyclesDb.put(cycle, cryptoKey)
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
            {existing ? 'edit pay schedule' : 'when do you get paid?'}
          </h2>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white transition text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Label */}
          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">income source name</label>
            <input
              type="text"
              placeholder="e.g. Salary, Freelance, Side gig"
              value={label}
              onChange={e => setLabel(e.target.value)}
              autoFocus
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          {/* Frequency chips */}
          <div>
            <label className="text-zinc-400 text-xs mb-2 block">frequency</label>
            <div className="grid grid-cols-2 gap-2">
              {FREQUENCY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequency(opt.value)}
                  className={`rounded-2xl p-3 text-left transition border ${
                    frequency === opt.value
                      ? 'border-violet-500 bg-violet-500/10 text-white'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-white'
                  }`}
                >
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Anchor date — only relevant for non-custom */}
          {frequency !== 'custom' && (
            <div>
              <label className="text-zinc-400 text-xs mb-1.5 block">
                most recent pay date
                <span className="ml-1 text-zinc-600">(used to project future dates)</span>
              </label>
              <input
                type="date"
                value={anchorDate}
                onChange={e => setAnchorDate(e.target.value)}
                className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
              />
            </div>
          )}

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
