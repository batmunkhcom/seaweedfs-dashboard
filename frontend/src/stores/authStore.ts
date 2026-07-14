import { create } from 'zustand'
import type { User } from '../types'
import { login as apiLogin, logout as apiLogout, getMe, getCsrfToken } from '../services/api'

interface AuthState {
  isLoggedIn: boolean
  user: User | null
  csrfToken: string
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
  refreshCsrf: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  user: null,
  csrfToken: '',
  loading: true,

  login: async (username: string, password: string) => {
    const data = await apiLogin({ username, password })
    set({
      isLoggedIn: true,
      user: data.user,
      csrfToken: data.csrfToken,
      loading: false,
    })
  },

  logout: async () => {
    try {
      await apiLogout()
    } finally {
      set({ isLoggedIn: false, user: null, csrfToken: '', loading: false })
    }
  },

  checkSession: async () => {
    try {
      const user = await getMe()
      set({ isLoggedIn: true, user, loading: false })
    } catch {
      set({ isLoggedIn: false, user: null, loading: false })
    }
  },

  refreshCsrf: async () => {
    try {
      const token = await getCsrfToken()
      set({ csrfToken: token })
    } catch {}
  },
}))
