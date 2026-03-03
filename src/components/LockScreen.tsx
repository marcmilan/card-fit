import { useState, useEffect } from 'react'
import { deriveKey, getOrCreateSalt } from '../crypto'
import { useCryptoKey } from '../context/CryptoKeyContext'
import {
  hasBiometricCredential,
  unlockWithBiometric,
  isWebAuthnAvailable,
} from '../crypto/webauthn'

export default function LockScreen() {
  const { setKey } = useCryptoKey()
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [bioLoading, setBioLoading] = useState(false)
  const canUseBio = isWebAuthnAvailable() && hasBiometricCredential()

  // Auto-trigger biometric on mount if available
  useEffect(() => {
    if (canUseBio) handleBiometric()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBiometric() {
    setBioLoading(true)
    setError('')
    try {
      const key = await unlockWithBiometric()
      if (key) {
        setKey(key)
      } else {
        setError('biometric unlock cancelled — enter your passphrase')
      }
    } catch {
      setError('biometric unlock failed — enter your passphrase')
    } finally {
      setBioLoading(false)
    }
  }

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

        {/* Biometric button */}
        {canUseBio && (
          <button
            onClick={handleBiometric}
            disabled={bioLoading}
            className="w-full rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-violet-500 text-white py-4 mb-4 flex items-center justify-center gap-3 transition disabled:opacity-50"
          >
            <span className="text-2xl">{bioLoading ? '…' : '🔐'}</span>
            <span className="text-sm font-medium">
              {bioLoading ? 'checking biometrics…' : 'unlock with Face ID / fingerprint'}
            </span>
          </button>
        )}

        {/* Divider */}
        {canUseBio && (
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-zinc-600 text-xs">or</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="passphrase"
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            autoFocus={!canUseBio}
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
