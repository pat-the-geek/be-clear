import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
  isAdmin: () => boolean
  isEditeur: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setAuth: (token, user) => set({ token, user }),

      logout: () => set({ token: null, user: null }),

      isAdmin: () => get().user?.role === 'ADMIN',

      isEditeur: () =>
        get().user?.role === 'ADMIN' || get().user?.role === 'EDITEUR',
    }),
    {
      name: 'beclear-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
)
