import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp, theme, Spin } from 'antd'
import { useAuthStore } from './stores/authStore'
import LoginPage from './pages/Login'
import DashboardPage from './pages/Dashboard'
import ClusterPage from './pages/Cluster'
import VolumesPage from './pages/Volumes'
import CollectionsPage from './pages/Collections'
import FilerPage from './pages/Filer'
import S3BucketsPage from './pages/S3/Buckets'
import S3UsersPage from './pages/S3/Users'
import S3PoliciesPage from './pages/S3/Policies'
import BackupPage from './pages/Backup'
import WorkersPage from './pages/Workers'
import SettingsPage from './pages/Settings'
import DashboardLayout from './layouts/DashboardLayout'
import { SseProvider } from './components/SseProvider'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isLoggedIn, user, loading } = useAuthStore()

  if (loading) return <Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 200 }} />
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
            element={
              <ProtectedRoute>
                <SseProvider>
                  <DashboardLayout />
                </SseProvider>
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/cluster" element={<ClusterPage />} />
            <Route path="/volumes" element={<VolumesPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/filer/*" element={<FilerPage />} />
            <Route path="/s3/buckets" element={<S3BucketsPage />} />
            <Route path="/s3/users" element={<S3UsersPage />} />
            <Route path="/s3/policies" element={<S3PoliciesPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/workers" element={<WorkersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
