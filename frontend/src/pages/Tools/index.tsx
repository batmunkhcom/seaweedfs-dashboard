import { useState, useEffect } from 'react'
import { Card, Table, Button, Tag, Space, message, Row, Col, Statistic, Typography, Tooltip, Progress, Input } from 'antd'
import {
  ThunderboltOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  NodeIndexOutlined,
  ApiOutlined,
  CloudServerOutlined,
  PlayCircleOutlined,
  DashboardOutlined,
  GlobalOutlined,
  SendOutlined,
  RadarChartOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import { pingNodes, serviceCheck, triggerEmbeddingIndex } from '../../services/api'
import api from '../../services/api'

const { Text } = Typography

interface PingService {
  port: number; service: string; reachable: boolean; latency_ms?: number
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

interface ToolStatus {
  node_count: number; master_count: number; volume_count: number; filer_count: number; s3_count: number
  version: string; leader: string; ai_enabled: boolean
  embedding_stats: { total_chunks: number; sources: number; dimension: number }
}

function formatMs(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatLatency(ms: number | undefined): string {
  if (ms === undefined || ms === null || ms <= 0) return '—'
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function ToolsPage() {
  const [status, setStatus] = useState<ToolStatus | null>(null)
  const [pingLoading, setPingLoading] = useState(false)
  const [pingResult, setPingResult] = useState<PingNode[] | null>(null)
  const [pingSummary, setPingSummary] = useState({ total: 0, reachable: 0, elapsed: 0 })

  const [svcLoading, setSvcLoading] = useState(false)
  const [svcResult, setSvcResult] = useState<ServiceCheckNode[] | null>(null)
  const [svcSummary, setSvcSummary] = useState({ total: 0, passed: 0, failed: 0, elapsed: 0 })

  const [indexing, setIndexing] = useState(false)
  const [indexResult, setIndexResult] = useState<{ ok: boolean; total_chunks: number; indexed: number; files: number; error?: string } | null>(null)
  const [runAllLoading, setRunAllLoading] = useState(false)

  const [netHost, setNetHost] = useState('')
  const [netResult, setNetResult] = useState<{ ok: boolean; host: string; reachable: boolean; latency_ms: number; output: string } | null>(null)
  const [netLoading, setNetLoading] = useState(false)
  const [inetLoading, setInetLoading] = useState(false)
  const [traceLoading, setTraceLoading] = useState(false)

  useEffect(() => {
    api.get('/tools/status').then((r) => setStatus(r.data)).catch(() => {})
  }, [])

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

  const handleRunAll = async () => {
    setRunAllLoading(true)
    await handlePing()
    await handleServiceCheck()
    setRunAllLoading(false)
  }

  const handlePingHost = async () => {
    const h = netHost.trim()
    if (!h) { message.warning('Enter a hostname or IP'); return }
    setNetLoading(true)
    setNetResult(null)
    try {
      const { data } = await api.post('/tools/ping-host', { host: h })
      setNetResult(data)
      if (data.reachable) message.success(`${h}: ${data.latency_ms}ms`)
      else message.warning(`${h}: unreachable`)
    } catch {
      message.error('Ping failed')
    }
    setNetLoading(false)
  }

  const handleInternetCheck = async () => {
    setInetLoading(true)
    setNetResult(null)
    try {
      const { data } = await api.post('/tools/ping-internet')
      setNetResult(data)
      if (data.reachable) message.success(`Internet: ${data.latency_ms}ms to 8.8.8.8`)
      else message.error('Internet unreachable')
    } catch {
      message.error('Check failed')
    }
    setInetLoading(false)
    setNetHost('')
  }

  const handleTraceroute = async () => {
    const h = netHost.trim()
    if (!h) { message.warning('Enter a hostname or IP'); return }
    setTraceLoading(true)
    setNetResult(null)
    try {
      const { data } = await api.post('/tools/traceroute', { host: h })
      setNetResult(data)
      message.success(`${data.hops} hops to ${h}`)
    } catch {
      message.error('Traceroute failed')
    }
    setTraceLoading(false)
  }

  const pingReachable = pingResult ? pingSummary.reachable : 0
  const pingTotal = pingResult ? pingSummary.total : 28
  const pingPct = pingTotal > 0 ? Math.round((pingReachable / pingTotal) * 100) : 0

  const svcPassed = svcResult ? svcSummary.passed : 0
  const svcTotal = svcResult ? svcSummary.total : 0
  const svcPct = svcTotal > 0 ? Math.round((svcPassed / svcTotal) * 100) : 0

  const pingColumns = [
    { title: 'Node', dataIndex: 'host', key: 'host', width: 150, render: (h: string) => <Text code>{h}</Text> },
    {
      title: 'Master :9333', key: 'master', width: 120, align: 'center' as const,
      render: (_: unknown, r: PingNode) => {
        const s = r.services.find((x) => x.service === 'master')
        if (!s) return <Text type="secondary" style={{ fontSize: 11 }}>N/A</Text>
        return (
          <Tooltip title={s.reachable ? `Latency: ${formatLatency(s.latency_ms)}` : 'Unreachable'}>
            {s.reachable
              ? <Tag color="success" style={{ margin: 0 }}>{formatLatency(s.latency_ms)}</Tag>
              : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />}
          </Tooltip>
        )
      },
    },
    {
      title: 'Volume :8080', key: 'volume', width: 120, align: 'center' as const,
      render: (_: unknown, r: PingNode) => {
        const s = r.services.find((x) => x.service === 'volume')
        return s?.reachable
          ? <Tag color="success" style={{ margin: 0 }}>{formatLatency(s.latency_ms)}</Tag>
          : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
      },
    },
    {
      title: 'Filer :8888', key: 'filer', width: 120, align: 'center' as const,
      render: (_: unknown, r: PingNode) => {
        const s = r.services.find((x) => x.service === 'filer')
        return s?.reachable
          ? <Tag color="success" style={{ margin: 0 }}>{formatLatency(s.latency_ms)}</Tag>
          : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
      },
    },
    {
      title: 'S3 :8333', key: 's3', width: 120, align: 'center' as const,
      render: (_: unknown, r: PingNode) => {
        const s = r.services.find((x) => x.service === 's3')
        return s?.reachable
          ? <Tag color="success" style={{ margin: 0 }}>{formatLatency(s.latency_ms)}</Tag>
          : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
      },
    },
  ]

  const svcColumns = [
    { title: 'Node', dataIndex: 'host', key: 'host', width: 150, render: (h: string) => <Text code>{h}</Text> },
    { title: 'Service', dataIndex: 'service', key: 'service', width: 80, render: (s: string) => {
      const colors: Record<string, string> = { master: 'blue', volume: 'green', filer: 'purple', s3: 'orange' }
      return <Tag color={colors[s] || 'default'}>{s}</Tag>
    }},
    { title: 'Port', dataIndex: 'port', key: 'port', width: 60 },
    {
      title: 'Status', key: 'status', width: 140,
      render: (_: unknown, r: ServiceCheckEntry) => r.reachable
        ? <Tag color="success" icon={<CheckCircleOutlined />}>{r.status} OK · {formatLatency(r.latency_ms || 0)}</Tag>
        : <Tag color="error" icon={<CloseCircleOutlined />}>{r.error || 'unreachable'}</Tag>,
    },
    { title: 'Endpoint', dataIndex: 'path', key: 'path', width: 150, render: (p: string) => <Text code style={{ fontSize: 11 }}>{p}</Text> },
  ]

  return (
    <div style={{ padding: '0 0 24px 0' }}>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Nodes"
              value={status?.node_count || 7}
              valueStyle={{ fontSize: 24 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Ping"
              value={pingPct}
              suffix="%"
              precision={0}
              valueStyle={{ fontSize: 24, color: pingResult ? (pingPct === 100 ? '#52c41a' : '#ff4d4f') : '#64748b' }}
              loading={pingLoading}
            />
            {pingResult && <Progress percent={pingPct} size="small" status={pingPct === 100 ? 'success' : 'exception'} showInfo={false} />}
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Services"
              value={svcPct}
              suffix="%"
              precision={0}
              valueStyle={{ fontSize: 24, color: svcResult ? (svcPct === 100 ? '#52c41a' : '#ff4d4f') : '#64748b' }}
              loading={svcLoading}
            />
            {svcResult && <Progress percent={svcPct} size="small" status={svcPct === 100 ? 'success' : 'exception'} showInfo={false} />}
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Embeddings"
              value={status?.embedding_stats?.total_chunks || indexResult?.total_chunks || 0}
              suffix="chunks"
              valueStyle={{ fontSize: 24 }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ marginTop: 16, marginBottom: 8, display: 'flex', gap: 8 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} loading={runAllLoading} onClick={handleRunAll} size="middle">
          Run All Checks
        </Button>
        <Button icon={<ReloadOutlined />} loading={pingLoading} onClick={handlePing}>Ping</Button>
        <Button icon={<ApiOutlined />} loading={svcLoading} onClick={handleServiceCheck}>Service Check</Button>
      </div>

      <Card
        title={<><ThunderboltOutlined /> Ping Nodes</>}
        extra={pingResult ? <Text type="secondary" style={{ fontSize: 12 }}>{pingReachable}/{pingTotal} reachable · {formatMs(pingSummary.elapsed)}</Text> : null}
        style={{ marginTop: 8 }}
      >
        {pingResult ? (
          <Table
            dataSource={pingResult.map((n) => ({ ...n, key: n.host }))}
            columns={pingColumns}
            pagination={false}
            size="small"
            bordered
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            <ThunderboltOutlined style={{ fontSize: 28, marginBottom: 12, display: 'block' }} />
            <Text type="secondary">TCP connectivity test to all cluster nodes on master (9333), volume (8080), filer (8888), and S3 (8333) ports. Click Run All Checks or Ping to begin.</Text>
          </div>
        )}
      </Card>

      <Card
        title={<><ApiOutlined /> Service Check</>}
        extra={svcResult ? <Text type="secondary" style={{ fontSize: 12 }}>{svcPassed}/{svcTotal} healthy · {formatMs(svcSummary.elapsed)}</Text> : null}
        style={{ marginTop: 12 }}
      >
        {svcResult ? (
          <Table
            dataSource={svcResult.flatMap((n) => n.checks.map((c) => ({ ...c, host: n.host, key: `${n.host}-${c.port}` })))}
            columns={svcColumns}
            pagination={false}
            size="small"
            bordered
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            <CloudServerOutlined style={{ fontSize: 28, marginBottom: 12, display: 'block' }} />
            <Text type="secondary">HTTP health check — probes each expected service endpoint (only relevant ports per node). Click Service Check to begin.</Text>
          </div>
        )}
      </Card>

      <Row gutter={16} style={{ marginTop: 12 }}>
        <Col xs={24} lg={12}>
          <Card
            title={<><NodeIndexOutlined /> Re-index Wiki</>}
            extra={<Button type="primary" size="small" icon={<SyncOutlined spin={indexing} />} loading={indexing} onClick={handleReindex}>{indexing ? 'Indexing...' : 'Re-index'}</Button>}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              Re-index all <code>wiki/</code> documentation for the AI chatbot. Auto-indexes every 6 hours when AI is enabled.
            </Text>
            {indexResult && indexResult.ok && (
              <div style={{ marginTop: 12 }}>
                <Space size={[4, 4]} wrap>
                  <Tag color="success">Indexed {indexResult.indexed} new</Tag>
                  <Tag>{indexResult.total_chunks} total chunks</Tag>
                  <Tag>{indexResult.files} files</Tag>
                </Space>
              </div>
            )}
            {indexResult && !indexResult.ok && (
              <div style={{ marginTop: 12 }}><Tag color="error">{indexResult.error || 'Indexing failed'}</Tag></div>
            )}
            {status && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {status.embedding_stats.total_chunks} chunks · {status.embedding_stats.sources} sources · {status.embedding_stats.dimension}d
                </Text>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<><DashboardOutlined /> Cluster Info</>}>
            {status ? (
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Row>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Version</Text></Col>
                  <Col span={16}><Text code style={{ fontSize: 12 }}>{status.version}</Text></Col>
                </Row>
                <Row>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Leader</Text></Col>
                  <Col span={16}><Text code style={{ fontSize: 12 }}>{status.leader}</Text></Col>
                </Row>
                <Row>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>AI Status</Text></Col>
                  <Col span={16}><Tag color={status.ai_enabled ? 'green' : 'default'} style={{ fontSize: 11 }}>{status.ai_enabled ? 'Enabled' : 'Disabled'}</Tag></Col>
                </Row>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Services</Text>
                  <Space size={[4, 4]} wrap>
                    <Tag color="blue">Master ×{status.master_count}</Tag>
                    <Tag color="green">Volume ×{status.volume_count}</Tag>
                    <Tag color="purple">Filer ×{status.filer_count}</Tag>
                    <Tag color="orange">S3 ×{status.s3_count}</Tag>
                  </Space>
                </div>
              </Space>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>Loading cluster info...</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title={<><GlobalOutlined /> Network Tools</>}
        style={{ marginTop: 12 }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={14}>
            <Input
              value={netHost}
              onChange={(e) => setNetHost(e.target.value)}
              onPressEnter={handlePingHost}
              placeholder="Hostname or IP (e.g. 172.16.0.1 or google.com)"
              disabled={netLoading || inetLoading || traceLoading}
              allowClear
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            />
          </Col>
          <Col xs={8} sm={4}>
            <Button
              block
              icon={netLoading ? <LoadingOutlined /> : <SendOutlined />}
              loading={netLoading}
              onClick={handlePingHost}
              disabled={!netHost.trim()}
              size="middle"
            >
              Ping
            </Button>
          </Col>
          <Col xs={8} sm={3}>
            <Button block icon={<RadarChartOutlined />} loading={traceLoading} onClick={handleTraceroute} disabled={!netHost.trim()} size="middle">
              Trace
            </Button>
          </Col>
          <Col xs={8} sm={3}>
            <Button block icon={<GlobalOutlined />} loading={inetLoading} onClick={handleInternetCheck} size="middle">
              Internet
            </Button>
          </Col>
        </Row>

        {netResult && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(15,23,42,0.5)', borderRadius: 6, border: '1px solid rgba(168,85,247,0.08)' }}>
            <div style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Text strong>{netResult.host}</Text>
              {netResult.reachable
                ? <Tag color="success">{netResult.latency_ms}ms</Tag>
                : <Tag color="error">unreachable</Tag>}
            </div>
            {netResult.output && (
              <pre style={{ margin: 0, padding: '8px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto' }}>
                {netResult.output}
              </pre>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
