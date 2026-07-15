import { useState, useEffect } from 'react'
import { Table, Button, message, Tag, Tooltip, Modal, Space } from 'antd'
import { CopyOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons'
import api from '../../services/api'

export default function S3UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const fetch = () => {
    setLoading(true)
    api.get('/s3/users').then((r) => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const regenerateKeys = async (userId: number) => {
    try {
      const r = await api.post(`/s3/users/${userId}/credentials`)
      message.success('Keys regenerated')
      setSelected({ ...r.data, username: selected?.username, email: selected?.email })
      fetch()
    } catch {
      message.error('Failed')
    }
  }

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    message.success(`${label} copied`)
  }

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string, r: any) => <a onClick={() => { setSelected(r); setDetailOpen(true) }}>{v}</a> },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Role', dataIndex: 'role', key: 'role', render: (v: string) => <Tag color={v === 'admin' ? 'pink' : v === 'operator' ? 'purple' : 'blue'}>{v}</Tag> },
    { title: 'Access Key', dataIndex: 's3_access_key', key: 's3_access_key', render: (v: string) => v ? <code>{v.substring(0, 16)}...</code> : '—' },
    { title: 'Status', dataIndex: 'enabled', key: 'enabled', render: (v: any) => v ? <Tag color="green">Active</Tag> : <Tag color="red">Disabled</Tag> },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h3>S3 Users</h3>
        <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
      </Space>

      <Table dataSource={users} columns={columns} rowKey="id" loading={loading} size="small" pagination={false} />

      <Modal open={detailOpen} title={`S3 Credentials: ${selected?.username}`} footer={null} onCancel={() => setDetailOpen(false)} width={500}>
        {selected && (
          <div>
            <p><strong>Email:</strong> {selected.email}</p>
            <p><strong>Role:</strong> {selected.role}</p>
            <div style={{ background: '#0f172a', padding: 12, borderRadius: 8, marginTop: 12 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Access Key</div>
                <code style={{ color: '#a5f3fc', wordBreak: 'break-all' }}>{selected.s3_access_key}</code>
                <Tooltip title="Copy"><CopyOutlined onClick={() => copyText(selected.s3_access_key, 'Access key')} style={{ marginLeft: 8, cursor: 'pointer', color: '#a855f7' }} /></Tooltip>
              </div>
              {selected.s3_secret_key && (
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Secret Key</div>
                  <code style={{ color: '#fbbf24', wordBreak: 'break-all' }}>{selected.s3_secret_key}</code>
                  <Tooltip title="Copy"><CopyOutlined onClick={() => copyText(selected.s3_secret_key, 'Secret key')} style={{ marginLeft: 8, cursor: 'pointer', color: '#a855f7' }} /></Tooltip>
                </div>
              )}
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
    </div>
  )
}
