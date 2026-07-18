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
import DiskHealthPage from './pages/DiskHealth'
import UsersPage from './pages/Users'
import HelpPage from './pages/Help'
import GlossaryPage from './pages/Glossary'
import AboutPage from './pages/About'
import ApiDocPage from './pages/ApiDoc'
import ApiKeysPage from './pages/ApiKeys'
import ChatbotPage from './pages/Chatbot'
import ToolsPage from './pages/Tools'
import MetricsPage from './pages/Metrics'
import WebhooksPage from './pages/Webhooks'
import LogsPage from './pages/Logs'
import GatewaysPage from './pages/Gateways'
import LifecyclePage from './pages/Lifecycle'
import AclPage from './pages/ACL'
import TiersPage from './pages/Tiers'
import DashboardLayout from './layouts/DashboardLayout'
import { SseProvider } from './components/SseProvider'

const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#a855f7',
    colorSuccess: '#22c55e',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    borderRadius: 8,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
}

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
    <ConfigProvider theme={darkTheme}>
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
            <Route path="/s3/secrets" element={<S3UsersPage />} />
            <Route path="/s3/policies" element={<S3PoliciesPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/workers" element={<WorkersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/disk-health" element={<DiskHealthPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/glossary" element={<GlossaryPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/api-doc" element={<ApiDocPage />} />
            <Route path="/api-keys" element={<ApiKeysPage />} />
            <Route path="/chatbot" element={<ChatbotPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/metrics" element={<MetricsPage />} />
            <Route path="/webhooks" element={<WebhooksPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/gateways" element={<GatewaysPage />} />
            <Route path="/lifecycle" element={<LifecyclePage />} />
            <Route path="/acl" element={<AclPage />} />
            <Route path="/tiers" element={<TiersPage />} />
            </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
