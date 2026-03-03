import { useState } from 'react'
import { useCryptoKey } from '../context/CryptoKeyContext'
import {
  hasBiometricCredential,
  setupBiometric,
  clearBiometricCredential,
  isWebAuthnAvailable,
} from '../crypto/webauthn'
import RelaySettings from './RelaySettings'

// ── Screenshot reminder setting ───────────────────────────────────────────────
const DISMISS_KEY = 'card-fit:screenshot-reminder-dismissed'

function getScreenshotReminder(): 'full' | 'compact' | 'off' {
  const val = localStorage.getItem(DISMISS_KEY)
  if (val === 'true') return 'compact'
  if (val === 'off') return 'off'
  return 'full'
}

function setScreenshotReminder(val: 'full' | 'compact' | 'off') {
  if (val === 'full') localStorage.removeItem(DISMISS_KEY)
  else if (val === 'compact') localStorage.setItem(DISMISS_KEY, 'true')
  else localStorage.setItem(DISMISS_KEY, 'off')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SettingsProps {
  onClose: () => void
}

export default function Settings({ onClose }: SettingsProps) {
  const { cryptoKey, lock } = useCryptoKey()
  const [showRelaySettings, setShowRelaySettings] = useState(false)
  const [screenshotReminder, setScreenshotReminderState] = useState(getScreenshotReminder())
  const [bioEnabled, setBioEnabled] = useState(hasBiometricCredential())
  const [bioLoading, setBioLoading] = useState(false)
  const canUseBio = isWebAuthnAvailable()

  async function toggleBiometric() {
    if (!cryptoKey) return
    setBioLoading(true)
    try {
      if (bioEnabled) {
        clearBiometricCredential()
        setBioEnabled(false)
      } else {
        const ok = await setupBiometric(cryptoKey)
        setBioEnabled(ok)
      }
    } finally {
      setBioLoading(false)
    }
  }

  function handleScreenshotReminderChange(val: 'full' | 'compact' | 'off') {
    setScreenshotReminder(val)
    setScreenshotReminderState(val)
  }

  if (showRelaySettings) {
    return <RelaySettings onClose={() => setShowRelaySettings(false)} />
  }

  return (
    <div className="fixed inset-0 bg-zinc-950 z-40 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition p-2 -ml-2 rounded-xl">←</button>
          <h2 className="text-white font-bold text-lg">settings</h2>
        </div>

        <div className="space-y-6">

          {/* Security */}
          <Section title="security">
            {canUseBio && (
              <Row
                label="Face ID / fingerprint"
                sub={bioEnabled ? 'enabled — tap to disable' : 'disabled — tap to enable'}
              >
                <Toggle
                  enabled={bioEnabled}
                  loading={bioLoading}
                  onChange={toggleBiometric}
                />
              </Row>
            )}
            <Row label="lock app" sub="clear key from memory">
              <button
                onClick={lock}
                className="text-xs text-zinc-500 hover:text-white transition px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700"
              >
                lock now
              </button>
            </Row>
          </Section>

          {/* SMS */}
          <Section title="sms digest">
            <button
              onClick={() => setShowRelaySettings(true)}
              className="w-full flex items-center justify-between py-3 text-left"
            >
              <div>
                <p className="text-white text-sm font-medium">relay configuration</p>
                <p className="text-zinc-500 text-xs">URL, secret, phone number</p>
              </div>
              <span className="text-zinc-600">→</span>
            </button>
          </Section>

          {/* Screenshots */}
          <Section title="about screenshots">
            <div className="space-y-1 mb-3 text-xs text-zinc-500 leading-relaxed">
              <p>screenshots are processed on your device using Tesseract.js.</p>
              <p>the image is discarded immediately after reading. it is never stored or uploaded.</p>
              <p>the original stays in your photo library until you delete it.</p>
            </div>

            <div>
              <p className="text-zinc-400 text-xs mb-2">screenshot cleanup reminder</p>
              <div className="space-y-1">
                {([ ['full', 'full reminder (default)'], ['compact', 'compact reminder'], ['off', 'off'] ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => handleScreenshotReminderChange(val)}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
                      screenshotReminder === val
                        ? 'bg-violet-500/10 border border-violet-500/30 text-white'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <span>{label}</span>
                    {screenshotReminder === val && <span className="text-violet-400 text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* About */}
          <Section title="about">
            <div className="space-y-3 text-xs text-zinc-500">
              <p>
                <span className="text-white">card-fit</span> — privacy-first credit card payment manager
              </p>
              <p>zero-knowledge · open source · no account required</p>
              <a
                href="https://github.com/marcmilan/card-fit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300 transition block"
              >
                github.com/marcmilan/card-fit →
              </a>
              <a
                href="https://github.com/marcmilan/card-fit/blob/main/SECURITY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-400 transition block"
              >
                security & trust model →
              </a>
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-zinc-600 text-xs font-semibold uppercase tracking-wider mb-2">{title}</p>
      <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
        {children}
      </div>
    </div>
  )
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div>
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-zinc-500 text-xs">{sub}</p>
      </div>
      {children}
    </div>
  )
}

function Toggle({ enabled, loading, onChange }: { enabled: boolean; loading: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={loading}
      className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${enabled ? 'bg-violet-600' : 'bg-zinc-700'} disabled:opacity-50`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}
