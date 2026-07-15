import { useState, useEffect } from 'react'
import { Table, Tag, Card, Typography, Spin } from 'antd'
import api from '../../services/api'

const { Text } = Typography

export default function S3PoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/s3/policies').then((r) => setPolicies(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  const columns = [
    { title: 'Policy', dataIndex: 'name', key: 'name', render: (v: string) => <code>{v}</code> },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Principal', dataIndex: 'principal', key: 'principal', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Effect', dataIndex: 'effect', key: 'effect', render: (v: string) => <Tag color="green">{v}</Tag> },
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
      <h3>S3 Access Policies</h3>

      <Card size="small" style={{ marginBottom: 16, background: 'rgba(30,41,59,0.5)' }}>
        <Text type="secondary">
          Each user with S3 credentials automatically gets a policy that restricts access to their own bucket (<code>user-&#123;username&#125;</code>).
          Admins can access all buckets.
        </Text>
      </Card>

      <Table dataSource={policies} columns={columns} rowKey="name" size="small" pagination={false} />
    </div>
  )
}
