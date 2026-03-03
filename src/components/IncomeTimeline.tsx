import { useState } from 'react'
import { incomeEvents as incomeEventsDb } from '../db'
import { useCryptoKey } from '../context/CryptoKeyContext'
import type { IncomeEvent } from '../types'
import type { IncomePoint } from '../lib/timeline'
import IncomeEventForm from './IncomeEventForm'

interface IncomeTimelineProps {
  timeline: IncomePoint[]
  incomeEvents: IncomeEvent[]
  onClose: () => void
  onDataChange: () => void
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysUntil(d: Date): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

export default function IncomeTimeline({ timeline, incomeEvents, onClose, onDataChange }: IncomeTimelineProps) {
  const { cryptoKey } = useCryptoKey()
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<IncomeEvent | undefined>()

  async function confirmEvent(event: IncomeEvent) {
    if (!cryptoKey) return
    const today = new Date().toISOString().split('T')[0]
    await incomeEventsDb.put({
      ...event,
      isConfirmed: true,
      receivedDate: event.receivedDate ?? today,
    }, cryptoKey)
    onDataChange()
  }

  async function deleteEvent(id: string) {
    await incomeEventsDb.delete(id)
    onDataChange()
  }

  return (
    <div className="fixed inset-0 bg-zinc-950 z-40 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition p-2 -ml-2 rounded-xl">←</button>
          <div className="flex-1">
            <h2 className="text-white font-bold text-lg">income timeline</h2>
            <p className="text-zinc-500 text-xs">next 90 days</p>
          </div>
          <button
            onClick={() => { setEditingEvent(undefined); setShowForm(true) }}
            className="text-sm text-violet-400 hover:text-violet-300 transition font-medium"
          >
            + log income
          </button>
        </div>

        {/* Timeline */}
        {timeline.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-white font-semibold mb-1">no upcoming income</p>
            <p className="text-zinc-500 text-sm mb-6">log an expected payment or set up a pay schedule</p>
            <button
              onClick={() => { setEditingEvent(undefined); setShowForm(true) }}
              className="rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 text-sm transition"
            >
              log income
            </button>
          </div>
        )}

        <div className="space-y-2">
          {timeline.map((point, i) => {
            const days = daysUntil(point.date)
            const event = point.incomeEventId
              ? incomeEvents.find(e => e.id === point.incomeEventId)
              : undefined

            return (
              <div
                key={i}
                className={`bg-zinc-900 rounded-2xl p-4 border transition ${
                  point.isConfirmed
                    ? 'border-emerald-500/30'
                    : 'border-dashed border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{point.isConfirmed ? '✅' : '🔮'}</span>
                    <div>
                      <p className="text-white text-sm font-semibold">{point.label}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">
                        {formatDate(point.date)}
                        {days === 0 && <span className="text-emerald-400 ml-1">· today</span>}
                        {days > 0 && <span className="text-zinc-600 ml-1">· in {days}d</span>}
                        {days < 0 && <span className="text-zinc-700 ml-1">· {Math.abs(days)}d ago</span>}
                        {!point.isConfirmed && <span className="text-zinc-700 ml-1">· projected</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Confirm button for unconfirmed IncomeEvents */}
                    {!point.isConfirmed && event && (
                      <button
                        onClick={() => confirmEvent(event)}
                        className="rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs px-3 py-1.5 font-medium transition"
                      >
                        got paid ✓
                      </button>
                    )}
                    {/* Edit/delete for IncomeEvents */}
                    {event && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditingEvent(event); setShowForm(true) }}
                          className="text-zinc-600 hover:text-zinc-400 transition text-xs px-2 py-1"
                        >
                          edit
                        </button>
                        <button
                          onClick={() => deleteEvent(event.id)}
                          className="text-zinc-700 hover:text-red-400 transition text-xs px-2 py-1"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {event?.note && (
                  <p className="text-zinc-600 text-xs mt-2 ml-9">{event.note}</p>
                )}
                {event?.amount && (
                  <p className="text-zinc-500 text-xs mt-1 ml-9">${event.amount.toLocaleString()}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Logged income events not yet in timeline (past confirmed) */}
        {(() => {
          const timelineEventIds = new Set(timeline.map(p => p.incomeEventId).filter(Boolean))
          const past = incomeEvents.filter(e => !timelineEventIds.has(e.id) && e.isConfirmed)
          if (past.length === 0) return null
          return (
            <div className="mt-8">
              <h3 className="text-zinc-600 text-xs font-semibold uppercase tracking-wider mb-3">past</h3>
              <div className="space-y-2">
                {past.map(event => (
                  <div key={event.id} className="bg-zinc-900/50 rounded-2xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-zinc-500 text-sm">{event.label}</p>
                      <p className="text-zinc-700 text-xs">{event.receivedDate ?? event.expectedDate}</p>
                    </div>
                    <button
                      onClick={() => deleteEvent(event.id)}
                      className="text-zinc-700 hover:text-red-400 transition text-xs px-2"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>

      {showForm && (
        <IncomeEventForm
          existing={editingEvent}
          onSave={() => { setShowForm(false); onDataChange() }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
