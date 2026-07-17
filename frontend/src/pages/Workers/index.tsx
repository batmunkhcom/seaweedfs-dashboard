import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, Table, Button, Modal, Tag, Space, message, Row, Col, Statistic, Select, Drawer, Input, Descriptions, Progress, Tooltip } from 'antd'
import {
  ThunderboltOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  NodeIndexOutlined,
  ClusterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  HddOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { getWorkerStatus, listWorkerJobs, triggerWorkerDetect, triggerWorkerExecute, getNodeVolumes } from '../../services/api'
import type { WorkerStatusResponse, WorkerNode, WorkerJob } from '../../types'
import { useAuthStore } from '../../stores/authStore'

const JOB_TYPES = [
  { value: 'vacuum', label: 'Vacuum (GC)', desc: 'Garbage collection on all volumes' },
  { value: 'compact', label: 'Compact', desc: 'Compact specific volume IDs (comma-separated)' },
  { value: 'rebalance', label: 'Rebalance', desc: 'Check volume distribution balance' },
  { value: 'health_check', label: 'Health Check', desc: 'Scan all nodes for connectivity' },
]

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes > 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

const statusColors: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  success: 'success',
  failed: 'error',
  missing: 'default',
}

export default function WorkersPage() {
  const [status, setStatus] = useState<WorkerStatusResponse>({ total: 0, healthy: 0, nodes: [] })
  const [jobs, setJobs] = useState<WorkerJob[]>([])
  const [loading, setLoading] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [executeOpen, setExecuteOpen] = useState(false)
  const [jobType, setJobType] = useState('')
  const [jobNode, setJobNode] = useState('')
  const [jobParam, setJobParam] = useState('')
  const [selectedWorker, setSelectedWorker] = useState<WorkerNode | null>(null)
  const [selectedJob, setSelectedJob] = useState<WorkerJob | null>(null)
  const [workerDrawer, setWorkerDrawer] = useState(false)
  const [jobDrawer, setJobDrawer] = useState(false)
  const [jobPage, setJobPage] = useState(1)
  const [nodeVolumes, setNodeVolumes] = useState<number[]>([])
  const [selectedVolumes, setSelectedVolumes] = useState<number[]>([])
  const [loadingVolumes, setLoadingVolumes] = useState(false)
  const role = useAuthStore((s) => s.user?.role)
  const canWrite = role === 'admin' || role === 'operator'
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(() => {
    setLoading(true)
    Promise.all([getWorkerStatus(), listWorkerJobs()])
      .then(([s, j]) => {
        setStatus(s)
        setJobs(j)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch()
    intervalRef.current = setInterval(fetch, 15000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetch])

  const loadNodeVolumes = async (node: string) => {
    setLoadingVolumes(true)
    try {
      const res = await getNodeVolumes(node)
      setNodeVolumes(res.volume_ids || [])
    } catch {
      setNodeVolumes([])
    }
    setLoadingVolumes(false)
  }

  const doDetect = async () => {
    setDetecting(true)
    try {
      const res = await triggerWorkerDetect()
      if (res.ok) {
        message.success(`Found ${res.workers_found} workers (${res.healthy} healthy, ${res.unhealthy} unhealthy)`)
      } else {
        message.warning('Detection completed with issues')
      }
      fetch()
    } catch {
      message.error('Detection failed')
    }
    setDetecting(false)
  }

  const doExecute = async () => {
    if (!jobType) return
    try {
      const res = await triggerWorkerExecute(jobType, jobNode, jobParam)
      if (res.ok) {
        message.success(res.message || 'Job executed successfully')
      } else {
        message.warning(res.message || 'Job completed with issues')
      }
      setExecuteOpen(false)
      setJobType('')
      setJobNode('')
      setJobParam('')
      fetch()
    } catch {
      message.error('Execution failed')
    }
  }

  const isRunning = jobs.some((j) => j.status === 'running')
  const runningCount = jobs.filter((j) => j.status === 'running').length
  const failedCount = jobs.filter((j) => j.status === 'failed').length

  const totalDiskBytes = status.nodes.reduce((s, n) => s + (n.disk?.total_bytes || 0), 0)
  const usedDiskBytes = status.nodes.reduce((s, n) => s + (n.disk?.used_bytes || 0), 0)
  const diskUsagePct = totalDiskBytes > 0 ? Math.round((usedDiskBytes / totalDiskBytes) * 1000) / 10 : 0

  const workerColumns = [
    { title: 'Node', dataIndex: 'name', key: 'name', render: (v: string) => <strong>{v}</strong>, sorter: (a: WorkerNode, b: WorkerNode) => a.name.localeCompare(b.name) },
    {
      title: 'Health', dataIndex: 'healthy', key: 'healthy', width: 100,
      render: (v: boolean) => v ? <Tag color="success" icon={<CheckCircleOutlined />}>Online</Tag> : <Tag color="error" icon={<CloseCircleOutlined />}>Offline</Tag>,
    },
    {
      title: 'Disk', key: 'disk', width: 160,
      render: (_: unknown, r: WorkerNode) => {
        if (!r.disk) return <Tag color="default">No data</Tag>
        const pct = r.disk.percent_used
        const color = pct > 90 ? '#ff4d4f' : pct > 75 ? '#faad14' : '#52c41a'
        return (
          <Space size={4}>
            <HddOutlined />
            <Progress percent={Math.round(pct * 10) / 10} size="small" strokeColor={color} style={{ width: 80, margin: 0 }} />
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatBytes(r.disk.used_bytes)}</span>
          </Space>
        )
      },
    },
    {
      title: 'Volumes', dataIndex: 'volumes', key: 'volumes', width: 100,
      render: (v: number, r: WorkerNode) => r.max_volumes ? `${v} / ${r.max_volumes}` : v,
      sorter: (a: WorkerNode, b: WorkerNode) => a.volumes - b.volumes,
    },
    {
      title: 'Capabilities', dataIndex: 'capabilities', key: 'capabilities', width: 120,
      render: (v: string[]) => v?.map((c: string) => <Tag key={c} color="purple">{c}</Tag>) || '—',
    },
    { title: 'Version', dataIndex: 'version', key: 'version', width: 100, render: (v: string) => v ? <code style={{ fontSize: 11 }}>{v.split(' ')[0]}</code> : '—' },
    {
      title: '', key: 'action', width: 40,
      render: (_: unknown, r: WorkerNode) => (
        <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => { setSelectedWorker(r); setWorkerDrawer(true) }} />
      ),
    },
  ]

  const jobColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 55 },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 110, render: (v: string) => <Tag color="blue">{v}</Tag> },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 95,
      render: (v: string) => (
        <Tag color={statusColors[v] || 'default'} icon={v === 'running' ? <SyncOutlined spin /> : v === 'success' ? <CheckCircleOutlined /> : v === 'failed' ? <CloseCircleOutlined /> : undefined}>
          {v}
        </Tag>
      ),
    },
    { title: 'Node', dataIndex: 'node', key: 'node', width: 150, render: (v: string) => v || <span style={{ color: '#64748b' }}>—</span> },
    { title: 'Duration', dataIndex: 'durationMs', key: 'durationMs', width: 85, render: (v: number | null) => formatMs(v) },
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (v: string) => formatDate(v), sorter: (a: WorkerJob, b: WorkerJob) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(), defaultSortOrder: 'descend' as const },
    {
      title: '', key: 'action', width: 40,
      render: (_: unknown, r: WorkerJob) => (
        <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => { setSelectedJob(r); setJobDrawer(true) }} />
      ),
    },
  ]

  const selectedJobType = JOB_TYPES.find((t) => t.value === jobType)

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={4}>
          <Card>
            <Statistic
              title="Workers"
              value={status.healthy}
              suffix={`/ ${status.total}`}
              prefix={<ClusterOutlined />}
              valueStyle={{ color: status.healthy === status.total ? '#52c41a' : status.healthy > 0 ? '#faad14' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card>
            <Statistic
              title="Total Jobs"
              value={jobs.length}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Tooltip title={isRunning ? 'Jobs are currently running' : 'No active jobs'}>
            <Card>
              <Statistic
                title="Running"
                value={runningCount}
                prefix={<SyncOutlined spin={isRunning} />}
                valueStyle={{ color: isRunning ? '#1677ff' : undefined }}
              />
            </Card>
          </Tooltip>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card>
            <Statistic
              title="Failed"
              value={failedCount}
              prefix={<ExclamationCircleOutlined style={{ color: failedCount > 0 ? '#ff4d4f' : '#52c41a' }} />}
              valueStyle={{ color: failedCount > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card>
            <Statistic
              title="Disk Usage"
              value={diskUsagePct}
              suffix="%"
              prefix={<HddOutlined />}
              valueStyle={{ color: diskUsagePct > 90 ? '#ff4d4f' : diskUsagePct > 75 ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={4}>
          <Card>
            <Statistic
              title="Total Data"
              value={formatBytes(usedDiskBytes)}
              prefix={<HddOutlined />}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Nodes</span>
            <Space>
              {canWrite && (
                <Button icon={<NodeIndexOutlined />} loading={detecting} onClick={doDetect}>Detect</Button>
              )}
              <Button icon={<ReloadOutlined />} onClick={fetch}>Refresh</Button>
            </Space>
          </div>
          <Table
            dataSource={status.nodes}
            columns={workerColumns}
            rowKey="name"
            loading={loading}
            size="small"
            pagination={false}
            locale={{ emptyText: 'No nodes detected' }}
            onRow={(r) => ({ onClick: () => { setSelectedWorker(r); setWorkerDrawer(true) }, style: { cursor: 'pointer' } })}
          />
        </Col>

        <Col xs={24} lg={10}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Jobs {isRunning && <SyncOutlined spin style={{ color: '#1677ff', marginLeft: 8 }} />}</span>
            {canWrite && (
              <Button icon={<PlayCircleOutlined />} size="small" type="primary" onClick={() => setExecuteOpen(true)}>Execute</Button>
            )}
          </div>
          <Table
            dataSource={jobs}
            columns={jobColumns}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{
              current: jobPage,
              pageSize: 10,
              total: jobs.length,
              onChange: (p) => setJobPage(p),
              showSizeChanger: false,
              size: 'small',
            }}
            locale={{ emptyText: 'No jobs yet' }}
            onRow={(r) => ({ onClick: () => { setSelectedJob(r); setJobDrawer(true) }, style: { cursor: 'pointer' } })}
          />
        </Col>
      </Row>

      <Modal
        open={executeOpen}
        title={
          <Space>
            <PlayCircleOutlined />
            <span>Execute Job</span>
            {selectedJobType && <Tag color="blue" style={{ marginLeft: 8 }}>{selectedJobType.label}</Tag>}
          </Space>
        }
        onOk={doExecute}
        onCancel={() => { setExecuteOpen(false); setJobType(''); setJobNode(''); setJobParam(''); setSelectedVolumes([]) }}
        okText="Execute"
        okButtonProps={{ disabled: !jobType }}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 13 }}>1. Job Type</div>
            <Select
              value={jobType || undefined}
              onChange={(v) => { setJobType(v); setJobNode(''); setJobParam(''); setSelectedVolumes([]) }}
              placeholder="Select job type..."
              style={{ width: '100%' }}
              options={JOB_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            />
            {selectedJobType && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>{selectedJobType.desc}</div>
            )}
          </div>

          {(jobType === 'compact' || jobType === 'health_check') && (
            <div>
              <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 13 }}>2. Target Node</div>
              <Select
                value={jobNode || undefined}
                onChange={(v) => { setJobNode(v); setSelectedVolumes([]); if (v) loadNodeVolumes(v) }}
                placeholder="Select node..."
                style={{ width: '100%' }}
                showSearch
                filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                options={status.nodes.filter((n) => n.healthy).map((n) => ({
                  value: n.address,
                  label: `${n.name} (${n.volumes} vols, ${n.disk ? formatBytes(n.disk.used_bytes) : '?'})`,
                }))}
                notFoundContent="No healthy nodes available"
              />
            </div>
          )}

          {jobType === 'compact' && jobNode && (
            <div>
              <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 13 }}>
                3. Select Volumes {nodeVolumes.length > 0 && <Tag style={{ marginLeft: 4 }}>{nodeVolumes.length} available</Tag>}
              </div>
              {loadingVolumes ? (
                <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8' }}><SyncOutlined spin /> Loading volumes...</div>
              ) : nodeVolumes.length === 0 ? (
                <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8' }}>No volumes on this node</div>
              ) : (
                <Select
                  mode="multiple"
                  value={selectedVolumes}
                  onChange={(v) => { setSelectedVolumes(v); setJobParam(v.join(',')) }}
                  placeholder="Select volumes to compact..."
                  style={{ width: '100%' }}
                  maxTagCount={5}
                  options={nodeVolumes.map((v) => ({ value: v, label: `Volume ${v}` }))}
                />
              )}
            </div>
          )}

          {jobType === 'vacuum' && (
            <div>
              <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 13 }}>2. Garbage Threshold (optional)</div>
              <Input
                value={jobParam}
                onChange={(e) => setJobParam(e.target.value)}
                placeholder="0.3 (default: vacuum volumes with &gt;30% garbage)"
                addonAfter="%"
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#94a3b8' }}>Runs cluster-wide on all volumes. Lower threshold = more aggressive compaction.</div>
            </div>
          )}
        </div>
      </Modal>

      <Drawer
        title={`Node: ${selectedWorker?.name || ''}`}
        open={workerDrawer}
        onClose={() => setWorkerDrawer(false)}
        width={480}
      >
        {selectedWorker && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Address">{selectedWorker.address}</Descriptions.Item>
            <Descriptions.Item label="Health">
              {selectedWorker.healthy ? <Tag color="success">Online</Tag> : <Tag color="error">Offline</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Version"><code style={{ fontSize: 11 }}>{selectedWorker.version}</code></Descriptions.Item>
            <Descriptions.Item label="Volumes">{selectedWorker.volumes} / {selectedWorker.max_volumes}</Descriptions.Item>
            <Descriptions.Item label="EC Shards">{selectedWorker.ec_shards}</Descriptions.Item>
            <Descriptions.Item label="Capabilities">
              {selectedWorker.capabilities?.map((c) => <Tag key={c} color="purple">{c}</Tag>)}
            </Descriptions.Item>
            {selectedWorker.disk && (
              <>
                <Descriptions.Item label="Disk Path">{selectedWorker.disk.dir}</Descriptions.Item>
                <Descriptions.Item label="Total">{formatBytes(selectedWorker.disk.total_bytes)}</Descriptions.Item>
                <Descriptions.Item label="Used">{formatBytes(selectedWorker.disk.used_bytes)}</Descriptions.Item>
                <Descriptions.Item label="Free">{formatBytes(selectedWorker.disk.free_bytes)}</Descriptions.Item>
                <Descriptions.Item label="Usage">
                  <Progress percent={Math.round(selectedWorker.disk.percent_used * 10) / 10} size="small" />
                </Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="Last Seen">{formatDate(selectedWorker.last_seen)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      <Drawer
        title={`Job #${selectedJob?.id || ''}`}
        open={jobDrawer}
        onClose={() => setJobDrawer(false)}
        width={480}
      >
        {selectedJob && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Type"><Tag color="blue">{selectedJob.type}</Tag></Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={statusColors[selectedJob.status] || 'default'} icon={selectedJob.status === 'running' ? <SyncOutlined spin /> : selectedJob.status === 'success' ? <CheckCircleOutlined /> : selectedJob.status === 'failed' ? <CloseCircleOutlined /> : undefined}>
                {selectedJob.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Node">{selectedJob.node || '—'}</Descriptions.Item>
            <Descriptions.Item label="Duration">{formatMs(selectedJob.durationMs)}</Descriptions.Item>
            <Descriptions.Item label="Created">{formatDate(selectedJob.createdAt)}</Descriptions.Item>
            {selectedJob.result && (
              <Descriptions.Item label="Result">
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {selectedJob.result}
                </pre>
              </Descriptions.Item>
            )}
            {selectedJob.error && (
              <Descriptions.Item label="Error">
                <Tag color="error" style={{ whiteSpace: 'pre-wrap' }}>{selectedJob.error}</Tag>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Drawer>
    </div>
  )
}
