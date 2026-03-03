import { useState } from 'react'
import { useCryptoKey } from '../context/CryptoKeyContext'
import { useCards } from '../hooks/useCards'
import { useStatements } from '../hooks/useStatements'
import { cardDisplayName } from '../types'
import type { Card } from '../types'
import type { StatementWithStatus } from '../hooks/useStatements'
import CardForm from './CardForm'
import CardDetail from './CardDetail'

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
  onClick: () => void
}

function CardRow({ card, statement, onClick }: CardRowProps) {
  const days = statement ? daysUntil(statement.dueDate) : null
  const isPaid = statement?.status === 'paid' || statement?.status === 'overpaid'
  const urgency = statement && days !== null ? urgencyBorder(days, statement.status) : ''

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-zinc-900 rounded-2xl p-4 transition hover:bg-zinc-800 ${urgency} ${isPaid ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Color dot */}
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: card.color ?? '#7c3aed' }}
          />
          <div>
            <p className={`text-sm font-semibold ${isPaid ? 'text-zinc-500' : 'text-white'}`}>
              {cardDisplayName(card)}
            </p>
            {statement && (
              <p className="text-xs text-zinc-600 mt-0.5">
                due {formatDate(statement.dueDate)}
                {days !== null && !isPaid && days <= 7 && (
                  <span className={days <= 3 ? 'text-red-400 ml-1' : 'text-amber-400 ml-1'}>
                    · {days === 0 ? 'today' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                  </span>
                )}
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
                <p className="text-sm font-bold text-white">${statement.minimumDue} <span className="text-zinc-500 font-normal text-xs">min</span></p>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

interface SectionProps {
  label: string
  sublabel?: string
  total?: number
  children: React.ReactNode
}

function Section({ label, sublabel, total, children }: SectionProps) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <div>
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</span>
          {sublabel && <span className="text-xs text-zinc-600 ml-2">{sublabel}</span>}
        </div>
        {total !== undefined && total > 0 && (
          <span className="text-xs text-zinc-500">${total.toLocaleString()} total</span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { cryptoKey, lock } = useCryptoKey()
  const { cards, reload: reloadCards } = useCards(cryptoKey)
  const { statements, reload: reloadStatements } = useStatements(cryptoKey)

  const [showCardForm, setShowCardForm] = useState(false)
  const [editingCard, setEditingCard] = useState<Card | undefined>()
  const [selectedCard, setSelectedCard] = useState<Card | undefined>()
  const [sortBy, setSortBy] = useState<'due' | 'alpha'>('due')

  function reloadAll() {
    reloadCards()
    reloadStatements()
  }

  // Get current statement for a card (most recent cycle)
  function currentStatement(cardId: string): StatementWithStatus | undefined {
    return statements
      .filter(s => s.cardId === cardId)
      .sort((a, b) => b.cycleMonth.localeCompare(a.cycleMonth))[0]
  }

  // Sort cards
  const sortedCards = [...cards].sort((a, b) => {
    if (sortBy === 'alpha') {
      return cardDisplayName(a).localeCompare(cardDisplayName(b))
    }
    // By due date — unpaid first, then by days until due
    const sa = currentStatement(a.id)
    const sb = currentStatement(b.id)
    if (!sa && !sb) return 0
    if (!sa) return 1
    if (!sb) return -1
    const daysA = daysUntil(sa.dueDate)
    const daysB = daysUntil(sb.dueDate)
    return daysA - daysB
  })

  // Bucket: for now all go into a single "this period" bucket until pay cycle logic lands in Step 3
  const withStatements = sortedCards.filter(c => currentStatement(c.id))
  const withoutStatements = sortedCards.filter(c => !currentStatement(c.id))
  const unpaidTotal = withStatements.reduce((sum, c) => {
    const s = currentStatement(c.id)
    if (!s || s.status === 'paid' || s.status === 'overpaid') return sum
    return sum + s.minimumDue - s.totalPaid
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
        <div className="flex items-center gap-3">
          {/* Sort toggle */}
          <button
            onClick={() => setSortBy(s => s === 'due' ? 'alpha' : 'due')}
            className="text-xs text-zinc-500 hover:text-white transition px-2 py-1 rounded-lg hover:bg-zinc-800"
          >
            {sortBy === 'due' ? 'by due date' : 'a–z'}
          </button>
          <button
            onClick={lock}
            className="text-zinc-600 hover:text-white transition text-sm px-2 py-1 rounded-lg hover:bg-zinc-800"
          >
            lock
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
        {cards.length === 0 ? (
          /* Empty state */
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
            {unpaidTotal > 0 && (
              <div className="bg-zinc-900 rounded-2xl p-4 mb-6 flex items-center justify-between">
                <div>
                  <p className="text-zinc-500 text-xs">total minimum due</p>
                  <p className="text-white font-bold text-2xl">${unpaidTotal.toLocaleString()}</p>
                </div>
                <span className="text-2xl">📋</span>
              </div>
            )}

            {/* Cards with statements */}
            {withStatements.length > 0 && (
              <Section
                label="cards"
                total={unpaidTotal}
              >
                {withStatements.map(card => (
                  <CardRow
                    key={card.id}
                    card={card}
                    statement={currentStatement(card.id)}
                    onClick={() => setSelectedCard(card)}
                  />
                ))}
              </Section>
            )}

            {/* Cards without statements */}
            {withoutStatements.length > 0 && (
              <Section label="no statement yet">
                {withoutStatements.map(card => (
                  <CardRow
                    key={card.id}
                    card={card}
                    statement={undefined}
                    onClick={() => setSelectedCard(card)}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      {cards.length > 0 && (
        <div className="fixed bottom-6 right-4">
          <button
            onClick={() => { setEditingCard(undefined); setShowCardForm(true) }}
            className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-2xl shadow-lg shadow-violet-900/50 flex items-center justify-center transition"
          >
            +
          </button>
        </div>
      )}

      {/* Card form modal */}
      {showCardForm && (
        <CardForm
          existing={editingCard}
          onSave={() => { setShowCardForm(false); reloadAll() }}
          onCancel={() => setShowCardForm(false)}
        />
      )}

      {/* Card detail */}
      {selectedCard && (
        <CardDetail
          card={selectedCard}
          statements={selectedCardStatements}
          onClose={() => setSelectedCard(undefined)}
          onEdit={() => { setEditingCard(selectedCard); setShowCardForm(true); setSelectedCard(undefined) }}
          onDataChange={reloadAll}
        />
      )}
    </div>
  )
}
