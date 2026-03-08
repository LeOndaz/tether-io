import { NavLink, Route, Routes } from 'react-router-dom'
import DeploymentsPage from './components/deployments/DeploymentsPage'
import PlaygroundPage from './components/inference/PlaygroundPage'
import ApiKeysPage from './components/keys/ApiKeysPage'
import Dashboard from './components/metrics/Dashboard'
import { useAuthStore } from './stores/auth'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/keys', label: 'API Keys' },
  { to: '/deployments', label: 'Deployments' },
  { to: '/playground', label: 'Playground' },
]

export default function App() {
  const apiKey = useAuthStore((s) => s.apiKey)
  const setApiKey = useAuthStore((s) => s.setApiKey)
  const clearApiKey = useAuthStore((s) => s.clearApiKey)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <nav
        style={{
          width: 220,
          backgroundColor: '#111827',
          color: '#f9fafb',
          padding: '24px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, padding: '0 20px', marginBottom: 32 }}>
          AI PaaS
        </h1>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'block',
              padding: '10px 20px',
              color: isActive ? '#60a5fa' : '#9ca3af',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              backgroundColor: isActive ? '#1f2937' : 'transparent',
              borderLeft: isActive ? '3px solid #60a5fa' : '3px solid transparent',
            })}
          >
            {item.label}
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #374151' }}>
          <label
            htmlFor="global-api-key"
            style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 6 }}
          >
            API Key
          </label>
          <input
            id="global-api-key"
            type="password"
            value={apiKey || ''}
            onChange={(e) => (e.target.value ? setApiKey(e.target.value) : clearApiKey())}
            placeholder="sk-..."
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 12,
              fontFamily: 'monospace',
              border: '1px solid #374151',
              borderRadius: 4,
              backgroundColor: '#1f2937',
              color: '#f9fafb',
              boxSizing: 'border-box',
            }}
          />
          {apiKey && (
            <div
              style={{
                fontSize: 11,
                color: '#34d399',
                marginTop: 4,
              }}
            >
              {apiKey.slice(0, 7)}...
            </div>
          )}
        </div>
      </nav>
      <main style={{ flex: 1, padding: 32, backgroundColor: '#f9fafb' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/keys" element={<ApiKeysPage />} />
          <Route path="/deployments" element={<DeploymentsPage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
        </Routes>
      </main>
    </div>
  )
}
