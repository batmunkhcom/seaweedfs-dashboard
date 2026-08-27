import { create } from 'zustand'
import type { User } from '../types'
import { login as apiLogin, logout as apiLogout, getMe, getCsrfToken } from '../services/api'

const SESSION_KEY = 'seaweedfs_session'

function loadSession(): { user: User | null; csrfToken: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSession(user: User | null, csrfToken: string) {
  try {
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user, csrfToken }))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch {}
}

const cached = loadSession()

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
  isLoggedIn: !!cached?.user,
  user: cached?.user || null,
  csrfToken: cached?.csrfToken || '',
  loading: !cached?.user,

  login: async (username: string, password: string) => {
    set({ loading: true })
    try {
      const data = await apiLogin({ username, password })
      saveSession(data.user, data.csrfToken)
      set({
        isLoggedIn: true,
        user: data.user,
        csrfToken: data.csrfToken,
        loading: false,
      })
    } catch {
      set({ loading: false })
      throw new Error('Login failed')
    }
  },

  logout: async () => {
    saveSession(null, '')
    set({ isLoggedIn: false, user: null, csrfToken: '', loading: false })
    try { await apiLogout() } catch { /* session already dead */ }
  },

  checkSession: async () => {
    try {
      const user = await getMe()
      set({ isLoggedIn: true, user, loading: false })
      try {
        const token = await getCsrfToken()
        saveSession(user, token)
        set({ csrfToken: token })
      } catch {
        saveSession(user, '')
      }
    } catch {
      saveSession(null, '')
      set({ isLoggedIn: false, user: null, csrfToken: '', loading: false })
    }
  },

  refreshCsrf: async () => {
    try {
      const token = await getCsrfToken()
      const current = useAuthStore.getState().user
      saveSession(current, token)
      set({ csrfToken: token })
    } catch {}
  },
}))
