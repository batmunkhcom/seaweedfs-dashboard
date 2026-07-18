import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp, theme, Spin } from 'antd'
import { useAuthStore } from './stores/authStore'

const LoginPage = lazy(() => import('./pages/Login'))
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const ClusterPage = lazy(() => import('./pages/Cluster'))
const VolumesPage = lazy(() => import('./pages/Volumes'))
const CollectionsPage = lazy(() => import('./pages/Collections'))
const FilerPage = lazy(() => import('./pages/Filer'))
const S3BucketsPage = lazy(() => import('./pages/S3/Buckets'))
const S3UsersPage = lazy(() => import('./pages/S3/Users'))
const S3PoliciesPage = lazy(() => import('./pages/S3/Policies'))
const BackupPage = lazy(() => import('./pages/Backup'))
const WorkersPage = lazy(() => import('./pages/Workers'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const DiskHealthPage = lazy(() => import('./pages/DiskHealth'))
const UsersPage = lazy(() => import('./pages/Users'))
const HelpPage = lazy(() => import('./pages/Help'))
const GlossaryPage = lazy(() => import('./pages/Glossary'))
const AboutPage = lazy(() => import('./pages/About'))
const ApiDocPage = lazy(() => import('./pages/ApiDoc'))
const ApiKeysPage = lazy(() => import('./pages/ApiKeys'))
const ChatbotPage = lazy(() => import('./pages/Chatbot'))
const ToolsPage = lazy(() => import('./pages/Tools'))
const MetricsPage = lazy(() => import('./pages/Metrics'))
const WebhooksPage = lazy(() => import('./pages/Webhooks')
  .then(m => ({ default: m.WebhooksPage || m.default })))
const LogsPage = lazy(() => import('./pages/Logs'))
const GatewaysPage = lazy(() => import('./pages/Gateways'))
const LifecyclePage = lazy(() => import('./pages/Lifecycle'))
const AclPage = lazy(() => import('./pages/ACL'))
const TiersPage = lazy(() => import('./pages/Tiers'))
const HardeningPage = lazy(() => import('./pages/Hardening'))
const FeedbackPage = lazy(() => import('./pages/Feedback'))
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'))
const SseProviderLazy = lazy(() => import('./components/SseProvider')
  .then(m => ({ default: m.SseProvider })))

const PageLoader = () => (
  <Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 200 }} />
)

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
  if (loading) return <PageLoader />
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
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <SseProviderLazy>
                    <DashboardLayout />
                  </SseProviderLazy>
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
              <Route path="/hardening" element={<HardeningPage />} />
              <Route path="/feedback" element={<FeedbackPage />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
