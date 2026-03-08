import { create } from 'zustand'

export interface SessionUser {
  id: string
  username: string
  permissions: string
  csrfToken?: string
}

interface AuthState {
  user: SessionUser | null
  loading: boolean
  setUser: (user: SessionUser | null) => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
}))
