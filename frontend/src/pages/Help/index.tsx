import { Card, Tabs, Typography, Alert, Table, Tag } from 'antd'
import { LinkOutlined, ApiOutlined, CloudServerOutlined } from '@ant-design/icons'

const { Title, Paragraph } = Typography

const endpoints = [
  { service: 'Dashboard UI', url: 'https://seaweed.mbm.mn', auth: 'Session (login)', note: 'Cluster management dashboard' },
  { service: 'Dashboard API', url: 'https://seaweed.mbm.mn/api', auth: 'Session + CSRF', note: 'REST API for automation' },
  { service: 'S3 Object Storage', url: 'https://s3.mbm.mn', auth: 'Access Key + Secret', note: 'S3-compatible object storage' },
  { service: 'Filer (internal)', url: 'http://172.16.0.2:8888', auth: 'Internal only', note: 'Direct filer API (VPN)' },
  { service: 'Master API (internal)', url: 'http://172.16.0.5:9333', auth: 'Internal only', note: 'Master API for volume ops (VPN)' },
]

const columns = [
  { title: 'Service', dataIndex: 'service', key: 'service' },
  { title: 'Endpoint', dataIndex: 'url', key: 'url', render: (v: string) => <code>{v}</code> },
  { title: 'Auth', dataIndex: 'auth', key: 'auth', render: (v: string) => <Tag>{v}</Tag> },
  { title: 'Note', dataIndex: 'note', key: 'note' },
]

export default function HelpPage() {
  return (
    <div>
      <Title level={3}>Documentation</Title>

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
                  message="dc03 SeaweedFS Cluster — 7 nodes, 12.6 TB raw storage"
                  style={{ marginBottom: 16 }}
                />

                <Card title="Cluster Architecture" style={{ marginBottom: 16 }}>
                  <Paragraph>
                    The dc03 cluster has <strong>7 nodes</strong> with <strong>1.8 TB XFS</strong> disk each,
                    running <strong>replication 001</strong> (2 copies: primary + 1 replica).
                    Total usable capacity: <strong>~6.3 TB</strong>.
                  </Paragraph>
                  <Paragraph>
                    <strong>3 Master nodes</strong> (.101, .103, .105) — manage topology, volume assignments, Raft consensus.<br />
                    <strong>2 Filer nodes</strong> (.102, .104) — POSIX-like file system, S3 gateway backend.<br />
                    <strong>4 S3 gateways</strong> (.102, .104, .106, .107) — S3-compatible API endpoints.
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
                  <Paragraph>
                    <strong>Examples:</strong> <code>vm-web-01</code>, <code>vm-db-02</code>, <code>backups</code>, <code>logs</code>
                  </Paragraph>
                </Card>
              </div>
            ),
          },
          {
            key: 'connect',
            label: <span><LinkOutlined /> Connect from VM</span>,
            children: (
              <div>
                <Card title="Option 1: S3 (easiest)" style={{ marginBottom: 16 }}>
                  <Paragraph>
                    Install AWS CLI and point it to the S3 gateway:
                  </Paragraph>
                  <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# Configure
aws configure set aws_access_key_id YOUR_ACCESS_KEY
aws configure set aws_secret_access_key YOUR_SECRET_KEY

# Connect to cluster S3
aws s3 --endpoint-url=https://s3.mbm.mn ls

# Upload
aws s3 --endpoint-url=https://s3.mbm.mn cp backup.tar.gz s3://my-bucket/

# Sync directory
aws s3 --endpoint-url=https://s3.mbm.mn sync /data s3://my-bucket/data`}
                  </pre>
                  <Paragraph style={{ marginTop: 8 }}>
                    <strong>Quota:</strong> Set bucket quota via Dashboard → S3 → Buckets, or via admin API.
                  </Paragraph>
                </Card>

                <Card title="Option 2: Filer API" style={{ marginBottom: 16 }}>
                  <Paragraph>
                    Use weed filer for POSIX-like operations (list, mkdir, upload, download):
                  </Paragraph>
                  <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# Through Dashboard API (recommended)
curl https://seaweed.mbm.mn/api/filer/list/ \\
  -H "Cookie: session=..."

# Create directory
curl -X POST https://seaweed.mbm.mn/api/filer/mkdir/vm-01/backups \\
  -H "Cookie: session=..." -H "X-CSRF-Token: ..."

# Upload file
curl -X POST https://seaweed.mbm.mn/api/filer/upload/vm-01/backups/ \\
  -F "files=@backup.tar.gz" \\
  -H "Cookie: session=..." -H "X-CSRF-Token: ..."`}
                  </pre>
                </Card>

                <Card title="Option 3: FUSE Mount (Linux only)" style={{ marginBottom: 16 }}>
                  <Paragraph>
                    Mount SeaweedFS as a local filesystem:
                  </Paragraph>
                  <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# Install weed
wget https://github.com/seaweedfs/seaweedfs/releases/download/3.79/linux_amd64.tar.gz
tar xzf linux_amd64.tar.gz

# Mount (VPN/internal network required)
./weed mount \\
  -filer=172.16.0.2:8888,172.16.0.4:8888 \\
  -dir=/mnt/seaweed \\
  -collection=vm-01

# Use like normal filesystem
cp data.txt /mnt/seaweed/
ls /mnt/seaweed/`}
                  </pre>
                </Card>

                <Card title="Option 4: WebDAV" style={{ marginBottom: 16 }}>
                  <pre style={{ background: '#0f172a', padding: 16, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# Mount via WebDAV (VPN/internal network required)
./weed webdav \\
  -filer=172.16.0.2:8888,172.16.0.4:8888 \\
  -port=7333

# Mount on client
mount -t davfs http://172.16.0.2:7333 /mnt/seaweed`}
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
                  <Title level={5}>Step 1: Create S3 user (one-time)</Title>
                  <Paragraph>
                    Dashboard → Users → Add User, check "Create S3 bucket". This creates:
                  </Paragraph>
                  <ul>
                    <li>S3 access key + secret key</li>
                    <li>Dedicated bucket: <code>user-vmname</code></li>
                  </ul>

                  <Title level={5}>Step 2: Set bucket quota</Title>
                  <Paragraph>
                    Dashboard → S3 → Buckets → click the bucket → set quota.
                    Or via API:
                  </Paragraph>
                  <pre style={{ background: '#0f172a', padding: 12, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`curl -X PUT https://seaweed.mbm.mn/api/s3/buckets/user-vmname \\
  -d '{"quota":107374182400}'  # 100GB in bytes`}
                  </pre>

                  <Title level={5}>Step 3: Create Collection (optional)</Title>
                  <Paragraph>
                    For dedicated volumes with specific replication:
                  </Paragraph>
                  <pre style={{ background: '#0f172a', padding: 12, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# Create 7 volumes (~100GB) for the VM
curl -X POST https://seaweed.mbm.mn/api/volumes/grow \\
  -H "Cookie: session=..." -H "X-CSRF-Token: ..." \\
  -d '{"count":7,"collection":"vm-01","replication":"001"}'`}
                  </pre>

                  <Title level={5}>Step 4: Connect from VM</Title>
                  <pre style={{ background: '#0f172a', padding: 12, borderRadius: 8, color: '#a5f3fc', overflow: 'auto' }}>
{`# On the VM:
aws configure set aws_access_key_id AKxxxxxxxx
aws configure set aws_secret_access_key yyyyyyyyyyyyyyyy
aws s3 --endpoint-url=https://s3.mbm.mn ls`}
                  </pre>
                </Card>
              </div>
            ),
          },
          {
            key: 'rbac',
            label: 'RBAC & Users',
            children: (
              <div>
                <Card title="Role-Based Access Control" style={{ marginBottom: 16 }}>
                  <Table
                    dataSource={[
                      { role: 'admin', desc: 'Full system access', perms: 'All operations, user management, settings' },
                      { role: 'operator', desc: 'Operational management', perms: 'Volumes, filer, S3, backup, workers (no user/settings changes)' },
                      { role: 'viewer', desc: 'Read-only monitoring', perms: 'View all pages, no modifications' },
                    ]}
                    columns={[
                      { title: 'Role', dataIndex: 'role', key: 'role', render: (v: string) => <Tag color={v === 'admin' ? 'pink' : v === 'operator' ? 'purple' : 'blue'}>{v}</Tag> },
                      { title: 'Description', dataIndex: 'desc', key: 'desc' },
                      { title: 'Permissions', dataIndex: 'perms', key: 'perms' },
                    ]}
                    pagination={false}
                    size="small"
                  />
                </Card>

                <Card title="User S3 Bucket Isolation">
                  <Paragraph>
                    Each user gets their own S3 bucket: <code>user-{'{username}'}</code>
                  </Paragraph>
                  <Paragraph>
                    IAM policies restrict users to only their own bucket prefix.
                    Admins can access all buckets.
                  </Paragraph>
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
    </div>
  )
}
