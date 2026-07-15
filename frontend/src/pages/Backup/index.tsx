import { useState, useEffect } from 'react'
import { Card, Table, Button, Modal, Input, Statistic, Space, Tag, message, Row, Col } from 'antd'
import {
  CloudUploadOutlined,
  HistoryOutlined,
  CheckCircleFilled,
  SyncOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  CloudServerOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { getBackupStatus, triggerBackupSync, listSnapshots, createSnapshot, deleteSnapshot } from '../../services/api'
import type { BackupStatus, Snapshot } from '../../types'
import { useAuthStore } from '../../stores/authStore'

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + u[i]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

export default function BackupPage() {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [snapName, setSnapName] = useState('')
  const [snapPath, setSnapPath] = useState('/')
  const role = useAuthStore((s) => s.user?.role)
  const canWrite = role === 'admin' || role === 'operator'

  const fetch = () => {
    setLoading(true)
    Promise.all([getBackupStatus(), listSnapshots()])
      .then(([s, snap]) => { setStatus(s); setSnapshots(snap); })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const doSync = async () => {
    setSyncing(true)
    try {
      await triggerBackupSync()
      message.success('Sync completed')
      fetch()
    } catch {
      message.error('Sync failed')
    }
    setSyncing(false)
  }

  const doCreateSnapshot = async () => {
    if (!snapName.trim()) return
    await createSnapshot(snapName, snapPath)
    message.success('Snapshot created')
    setCreateOpen(false)
    setSnapName('')
    setSnapPath('/')
    fetch()
  }

  const doDelete = async (id: string) => {
    await deleteSnapshot(id)
    message.success('Snapshot deleted')
    fetch()
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Size', dataIndex: 'size', key: 'size', render: (v: number) => formatBytes(v) },
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => formatDate(v) },
    ...(canWrite
      ? [{
          title: '', key: 'actions', width: 80,
          render: (_: any, r: Snapshot) => (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => doDelete(r.id)} />
          ),
        }]
      : []),
  ]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Sync Status"
              value={status?.running ? 'Running' : status?.lastSyncAt ? 'Completed' : 'Never'}
              prefix={status?.running ? <SyncOutlined spin /> : status?.lastError ? <WarningOutlined style={{ color: '#ff4d4f' }} /> : <CheckCircleFilled style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Last Sync"
              value={formatDate(status?.lastSyncAt || null)}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Data Synced"
              value={status?.bytesSynced ? formatBytes(status.bytesSynced) : '—'}
              prefix={<CloudServerOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Snapshots"
              value={snapshots.length}
              prefix={<HistoryOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>Snapshots</span>
        <Space>
          {canWrite && (
            <>
              <Button icon={<PlusOutlined />} size="small" onClick={() => setCreateOpen(true)}>New Snapshot</Button>
              <Button icon={<CloudUploadOutlined />} size="small" type="primary" loading={syncing} onClick={doSync}>Sync Now</Button>
            </>
          )}
          <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
        </Space>
      </div>

      {status?.lastError && (
        <Tag color="error" style={{ marginBottom: 16 }}>Last error: {status.lastError}</Tag>
      )}

      <Table dataSource={snapshots} columns={columns} rowKey="id" loading={loading} size="small" pagination={false} locale={{ emptyText: 'No snapshots yet' }} />

      <Modal open={createOpen} title="Create Snapshot" onOk={doCreateSnapshot} onCancel={() => setCreateOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input addonBefore="Name" value={snapName} onChange={(e) => setSnapName(e.target.value)} placeholder="my-snapshot" style={{ flex: 1 }} />
          <Input addonBefore="Path" value={snapPath} onChange={(e) => setSnapPath(e.target.value)} placeholder="/" style={{ flex: 1 }} />
        </div>
      </Modal>
    </div>
  )
}
