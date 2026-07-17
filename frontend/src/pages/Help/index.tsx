import { useState, useEffect } from 'react'
import { Card, Tabs, Typography, Alert, Table, Tag, Spin } from 'antd'
import { LinkOutlined, ApiOutlined, CloudServerOutlined } from '@ant-design/icons'
import api from '../../services/api'

const { Title, Paragraph } = Typography

export default function HelpPage() {
  const [info, setInfo] = useState<any>(null)
  const [infoLoading, setInfoLoading] = useState(true)

  useEffect(() => {
    api.get('/info').then((r) => setInfo(r.data)).catch(() => {}).finally(() => setInfoLoading(false))
  }, [])

  const endpoints = info ? [
    { service: 'Dashboard UI', url: info.endpoints?.public_dashboard || '/', auth: 'Session (login)', note: 'Cluster management dashboard' },
    { service: 'Dashboard API', url: (info.endpoints?.public_dashboard || '') + '/api', auth: 'Session + CSRF', note: 'REST API for automation' },
    { service: 'S3 Object Storage', url: info.endpoints?.public_s3 || '', auth: 'Access Key + Secret', note: 'S3-compatible object storage' },
    { service: 'Filer (internal)', url: info.endpoints?.internal_filer || '', auth: 'Internal only', note: 'Direct filer API (VPN)' },
    { service: 'Master API (internal)', url: info.endpoints?.internal_master || '', auth: 'Internal only', note: 'Master API for volume ops (VPN)' },
  ] : []

  const columns = [
    { title: 'Service', dataIndex: 'service', key: 'service' },
    { title: 'Endpoint', dataIndex: 'url', key: 'url', render: (v: string) => <code>{v}</code> },
    { title: 'Auth', dataIndex: 'auth', key: 'auth', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Note', dataIndex: 'note', key: 'note' },
  ]

  const clust = info?.cluster || {}
  const about = info?.about || {}

  return (
    <div>
      <Title level={3}>
        Documentation {info && <Tag color="purple" style={{ marginLeft: 8 }}>v{info.version}</Tag>}
      </Title>

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: <span><CloudServerOutlined /> Overview</span>,
            children: (
              <div>
                <Alert
                  type="info"
                  message={`${clust.name || 'dc03'} Cluster — ${clust.nodes || 7} nodes, replication ${clust.replication || '001'}`}
                  style={{ marginBottom: 16 }}
                />

                <Card title="Cluster Architecture" style={{ marginBottom: 16 }}>
                  <Paragraph>
                    The <strong>{clust.name || 'dc03'}</strong> cluster has <strong>{clust.nodes || 7} nodes</strong> in
                    datacenter <strong>{clust.datacenter || 'dc03'}</strong>, rack <strong>{clust.rack || 'rack2'}</strong>,
                    running <strong>replication {clust.replication || '001'}</strong> (2 copies: primary + 1 replica).
                  </Paragraph>
                  <Paragraph>
                    <strong>Masters:</strong> {Array.isArray(clust.masters) ? clust.masters.join(', ') : '—'}<br />
                    <strong>Filers:</strong> {Array.isArray(clust.filers) ? clust.filers.join(', ') : '—'}
                  </Paragraph>
                </Card>

                <Card title="Public Endpoints" style={{ marginBottom: 16 }}>
                  <Table dataSource={endpoints} columns={columns} pagination={false} size="small" />
                </Card>

                <Card title="Collections">
                  <Paragraph>
                    Collections are <strong>namespaces</strong> for grouping volumes. Each collection can have
                    different replication policies and volume quotas.
                  </Paragraph>
                  <Paragraph>
                    <strong>Default:</strong> empty string <code>""</code> — all volumes belong here unless specified.<br />
                    <strong>Use cases:</strong> Separate storage for different VMs, apps, or environments.
                  </Paragraph>
                </Card>
              </div>
            ),
          },
          {
            key: 'connect',
            label: <span><LinkOutlined /> Connect from VM</span>,
            children: infoLoading ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : (
              <div>
                <Card title="Option 1: S3 (easiest)" style={{ marginBottom: 16 }}>
                  <Paragraph>Install AWS CLI and point it to the S3 gateway:</Paragraph>
                  <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# Configure
aws configure set aws_access_key_id YOUR_ACCESS_KEY
aws configure set aws_secret_access_key YOUR_SECRET_KEY

# Use the S3 endpoint
aws s3 --endpoint-url=${info?.endpoints?.public_s3 || ''} ls
aws s3 --endpoint-url=${info?.endpoints?.public_s3 || ''} cp file.tar.gz s3://my-bucket/
aws s3 --endpoint-url=${info?.endpoints?.public_s3 || ''} sync /data s3://my-bucket/data`}
                  </pre>
                </Card>

                <Card title="Option 2: Dashboard API" style={{ marginBottom: 16 }}>
                  <Paragraph>Use Dashboard REST API through the public endpoint:</Paragraph>
                  <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# List directory
curl ${info?.endpoints?.public_dashboard || ''}/api/filer/list/vm-01/ \\
  -H "Cookie: session=..."

# Upload file
curl -X POST ${info?.endpoints?.public_dashboard || ''}/api/filer/upload/vm-01/ \\
  -F "files=@backup.tar.gz" \\
  -H "Cookie: session=..." -H "X-CSRF-Token: ..."`}
                  </pre>
                </Card>

                <Card title="Option 3: FUSE Mount" style={{ marginBottom: 16 }}>
                  <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# Mount (VPN/internal network required)
./weed mount \\
  -filer=${info?.endpoints?.internal_filer || ''} \\
  -dir=/mnt/seaweed \\
  -collection=vm-01`}
                  </pre>
                </Card>

                <Card title="Option 4: WebDAV" style={{ marginBottom: 16 }}>
                  <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# Run WebDAV server
./weed webdav \\
  -filer=${info?.endpoints?.internal_filer || ''} \\
  -port=7333

# Mount on client
mount -t davfs http://${info?.endpoints?.internal_filer?.split(':')[0] || ''}:7333 /mnt/seaweed`}
                  </pre>
                </Card>
              </div>
            ),
          },
          {
            key: 'storage',
            label: <span><ApiOutlined /> Allocate Storage</span>,
            children: (
              <div>
                <Card title="How to give 100GB storage to a VM" style={{ marginBottom: 16 }}>
                  <Title level={5}>Step 1: Create S3 user</Title>
                  <Paragraph>Dashboard → Users → Add User, check "Create S3 bucket".</Paragraph>

                  <Title level={5}>Step 2: Set bucket quota</Title>
                  <Paragraph>Dashboard → S3 → Buckets → set quota. Or via API:</Paragraph>
                  <pre style={{ background: '#0f172a', padding: 12, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`curl -X PUT ${info?.endpoints?.public_dashboard || ''}/api/s3/buckets/user-vmname \\
  -d '{"quota":107374182400}'  # 100GB`}
                  </pre>

                  <Title level={5}>Step 3: Create Collection (optional)</Title>
                  <pre style={{ background: '#0f172a', padding: 12, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# 7 volumes × ~15GB ≈ 105GB
curl -X POST ${info?.endpoints?.public_dashboard || ''}/api/volumes/grow \\
  -d '{"count":7,"collection":"vm-01","replication":"001"}'`}
                  </pre>

                  <Title level={5}>Step 4: Connect from VM</Title>
                  <pre style={{ background: '#0f172a', padding: 12, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`aws configure set aws_access_key_id AKxxxxxxxx
aws configure set aws_secret_access_key yyyyyyyyyyyy
aws s3 --endpoint-url=${info?.endpoints?.public_s3 || ''} ls`}
                  </pre>
                </Card>
              </div>
            ),
          },
          {
            key: 'rbac',
            label: 'RBAC & Users',
            children: (
              <Card title="Role-Based Access Control" style={{ marginBottom: 16 }}>
                <Table
                  dataSource={[
                    { role: 'admin', desc: 'Full system access', perms: 'All operations, user management, settings' },
                    { role: 'operator', desc: 'Operational management', perms: 'Volumes, filer, S3, backup, workers (no user/settings changes)' },
                    { role: 'viewer', desc: 'Read-only monitoring', perms: 'View all pages, no modifications' },
                    { role: 'user', desc: 'Standard dashboard access', perms: 'Dashboard, cluster, volumes, filer, S3 — limited sidebar' },
                  ]}
                  columns={[
                    { title: 'Role', dataIndex: 'role', key: 'role', render: (v: string) => {
                      const colors: Record<string, string> = { admin: 'pink', operator: 'purple', viewer: 'blue', user: 'cyan' }
                      return <Tag color={colors[v] || 'blue'}>{v}</Tag>
                    }},
                    { title: 'Description', dataIndex: 'desc', key: 'desc' },
                    { title: 'Permissions', dataIndex: 'perms', key: 'perms' },
                  ]}
                  pagination={false}
                  size="small"
                />
              </Card>
            ),
          },
          {
            key: 'wiki',
            label: 'Wiki & Flows',
            children: (
              <div>
                <Card title="Documentation Wiki" style={{ marginBottom: 16 }}>
                  <Paragraph>
                    Full documentation is available in the <code>wiki/</code> directory:
                  </Paragraph>
                  <ul>
                    <li><a href="/wiki/getting-started.html" target="_blank">Getting Started</a> — Installation &amp; setup</li>
                    <li><a href="/wiki/dashboard.html" target="_blank">Dashboard</a> — KPI cards, SSE, charts, alerts</li>
                    <li><a href="/wiki/cluster.html" target="_blank">Cluster &amp; Topology</a> — Node management, leader election</li>
                    <li><a href="/wiki/volumes.html" target="_blank">Volumes &amp; Collections</a> — Grow, vacuum, capacity planning</li>
                    <li><a href="/wiki/s3.html" target="_blank">S3 Management</a> — Buckets, users, policies, IAM sync</li>
                    <li><a href="/wiki/backup.html" target="_blank">Backup &amp; Restore</a> — Filer metadata snapshots, restore flow</li>
                    <li><a href="/wiki/workers.html" target="_blank">Workers</a> — Job management, detect/execute</li>
                    <li><a href="/wiki/disk-health.html" target="_blank">Disk Health</a> — S.M.A.R.T. monitoring</li>
                    <li><a href="/wiki/api-keys.html" target="_blank">API Keys</a> — Key creation, permissions, usage tracking</li>
                    <li><a href="/wiki/users.html" target="_blank">Users &amp; RBAC</a> — Roles, permissions, profile</li>
                    <li><a href="/wiki/glossary.html" target="_blank">Glossary</a> — SeaweedFS terminology</li>
                    <li><a href="/wiki/api-reference.html" target="_blank">API Reference</a> — Full endpoint documentation</li>
                  </ul>
                </Card>
                <Card title="Flow Diagrams" style={{ marginBottom: 16 }}>
                  <Paragraph>Visual walkthroughs of key system processes (<code>wiki/flow/</code>):</Paragraph>
                  <ul>
                    <li><a href="/wiki/flow/system-architecture.html" target="_blank">System Architecture</a></li>
                    <li><a href="/wiki/flow/auth-flow.html" target="_blank">Authentication Flow</a></li>
                    <li><a href="/wiki/flow/backup-flow.html" target="_blank">Backup Flow</a></li>
                    <li><a href="/wiki/flow/restore-flow.html" target="_blank">Restore Flow</a></li>
                    <li><a href="/wiki/flow/api-key-auth-flow.html" target="_blank">API Key Authentication</a></li>
                    <li><a href="/wiki/flow/volume-lifecycle.html" target="_blank">Volume Lifecycle</a></li>
                    <li><a href="/wiki/flow/s3-iam-sync.html" target="_blank">S3 IAM Sync</a></li>
                    <li><a href="/wiki/flow/disk-health-scan.html" target="_blank">Disk Health Scan</a></li>
                    <li><a href="/wiki/flow/sse-real-time.html" target="_blank">SSE Real-Time Data</a></li>
                    <li><a href="/wiki/flow/master-failover.html" target="_blank">Master Failover</a></li>
                  </ul>
                </Card>
              </div>
            ),
          },
          {
            key: 'api',
            label: <span><ApiOutlined /> API Reference</span>,
            children: (
              <Card title="Dashboard REST API">
                <Table
                  dataSource={[
                    { method: 'GET', path: '/api/info', auth: 'None', desc: 'Version, endpoints, cluster info' },
                    { method: 'GET', path: '/api/health', auth: 'None', desc: 'Health check' },
                    { method: 'POST', path: '/api/auth/login', auth: 'None', desc: 'Login (rate-limited: 5/15min)' },
                    { method: 'GET', path: '/api/dashboard/stats', auth: 'Session', desc: 'Cluster KPIs' },
                    { method: 'GET', path: '/api/cluster/topology', auth: 'Session', desc: 'DC/Rack/Node tree' },
                    { method: 'GET', path: '/api/volumes', auth: 'Session', desc: 'List volumes' },
                    { method: 'POST', path: '/api/volumes/grow', auth: 'Admin/Operator', desc: 'Grow volumes' },
                    { method: 'POST', path: '/api/volumes/vacuum', auth: 'Admin/Operator', desc: 'Vacuum garbage' },
                    { method: 'GET', path: '/api/filer/list/{path}', auth: 'Session', desc: 'Browse filer' },
                    { method: 'POST', path: '/api/filer/upload/{path}', auth: 'Admin/Operator', desc: 'Upload file' },
                    { method: 'GET', path: '/api/s3/buckets', auth: 'Session', desc: 'List S3 buckets' },
                    { method: 'POST', path: '/api/s3/buckets', auth: 'Admin/Operator', desc: 'Create S3 bucket' },
                    { method: 'GET', path: '/api/users', auth: 'Session', desc: 'List users' },
                    { method: 'POST', path: '/api/users', auth: 'Admin', desc: 'Create user + S3 credentials' },
                    { method: 'GET', path: '/api/settings', auth: 'Session', desc: 'Runtime settings' },
                    { method: 'PUT', path: '/api/settings', auth: 'Admin', desc: 'Update settings' },
                    { method: 'GET', path: '/api/dashboard/sse', auth: 'Session', desc: 'Real-time SSE stream' },
                  ]}
                  columns={[
                    { title: 'Method', dataIndex: 'method', key: 'method', render: (v: string) => <Tag color={v === 'GET' ? 'green' : v === 'POST' ? 'blue' : 'orange'}>{v}</Tag> },
                    { title: 'Path', dataIndex: 'path', key: 'path', render: (v: string) => <code>{v}</code> },
                    { title: 'Auth', dataIndex: 'auth', key: 'auth', render: (v: string) => <Tag>{v}</Tag> },
                    { title: 'Description', dataIndex: 'desc', key: 'desc' },
                  ]}
                  pagination={false}
                  size="small"
                />
              </Card>
            ),
          },
        ]}
      />

      <div style={{ marginTop: 32, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
        {about.name} by {about.developer} — {about.website}
      </div>
    </div>
  )
}
