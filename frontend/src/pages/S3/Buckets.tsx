import { Table, Button, Modal, Input, Popconfirm, Space } from 'antd'
import { useState, useEffect } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { getS3Buckets, createS3Bucket, deleteS3Bucket } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

export default function S3BucketsPage() {
  const [buckets, setBuckets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const role = useAuthStore((s) => s.user?.role)

  const fetch = () => {
    setLoading(true)
    getS3Buckets().then(setBuckets).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { fetch() }, [])

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Files', dataIndex: 'fileCount', key: 'fileCount' },
    { title: 'Size', dataIndex: 'totalSize', key: 'totalSize' },
    ...(role === 'admin'
      ? [
          {
            title: '',
            key: 'actions',
            render: (_: any, r: any) => (
              <Popconfirm title="Delete this bucket?" onConfirm={() => deleteS3Bucket(r.name).then(fetch)}>
                <Button size="small" danger>Delete</Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      {role === 'admin' && (
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Create Bucket</Button>
        </Space>
      )}
      <Table dataSource={buckets} columns={columns} rowKey="name" loading={loading} size="small" />
      <Modal open={createOpen} title="Create Bucket" onOk={() => { createS3Bucket(newName).then(fetch); setCreateOpen(false) }} onCancel={() => setCreateOpen(false)}>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Bucket name" />
      </Modal>
    </div>
  )
}
