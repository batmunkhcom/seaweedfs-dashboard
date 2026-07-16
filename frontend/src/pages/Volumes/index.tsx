import { useState, useEffect } from 'react'
import { Table, Button, Modal, InputNumber, Input, Space, message, Alert, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons'
import { getVolumes, growVolumes, vacuumVolumes, getClusterHealth } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const { Text } = Typography

export default function VolumesPage() {
  const [volumes, setVolumes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [growOpen, setGrowOpen] = useState(false)
  const [vacuumOpen, setVacuumOpen] = useState(false)
  const [growCount, setGrowCount] = useState(2)
  const [growCollection, setGrowCollection] = useState('')
  const [vacuumThreshold, setVacuumThreshold] = useState(0.3)
  const [maxPerNode, setMaxPerNode] = useState(9999)
  const [nodeVolumes, setNodeVolumes] = useState<Record<string, number>>({})
  const role = useAuthStore((s) => s.user?.role)

  const fetch = () => {
    setLoading(true)
    Promise.all([getVolumes(), getClusterHealth()])
     .then(([volData, healthData]) => {
       setVolumes(volData.volumes || [])
       if (healthData?.nodes) {
         const nodeMap: Record<string, number> = {}
         healthData.nodes.forEach((n: any) => {
           nodeMap[n.url || n.Url] = n.volumes || n.Volumes || 0
          })
         setNodeVolumes(nodeMap)
         let maxV = 9999
         if (healthData.nodes.length > 0) {
           maxV = Math.min(...healthData.nodes.map((n: any) => n.max_configured || n.max_native || 9999))
          }
         setMaxPerNode(maxV)
        }
       })
     .catch(() => {})
     .finally(() => setLoading(false))
    }

  useEffect(() => { fetch() }, [])

  const getAvailableSlots = (nodeUrl: string) => {
    const used = nodeVolumes[nodeUrl] || 0
    return Math.max(0, maxPerNode - used)
    }

  const totalUsed = Object.values(nodeVolumes).reduce((s, v) => s + v, 0)
  const effectiveMax = maxPerNode * Object.keys(nodeVolumes).length
  const totalFree = Math.max(0, effectiveMax - totalUsed)
  const usagePct = effectiveMax > 0 ? Math.round((totalUsed / effectiveMax) * 100) : 0

  const doGrow = async () => {
    if (growCount > totalFree) {
      message.error(`Cannot grow ${growCount} volumes. Only ${totalFree} slots available across all nodes.`)
      return
     }
    await growVolumes({ count: growCount, collection: growCollection })
    message.success('Volumes growing')
    setGrowOpen(false)
    fetch()
    }

  const doVacuum = async () => {
    await vacuumVolumes({ garbageThreshold: vacuumThreshold })
    message.success('Vacuum triggered')
    setVacuumOpen(false)
    }

  const columns = [
    { title: 'ID', dataIndex: 'Id', key: 'Id' },
    { title: 'Collection', dataIndex: 'Collection', key: 'Collection' },
     { title: 'Size', dataIndex: 'Size', key: 'Size', render: (v: number) => `${(v / 1024 / 1024).toFixed(1)} MB` },
     { title: 'Files', dataIndex: 'FileCount', key: 'FileCount' },
     { title: 'Replication', dataIndex: 'ReplicaPlacement', key: 'ReplicaPlacement' },
    ]

  return (
    <div>
       <Space style={{ marginBottom: 16 }}>
         <Text type="secondary">
           Used: {totalUsed} / {effectiveMax} ({usagePct}%) &middot; Free: {totalFree} slots &middot; Limit: {maxPerNode}/node
         </Text>
       </Space>

       {role === 'admin' && (
         <Space style={{ marginBottom: 16 }}>
           <Button icon={<PlusOutlined />} onClick={() => setGrowOpen(true)}>Grow</Button>
           <Button icon={<DeleteOutlined />} onClick={() => setVacuumOpen(true)}>Vacuum</Button>
         </Space>
       )}
       <Table dataSource={volumes} columns={columns} rowKey="Id" loading={loading} size="small" />

       <Modal open={growOpen} title="Grow Volumes" onOk={doGrow} onCancel={() => setGrowOpen(false)}>
         {totalFree <= 10 && (
           <Alert type="warning" showIcon style={{ marginBottom: 12 }}
             message={`Only ${totalFree} volume slots remaining`}
            />
          )}
         <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
           Max {maxPerNode} volumes per node &middot; {totalFree} slots available
         </Text>
         <InputNumber min={1} max={totalFree} value={growCount} onChange={(v) => setGrowCount(v || 1)} style={{ width: '100%' }} placeholder="Count" />
         <Input value={growCollection} onChange={(e) => setGrowCollection(e.target.value)} placeholder="Collection (optional)" style={{ marginTop: 8 }} />
       </Modal>

       <Modal open={vacuumOpen} title="Vacuum (Garbage Collection)" onOk={doVacuum} onCancel={() => setVacuumOpen(false)}>
         <InputNumber min={0} max={1} step={0.1} value={vacuumThreshold} onChange={(v) => setVacuumThreshold(v || 0.3)} style={{ width: '100%' }} placeholder="Garbage Threshold" />
       </Modal>
     </div>
   )
 }
