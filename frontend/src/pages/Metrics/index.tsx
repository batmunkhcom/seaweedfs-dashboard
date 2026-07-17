import { useState, useEffect, useCallback } from 'react'
import { Row, Col, Card, Table, Tag, Select, Spin, Tabs, Progress, Statistic, Empty, Tooltip } from 'antd'
import {
  DashboardOutlined,
  ClusterOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { getMetricsOverview, getMetricsNodes, getMetricsHistory, getMetricsAlive } from '../../services/api'
import { useSSE } from '../../hooks/useSSE'
import type { MetricsOverview, MetricsHistoryPoint, NodeHealthInfo, MetricsNodeInfo } from '../../types'

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString()
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

  const fetchNodeDetail = useCallback(async (ip: string) => {
    setSelectedNode(ip)
  }, [])

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const data = await getMetricsHistory(
        selectedNode || undefined,
        historyMetric.startsWith('cluster_') ? historyMetric.replace('cluster_', '') : historyMetric,
        historyHours,
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
    { value: 'ec_shards', label: 'EC Shards' },
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
    { title: 'Free', dataIndex: 'free_slots', key: 'free' },
    { title: 'Max', dataIndex: 'max_slots', key: 'max' },
    {
      title: 'Usage', dataIndex: 'disk_usage_pct', key: 'usage',
      render: (v: number) => <Progress percent={v} size="small" status={v > 85 ? 'exception' : v > 60 ? 'active' : 'normal'} format={(p) => `${p?.toFixed(1)}%`} />,
    },
    { title: 'EC', dataIndex: 'ec_shards', key: 'ec' },
  ]

  const historyChartData = history.length > 0 ? history.map(h => ({
    time: formatTimestamp(h.timestamp),
    value: h.value,
  })) : []

  const maxHistoryValue = history.length > 0 ? Math.max(...history.map(h => h.value), 10) : 100

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
            <Card><Statistic title="Free Slots" value={overview?.total_free_slots || 0} /></Card>
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
                    onClick: () => fetchNodeDetail(record.node),
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
                  {history.length > 0 ? (
                    <div style={{ position: 'relative', height: 300 }}>
                      <svg viewBox={`0 0 ${Math.max(historyChartData.length * 4, 300)} 240`} style={{ width: '100%', height: 300 }}>
                        {historyChartData.length > 1 && (
                          <polyline
                            fill="none"
                            stroke="#a855f7"
                            strokeWidth="2"
                            points={historyChartData.map((d, i) => {
                              const x = (i / Math.max(historyChartData.length - 1, 1)) * Math.max(historyChartData.length * 4, 300)
                              const y = 240 - (d.value / maxHistoryValue) * 200
                              return `${x},${y}`
                            }).join(' ')}
                          />
                        )}
                        {historyChartData.filter((_, i) => i % Math.max(Math.floor(historyChartData.length / 8), 1) === 0).map((d, i) => (
                          <text key={i} x={(i / Math.max(historyChartData.length - 1, 1)) * Math.max(historyChartData.length * 4, 300)} y={235} fill="#64748b" fontSize="10" textAnchor={i === 0 ? 'start' : 'middle'}>
                            {d.time}
                          </text>
                        ))}
                      </svg>
                      <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                        {historyMetric.replace(/_/g, ' ')} {selectedNode ? `— ${selectedNode}` : '— cluster average'}
                      </div>
                    </div>
                  ) : (
                    <Empty description="No history data yet. Metrics are collected every 60 seconds." />
                  )}
                </Spin>
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
