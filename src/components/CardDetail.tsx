import { useState } from 'react'
import { cardDisplayName } from '../types'
import type { Card } from '../types'
import type { StatementWithStatus } from '../hooks/useStatements'
import StatementForm from './StatementForm'
import PaymentForm from './PaymentForm'
import ScreenshotFlow from './ScreenshotFlow'

interface CardDetailProps {
  card: Card
  statements: StatementWithStatus[]
  onClose: () => void
  onEdit: () => void
  onDataChange: () => void
}

function statusIcon(status: StatementWithStatus['status']) {
  switch (status) {
    case 'paid': return <span className="text-emerald-400">✓</span>
    case 'overpaid': return <span className="text-emerald-400">✓✓</span>
    case 'partial': return <span className="text-amber-400">◐</span>
    case 'unpaid': return <span className="text-zinc-500">○</span>
  }
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function CardDetail({ card, statements, onClose, onEdit, onDataChange }: CardDetailProps) {
  const [showStatementForm, setShowStatementForm] = useState(false)
  const [showScreenshotFlow, setShowScreenshotFlow] = useState(false)
  const [editingStatement, setEditingStatement] = useState<StatementWithStatus | undefined>()
  const [payingStatement, setPayingStatement] = useState<StatementWithStatus | undefined>()

  const sorted = [...statements]
    .filter(s => s.cardId === card.id)
    .sort((a, b) => b.cycleMonth.localeCompare(a.cycleMonth))

  const current = sorted[0]

  const utilization = card.creditLimit && current
    ? Math.round((current.statementBalance / card.creditLimit) * 100)
    : null

  return (
    <div className="fixed inset-0 bg-zinc-950 z-40 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition p-2 -ml-2 rounded-xl"
          >
            ←
          </button>
          <div className="flex-1">
            <h2 className="text-white font-bold text-lg">{cardDisplayName(card)}</h2>
          </div>
          <button
            onClick={onEdit}
            className="text-zinc-500 hover:text-white transition text-sm"
          >
            edit
          </button>
        </div>

        {/* Card chip */}
        <div
          className="rounded-3xl p-5 mb-6 text-white"
          style={{ backgroundColor: card.color ?? '#7c3aed' }}
        >
          <p className="text-sm font-semibold opacity-90 mb-4">{cardDisplayName(card)}</p>
          {current && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="opacity-60">statement balance</p>
                <p className="text-lg font-bold">${current.statementBalance.toLocaleString()}</p>
              </div>
              <div>
                <p className="opacity-60">minimum due</p>
                <p className="text-lg font-bold">${current.minimumDue.toLocaleString()}</p>
              </div>
              <div>
                <p className="opacity-60">due date</p>
                <p className="font-semibold">{formatDate(current.dueDate)}</p>
              </div>
              {utilization !== null && (
                <div>
                  <p className="opacity-60">utilization</p>
                  <p className="font-semibold">{utilization}%</p>
                </div>
              )}
            </div>
          )}
          {!current && (
            <p className="text-sm opacity-60">no statement yet</p>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <button
            onClick={() => setShowScreenshotFlow(true)}
            className="rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-white py-3 text-sm font-medium transition"
          >
            📸 update from screenshot
          </button>
          <button
            onClick={() => { setEditingStatement(undefined); setShowStatementForm(true) }}
            className="rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-white py-3 text-sm font-medium transition"
          >
            ✏️ manual entry
          </button>
          {current && current.status !== 'paid' && current.status !== 'overpaid' && (
            <button
              onClick={() => setPayingStatement(current)}
              className="col-span-2 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white py-3 text-sm font-semibold transition"
            >
              record payment
            </button>
          )}
        </div>

        {/* Payment history */}
        {sorted.length > 0 && (
          <div>
            <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">payment history</h3>
            <div className="space-y-2">
              {sorted.map(s => (
                <div key={s.id} className="bg-zinc-900 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-semibold">{s.cycleMonth}</span>
                    <span className="text-zinc-500 text-xs">{statusIcon(s.status)} {s.status}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-zinc-500">
                    <span>${s.statementBalance} balance</span>
                    <span>${s.minimumDue} min</span>
                    {s.totalPaid > 0 && <span className="text-emerald-500">${s.totalPaid} paid</span>}
                  </div>
                  {s.payments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {s.payments.map(p => (
                        <div key={p.id} className="flex justify-between text-xs">
                          <span className="text-zinc-500">{formatDate(p.paidDate)}{p.note ? ` · ${p.note}` : ''}</span>
                          <span className="text-emerald-400">${p.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {sorted.length === 0 && (
          <div className="text-center py-8 text-zinc-600 text-sm">
            no statements yet — add one above
          </div>
        )}
      </div>

      {/* Modals */}
      {showScreenshotFlow && (
        <ScreenshotFlow
          card={card}
          existingStatement={current}
          onSave={() => { setShowScreenshotFlow(false); onDataChange() }}
          onCancel={() => setShowScreenshotFlow(false)}
        />
      )}
      {showStatementForm && (
        <StatementForm
          card={card}
          existing={editingStatement}
          onSave={() => { setShowStatementForm(false); onDataChange() }}
          onCancel={() => setShowStatementForm(false)}
        />
      )}
      {payingStatement && (
        <PaymentForm
          card={card}
          statement={payingStatement}
          onSave={() => { setPayingStatement(undefined); onDataChange() }}
          onCancel={() => setPayingStatement(undefined)}
        />
      )}
    </div>
  )
}
