import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Tag, Popconfirm, message, Tabs, Progress, Statistic, Row, Col, Space, Tooltip, Empty, InputNumber, Modal, Form, Input } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined, CloudOutlined, FolderOutlined, LinkOutlined, CheckCircleOutlined, CloseCircleOutlined, HddOutlined, SyncOutlined } from '@ant-design/icons'
import { getGateways, startWebdav, stopWebdav, testWebdavConnection, mountFuse, unmountFuse, getFuseStatus, getNfsExports, createNfsExport, deleteNfsExport, getNfsClients, syncNfsExports } from '../../services/api'
import type { Gateway, FuseStatus, NfsExport, NfsClient } from '../../types'

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => message.success('Copied'))
}

export default function GatewaysPage() {
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [loading, setLoading] = useState(true)
  const [fuseStatuses, setFuseStatuses] = useState<Record<string, FuseStatus>>({})
  const [webdavModal, setWebdavModal] = useState(false)
  const [webdavNode, setWebdavNode] = useState('')
  const [webdavPort, setWebdavPort] = useState(9001)
  const [fuseModal, setFuseModal] = useState(false)
  const [fuseNode, setFuseNode] = useState('')
  const [fusePath, setFusePath] = useState('/mnt/seaweedfs')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [nfsExports, setNfsExports] = useState<NfsExport[]>([])
  const [nfsModal, setNfsModal] = useState(false)
  const [nfsNode, setNfsNode] = useState('')
  const [nfsPath, setNfsPath] = useState('/data/dc03')
  const [nfsOptions, setNfsOptions] = useState('*(rw,sync,no_subtree_check)')
  const [nfsClients, setNfsClients] = useState<NfsClient[]>([])

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const gws = await getGateways()
      setGateways(gws)
      const fuseNodes = gws.filter(g => g.gw_type === 'fuse' && g.node)
      const statuses: Record<string, FuseStatus> = {}
      for (const f of fuseNodes) {
        try { statuses[f.node] = await getFuseStatus(f.node) } catch {}
      }
      setFuseStatuses(statuses)
      const exports = await getNfsExports()
      setNfsExports(exports)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleWebdavStart = async () => {
    if (!webdavNode) return
    setActionLoading('webdav')
    try {
      await startWebdav(webdavNode, webdavPort)
      message.success('WebDAV started')
      setWebdavModal(false)
      fetch()
    } catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
    setActionLoading(null)
  }

  const handleWebdavStop = async (node: string) => {
    setActionLoading(node)
    try { await stopWebdav(node); message.success('Stopped'); fetch() }
    catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
    setActionLoading(null)
  }

  const handleWebdavTest = async (node: string, port: number) => {
    setActionLoading(node)
    try {
      const r = await testWebdavConnection(node, port)
      if (r.ok) message.success(`Connected — HTTP ${r.status}`)
      else message.error(r.error || 'Connection failed')
    } catch (e: any) { message.error('Test failed') }
    setActionLoading(null)
  }

  const handleFuseMount = async () => {
    if (!fuseNode) return
    setActionLoading('fuse')
    try { await mountFuse(fuseNode, fusePath); message.success('FUSE mounted'); setFuseModal(false); fetch() }
    catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
    setActionLoading(null)
  }

  const handleFuseUnmount = async (node: string) => {
    setActionLoading(node)
    try { await unmountFuse(node); message.success('Unmounted'); fetch() }
    catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
    setActionLoading(null)
  }

  const fetchNfs = useCallback(async () => {
    try {
      const exports = await getNfsExports()
      setNfsExports(exports)
    } catch {}
  }, [])

  const handleNfsCreate = async () => {
    if (!nfsNode || !nfsPath) return
    setActionLoading('nfs')
    try { await createNfsExport(nfsNode, nfsPath, nfsOptions); message.success('Export added'); setNfsModal(false); fetchNfs() }
    catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
    setActionLoading(null)
  }

  const handleNfsDelete = async (id: number) => {
    try { await deleteNfsExport(id); message.success('Removed'); fetchNfs() }
    catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
  }

  const handleNfsSync = async () => {
    try { await syncNfsExports(); message.success('Synced'); fetchNfs() }
    catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
  }

  const handleShowClients = async (node: string) => {
    try {
      const r = await getNfsClients(node)
      setNfsClients(r.clients)
      if (r.clients.length === 0) message.info('No connected clients')
    } catch (e: any) { message.error('Failed') }
  }

  const webdavGateways = gateways.filter(g => g.gw_type === 'webdav')
  const fuseGateways = gateways.filter(g => g.gw_type === 'fuse')

  const webdavColumns = [
    { title: 'Node', dataIndex: 'node', key: 'node' },
    { title: 'Port', dataIndex: 'port', key: 'port' },
    {
      title: 'URL', key: 'url',
      render: (_: unknown, r: Gateway) => (
        <Space>
          <code>http://{r.node}:{r.port}</code>
          <Tooltip title="Copy URL"><Button size="small" icon={<LinkOutlined />} onClick={() => copyToClipboard(`http://${r.node}:${r.port}`)} /></Tooltip>
        </Space>
      ),
    },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, r: Gateway) => r.running ? <Tag icon={<CheckCircleOutlined />} color="green">Running</Tag> : <Tag icon={<CloseCircleOutlined />} color="red">Stopped</Tag>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: Gateway) => (
        <Space>
          <Tooltip title="Test"><Button size="small" icon={<LinkOutlined />} loading={actionLoading === r.node} onClick={() => handleWebdavTest(r.node, r.port)} /></Tooltip>
          <Popconfirm title="Stop WebDAV?" onConfirm={() => handleWebdavStop(r.node)}>
            <Button size="small" danger icon={<PauseCircleOutlined />} disabled={!r.running}>Stop</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const fuseColumns = [
    { title: 'Node', dataIndex: 'node', key: 'node' },
    { title: 'Mount Path', dataIndex: 'mount_path', key: 'path', render: (p: string) => <code>{p}</code> },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, r: Gateway) => r.running ? <Tag icon={<CheckCircleOutlined />} color="green">Mounted</Tag> : <Tag icon={<CloseCircleOutlined />} color="red">Not Mounted</Tag>,
    },
    {
      title: 'Disk', key: 'disk',
      render: (_: unknown, r: Gateway) => {
        const s = fuseStatuses[r.node]
        if (!s?.disk) return '—'
        return (
          <Tooltip title={`${s.disk.avail_gb} GB free / ${s.disk.total_gb} GB total`}>
            <Progress percent={parseFloat(s.disk.pct)} size="small" format={() => `${s.disk!.used_gb}GB`} />
          </Tooltip>
        )
      },
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: Gateway) => (
        <Popconfirm title="Unmount FUSE?" onConfirm={() => handleFuseUnmount(r.node)}>
          <Button size="small" danger icon={<PauseCircleOutlined />} disabled={!r.running}>Unmount</Button>
        </Popconfirm>
      ),
    },
  ]

  const nfsColumns = [
    { title: 'Node', dataIndex: 'node', key: 'node' },
    { title: 'Path', dataIndex: 'path', key: 'path', render: (p: string) => <code>{p}</code> },
    { title: 'Options', dataIndex: 'options', key: 'options', ellipsis: true, render: (o: string) => <Tooltip title={o}><code style={{ fontSize: 11 }}>{o.length > 40 ? o.slice(0, 40) + '...' : o}</code></Tooltip> },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: NfsExport) => (
        <Space>
          <Button size="small" onClick={() => handleShowClients(r.node)} icon={<LinkOutlined />}>Clients</Button>
          <Popconfirm title="Remove export?" onConfirm={() => handleNfsDelete(r.id)}>
            <Button size="small" danger icon={<CloseCircleOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="WebDAV Nodes" value={webdavGateways.filter(g => g.running).length} suffix={`/ ${webdavGateways.length || 0}`} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="FUSE Nodes" value={fuseGateways.filter(g => g.running).length} suffix={`/ ${fuseGateways.length || 0}`} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="NFS Exports" value={nfsExports.length} /></Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="webdav" style={{ marginTop: 16 }} items={[
        {
          key: 'webdav', label: <span><CloudOutlined /> WebDAV</span>,
          children: (
            <Card
              title="WebDAV Gateways"
              extra={<Button type="primary" icon={<PlayCircleOutlined />} onClick={() => { setWebdavNode(''); setWebdavPort(9001); setWebdavModal(true) }}>Add WebDAV</Button>}
            >
              <Table dataSource={webdavGateways.map(g => ({ ...g, key: g.id }))} columns={webdavColumns} loading={loading} pagination={false} size="middle"
                locale={{ emptyText: <Empty description="No WebDAV gateways configured" /> }} />
            </Card>
          ),
        },
        {
          key: 'fuse', label: <span><FolderOutlined /> FUSE</span>,
          children: (
            <Card
              title="FUSE Mounts"
              extra={<Button type="primary" icon={<PlayCircleOutlined />} onClick={() => { setFuseNode(''); setFusePath('/mnt/seaweedfs'); setFuseModal(true) }}>Mount FUSE</Button>}
            >
              <Table dataSource={fuseGateways.map(g => ({ ...g, key: g.id }))} columns={fuseColumns} loading={loading} pagination={false} size="middle"
                locale={{ emptyText: <Empty description="No FUSE mounts configured" /> }} />
            </Card>
          ),
        },
        {
          key: 'nfs', label: <span><HddOutlined /> NFS</span>,
          children: (
            <Card
              title="NFS Exports"
              extra={
                <Space>
                  <Button icon={<SyncOutlined />} onClick={handleNfsSync}>Sync All</Button>
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => { setNfsNode(''); setNfsPath('/data/dc03'); setNfsOptions('*(rw,sync,no_subtree_check)'); setNfsModal(true) }}>Add Export</Button>
                </Space>
              }
            >
              <Table dataSource={nfsExports.map(e => ({ ...e, key: e.id }))} columns={nfsColumns} loading={loading} pagination={false} size="middle"
                locale={{ emptyText: <Empty description="No NFS exports configured" /> }} />
              {nfsClients.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <strong style={{ color: '#94a3b8' }}>Connected Clients:</strong>
                  <ul style={{ margin: '4px 0 0 16px', color: '#e2e8f0', fontSize: 13 }}>
                    {nfsClients.map((c, i) => <li key={i}>{c.host} → {c.path}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          ),
        },
      ]} />

      <Modal title="Start WebDAV" open={webdavModal} onOk={handleWebdavStart} onCancel={() => setWebdavModal(false)} confirmLoading={actionLoading === 'webdav'}>
        <Form layout="vertical">
          <Form.Item label="Node IP"><Input placeholder="172.16.0.2" value={webdavNode} onChange={e => setWebdavNode(e.target.value)} /></Form.Item>
          <Form.Item label="Port"><InputNumber min={1024} max={65535} value={webdavPort} onChange={v => setWebdavPort(v || 9001)} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Mount FUSE" open={fuseModal} onOk={handleFuseMount} onCancel={() => setFuseModal(false)} confirmLoading={actionLoading === 'fuse'}>
        <Form layout="vertical">
          <Form.Item label="Node IP"><Input placeholder="172.16.0.2" value={fuseNode} onChange={e => setFuseNode(e.target.value)} /></Form.Item>
          <Form.Item label="Mount Path"><Input value={fusePath} onChange={e => setFusePath(e.target.value)} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Add NFS Export" open={nfsModal} onOk={handleNfsCreate} onCancel={() => setNfsModal(false)} confirmLoading={actionLoading === 'nfs'}>
        <Form layout="vertical">
          <Form.Item label="Node IP"><Input placeholder="172.16.0.2" value={nfsNode} onChange={e => setNfsNode(e.target.value)} /></Form.Item>
          <Form.Item label="Path"><Input value={nfsPath} onChange={e => setNfsPath(e.target.value)} /></Form.Item>
          <Form.Item label="Options"><Input value={nfsOptions} onChange={e => setNfsOptions(e.target.value)} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
