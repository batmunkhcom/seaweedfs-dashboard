import { useState, useEffect } from 'react'
import { Card, Table, Button, Modal, Tag, Space, message, Row, Col, Statistic, Input } from 'antd'
import {
  RobotOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  NodeIndexOutlined,
  ClusterOutlined,
} from '@ant-design/icons'
import { getWorkerStatus, listWorkerJobs, triggerWorkerDetect, triggerWorkerExecute } from '../../services/api'
import type { WorkerStatus, WorkerJob } from '../../types'
import { useAuthStore } from '../../stores/authStore'

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const statusColors: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  success: 'success',
  failed: 'error',
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerStatus[]>([])
  const [jobs, setJobs] = useState<WorkerJob[]>([])
  const [loading, setLoading] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [executeOpen, setExecuteOpen] = useState(false)
  const [jobType, setJobType] = useState('')
  const [jobNode, setJobNode] = useState('')
  const role = useAuthStore((s) => s.user?.role)
  const canWrite = role === 'admin' || role === 'operator'

  const fetch = () => {
    setLoading(true)
    Promise.all([getWorkerStatus(), listWorkerJobs()])
      .then(([w, j]) => { setWorkers(w); setJobs(j); })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const doDetect = async () => {
    setDetecting(true)
    try {
      const res = await triggerWorkerDetect()
      message.success(`Detected ${res.workersFound || 0} workers`)
      fetch()
    } catch {
      message.error('Detection failed')
    }
    setDetecting(false)
  }

  const doExecute = async () => {
    if (!jobType) return
    try {
      await triggerWorkerExecute(jobType, jobNode)
      message.success('Job triggered')
      setExecuteOpen(false)
      setJobType('')
      setJobNode('')
      fetch()
    } catch {
      message.error('Execution failed')
    }
  }

  const activeWorkers = workers.filter((w) => w.healthy).length

  const workerColumns = [
    { title: 'Node', dataIndex: 'name', key: 'name', render: (v: string) => <strong>{v}</strong> },
    { title: 'Health', dataIndex: 'healthy', key: 'healthy', render: (v: boolean) => v ? <Tag color="success">Online</Tag> : <Tag color="error">Offline</Tag> },
    { title: 'Volumes', dataIndex: 'volumes', key: 'volumes', render: (v: number, r: any) => r.maxVolumes ? `${v} / ${r.maxVolumes}` : v },
    { title: 'Capabilities', dataIndex: 'capabilities', key: 'capabilities', render: (v: string[]) => v?.map((c: string) => <Tag key={c}>{c}</Tag>) },
    { title: 'Last Seen', dataIndex: 'lastSeen', key: 'lastSeen', render: (v: string) => formatDate(v) },
  ]

  const jobColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Type', dataIndex: 'type', key: 'type', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={statusColors[v] || 'default'}>{v}</Tag> },
    { title: 'Node', dataIndex: 'node', key: 'node', render: (v: string) => v || '—' },
    { title: 'Duration', dataIndex: 'durationMs', key: 'durationMs', render: (v: number | null) => formatMs(v) },
    { title: 'Error', dataIndex: 'error', key: 'error', render: (v: string | null) => v ? <Tag color="error">{v}</Tag> : '—' },
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => formatDate(v) },
  ]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Active Workers" value={activeWorkers} suffix={`/ ${workers.length}`} prefix={<ClusterOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Total Jobs" value={jobs.length} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Running"
              value={jobs.filter((j) => j.status === 'running').length}
              prefix={<RobotOutlined spin />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Failed"
              value={jobs.filter((j) => j.status === 'failed').length}
              prefix={<ThunderboltOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: jobs.filter((j) => j.status === 'failed').length > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Workers</span>
            <Space>
              {canWrite && (
                <Button icon={<NodeIndexOutlined />} size="small" loading={detecting} onClick={doDetect}>Detect</Button>
              )}
              <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
            </Space>
          </div>
          <Table dataSource={workers} columns={workerColumns} rowKey="name" loading={loading} size="small" pagination={false} locale={{ emptyText: 'No workers detected' }} />
        </Col>

        <Col xs={24} lg={10}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Recent Jobs</span>
            {canWrite && (
              <Button icon={<PlayCircleOutlined />} size="small" type="primary" onClick={() => setExecuteOpen(true)}>Execute</Button>
            )}
          </div>
          <Table dataSource={jobs.slice(0, 10)} columns={jobColumns} rowKey="id" loading={loading} size="small" pagination={false} locale={{ emptyText: 'No jobs yet' }} />
        </Col>
      </Row>

      <Modal open={executeOpen} title="Execute Job" onOk={doExecute} onCancel={() => setExecuteOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            addonBefore="Type"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            placeholder="e.g. balance, vacuum, compact"
          />
          <Input
            addonBefore="Node"
            value={jobNode}
            onChange={(e) => setJobNode(e.target.value)}
            placeholder="Optional: target node address"
          />
        </div>
      </Modal>
    </div>
  )
}
