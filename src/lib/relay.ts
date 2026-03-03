/**
 * Relay client — thin wrapper around the card-fit SMS relay API.
 *
 * Security model:
 *   - RELAY_SECRET is stored encrypted in IndexedDB alongside all other user data
 *   - It is decrypted client-side and sent as a Bearer token; the server never stores it
 *   - The relay URL is stored in localStorage (not sensitive)
 *   - Phone number and message are composed client-side and sent to the relay transiently
 */

const RELAY_URL_KEY = 'card-fit:relay-url'

export function getRelayUrl(): string | null {
  return localStorage.getItem(RELAY_URL_KEY)
}

export function setRelayUrl(url: string): void {
  localStorage.setItem(RELAY_URL_KEY, url.replace(/\/$/, ''))
}

export interface SchedulePayload {
  token: string       // single-use UUID
  phone: string       // E.164
  message: string     // composed SMS text
  sendAt: Date
}

async function relayFetch(path: string, method: string, secret: string, body?: object): Promise<Response> {
  const url = getRelayUrl()
  if (!url) throw new Error('relay URL not configured')

  return fetch(`${url}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Schedule a digest for future delivery.
 * The relay holds phone + message until send_at, then sends and deletes.
 */
export async function scheduleDigest(payload: SchedulePayload, secret: string): Promise<void> {
  const res = await relayFetch('/schedule', 'POST', secret, {
    token: payload.token,
    phone: payload.phone,
    message: payload.message,
    send_at: payload.sendAt.toISOString(),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`relay schedule failed: ${body.detail ?? res.status}`)
  }
}

/**
 * Cancel a pending scheduled digest (e.g. after payment recorded or reschedule).
 */
export async function cancelDigest(token: string, secret: string): Promise<void> {
  await relayFetch(`/schedule/${token}`, 'DELETE', secret)
  // Best-effort — don't throw if already sent
}

/**
 * Send an SMS immediately (urgency fallback, user-triggered).
 */
export async function sendNow(payload: Omit<SchedulePayload, 'sendAt'>, secret: string): Promise<void> {
  const res = await relayFetch('/send', 'POST', secret, {
    token: payload.token,
    phone: payload.phone,
    message: payload.message,
    send_at: new Date(Date.now() + 5000).toISOString(), // backend requires future date
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`relay send failed: ${body.detail ?? res.status}`)
  }
}

/**
 * Check relay connectivity (no auth required).
 */
export async function pingRelay(): Promise<boolean> {
  try {
    const url = getRelayUrl()
    if (!url) return false
    const res = await fetch(`${url}/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}
