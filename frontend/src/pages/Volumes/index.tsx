import { useState, useEffect } from 'react'
import { Table, Button, Modal, InputNumber, Input, Space, message, Card, Row, Col, Typography, Progress, Tag, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined, WarningOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { getVolumesStats, growVolumes, vacuumVolumes } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

interface DiskHealth {
  device?: string
  temp?: number | null
  wear?: number | null
  status: string
}

interface NodeStat {
  url: string
  dc: string
  rack: string
  used: number
  effective_max: number
  native_max: number
  configured_limit: number
  pct: number
  status: string
  disk_health?: DiskHealth | null
}

export default function VolumesPage() {
  const [totalVolumes, setTotalVolumes] = useState(0)
  const [nodeCount, setNodeCount] = useState(0)
  const [nodes, setNodes] = useState<NodeStat[]>([])
  const [volumes, setVolumes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [growOpen, setGrowOpen] = useState(false)
  const [vacuumOpen, setVacuumOpen] = useState(false)
  const [growCount, setGrowCount] = useState(2)
  const [growCollection, setGrowCollection] = useState('')
  const [vacuumThreshold, setVacuumThreshold] = useState(0.3)
  const [searchText, setSearchText] = useState('')
  const role = useAuthStore((s) => s.user?.role)

  const fetchStats = () => {
    setLoading(true)
    getVolumesStats()
      .then((data: any) => {
        setTotalVolumes(data.total_volumes || 0)
        setNodeCount(data.node_count || 0)
        setNodes(data.nodes || [])
        setVolumes(data.volumes || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    }

  useEffect(() => { fetchStats() }, [])

  const totalFree = nodes.reduce((s, n) => s + Math.max(0, n.effective_max - n.used), 0)
  const criticalNodes = nodes.filter(n => n.status === 'critical').length

  const doGrow = async () => {
    if (growCount > totalFree) {
      message.error(`Cannot grow ${growCount} volumes. Only ${totalFree} slots available across all nodes.`)
      return
      }
    try {
      await growVolumes({ count: growCount, collection: growCollection })
      message.success(`${growCount} volume(s) growing...`)
      setGrowOpen(false)
      fetchStats()
       } catch (e: any) {
        const errMsg = e?.response?.data?.error || e?.message || 'Grow failed'
        message.error(errMsg, 5)
         }
    }

  const doVacuum = async () => {
    try {
      await vacuumVolumes({ garbageThreshold: vacuumThreshold })
      message.success('Vacuum triggered')
      setVacuumOpen(false)
      fetchStats()
       } catch (e: any) {
        message.error(e?.response?.data?.error || 'Vacuum failed', 5)
         }
    }

  const statusTag = (status: string, pct: number, dh?: DiskHealth | null) => {
    const dhInfo = dh?.temp != null || dh?.wear != null
      ? ` | ${dh.temp != null ? `${dh.temp}\u00b0C` : ''}${dh.temp != null && dh.wear != null ? ' ' : ''}${dh.wear != null ? `Wear ${dh.wear}%` : ''}`
      : ''
    const label = status === 'critical' ? `Critical${dhInfo}`
      : status === 'warning' ? `Warning${dhInfo}`
      : `Healthy${dhInfo}`
    if (status === 'critical') return <Tag color="red" icon={<WarningOutlined />}>{label}</Tag>
    if (status === 'warning') return <Tag color="orange" icon={<WarningOutlined />}>{label}</Tag>
    return <Tag color="green"><CheckCircleOutlined /> {label}</Tag>
    }

  const nodeColumns = [
     {
      title: 'Node',
      dataIndex: 'url',
      key: 'url',
      width: 220,
      render: (url: string) => <Tooltip title={url}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{url.replace(':8080', '')}</span></Tooltip>,
     },
     {
      title: 'Location',
      key: 'location',
      width: 140,
      render: (_: any, record: NodeStat) => (
        <Space size={4}>
          <Tag color="purple">{record.dc || '-'}</Tag>
          <Tag>{record.rack || '-'}</Tag>
         </Space>
       ),
      },
     {
      title: 'Usage',
      key: 'usage',
      width: 200,
      render: (_: any, record: NodeStat) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress
            percent={Math.min(record.pct, 100)}
            size="small"
            strokeColor={record.status === 'critical' ? '#ef4444' : record.status === 'warning' ? '#f59e0b' : '#22c55e'}
            trailColor='rgba(255,255,255,0.05)'
            format={() => `${record.used}/${record.effective_max}`}
           />
         </div>
       ),
      },
     {
      title: 'Status',
      key: 'status',
      width: 160,
      render: (_: any, record: NodeStat) => statusTag(record.status, record.pct, record.disk_health),
     },
     {
      title: 'Free Slots',
      key: 'free',
      width: 120,
      render: (_: any, record: NodeStat) => {
        const free = Math.max(0, record.effective_max - record.used)
        const color = record.status === 'critical' ? '#ef4444' : record.status === 'warning' ? '#f59e0b' : '#22c55e'
        return <Typography.Text strong style={{ color }}>{free}</Typography.Text>
       },
      },
    ]

  const volColumns = [
     { title: 'ID', dataIndex: 'Id', key: 'Id', width: 100, render: (id: string) => <Tag color="blue">{id}</Tag> },
     { title: 'Collection', dataIndex: 'Collection', key: 'Collection', width: 120, render: (v: any) => String(v || '') },
     {
      title: 'Node',
      dataIndex: 'ServerUrl',
      key: 'ServerUrl',
      width: 180,
      render: (url: string) => <Tooltip title={url}><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{url.replace(':8080', '')}</span></Tooltip>,
     },
     {
      title: 'Size',
      dataIndex: 'Size',
      key: 'Size',
      width: 100,
      render: (v: number) => `${(v / 1024 / 1024).toFixed(0)} MB`,
     },
     { title: 'Files', dataIndex: 'FileCount', key: 'FileCount', width: 80, render: (v: any) => String(v || 0) },
      { title: 'Replication', dataIndex: 'ReplicaPlacement', key: 'ReplicaPlacement', width: 100, render: (v: any) => <Tag>{typeof v === 'object' ? JSON.stringify(v) : (v || '000')}</Tag> },
    ]

  const filteredVolumes = volumes.filter(v => !searchText || v.Id?.includes(searchText) || v.Collection?.includes(searchText))
  const nodeMinMax = nodes.length > 0 ? Math.min(...nodes.map(n => n.effective_max)) : 9999

  return (
     <div>
       {/* Stats Row */}
       <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
         <Col xs={24} sm={12} md={6}>
           <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
             <Typography.Text type="secondary" style={{ fontSize: 12 }}>Total Volumes</Typography.Text>
             <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700 }}>{totalVolumes}</div>
           </Card>
         </Col>
         <Col xs={24} sm={12} md={6}>
           <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
             <Typography.Text type="secondary" style={{ fontSize: 12 }}>Nodes</Typography.Text>
             <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700 }}>{nodeCount}</div>
           </Card>
         </Col>
         <Col xs={24} sm={12} md={6}>
           <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(34,197,94,0.2)' }}>
             <Typography.Text type="secondary" style={{ fontSize: 12 }}>Available Slots</Typography.Text>
             <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{totalFree}</div>
           </Card>
         </Col>
         <Col xs={24} sm={12} md={6}>
           <Card size="small" style={{ background: 'rgba(15,23,42,0.8)', border: criticalNodes > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(99,102,241,0.15)' }}>
             <Typography.Text type="secondary" style={{ fontSize: 12 }}>Critical Nodes</Typography.Text>
             <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, color: criticalNodes > 0 ? '#ef4444' : '#64748b' }}>
               {criticalNodes > 0 && <WarningOutlined style={{ marginRight: 4 }} />}
               {criticalNodes}
             </div>
           </Card>
         </Col>
       </Row>

       {/* Per-Node Breakdown */}
       <Card title={<><ThunderboltOutlined style={{ marginRight: 8, color: '#6366f1' }} />Per-Node Volume Distribution</>} size="small" style={{ marginBottom: 20 }}>
         <Table columns={nodeColumns} dataSource={nodes} rowKey="url" loading={loading} pagination={false} size="small" />
       </Card>

       {/* Volume List */}
       <Card title={<><DeleteOutlined style={{ marginRight: 8, color: '#a855f7' }} />Volume List ({filteredVolumes.length})</>} size="small" style={{ marginBottom: 20 }}>
         <Input.Search placeholder="Search by Volume ID or Collection..." allowClear value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ maxWidth: 400, marginBottom: 12 }} />
          <Table columns={volColumns} dataSource={filteredVolumes} rowKey={(r: any) => `${r.Id}-${r.ServerUrl}`} loading={loading} size="small" scroll={{ x: 800 }} />
       </Card>

       {/* Actions */}
       {role === 'admin' && (
         <Space>
           <Button icon={<PlusOutlined />} type="primary" onClick={() => setGrowOpen(true)}>Grow Volumes</Button>
           <Button icon={<DeleteOutlined />} onClick={() => setVacuumOpen(true)}>Vacuum (GC)</Button>
         </Space>
       )}

       {/* Grow Modal */}
       <Modal open={growOpen} title="Grow Volumes" onOk={doGrow} onCancel={() => { setGrowOpen(false) }} okText="Grow">
         {totalFree <= 10 && (
           <div style={{ marginBottom: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: 10 }}>
             <WarningOutlined style={{ color: '#f59e0b', marginRight: 6 }} />
             <Typography.Text style={{ color: '#f59e0b' }}>Only {totalFree} volume slots remaining across all nodes</Typography.Text>
           </div>
         )}
         <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
            Max {nodeMinMax} volumes per node - {totalFree} slots available
         </div>
         <div style={{ marginBottom: 8 }}>
           <Typography.Text style={{ display: 'block', marginBottom: 4 }}>Count:</Typography.Text>
           <InputNumber min={1} max={totalFree || 999} value={growCount} onChange={(v) => setGrowCount(v || 1)} style={{ width: '100%' }} />
         </div>
         <div>
           <Typography.Text style={{ display: 'block', marginBottom: 4 }}>Collection (optional):</Typography.Text>
           <Input value={growCollection} onChange={(e) => setGrowCollection(e.target.value)} placeholder="e.g., default, backups" />
         </div>
       </Modal>

       {/* Vacuum Modal */}
       <Modal open={vacuumOpen} title="Vacuum (Garbage Collection)" onOk={doVacuum} onCancel={() => setVacuumOpen(false)} okText="Trigger GC">
         <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
           Removes files from volumes where garbage ratio exceeds threshold.
         </div>
         <div>
           <Typography.Text style={{ display: 'block', marginBottom: 4 }}>Garbage Threshold: {vacuumThreshold}</Typography.Text>
           <InputNumber min={0} max={1} step={0.1} value={vacuumThreshold} onChange={(v) => setVacuumThreshold(v || 0.3)} style={{ width: '100%' }} />
         </div>
       </Modal>
     </div>
   )
 }
