import { useState, useEffect } from 'react'
import { Table, Button, Popconfirm, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { getCollections, deleteCollection } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

export default function CollectionsPage() {
  const [collections, setCollections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const role = useAuthStore((s) => s.user?.role)

  const fetch = () => {
    setLoading(true)
    getCollections().then(setCollections).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const doDelete = async (name: string) => {
    await deleteCollection(name)
    message.success(`Collection ${name} deleted`)
    fetch()
  }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Volume Count', dataIndex: 'volumeCount', key: 'volumeCount' },
    { title: 'Total Size', dataIndex: 'totalSize', key: 'totalSize', render: (v: number) => `${(v / 1024 / 1024).toFixed(1)} MB` },
    ...(role === 'admin'
      ? [
          {
            title: '',
            key: 'actions',
            render: (_: any, r: any) => (
              <Popconfirm title="Delete this collection?" onConfirm={() => doDelete(r.name)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]
      : []),
  ]

  return <Table dataSource={collections} columns={columns} rowKey="name" loading={loading} size="small" />
}
