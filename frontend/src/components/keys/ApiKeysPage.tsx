import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { keysApi } from '../../api/client'
import { useKeysStore } from '../../stores/keys'

export default function ApiKeysPage() {
  const queryClient = useQueryClient()
  const { data: keys, isLoading } = useQuery({ queryKey: ['keys'], queryFn: keysApi.list })
  const { newKeyValue, showKeyModal, setNewKey, clearNewKey } = useKeysStore()
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)

  const createMutation = useMutation({
    mutationFn: keysApi.create,
    onSuccess: (data) => {
      setNewKey(data.key)
      setName('')
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: keysApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keys'] }),
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createMutation.mutate({ name: name.trim() })
  }

  const handleCopy = async () => {
    if (newKeyValue) {
      await navigator.clipboard.writeText(newKeyValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>API Keys</h2>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g., production, testing)"
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          style={{
            padding: '8px 20px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          {createMutation.isPending ? 'Creating...' : 'Create Key'}
        </button>
      </form>

      {createMutation.isError && (
        <div
          style={{
            padding: 12,
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {createMutation.error.message}
        </div>
      )}

      {showKeyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: 32,
              borderRadius: 12,
              maxWidth: 560,
              width: '100%',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Your API Key</h3>
            <p style={{ color: '#dc2626', fontSize: 14, marginBottom: 16 }}>
              Copy this key now. You won't be able to see it again.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <code
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: 6,
                  fontSize: 13,
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                }}
              >
                {newKeyValue}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  padding: '8px 16px',
                  backgroundColor: copied ? '#16a34a' : '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                clearNewKey()
                setCopied(false)
              }}
              style={{
                width: '100%',
                padding: 10,
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              I've saved my key
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: '#6b7280' }}>Loading...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px', fontSize: 13, color: '#6b7280' }}>Name</th>
              <th style={{ padding: '8px 12px', fontSize: 13, color: '#6b7280' }}>Key</th>
              <th style={{ padding: '8px 12px', fontSize: 13, color: '#6b7280' }}>Created</th>
              <th style={{ padding: '8px 12px', fontSize: 13, color: '#6b7280' }}>Last Used</th>
              <th style={{ padding: '8px 12px', fontSize: 13, color: '#6b7280' }} />
            </tr>
          </thead>
          <tbody>
            {keys?.map((key) => (
              <tr key={key.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '10px 12px', fontSize: 14 }}>{key.name}</td>
                <td style={{ padding: '10px 12px', fontSize: 14 }}>
                  <code style={{ fontFamily: 'monospace', color: '#6b7280' }}>
                    {key.prefix}
                    {'••••••••'}
                  </code>
                </td>
                <td style={{ padding: '10px 12px', fontSize: 14, color: '#6b7280' }}>
                  {new Date(key.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 14, color: '#6b7280' }}>
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Delete this key?')) deleteMutation.mutate(key.id)
                    }}
                    style={{
                      padding: '4px 12px',
                      color: '#dc2626',
                      background: 'none',
                      border: '1px solid #dc2626',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {keys?.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                  No API keys yet. Create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
