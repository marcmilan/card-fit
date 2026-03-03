import { useState } from 'react'
import { deriveKey, getOrCreateSalt } from '../crypto'
import { useCryptoKey } from '../context/CryptoKeyContext'
import { cards as cardsDb, payCycles as payCyclesDb } from '../db'
import { cardDisplayName } from '../types'
import type { Card, PayCycle, PayFrequency } from '../types'
import { setupBiometric, isWebAuthnAvailable } from '../crypto/webauthn'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'passphrase' | 'biometric' | 'first-card' | 'pay-period'

function randomId() { return crypto.randomUUID() }

const PROVIDERS = [
  'Amex', 'Apple', 'Amazon', 'Bank of America', 'Barclays', 'Capital One',
  'Chase', 'Citi', 'Discover', 'Goldman Sachs', 'HSBC', 'Navy Federal',
  'PNC', 'Synchrony', 'Target', 'US Bank', 'USAA', 'Wells Fargo',
]

const PAY_PERIOD_OPTIONS: { value: PayFrequency; label: string; sub: string }[] = [
  { value: 'semimonthly', label: '1st & 15th', sub: 'twice a month' },
  { value: 'biweekly',    label: 'every 2 weeks', sub: 'every other week' },
  { value: 'monthly',     label: 'monthly', sub: 'once a month' },
  { value: 'custom',      label: 'irregular', sub: "I'll log it manually" },
]

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current ? 'w-6 bg-violet-500' : i < current ? 'w-1.5 bg-violet-800' : 'w-1.5 bg-zinc-700'
          }`}
        />
      ))}
    </div>
  )
}

// ── Step 1: Passphrase ────────────────────────────────────────────────────────

interface PassphraseStepProps {
  onNext: (key: CryptoKey) => void
}

function PassphraseStep({ onNext }: PassphraseStepProps) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleNext(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (passphrase.length < 4) { setError('at least 4 characters please'); return }
    if (passphrase !== confirm) { setError("passphrases don't match"); return }

    setLoading(true)
    try {
      const salt = getOrCreateSalt()
      const key = await deriveKey(passphrase, salt)
      onNext(key)
    } catch {
      setError('something went wrong, try again')
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">🔐</div>
        <h2 className="text-white font-bold text-xl mb-2">create your vault</h2>
        <p className="text-zinc-500 text-sm leading-relaxed max-w-xs mx-auto">
          your passphrase encrypts everything on this device — we never see it, store it, or send it anywhere
        </p>
      </div>

      <form onSubmit={handleNext} className="space-y-3">
        <input
          type="password"
          placeholder="create a passphrase"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          autoFocus
          className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3.5 text-sm focus:outline-none focus:border-violet-500 transition"
        />
        <input
          type="password"
          placeholder="confirm passphrase"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3.5 text-sm focus:outline-none focus:border-violet-500 transition"
        />
        {error && <p className="text-red-400 text-xs px-1">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3.5 text-sm transition"
        >
          {loading ? 'setting up…' : 'create vault →'}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-zinc-700 leading-relaxed">
        open source · zero-knowledge · no account needed
      </p>
    </div>
  )
}

// ── Step 2: First card ────────────────────────────────────────────────────────

interface FirstCardStepProps {
  cryptoKey: CryptoKey
  onNext: (card: Card) => void
  onSkip: () => void
}

function FirstCardStep({ cryptoKey, onNext, onSkip }: FirstCardStepProps) {
  const [provider, setProvider] = useState('')
  const [providerQuery, setProviderQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [lastFour, setLastFour] = useState('')
  const [statementCloseDay, setStatementCloseDay] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [color, setColor] = useState('#7c3aed')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const suggestions = PROVIDERS.filter(p =>
    p.toLowerCase().startsWith(providerQuery.toLowerCase()) && providerQuery.length > 0
  )

  const preview = provider
    ? cardDisplayName({ id: '', provider, customLabel: customLabel || undefined, lastFour: lastFour || undefined, statementCloseDay: 1, dueDay: 1, createdAt: '' })
    : 'your first card'

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!provider) { setError('provider is required'); return }
    const scd = parseInt(statementCloseDay)
    const dd = parseInt(dueDay)
    if (!scd || scd < 1 || scd > 31) { setError('invalid statement close day'); return }
    if (!dd || dd < 1 || dd > 31) { setError('invalid due day'); return }

    setSaving(true)
    try {
      const card: Card = {
        id: randomId(),
        provider,
        customLabel: customLabel || undefined,
        lastFour: lastFour || undefined,
        statementCloseDay: scd,
        dueDay: dd,
        color,
        createdAt: new Date().toISOString(),
      }
      await cardsDb.put(card, cryptoKey)
      onNext(card)
    } catch {
      setError('failed to save, try again')
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">💳</div>
        <h2 className="text-white font-bold text-xl mb-2">add your first card</h2>
        <p className="text-zinc-500 text-sm">you can add more later</p>
      </div>

      {/* Preview chip */}
      <div
        className="rounded-2xl p-4 mb-5 text-white text-sm font-semibold"
        style={{ backgroundColor: color }}
      >
        {preview}
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        {/* Provider */}
        <div className="relative">
          <input
            type="text"
            placeholder="provider (Chase, Amex, Apple…)"
            value={providerQuery}
            onChange={e => { setProviderQuery(e.target.value); setProvider(e.target.value); setShowSuggestions(true) }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            autoFocus
            className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 top-full mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-2xl overflow-hidden shadow-xl">
              {suggestions.map(s => (
                <button key={s} type="button"
                  onMouseDown={() => { setProvider(s); setProviderQuery(s); setShowSuggestions(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-zinc-700 transition"
                >{s}</button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="label (optional)"
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />
          <input
            type="text"
            placeholder="last 4 (optional)"
            value={lastFour}
            onChange={e => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            placeholder="statement closes (day)"
            value={statementCloseDay}
            onChange={e => setStatementCloseDay(e.target.value)}
            min={1} max={31}
            className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />
          <input
            type="number"
            placeholder="due (day)"
            value={dueDay}
            onChange={e => setDueDay(e.target.value)}
            min={1} max={31}
            className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />
        </div>

        {/* Color quick picks */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-zinc-500 text-xs">color</span>
          {['#7c3aed', '#2563eb', '#059669', '#dc2626', '#d97706', '#db2777', '#0891b2'].map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className="w-6 h-6 rounded-full transition"
              style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-xs px-1">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3.5 text-sm transition"
        >
          {saving ? 'saving…' : 'add card →'}
        </button>
      </form>

      <button onClick={onSkip} className="w-full mt-3 text-center text-xs text-zinc-600 hover:text-zinc-400 transition py-2">
        skip for now
      </button>
    </div>
  )
}

// ── Step 3: Pay period ────────────────────────────────────────────────────────

interface PayPeriodStepProps {
  cryptoKey: CryptoKey
  onDone: () => void
}

function PayPeriodStep({ cryptoKey, onDone }: PayPeriodStepProps) {
  const [frequency, setFrequency] = useState<PayFrequency | null>(null)
  const [anchorDate, setAnchorDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!frequency) return
    setSaving(true)
    try {
      if (frequency !== 'custom') {
        const cycle: PayCycle = {
          id: randomId(),
          label: 'Salary',
          frequency,
          anchorDate,
          isPrimary: true,
          createdAt: new Date().toISOString(),
        }
        await payCyclesDb.put(cycle, cryptoKey)
      }
      onDone()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">📅</div>
        <h2 className="text-white font-bold text-xl mb-2">when do you get paid?</h2>
        <p className="text-zinc-500 text-sm">cards will be grouped around your pay dates</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {PAY_PERIOD_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFrequency(opt.value)}
            className={`rounded-2xl p-4 text-left transition border ${
              frequency === opt.value
                ? 'border-violet-500 bg-violet-500/10 text-white'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-white'
            }`}
          >
            <p className="text-sm font-semibold">{opt.label}</p>
            <p className="text-xs opacity-60 mt-0.5">{opt.sub}</p>
          </button>
        ))}
      </div>

      {frequency && frequency !== 'custom' && (
        <div className="mb-4">
          <label className="text-zinc-400 text-xs mb-1.5 block">most recent pay date</label>
          <input
            type="date"
            value={anchorDate}
            onChange={e => setAnchorDate(e.target.value)}
            className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!frequency || saving}
        className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold py-3.5 text-sm transition"
      >
        {saving ? 'saving…' : "let's go →"}
      </button>

      <button onClick={onDone} className="w-full mt-3 text-center text-xs text-zinc-600 hover:text-zinc-400 transition py-2">
        skip for now
      </button>
    </div>
  )
}

// ── Biometric setup step ──────────────────────────────────────────────────────

interface BiometricStepProps {
  cryptoKey: CryptoKey
  onNext: () => void
}

function BiometricStep({ cryptoKey, onNext }: BiometricStepProps) {
  const [setting, setSetting] = useState(false)
  const [result, setResult] = useState<'idle' | 'ok' | 'fail'>('idle')

  async function handleEnable() {
    setSetting(true)
    try {
      const ok = await setupBiometric(cryptoKey)
      setResult(ok ? 'ok' : 'fail')
    } catch {
      setResult('fail')
    } finally {
      setSetting(false)
    }
  }

  if (result === 'ok') {
    return (
      <div className="text-center space-y-6">
        <div className="text-5xl">🔐✓</div>
        <div>
          <p className="text-white font-bold text-xl mb-1">biometrics enabled</p>
          <p className="text-zinc-500 text-sm">you can unlock with Face ID / fingerprint from now on</p>
        </div>
        <button
          onClick={onNext}
          className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3.5 text-sm transition"
        >
          continue →
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">🔐</div>
        <h2 className="text-white font-bold text-xl mb-2">enable biometrics?</h2>
        <p className="text-zinc-500 text-sm leading-relaxed max-w-xs mx-auto">
          unlock instantly with Face ID or fingerprint — your passphrase remains as the backup
        </p>
      </div>

      {result === 'fail' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 mb-4 text-xs text-amber-400">
          biometrics not available on this device — you can enable it later in settings
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={handleEnable}
          disabled={setting}
          className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3.5 text-sm transition"
        >
          {setting ? 'setting up…' : 'enable Face ID / fingerprint'}
        </button>
        <button
          onClick={onNext}
          className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition py-2"
        >
          skip for now
        </button>
      </div>
    </div>
  )
}

// ── Main Onboarding ───────────────────────────────────────────────────────────

export default function Onboarding() {
  const { setKey } = useCryptoKey()
  const [step, setStep] = useState<Step>('passphrase')
  const [derivedKey, setDerivedKey] = useState<CryptoKey | null>(null)
  const showBiometricStep = isWebAuthnAvailable()

  function handlePassphraseDone(key: CryptoKey) {
    setDerivedKey(key)
    setStep(showBiometricStep ? 'biometric' : 'first-card')
  }

  function handleBiometricDone() {
    setStep('first-card')
  }

  function handleFirstCardDone() {
    setStep('pay-period')
  }

  function handleAllDone() {
    if (derivedKey) setKey(derivedKey)
  }

  const totalSteps = showBiometricStep ? 4 : 3
  const stepIndex = (() => {
    switch (step) {
      case 'passphrase': return 0
      case 'biometric':  return 1
      case 'first-card': return showBiometricStep ? 2 : 1
      case 'pay-period': return showBiometricStep ? 3 : 2
    }
  })()

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <span className="text-3xl">💳</span>
          <h1 className="mt-2 text-xl font-bold text-white tracking-tight">card-fit</h1>
        </div>

        <StepDots current={stepIndex} total={totalSteps} />

        {step === 'passphrase' && (
          <PassphraseStep onNext={handlePassphraseDone} />
        )}
        {step === 'biometric' && derivedKey && (
          <BiometricStep cryptoKey={derivedKey} onNext={handleBiometricDone} />
        )}
        {step === 'first-card' && derivedKey && (
          <FirstCardStep
            cryptoKey={derivedKey}
            onNext={handleFirstCardDone}
            onSkip={handleFirstCardDone}
          />
        )}
        {step === 'pay-period' && derivedKey && (
          <PayPeriodStep
            cryptoKey={derivedKey}
            onDone={handleAllDone}
          />
        )}
      </div>
    </div>
  )
}
