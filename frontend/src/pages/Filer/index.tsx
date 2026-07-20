import { useState, useEffect } from 'react'
import { Table, Button, Breadcrumb, Modal, Input, Upload, message, Space, Tag, Progress, List, Typography, Alert } from 'antd'
import {
  FolderAddOutlined,
  UploadOutlined,
  DeleteOutlined,
  HomeOutlined,
  FolderOutlined,
  FileOutlined,
  DownloadOutlined,
  ReloadOutlined,
  InboxOutlined,
  CloseOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import type { UploadFile } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'
import { listFiler, createFilerDir, deleteFilerEntry, getSettings } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const { Dragger } = Upload
const { Text } = Typography

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
  const [uploadOpen, setUploadOpen] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [maxUploadSize, setMaxUploadSize] = useState(500)
  const [vpnUrl, setVpnUrl] = useState('')
  const [allowedExts, setAllowedExts] = useState('')
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const csrfToken = useAuthStore((s) => s.csrfToken)
  const canWrite = role === 'admin' || role === 'operator'

  const fetch = () => {
    setLoading(true)
    listFiler(path).then((d) => setEntries(d.entries || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [path])

  useEffect(() => {
    getSettings().then((data: any) => {
      if (data?.categories) {
        const all: Record<string, string> = {}
        for (const items of Object.values(data.categories)) {
          if (Array.isArray(items)) for (const item of items as any[]) all[item.key] = item.value
        }
        if (all.max_upload_size_mb) setMaxUploadSize(Number(all.max_upload_size_mb))
        if (all.vpn_upload_url) setVpnUrl(all.vpn_upload_url)
        if (all.allowed_extensions !== undefined) setAllowedExts(all.allowed_extensions)
      }
    }).catch(() => {})
  }, [])

  const pathParts = path.split('/').filter(Boolean)
  const breadcrumbItems = [
    { title: <span><HomeOutlined style={{ marginRight: 4 }} />root</span>, onClick: () => navigate('/filer') },
    ...pathParts.map((p, i) => ({
      title: p,
      onClick: () => navigate(`/filer/${pathParts.slice(0, i + 1).join('/')}`),
    })),
  ]

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async (entryPath: string) => {
    setDeleting(true)
    try {
      await deleteFilerEntry(entryPath)
      message.success('Deleted')
      fetch()
    } catch {
      message.error('Delete failed')
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const doDelete = (entryPath: string) => {
    setDeleteTarget(entryPath)
  }

  const batchDelete = () => {
    if (selectedRowKeys.length === 0) return
    setBatchDeleteOpen(true)
  }

  const confirmBatchDelete = async () => {
    setDeleting(true)
    let ok = 0
    let fail = 0
    const keys = [...selectedRowKeys]
    for (const key of keys) {
      const entryPath = path === '/' ? `/${String(key)}` : `${path}/${String(key)}`
      try { await deleteFilerEntry(entryPath); ok++ } catch { fail++ }
    }
    if (fail > 0) message.warning(`${ok} deleted, ${fail} failed`)
    else message.success(`${ok} entries deleted`)
    setSelectedRowKeys([])
    setBatchDeleteOpen(false)
    setDeleting(false)
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

  const handleUpload = () => {
    if (fileList.length === 0) return
    setUploading(true)

    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    fileList.forEach((f: any) => {
      if (f instanceof File) {
        formData.append('files', f, f.name || 'file')
      } else if (f.originFileObj instanceof File) {
        formData.append('files', f.originFileObj, f.name || f.originFileObj.name || 'file')
      }
    })

    if (Array.from(formData.entries()).filter(([k]) => k === 'files').length === 0) {
      message.error('No valid files selected', 4)
      setUploading(false)
      return
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100)
        setFileList((prev) =>
          prev.map((f) => ({ ...f, percent: pct, status: pct === 100 ? 'done' : 'uploading' }))
        )
      }
    })

    xhr.addEventListener('load', () => {
      setUploading(false)
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) {
          const results = data.results || []
          const failed = results.filter((r: any) => r.error)
          const ok = results.filter((r: any) => r.ok)
          const topError = data.error

          if (topError) {
            message.error(topError, 6)
          }
          if (failed.length > 0) {
            failed.forEach((r: any) => { if (r.file) message.warning(`${r.file}: ${r.error}`, 5) })
          }
          if (ok.length > 0) {
            message.success(`${ok.length} file(s) uploaded`)
          }
          if (results.length === 0 && !topError) {
            message.warning('No files received by server — try again', 4)
          }
          if (ok.length > 0 || failed.length > 0) {
            setFileList([])
            setUploadOpen(false)
            setTimeout(() => fetch(), 500)
          }
        } else if (xhr.status === 401) {
          message.error('Authentication expired — please log in again', 5)
        } else if (xhr.status === 403) {
          message.error('Permission denied — CSRF token mismatch, refresh the page', 5)
        } else {
          const errMsg = data?.error || data?.detail || `HTTP ${xhr.status}`
          message.error(`Upload failed: ${errMsg}`, 5)
          setFileList((prev) => prev.map((f) => ({ ...f, status: 'error' })))
        }
      } catch {
        message.error('Upload failed — invalid server response', 5)
        setFileList((prev) => prev.map((f) => ({ ...f, status: 'error' })))
      }
    })

    xhr.addEventListener('error', () => {
      setUploading(false)
      message.error('Network error')
      setFileList((prev) => prev.map((f) => ({ ...f, status: 'error' })))
    })

    xhr.open('POST', `/api/filer/upload${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('X-CSRF-Token', csrfToken)
    xhr.send(formData)
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
              {selectedRowKeys.length > 0 && (
                <Button icon={<DeleteOutlined />} size="small" danger onClick={batchDelete}>
                  Delete ({selectedRowKeys.length})
                </Button>
              )}
              <Button icon={<FolderAddOutlined />} size="small" onClick={() => setMkdirOpen(true)}>
                New Folder
              </Button>
              <Button icon={<UploadOutlined />} size="small" type="primary" onClick={() => setUploadOpen(true)}>
                Upload
              </Button>
            </>
          )}
          <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
        </Space>
      </div>

      <Table
        dataSource={entries}
        columns={columns}
        rowKey="name"
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: 'Directory is empty' }}
        rowSelection={canWrite ? {
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        } : undefined}
      />

      <Modal open={mkdirOpen} title="Create Folder" onOk={doMkdir} onCancel={() => setMkdirOpen(false)}>
        <Input value={mkdirName} onChange={(e) => setMkdirName(e.target.value)} placeholder="Folder name" />
      </Modal>

      <Modal
        open={!!deleteTarget}
        title={<><ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} /> Delete Entry</>}
        onOk={() => confirmDelete(deleteTarget!)}
        onCancel={() => setDeleteTarget(null)}
        okText="Delete"
        okType="danger"
        confirmLoading={deleting}
      >
        Are you sure you want to delete &quot;{deleteTarget}&quot;?
      </Modal>

      <Modal
        open={batchDeleteOpen}
        title={<><ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} /> Delete {selectedRowKeys.length} Entries</>}
        onOk={confirmBatchDelete}
        onCancel={() => setBatchDeleteOpen(false)}
        okText="Delete All"
        okType="danger"
        confirmLoading={deleting}
      >
        Are you sure you want to delete: {selectedRowKeys.join(', ')}?
      </Modal>

      <Modal
        open={uploadOpen}
        title={`Upload to ${path}`}
        onCancel={() => { setUploadOpen(false); setFileList([]) }}
        footer={[
          <Button key="cancel" onClick={() => { setUploadOpen(false); setFileList([]) }}>Cancel</Button>,
          <Button key="upload" type="primary" loading={uploading} disabled={fileList.length === 0} onClick={handleUpload}>
            Upload {fileList.length > 0 ? `(${fileList.length})` : ''}
          </Button>,
        ]}
        width={520}
      >
        {maxUploadSize >= 1024 && (
          <Alert
            type="info"
            showIcon
            message={`Large files (over 100MB) may fail via Cloudflare. For files up to ${maxUploadSize}MB, use VPN direct access: ${vpnUrl || window.location.origin}`}
            style={{ marginBottom: 12 }}
          />
        )}
        {allowedExts && allowedExts !== '' && (
          <Tag color="blue" style={{ marginBottom: 12, fontSize: 12 }}>Allowed types: {allowedExts}</Tag>
        )}
        {allowedExts === '' && (
          <Tag color="green" style={{ marginBottom: 12, fontSize: 12 }}>All file types allowed</Tag>
        )}
        <Dragger
          multiple
          name="files"
          fileList={fileList}
          beforeUpload={(file: any) => { 
            setFileList((prev: any[]) => [...prev, file])
            return false 
          }}
          onRemove={(file: any) => { 
            setFileList((prev: any[]) => prev.filter((f: any) => f.uid !== file.uid)) 
          }}
          showUploadList={false}
          disabled={uploading}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">Click or drag files here</p>
          <p className="ant-upload-hint">Support for multiple file upload</p>
        </Dragger>

        {fileList.length > 0 && (
          <List
            style={{ marginTop: 16 }}
            size="small"
            dataSource={fileList}
            renderItem={(file: UploadFile) => (
              <List.Item
                actions={[
                  file.status === 'done' ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : null,
                  file.status === 'error' ? <CloseCircleFilled style={{ color: '#ff4d4f' }} /> : null,
                  <CloseOutlined onClick={() => setFileList((prev) => prev.filter((f) => f.uid !== file.uid))} style={{ cursor: 'pointer' }} />,
                ]}
              >
                <List.Item.Meta
                  avatar={<FileOutlined />}
                  title={<Text ellipsis style={{ maxWidth: 280 }}>{file.name}</Text>}
                  description={
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{formatSize(file.size || 0)}</Text>
                      {file.status === 'uploading' && file.percent !== undefined && (
                        <Progress percent={Math.round(file.percent)} size="small" style={{ width: 200 }} />
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  )
}
