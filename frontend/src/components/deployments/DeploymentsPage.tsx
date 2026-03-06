import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { deploymentsApi } from '../../api/client'
import { useSSE } from '../../hooks/useSSE'
import { type LogEvent, useDeploymentsStore } from '../../stores/deployments'

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  pulling: '#3b82f6',
  ready: '#10b981',
  failed: '#ef4444',
  removing: '#6b7280',
}

export default function DeploymentsPage() {
  const queryClient = useQueryClient()
  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: deploymentsApi.list,
    refetchInterval: 5000,
  })
  const { activeLogId, logs, setActiveLog, appendLog } = useDeploymentsStore()
  const [model, setModel] = useState('')

  useSSE<LogEvent>(
    activeLogId ? deploymentsApi.logsUrl(activeLogId) : null,
    (event) => {
      if (activeLogId) appendLog(activeLogId, event)
    },
    !!activeLogId,
  )

  const createMutation = useMutation({
    mutationFn: deploymentsApi.create,
    onSuccess: (data) => {
      setModel('')
      setActiveLog(data.id)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deploymentsApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployments'] }),
  })

  const cancelMutation = useMutation({
    mutationFn: deploymentsApi.cancel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployments'] }),
  })

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault()
    if (!model.trim()) return
    createMutation.mutate({ model: model.trim() })
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Model Deployments</h2>

      <form onSubmit={handleDeploy} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Model name (e.g., llama3.2:1b, mistral)"
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
          {createMutation.isPending ? 'Deploying...' : 'Deploy Model'}
        </button>
      </form>

      {isLoading ? (
        <p style={{ color: '#6b7280' }}>Loading...</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {deployments?.map((dep) => (
            <div
              key={dep.id}
              style={{
                padding: 16,
                backgroundColor: 'white',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{dep.model}</span>
                  <span
                    style={{
                      marginLeft: 12,
                      padding: '2px 10px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: STATUS_COLORS[dep.status] || '#6b7280',
                    }}
                  >
                    {dep.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setActiveLog(activeLogId === dep.id ? null : dep.id)}
                    style={{
                      padding: '4px 12px',
                      fontSize: 13,
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: activeLogId === dep.id ? '#dbeafe' : 'white',
                    }}
                  >
                    {activeLogId === dep.id ? 'Hide Logs' : 'Logs'}
                  </button>
                  {(dep.status === 'pending' || dep.status === 'pulling') && (
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate(dep.id)}
                      style={{
                        padding: '4px 12px',
                        fontSize: 13,
                        color: '#f59e0b',
                        border: '1px solid #f59e0b',
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: 'none',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Delete this deployment?')) deleteMutation.mutate(dep.id)
                    }}
                    style={{
                      padding: '4px 12px',
                      fontSize: 13,
                      color: '#dc2626',
                      border: '1px solid #dc2626',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: 'none',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Created: {new Date(dep.createdAt).toLocaleString()}
              </div>

              {activeLogId === dep.id && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    backgroundColor: '#111827',
                    borderRadius: 6,
                    maxHeight: 200,
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    fontSize: 12,
                  }}
                >
                  {(logs[dep.id] || []).map((log) => (
                    <div
                      key={log.timestamp}
                      style={{
                        color: log.type === 'error' ? '#ef4444' : '#10b981',
                        marginBottom: 4,
                      }}
                    >
                      [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                    </div>
                  ))}
                  {(!logs[dep.id] || logs[dep.id]?.length === 0) && (
                    <div style={{ color: '#6b7280' }}>Waiting for logs...</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {deployments?.length === 0 && (
            <p style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>
              No deployments yet. Deploy a model above.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
