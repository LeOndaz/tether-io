import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  apiKey: string | null
  setApiKey: (key: string) => void
  clearApiKey: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      apiKey: null,
      setApiKey: (key) => set({ apiKey: key }),
      clearApiKey: () => set({ apiKey: null }),
    }),
    { name: 'ai-paas-auth' },
  ),
)

/** Returns the current API key without subscribing to React updates. */
export function getApiKey(): string | null {
  return useAuthStore.getState().apiKey
}
