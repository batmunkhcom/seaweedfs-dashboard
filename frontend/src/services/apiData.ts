import api from './api'
import { setCsrfToken } from './api'
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
  WorkerStatusResponse,
  WorkerJob,
  DashboardStats,
  AlertEvent,
  AlertConfig,
  LoginRequest,
  LoginResponse,
  User,
} from '../types'

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
  window.location.href = '/login'
}

export async function getMe(): Promise<User> {
  const { data } = await api.get('/auth/me')
  return data
}

export async function getCsrfToken() {
  const { data } = await api.get('/auth/csrf-token')
  setCsrfToken(data.token)
  return data
}

export async function refreshCsrfToken(): Promise<string> {
  const { data } = await api.post('/auth/refresh-csrf')
  setCsrfToken(data.token)
  return data.token
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
  await api.put('/cluster/node-limits', limits)
}

export async function getTopology(): Promise<Topology> {
  const { data } = await api.get('/cluster/topology')
  return data
}

export async function getVolumes(params?: Record<string, string>): Promise<{ volumes: Volume[]; total: number }> {
  const { data } = await api.get('/volumes', { params })
  return data
}

export async function getVolumesStats() {
  const { data } = await api.get('/volumes/stats')
  return data
}

export async function getVolume(id: number): Promise<VolumeDetail> {
  const { data } = await api.get(`/volumes/${id}`)
  return data
}

export async function growVolumes(body: Record<string, unknown>) {
  await api.post('/volumes/grow', body)
}

export async function vacuumVolumes(body: Record<string, unknown>) {
  await api.post('/volumes/vacuum', body)
}

export async function getCollections(): Promise<Collection[]> {
  const { data } = await api.get('/collections')
  return data
}

export async function deleteCollection(name: string) {
  await api.delete(`/collections/${encodeURIComponent(name)}`)
}

export async function listFiler(path: string, page = 1, pageSize = 50): Promise<FilerListResponse> {
  const { data } = await api.get('/filer/list', { params: { path, page, page_size: pageSize } })
  return data
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
  return data
}

export async function createS3Bucket(name: string, quota?: number) {
  await api.post('/s3/buckets', { name, quota })
}

export async function deleteS3Bucket(name: string) {
  await api.delete(`/s3/buckets/${encodeURIComponent(name)}`)
}

export async function getS3Users(): Promise<S3User[]> {
  const { data } = await api.get('/s3/users')
  return data
}

export async function createS3User(name: string) {
  await api.post('/s3/users', { username: name })
}

export async function deleteS3User(id: string) {
  await api.delete(`/s3/users/${encodeURIComponent(id)}`)
}

export async function generateS3Key(body: { username: string; email?: string; permission?: string }) {
  const { data } = await api.post('/s3/users/generate-key', body)
  return data
}

export async function getS3Policies(): Promise<S3Policy[]> {
  const { data } = await api.get('/s3/policies')
  return data
}

export async function updateS3Policy(name: string, policy: Record<string, unknown>) {
  await api.put(`/s3/policies/${encodeURIComponent(name)}`, { policy })
}

export async function triggerSync() {
  await api.post('/s3/sync-iam')
}

export async function getSyncStatus() {
  const { data } = await api.get('/s3/sync-status')
  return data
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const { data } = await api.get('/backup/status')
  return data
}

export async function triggerBackupSync(s3Bucket?: string, s3Endpoint?: string) {
  const { data } = await api.post('/backup/sync', { s3_bucket: s3Bucket, s3_endpoint: s3Endpoint })
  return data
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const { data } = await api.get('/backup/snapshots')
  return data
}

export const getSnapshots = listSnapshots

export async function createSnapshot(name: string, path: string = '/') {
  const { data } = await api.post('/backup/snapshots', { name, path })
  return data
}

export async function deleteSnapshot(id: string) {
  await api.delete(`/backup/snapshots/${encodeURIComponent(id)}`)
}

export async function restoreBackup(name: string) {
  await api.post(`/backup/restore/${encodeURIComponent(name)}`)
}

export async function getWorkerStatus(): Promise<WorkerStatusResponse> {
  const { data } = await api.get('/workers/status')
  return data
}

export async function getWorkerJobs(): Promise<WorkerJob[]> {
  const { data } = await api.get('/workers/jobs')
  return data
}

export const listWorkerJobs = getWorkerJobs

export async function getWorkerJob(id: string): Promise<WorkerJob> {
  const { data } = await api.get(`/workers/jobs/${encodeURIComponent(id)}`)
  return data
}

export async function getJobTypes(): Promise<{ type: string; description: string }[]> {
  const { data } = await api.get('/workers/job-types')
  return data
}

export async function getNodeVolumes(node: string): Promise<{ node: string; volume_ids: number[]; count: number }> {
  const { data } = await api.get(`/workers/node-volumes/${encodeURIComponent(node)}`)
  return data
}

export async function triggerWorkerDetect() {
  await api.post('/workers/jobs/detect')
}

export async function triggerWorkerExecute(jobType: string, node?: string, param?: string) {
  await api.post('/workers/jobs/execute', { job_type: jobType, node, param })
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get('/dashboard/stats')
  return data
}

export async function getDiskUsage(): Promise<{ nodes: { node: string; usage_pct: number }[] }> {
  const { data } = await api.get('/dashboard/disk-usage')
  return data
}

export async function getKpiExtras(): Promise<Record<string, number>> {
  const { data } = await api.get('/dashboard/kpi-extras')
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
