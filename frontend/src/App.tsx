import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp, theme, Spin } from 'antd'
import { useAuthStore } from './stores/authStore'
import LoginPage from './pages/Login'
import DashboardLayout from './layouts/DashboardLayout'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isLoggedIn, user, loading } = useAuthStore()

  if (loading) return <Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 200 }} />
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function Placeholder({ title }: { title: string }) {
  return <div style={{ padding: 24 }}><h2>{title}</h2><p>Coming soon.</p></div>
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
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Placeholder title="Dashboard" />} />
            <Route path="/cluster" element={<Placeholder title="Cluster" />} />
            <Route path="/volumes" element={<Placeholder title="Volumes" />} />
            <Route path="/collections" element={<Placeholder title="Collections" />} />
            <Route path="/filer/*" element={<Placeholder title="Filer" />} />
            <Route path="/s3/buckets" element={<Placeholder title="S3 Buckets" />} />
            <Route path="/s3/users" element={<Placeholder title="S3 Users" />} />
            <Route path="/s3/policies" element={<Placeholder title="S3 Policies" />} />
            <Route path="/backup" element={<Placeholder title="Backup" />} />
            <Route path="/workers" element={<Placeholder title="Workers" />} />
            <Route path="/settings" element={<Placeholder title="Settings" />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
