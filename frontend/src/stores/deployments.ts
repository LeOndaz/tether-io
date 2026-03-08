import { create } from 'zustand'

export interface LogEvent {
  type: string
  message: string
  timestamp: number
}

/** Hard cap on in-memory log entries per deployment */
const MAX_BUFFER = 1000

interface DeploymentsState {
  activeLogId: string | null
  logs: Record<string, LogEvent[]>
  /** Controls how many entries are displayed — buffer always keeps up to MAX_BUFFER */
  logLimit: number
  setActiveLog: (id: string | null) => void
  appendLog: (deploymentId: string, event: LogEvent) => void
  clearLogs: (deploymentId: string) => void
  setLogLimit: (limit: number) => void
}

export const useDeploymentsStore = create<DeploymentsState>((set) => ({
  activeLogId: null,
  logs: {},
  logLimit: 500,

  setActiveLog: (id) => set({ activeLogId: id }),

  appendLog: (deploymentId, event) => {
    set((state) => {
      const existing = state.logs[deploymentId] || []
      const updated = [...existing, event]
      return {
        logs: {
          ...state.logs,
          [deploymentId]: updated.length > MAX_BUFFER ? updated.slice(-MAX_BUFFER) : updated,
        },
      }
    })
  },

  clearLogs: (deploymentId) =>
    set((state) => {
      const next = { ...state.logs }
      delete next[deploymentId]
      return { logs: next }
    }),

  setLogLimit: (limit) => set({ logLimit: limit }),
}))
