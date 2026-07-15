import { useEffect, useState } from 'react'
import { Card, Typography, Tag } from 'antd'
import { CloudServerOutlined, GithubOutlined, GlobalOutlined } from '@ant-design/icons'
import api from '../../services/api'

const { Title, Paragraph, Text } = Typography

export default function AboutPage() {
  const [info, setInfo] = useState<any>(null)

  useEffect(() => {
    api.get('/info').then((r) => setInfo(r.data)).catch(() => {})
  }, [])

  const about = info?.about || {}
  const clust = info?.cluster || {}

  return (
    <div style={{ maxWidth: 640 }}>
      <Card style={{ marginBottom: 16, background: 'rgba(30,41,59,0.6)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <CloudServerOutlined style={{ fontSize: 56, background: 'linear-gradient(135deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
          <Title level={2} style={{ margin: '12px 0 4px' }}>{about.name || 'SeaweedFS Dashboard'}</Title>
          {info?.version && <Tag color="purple">v{info.version}</Tag>}
        </div>

        <Paragraph style={{ textAlign: 'center', color: '#94a3b8' }}>
          Cluster management dashboard for the <strong>{clust.name || 'dc03'}</strong> SeaweedFS cluster.<br />
          Monitor, manage, and operate your distributed storage infrastructure.
        </Paragraph>
      </Card>

      <Card title="Cluster Info" size="small" style={{ marginBottom: 16, background: 'rgba(30,41,59,0.6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><Text type="secondary">Name</Text><br /><strong>{clust.name}</strong></div>
          <div><Text type="secondary">Datacenter</Text><br /><strong>{clust.datacenter}</strong></div>
          <div><Text type="secondary">Rack</Text><br /><strong>{clust.rack}</strong></div>
          <div><Text type="secondary">Replication</Text><br /><strong>{clust.replication}</strong></div>
          <div><Text type="secondary">Nodes</Text><br /><strong>{clust.nodes}</strong></div>
          <div><Text type="secondary">Masters</Text><br /><strong>{Array.isArray(clust.masters) ? clust.masters.length : '—'}</strong></div>
        </div>
      </Card>

      <Card title="Developer" size="small" style={{ marginBottom: 16, background: 'rgba(30,41,59,0.6)' }}>
        <p><GlobalOutlined /> <a href={about.website} target="_blank" rel="noopener">{about.developer}</a></p>
        <p><GithubOutlined /> <a href="https://github.com/batmunkhcom/seaweedfs-dashboard" target="_blank" rel="noopener">github.com/batmunkhcom/seaweedfs-dashboard</a></p>
      </Card>

      <Card title="License" size="small" style={{ background: 'rgba(30,41,59,0.6)' }}>
        <Paragraph style={{ color: '#94a3b8' }}>
          Apache License 2.0 — Copyright {about.developer || 'mBm TECHNOLOGY LLC'}
        </Paragraph>
      </Card>
    </div>
  )
}
