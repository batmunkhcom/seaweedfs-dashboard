import { useState, useEffect } from 'react'
import { Card, Table, Button, Modal, Input, Space, Tag, message, Row, Col, Typography, Alert, Progress, Tooltip, Divider } from 'antd'
import {
  CloudUploadOutlined,
  CheckCircleFilled,
  SyncOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { getBackupStatus, triggerBackupSync, listSnapshots, createSnapshot, deleteSnapshot, restoreBackup, ensureBackupBucket } from '../../services/api'
import type { BackupStatus, Snapshot } from '../../types'
import { useAuthStore } from '../../stores/authStore'

const { Text, Title } = Typography

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
  const [bucketStatus, setBucketStatus] = useState<{ ok: boolean; exists?: boolean } | null>(null)
  const [ensuring, setEnsuring] = useState(false)
  const role = useAuthStore((s) => s.user?.role)
  const canWrite = role === 'admin' || role === 'operator'

  const fetch = () => {
    setLoading(true)
    Promise.all([getBackupStatus(), listSnapshots()])
        .then(([s, snap]) => { setStatus(s); setBackups(Array.isArray(snap) ? snap : []); })
        .catch(() => {})
        .finally(() => setLoading(false))
     fetchBucket()
  }

  const fetchBucket = () => {
    ensureBackupBucket()
      .then(r => setBucketStatus({ ok: r.ok, exists: r.exists }))
      .catch(() => {})
  }

  useEffect(() => { fetch() }, [])

  const doSync = async () => {
    setSyncing(true)
    try {
      const r = await triggerBackupSync()
      if (r.ok) message.success(`Backup completed \u2014 ${formatBytes(r.bytesSynced || 0)} uploaded to S3`)
      else message.warning(r.error || 'Partial sync')
      fetch()
      } catch { message.error('Sync failed') }
    setSyncing(false)
     ensureBackupBucket()
  }

  const doEnsureBucket = async () => {
    setEnsuring(true)
    try {
      const r = await ensureBackupBucket()
      if (r.ok) {
        message.success(r.exists ? 'S3 bucket already exists' : 'S3 backup bucket created')
        fetchBucket()
      } else {
        message.error(r.error || 'Failed to create bucket')
      }
     } catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
    setEnsuring(false)
  }

  const doCreate = async () => {
    if (!snapName.trim()) return
    setCreating(true)
    try {
      const r = await createSnapshot(snapName, '/')
      if (r.ok) message.success(`Backup created: ${r.name}`)
      else message.warning(r.error || 'Create failed')
      fetch()
      } catch (e: any) {
      message.error(e.response?.data?.detail || 'Create failed')
      }
    setCreating(false)
    setCreateOpen(false)
    setSnapName('')
     ensureBackupBucket()
  }

  const doDelete = async (name: string) => {
    try {
      await deleteSnapshot(name)
      message.success(`Backup deleted: ${name}`)
      fetch()
       } catch { message.error('Delete failed') }
     ensureBackupBucket()
   }

  const confirmRestore = (name: string) => { setRestoringName(name); setRestoreConfirmOpen(true) }
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)

  const doRestore = async () => {
    setRestoring(true)
    try {
      const r = await restoreBackup(restoringName)
      if (r.ok) {
        message.success(`Restore initiated for: ${restoringName}`)
        message.warning('WARNING: Filer will be overwritten. Restart filer service after restore.')
        fetch()
        } else {
        message.error(r.error || 'Restore failed')
        }
      setRestoreConfirmOpen(false)
      } catch (e: any) { message.error(e.response?.data?.detail || 'Restore failed') }
    setRestoring(false)
     ensureBackupBucket()
  }

  const formatSize = (v: number | undefined) => v ? formatBytes(v) : '\u2014'

  const totalBackupSize = backups.reduce((sum, b) => sum + (b.size || 0), 0)
  const uploadedCount = backups.filter(b => b.status === 'uploaded').length
  const missingCount = backups.filter(b => b.status === 'missing_s3' || b.status === 'orphaned').length

  const columns = [
     { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
     { title: 'Size', dataIndex: 'size', key: 'size', width: 100, render: (v: number) => formatSize(v) },
     { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: (s: string) => {
        const colors: Record<string, string> = { uploaded: 'green', partial: 'orange', failed: 'red', running: 'blue', missing_s3: 'red', orphaned: 'gold' }
        return <Tag color={colors[s] || 'default'}>{s}</Tag>
      }},
     { title: 'Created', dataIndex: 'created_at', key: 'created_at', width: 180, render: (v: string) => formatDate(v) },
    ...(canWrite ? [{
     title: '', key: 'actions', width: 120,
     render: (_: any, r: Snapshot) => (
         <Space>
          <Tooltip title="Restore this backup">
            <Button size="small" icon={<SyncOutlined />} onClick={() => confirmRestore(r.name)} />
           </Tooltip>
          <Tooltip title="Delete this backup">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => doDelete(r.name)} />
           </Tooltip>
         </Space>
       ),
     }] : []),
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

  const bucketOk = bucketStatus?.ok
  const bucketExists = bucketStatus?.exists

  return (
     <div>
       {/* S3 Bucket Status */}
       <Card size="small" style={{ marginBottom: 16, background: 'rgba(15,23,42,0.8)', border: bucketOk ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
             <CloudServerOutlined style={{ fontSize: 20, color: bucketOk ? '#22c55e' : '#ef4444' }} />
             <div>
               <Text type="secondary" style={{ fontSize: 12 }}>S3 Backup Bucket</Text>
               <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                 <Text strong style={{ color: bucketOk ? '#22c55e' : '#ef4444' }}>
                   {bucketExists ? 's3://seaweed-backups (exists)' : 's3://seaweed-backups (not found)'}
                 </Text>
                 {!bucketOk && <Tag color="red">Connection Error</Tag>}
               </div>
             </div>
           </div>
           {canWrite && !bucketExists && (
             <Button size="small" type="primary" loading={ensuring} onClick={doEnsureBucket}>
               Create Bucket
             </Button>
           )}
         </div>
       </Card>

       {/* Summary Cards */}
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
         {missingCount > 0 && (
           <Col xs={24} sm={12} md={8}>
             <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(239,68,68,0.3)' }}>
               <Text type="secondary" style={{ fontSize: 12 }}>Issues</Text>
               <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                 <WarningOutlined style={{ color: '#f59e0b' }} />
                 <Text strong style={{ color: '#f59e0b' }}>{missingCount} backup(s) need attention</Text>
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
           {canWrite && (
             <>
               <Button icon={<PlusOutlined />} size="small" loading={creating} onClick={() => setCreateOpen(true)}>New Backup</Button>
               <Button icon={<CloudUploadOutlined />} size="small" type="primary" loading={syncing} onClick={doSync}>Sync Now</Button>
             </>
           )}
           <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
         </Space>
       </div>

       {/* Snapshot Table */}
       <Table dataSource={backups} columns={columns} rowKey="name" loading={loading} size="small" pagination={{ pageSize: 20 }} locale={{ emptyText: 'No backups yet. Click "New Backup" to create one.' }} />

       {/* Info Card */}
       {canWrite && (
         <Card size="small" style={{ marginTop: 16, background: 'rgba(30,41,59,0.3)' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
             <SettingOutlined style={{ color: '#f59e0b' }} />
             <Text strong>Backup Configuration</Text>
           </div>
           <Space direction="vertical" size="small" style={{ width: '100%' }}>
             <Text type="secondary" style={{ fontSize: 12 }}>
               Backups copy Filer LevelDB data from all filer nodes, compress and upload to S3 bucket <code>s3://seaweed-backups</code>.
             </Text>
             <Text type="secondary" style={{ fontSize: 12 }}>
               A dedicated user named <code>backup</code> with S3 access is required. Create it via <strong>S3 {'>'} Secrets / API Keys</strong> or <strong>Settings {'>'} Users</strong>.
             </Text>
             <Text type="secondary" style={{ fontSize: 12 }}>
               Restoring overwrites the filer database \u2014 restart filer service on all nodes after restore.
             </Text>
           </Space>
         </Card>
       )}

       {/* Create Backup Modal */}
       <Modal open={createOpen} title="Create Backup" onOk={doCreate} onCancel={() => setCreateOpen(false)} okText="Create Backup">
         <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
           <Input addonBefore="Name (optional)" value={snapName} onChange={(e) => setSnapName(e.target.value)} placeholder="auto-generated if empty" />
           <Text type="secondary" style={{ fontSize: 12 }}>
             Copies Filer LevelDB data from all filer nodes, compresses and uploads to S3. Includes all file metadata, collections, and directory structure.
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
           After restore completes, restart filer service on both nodes for changes to take effect.
         </Text>
       </Modal>
     </div>
   )
}
