import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

let csrfToken = ''

export function setCsrfToken(token: string) {
  csrfToken = token
}

api.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem('backup_api_key')
  if (apiKey && config.url?.includes('/backup/')) {
    config.headers['X-API-Key'] = apiKey
  }
  if (csrfToken && config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      if (!url.includes('/auth/logout') && !url.includes('/auth/me') && !url.includes('/auth/login')) {
        import('../stores/authStore').then(({ useAuthStore }) => {
          useAuthStore.getState().logout()
        })
      }
    }
    return Promise.reject(error)
  }
)

export default api

export {
  healthCheck,
  login,
  logout,
  getMe,
  getCsrfToken,
  refreshCsrfToken,
  getClusterStatus,
  getClusterHealth,
  getNodeLimits,
  updateNodeLimits,
  getTopology,
  getVolumes,
  getVolumesStats,
  getVolume,
  growVolumes,
  vacuumVolumes,
  getCollections,
  deleteCollection,
  listFiler,
  createFilerDir,
  deleteFilerEntry,
  uploadFilerFile,
  getS3Buckets,
  createS3Bucket,
  deleteS3Bucket,
  getS3Users,
  createS3User,
  deleteS3User,
  generateS3Key,
  getS3Policies,
  updateS3Policy,
  triggerSync,
  getSyncStatus,
  getBackupStatus,
  triggerBackupSync,
  listSnapshots,
  getSnapshots,
  createSnapshot,
  deleteSnapshot,
  restoreBackup,
  getWorkerStatus,
  getWorkerJobs,
  listWorkerJobs,
  getWorkerJob,
  getJobTypes,
  getNodeVolumes,
  triggerWorkerDetect,
  triggerWorkerExecute,
  getDashboardStats,
  getDiskUsage,
  getKpiExtras,
  getAlerts,
  acknowledgeAlert,
  getAlertConfig,
  updateAlertConfig,
  getDashboardHistory,
  getDiskHealthStatus,
  getDiskHealthDetail,
  getDiskHealthHistory,
} from './apiData'

export {
  getSettings,
  updateSettings,
  changeMyPassword,
  getMyProfile,
  updateMyProfile,
  createMyBucket,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  createApiKey,
  listApiKeys,
  getApiKeyDetail,
  revealApiKey,
  revokeApiKey,
  getChatbotStatus,
  testAiConnection,
  getAiStats,
  triggerEmbeddingIndex,
  pingNodes,
  serviceCheck,
  getMetricsOverview,
  getMetricsNode,
  getMetricsNodes,
  getMetricsHistory,
  getMetricsAlive,
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  toggleWebhook,
  getWebhookHistory,
  getWebhookDeliveryDetail,
  getWebhookTemplates,
  getLokiStatus,
  queryLokiLogs,
  getLokiLabels,
  getLokiLabelValues,
  getGateways,
  startWebdav,
  stopWebdav,
  testWebdavConnection,
  mountFuse,
  unmountFuse,
  getFuseStatus,
  getNfsExports,
  createNfsExport,
  updateNfsExport,
  deleteNfsExport,
  getNfsClients,
  syncNfsExports,
  getLifecyclePolicies,
  getLifecyclePolicy,
  saveLifecyclePolicy,
  deleteLifecyclePolicy,
  getCollectionsTtl,
  setCollectionTtl,
  getLifecycleTransitions,
  getLifecycleTemplates,
  getAclPolicies,
  createAclPolicy,
  updateAclPolicy,
  deleteAclPolicy,
  reorderAclPolicies,
  testAclPermission,
  getAclAuditLog,
  syncAclToFiler,
  getAclSyncStatus,
  getTiers,
  getTierStats,
  saveTier,
  deleteTier,
  testTierConnection,
  syncTiers,
  getChecksumHistory,
  getHardeningStatus,
  updateHardening,
  triggerChecksum,
  deployCompression,
  deployEncryption,
  checkReplicationDrift,
  getFilerList,
  getFeatureRequests,
  getFeatureRequest,
  createFeatureRequest,
  voteFeatureRequest,
  unvoteFeatureRequest,
  updateFeatureStatus,
  addFeatureComment,
} from './apiAdmin'
