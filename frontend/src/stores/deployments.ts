import { create } from 'zustand'

export interface LogEvent {
  type: string
  message: string
  timestamp: string
}

interface DeploymentsState {
  activeLogId: string | null
  logs: Record<string, LogEvent[]>
  logLimit: number
  setActiveLog: (id: string | null) => void
  appendLog: (deploymentId: string, event: LogEvent) => void
  clearLogs: (deploymentId: string) => void
  setLogLimit: (limit: number) => void
}

export const useDeploymentsStore = create<DeploymentsState>((set, get) => ({
  activeLogId: null,
  logs: {},
  logLimit: 500,

  setActiveLog: (id) => set({ activeLogId: id }),

  appendLog: (deploymentId, event) => {
    const limit = get().logLimit
    set((state) => {
      const existing = state.logs[deploymentId] || []
      const updated = [...existing, event]
      return {
        logs: {
          ...state.logs,
          [deploymentId]: updated.length > limit ? updated.slice(-limit) : updated,
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
