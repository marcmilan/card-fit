import './index.css'
import { CryptoKeyProvider, useCryptoKey } from './context/CryptoKeyContext'
import LockScreen from './components/LockScreen'
import Dashboard from './components/Dashboard'

function AppContent() {
  const { cryptoKey } = useCryptoKey()
  return cryptoKey ? <Dashboard /> : <LockScreen />
}

export default function App() {
  return (
    <CryptoKeyProvider>
      <AppContent />
    </CryptoKeyProvider>
  )
}
