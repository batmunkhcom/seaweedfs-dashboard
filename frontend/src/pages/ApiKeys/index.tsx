import { useState, useEffect } from 'react'
import {
  Card, Table, Button, Modal, Input, Space, Tag, message, Typography, Tooltip, Popconfirm,
  Drawer, Checkbox, Descriptions,
} from 'antd'
import {
  KeyOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CopyOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { createApiKey, listApiKeys, revokeApiKey, getApiKeyDetail, revealApiKey } from '../../services/api'
import type { ApiKey, ApiKeyDetail } from '../../types'

const { Text } = Typography

const PERMISSION_OPTIONS = [
  { label: 'Backup Read', value: 'backup:read' },
  { label: 'Backup Write', value: 'backup:write' },
  { label: 'Filer Read', value: 'filer:read' },
  { label: 'Filer Write', value: 'filer:write' },
  { label: 'S3 Read', value: 's3:read' },
  { label: 'S3 Write', value: 's3:write' },
  { label: 'Workers Read', value: 'workers:read' },
  { label: 'Workers Execute', value: 'workers:execute' },
]

function copyToClipboard(text: string, onDone?: () => void) {
  navigator.clipboard.writeText(text).then(() => {
    message.success('Copied to clipboard')
    if (onDone) onDone()
  }).catch(() => {
    message.error('Copy failed')
  })
}

function maskKey(key: string): string {
  if (!key) return '—'
  return key.substring(0, 8) + '...'
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyPerms, setNewKeyPerms] = useState<string[]>(['backup:read', 'backup:write'])
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const [revealOpen, setRevealOpen] = useState(false)
  const [revealPassword, setRevealPassword] = useState('')
  const [revealTargetId, setRevealTargetId] = useState<number | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<ApiKeyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetch = () => {
    setLoading(true)
    listApiKeys()
      .then((k) => setKeys(Array.isArray(k) ? k : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const doCreate = async () => {
    if (!newKeyName.trim()) return
    if (newKeyPerms.length === 0) {
      message.error('Select at least one permission')
      return
    }
    setCreating(true)
    try {
      const result = await createApiKey(newKeyName, newKeyPerms.join(','))
      setCreatedKey(result.key)
      message.success(`API key created: ${result.name}`)
      fetch()
      setCreateOpen(false)
      setNewKeyName('')
      setNewKeyPerms(['backup:read', 'backup:write'])
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Create failed')
    }
    setCreating(false)
  }

  const doReveal = async () => {
    if (!revealPassword || !revealTargetId) return
    setRevealing(true)
    try {
      const result = await revealApiKey(revealTargetId, revealPassword)
      setRevealedKey(result.key)
      message.success('Key revealed')
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Invalid admin password')
    }
    setRevealing(false)
  }

  const doRevoke = async (keyId: number, keyName: string) => {
    try {
      await revokeApiKey(keyId)
      message.success(`API key revoked: ${keyName}`)
      fetch()
    } catch {
      message.error('Revoke failed')
    }
  }

  const openDetail = async (keyId: number) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const d = await getApiKeyDetail(keyId)
      setDetail(d)
    } catch {
      message.error('Failed to load key detail')
    }
    setDetailLoading(false)
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      width: 180,
      render: (v: string, record: ApiKey) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>{maskKey(v)}</Text>
          <Tooltip title={copiedId === record.id ? 'Copied!' : 'Copy key'}>
            <Button
              size="small"
              type="text"
              icon={copiedId === record.id ? <CheckOutlined style={{ color: '#22c55e' }} /> : <CopyOutlined />}
              onClick={() => {
                copyToClipboard(v, () => {
                  setCopiedId(record.id)
                  setTimeout(() => setCopiedId(null), 1500)
                })
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Permissions',
      dataIndex: 'permissions',
      key: 'permissions',
      width: 200,
      render: (perms: string) => perms.split(',').map(p => <Tag key={p} color="blue">{p}</Tag>),
    },
    {
      title: 'Usage',
      dataIndex: 'usage_count',
      key: 'usage_count',
      width: 80,
      render: (v: number) => v || 0,
    },
    {
      title: 'Last Used',
      dataIndex: 'last_used_at',
      key: 'last_used_at',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString() : 'Never',
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (active: number) => active
        ? <Tag color="green"><CheckCircleOutlined /> Active</Tag>
        : <Tag color="red"><CloseCircleOutlined /> Revoked</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 180,
      render: (_: any, record: ApiKey) => (
        <Space size="small">
          <Tooltip title="View details">
            <Button size="small" icon={<InfoCircleOutlined />} onClick={() => openDetail(record.id)} />
          </Tooltip>
          <Tooltip title="Reveal full key (admin password required)">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => { setRevealTargetId(record.id); setRevealOpen(true); setRevealPassword(''); setRevealedKey(null) }}
              disabled={!record.is_active}
            />
          </Tooltip>
          {record.is_active && (
            <Popconfirm
              title="Revoke this API key?"
              onConfirm={() => doRevoke(record.id, record.name)}
              okText="Revoke"
              cancelText="Cancel"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card
        title={
          <Space>
            <KeyOutlined />
            <span>API Keys Management</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetch}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Create Key
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={keys}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: 'No API keys yet. Click "Create Key" to generate one.' }}
        />
      </Card>

      <Modal
        open={createOpen}
        title="Create API Key"
        onOk={doCreate}
        onCancel={() => { setCreateOpen(false); setNewKeyName(''); setNewKeyPerms(['backup:read', 'backup:write']) }}
        okText="Create"
        confirmLoading={creating}
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            addonBefore="Key Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g., Backup Service Key"
          />
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Permissions</Text>
            <Checkbox.Group
              options={PERMISSION_OPTIONS}
              value={newKeyPerms}
              onChange={(v) => setNewKeyPerms(v as string[])}
            />
          </div>
          <Text type="secondary">
            Select which services and operations this key can access.
          </Text>
        </div>
      </Modal>

      <Modal
        open={!!createdKey}
        title="API Key Created"
        onCancel={() => setCreatedKey(null)}
        footer={[
          <Button key="copy" type="primary" onClick={() => copyToClipboard(createdKey!)}>
            Copy Key
          </Button>,
          <Button key="close" onClick={() => setCreatedKey(null)}>Close</Button>,
        ]}
      >
        <p style={{ marginBottom: 8 }}>Your new API key:</p>
        <div style={{ background: '#1e293b', padding: 12, borderRadius: 4, fontFamily: 'monospace', wordBreak: 'break-all', color: '#e2e8f0' }}>
          {createdKey}
        </div>
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          This key will not be shown again. Store it securely!
        </Text>
      </Modal>

      <Modal
        open={revealOpen}
        title="Reveal API Key"
        onOk={doReveal}
        onCancel={() => { setRevealOpen(false); setRevealPassword(''); setRevealedKey(null) }}
        okText="Reveal"
        confirmLoading={revealing}
        okButtonProps={{ disabled: !revealPassword }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input.Password
            placeholder="Enter your admin password to reveal this key"
            value={revealPassword}
            onChange={(e) => setRevealPassword(e.target.value)}
          />
          {revealedKey && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 4 }}>Full Key:</Text>
              <div style={{ background: '#1e293b', padding: 10, borderRadius: 4, fontFamily: 'monospace', wordBreak: 'break-all', color: '#e2e8f0', marginBottom: 8 }}>
                {revealedKey}
              </div>
              <Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(revealedKey)}>
                Copy Key
              </Button>
            </div>
          )}
          <Text type="secondary">Enter your admin password to view the full API key.</Text>
        </div>
      </Modal>

      <Drawer
        title="API Key Detail"
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetail(null) }}
        width={400}
        loading={detailLoading}
      >
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
            <Descriptions.Item label="Name">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="Permissions">
              <Space wrap size={[0, 4]}>
                {detail.permissions.map(p => <Tag key={p} color="blue">{p}</Tag>)}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Created By">{detail.created_by}</Descriptions.Item>
            <Descriptions.Item label="Created At">{detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Usage Count">{detail.usage_count}</Descriptions.Item>
            <Descriptions.Item label="Last Used">{detail.last_used_at ? new Date(detail.last_used_at).toLocaleString() : 'Never'}</Descriptions.Item>
            <Descriptions.Item label="Last Endpoint">{detail.last_used_endpoint || '—'}</Descriptions.Item>
            <Descriptions.Item label="Status">
              {detail.is_active
                ? <Tag color="green"><CheckCircleOutlined /> Active</Tag>
                : <Tag color="red"><CloseCircleOutlined /> Revoked</Tag>}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  )
}
