import { useState } from 'react'
import { cards as cardsDb } from '../db'
import { useCryptoKey } from '../context/CryptoKeyContext'
import { cardDisplayName } from '../types'
import type { Card } from '../types'

// Popular issuers — provider field is constrained/autocomplete
const PROVIDERS = [
  'Amex', 'Apple', 'Amazon', 'Bank of America', 'Barclays', 'Capital One',
  'Chase', 'Citi', 'Discover', 'Goldman Sachs', 'HSBC', 'Navy Federal',
  'PNC', 'Synchrony', 'Target', 'US Bank', 'USAA', 'Wells Fargo',
]

interface CardFormProps {
  existing?: Card
  onSave: () => void
  onCancel: () => void
}

function randomId() {
  return crypto.randomUUID()
}

export default function CardForm({ existing, onSave, onCancel }: CardFormProps) {
  const { cryptoKey } = useCryptoKey()

  const [provider, setProvider] = useState(existing?.provider ?? '')
  const [customLabel, setCustomLabel] = useState(existing?.customLabel ?? '')
  const [lastFour, setLastFour] = useState(existing?.lastFour ?? '')
  const [statementCloseDay, setStatementCloseDay] = useState(String(existing?.statementCloseDay ?? ''))
  const [dueDay, setDueDay] = useState(String(existing?.dueDay ?? ''))
  const [creditLimit, setCreditLimit] = useState(existing?.creditLimit ? String(existing.creditLimit) : '')
  const [color, setColor] = useState(existing?.color ?? '#7c3aed')
  const [providerQuery, setProviderQuery] = useState(existing?.provider ?? '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const suggestions = PROVIDERS.filter(p =>
    p.toLowerCase().startsWith(providerQuery.toLowerCase()) && providerQuery.length > 0
  )

  const preview = provider
    ? cardDisplayName({
        id: '', provider, customLabel: customLabel || undefined,
        lastFour: lastFour || undefined, statementCloseDay: 1, dueDay: 1, createdAt: '',
      })
    : 'your card'

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!cryptoKey) return

    if (!provider) { setError('provider is required'); return }
    const scd = parseInt(statementCloseDay)
    const dd = parseInt(dueDay)
    if (!scd || scd < 1 || scd > 31) { setError('invalid statement close day'); return }
    if (!dd || dd < 1 || dd > 31) { setError('invalid due day'); return }

    setSaving(true)
    try {
      const card: Card = {
        id: existing?.id ?? randomId(),
        provider,
        customLabel: customLabel || undefined,
        lastFour: lastFour || undefined,
        statementCloseDay: scd,
        dueDay: dd,
        creditLimit: creditLimit ? parseFloat(creditLimit) : undefined,
        color,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }
      await cardsDb.put(card, cryptoKey)
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
            {existing ? 'edit card' : 'add a card'}
          </h2>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white transition text-xl leading-none">×</button>
        </div>

        {/* Preview */}
        <div
          className="rounded-2xl p-4 mb-6 text-white text-sm font-semibold"
          style={{ backgroundColor: color }}
        >
          {preview}
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          {/* Provider */}
          <div className="relative">
            <input
              type="text"
              placeholder="provider (e.g. Chase, Amex)"
              value={providerQuery}
              onChange={e => {
                setProviderQuery(e.target.value)
                setProvider(e.target.value)
                setShowSuggestions(true)
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-2xl overflow-hidden shadow-xl">
                {suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={() => {
                      setProvider(s)
                      setProviderQuery(s)
                      setShowSuggestions(false)
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-zinc-700 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Custom label */}
          <input
            type="text"
            placeholder="label (optional) — e.g. Sapphire, Freedom"
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />

          {/* Last four */}
          <input
            type="text"
            placeholder="last 4 digits (optional)"
            value={lastFour}
            onChange={e => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />

          {/* Statement close day + due day */}
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              placeholder="statement closes (day)"
              value={statementCloseDay}
              onChange={e => setStatementCloseDay(e.target.value)}
              min={1} max={31}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
            <input
              type="number"
              placeholder="payment due (day)"
              value={dueDay}
              onChange={e => setDueDay(e.target.value)}
              min={1} max={31}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          {/* Credit limit */}
          <input
            type="number"
            placeholder="credit limit (optional)"
            value={creditLimit}
            onChange={e => setCreditLimit(e.target.value)}
            min={0}
            className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />

          {/* Color */}
          <div className="flex items-center gap-3 px-1">
            <span className="text-zinc-400 text-sm">card color</span>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent"
            />
            {/* Quick presets */}
            {['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706', '#db2777'].map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full transition ring-2 ring-offset-2 ring-offset-zinc-900"
                style={{
                  backgroundColor: c,
                  ringColor: color === c ? c : 'transparent',
                  outline: color === c ? `2px solid ${c}` : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
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
              {saving ? 'saving…' : 'save card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
