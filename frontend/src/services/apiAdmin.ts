import api from './api'
import type {
  User,
  MetricsOverview,
  NodeMetrics,
  MetricsHistoryPoint,
  NodeHealthInfo,
  MetricsNodeInfo,
  Webhook,
  WebhookDelivery,
  WebhookTemplate,
  LokiQueryResult,
  Gateway,
  FuseStatus,
  NfsExport,
  NfsClient,
  LifecyclePolicy,
  CollectionTtl,
  LifecycleTransition,
  AclPolicy,
  AclAuditEntry,
  AclTestResult,
  TierConfig,
  TierStats,
  HardeningSetting,
  FeatureRequest,
} from '../types'

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

export async function createApiKey(name: string, permissions: string = 'backup:read,backup:write') {
  const { data } = await api.post('/api-keys/create', { name, permissions })
  return data
}

export async function listApiKeys() {
  const { data } = await api.get('/api-keys/list')
  return Array.isArray(data) ? data : []
}

export async function getApiKeyDetail(keyId: number) {
  const { data } = await api.get(`/api-keys/${keyId}/detail`)
  return data
}

export async function revealApiKey(keyId: number, adminPassword: string) {
  const { data } = await api.post('/api-keys/reveal', { key_id: keyId, admin_password: adminPassword })
  return data
}

export async function revokeApiKey(keyId: number) {
  const { data } = await api.post(`/api-keys/revoke/${keyId}`)
  return data
}

export async function getChatbotStatus(): Promise<{ enabled: boolean }> {
  const { data } = await api.get('/chatbot/status')
  return data
}

export async function testAiConnection(provider: string, apiBaseUrl: string, apiKey: string) {
  const { data } = await api.post('/chatbot/test-connection', { provider, api_base_url: apiBaseUrl, api_key: apiKey })
  return data
}

export async function getAiStats() {
  const { data } = await api.get('/chatbot/stats')
  return data
}

export async function triggerEmbeddingIndex() {
  const { data } = await api.post('/chatbot/embedding/index')
  return data
}

export async function pingNodes(): Promise<{
  ok: boolean; nodes: Array<{ host: string; services: Array<{ port: number; service: string; reachable: boolean }> }>;
  total: number; reachable: number; elapsed_ms: number;
}> {
  const { data } = await api.get('/tools/ping')
  return data
}

export async function serviceCheck(): Promise<{
  ok: boolean; nodes: Array<{ host: string; checks: Array<{ port: number; service: string; path: string; reachable: boolean; status?: number; latency_ms?: number; error?: string }> }>;
  total_checks: number; passed: number; failed: number; elapsed_ms: number;
}> {
  const { data } = await api.get('/tools/service-check')
  return data
}

export async function getMetricsOverview(): Promise<MetricsOverview> {
  const { data } = await api.get('/metrics/overview')
  return data
}

export async function getMetricsNode(ip: string): Promise<NodeMetrics> {
  const { data } = await api.get(`/metrics/node/${encodeURIComponent(ip)}`)
  return data
}

export async function getMetricsNodes(): Promise<MetricsNodeInfo[]> {
  const { data } = await api.get('/metrics/nodes')
  return Array.isArray(data) ? data : []
}

export async function getMetricsHistory(node?: string, metric?: string, hours?: number, allNodes?: boolean): Promise<MetricsHistoryPoint[]> {
  const params: Record<string, string | number | boolean> = { metric: metric || 'disk_usage_pct', hours: hours || 24 }
  if (node) params.node = node
  if (allNodes) params.all_nodes = true
  const { data } = await api.get('/metrics/history', { params })
  return Array.isArray(data) ? data : []
}

export async function getMetricsAlive(): Promise<NodeHealthInfo[]> {
  const { data } = await api.get('/metrics/alive')
  return Array.isArray(data) ? data : []
}

export async function getWebhooks(): Promise<Webhook[]> {
  const { data } = await api.get('/webhooks')
  return Array.isArray(data) ? data : []
}

export async function createWebhook(body: { name: string; platform: string; url: string; events: string[]; secret: string }) {
  const { data } = await api.post('/webhooks', body)
  return data
}

export async function updateWebhook(id: number, body: Record<string, unknown>) {
  const { data } = await api.put(`/webhooks/${id}`, body)
  return data
}

export async function deleteWebhook(id: number) {
  await api.delete(`/webhooks/${id}`)
}

export async function testWebhook(id: number) {
  const { data } = await api.post(`/webhooks/${id}/test`)
  return data
}

export async function toggleWebhook(id: number) {
  const { data } = await api.put(`/webhooks/${id}/toggle`)
  return data
}

export async function getWebhookHistory(id: number, limit = 50): Promise<WebhookDelivery[]> {
  const { data } = await api.get(`/webhooks/${id}/history`, { params: { limit } })
  return Array.isArray(data) ? data : []
}

export async function getWebhookDeliveryDetail(webhookId: number, deliveryId: number): Promise<WebhookDelivery> {
  const { data } = await api.get(`/webhooks/${webhookId}/history/${deliveryId}`)
  return data
}

export async function getWebhookTemplates(): Promise<WebhookTemplate> {
  const { data } = await api.get('/webhooks/templates')
  return data
}

export async function getLokiStatus() {
  const { data } = await api.get('/logs/status')
  return data
}

export async function queryLokiLogs(query: string, start?: string, end?: string, limit = 500, direction = 'backward'): Promise<LokiQueryResult> {
  const { data } = await api.get('/logs/query', { params: { query, start, end, limit, direction } })
  return data
}

export async function getLokiLabels(): Promise<string[]> {
  const { data } = await api.get('/logs/labels')
  return Array.isArray(data) ? data : []
}

export async function getLokiLabelValues(label: string): Promise<string[]> {
  const { data } = await api.get(`/logs/labels/${encodeURIComponent(label)}/values`)
  return Array.isArray(data) ? data : []
}

export async function getGateways(): Promise<Gateway[]> {
  const { data } = await api.get('/gateways/status')
  return Array.isArray(data) ? data : []
}

export async function startWebdav(node: string, port?: number) {
  const { data } = await api.post('/gateways/webdav/start', { node, port })
  return data
}

export async function stopWebdav(node: string) {
  const { data } = await api.post('/gateways/webdav/stop', { node })
  return data
}

export async function testWebdavConnection(node: string, port: number) {
  const { data } = await api.post('/gateways/webdav/test', { node, port })
  return data
}

export async function mountFuse(node: string, mountPath?: string) {
  const { data } = await api.post('/gateways/fuse/mount', { node, mount_path: mountPath })
  return data
}

export async function unmountFuse(node: string) {
  const { data } = await api.post('/gateways/fuse/unmount', { node })
  return data
}

export async function getFuseStatus(node: string): Promise<FuseStatus> {
  const { data } = await api.get('/gateways/fuse/status', { params: { node } })
  return data
}

export async function getNfsExports(): Promise<NfsExport[]> {
  const { data } = await api.get('/nfs/exports')
  return Array.isArray(data) ? data : []
}

export async function createNfsExport(node: string, path: string, options: string) {
  const { data } = await api.post('/nfs/exports', { node, path, options })
  return data
}

export async function updateNfsExport(id: number, options: string) {
  const { data } = await api.put(`/nfs/exports/${id}`, { options })
  return data
}

export async function deleteNfsExport(id: number) {
  const { data } = await api.delete(`/nfs/exports/${id}`)
  return data
}

export async function getNfsClients(node: string): Promise<{ node: string; clients: NfsClient[] }> {
  const { data } = await api.get('/nfs/clients', { params: { node } })
  return data
}

export async function syncNfsExports() {
  const { data } = await api.post('/nfs/sync')
  return data
}

export async function getLifecyclePolicies(): Promise<LifecyclePolicy[]> {
  const { data } = await api.get('/lifecycle/policies')
  return Array.isArray(data) ? data : []
}

export async function getLifecyclePolicy(bucket: string): Promise<LifecyclePolicy> {
  const { data } = await api.get(`/lifecycle/policies/${encodeURIComponent(bucket)}`)
  return data
}

export async function saveLifecyclePolicy(bucket: string, policy: Record<string, unknown>, enabled = true) {
  const { data } = await api.put(`/lifecycle/policies/${encodeURIComponent(bucket)}`, { policy, enabled })
  return data
}

export async function deleteLifecyclePolicy(bucket: string) {
  await api.delete(`/lifecycle/policies/${encodeURIComponent(bucket)}`)
}

export async function getCollectionsTtl(): Promise<CollectionTtl[]> {
  const { data } = await api.get('/lifecycle/collections/ttl')
  return Array.isArray(data) ? data : []
}

export async function setCollectionTtl(name: string, ttl: string) {
  const { data } = await api.put(`/lifecycle/collections/${encodeURIComponent(name)}/ttl`, { ttl })
  return data
}

export async function getLifecycleTransitions(bucket?: string): Promise<LifecycleTransition[]> {
  const { data } = await api.get('/lifecycle/transitions', { params: { bucket } })
  return Array.isArray(data) ? data : []
}

export async function getLifecycleTemplates(): Promise<{ templates: Record<string, { rules: Record<string, unknown>[] }> }> {
  const { data } = await api.get('/lifecycle/templates')
  return data
}

export async function getAclPolicies(): Promise<AclPolicy[]> {
  const { data } = await api.get('/acl/policies')
  return Array.isArray(data) ? data : []
}

export async function createAclPolicy(body: Record<string, unknown>) {
  const { data } = await api.post('/acl/policies', body)
  return data
}

export async function updateAclPolicy(id: number, body: Record<string, unknown>) {
  const { data } = await api.put(`/acl/policies/${id}`, body)
  return data
}

export async function deleteAclPolicy(id: number) {
  await api.delete(`/acl/policies/${id}`)
}

export async function reorderAclPolicies(order: number[]) {
  const { data } = await api.put('/acl/policies/reorder', { order })
  return data
}

export async function testAclPermission(user: string, path: string, action: string): Promise<AclTestResult> {
  const { data } = await api.post('/acl/policies/test', { user, path, action })
  return data
}

export async function getAclAuditLog(user?: string): Promise<AclAuditEntry[]> {
  const { data } = await api.get('/acl/audit', { params: { user } })
  return Array.isArray(data) ? data : []
}

export async function syncAclToFiler(): Promise<{ ok: boolean; results: Record<string, unknown> }> {
  const { data } = await api.post('/acl/sync')
  return data
}

export async function getAclSyncStatus(): Promise<{ status: string; rule_count: number; last_sync_at: string | null }> {
  const { data } = await api.get('/acl/sync-status')
  return data
}

export async function getTiers(): Promise<TierConfig[]> {
  const { data } = await api.get('/tiers')
  return Array.isArray(data) ? data : []
}

export async function getTierStats(): Promise<TierStats> {
  const { data } = await api.get('/tiers/stats')
  return data
}

export async function saveTier(body: Record<string, unknown>) {
  const { data } = await api.post('/tiers', body)
  return data
}

export async function deleteTier(id: number) {
  const { data } = await api.delete(`/tiers/${id}`)
  return data
}

export async function testTierConnection(provider: string, config: Record<string, unknown>) {
  const { data } = await api.post('/tiers/test-connection', { provider, config })
  return data
}

export async function syncTiers(): Promise<{ ok: boolean; synced: number; total: number }> {
  const { data } = await api.post('/tiers/sync')
  return data
}

export async function getChecksumHistory(): Promise<Record<string, unknown>[]> {
  const { data } = await api.get('/hardening/checksums/history')
  return Array.isArray(data) ? data : []
}

export async function getHardeningStatus(): Promise<{ settings: HardeningSetting[] }> {
  const { data } = await api.get('/hardening/status')
  return data
}

export async function updateHardening(settings: Record<string, unknown>) {
  const { data } = await api.put('/hardening/config', { settings })
  return data
}

export async function triggerChecksum(): Promise<Record<string, unknown>> {
  const { data } = await api.post('/hardening/checksums/verify')
  return data
}

export async function deployCompression(): Promise<Record<string, unknown>> {
  const { data } = await api.post('/hardening/compression/deploy')
  return data
}

export async function deployEncryption(): Promise<Record<string, unknown>> {
  const { data } = await api.post('/hardening/encryption/deploy')
  return data
}

export async function checkReplicationDrift(): Promise<Record<string, unknown>> {
  const { data } = await api.get('/hardening/replication/drift')
  return data
}

export async function getFilerList(path: string = '/'): Promise<any[]> {
  const { data } = await api.get(`/filer/list/${path === '/' ? '' : encodeURIComponent(path)}`)
  return Array.isArray(data) ? data : []
}

export async function getFeatureRequests(status?: string): Promise<FeatureRequest[]> {
  const { data } = await api.get('/feedback/requests', { params: { status } })
  return Array.isArray(data) ? data : []
}

export async function getFeatureRequest(id: number): Promise<FeatureRequest> {
  const { data } = await api.get(`/feedback/requests/${id}`)
  return data
}

export async function createFeatureRequest(title: string, description: string, category: string) {
  const { data } = await api.post('/feedback/requests', { title, description, category })
  return data
}

export async function voteFeatureRequest(id: number) {
  await api.post(`/feedback/requests/${id}/vote`)
}

export async function unvoteFeatureRequest(id: number) {
  await api.delete(`/feedback/requests/${id}/vote`)
}

export async function updateFeatureStatus(id: number, status: string) {
  await api.put(`/feedback/requests/${id}/status`, { status })
}

export async function addFeatureComment(requestId: number, body: string) {
  const { data } = await api.post(`/feedback/requests/${requestId}/comments`, { body })
  return data
}
