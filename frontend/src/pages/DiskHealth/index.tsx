import { useState, useEffect } from 'react'
import { Card, Tag, Spin, Row, Col, Typography } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import { getDiskHealthStatus } from '../../services/api'

export default function DiskHealthPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDiskHealthStatus()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  if (!data?.enabled) {
    return (
      <Card>
        <Typography.Title level={4}>Disk Health</Typography.Title>
        <p>Disk health monitoring is disabled. Set <code>DISK_HEALTH_ENABLED=true</code> in your .env to enable S.M.A.R.T. monitoring.</p>
      </Card>
    )
  }

  const devices = data.devices || []
  const grouped: Record<string, any[]> = {}
  for (const d of devices) {
    if (!grouped[d.node]) grouped[d.node] = []
    grouped[d.node].push(d)
  }

  return (
    <div>
      <Typography.Title level={4}>Disk Health</Typography.Title>
      {Object.entries(grouped).map(([node, devs]) => (
        <Card key={node} title={node} style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            {devs.map((d: any) => (
              <Col xs={24} sm={12} lg={8} key={d.device}>
                <Card size="small">
                  <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                  <strong>{d.device}</strong>
                  <Tag style={{ marginLeft: 8 }}>
                    Last scan: {new Date(d.last_scan * 1000).toLocaleString()}
                  </Tag>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      ))}
    </div>
  )
}
