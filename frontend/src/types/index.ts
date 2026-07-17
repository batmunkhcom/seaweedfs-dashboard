export interface ClusterStatus {
  leader: string
  peers: string[]
  version: string
}

export interface DataCenter {
  id: string
  racks: Rack[]
}

export interface Rack {
  id: string
  dataNodes: DataNode[]
}

export interface DataNode {
  url: string
  volumes: number
  max: number
  free: number
  ecShards: number
  ecMax: number
}

export interface Topology {
  dataCenters: DataCenter[]
  free: number
  max: number
}

export interface Volume {
  id: number
  collection: string
  size: number
  fileCount: number
  replicaPlacement: string
  ttl: string
  readOnly: boolean
  version: number
  compactRevision: number
  modifiedAtSecond: number
  locations: number[]
}

export interface VolumeDetail extends Volume {
  locateUrl: string
}

export interface Collection {
  name: string
  volumeCount: number
  totalSize: number
}

export interface FilerEntry {
  name: string
  isDirectory: boolean
  size: number
  mtime: string
  mode: number
  path: string
}

export interface FilerListResponse {
  entries: FilerEntry[]
  path: string
  total: number
  page: number
  pageSize: number
}

export interface S3Bucket {
  name: string
  fileCount: number
  totalSize: number
  quota: number | null
  createdAt: string
}

export interface S3User {
  id: string
  name: string
  accessKey: string
  createdAt: string
}

export interface S3Policy {
  name: string
  content: Record<string, unknown>
  description: string
}

export interface BackupStatus {
  running: boolean
  lastSyncAt: string | null
  lastError: string | null
  bytesSynced?: number
}

export interface Snapshot {
  id: number
  name: string
  s3Key: string
  size: number
  filerHosts: string[]
  status: string
  createdAt: string
}

export interface BucketStatus {
  ok: boolean
  bucket?: string
  exists?: boolean
  error?: string
}

export interface WorkerStatus {
  name: string
  capabilities: string[]
  lastSeen: string
  healthy: boolean
  address?: string
  volumes?: number
  ecShards?: number
  maxVolumes?: number
}

export interface WorkerJob {
  id: string
  type: string
  status: 'pending' | 'running' | 'success' | 'failed'
  durationMs: number | null
  error: string | null
  createdAt: string
  node?: string
}

export interface DashboardStats {
  totalVolumes: number
  totalFiles: number
  totalSizeBytes: number
  freeSpace: number
  maxSpace: number
  volumeServers: number
  healthyNodes: number
  masterLeader: string
  filerStatus: string
  version: string
  totalDiskGB: number
  totalUsableGB: number
  physicalRawGB: number
  physicalUsableGB: number
}

export interface AlertEvent {
  id: number
  type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  node: string | null
  status: 'new' | 'acknowledged' | 'resolved'
  createdAt: string
  acknowledgedAt: string | null
  resolvedAt: string | null
}

export interface AlertConfig {
  key: string
  value: string
}

export interface DiskHealthSummary {
  node: string
  disks: DiskHealthDevice[]
}

export interface DiskHealthDevice {
  device: string
  model: string
  size: string
  health: string
  temperature: number
  wearPercent: number | null
  reallocatedSectors: number
  powerOnHours: number
}

export interface DiskHealthDetail {
  node?: string
  device?: string
  timestamp?: number
  smart?: string
}

export interface SmartAttribute {
  id: number
  name: string
  value: number
}
export interface DiskHealthHistory {
  timestamps: string[]
  temperatures: number[]
  wearPercents: (number | null)[]
  reallocated: number[]
}

export interface SmartAttribute {
  id: number
  name: string
  value: number
  worst: number
  threshold: number
  raw: string
  status: string
}

export interface DiskHealthHistory {
  timestamps: string[]
  temperatures: number[]
  wearPercents: (number | null)[]
  reallocated: number[]
}

export interface User {
  id?: number
  username: string
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  role: 'admin' | 'operator' | 'viewer'
  enabled?: boolean
  s3_access_key?: string
  s3_secret_key?: string
  created_at?: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  user: User
  csrfToken: string
}

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}
