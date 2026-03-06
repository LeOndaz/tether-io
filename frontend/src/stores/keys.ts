import { create } from 'zustand'

interface KeysState {
  newKeyValue: string | null
  showKeyModal: boolean
  setNewKey: (key: string) => void
  clearNewKey: () => void
}

export const useKeysStore = create<KeysState>((set) => ({
  newKeyValue: null,
  showKeyModal: false,

  setNewKey: (key) => set({ newKeyValue: key, showKeyModal: true }),
  clearNewKey: () => set({ newKeyValue: null, showKeyModal: false }),
}))
