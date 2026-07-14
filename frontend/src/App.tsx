import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp, theme, Spin } from 'antd'
import { useAuthStore } from './stores/authStore'
import LoginPage from './pages/Login'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isLoggedIn, user, loading } = useAuthStore()

  if (loading) {
    return <Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 200 }} />
  }
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function App() {
  const { checkSession, refreshCsrf } = useAuthStore()

  useEffect(() => {
    checkSession().then(() => refreshCsrf())
  }, [])

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <AntApp>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
