import { create } from 'zustand'

export interface LogEvent {
  type: string
  message: string
  timestamp: string
}

interface DeploymentsState {
  activeLogId: string | null
  logs: Record<string, LogEvent[]>
  setActiveLog: (id: string | null) => void
  appendLog: (deploymentId: string, event: LogEvent) => void
  clearLogs: (deploymentId: string) => void
}

export const useDeploymentsStore = create<DeploymentsState>((set) => ({
  activeLogId: null,
  logs: {},

  setActiveLog: (id) => set({ activeLogId: id }),

  appendLog: (deploymentId, event) =>
    set((state) => ({
      logs: {
        ...state.logs,
        [deploymentId]: [...(state.logs[deploymentId] || []), event],
      },
    })),

  clearLogs: (deploymentId) =>
    set((state) => {
      const next = { ...state.logs }
      delete next[deploymentId]
      return { logs: next }
    }),
}))
