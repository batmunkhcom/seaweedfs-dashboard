import { useState, useEffect } from 'react'
import { Card, Table, Button, Modal, Input, Space, Tag, message, Row, Col, Typography, Alert, Progress, Tooltip, Popconfirm, Switch, Select } from 'antd'
import {
  CloudUploadOutlined,
  CheckCircleFilled,
  SyncOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  KeyOutlined,
  SettingOutlined,
  CloudServerOutlined,
} from '@ant-design/icons'
import { getBackupStatus, triggerBackupSync, listSnapshots, createSnapshot, deleteSnapshot, restoreBackup, getS3Buckets } from '../../services/api'
import type { BackupStatus, Snapshot } from '../../types'

const { Text } = Typography

// API key localStorage functions
function getApiKey(): string | null {
  return localStorage.getItem('backup_api_key')
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + u[i]
}

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

export default function BackupPage() {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [backups, setBackups] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [restoringName, setRestoringName] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [snapName, setSnapName] = useState('')
  const [uploadS3, setUploadS3] = useState(false)
  const [s3Bucket, setS3Bucket] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [s3Buckets, setS3Buckets] = useState<string[]>([])
  const [apiKey, setApiKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [, setShowApiConfig] = useState(false)

  useEffect(() => {
    const key = getApiKey()
    if (key) {
      setApiKey(key)
    }
  }, [])

  const fetch = () => {
    setLoading(true)
    Promise.all([getBackupStatus(), listSnapshots()])
       .then(([s, snap]) => { setStatus(s); setBackups(Array.isArray(snap) ? snap : []); })
       .catch(() => {})
       .finally(() => setLoading(false))
   }

  useEffect(() => { fetch() }, [])
  useEffect(() => { getS3Buckets().then((b: any[]) => setS3Buckets(b.map(x => x.name))).catch(() => {}) }, [])

  const doSync = async () => {
    if (!apiKey.trim()) {
      message.error('API key required. Enter key above.')
      return
     }
    setApiKey(apiKey)
    setSyncing(true)
    const hideMsg = message.loading('Syncing backup — connecting to filer nodes via SSH...', 0)
    try {
      const r = await triggerBackupSync(uploadS3 ? s3Bucket : undefined, uploadS3 ? s3Endpoint : undefined)
      hideMsg()
      if (r.ok) message.success(`Backup completed — ${formatBytes(r.bytesSynced || 0)} synced`)
      else message.warning(r.error || 'Partial sync')
      fetch()
        } catch {
      hideMsg()
      message.error('Sync failed — check backend logs') }
    setSyncing(false)
    }

  const doCreate = async () => {
    if (!apiKey.trim()) {
      message.error('API key required. Enter key above.')
      return
     }
    setApiKey(apiKey)
    setCreateOpen(false)
    setCreating(true)
    const autoName = !snapName.trim()
    const displayName = snapName.trim() || '(auto-named)'
    const hideMsg = message.loading(`Creating backup: ${displayName}...`, 0)
    try {
      const r = await createSnapshot(snapName.trim() || '', '/')
      if (uploadS3 && r.ok) {
        message.info(`S3 upload requested to ${s3Bucket}`)
      }
      hideMsg()
      if (r.ok) {
        const suffix = autoName ? ` (auto-named: ${r.name})` : ''
        message.success(`Backup created: ${r.name}${suffix} — ${formatBytes(r.bytesSynced || 0)}`)
      } else {
        message.warning(r.error || 'Create failed')
      }
      fetch()
    } catch (e: any) {
      hideMsg()
      message.error(e.response?.data?.detail || 'Create failed')
    }
    setCreating(false)
    setSnapName('')
    }

  const doDelete = async (name: string) => {
    if (!apiKey.trim()) {
      message.error('API key required. Click "⚙️ Settings" to configure.')
      setShowApiConfig(true)
      return
     }
    setApiKey(apiKey) // save to localStorage
    try {
      await deleteSnapshot(name)
      message.success(`Backup deleted: ${name}`)
      fetch()
        } catch { message.error('Delete failed') }
    }

  const confirmRestore = (name: string) => { setRestoringName(name); setRestoreConfirmOpen(true) }
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)

  const doRestore = async () => {
    if (!apiKey.trim()) {
      message.error('API key required. Click "⚙️ Settings" to configure.')
      setShowApiConfig(true)
      return
     }
    setApiKey(apiKey) // save to localStorage
    setRestoring(true)
    try {
      const r = await restoreBackup(restoringName)
      if (r.ok) {
        message.success(`Restored ${restoringName} to all filer nodes — filer auto-restarted`)             
        fetch()
          } else {
        message.error(r.error || 'Restore failed')
          }
      setRestoreConfirmOpen(false)
        } catch (e: any) { message.error(e.response?.data?.detail || 'Restore failed') }
    setRestoring(false)
    }

  const formatSize = (v: number | undefined) => v ? formatBytes(v) : '\u2014'

  const totalBackupSize = backups.reduce((sum, b) => sum + (b.size || 0), 0)
  const uploadedCount = backups.filter(b => b.status === 'uploaded').length
  const issueCount = backups.filter(b => b.status !== 'uploaded').length

  const columns = [
       { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
       { title: 'Size', dataIndex: 'size', key: 'size', width: 100, render: (v: number) => formatSize(v) },
       { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: (s: string) => {
        const colors: Record<string, string> = { uploaded: 'green', partial: 'orange', failed: 'red', running: 'blue', missing: 'red' }
        return <Tag color={colors[s] || 'default'}>{s}</Tag>
        }},
       { title: 'Created', dataIndex: 'created_at', key: 'created_at', width: 180, render: (v: string) => formatDate(v) },
       {
       title: '', key: 'actions', width: 120,
       render: (_: any, r: Snapshot) => (
            <Space>
             {r.status === 'uploaded' || r.status === 'partial' ? (
              <Tooltip title="Restore this backup">
               <Button size="small" icon={<SyncOutlined />} onClick={() => confirmRestore(r.name)} />
              </Tooltip>
             ) : (
              <Tooltip title="Restore unavailable — backup file missing">
               <Button size="small" icon={<SyncOutlined />} disabled />
              </Tooltip>
             )}
             <Tooltip title="Delete this backup">
              <Popconfirm
                title="Delete this backup?"
                onConfirm={() => doDelete(r.name)}
                okText="Delete"
                cancelText="Cancel"
               >
                <Button size="small" danger icon={<DeleteOutlined />} />
               </Popconfirm>
             </Tooltip>
            </Space>
          ),
        },
     ]

  const statusIcon = status?.running ? (
       <>
         <SyncOutlined spin />
         <Text strong style={{ color: '#6366f1' }}>Running</Text>
        </>
       ) : status?.lastError ? (
          <>
            <WarningOutlined style={{ color: '#ef4444' }} />
            <Text strong style={{ color: '#ef4444' }}>Error</Text>
           </>
         ) : status?.bytesSynced ? (
             <>
               <CheckCircleFilled style={{ color: '#22c55e' }} />
               <Text strong style={{ color: '#22c55e' }}>Complete</Text>
              </>
            ) : (
                <>
                  <WarningOutlined style={{ color: '#f59e0b' }} />
                  <Text strong style={{ color: '#64748b' }}>Never</Text>
                 </>
               )

  return (
        <div>
          {/* API Key Input */}
          <Card size="small" style={{ marginBottom: 16, background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <KeyOutlined style={{ fontSize: 18, color: '#6366f1' }} />
              <div style={{ flex: 1 }}>
                <Space align="center">
                  <Text strong>API Key Required</Text>
                  {keySaved && <Tag color="green" style={{ margin: 0 }}>Saved</Tag>}
                </Space>
                <Input.Password
                  placeholder="Enter backup API key (starts with bkp_)"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setKeySaved(false) }}
                  onPressEnter={() => {
                    if (apiKey.trim()) {
                      localStorage.setItem('backup_api_key', apiKey.trim())
                      setKeySaved(true)
                      message.success('API key saved')
                     }
                    }}
                  style={{ maxWidth: 400, marginTop: 6 }}
                />
              </div>
              {apiKey && (
                <Button 
                  type={keySaved ? 'default' : 'primary'}
                  size="small"
                  onClick={() => {
                    localStorage.setItem('backup_api_key', apiKey.trim())
                    setKeySaved(true)
                    message.success('API key saved')
                   }}
                >
                  {keySaved ? 'Saved ✓' : 'Save Key'}
                </Button>
              )}
            </div>
          </Card>

          {/* Status Summary */}

        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: status?.running ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(99,102,241,0.15)' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Sync Status</Text>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>{statusIcon}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Last Sync</Text>
              <div style={{ marginTop: 4, fontSize: 13 }}>{formatDate(status?.lastSyncAt || null)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Last Synced</Text>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700 }}>{status?.bytesSynced ? formatBytes(status.bytesSynced) : '\u2014'}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Snapshots</Text>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700 }}>{backups.length}</div>
            </Card>
          </Col>
        </Row>

        {/* Additional Stats */}
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={12} md={8}>
            <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Total Backup Size</Text>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{formatBytes(totalBackupSize)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Uploaded</Text>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Progress percent={backups.length > 0 ? Math.round((uploadedCount / backups.length) * 100) : 0} size="small" format={() => `${uploadedCount}`} />
              </div>
            </Card>
          </Col>
          {issueCount > 0 && (
            <Col xs={24} sm={12} md={8}>
              <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Issues</Text>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <WarningOutlined style={{ color: '#f59e0b' }} />
                  <Text strong style={{ color: '#f59e0b' }}>{issueCount} backup(s) need attention</Text>
                </div>
              </Card>
            </Col>
          )}
        </Row>

        {status?.lastError && (
          <Alert type="error" showIcon message="Last Error" description={status.lastError} style={{ marginBottom: 16 }} />
        )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}><HistoryOutlined style={{ marginRight: 8 }} />Backup Snapshots</span>
            <Space>
              <Button icon={<PlusOutlined />} size="small" loading={creating} onClick={() => setCreateOpen(true)}>New Backup</Button>
              <Button icon={<CloudUploadOutlined />} size="small" type="primary" loading={syncing} onClick={doSync}>Sync Now</Button>
              <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
            </Space>
          </div>

          {/* Snapshot Table */}
          <Table dataSource={backups} columns={columns} rowKey="name" loading={loading} size="small" pagination={{ pageSize: 20 }} locale={{ emptyText: 'No backups yet. Click "New Backup" to create one.' }} />

          {/* Info Card */}
          <Card size="small" style={{ marginTop: 16, background: 'rgba(30,41,59,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <SettingOutlined style={{ color: '#f59e0b' }} />
              <Text strong>Backup Configuration</Text>
            </div>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
              <strong>What is backed up:</strong> Filer LevelDB metadata — all file/directory names, paths, sizes, permissions, timestamps, and directory structure from <code>/data/dc03/filer/filerldb2</code>. File content is stored separately on volume servers and not included in filer backups.
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
              <strong>How it works:</strong> Connects to filer nodes via SSH, tars the LevelDB directory, and downloads via SFTP to <code>/srv/seaweed-backups/</code>.
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
              <strong>Restore:</strong> Uploads the tar.gz back to the filer via SFTP and extracts into the LevelDB directory. After restore, restart filer service — it will reconnect to existing volumes and rebuild metadata-to-volume mappings automatically.
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
              <strong>Encryption:</strong> Compatible with SeaweedFS volume encryption. Backup captures filer LevelDB as-is — encryption at volume level is transparent to filer metadata. If filer store uses disk encryption (LUKS), encrypted data is backed up and restored identically.
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
              <strong>Retention:</strong> Backups older than <code>30 days</code> are auto-deleted. Each backup is a full snapshot, not incremental.
              </Text>
            </Space>
          </Card>

        {/* Create Backup Modal */}
        <Modal open={createOpen} title="Create Backup" onOk={doCreate} onCancel={() => setCreateOpen(false)} okText="Create Backup">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input addonBefore="Name (optional)" value={snapName} onChange={(e) => setSnapName(e.target.value)} placeholder="auto-generated if empty" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch checked={uploadS3} onChange={setUploadS3} />
              <Text>Upload to S3 after backup</Text>
            </div>
            {uploadS3 && (
              <>
                <div>Bucket: <Select showSearch value={s3Bucket || undefined} onChange={setS3Bucket} style={{ width: '100%' }} placeholder="Select S3 bucket" options={s3Buckets.map(b => ({ value: b, label: b }))} /></div>
                <Input addonBefore="Endpoint" value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} placeholder="http://s3-node:8333" />
              </>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
            Backs up Filer LevelDB metadata from all filer nodes (<code>/data/dc03/filer/filerldb2</code>) — file/directory names, paths, sizes, permissions. File content lives on volume servers and is not included.
            </Text>
          </div>
        </Modal>

        {/* Restore Confirmation Modal */}
        <Modal
        open={restoreConfirmOpen}
        title={<><ExclamationCircleOutlined style={{ color: '#ef4444', marginRight: 8 }} />Restore Backup</>}
        onOk={doRestore}
        onCancel={() => setRestoreConfirmOpen(false)}
        confirmLoading={restoring}
        okText="Restore Now"
        okButtonProps={{ danger: true }}
        >
          <Alert type="warning" showIcon message="This will overwrite the Filer database!" style={{ marginBottom: 12 }} />
          <p>
           Restoring backup <code>{restoringName}</code> to all filer nodes.
           This operation is destructive \u2014 current filer data will be replaced.
          </p>
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Filer service will be automatically restarted on all nodes after restore.
          </Text>
        </Modal>
      </div>
    )
}
