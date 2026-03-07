import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
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

const LOG_LIMIT_OPTIONS = [100, 500, 1000]

interface Deployment {
  id: string
  model: string
  status: string
  createdAt: number
}

interface ModelGroup {
  model: string
  deployments: Deployment[]
  latestCreatedAt: number
}

function groupByModel(deployments: Deployment[]): ModelGroup[] {
  const map = new Map<string, Deployment[]>()
  for (const dep of deployments) {
    const list = map.get(dep.model) ?? []
    list.push(dep)
    map.set(dep.model, list)
  }
  return [...map.entries()]
    .map(([model, deps]) => {
      const sorted = deps.sort((a, b) => b.createdAt - a.createdAt)
      return { model, deployments: sorted, latestCreatedAt: sorted[0]?.createdAt ?? 0 }
    })
    .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt)
}

function LogPanel({ deploymentId }: { deploymentId: string }) {
  const { logs, logLimit, setLogLimit } = useDeploymentsStore()
  const [reversed, setReversed] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const entries = logs[deploymentId] || []

  const displayedLogs = reversed ? [...entries].reverse() : entries

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new entries only
  useEffect(() => {
    if (autoScroll && !reversed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries.length, autoScroll, reversed])

  return (
    <div style={{ padding: '0 16px 12px', backgroundColor: '#111827' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 0 6px',
          borderBottom: '1px solid #1f2937',
          marginBottom: 4,
        }}
      >
        <button
          type="button"
          onClick={() => setReversed((r) => !r)}
          style={{
            padding: '2px 8px',
            fontSize: 11,
            color: reversed ? '#60a5fa' : '#9ca3af',
            border: '1px solid #374151',
            borderRadius: 4,
            cursor: 'pointer',
            background: reversed ? '#1e3a5f' : 'transparent',
          }}
        >
          {reversed ? 'Newest first' : 'Oldest first'}
        </button>
        <button
          type="button"
          onClick={() => setAutoScroll((a) => !a)}
          style={{
            padding: '2px 8px',
            fontSize: 11,
            color: autoScroll ? '#10b981' : '#9ca3af',
            border: '1px solid #374151',
            borderRadius: 4,
            cursor: 'pointer',
            background: autoScroll ? '#064e3b' : 'transparent',
          }}
        >
          Auto-scroll: {autoScroll ? 'on' : 'off'}
        </button>
        <select
          value={logLimit}
          onChange={(e) => setLogLimit(Number(e.target.value))}
          style={{
            padding: '2px 6px',
            fontSize: 11,
            color: '#9ca3af',
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {LOG_LIMIT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} lines
            </option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: '#4b5563', marginLeft: 'auto' }}>
          {entries.length} logs
        </span>
      </div>
      <div
        ref={scrollRef}
        style={{
          maxHeight: 200,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        {displayedLogs.map((log, i) => (
          <div
            key={`${log.timestamp}-${i}`}
            style={{
              color:
                log.type === 'error' ? '#ef4444' : log.type === 'progress' ? '#60a5fa' : '#10b981',
              marginBottom: 4,
            }}
          >
            [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
          </div>
        ))}
        {entries.length === 0 && <div style={{ color: '#6b7280' }}>Waiting for logs...</div>}
      </div>
    </div>
  )
}

export default function DeploymentsPage() {
  const queryClient = useQueryClient()
  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: deploymentsApi.list,
    refetchInterval: 5000,
  })
  const { activeLogId, setActiveLog, appendLog, clearLogs } = useDeploymentsStore()
  const [model, setModel] = useState('')
  const [verbose, setVerbose] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const groups = useMemo(() => groupByModel(deployments ?? []), [deployments])

  const toggleGroup = (modelName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(modelName)) next.delete(modelName)
      else next.add(modelName)
      return next
    })
  }

  useSSE<LogEvent>(
    activeLogId ? deploymentsApi.logsUrl(activeLogId) : null,
    (event) => {
      if (activeLogId) appendLog(activeLogId, event)
    },
    !!activeLogId,
    () => {
      // SSE done — server closed connection (terminal state reached)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
    },
  )

  const [createError, setCreateError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: deploymentsApi.create,
    onSuccess: (data) => {
      setModel('')
      setCreateError(null)
      setActiveLog(data.id)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
    },
    onError: (err: Error & { details?: { message?: string } }) => {
      setCreateError(err.details?.message || err.message)
    },
  })

  const [actionError, setActionError] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: deploymentsApi.remove,
    onSuccess: (_data, deletedId) => {
      clearLogs(deletedId)
      if (activeLogId === deletedId) setActiveLog(null)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
    },
    onError: (err: Error) => {
      setActionError(`Delete failed: ${err.message}`)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: deploymentsApi.cancel,
    onSuccess: (_data, cancelledId) => {
      if (activeLogId === cancelledId) setActiveLog(null)
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
    },
    onError: (err: Error) => {
      setActionError(`Cancel failed: ${err.message}`)
    },
  })

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault()
    if (!model.trim()) return
    createMutation.mutate({ model: model.trim(), verbose })
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
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: '#374151',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <input type="checkbox" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} />
          Verbose logs
        </label>
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

      {createError && (
        <p style={{ color: '#dc2626', fontSize: 14, margin: '-16px 0 16px' }}>{createError}</p>
      )}

      {actionError && (
        <p style={{ color: '#dc2626', fontSize: 14, margin: '-16px 0 16px' }}>{actionError}</p>
      )}

      {isLoading ? (
        <p style={{ color: '#6b7280' }}>Loading...</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.model)
            const readyCount = group.deployments.filter((d) => d.status === 'ready').length
            const totalCount = group.deployments.length
            return (
              <div
                key={group.model}
                style={{
                  backgroundColor: 'white',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.model)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: '#f9fafb',
                    border: 'none',
                    borderBottom: isCollapsed ? 'none' : '1px solid #e5e7eb',
                    cursor: 'pointer',
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  <span>
                    <span style={{ marginRight: 8 }}>{isCollapsed ? '▸' : '▾'}</span>
                    {group.model}
                    <span
                      style={{
                        marginLeft: 12,
                        fontSize: 12,
                        fontWeight: 400,
                        color: '#6b7280',
                      }}
                    >
                      {readyCount}/{totalCount} ready
                    </span>
                  </span>
                </button>

                {!isCollapsed && (
                  <div style={{ display: 'grid', gap: 0 }}>
                    {group.deployments.map((dep) => {
                      const isExpanded = activeLogId === dep.id
                      return (
                        <div key={dep.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <button
                            type="button"
                            onClick={() => setActiveLog(isExpanded ? null : dep.id)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 16px',
                              cursor: 'pointer',
                              background: isExpanded ? '#f0f7ff' : 'transparent',
                              border: 'none',
                              fontSize: 'inherit',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                                {isExpanded ? '▾' : '▸'}
                              </span>
                              <span
                                style={{
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
                              <span style={{ fontSize: 13, color: '#6b7280' }}>
                                {new Date(dep.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div
                              style={{ display: 'flex', gap: 8 }}
                              role="presentation"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
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
                                  if (confirm('Delete this deployment?'))
                                    deleteMutation.mutate(dep.id)
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
                          </button>

                          {isExpanded && <LogPanel deploymentId={dep.id} />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {groups.length === 0 && (
            <p style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>
              No deployments yet. Deploy a model above.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
