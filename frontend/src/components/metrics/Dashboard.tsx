import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { metricsApi } from '../../api/client'

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface StatCardProps {
  label: string
  value: string | number
}

export default function Dashboard() {
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: metricsApi.get,
    refetchInterval: 10_000,
  })

  const { data: workersData } = useQuery({
    queryKey: ['workers'],
    queryFn: metricsApi.getWorkers,
    refetchInterval: 5_000,
  })

  if (metricsLoading) return <p style={{ color: '#6b7280' }}>Loading dashboard...</p>

  const modelData = metrics?.byModel
    ? Object.entries(metrics.byModel).map(([model, stats]) => ({
        name: model,
        requests: stats.requests,
        tokens: stats.inputTokens + stats.outputTokens,
        avgLatency: stats.avgLatencyMs,
      }))
    : []

  const pieData = modelData.map((d) => ({ name: d.name, value: d.requests }))
  const workers = workersData?.workers || []

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Dashboard</h2>

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <StatCard label="Requests (1h)" value={metrics?.lastHour?.totalRequests ?? 0} />
        <StatCard label="Requests (24h)" value={metrics?.last24h?.totalRequests ?? 0} />
        <StatCard
          label="Tokens (1h)"
          value={formatNumber(
            (metrics?.lastHour?.totalInputTokens ?? 0) +
              (metrics?.lastHour?.totalOutputTokens ?? 0),
          )}
        />
        <StatCard label="Workers Online" value={workers.filter((w) => w.healthy).length} />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 32 }}>
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 20,
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Requests by Model (24h)
          </h3>
          {modelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={modelData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="requests" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>No data yet</p>
          )}
        </div>

        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 20,
            border: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Distribution</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[pieData.indexOf(entry) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>No data yet</p>
          )}
        </div>
      </div>

      {/* Workers */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 20,
          border: '1px solid #e5e7eb',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Workers</h3>
        {workers.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>No workers connected</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {workers.map((w) => (
              <div
                key={w.publicKey}
                style={{
                  padding: 14,
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  borderLeft: `4px solid ${w.healthy ? '#10b981' : '#ef4444'}`,
                }}
              >
                <div style={{ fontFamily: 'monospace', fontSize: 13, marginBottom: 6 }}>
                  {w.publicKey.slice(0, 16)}...
                </div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Active jobs: {w.activeJobs} | Models: {w.loadedModels?.length || 0}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        padding: 20,
        borderRadius: 8,
        border: '1px solid #e5e7eb',
      }}
    >
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
