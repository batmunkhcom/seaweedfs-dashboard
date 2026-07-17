import axios from 'axios'
import type {
  ClusterStatus,
  Topology,
  Volume,
  VolumeDetail,
  Collection,
  FilerListResponse,
  S3Bucket,
  S3User,
  S3Policy,
  BackupStatus,
  Snapshot,
  WorkerStatus,
  WorkerJob,
  DashboardStats,
  AlertEvent,
  AlertConfig,
  LoginRequest,
  LoginResponse,
  User,
} from '../types'

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

export async function healthCheck() {
  const { data } = await api.get('/health')
  return data
}

export async function login(req: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post('/auth/login', req)
  setCsrfToken(data.csrfToken)
  return data
}

export async function logout() {
  await api.post('/auth/logout')
  setCsrfToken('')
}

export async function getMe(): Promise<User> {
  const { data } = await api.get('/auth/me')
  return data
}

export async function getCsrfToken() {
  const { data } = await api.get('/auth/csrf-token')
  setCsrfToken(data.token)
  return data.token
}

export async function refreshCsrfToken(): Promise<string> {
  try {
    return await getCsrfToken()
  } catch {
    return ''
  }
}

export async function getClusterStatus(): Promise<ClusterStatus> {
  const { data } = await api.get('/cluster/status')
  return data
}

export async function getClusterHealth() {
  const { data } = await api.get('/cluster/health')
  return data
}

export async function getNodeLimits() {
  const { data } = await api.get('/cluster/node-limits')
  return data
}

export async function updateNodeLimits(limits: Record<string, number>) {
  const { data } = await api.put('/cluster/node-limits', { limits })
  return data
}

export async function getTopology(): Promise<Topology> {
  const { data } = await api.get('/cluster/topology')
  return data
}

export async function getVolumes(params?: Record<string, string>): Promise<{ volumes: Volume[]; total: number }> {
  const { data } = await api.get('/volumes', { params })
  return { volumes: Array.isArray(data?.volumes) ? data.volumes : [], total: data?.total || 0 }
}

export async function getVolumesStats() {
  const { data } = await api.get('/volumes/stats', { headers: { 'Cache-Control': 'no-store' }, params: { _t: Date.now() } })
  return data
}

export async function getVolume(id: number): Promise<VolumeDetail> {
  const { data } = await api.get(`/volumes/${id}`)
  return data
}

export async function growVolumes(body: Record<string, unknown>) {
  const { data } = await api.post('/volumes/grow', body)
  return data
}

export async function vacuumVolumes(body: Record<string, unknown>) {
  const { data } = await api.post('/volumes/vacuum', body)
  return data
}

export async function getCollections(): Promise<Collection[]> {
  const { data } = await api.get('/collections')
  return Array.isArray(data) ? data : []
}

export async function deleteCollection(name: string) {
  await api.delete(`/collections/${encodeURIComponent(name)}`)
}

export async function listFiler(path: string, page = 1, pageSize = 50): Promise<FilerListResponse> {
  const { data } = await api.get(`/filer/list/${encodeURIComponent(path)}`, {
    params: { page, pageSize },
  })
  return { entries: Array.isArray(data?.entries) ? data.entries : [], path: data?.path || path, total: data?.total || 0, page: data?.page || page, pageSize: data?.pageSize || pageSize }
}

export async function createFilerDir(path: string) {
  await api.post(`/filer/mkdir/${encodeURIComponent(path)}`)
}

export async function deleteFilerEntry(path: string) {
  await api.delete(`/filer/delete/${encodeURIComponent(path)}`)
}

export async function uploadFilerFile(path: string, formData: FormData) {
  const { data } = await api.post(`/filer/upload/${encodeURIComponent(path)}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function getS3Buckets(): Promise<S3Bucket[]> {
  const { data } = await api.get('/s3/buckets')
  return Array.isArray(data) ? data : []
}

export async function createS3Bucket(name: string, quota?: number) {
  const { data } = await api.post('/s3/buckets', { name, quota })
  return data
}

export async function deleteS3Bucket(name: string) {
  await api.delete(`/s3/buckets/${encodeURIComponent(name)}`)
}

export async function getS3Users(): Promise<S3User[]> {
  const { data } = await api.get('/s3/users')
  return Array.isArray(data) ? data : []
}

export async function createS3User(name: string) {
  const { data } = await api.post('/s3/users', { name })
  return data
}

export async function deleteS3User(id: string) {
  const { data } = await api.delete(`/s3/users/${id}`)
  return data
}

export async function generateS3Key(body: { username: string; email?: string; permission?: string }) {
  const { data } = await api.post('/s3/generate-key', body)
  return data
}

export async function getS3Policies(): Promise<S3Policy[]> {
  const { data } = await api.get('/s3/policies')
  return Array.isArray(data) ? data : []
}

export async function updateS3Policy(name: string, policy: Record<string, unknown>) {
  const { data } = await api.put(`/s3/policies/${encodeURIComponent(name)}`, policy)
  return data
}

export async function triggerSync() {
  const { data } = await api.post('/s3/sync-iam')
  return data
}

export async function getSyncStatus() {
  const { data } = await api.get('/s3/sync-status')
  return data
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const { data } = await api.get('/backup/status')
  return data
}

export async function triggerBackupSync() {
  const { data } = await api.post('/backup/sync')
  return data
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const { data } = await api.get('/backup/snapshots')
  return Array.isArray(data) ? data : []
}

export const getSnapshots = listSnapshots

export async function createSnapshot(name: string, path: string = '/') {
  const { data } = await api.post('/backup/snapshots', { name, path })
  return data
}

export async function deleteSnapshot(id: string) {
  await api.delete(`/backup/snapshots/${id}`)
}

export async function getWorkerStatus(): Promise<WorkerStatus[]> {
  const { data } = await api.get('/workers/status')
  return data
}

export async function getWorkerJobs(): Promise<WorkerJob[]> {
  const { data } = await api.get('/workers/jobs')
  return data
}

export const listWorkerJobs = getWorkerJobs

export async function getWorkerJob(id: string): Promise<WorkerJob> {
  const { data } = await api.get(`/workers/jobs/${id}`)
  return data
}

export async function triggerWorkerDetect() {
  const { data } = await api.post('/workers/jobs/detect')
  return data
}

export async function triggerWorkerExecute(jobType: string, node?: string) {
  const { data } = await api.post('/workers/jobs/execute', { type: jobType, node: node || '' })
  return data
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get('/dashboard/stats')
  return data
}

export async function getAlerts(params?: Record<string, string>): Promise<AlertEvent[]> {
  const { data } = await api.get('/dashboard/alerts', { params })
  return data
}

export async function acknowledgeAlert(id: number) {
  await api.put(`/dashboard/alerts/${id}/acknowledge`)
}

export async function getAlertConfig(): Promise<AlertConfig[]> {
  const { data } = await api.get('/dashboard/alerts/config')
  return data
}

export async function updateAlertConfig(config: AlertConfig[]) {
  await api.put('/dashboard/alerts/config', config)
}

export async function getDashboardHistory(hours = 24) {
  const { data } = await api.get('/dashboard/history', { params: { hours } })
  return data
}

export async function getDiskHealthStatus(): Promise<any> {
  const { data } = await api.get('/disk-health/status')
  return data
}

export async function getDiskHealthDetail(node: string, device: string): Promise<any> {
  const { data } = await api.get(`/disk-health/${encodeURIComponent(node)}/${encodeURIComponent(device)}`)
  return data
}

export async function getDiskHealthHistory(node: string, device: string, days = 30): Promise<any> {
  const { data } = await api.get(`/disk-health/history/${encodeURIComponent(node)}/${encodeURIComponent(device)}`, {
    params: { days },
  })
  return data
}

export async function getSettings(): Promise<{ categories: Record<string, { key: string; value: string; description: string }[]> }> {
  const { data } = await api.get('/settings')
  return data
}

export async function updateSettings(settings: Record<string, string>) {
  await api.put('/settings', settings)
}

export async function changeMyPassword(currentPassword: string, newPassword: string) {
  const { data } = await api.post('/users/me/password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
  return data
}

export async function getMyProfile() {
  const { data } = await api.get('/users/me/profile')
  return data
}

export async function updateMyProfile(profile: { firstname?: string; lastname?: string; email?: string; phone?: string }) {
  const { data } = await api.put('/users/me/profile', profile)
  return data
}

export async function createMyBucket() {
  const { data } = await api.post('/users/me/bucket')
  return data
}

export async function listUsers(): Promise<User[]> {
  const { data } = await api.get('/users')
  return Array.isArray(data) ? data : []
}

export async function createUser(body: {
  username: string; password: string; firstname: string; lastname: string; email: string;
  phone?: string; role?: string; create_bucket?: boolean
}) {
  const { data } = await api.post('/users', body)
  return data
}

export async function updateUser(id: number, body: {
  firstname?: string; lastname?: string; email?: string; phone?: string; role?: string; enabled?: boolean
}) {
  const { data } = await api.put(`/users/${id}`, body)
  return data
}

export async function deleteUser(id: number) {
  const { data } = await api.delete(`/users/${id}`)
  return data
}
