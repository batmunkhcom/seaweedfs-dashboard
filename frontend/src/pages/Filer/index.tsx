import { useState, useEffect } from 'react'
import { Table, Button, Breadcrumb, Modal, Input, Upload, message, Space, Tag } from 'antd'
import {
  FolderAddOutlined,
  UploadOutlined,
  DeleteOutlined,
  HomeOutlined,
  FolderOutlined,
  FileOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { listFiler, createFilerDir, deleteFilerEntry } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + u[i]
}

export default function FilerPage() {
  const { '*': subPath } = useParams()
  const path = subPath ? `/${subPath}` : '/'
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const canWrite = role === 'admin' || role === 'operator'

  const fetch = () => {
    setLoading(true)
    listFiler(path).then((d) => setEntries(d.entries || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [path])

  const pathParts = path.split('/').filter(Boolean)
  const breadcrumbItems = [
    { title: <span><HomeOutlined style={{ marginRight: 4 }} />root</span>, onClick: () => navigate('/filer') },
    ...pathParts.map((p, i) => ({
      title: p,
      onClick: () => navigate(`/filer/${pathParts.slice(0, i + 1).join('/')}`),
    })),
  ]

  const doDelete = async (entryPath: string) => {
    await deleteFilerEntry(entryPath)
    message.success('Deleted')
    fetch()
  }

  const doMkdir = async () => {
    const fullPath = `${path === '/' ? '' : path}/${mkdirName}`
    await createFilerDir(fullPath)
    message.success('Directory created')
    setMkdirOpen(false)
    setMkdirName('')
    fetch()
  }

  const downloadUrl = (entryPath: string) => `/api/filer/list${entryPath}`

  const columns: any[] = [
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      render: (name: string, r: any) => {
        const displayName = name === '/' ? '(root)' : name
        if (r.isDirectory) {
          const dirPath = r.path || `${path === '/' ? '' : path}/${name}`
          return (
            <a onClick={() => navigate(`/filer${dirPath}`)} style={{ cursor: 'pointer' }}>
              <FolderOutlined style={{ color: '#a855f7', marginRight: 6 }} />
              {displayName}
            </a>
          )
        }
        return (
          <span>
            <FileOutlined style={{ color: '#64748b', marginRight: 6 }} />
            {displayName}
          </span>
        )
      },
    },
    {
      title: 'Size', dataIndex: 'size', key: 'size',
      render: (v: number, r: any) => r.isDirectory ? <Tag>—</Tag> : formatSize(v),
    },
    {
      title: 'Type', key: 'type',
      render: (_: any, r: any) => r.isDirectory ? <Tag color="purple">Folder</Tag> : <Tag>File</Tag>,
    },
    {
      title: 'Modified', dataIndex: 'mtime', key: 'mtime',
      render: (v: string) => v ? new Date(v).toLocaleString() : '—',
    },
    ...(canWrite
      ? [{
          title: '', key: 'actions', width: 100,
          render: (_: any, r: any) => {
            const entryPath = r.path || `${path === '/' ? '' : path}/${r.name}`
            return (
              <Space size={4}>
                {!r.isDirectory && (
                  <a href={downloadUrl(entryPath)} target="_blank" rel="noopener">
                    <Button size="small" icon={<DownloadOutlined />} />
                  </a>
                )}
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => doDelete(entryPath)} />
              </Space>
            )
          },
        }]
      : []),
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Breadcrumb items={breadcrumbItems} />
        <Space>
          {canWrite && (
            <>
              <Button icon={<FolderAddOutlined />} size="small" onClick={() => setMkdirOpen(true)}>
                New Folder
              </Button>
              <Upload
                action={`/api/filer/upload${path}`}
                showUploadList={false}
                onChange={(info) => {
                  if (info.file.status === 'done') { message.success(`${info.file.name} uploaded`); fetch() }
                  else if (info.file.status === 'error') { message.error(`${info.file.name} upload failed`) }
                }}
                withCredentials
                headers={{ 'X-CSRF-Token': useAuthStore.getState().csrfToken }}
              >
                <Button icon={<UploadOutlined />} size="small">Upload</Button>
              </Upload>
            </>
          )}
          <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
        </Space>
      </div>

      <Table dataSource={entries} columns={columns} rowKey="name" loading={loading} size="small" pagination={false} locale={{ emptyText: 'Directory is empty' }} />

      <Modal open={mkdirOpen} title="Create Folder" onOk={doMkdir} onCancel={() => setMkdirOpen(false)}>
        <Input value={mkdirName} onChange={(e) => setMkdirName(e.target.value)} placeholder="Folder name" />
      </Modal>
    </div>
  )
}
