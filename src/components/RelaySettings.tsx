import { useState, useEffect } from 'react'
import { useCryptoKey } from '../context/CryptoKeyContext'
import { getRelayUrl, setRelayUrl, pingRelay } from '../lib/relay'
import { scheduledDigests as scheduledDigestsDb } from '../db'
import type { ScheduledDigest } from '../types'

// ── Relay secret stored encrypted in IndexedDB ────────────────────────────────
// We reuse the scheduledDigests store with a special sentinel ID
const SECRET_SENTINEL_ID = '__relay_secret__'

export async function getRelaySecret(cryptoKey: CryptoKey): Promise<string | null> {
  const record = await scheduledDigestsDb.get(SECRET_SENTINEL_ID, cryptoKey) as ScheduledDigest | undefined
  return record?.relayToken ?? null
}

export async function saveRelaySecret(secret: string, cryptoKey: CryptoKey): Promise<void> {
  const record: ScheduledDigest = {
    id: SECRET_SENTINEL_ID,
    relayToken: secret,
    message: '',
    sendAt: '',
    createdAt: new Date().toISOString(),
  }
  await scheduledDigestsDb.put(record, cryptoKey)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RelaySettingsProps {
  onClose: () => void
}

export default function RelaySettings({ onClose }: RelaySettingsProps) {
  const { cryptoKey } = useCryptoKey()
  const [relayUrl, setRelayUrlState] = useState(getRelayUrl() ?? '')
  const [secret, setSecret] = useState('')
  const [phone, setPhone] = useState('')
  const [pingStatus, setPingStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load saved phone from localStorage (not sensitive)
  useEffect(() => {
    setPhone(localStorage.getItem('card-fit:phone') ?? '')
  }, [])

  async function handlePing() {
    if (!relayUrl) return
    setRelayUrl(relayUrl)
    setPingStatus('checking')
    const ok = await pingRelay()
    setPingStatus(ok ? 'ok' : 'fail')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!cryptoKey) return
    setSaving(true)
    try {
      setRelayUrl(relayUrl)
      if (secret) await saveRelaySecret(secret, cryptoKey)
      if (phone) localStorage.setItem('card-fit:phone', phone)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-zinc-950 z-40 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition p-2 -ml-2 rounded-xl">←</button>
          <div>
            <h2 className="text-white font-bold text-lg">SMS relay</h2>
            <p className="text-zinc-500 text-xs">self-host or use a shared instance</p>
          </div>
        </div>

        {/* Explainer */}
        <div className="bg-zinc-900 rounded-2xl p-4 mb-6 space-y-2 text-xs text-zinc-400 leading-relaxed">
          <p>
            card-fit composes your SMS digest client-side — your card data never leaves this device.
          </p>
          <p>
            the relay receives only the <span className="text-white">final SMS text</span> and your <span className="text-white">phone number</span>, holds them until the scheduled time, then sends and deletes. nothing is logged.
          </p>
          <p className="text-zinc-600">
            relay code is open source — you can self-host it or use a trusted shared instance.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Relay URL */}
          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">relay URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://your-relay.onrender.com"
                value={relayUrl}
                onChange={e => setRelayUrlState(e.target.value)}
                className="flex-1 rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
              />
              <button
                type="button"
                onClick={handlePing}
                disabled={!relayUrl || pingStatus === 'checking'}
                className="rounded-2xl bg-zinc-800 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-4 py-3 text-sm transition"
              >
                {pingStatus === 'checking' ? '…' : pingStatus === 'ok' ? '✓' : pingStatus === 'fail' ? '✗' : 'ping'}
              </button>
            </div>
            {pingStatus === 'ok' && <p className="text-emerald-400 text-xs mt-1 px-1">relay reachable</p>}
            {pingStatus === 'fail' && <p className="text-red-400 text-xs mt-1 px-1">can't reach relay — check the URL</p>}
          </div>

          {/* Secret */}
          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">
              relay secret
              <span className="text-zinc-600 ml-1">(stored encrypted on this device)</span>
            </label>
            <input
              type="password"
              placeholder="your RELAY_SECRET from .env"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          {/* Phone number */}
          <div>
            <label className="text-zinc-400 text-xs mb-1.5 block">
              your phone number
              <span className="text-zinc-600 ml-1">(E.164 format, e.g. +15550001234)</span>
            </label>
            <input
              type="tel"
              placeholder="+15550001234"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
            <p className="text-zinc-700 text-xs mt-1 px-1">stored locally only — sent to relay only when composing a digest</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 py-3 text-sm font-medium transition"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3 text-sm transition"
            >
              {saved ? '✓ saved' : saving ? 'saving…' : 'save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
