import { useState, useEffect, useCallback } from 'react'
import { Row, Col, Card, Table, Tag, Select, Spin, Tabs, Progress, Statistic, Empty, Tooltip, Skeleton } from 'antd'
import {
  DashboardOutlined,
  ClusterOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts'
import { getMetricsOverview, getMetricsNodes, getMetricsHistory, getMetricsAlive } from '../../services/api'
import { useSSE } from '../../hooks/useSSE'
import type { MetricsOverview, MetricsHistoryPoint, NodeHealthInfo, MetricsNodeInfo } from '../../types'

const COLORS = ['#a855f7', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString()
}

function formatGB(gb: number): string {
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`
  return `${gb.toFixed(0)} GB`
}

export default function MetricsPage() {
  const [overview, setOverview] = useState<MetricsOverview | null>(null)
  const [nodes, setNodes] = useState<MetricsNodeInfo[]>([])
  const [aliveNodes, setAliveNodes] = useState<NodeHealthInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [history, setHistory] = useState<MetricsHistoryPoint[]>([])
  const [historyMetric, setHistoryMetric] = useState('disk_usage_pct')
  const [historyHours, setHistoryHours] = useState(24)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [aliveLoading, setAliveLoading] = useState(false)

  const fetchOverview = useCallback(async () => {
    try {
      const [ov, nds] = await Promise.all([getMetricsOverview(), getMetricsNodes()])
      setOverview(ov)
      setNodes(nds)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOverview()
    fetchAlive()
  }, [fetchOverview])

  useSSE('metrics_update', () => {
    fetchOverview()
  })

  const fetchAlive = useCallback(async () => {
    setAliveLoading(true)
    try {
      const data = await getMetricsAlive()
      setAliveNodes(data)
    } catch {}
    setAliveLoading(false)
  }, [])

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const data = await getMetricsHistory(
        selectedNode || undefined,
        historyMetric,
        historyHours,
        !selectedNode,
      )
      setHistory(data)
    } catch {}
    setHistoryLoading(false)
  }, [selectedNode, historyMetric, historyHours])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const metricOptions = [
    { value: 'disk_usage_pct', label: 'Disk Usage %' },
    { value: 'volumes', label: 'Volume Count' },
    { value: 'free_slots', label: 'Free Slots' },
    { value: 'max_slots', label: 'Max Slots' },
    { value: 'disk_total_gb', label: 'Disk Total GB' },
    { value: 'disk_free_gb', label: 'Disk Free GB' },
  ]

  const aliveColumns = [
    { title: 'Node', dataIndex: 'node', key: 'node' },
    {
      title: 'Status', dataIndex: 'alive', key: 'alive',
      render: (alive: boolean) => alive ? <Tag icon={<CheckCircleOutlined />} color="green">Alive</Tag> : <Tag icon={<CloseCircleOutlined />} color="red">Down</Tag>,
    },
    {
      title: 'Latency', dataIndex: 'latency_ms', key: 'latency',
      render: (v: number | null) => v != null ? `${v} ms` : '—',
    },
    {
      title: 'Error', dataIndex: 'error', key: 'error',
      render: (e: string | null) => e ? <Tooltip title={e}><Tag color="red">Error</Tag></Tooltip> : '—',
      ellipsis: true,
    },
  ]

  const nodesColumns = [
    { title: 'Node', dataIndex: 'node', key: 'node' },
    { title: 'Volumes', dataIndex: 'volumes', key: 'volumes' },
    {
      title: 'Disk', dataIndex: 'disk_total_gb', key: 'disk',
      render: (_: number, r: MetricsNodeInfo) => (
        <Tooltip title={`${formatGB(r.disk_free_gb)} free / ${formatGB(r.disk_total_gb)} total`}>
          <Progress
            percent={r.disk_total_gb > 0 ? ((r.disk_total_gb - r.disk_free_gb) / r.disk_total_gb) * 100 : 0}
            size="small"
            status={r.disk_usage_pct > 85 ? 'exception' : r.disk_usage_pct > 60 ? 'active' : 'normal'}
            format={() => `${r.disk_usage_pct.toFixed(1)}%`}
          />
        </Tooltip>
      ),
    },
    { title: 'Vol Slots', key: 'slots', render: (_: number, r: MetricsNodeInfo) => `${r.volumes}/${r.max_slots}` },
    { title: 'EC', dataIndex: 'ec_shards', key: 'ec' },
  ]

  const isMultiNode = !selectedNode && history.some(h => h.node)
  const nodesInHistory = isMultiNode ? [...new Set(history.filter(h => h.node).map(h => h.node!))] : []
  const chartData = isMultiNode
    ? (() => {
        const buckets: Record<number, Record<string, number>> = {}
        history.forEach(h => {
          const bucket = Math.round(h.timestamp / 60) * 60
          if (!buckets[bucket]) buckets[bucket] = {}
          buckets[bucket][h.node!] = h.value
        })
        return Object.entries(buckets)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([ts, values]) => ({ time: formatTimestamp(Number(ts)), ...values }))
      })()
    : history.map(h => ({ time: formatTimestamp(h.timestamp), value: h.value }))

  return (
    <div>
      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <Card><Statistic title="Total Volumes" value={overview?.total_volumes || 0} prefix={<DashboardOutlined />} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card><Statistic title="Nodes Healthy" value={`${overview?.nodes_healthy || 0}/${overview?.nodes_total || 0}`} valueStyle={{ color: overview && overview.nodes_healthy === overview.nodes_total ? '#22c55e' : '#f59e0b' }} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card><Statistic title="Disk Usage" value={overview?.cluster_disk_usage_pct || 0} suffix="%" precision={1} valueStyle={{ color: (overview?.cluster_disk_usage_pct || 0) > 85 ? '#ef4444' : '#a855f7' }} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card><Statistic title="Free Disk" value={formatGB(overview?.total_disk_free_gb || 0)} /></Card>
          </Col>
        </Row>
      </Spin>

      <Tabs
        defaultActiveKey="nodes"
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'nodes',
            label: <span><ClusterOutlined /> Nodes</span>,
            children: (
              <Card>
                <Table
                  dataSource={nodes.map((n, i) => ({ ...n, key: i }))}
                  columns={nodesColumns}
                  pagination={false}
                  size="small"
                  onRow={(record) => ({
                    style: { cursor: 'pointer' },
                    onClick: () => setSelectedNode(selectedNode === record.node ? null : record.node),
                  })}
                  locale={{ emptyText: <Empty description="No nodes found" /> }}
                />
              </Card>
            ),
          },
          {
            key: 'history',
            label: <span><HistoryOutlined /> History</span>,
            children: (
              <Card
                extra={
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selectedNode && <Tag closable color="purple" onClose={() => setSelectedNode(null)}>{selectedNode}</Tag>}
                    <Select
                      style={{ width: 160 }}
                      value={historyMetric}
                      onChange={setHistoryMetric}
                      options={metricOptions}
                    />
                    <Select
                      style={{ width: 100 }}
                      value={historyHours}
                      onChange={setHistoryHours}
                      options={[
                        { value: 1, label: '1 hour' },
                        { value: 6, label: '6 hours' },
                        { value: 24, label: '24 hours' },
                        { value: 168, label: '7 days' },
                      ]}
                    />
                  </div>
                }
              >
                <Spin spinning={historyLoading}>
                  {historyLoading ? (
                    <Skeleton active paragraph={{ rows: 6 }} />
                  ) : chartData.length > 1 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                        <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                        <YAxis stroke="#64748b" fontSize={11} domain={['auto', 'auto']} />
                        <RechartsTooltip
                          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                          labelStyle={{ color: '#94a3b8' }}
                        />
                        {isMultiNode ? (
                          <>
                            {nodesInHistory.map((node, i) => (
                              <Line key={node} type="monotone" dataKey={node} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                            ))}
                            <Legend />
                          </>
                        ) : (
                          <Line type="monotone" dataKey="value" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Empty description="No history data yet" />
                  )}
                </Spin>
                <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                  {metricOptions.find(m => m.value === historyMetric)?.label || historyMetric}
                  {selectedNode ? ` — ${selectedNode}` : isMultiNode ? ` — all nodes` : ' — cluster average'}
                </div>
              </Card>
            ),
          },
          {
            key: 'alive',
            label: <span><SyncOutlined spin={aliveLoading} /> Liveness</span>,
            children: (
              <Card extra={<a onClick={fetchAlive} style={{ cursor: 'pointer' }}>Refresh</a>}>
                <Table
                  dataSource={aliveNodes.map((n, i) => ({ ...n, key: i }))}
                  columns={aliveColumns}
                  pagination={false}
                  size="small"
                  locale={{ emptyText: <Empty description="No data. Click Refresh to check." /> }}
                  loading={aliveLoading}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}
