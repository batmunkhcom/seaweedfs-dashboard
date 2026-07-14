import { useState, useEffect } from 'react'
import { Tree, Card, Table, Tag, Spin, Row, Col } from 'antd'
import { getTopology, getClusterHealth } from '../../services/api'

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

  const treeData: any[] = []
  if (topology?.DataCenters) {
    for (const dc of topology.DataCenters) {
      const dcNode: any = { title: `DC: ${dc.Id}`, key: dc.Id, children: [] }
      for (const rack of dc.Racks || []) {
        const rackNode: any = { title: `Rack: ${rack.Id}`, key: `${dc.Id}-${rack.Id}`, children: [] }
        for (const node of rack.DataNodes || []) {
          rackNode.children.push({
            title: `${node.Url} (Volumes: ${node.Volumes}/${node.Max})`,
            key: `${dc.Id}-${rack.Id}-${node.Url}`,
          })
        }
        dcNode.children.push(rackNode)
      }
      treeData.push(dcNode)
    }
  }

  const columns = [
    { title: 'URL', dataIndex: 'url', key: 'url' },
    { title: 'DC', dataIndex: 'dc', key: 'dc' },
    { title: 'Rack', dataIndex: 'rack', key: 'rack' },
    { title: 'Volumes', dataIndex: 'volumes', key: 'volumes' },
    { title: 'Max', dataIndex: 'max', key: 'max' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={s === 'healthy' ? 'green' : 'red'}>{s}</Tag>,
    },
  ]

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={10}>
        <Card title="Topology">
          <Tree treeData={treeData} defaultExpandAll />
        </Card>
      </Col>
      <Col xs={24} lg={14}>
        <Card title="Nodes">
          <Table dataSource={nodes} columns={columns} rowKey="url" size="small" pagination={false} />
        </Card>
      </Col>
    </Row>
  )
}
