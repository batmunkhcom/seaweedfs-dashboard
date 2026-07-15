import { useState, useEffect } from 'react'
import { Table, Button, Popconfirm, message, Alert, Tag, Tooltip } from 'antd'
import { DeleteOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { getCollections, deleteCollection } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + u[i]
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const role = useAuthStore((s) => s.user?.role)
  const canDelete = role === 'admin' || role === 'operator'

  const fetch = () => {
    setLoading(true)
    getCollections().then(setCollections).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const doDelete = async (name: string) => {
    if (name === 'default' || name === '') {
      message.warning('Cannot delete default collection')
      return
    }
    await deleteCollection(name)
    message.success(`Collection "${name}" deleted`)
    fetch()
  }

  const columns = [
    {
      title: 'Collection', dataIndex: 'name', key: 'name',
      render: (v: string) => v === '' || v === 'default'
        ? <span><FolderOpenOutlined style={{ marginRight: 6, color: '#a855f7' }} />default <Tag style={{ marginLeft: 4 }}>system</Tag></span>
        : <span><FolderOpenOutlined style={{ marginRight: 6, color: '#6366f1' }} />{v}</span>,
    },
    { title: 'Volumes', dataIndex: 'volumeCount', key: 'volumeCount', sorter: (a: any, b: any) => a.volumeCount - b.volumeCount },
    {
      title: 'Total Size', dataIndex: 'totalSize', key: 'totalSize',
      render: (v: number) => formatSize(v),
      sorter: (a: any, b: any) => a.totalSize - b.totalSize,
    },
    {
      title: 'Files', dataIndex: 'fileCount', key: 'fileCount',
      render: (v: number) => v?.toLocaleString() || '0',
    },
    ...(canDelete
      ? [{
          title: '', key: 'actions', width: 60,
          render: (_: any, r: any) => (r.name !== '' && r.name !== 'default') ? (
            <Tooltip title="Delete collection and all its volumes">
              <Popconfirm
                title={`Delete "${r.name}" and all ${r.volumeCount} volumes?`}
                onConfirm={() => doDelete(r.name)}
                okText="Delete"
                okType="danger"
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          ) : null,
        }]
      : []),
  ]

  const totalVolumes = collections.reduce((s, c) => s + c.volumeCount, 0)
  const totalSize = collections.reduce((s, c) => s + c.totalSize, 0)

  return (
    <div>
      <Alert
        type="info"
        message="Collections group volumes into separate namespaces for different VMs, apps, or environments. The default collection holds unassigned volumes."
        style={{ marginBottom: 16 }}
        showIcon
      />
      <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
        <Tag color="purple">{collections.length} collections</Tag>
        <Tag color="blue">{totalVolumes} total volumes</Tag>
        <Tag>{formatSize(totalSize)} total</Tag>
      </div>
      <Table
        dataSource={collections}
        columns={columns}
        rowKey="name"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
      />
    </div>
  )
}
