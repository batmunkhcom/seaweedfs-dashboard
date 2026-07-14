import { useState, useEffect } from 'react'
import { Table, Button, Modal, InputNumber, Input, Space, message } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { getVolumes, growVolumes, vacuumVolumes } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

export default function VolumesPage() {
  const [volumes, setVolumes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [growOpen, setGrowOpen] = useState(false)
  const [vacuumOpen, setVacuumOpen] = useState(false)
  const [growCount, setGrowCount] = useState(2)
  const [growCollection, setGrowCollection] = useState('')
  const [vacuumThreshold, setVacuumThreshold] = useState(0.3)
  const role = useAuthStore((s) => s.user?.role)

  const fetch = () => {
    setLoading(true)
    getVolumes().then((d) => setVolumes(d.volumes || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const doGrow = async () => {
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
      {role === 'admin' && (
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<PlusOutlined />} onClick={() => setGrowOpen(true)}>Grow</Button>
          <Button icon={<DeleteOutlined />} onClick={() => setVacuumOpen(true)}>Vacuum</Button>
        </Space>
      )}
      <Table dataSource={volumes} columns={columns} rowKey="Id" loading={loading} size="small" />

      <Modal open={growOpen} title="Grow Volumes" onOk={doGrow} onCancel={() => setGrowOpen(false)}>
        <InputNumber min={1} max={100} value={growCount} onChange={(v) => setGrowCount(v || 1)} style={{ width: '100%' }} placeholder="Count" />
        <Input value={growCollection} onChange={(e) => setGrowCollection(e.target.value)} placeholder="Collection (optional)" style={{ marginTop: 8 }} />
      </Modal>

      <Modal open={vacuumOpen} title="Vacuum (Garbage Collection)" onOk={doVacuum} onCancel={() => setVacuumOpen(false)}>
        <InputNumber min={0} max={1} step={0.1} value={vacuumThreshold} onChange={(v) => setVacuumThreshold(v || 0.3)} style={{ width: '100%' }} placeholder="Garbage Threshold" />
      </Modal>
    </div>
  )
}
