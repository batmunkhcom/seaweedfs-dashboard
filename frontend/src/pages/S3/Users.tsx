import { useState, useEffect } from 'react'
import { Table, Button, message, Tag, Tooltip, Modal, Input, Space, Card, Select, Typography, Row, Col } from 'antd'
import { CopyOutlined, KeyOutlined, ReloadOutlined, EyeOutlined, PlusOutlined, SyncOutlined, InfoCircleOutlined } from '@ant-design/icons'
import api from '../../services/api'
import { generateS3Key } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const { Text } = Typography

export default function S3UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [revealOpen, setRevealOpen] = useState(false)
  const [revealPw, setRevealPw] = useState('')
  const [revealedSecret, setRevealedSecret] = useState('')
  const [revealing, setRevealing] = useState(false)

  const [genOpen, setGenOpen] = useState(false)
  const [genUsername, setGenUsername] = useState('')
  const [genEmail, setGenEmail] = useState('')
  const [genPermission, setGenPermission] = useState('readwrite')
  const [genLoading, setGenLoading] = useState(false)
  const [genResult, setGenResult] = useState<any>(null)

  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === 'admin'

  const fetch = () => {
    setLoading(true)
    api.get('/s3/users').then((r) => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const doGenerate = async () => {
    if (!genUsername.trim()) { message.error('Username is required'); return }
    setGenLoading(true)
    try {
      const r = await generateS3Key({ username: genUsername.trim(), email: genEmail.trim(), permission: genPermission })
      setGenResult(r)
      message.success(r.created ? 'New API key created' : 'API key regenerated')
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Generation failed')
    }
    setGenLoading(false)
  }

  const closeGenModal = () => {
    setGenOpen(false)
    setGenUsername('')
    setGenEmail('')
    setGenPermission('readwrite')
    setGenResult(null)
    fetch()
  }

  const regenerateKeys = async (userId: number) => {
    try {
      const r = await api.post('/s3/users/' + userId + '/credentials')
      setSelected({ ...r.data, username: selected?.username, email: selected?.email })
      message.success('Keys regenerated')
      fetch()
    } catch {
      message.error('Failed')
    }
  }

  const doReveal = async () => {
    setRevealing(true)
    try {
      const r = await api.post('/s3/users/' + selected.id + '/reveal-secret', { admin_password: revealPw })
      setRevealedSecret(r.data.s3_secret_key)
      setRevealPw('')
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Verification failed')
    }
    setRevealing(false)
  }

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    message.success(label + ' copied')
  }

  const doSync = async () => {
    try {
      const r = await api.post('/s3/sync-iam')
      if (r.data.ok) message.success('IAM synced to all gateways')
      else message.warning(r.data.error || 'Partial sync')
    } catch { message.error('Sync failed') }
  }

  const activeKeys = users.filter(u => u.enabled).length

  const columns = [
    {
      title: 'Username', dataIndex: 'username', key: 'username',
      render: (v: string, r: any) => (
        <a onClick={() => { setSelected(r); setRevealedSecret(''); setDetailOpen(true) }} style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</a>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email', render: (v: string) => v || '\u2014' },
    {
      title: 'Access', dataIndex: 's3_permission', key: 's3_permission',
      render: (v: string) => v === 'readonly'
        ? <Tag color="blue">Read Only</Tag>
        : <Tag color="green">Read + Write</Tag>,
    },
    {
      title: 'Access Key', dataIndex: 's3_access_key', key: 's3_access_key',
      render: (v: string) => v ? <code style={{ fontSize: 11 }}>{v.substring(0, 14)}...</code> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Secret Key', dataIndex: 's3_secret_key', key: 's3_secret_key',
      render: (v: string) => v ? <code style={{ color: '#475569', fontSize: 11 }}>********</code> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Status', dataIndex: 'enabled', key: 'enabled',
      render: (v: any) => v ? <Tag color="green">Active</Tag> : <Tag color="red">Disabled</Tag>,
    },
  ]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Active Keys</Text>
            <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700 }}>{activeKeys}</div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Total Keys</Text>
            <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700 }}>{users.length}</div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Gateway Sync</Text>
            <div style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>
              Push IAM to S3 nodes
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        title={<><KeyOutlined style={{ marginRight: 8, color: '#f59e0b' }} />S3 API Keys ({users.length})</>}
        size="small"
        extra={
          <Space>
            <Tooltip title="Sync IAM config (s3.json) from filer to all S3 gateway nodes via SSH. Run after adding/changing keys so gateways recognize new users.">
              <Button icon={<SyncOutlined />} size="small" onClick={doSync}>
                Sync to Gateways <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 10 }} />
              </Button>
            </Tooltip>
            {isAdmin && (
              <Button icon={<PlusOutlined />} type="primary" size="small" onClick={() => setGenOpen(true)}>
                Generate Key
              </Button>
            )}
            <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
          </Space>
        }
      >
        <Table dataSource={users} columns={columns} rowKey="id" loading={loading} size="small" pagination={false} />
      </Card>

      <Modal open={detailOpen} title={<>S3 Credentials: <code>{selected?.username}</code></>} footer={null} onCancel={() => { setDetailOpen(false); setRevealedSecret('') }} width={520}>
        {selected && (
          <div>
            <p><strong>Email:</strong> {selected.email || '-'}</p>
            <p>
              <strong>Access:</strong>{' '}
              {selected.s3_permission === 'readonly'
                ? <Tag color="blue">Read Only - can list and download</Tag>
                : <Tag color="green">Read + Write - full access</Tag>
              }
            </p>
            <div style={{ background: '#0f172a', padding: 12, borderRadius: 8, marginTop: 12 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Access Key</div>
                <code style={{ color: '#a5f3fc', wordBreak: 'break-all' }}>{selected.s3_access_key}</code>
                <Tooltip title="Copy Access Key">
                  <CopyOutlined onClick={() => copyText(selected.s3_access_key, 'Access key')} style={{ marginLeft: 8, cursor: 'pointer', color: '#a855f7' }} />
                </Tooltip>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, marginBottom: 2 }}>Secret Key</div>
                {revealedSecret ? (
                  <>
                    <code style={{ color: '#fbbf24', wordBreak: 'break-all' }}>{revealedSecret}</code>
                    <Tooltip title="Copy Secret Key">
                      <CopyOutlined onClick={() => copyText(revealedSecret, 'Secret key')} style={{ marginLeft: 8, cursor: 'pointer', color: '#a855f7' }} />
                    </Tooltip>
                    <div style={{ marginTop: 4 }}>
                      <Tag color="orange"><EyeOutlined /> Visible - close modal to hide</Tag>
                    </div>
                  </>
                ) : (
                  <>
                    <code style={{ color: '#475569' }}>********************************</code>
                    <Button type="link" size="small" icon={<EyeOutlined />} style={{ marginLeft: 8 }} onClick={() => setRevealOpen(true)}>
                      Reveal (admin password required)
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Button icon={<KeyOutlined />} danger size="small" style={{ marginTop: 12 }} onClick={() => regenerateKeys(selected.id)}>
              Regenerate Keys
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        open={revealOpen}
        title="Verify Admin Password"
        onOk={doReveal}
        onCancel={() => { setRevealOpen(false); setRevealPw('') }}
        confirmLoading={revealing}
        okText="Verify & Reveal"
      >
        <div style={{ marginBottom: 12, padding: 10, background: 'rgba(245,158,11,0.1)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)' }}>
          <InfoCircleOutlined style={{ color: '#f59e0b', marginRight: 6 }} />
          <Text style={{ color: '#f59e0b', fontSize: 12 }}>
            Secret key viewing requires admin password verification. This action is logged.
          </Text>
        </div>
        <Input.Password
          value={revealPw}
          onChange={(e) => setRevealPw(e.target.value)}
          placeholder="Admin password"
          onPressEnter={doReveal}
        />
      </Modal>

      <Modal
        open={genOpen}
        title="Generate S3 API Key"
        onOk={genResult ? closeGenModal : doGenerate}
        onCancel={closeGenModal}
        confirmLoading={genLoading}
        okText={genResult ? 'Done' : 'Generate'}
        width={520}
      >
        {genResult ? (
          <div>
            <div style={{ marginBottom: 12, padding: 12, background: 'rgba(34,197,94,0.1)', borderRadius: 6, border: '1px solid rgba(34,197,94,0.2)' }}>
              <Text style={{ color: '#22c55e', fontSize: 13 }}>
                {genResult.created ? 'API key created!' : 'API key regenerated!'}
              </Text>
              <Text style={{ display: 'block', color: '#f59e0b', fontSize: 11, marginTop: 4 }}>
                Secret key shown once - copy now. Cannot view again without admin password.
              </Text>
            </div>
            <div style={{ background: '#0f172a', padding: 12, borderRadius: 8 }}>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Username</Text>
                <div><code style={{ color: '#e2e8f0' }}>{genResult.username}</code></div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Access Key</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ color: '#a5f3fc', wordBreak: 'break-all' }}>{genResult.access_key}</code>
                  <Tooltip title="Copy"><CopyOutlined onClick={() => copyText(genResult.access_key, 'Access key')} style={{ cursor: 'pointer', color: '#a855f7' }} /></Tooltip>
                </div>
              </div>
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Secret Key</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ color: '#fbbf24', wordBreak: 'break-all' }}>{genResult.secret_key}</code>
                  <Tooltip title="Copy"><CopyOutlined onClick={() => copyText(genResult.secret_key, 'Secret key')} style={{ cursor: 'pointer', color: '#a855f7' }} /></Tooltip>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                After generating keys, use <strong>Sync to Gateways</strong> to push IAM config to all S3 nodes.
              </Text>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Text style={{ display: 'block', marginBottom: 4 }}>Username:</Text>
              <Input
                value={genUsername}
                onChange={(e) => setGenUsername(e.target.value)}
                placeholder="e.g. app-backup"
                autoFocus
              />
              <Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: 'block' }}>
                If username exists, keys will be regenerated.
              </Text>
            </div>
            <div>
              <Text style={{ display: 'block', marginBottom: 4 }}>Email (optional):</Text>
              <Input value={genEmail} onChange={(e) => setGenEmail(e.target.value)} placeholder="e.g. app@mbm.mn" />
            </div>
            <div>
              <Text style={{ display: 'block', marginBottom: 4 }}>Permission:</Text>
              <Select
                value={genPermission}
                onChange={setGenPermission}
                style={{ width: '100%' }}
                options={[
                  { value: 'readwrite', label: 'Read + Write (full S3 access)' },
                  { value: 'readonly', label: 'Read Only (list + download only)' },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
