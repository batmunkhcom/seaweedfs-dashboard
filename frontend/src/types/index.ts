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

export interface WorkerDiskInfo {
  dir: string
  total_bytes: number
  used_bytes: number
  free_bytes: number
  percent_free: number
  percent_used: number
}

export interface WorkerNode {
  name: string
  address: string
  capabilities: string[]
  healthy: boolean
  version: string
  volumes: number
  volume_ids: number[]
  ec_shards: number
  max_volumes: number
  disk?: WorkerDiskInfo
  last_seen: string
}

export interface WorkerStatusResponse {
  total: number
  healthy: number
  nodes: WorkerNode[]
}

export interface WorkerJob {
  id: string
  type: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'missing'
  durationMs: number | null
  error: string | null
  result?: string
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
  role: 'admin' | 'operator' | 'viewer' | 'user'
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

export interface ApiKey {
  id: number
  key: string
  name: string
  permissions: string
  created_at: string
  last_used_at: string | null
  is_active: number
  usage_count?: number
  last_used_endpoint?: string | null
  created_by?: string
}

export interface ApiKeyDetail {
  id: number
  name: string
  permissions: string[]
  created_by: string
  created_at: string
  last_used_at: string | null
  usage_count: number
  last_used_endpoint: string | null
  is_active: boolean
}

export interface MetricsOverview {
  total_volumes: number
  total_free_slots: number
  total_max_slots: number
  total_disk_gb: number
  total_disk_free_gb: number
  cluster_disk_usage_pct: number
  nodes_total: number
  nodes_healthy: number
  last_updated: number
}

export interface NodeMetrics {
  node: string
  volumes: number
  free_slots: number
  max_slots: number
  disk_usage_pct: number
  disk_total_gb: number
  disk_free_gb: number
  ec_shards: number
  alive: boolean
  last_seen: number
}

export interface MetricsHistoryPoint {
  timestamp: number
  value: number
  node?: string
}

export interface NodeHealthInfo {
  node: string
  alive: boolean
  latency_ms: number | null
  error: string | null
}

export interface MetricsNodeInfo {
  node: string
  volumes: number
  free_slots: number
  max_slots: number
  ec_shards: number
  disk_usage_pct: number
  disk_total_gb: number
  disk_free_gb: number
}

export interface Webhook {
  id: number
  name: string
  platform: string
  url: string
  events: string[]
  enabled: boolean
  created_at: string
  updated_at: string | null
}

export interface WebhookDelivery {
  id: number
  webhook_id: number
  event: string
  status: string
  request_body: string
  response_code: number | null
  response_body: string
  error: string
  duration_ms: number | null
  created_at: string
}

export interface WebhookTemplate {
  platforms: { value: string; label: string; icon: string; description: string }[]
  events: { value: string; label: string }[]
}

export interface LokiStream {
  stream: Record<string, string>
  values: [string, string][]
}

export interface LokiQueryResult {
  result?: LokiStream[]
  error?: string
}

export interface LokiLogEntry {
  timestamp: string
  line: string
  labels: Record<string, string>
}

export interface Gateway {
  id: number
  gw_type: string
  node: string
  port: number
  mount_path: string
  enabled: boolean
  running: boolean
  pid: string
  config: Record<string, unknown>
}

export interface FuseStatus {
  node: string
  mount_path: string
  mounted: boolean
  disk?: { total_gb: number; used_gb: number; avail_gb: number; pct: string }
  error?: string
}

export interface NfsExport {
  id: number
  node: string
  path: string
  options: string
  enabled: boolean
  created_at: string
}

export interface NfsClient {
  host: string
  path: string
}

export interface LifecyclePolicy {
  id: number
  bucket: string
  policy_json: string
  enabled: boolean
  last_run_at: string | null
  created_at: string
}

export interface LifecycleTemplate {
  rules: Record<string, unknown>[]
}

export interface CollectionTtl {
  name: string
  ttl: string
  ttl_seconds: number
}

export interface LifecycleTransition {
  id: number
  bucket: string
  object_key: string
  action: string
  status: string
  created_at: string
}

export interface AclPolicy {
  id: number
  name: string
  description: string
  path: string
  user_pattern: string
  permissions: string
  priority: number
  enabled: boolean
  created_at: string
}

export interface AclAuditEntry {
  id: number
  user_name: string
  action: string
  path: string
  result: string
  details: string
  created_at: string
}

export interface AclTestResult {
  user: string
  path: string
  action: string
  allowed: boolean
  matched_rule: string | null
}

export interface TierConfig {
  id: number
  name: string
  tier_type: string
  provider: string
  config_json: string
  enabled: boolean
}

export interface TierStats {
  tiers: TierConfig[]
  total_estimated_cost: number
}

export interface HardeningSetting {
  key: string
  label: string
  type: string
  value: unknown
  options?: string[]
  has_value?: boolean
}

export interface FeatureRequest {
  id: number
  title: string
  description: string
  category: string
  status: string
  votes: number
  created_by: string
  created_at: string
  comments?: FeatureComment[]
}

export interface FeatureComment {
  id: number
  author: string
  body: string
  created_at: string
}
