import { useState, useEffect } from 'react'
import { Card, Tag, Spin, Row, Col, Typography, Progress, Tooltip } from 'antd'
import {
  CloudServerOutlined,
  CheckCircleOutlined,
  HddOutlined,
  NodeIndexOutlined,
  ClusterOutlined,
} from '@ant-design/icons'
import { getTopology, getClusterHealth } from '../../services/api'

const { Title, Text } = Typography

const SEVER_COLORS = ['#a855f7', '#6366f1', '#8b5cf6', '#7c3aed', '#9333ea', '#4f46e5', '#6d28d9']

export default function ClusterPage() {
  const [topology, setTopology] = useState<any>(null)
  const [nodes, setNodes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getTopology(), getClusterHealth()])
      .then(([topo, health]) => {
        setTopology(topo)
        setNodes(health.nodes || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  const totalFree = topology?.Free || 0
  const totalMax = topology?.Max || 0
  const totalPct = totalMax > 0 ? Math.round((totalFree / totalMax) * 100) : 0

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ClusterOutlined style={{ marginRight: 8, color: '#a855f7' }} />
          Cluster Topology
        </Title>
        <Text type="secondary" style={{ marginLeft: 32 }}>
          {nodes.length} nodes &middot; {topology?.DataCenters?.length || 0} datacenter
          {topology?.DataCenters?.length !== 1 ? 's' : ''} &middot; replication 001
        </Text>
      </div>

      {topology?.DataCenters?.map((dc: any) => (
        <Card
          key={dc.Id}
          title={
            <span>
              <NodeIndexOutlined style={{ marginRight: 6, color: '#6366f1' }} />
              Datacenter: <strong style={{ color: '#a5f3fc' }}>{dc.Id}</strong>
              <Tag color="purple" style={{ marginLeft: 8 }}>{dc.Racks?.length || 0} racks</Tag>
            </span>
          }
          style={{ marginBottom: 16, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(99,102,241,0.12)' }}
        >
          {dc.Racks?.map((rack: any) => {
            const rackVolumes = rack.DataNodes?.reduce((s: number, n: any) => s + (n.Volumes || 0), 0) || 0
            const rackMax = rack.DataNodes?.reduce((s: number, n: any) => s + (n.Max || 0), 0) || 0

            return (
              <Card
                key={rack.Id}
                type="inner"
                title={
                  <span>
                    <CloudServerOutlined style={{ marginRight: 6, color: '#a855f7' }} />
                    Rack: <strong style={{ color: '#c4b5fd' }}>{rack.Id}</strong>
                    <Tag style={{ marginLeft: 8 }}>{rack.DataNodes?.length || 0} nodes</Tag>
                  </span>
                }
                extra={
                  <Tooltip title={`${rackVolumes} volumes / ${rackMax} slots`}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      {rackVolumes}/{rackMax} vols
                    </span>
                  </Tooltip>
                }
                style={{ marginBottom: 12, background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(99,102,241,0.08)' }}
              >
                <Row gutter={[12, 12]}>
                  {rack.DataNodes?.map((node: any, ni: number) => {
                    const usedPct = node.Max > 0 ? Math.round(((node.Max - (node.Free ?? 0)) / node.Max) * 100) : 0
                    const barColor = usedPct > 80 ? '#ef4444' : usedPct > 60 ? '#f59e0b' : '#22c55e'
                    const nodeUrl = node.Url || node.url || ''

                    return (
                      <Col key={ni} xs={24} sm={12} md={8} lg={6} xl={Math.floor(24 / Math.min((rack.DataNodes?.length || 1), 4))}>
                        <div
                          style={{
                            background: 'rgba(15,23,42,0.8)',
                            border: `1px solid ${SEVER_COLORS[ni % SEVER_COLORS.length]}22`,
                            borderRadius: 8,
                            padding: '12px 14px',
                            transition: 'border-color 0.2s',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = SEVER_COLORS[ni % SEVER_COLORS.length] + '44' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = SEVER_COLORS[ni % SEVER_COLORS.length] + '22' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Tooltip title={nodeUrl}>
                              <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                {nodeUrl.replace(':8080', '')}
                              </span>
                            </Tooltip>
                            <Tag color="green" style={{ lineHeight: '16px', fontSize: 10, margin: 0 }}>
                              <CheckCircleOutlined style={{ fontSize: 10 }} /> healthy
                            </Tag>
                          </div>

                          <Progress
                            percent={usedPct}
                            size="small"
                            strokeColor={barColor}
                            trailColor="rgba(255,255,255,0.05)"
                            format={() => `${usedPct}%`}
                            style={{ marginBottom: 6 }}
                          />

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <Tooltip title={`${node.Volumes || 0} active volumes of ${node.Max} max slots`}>
                              <span style={{ color: '#cbd5e1' }}>
                                <HddOutlined style={{ marginRight: 3, color: '#64748b' }} />
                                {node.Volumes || 0}/{node.Max}
                              </span>
                            </Tooltip>
                            <Tooltip title={`${node.Free ?? (node.Max - (node.Volumes || 0))} free slots`}>
                              <span style={{ color: '#64748b' }}>
                                {node.Free ?? (node.Max - (node.Volumes || 0))} free
                              </span>
                            </Tooltip>
                          </div>
                        </div>
                      </Col>
                    )
                  })}
                </Row>
              </Card>
            )
          })}

          <div style={{ padding: '8px 16px 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tag color="purple">{totalFree} free slots</Tag>
            <Tag color="blue">{totalMax} max slots</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {totalPct}% capacity remaining
            </Text>
          </div>
        </Card>
      ))}
    </div>
  )
}
