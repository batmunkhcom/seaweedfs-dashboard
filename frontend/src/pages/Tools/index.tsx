import { useState } from 'react'
import { Card, Table, Button, Tag, Space, message, Row, Col, Statistic, Typography } from 'antd'
import {
  ThunderboltOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  NodeIndexOutlined,
  ApiOutlined,
  CloudServerOutlined,
} from '@ant-design/icons'
import { pingNodes, serviceCheck, triggerEmbeddingIndex } from '../../services/api'

const { Text } = Typography

interface PingService {
  port: number; service: string; reachable: boolean
}

interface PingNode {
  host: string; services: PingService[]
}

interface ServiceCheckEntry {
  port: number; service: string; path: string; reachable: boolean; status?: number; latency_ms?: number; error?: string
}

interface ServiceCheckNode {
  host: string; checks: ServiceCheckEntry[]
}

function formatMs(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function ToolsPage() {
  const [pingLoading, setPingLoading] = useState(false)
  const [pingResult, setPingResult] = useState<PingNode[] | null>(null)
  const [pingSummary, setPingSummary] = useState({ total: 0, reachable: 0, elapsed: 0 })

  const [svcLoading, setSvcLoading] = useState(false)
  const [svcResult, setSvcResult] = useState<ServiceCheckNode[] | null>(null)
  const [svcSummary, setSvcSummary] = useState({ total: 0, passed: 0, failed: 0, elapsed: 0 })

  const [indexing, setIndexing] = useState(false)
  const [indexResult, setIndexResult] = useState<{ ok: boolean; total_chunks: number; indexed: number; files: number; error?: string } | null>(null)

  const handlePing = async () => {
    setPingLoading(true)
    try {
      const res = await pingNodes()
      setPingResult(res.nodes)
      setPingSummary({ total: res.total, reachable: res.reachable, elapsed: res.elapsed_ms })
      if (res.reachable === res.total) {
        message.success(`All ${res.total} ports reachable in ${res.elapsed_ms}ms`)
      } else {
        message.warning(`${res.reachable}/${res.total} ports reachable`)
      }
    } catch {
      message.error('Ping failed')
    }
    setPingLoading(false)
  }

  const handleServiceCheck = async () => {
    setSvcLoading(true)
    try {
      const res = await serviceCheck()
      setSvcResult(res.nodes)
      setSvcSummary({ total: res.total_checks, passed: res.passed, failed: res.failed, elapsed: res.elapsed_ms })
      if (res.failed === 0) {
        message.success(`All ${res.total_checks} services healthy in ${res.elapsed_ms}ms`)
      } else {
        message.warning(`${res.passed}/${res.total_checks} services healthy — ${res.failed} failed`)
      }
    } catch {
      message.error('Service check failed')
    }
    setSvcLoading(false)
  }

  const handleReindex = async () => {
    setIndexing(true)
    setIndexResult(null)
    try {
      const res = await triggerEmbeddingIndex()
      setIndexResult(res)
      if (res.ok) {
        message.success(`Indexed ${res.indexed}/${res.total_chunks} chunks from ${res.files} files`)
      } else {
        message.error(res.error || 'Indexing failed')
      }
    } catch {
      message.error('Re-index request failed')
    }
    setIndexing(false)
  }

  const pingColumns = [
    { title: 'Node', dataIndex: 'host', key: 'host', width: 160, render: (h: string) => <Text code>{h}</Text> },
    {
      title: 'Master :9333', key: 'master', width: 100, align: 'center' as const,
      render: (_: unknown, r: PingNode) => {
        const s = r.services.find((x) => x.service === 'master')
        return s?.reachable ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
      },
    },
    {
      title: 'Volume :8080', key: 'volume', width: 100, align: 'center' as const,
      render: (_: unknown, r: PingNode) => {
        const s = r.services.find((x) => x.service === 'volume')
        return s?.reachable ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
      },
    },
    {
      title: 'Filer :8888', key: 'filer', width: 100, align: 'center' as const,
      render: (_: unknown, r: PingNode) => {
        const s = r.services.find((x) => x.service === 'filer')
        return s?.reachable ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
      },
    },
    {
      title: 'S3 :8333', key: 's3', width: 100, align: 'center' as const,
      render: (_: unknown, r: PingNode) => {
        const s = r.services.find((x) => x.service === 's3')
        return s?.reachable ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
      },
    },
  ]

  const svcColumns = [
    { title: 'Node', dataIndex: 'host', key: 'host', width: 140, render: (h: string) => <Text code>{h}</Text> },
    { title: 'Service', dataIndex: 'service', key: 'service', width: 80, render: (s: string) => <Tag color="blue">{s}</Tag> },
    { title: 'Port', dataIndex: 'port', key: 'port', width: 70 },
    {
      title: 'Status', key: 'status', width: 130,
      render: (_: unknown, r: ServiceCheckEntry) => r.reachable
        ? <Tag color="success" icon={<CheckCircleOutlined />}>{r.status} OK</Tag>
        : <Tag color="error" icon={<CloseCircleOutlined />}>{r.error || 'unreachable'}</Tag>,
    },
    { title: 'Latency', dataIndex: 'latency_ms', key: 'latency', width: 90, render: (v: number | undefined) => formatMs(v) },
    { title: 'API Path', dataIndex: 'path', key: 'path', width: 140, render: (p: string) => <Text code style={{ fontSize: 11 }}>{p}</Text> },
  ]

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Nodes" value={pingResult?.length ?? 7} valueStyle={{ fontSize: 24 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Ping Reachable"
              value={pingSummary.reachable}
              suffix={`/ ${pingSummary.total}`}
              valueStyle={{ fontSize: 24, color: pingSummary.reachable === pingSummary.total && pingSummary.total > 0 ? '#52c41a' : '#ff4d4f' }}
              loading={pingLoading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Services Healthy"
              value={svcSummary.passed}
              suffix={`/ ${svcSummary.total}`}
              valueStyle={{ fontSize: 24, color: svcSummary.failed === 0 && svcSummary.total > 0 ? '#52c41a' : '#ff4d4f' }}
              loading={svcLoading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Embeddings"
              value={indexResult?.total_chunks ?? 0}
              suffix={`chunks`}
              valueStyle={{ fontSize: 24 }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={<><ThunderboltOutlined /> Ping Nodes</>}
        extra={<Button icon={<ReloadOutlined />} loading={pingLoading} onClick={handlePing} size="small">Run Ping</Button>}
        style={{ marginTop: 16 }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>TCP connectivity check to all cluster nodes on master (9333), volume (8080), filer (8888), and S3 (8333) ports.</Text>
        {pingResult && (
          <Table
            dataSource={pingResult.map((n) => ({ ...n, key: n.host }))}
            columns={pingColumns}
            pagination={false}
            size="small"
            bordered
            locale={{ emptyText: 'No ping results yet' }}
          />
        )}
        {!pingResult && <Text type="secondary">Click "Run Ping" to test connectivity to all 7 nodes.</Text>}
      </Card>

      <Card
        title={<><ApiOutlined /> Service Check</>}
        extra={<Button icon={<ReloadOutlined />} loading={svcLoading} onClick={handleServiceCheck} size="small">Check Services</Button>}
        style={{ marginTop: 16 }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>HTTP health check — probes each expected service endpoint and reports status code + latency.</Text>
        {svcResult && (
          <Table
            dataSource={svcResult.flatMap((n) => n.checks.map((c) => ({ ...c, host: n.host, key: `${n.host}-${c.port}` })))}
            columns={svcColumns}
            pagination={false}
            size="small"
            bordered
            locale={{ emptyText: 'No service check results yet' }}
          />
        )}
        {!svcResult && <Text type="secondary">Click "Check Services" to probe all service endpoints.</Text>}
      </Card>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card
            title={<><NodeIndexOutlined /> Re-index Wiki</>}
            extra={<Button type="primary" icon={<SyncOutlined spin={indexing} />} loading={indexing} onClick={handleReindex} size="small">{indexing ? 'Indexing...' : 'Re-index Now'}</Button>}
          >
            <Text type="secondary">Re-indexes all wiki documentation for the AI chatbot. The indexer reads all <code>wiki/</code> files, chunks them, generates embeddings, and stores them.<br />Auto-indexing runs every 6 hours when AI is enabled.</Text>
            {indexResult && indexResult.ok && (
              <div style={{ marginTop: 12 }}>
                <Tag color="success">Indexed {indexResult.indexed}/{indexResult.total_chunks} chunks</Tag>
                <Tag>Files: {indexResult.files}</Tag>
              </div>
            )}
            {indexResult && !indexResult.ok && (
              <div style={{ marginTop: 12 }}><Tag color="error">{indexResult.error || 'Indexing failed'}</Tag></div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<><CloudServerOutlined /> Quick Summary</>}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Cluster Nodes</Text>
              <Text type="secondary">7 nodes (.101–.107), rack2, dc03</Text>
              <Text strong style={{ display: 'block', marginTop: 8 }}>Services</Text>
              <Space size={[4, 4]} wrap>
                <Tag color="blue">Master ×3</Tag>
                <Tag color="green">Volume ×7</Tag>
                <Tag color="purple">Filer ×2</Tag>
                <Tag color="orange">S3 ×4</Tag>
              </Space>
              <Text strong style={{ display: 'block', marginTop: 8 }}>Endpoints</Text>
              <Text code style={{ fontSize: 11 }}>/api/tools/ping</Text>
              <Text code style={{ fontSize: 11, marginLeft: 12 }}>/api/tools/service-check</Text>
              <Text code style={{ fontSize: 11, marginLeft: 12 }}>/api/chatbot/embedding/index</Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
