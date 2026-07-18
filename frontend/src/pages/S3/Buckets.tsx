import { Table, Button, Modal, Input, Popconfirm, Space, Tag, Tooltip } from 'antd'
import { useState, useEffect } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { getS3Buckets, createS3Bucket, deleteS3Bucket, getLifecyclePolicies } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

export default function S3BucketsPage() {
  const [buckets, setBuckets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [lifecycleMap, setLifecycleMap] = useState<Record<string, any>>({})
  const role = useAuthStore((s) => s.user?.role)

  const fetch = () => {
    setLoading(true)
    Promise.all([getS3Buckets(), getLifecyclePolicies()])
      .then(([b, lp]) => {
        setBuckets(b)
        const map: Record<string, any> = {}
        lp.forEach((p: any) => { map[p.bucket] = p })
        setLifecycleMap(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetch() }, [])

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Lifecycle', key: 'lifecycle',
      render: (_: any, r: any) => {
        const pol = lifecycleMap[r.name]
        if (!pol) return <Tag color="default">none</Tag>
        return (
          <Tooltip title={`${Object.keys(JSON.parse(pol.policy_json || '{}').rules || {}).length || '?'} rules`}>
            <Tag color={pol.enabled ? 'green' : 'orange'}>
              {pol.enabled ? 'active' : 'disabled'}
            </Tag>
          </Tooltip>
        )
      },
    },
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
