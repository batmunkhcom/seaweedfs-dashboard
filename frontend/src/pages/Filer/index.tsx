import { useState, useEffect } from 'react'
import { Table, Button, Breadcrumb, Modal, Input, Upload, message } from 'antd'
import { FolderAddOutlined, UploadOutlined, DeleteOutlined, HomeOutlined } from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { listFiler, createFilerDir, deleteFilerEntry } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

export default function FilerPage() {
  const { '*': subPath } = useParams()
  const path = subPath ? `/${subPath}` : '/'
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)

  const fetch = () => {
    setLoading(true)
    listFiler(path).then((d) => setEntries(d.entries || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [path])

  const pathParts = path.split('/').filter(Boolean)
  const breadcrumbItems = [
    { title: <HomeOutlined />, onClick: () => navigate('/filer') },
    ...pathParts.map((p, i) => {
      const fullPath = '/' + pathParts.slice(0, i + 1).join('/')
      return { title: p, onClick: () => navigate(`/filer${fullPath}`) }
    }),
  ]

  const doDelete = async (entryPath: string) => {
    await deleteFilerEntry(entryPath)
    message.success('Deleted')
    fetch()
  }

  const doMkdir = async () => {
    const fullPath = `${path.endsWith('/') ? path : path + '/'}${mkdirName}`
    await createFilerDir(fullPath)
    message.success('Directory created')
    setMkdirOpen(false)
    setMkdirName('')
    fetch()
  }

  const columns: any[] = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r: any) =>
        r.isDirectory ? (
          <a onClick={() => navigate(`/filer${r.path || `${path === '/' ? '' : path}/${name}`}`)} style={{ cursor: 'pointer' }}>
            {name}
          </a>
        ) : (
          name
        ),
    },
    { title: 'Size', dataIndex: 'size', key: 'size', render: (v: number) => (v ? `${(v / 1024).toFixed(1)} KB` : '—') },
    { title: 'Type', dataIndex: 'isDirectory', key: 'type', render: (v: boolean) => (v ? 'Folder' : 'File') },
    ...(role === 'admin'
      ? [
          {
            title: '',
            key: 'actions',
            render: (_: any, r: any) => (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => doDelete(r.path || `${path.endsWith('/') ? path : path + '/'}${r.name}`)} />
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <Breadcrumb items={breadcrumbItems} style={{ marginBottom: 16 }} />
      {role === 'admin' && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <Button icon={<FolderAddOutlined />} onClick={() => setMkdirOpen(true)}>
            New Folder
          </Button>
          <Upload action={`/api/filer/upload${path}`} showUploadList={false} onChange={() => fetch()}>
            <Button icon={<UploadOutlined />}>Upload</Button>
          </Upload>
        </div>
      )}
      <Table dataSource={entries} columns={columns} rowKey="name" loading={loading} size="small" />

      <Modal open={mkdirOpen} title="Create Folder" onOk={doMkdir} onCancel={() => setMkdirOpen(false)}>
        <Input value={mkdirName} onChange={(e) => setMkdirName(e.target.value)} placeholder="Folder name" />
      </Modal>
    </div>
  )
}
