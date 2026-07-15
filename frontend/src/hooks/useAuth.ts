import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { message } from 'antd'

export function useAuth() {
  const { isLoggedIn, user, loading, login, logout, checkSession, refreshCsrf } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      try {
        await login(username, password)
        message.success('Login successful')
        navigate('/dashboard')
      } catch (e: any) {
        const status = e?.response?.status
        if (status === 429) {
          message.warning('Too many attempts. Please wait a moment and try again.', 8)
        } else {
          const msg = e?.response?.data?.detail || 'Invalid username or password'
          message.error(msg)
        }
      }
    },
    [login, navigate]
  )

  const handleLogout = useCallback(async () => {
    await logout()
    navigate('/login')
  }, [logout, navigate])

  return {
    isLoggedIn,
    user,
    loading,
    login: handleLogin,
    logout: handleLogout,
    checkSession,
    refreshCsrf,
  }
}
