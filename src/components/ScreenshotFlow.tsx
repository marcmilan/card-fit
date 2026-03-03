import { useState, useRef } from 'react'
import { runOcr } from '../lib/ocr'
import type { OcrResult } from '../lib/ocr'
import { cardDisplayName } from '../types'
import type { Card, Statement } from '../types'
import { statements as statementsDb } from '../db'
import { useCryptoKey } from '../context/CryptoKeyContext'

// ── Dismiss persistence keys ──────────────────────────────────────────────────
const DISMISS_KEY = 'card-fit:screenshot-reminder-dismissed'

function isDismissed(): boolean {
  return localStorage.getItem(DISMISS_KEY) === 'true'
}
function dismiss() {
  localStorage.setItem(DISMISS_KEY, 'true')
}

function randomId() { return crypto.randomUUID() }

function currentCycleMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FlowStep = 'explain' | 'processing' | 'confirm' | 'cleanup'

interface ScreenshotFlowProps {
  card: Card
  existingStatement?: Statement
  onSave: () => void
  onCancel: () => void
}

// ── Explain screen ────────────────────────────────────────────────────────────

interface ExplainScreenProps {
  onPickFile: () => void
  onManual: () => void
}

function ExplainScreen({ onPickFile, onManual }: ExplainScreenProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-white font-bold text-lg mb-1">how screenshots work</h2>
        <p className="text-zinc-500 text-sm">in card-fit</p>
      </div>

      <div className="space-y-4">
        {[
          { icon: '📸', text: 'you pick a screenshot from your photos' },
          { icon: '🔍', text: 'we read the numbers — balance, minimum due, due date' },
          { icon: '💨', text: 'the image is immediately discarded by the app — never stored, never uploaded, never kept anywhere' },
          { icon: '🗑️', text: "the original stays in your photo library until you delete it — we'll remind you" },
        ].map(({ icon, text }) => (
          <div key={icon} className="flex gap-3">
            <span className="text-xl flex-shrink-0">{icon}</span>
            <p className="text-sm text-zinc-300 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-2">
        <button
          onClick={onPickFile}
          className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3.5 text-sm transition"
        >
          got it — pick a screenshot
        </button>
        <button
          onClick={onManual}
          className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition py-2"
        >
          enter manually instead
        </button>
      </div>
    </div>
  )
}

// ── Processing screen ─────────────────────────────────────────────────────────

interface ProcessingScreenProps {
  status: string
  progress: number
}

function ProcessingScreen({ status, progress }: ProcessingScreenProps) {
  const pct = Math.round(progress * 100)
  return (
    <div className="text-center py-8 space-y-6">
      <div className="text-4xl">🔍</div>
      <div>
        <p className="text-white font-semibold mb-1">reading your screenshot</p>
        <p className="text-zinc-500 text-xs">{status || 'starting…'}</p>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <div
          className="bg-violet-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-zinc-600 text-xs">{pct}% · running on your device</p>
    </div>
  )
}

// ── Confirm screen ────────────────────────────────────────────────────────────

interface ConfirmScreenProps {
  card: Card
  result: OcrResult
  existingStatement?: Statement
  onSave: (statement: Statement) => void
  onBack: () => void
}

function ConfirmScreen({ card, result, existingStatement, onSave, onBack }: ConfirmScreenProps) {
  const [balance, setBalance] = useState(result.statementBalance != null ? String(result.statementBalance) : '')
  const [minimum, setMinimum] = useState(result.minimumDue != null ? String(result.minimumDue) : '')
  const [dueDate, setDueDate] = useState(result.dueDate ?? '')
  const [cycleMonth, setCycleMonth] = useState(existingStatement?.cycleMonth ?? currentCycleMonth())
  const [error, setError] = useState('')

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const bal = parseFloat(balance)
    const min = parseFloat(minimum)
    if (isNaN(bal) || bal < 0) { setError('enter a valid balance'); return }
    if (isNaN(min) || min < 0) { setError('enter a valid minimum due'); return }
    if (!dueDate) { setError('due date is required'); return }

    onSave({
      id: existingStatement?.id ?? randomId(),
      cardId: card.id,
      cycleMonth,
      statementBalance: bal,
      minimumDue: min,
      dueDate,
      createdAt: existingStatement?.createdAt ?? new Date().toISOString(),
    })
  }

  const anyMissing = !result.statementBalance || !result.minimumDue || !result.dueDate

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold text-lg">does this look right?</h2>
        <p className="text-zinc-500 text-sm mt-0.5">{cardDisplayName(card)}</p>
      </div>

      {anyMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-400">
          some fields couldn't be read automatically — please fill them in
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="text-zinc-400 text-xs mb-1.5 block">billing cycle</label>
          <input
            type="month"
            value={cycleMonth}
            onChange={e => setCycleMonth(e.target.value)}
            className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />
        </div>

        <div>
          <label className="text-zinc-400 text-xs mb-1.5 block flex items-center gap-1">
            statement balance
            {result.statementBalance != null && <span className="text-emerald-500">✓ read</span>}
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
            <input
              type="number"
              placeholder="0.00"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              min={0} step={0.01}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>
        </div>

        <div>
          <label className="text-zinc-400 text-xs mb-1.5 block flex items-center gap-1">
            minimum due
            {result.minimumDue != null && <span className="text-emerald-500">✓ read</span>}
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
            <input
              type="number"
              placeholder="0.00"
              value={minimum}
              onChange={e => setMinimum(e.target.value)}
              min={0} step={0.01}
              className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>
        </div>

        <div>
          <label className="text-zinc-400 text-xs mb-1.5 block flex items-center gap-1">
            due date
            {result.dueDate && <span className="text-emerald-500">✓ read</span>}
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full rounded-2xl bg-zinc-800 border border-zinc-700 text-white px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition"
          />
        </div>

        {error && <p className="text-red-400 text-xs px-1">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-2xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 py-3 text-sm font-medium transition"
          >
            ← retake
          </button>
          <button
            type="submit"
            className="flex-1 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 text-sm transition"
          >
            save →
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Cleanup prompt ────────────────────────────────────────────────────────────

interface CleanupPromptProps {
  cardName: string
  onDone: () => void
  onDismissForever: () => void
}

function CleanupPrompt({ cardName, onDone, onDismissForever }: CleanupPromptProps) {
  const [expanded, setExpanded] = useState(true)

  if (isDismissed()) {
    // Compact version
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 text-lg">✓</span>
          <div>
            <p className="text-white font-semibold text-sm">{cardName} updated</p>
            <button
              onClick={() => window.open('photos://', '_blank')}
              className="text-xs text-zinc-500 hover:text-violet-400 transition underline"
            >
              open Photos to delete screenshot →
            </button>
          </div>
        </div>
        <button
          onClick={onDone}
          className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3.5 text-sm transition"
        >
          done
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-emerald-400 text-xl">✓</span>
        <p className="text-white font-semibold">{cardName} updated</p>
      </div>

      <div className="bg-zinc-900 rounded-2xl p-4 space-y-3">
        <p className="text-white text-sm font-medium">
          this app is done with your screenshot.
        </p>
        <p className="text-zinc-400 text-sm leading-relaxed">
          the original is still in your Photos — want to delete it now?
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => window.open('photos://', '_blank')}
            className="flex-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 text-xs font-medium transition"
          >
            open Photos to delete
          </button>
          <button
            onClick={onDone}
            className="flex-1 rounded-xl border border-zinc-700 text-zinc-500 hover:text-white py-2.5 text-xs font-medium transition"
          >
            skip
          </button>
        </div>

        {/* Expandable explanation */}
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition"
          >
            <span>{expanded ? '▾' : '▸'}</span>
            <span>how this works</span>
          </button>
          {expanded && (
            <div className="mt-2 pt-2 border-t border-zinc-800 text-xs text-zinc-500 leading-relaxed space-y-1">
              <p>we read your screenshot and immediately discard it.</p>
              <p>it's never stored or uploaded.</p>
              <p>the original stays in your Photos until you delete it.</p>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onDismissForever}
        className="w-full text-center text-xs text-zinc-700 hover:text-zinc-500 transition py-1"
      >
        got it, don't show this again
      </button>
      <p className="text-center text-xs text-zinc-800">
        you can always find this in Settings → About Screenshots
      </p>
    </div>
  )
}

// ── Main flow ─────────────────────────────────────────────────────────────────

export default function ScreenshotFlow({ card, existingStatement, onSave, onCancel }: ScreenshotFlowProps) {
  const { cryptoKey } = useCryptoKey()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<FlowStep>(isDismissed() ? 'processing' : 'explain')
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)

  // If explain was skipped (already dismissed), trigger file picker immediately
  const [autoTrigger, setAutoTrigger] = useState(isDismissed())

  function handlePickFile() {
    setStep('processing')
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { setStep('explain'); return }

    setOcrStatus('loading…')
    setOcrProgress(0)

    try {
      const result = await runOcr(file, ({ status, progress }) => {
        setOcrStatus(status)
        setOcrProgress(progress)
      })
      setOcrResult(result)
      setStep('confirm')
    } catch {
      setStep('explain')
    }
    // Clear input so the same file can be re-selected
    e.target.value = ''
  }

  async function handleConfirmSave(statement: Statement) {
    if (!cryptoKey) return
    await statementsDb.put(statement, cryptoKey)
    setStep('cleanup')
  }

  function handleCleanupDone() {
    onSave()
  }

  function handleDismissForever() {
    dismiss()
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-6 shadow-2xl">
        {step !== 'cleanup' && (
          <div className="flex justify-end mb-4">
            <button onClick={onCancel} className="text-zinc-500 hover:text-white transition text-xl leading-none">×</button>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          // Trigger automatically if explain was already dismissed
          ref={(el) => {
            ;(fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
            if (autoTrigger && el) {
              setAutoTrigger(false)
              setTimeout(() => el.click(), 50)
            }
          }}
        />

        {step === 'explain' && (
          <ExplainScreen
            onPickFile={handlePickFile}
            onManual={onCancel}
          />
        )}

        {step === 'processing' && (
          <ProcessingScreen status={ocrStatus} progress={ocrProgress} />
        )}

        {step === 'confirm' && ocrResult && (
          <ConfirmScreen
            card={card}
            result={ocrResult}
            existingStatement={existingStatement}
            onSave={handleConfirmSave}
            onBack={() => setStep('explain')}
          />
        )}

        {step === 'cleanup' && (
          <CleanupPrompt
            cardName={cardDisplayName(card)}
            onDone={handleCleanupDone}
            onDismissForever={handleDismissForever}
          />
        )}
      </div>
    </div>
  )
}
