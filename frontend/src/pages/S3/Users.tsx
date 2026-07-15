import { useState, useEffect } from 'react'
import { Table, Button, message, Tag, Tooltip, Modal, Input, Space } from 'antd'
import { CopyOutlined, KeyOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons'
import api from '../../services/api'

export default function S3UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [revealOpen, setRevealOpen] = useState(false)
  const [revealPw, setRevealPw] = useState('')
  const [revealedSecret, setRevealedSecret] = useState('')
  const [revealing, setRevealing] = useState(false)

  const fetch = () => {
    setLoading(true)
    api.get('/s3/users').then((r) => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const regenerateKeys = async (userId: number) => {
    try {
      const r = await api.post(`/s3/users/${userId}/credentials`)
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
      const r = await api.post(`/s3/users/${selected.id}/reveal-secret`, {
        admin_password: revealPw,
      })
      setRevealedSecret(r.data.s3_secret_key)
      setRevealPw('')
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Verification failed')
    }
    setRevealing(false)
  }

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    message.success(`${label} copied`)
  }

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string, r: any) => <a onClick={() => { setSelected(r); setRevealedSecret(''); setDetailOpen(true) }}>{v}</a> },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'S3 Access', dataIndex: 's3_permission', key: 's3_permission',
      render: (v: string) => v === 'readonly'
        ? <Tag color="blue">Read Only</Tag>
        : <Tag color="green">Read + Write</Tag>,
    },
    { title: 'Access Key', dataIndex: 's3_access_key', key: 's3_access_key', render: (v: string) => v ? <code>{v.substring(0, 12)}••••</code> : '—' },
    { title: 'Secret Key', dataIndex: 's3_secret_key', key: 's3_secret_key', render: (v: string) => v ? <code style={{ color: '#64748b' }}>{v}</code> : '—' },
    { title: 'Status', dataIndex: 'enabled', key: 'enabled', render: (v: any) => v ? <Tag color="green">Active</Tag> : <Tag color="red">Disabled</Tag> },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h3>S3 Users</h3>
        <Space>
          <Button
            icon={<KeyOutlined />}
            size="small"
            type="primary"
            onClick={async () => {
              try {
                const r = await api.post('/s3/sync-iam')
                if (r.data.ok) message.success('IAM synced to all gateways')
                else message.warning(r.data.error || 'Partial sync')
              } catch { message.error('Sync failed') }
            }}
          >
            Sync to Gateways
          </Button>
          <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
        </Space>
      </Space>

      <Table dataSource={users} columns={columns} rowKey="id" loading={loading} size="small" pagination={false} />

      <Modal open={detailOpen} title={`S3 Credentials: ${selected?.username}`} footer={null} onCancel={() => { setDetailOpen(false); setRevealedSecret('') }} width={520}>
        {selected && (
          <div>
            <p><strong>Email:</strong> {selected.email}</p>
            <p>
              <strong>Permission:</strong>{' '}
              {selected.s3_permission === 'readonly'
                ? <Tag color="blue">Read Only — can list and download</Tag>
                : <Tag color="green">Read + Write — full access</Tag>
              }
            </p>
            <div style={{ background: '#0f172a', padding: 12, borderRadius: 8, marginTop: 12 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Access Key</div>
                <code style={{ color: '#a5f3fc', wordBreak: 'break-all' }}>{selected.s3_access_key}</code>
                <Tooltip title="Copy"><CopyOutlined onClick={() => copyText(selected.s3_access_key, 'Access key')} style={{ marginLeft: 8, cursor: 'pointer', color: '#a855f7' }} /></Tooltip>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Secret Key</div>
                {revealedSecret ? (
                  <>
                    <code style={{ color: '#fbbf24', wordBreak: 'break-all' }}>{revealedSecret}</code>
                    <Tooltip title="Copy"><CopyOutlined onClick={() => copyText(revealedSecret, 'Secret key')} style={{ marginLeft: 8, cursor: 'pointer', color: '#a855f7' }} /></Tooltip>
                    <div style={{ marginTop: 4 }}>
                      <Tag color="orange"><EyeOutlined /> Visible — close modal to hide</Tag>
                    </div>
                  </>
                ) : (
                  <>
                    <code style={{ color: '#475569' }}>••••••••••••••••••••••••••••••••</code>
                    <Button
                      type="link"
                      size="small"
                      icon={<EyeOutlined />}
                      style={{ marginLeft: 8 }}
                      onClick={() => setRevealOpen(true)}
                    >
                      Reveal
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Button
              icon={<KeyOutlined />}
              danger
              size="small"
              style={{ marginTop: 12 }}
              onClick={() => regenerateKeys(selected.id)}
            >
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
        <p style={{ color: '#94a3b8', marginBottom: 12 }}>
          For security, enter your admin password to view the secret key.
          This action is logged.
        </p>
        <Input.Password
          value={revealPw}
          onChange={(e) => setRevealPw(e.target.value)}
          placeholder="Admin password"
          onPressEnter={doReveal}
        />
      </Modal>
    </div>
  )
}
