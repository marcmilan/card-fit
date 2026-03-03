import './index.css'
import { CryptoKeyProvider, useCryptoKey } from './context/CryptoKeyContext'
import { hasSalt } from './crypto'
import LockScreen from './components/LockScreen'
import Dashboard from './components/Dashboard'
import Onboarding from './components/Onboarding'

function AppContent() {
  const { cryptoKey } = useCryptoKey()

  // First launch: no salt means no vault set up yet
  if (!hasSalt()) {
    return <Onboarding />
  }

  // Returning user, vault locked
  if (!cryptoKey) {
    return <LockScreen />
  }

  return <Dashboard />
}

export default function App() {
  return (
    <CryptoKeyProvider>
      <AppContent />
    </CryptoKeyProvider>
  )
}
