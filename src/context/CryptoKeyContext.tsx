import { createContext, useContext, useState, type ReactNode } from 'react'

interface CryptoKeyContextValue {
  cryptoKey: CryptoKey | null
  setKey: (key: CryptoKey) => void
  lock: () => void
}

const CryptoKeyContext = createContext<CryptoKeyContextValue | null>(null)

export function CryptoKeyProvider({ children }: { children: ReactNode }) {
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null)

  function setKey(key: CryptoKey) {
    setCryptoKey(key)
  }

  function lock() {
    setCryptoKey(null)
  }

  return (
    <CryptoKeyContext.Provider value={{ cryptoKey, setKey, lock }}>
      {children}
    </CryptoKeyContext.Provider>
  )
}

export function useCryptoKey(): CryptoKeyContextValue {
  const ctx = useContext(CryptoKeyContext)
  if (!ctx) throw new Error('useCryptoKey must be used inside CryptoKeyProvider')
  return ctx
}
