import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { authApi } from './api/client'
import DeploymentsPage from './components/deployments/DeploymentsPage'
import PlaygroundPage from './components/inference/PlaygroundPage'
import ApiKeysPage from './components/keys/ApiKeysPage'
import Dashboard from './components/metrics/Dashboard'
import { useAuthStore } from './stores/auth'

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
            gap: 16,
          }}
        >
          <p style={{ fontSize: 18, color: '#374151' }}>Something went wrong</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              fontSize: 14,
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/keys', label: 'API Keys' },
  { to: '/deployments', label: 'Deployments' },
  { to: '/playground', label: 'Playground' },
]

const isLocalhost =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

function LoginForm() {
  const setUser = useAuthStore((s) => s.setUser)
  const [username, setUsername] = useState(isLocalhost ? 'admin' : '')
  const [password, setPassword] = useState(isLocalhost ? 'admin' : '')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await authApi.login(username, password)
      setUser(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f9fafb',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: 'white',
          padding: 40,
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          width: 360,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>AI PaaS</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>Sign in to your account</p>
        {error && (
          <div
            style={{
              padding: 10,
              backgroundColor: '#fef2f2',
              color: '#991b1b',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="username"
            style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label
            htmlFor="password"
            style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}
          >
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '8px 36px 8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                color: '#6b7280',
              }}
            >
              {showPassword ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>Hide password</title>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>Show password</title>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || !username || !password}
          style={{
            width: '100%',
            padding: '10px 16px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 500,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export default function App() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const setUser = useAuthStore((s) => s.setUser)

  // Check for existing session on mount
  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
  }, [setUser])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, sans-serif',
          color: '#6b7280',
        }}
      >
        Loading...
      </div>
    )
  }

  if (!user) return <LoginForm />

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Clear local state regardless of server error
    } finally {
      setUser(null)
    }
  }

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
          <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 8 }}>{user.username}</div>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '6px 12px',
              fontSize: 13,
              backgroundColor: 'transparent',
              color: '#9ca3af',
              border: '1px solid #374151',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: 32, backgroundColor: '#f9fafb' }}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/keys" element={<ApiKeysPage />} />
            <Route path="/deployments" element={<DeploymentsPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}
