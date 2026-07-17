import { useState, useEffect } from 'react'
import { Table, Tag, Card, Typography, Button, Space, Select, Row, Col, Tooltip, message } from 'antd'
import { SyncOutlined, CheckCircleOutlined, InfoCircleOutlined, EditOutlined } from '@ant-design/icons'
import api from '../../services/api'

const { Text } = Typography

export default function S3PoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([])
  const [syncStatus, setSyncStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [editingUsername, setEditingUsername] = useState<string | null>(null)
  const [editPerm, setEditPerm] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchAll = () => {
    setLoading(true)
    Promise.all([
      api.get('/s3/policies').then((r) => setPolicies(r.data || [])),
      api.get('/s3/sync-status').then((r) => setSyncStatus(r.data || {})),
     ]).catch(() => {}).finally(() => setLoading(false))
   }

  useEffect(() => { fetchAll() }, [])

  const doSync = async () => {
    setSyncing(true)
    try {
      const r = await api.post('/s3/sync-iam')
      if (r.data.ok) {
        message.success(`IAM synced to ${Object.values(r.data.results || {}).filter(Boolean).length} gateways`)
        setSyncStatus({ ...syncStatus, last_sync: r.data.last_sync })
       } else {
        message.warning(r.data.error || 'Partial sync')
       }
     } catch { message.error('Sync failed') }
    setSyncing(false)
    fetchAll()
   }

  const startEdit = (username: string, currentPerm: string) => {
    setEditingUsername(username)
    setEditPerm(currentPerm)
   }

  const saveEdit = async (username: string) => {
    setSaving(true)
    try {
      await api.put('/s3/policies/user-' + username, { permission: editPerm })
      message.success('Policy updated')
      setEditingUsername(null)
      fetchAll()
     } catch (e: any) {
      message.error(e.response?.data?.detail || 'Update failed')
     }
    setSaving(false)
   }

  const cancelEdit = () => { setEditingUsername(null); setEditPerm('') }

  const formatSyncTime = (iso?: string) => {
    if (!iso) return 'Never'
    try {
      return new Date(iso).toLocaleString()
     } catch { return iso }
   }

  const gatewayStatuses = syncStatus?.gateways || []
  const lastSync = syncStatus?.last_sync

  const columns = [
     { title: 'Policy', dataIndex: 'name', key: 'name', render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
     { title: 'Principal', dataIndex: 'principal', key: 'principal', width: 150, render: (v: string) => <Tag>{v}</Tag> },
     {
      title: 'Permission', dataIndex: 'permission', key: 'permission', width: 200,
      render: (perm: string, record: any) => {
        if (editingUsername === record.principal) {
          return (
             <Space size={4}>
               <Select value={editPerm} onChange={setEditPerm} size="small" style={{ width: 120 }} options={[{value: 'readonly', label: 'Read Only'}, {value: 'readwrite', label: 'Read+Write'}]} />
               <Button type="link" size="small" loading={saving} onClick={() => saveEdit(record.principal)} icon={<CheckCircleOutlined />} />
               <Button type="link" size="small" disabled={saving} onClick={cancelEdit} style={{ color: '#94a3b8' }} />
              </Space>
           )
         }
        return (
           <Space>
             <Tag color={perm === 'readonly' ? 'blue' : 'green'}>{perm === 'readonly' ? 'Read Only' : 'Read+Write'}</Tag>
             <EditOutlined onClick={() => startEdit(record.principal, perm)} style={{ cursor: 'pointer', color: '#94a3b8' }} />
            </Space>
         )
       },
     },
     { title: 'Effect', dataIndex: 'effect', key: 'effect', width: 100, render: (v: string) => <Tag color="green">{v}</Tag> },
     {
      title: 'Resources', dataIndex: 'resources', key: 'resources',
      render: (v: string[]) => v?.map((r: string) => <Tag key={r} style={{ marginBottom: 2 }}>{r}</Tag>),
     },
     {
      title: 'Actions', dataIndex: 'actions', key: 'actions',
      render: (v: string[]) => v?.map((a: string) => <Tag key={a} color="purple">{a}</Tag>),
     },
   ]

  return (
     <div>
       <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
         <Col xs={24} sm={12} md={8}>
           <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: lastSync ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(99,102,241,0.15)' }}>
             <Text type="secondary" style={{ fontSize: 12 }}>Last Sync</Text>
             <div style={{ marginTop: 4, fontSize: 13, color: lastSync ? '#22c55e' : '#64748b' }}>
               {lastSync ? formatSyncTime(lastSync) : 'Never synced'}
              </div>
           </Card>
         </Col>
         <Col xs={24} sm={12} md={8}>
           <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
             <Text type="secondary" style={{ fontSize: 12 }}>Gateways</Text>
             <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
               {gatewayStatuses.map((host: string) => (
                 <Tooltip key={host} title={host}>
                   <Tag color="cyan" style={{ cursor: 'default', margin: 0 }}>{host.split('.').pop()}</Tag>
                  </Tooltip>
                ))}
              </div>
           </Card>
         </Col>
         <Col xs={24} sm={12} md={8}>
           <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
             <Text type="secondary" style={{ fontSize: 12 }}>Policies</Text>
             <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700 }}>{policies.length}</div>
           </Card>
         </Col>
       </Row>

       <Card
        title={<><SyncOutlined style={{ marginRight: 8, color: '#6366f1' }} />S3 IAM Policies</>}
        size="small"
        extra={
          <Space>
            <Tooltip title="Push s3.json IAM config from filer to all S3 gateway nodes via SSH. Required after adding/changing API keys or permissions.">
              <InfoCircleOutlined style={{ color: '#94a3b8' }} />
             </Tooltip>
            <Button icon={<SyncOutlined />} size="small" loading={syncing} onClick={doSync}>
              Sync to Gateways
             </Button>
           </Space>
         }
       >
         <Table dataSource={policies} columns={columns} rowKey="name" loading={loading} size="small" pagination={false} />
       </Card>

       {lastSync && (
         <Card size="small" style={{ marginTop: 16, background: 'rgba(30,41,59,0.3)' }}>
           <Text type="secondary" style={{ fontSize: 12 }}>
             <InfoCircleOutlined style={{ marginRight: 4 }} />
             Each user with S3 credentials automatically gets a policy restricting access to their own bucket (user-&#123;username&#125;).
             Admins can access all buckets. Changes require a gateway sync to take effect.
            </Text>
          </Card>
        )}
     </div>
   )
 }
