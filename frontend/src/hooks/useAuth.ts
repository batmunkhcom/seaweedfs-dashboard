import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { message } from 'antd'

export function useAuth() {
  const { isLoggedIn, user, loading, login, logout, checkSession, refreshCsrf } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = useCallback(
    async (username: string, password: string, setError?: (msg: string) => void) => {
      try {
        await login(username, password)
        message.success('Login successful')
        navigate('/dashboard')
       } catch (e: any) {
         const status = e?.response?.status
         if (status === 429) {
           const msg = 'Too many attempts. Please wait a moment and try again.'
           setError ? setError(msg) : message.warning(msg, 8)
           } else if (status === 401) {
           const msg = 'Invalid username or password'
           setError ? setError(msg) : message.error(msg)
           } else if (e?.request && !e.response) {
           const msg = 'Cannot connect to server. Please check your connection.'
           setError ? setError(msg) : message.error(msg)
           } else {
           const msg = e?.response?.data?.detail || e?.message || 'Login failed'
           setError ? setError(msg) : message.error(msg)
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
