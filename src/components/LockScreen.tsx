import { useState, useRef } from 'react'
import { deriveKey, getOrCreateSalt, hasSalt } from '../crypto'
import { useCryptoKey } from '../context/CryptoKeyContext'

export default function LockScreen() {
  const { setKey } = useCryptoKey()
  const isFirstLaunch = !hasSalt()

  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (isFirstLaunch && passphrase !== confirm) {
      setError("passphrases don't match")
      return
    }
    if (passphrase.length < 4) {
      setError('at least 4 characters please')
      return
    }

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
        {/* Logo */}
        <div className="mb-10 text-center">
          <span className="text-4xl">💳</span>
          <h1 className="mt-3 text-2xl font-bold text-white tracking-tight">card-fit</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isFirstLaunch ? 'set up your vault' : 'welcome back'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              ref={inputRef}
              type="password"
              placeholder={isFirstLaunch ? 'create a passphrase' : 'passphrase'}
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              autoFocus
              className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3.5 text-sm focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          {isFirstLaunch && (
            <div>
              <input
                type="password"
                placeholder="confirm passphrase"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 px-4 py-3.5 text-sm focus:outline-none focus:border-violet-500 transition"
              />
            </div>
          )}

          {error && (
            <p className="text-red-400 text-xs px-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3.5 text-sm transition"
          >
            {loading ? 'unlocking…' : isFirstLaunch ? 'create vault' : 'unlock'}
          </button>
        </form>

        {isFirstLaunch && (
          <p className="mt-6 text-center text-xs text-zinc-600 leading-relaxed">
            your passphrase never leaves this device —
            it's used to encrypt everything locally
          </p>
        )}
      </div>
    </div>
  )
}
