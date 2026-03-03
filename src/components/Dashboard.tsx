import { useState, useEffect } from 'react'
import { useCryptoKey } from '../context/CryptoKeyContext'
import { useCards } from '../hooks/useCards'
import { useStatements } from '../hooks/useStatements'
import { useTimeline } from '../hooks/useTimeline'
import { isTightWindow } from '../lib/timeline'
import { cardDisplayName } from '../types'
import { findUrgentCards, composeUrgencyDigest } from '../lib/digest'
import { getRelayUrl, sendNow } from '../lib/relay'
import { getRelaySecret } from './RelaySettings'
import type { Card } from '../types'
import type { StatementWithStatus } from '../hooks/useStatements'
import type { DashboardBucket } from '../lib/timeline'
import CardForm from './CardForm'
import CardDetail from './CardDetail'
import PayCycleForm from './PayCycleForm'
import IncomeTimeline from './IncomeTimeline'
import Settings from './Settings'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(iso + 'T00:00:00')
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function urgencyBorder(days: number, status: StatementWithStatus['status']): string {
  if (status === 'paid' || status === 'overpaid') return ''
  if (days <= 3) return 'border-l-4 border-l-red-500'
  if (days <= 7) return 'border-l-4 border-l-amber-500'
  return ''
}

function statusBadge(status: StatementWithStatus['status']) {
  switch (status) {
    case 'paid':     return <span className="text-xs text-emerald-400 font-medium">paid ✓</span>
    case 'overpaid': return <span className="text-xs text-emerald-400 font-medium">paid ✓✓</span>
    case 'partial':  return <span className="text-xs text-amber-400 font-medium">partial</span>
    case 'unpaid':   return null
  }
}

// ── Card row ──────────────────────────────────────────────────────────────────

interface CardRowProps {
  card: Card
  statement?: StatementWithStatus
  bucketIncomeDate?: Date
  onClick: () => void
}

function CardRow({ card, statement, bucketIncomeDate, onClick }: CardRowProps) {
  const days = statement ? daysUntil(statement.dueDate) : null
  const isPaid = statement?.status === 'paid' || statement?.status === 'overpaid'
  const urgency = statement && days !== null ? urgencyBorder(days, statement.status) : ''
  const tight = statement && bucketIncomeDate
    ? isTightWindow(new Date(statement.dueDate + 'T00:00:00'), bucketIncomeDate)
    : false

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-zinc-900 rounded-2xl p-4 transition hover:bg-zinc-800 ${urgency} ${isPaid ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: card.color ?? '#7c3aed' }}
          />
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${isPaid ? 'text-zinc-500' : 'text-white'}`}>
              {cardDisplayName(card)}
            </p>
            {statement && (
              <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1 flex-wrap">
                <span>due {formatDate(statement.dueDate)}</span>
                {days !== null && !isPaid && days <= 7 && (
                  <span className={days <= 3 ? 'text-red-400' : 'text-amber-400'}>
                    · {days === 0 ? 'today!' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                  </span>
                )}
                {tight && !isPaid && <span className="text-amber-400">⚠️ tight window</span>}
              </p>
            )}
            {!statement && (
              <p className="text-xs text-zinc-600 mt-0.5">no statement</p>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {statement && (
            <>
              {statusBadge(statement.status)}
              {!isPaid && (
                <p className="text-sm font-bold text-white">
                  ${statement.minimumDue}
                  <span className="text-zinc-500 font-normal text-xs"> min</span>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Bucket section ────────────────────────────────────────────────────────────

interface BucketSectionProps {
  bucket: DashboardBucket
  cards: Card[]
  statements: StatementWithStatus[]
  onCardClick: (card: Card) => void
}

function BucketSection({ bucket, cards, statements, onCardClick }: BucketSectionProps) {
  const bucketCards = bucket.cardIds
    .map(id => cards.find(c => c.id === id))
    .filter(Boolean) as Card[]

  const currentStatement = (cardId: string) =>
    statements
      .filter(s => s.cardId === cardId)
      .sort((a, b) => b.cycleMonth.localeCompare(a.cycleMonth))[0]

  const unpaidTotal = bucketCards.reduce((sum, card) => {
    const s = currentStatement(card.id)
    if (!s || s.status === 'paid' || s.status === 'overpaid') return sum
    return sum + Math.max(0, s.minimumDue - s.totalPaid)
  }, 0)

  const isConfirmed = bucket.incomePoint?.isConfirmed ?? false

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-semibold uppercase tracking-wider ${
            bucket.isUnassigned ? 'text-zinc-600' : 'text-zinc-400'
          }`}>
            {bucket.isUnassigned ? '── unassigned' : bucket.label}
          </span>
          {!bucket.isUnassigned && !isConfirmed && (
            <span className="text-zinc-600 text-xs" title="projected">~</span>
          )}
        </div>
        {unpaidTotal > 0 && (
          <span className="text-xs text-zinc-600">${unpaidTotal.toLocaleString()} remaining</span>
        )}
      </div>
      <div className="space-y-2">
        {bucketCards.map(card => (
          <CardRow
            key={card.id}
            card={card}
            statement={currentStatement(card.id)}
            bucketIncomeDate={bucket.incomePoint?.date}
            onClick={() => onCardClick(card)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { cryptoKey, lock } = useCryptoKey()
  const { cards, reload: reloadCards } = useCards(cryptoKey)
  const { statements, reload: reloadStatements } = useStatements(cryptoKey)
  const { payCycles, incomeEvents, timeline, buckets, reload: reloadTimeline } = useTimeline(cryptoKey, cards, statements)

  const [showCardForm, setShowCardForm] = useState(false)
  const [editingCard, setEditingCard] = useState<Card | undefined>()
  const [selectedCard, setSelectedCard] = useState<Card | undefined>()
  const [showPayCycleForm, setShowPayCycleForm] = useState(false)
  const [showIncomeTimeline, setShowIncomeTimeline] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sortBy, setSortBy] = useState<'due' | 'alpha'>('due')

  function reloadAll() {
    reloadCards()
    reloadStatements()
    reloadTimeline()
  }

  // Urgency fallback: on app open, check for cards due within 3 days with no income confirmed
  useEffect(() => {
    if (!cryptoKey || !cards.length || !statements.length) return
    if (!getRelayUrl()) return  // relay not configured, skip

    async function checkUrgency() {
      const confirmedEvents = incomeEvents.filter(e => e.isConfirmed)
      const rawStatements = statements.map(s => ({
        id: s.id, cardId: s.cardId, cycleMonth: s.cycleMonth,
        statementBalance: s.statementBalance, minimumDue: s.minimumDue,
        dueDate: s.dueDate, createdAt: s.createdAt,
      }))

      const urgent = findUrgentCards(cards, rawStatements, statements.flatMap(s => s.payments), confirmedEvents)
      if (urgent.length === 0) return

      const secret = cryptoKey ? await getRelaySecret(cryptoKey) : null
      if (!secret) return

      const phone = localStorage.getItem('card-fit:phone')
      if (!phone) return

      const message = composeUrgencyDigest(urgent, '')
      await sendNow({ token: crypto.randomUUID(), phone, message }, secret).catch(() => {})
    }

    checkUrgency()
  }, [cards.length, statements.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sort cardIds within each bucket when alpha mode is on
  function sortedBucket(bucket: DashboardBucket): DashboardBucket {
    if (sortBy === 'alpha') {
      const sorted = [...bucket.cardIds].sort((a, b) => {
        const ca = cards.find(c => c.id === a)
        const cb = cards.find(c => c.id === b)
        if (!ca || !cb) return 0
        return cardDisplayName(ca).localeCompare(cardDisplayName(cb))
      })
      return { ...bucket, cardIds: sorted }
    }
    return bucket
  }

  // Cards with no statement, not in any bucket
  const bucketedCardIds = new Set(buckets.flatMap(b => b.cardIds))
  const unbucketedCards = cards.filter(c => !bucketedCardIds.has(c.id))

  const totalUnpaid = statements.reduce((sum, s) => {
    if (s.status === 'paid' || s.status === 'overpaid') return sum
    return sum + Math.max(0, s.minimumDue - s.totalPaid)
  }, 0)

  const selectedCardStatements = selectedCard
    ? statements.filter(s => s.cardId === selectedCard.id)
    : []

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">💳</span>
          <span className="text-white font-bold text-sm">card-fit</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortBy(s => s === 'due' ? 'alpha' : 'due')}
            className="text-xs text-zinc-500 hover:text-white transition px-2 py-1 rounded-lg hover:bg-zinc-800"
          >
            {sortBy === 'due' ? 'by due date' : 'a–z'}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="text-zinc-600 hover:text-white transition text-base px-2 py-1 rounded-lg hover:bg-zinc-800"
            title="settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-lg mx-auto px-4 pt-6 pb-28">
        {cards.length === 0 ? (
          <div className="text-center pt-16">
            <div className="text-5xl mb-4">💳</div>
            <h2 className="text-white font-bold text-xl mb-2">no cards yet</h2>
            <p className="text-zinc-500 text-sm mb-8">add your first card to get started</p>
            <button
              onClick={() => { setEditingCard(undefined); setShowCardForm(true) }}
              className="rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 text-sm transition"
            >
              + add a card
            </button>
          </div>
        ) : (
          <>
            {/* Summary pill */}
            {totalUnpaid > 0 && (
              <div className="bg-zinc-900 rounded-2xl p-4 mb-6 flex items-center justify-between">
                <div>
                  <p className="text-zinc-500 text-xs">total remaining</p>
                  <p className="text-white font-bold text-2xl">${totalUnpaid.toLocaleString()}</p>
                </div>
                <span className="text-2xl">📋</span>
              </div>
            )}

            {/* Pay cycle prompt */}
            {payCycles.length === 0 && (
              <button
                onClick={() => setShowPayCycleForm(true)}
                className="w-full rounded-2xl border border-dashed border-zinc-700 hover:border-violet-500 text-zinc-500 hover:text-white py-4 text-sm transition mb-6 flex items-center justify-center gap-2"
              >
                <span>📅</span>
                <span>set up your pay schedule to group cards by pay period</span>
              </button>
            )}

            {/* Pay-period buckets */}
            {buckets.map(bucket => (
              <BucketSection
                key={bucket.id}
                bucket={sortedBucket(bucket)}
                cards={cards}
                statements={statements}
                onCardClick={setSelectedCard}
              />
            ))}

            {/* Cards with no statement yet */}
            {unbucketedCards.length > 0 && (
              <div className="mb-6">
                <div className="px-1 mb-2">
                  <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">no statement yet</span>
                </div>
                <div className="space-y-2">
                  {unbucketedCards.map(card => (
                    <CardRow
                      key={card.id}
                      card={card}
                      onClick={() => setSelectedCard(card)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FABs */}
      {cards.length > 0 && (
        <div className="fixed bottom-6 right-4 flex flex-col items-end gap-3">
          <button
            onClick={() => setShowIncomeTimeline(true)}
            className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white shadow-lg flex items-center justify-center transition text-base"
            title="income timeline"
          >
            💰
          </button>
          {payCycles.length > 0 && (
            <button
              onClick={() => setShowPayCycleForm(true)}
              className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white shadow-lg flex items-center justify-center transition text-base"
              title="pay schedule"
            >
              📅
            </button>
          )}
          <button
            onClick={() => { setEditingCard(undefined); setShowCardForm(true) }}
            className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-2xl shadow-lg shadow-violet-900/50 flex items-center justify-center transition"
          >
            +
          </button>
        </div>
      )}

      {/* Modals */}
      {showCardForm && (
        <CardForm
          existing={editingCard}
          onSave={() => { setShowCardForm(false); reloadAll() }}
          onCancel={() => setShowCardForm(false)}
        />
      )}
      {showPayCycleForm && (
        <PayCycleForm
          isPrimary={payCycles.length === 0}
          onSave={() => { setShowPayCycleForm(false); reloadTimeline() }}
          onCancel={() => setShowPayCycleForm(false)}
        />
      )}
      {showIncomeTimeline && (
        <IncomeTimeline
          timeline={timeline}
          incomeEvents={incomeEvents}
          onClose={() => setShowIncomeTimeline(false)}
          onDataChange={() => { reloadTimeline(); setShowIncomeTimeline(true) }}
        />
      )}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}
      {selectedCard && (
        <CardDetail
          card={selectedCard}
          statements={selectedCardStatements}
          onClose={() => setSelectedCard(undefined)}
          onEdit={() => {
            setEditingCard(selectedCard)
            setShowCardForm(true)
            setSelectedCard(undefined)
          }}
          onDataChange={reloadAll}
        />
      )}
    </div>
  )
}
