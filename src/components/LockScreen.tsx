import { useState } from 'react'
import { deriveKey, getOrCreateSalt } from '../crypto'
import { useCryptoKey } from '../context/CryptoKeyContext'

export default function LockScreen() {
  const { setKey } = useCryptoKey()
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!passphrase) return

    setLoading(true)
    try {
      const salt = getOrCreateSalt()
      const key = await deriveKey(passphrase, salt)
      setKey(key)
    } catch {
      setError('something went wrong, try again')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <span className="text-4xl">💳</span>
          <h1 className="mt-3 text-2xl font-bold text-white tracking-tight">card-fit</h1>
          <p className="mt-1 text-sm text-zinc-500">welcome back</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            autoFocus
            className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3.5 text-sm focus:outline-none focus:border-violet-500 transition"
          />
          {error && <p className="text-red-400 text-xs px-1">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold py-3.5 text-sm transition"
          >
            {loading ? 'unlocking…' : 'unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
