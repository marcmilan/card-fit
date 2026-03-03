import { createWorker } from 'tesseract.js'

export interface OcrProgress {
  status: string
  progress: number  // 0–1
}

export interface OcrResult {
  statementBalance?: number
  minimumDue?: number
  dueDate?: string        // ISO date YYYY-MM-DD
  rawText: string
}

/**
 * Run Tesseract OCR on an image file, emitting progress events.
 * The image is never stored or transmitted — it's processed in memory only.
 */
export async function runOcr(
  imageFile: File,
  onProgress: (p: OcrProgress) => void
): Promise<OcrResult> {
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      onProgress({ status: m.status, progress: m.progress ?? 0 })
    },
  })

  try {
    const { data } = await worker.recognize(imageFile)
    return parseStatementText(data.text)
  } finally {
    await worker.terminate()
  }
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Extract statement balance, minimum due, and due date from raw OCR text.
 * Uses heuristic patterns that cover most major US card statement layouts.
 */
export function parseStatementText(raw: string): OcrResult {
  const text = raw.replace(/\s+/g, ' ').trim()
  const result: OcrResult = { rawText: raw }

  // ── Balance patterns ──────────────────────────────────────────────────────
  // "Statement Balance $1,234.56" / "New Balance: $1,234.56" / "Balance Due $1,234.56"
  const balancePatterns = [
    /(?:statement\s+balance|new\s+balance|account\s+balance|balance\s+due)[:\s]+\$?([\d,]+\.?\d{0,2})/i,
    /(?:total\s+balance)[:\s]+\$?([\d,]+\.?\d{0,2})/i,
  ]
  for (const pattern of balancePatterns) {
    const m = text.match(pattern)
    if (m) {
      result.statementBalance = parseAmount(m[1])
      break
    }
  }

  // ── Minimum due patterns ──────────────────────────────────────────────────
  // "Minimum Payment Due $25.00" / "Min. Due: $25.00" / "Minimum Due $25"
  const minPatterns = [
    /(?:minimum\s+payment\s+due|minimum\s+due|min(?:imum)?\.?\s+due|min\.?\s+payment)[:\s]+\$?([\d,]+\.?\d{0,2})/i,
    /(?:payment\s+due)[:\s]+\$?([\d,]+\.?\d{0,2})/i,
  ]
  for (const pattern of minPatterns) {
    const m = text.match(pattern)
    if (m) {
      result.minimumDue = parseAmount(m[1])
      break
    }
  }

  // ── Due date patterns ─────────────────────────────────────────────────────
  // "Payment Due Date: March 15, 2026" / "Due Date: 03/15/2026" / "Due: Mar 15"
  const dueDatePatterns = [
    /(?:payment\s+due\s+date|due\s+date|due\s+by)[:\s]+([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i,
    /(?:payment\s+due\s+date|due\s+date|due\s+by)[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(?:due\s+date|payment\s+due)[:\s]+([A-Za-z]+\.?\s+\d{1,2})/i,
  ]
  for (const pattern of dueDatePatterns) {
    const m = text.match(pattern)
    if (m) {
      const parsed = parseDate(m[1])
      if (parsed) { result.dueDate = parsed; break }
    }
  }

  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''))
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function parseDate(raw: string): string | null {
  const s = raw.trim()

  // MM/DD/YYYY or MM/DD/YY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slashMatch) {
    const [, mm, dd, yy] = slashMatch
    const year = yy.length === 2 ? 2000 + parseInt(yy) : parseInt(yy)
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }

  // "March 15, 2026" or "Mar 15 2026" or "Mar 15"
  const wordMatch = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})?$/)
  if (wordMatch) {
    const [, mon, day, yearStr] = wordMatch
    const month = MONTH_MAP[mon.slice(0, 3).toLowerCase()]
    if (!month) return null
    const year = yearStr ? parseInt(yearStr) : new Date().getFullYear()
    // If the parsed month is in the past, it's probably next year
    const candidate = new Date(year, month - 1, parseInt(day))
    const adjusted = candidate < new Date() && !yearStr
      ? new Date(year + 1, month - 1, parseInt(day))
      : candidate
    return adjusted.toISOString().split('T')[0]
  }

  return null
}
