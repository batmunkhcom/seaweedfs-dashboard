import { useState, useEffect } from 'react'
import { Card, Tabs, Table, Tag, Typography, Alert } from 'antd'
import { ApiOutlined, KeyOutlined } from '@ant-design/icons'
import api from '../../services/api'

const { Title, Paragraph } = Typography

export default function ApiDocPage() {
  const [info, setInfo] = useState<any>(null)

  useEffect(() => {
    api.get('/info').then((r) => setInfo(r.data)).catch(() => {})
  }, [])

  const baseUrl = info?.endpoints?.public_dashboard || 'https://seaweed.mbm.mn'
  const s3Url = info?.endpoints?.public_s3 || 'https://s3.mbm.mn'

  const authEndpoints = [
    { method: 'POST', path: '/api/auth/login', auth: 'None (rate 5/15min)', desc: 'Login. Body: {username, password}. Returns: {user, csrfToken}', example: `curl -X POST ${baseUrl}/api/auth/login -d '{"username":"admin","password":"changeme"}'` },
    { method: 'POST', path: '/api/auth/logout', auth: 'Session', desc: 'Clear session' },
    { method: 'GET', path: '/api/auth/me', auth: 'Session', desc: 'Current user info', example: `curl ${baseUrl}/api/auth/me -b cookies.txt` },
    { method: 'GET', path: '/api/auth/csrf-token', auth: 'None', desc: 'Get CSRF token' },
  ]

  const clusterEndpoints = [
    { method: 'GET', path: '/api/info', auth: 'None', desc: 'Version, endpoints, cluster metadata' },
    { method: 'GET', path: '/api/health', auth: 'None', desc: 'Backend health check' },
    { method: 'GET', path: '/api/dashboard/stats', auth: 'Session', desc: 'Cluster KPIs (volumes, files, disk, health)' },
    { method: 'GET', path: '/api/dashboard/sse', auth: 'Session', desc: 'Real-time Server-Sent Events stream' },
    { method: 'GET', path: '/api/dashboard/alerts', auth: 'Session', desc: 'Active alerts' },
    { method: 'PUT', path: '/api/dashboard/alerts/:id/acknowledge', auth: 'Admin/Operator', desc: 'Acknowledge alert' },
    { method: 'GET', path: '/api/cluster/status', auth: 'Session', desc: 'Master cluster status' },
    { method: 'GET', path: '/api/cluster/health', auth: 'Session', desc: 'Per-node health with volume stats' },
    { method: 'GET', path: '/api/cluster/topology', auth: 'Session', desc: 'DC→Rack→Node topology tree' },
    { method: 'GET', path: '/api/dashboard/history?hours=24', auth: 'Session', desc: 'Historical metric snapshots' },
  ]

  const volumeEndpoints = [
    { method: 'GET', path: '/api/volumes', auth: 'Session', desc: 'List all volumes with server URL' },
    { method: 'GET', path: '/api/volumes/:id', auth: 'Session', desc: 'Volume detail' },
    { method: 'POST', path: '/api/volumes/grow', auth: 'Admin/Operator', desc: 'Grow new volumes. Body: {count, collection, replication}' },
    { method: 'POST', path: '/api/volumes/vacuum', auth: 'Admin/Operator', desc: 'Trigger garbage collection. Body: {garbageThreshold}' },
    { method: 'GET', path: '/api/collections', auth: 'Session', desc: 'List collections with aggregated stats' },
    { method: 'DELETE', path: '/api/collections/:name', auth: 'Admin/Operator', desc: 'Delete collection and its volumes' },
  ]

  const filerEndpoints = [
    { method: 'GET', path: '/api/filer/list/{path}', auth: 'Session', desc: 'Browse directory', example: `curl ${baseUrl}/api/filer/list/buckets/ -b cookies.txt` },
    { method: 'POST', path: '/api/filer/mkdir/{path}', auth: 'Admin/Operator', desc: 'Create directory' },
    { method: 'POST', path: '/api/filer/upload/{path}', auth: 'Admin/Operator', desc: 'Upload file(s) — multipart/form-data' },
    { method: 'DELETE', path: '/api/filer/delete/{path}', auth: 'Admin/Operator', desc: 'Delete file or directory' },
  ]

  const s3Endpoints = [
    { method: 'GET', path: '/api/s3/buckets', auth: 'Session', desc: 'List S3 buckets' },
    { method: 'POST', path: '/api/s3/buckets', auth: 'Admin/Operator', desc: 'Create bucket. Body: {name}' },
    { method: 'DELETE', path: '/api/s3/buckets/:name', auth: 'Admin/Operator', desc: 'Delete bucket' },
    { method: 'PUT', path: '/api/s3/buckets/:name/quota', auth: 'Admin/Operator', desc: 'Set bucket quota. Body: {quota}' },
    { method: 'GET', path: '/api/s3/users', auth: 'Session', desc: 'List S3 users (masked secrets)' },
    { method: 'POST', path: '/api/s3/users/:id/credentials', auth: 'Admin/Operator', desc: 'Regenerate S3 keys' },
    { method: 'POST', path: '/api/s3/users/:id/reveal-secret', auth: 'Admin', desc: 'Reveal secret key (requires admin password)' },
    { method: 'GET', path: '/api/s3/policies', auth: 'Session', desc: 'List access policies' },
    { method: 'GET', path: '/api/s3/config', auth: 'Session', desc: 'S3 endpoint config' },
  ]

  const userEndpoints = [
    { method: 'GET', path: '/api/users', auth: 'Session', desc: 'List dashboard users' },
    { method: 'GET', path: '/api/users/roles', auth: 'Session', desc: 'Available RBAC roles' },
    { method: 'POST', path: '/api/users', auth: 'Admin', desc: 'Create user + S3 credentials. Body: {username, password, firstname, lastname, email, phone?, role?, create_bucket?, s3_permission?}' },
    { method: 'PUT', path: '/api/users/:id', auth: 'Admin', desc: 'Update user (role, enabled, profile)' },
    { method: 'DELETE', path: '/api/users/:id', auth: 'Admin', desc: 'Delete user' },
    { method: 'GET', path: '/api/users/me/profile', auth: 'Session', desc: 'Get own profile' },
    { method: 'PUT', path: '/api/users/me/profile', auth: 'Session', desc: 'Update own profile' },
    { method: 'POST', path: '/api/users/me/password', auth: 'Session', desc: 'Change password' },
    { method: 'POST', path: '/api/users/me/bucket', auth: 'Session', desc: 'Create own S3 bucket' },
  ]

  const miscEndpoints = [
    { method: 'GET', path: '/api/settings', auth: 'Session', desc: 'Runtime settings' },
    { method: 'PUT', path: '/api/settings', auth: 'Admin', desc: 'Update settings. Body: {key: value, ...}' },
    { method: 'GET', path: '/api/backup/status', auth: 'Session', desc: 'Backup status' },
    { method: 'POST', path: '/api/backup/sync', auth: 'Admin/Operator', desc: 'Trigger backup sync' },
    { method: 'GET', path: '/api/workers/status', auth: 'Session', desc: 'Worker status' },
    { method: 'POST', path: '/api/workers/jobs/detect', auth: 'Admin/Operator', desc: 'Trigger job detection' },
    { method: 'GET', path: '/api/disk-health/summary', auth: 'Session', desc: 'Disk health summary' },
  ]

  const mkTable = (data: any[]) => (
    <Table
      dataSource={data}
      columns={[
        { title: 'Method', dataIndex: 'method', key: 'method', width: 80, render: (v: string) => <Tag color={v === 'GET' ? 'green' : v === 'POST' ? 'blue' : 'orange'}>{v}</Tag> },
        { title: 'Path', dataIndex: 'path', key: 'path', width: 300, render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
        { title: 'Auth', dataIndex: 'auth', key: 'auth', width: 140, render: (v: string) => <Tag>{v}</Tag> },
        { title: 'Description', dataIndex: 'desc', key: 'desc' },
      ]}
      pagination={false}
      size="small"
      rowKey="path"
    />
  )

  return (
    <div>
      <Title level={3}><ApiOutlined style={{ marginRight: 8, color: '#a855f7' }} />API Reference</Title>

      <Alert
        type="info"
        message={<span>Base URL: <code>{baseUrl}/api</code> | S3: <code>{s3Url}</code> | Auth: session cookie + CSRF header on POST/PUT/DELETE</span>}
        style={{ marginBottom: 16 }}
      />

      <Tabs
        defaultActiveKey="cluster"
        items={[
          {
            key: 'auth',
            label: <span><KeyOutlined /> Auth</span>,
            children: (
              <div>
                <Card size="small" style={{ marginBottom: 12, background: 'rgba(30,41,59,0.5)' }}>
                  <Paragraph>
                    All state-changing requests require <Tag>X-CSRF-Token</Tag> header.
                    Get CSRF token from <code>GET /api/auth/csrf-token</code>.
                    Session cookie is set automatically on login.
                  </Paragraph>
                </Card>
                {mkTable(authEndpoints)}
              </div>
            ),
          },
          {
            key: 'cluster',
            label: 'Cluster',
            children: mkTable(clusterEndpoints),
          },
          {
            key: 'volumes',
            label: 'Volumes & Collections',
            children: mkTable(volumeEndpoints),
          },
          {
            key: 'filer',
            label: 'Filer',
            children: mkTable(filerEndpoints),
          },
          {
            key: 's3',
            label: 'S3',
            children: mkTable(s3Endpoints),
          },
          {
            key: 'users',
            label: 'Users',
            children: mkTable(userEndpoints),
          },
          {
            key: 'misc',
            label: 'Settings & More',
            children: mkTable(miscEndpoints),
          },
        ]}
      />

      <Card title="S3 Usage Example" size="small" style={{ marginTop: 16, background: 'rgba(30,41,59,0.5)' }}>
        <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#a5f3fc', overflow: 'auto', fontSize: 12 }}>
{`# 1. Create S3 user (via Dashboard or API)
# 2. Get credentials from S3 → Users → click username

# 3. Configure AWS CLI
aws configure set aws_access_key_id AKxxxxxxxx
aws configure set aws_secret_access_key yyyyyyyyyyyyyyyy

# 4. Use S3
aws s3 --endpoint-url=${s3Url} ls s3://user-username/
aws s3 --endpoint-url=${s3Url} cp file.txt s3://user-username/
aws s3 --endpoint-url=${s3Url} sync ./data s3://user-username/data/`}
        </pre>
      </Card>
    </div>
  )
}
