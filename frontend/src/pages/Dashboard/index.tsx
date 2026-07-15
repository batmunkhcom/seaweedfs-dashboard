import { useState, useEffect, useCallback } from 'react'
import { Row, Col, Card, Tag, Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { getDashboardStats, getAlerts } from '../../services/api'
import { useSSE } from '../../hooks/useSSE'
import StatCards from '../../components/StatCard'
import DiskUsageChart from '../../components/DiskUsageChart'
import type { DashboardStats, AlertEvent } from '../../types'

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [alerts, setAlerts] = useState<AlertEvent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const data = await getDashboardStats()
      setStats(data)
    } catch {}
    setLoading(false)
  }, [])

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getAlerts()
      setAlerts(data)
    } catch {}
  }, [])

  useEffect(() => {
    fetchStats()
    fetchAlerts()
  }, [fetchStats, fetchAlerts])

  useSSE('stats_update', (data) => {
    setStats(data as DashboardStats)
  })

  useSSE('alert_new', () => {
    fetchAlerts()
  })

  const severityColor: Record<string, string> = { critical: 'red', warning: 'orange', info: 'blue' }

  const pieData = stats
    ? Array.from({ length: stats.volumeServers }, (_, i) => ({
        name: `Server ${i + 1}`,
        value: Math.floor(Math.random() * 60) + 10,
      }))
    : []

  return (
    <div>
      <StatCards stats={stats} loading={loading} />

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <DiskUsageChart data={pieData} />
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Cluster Health">
            {stats ? (
              <div>
                <p><Tooltip title="Current elected Raft leader">Master Leader</Tooltip>: <Tag color="green">{stats.masterLeader}</Tag></p>
                <p><Tooltip title="Filer HA group connection status">Filer</Tooltip>: <Tag color={stats.filerStatus === 'connected' ? 'green' : 'red'}>{stats.filerStatus}</Tag></p>
                <p>Version: <Tag>{stats.version}</Tag></p>
                <p><Tooltip title="Free volume slots / Max volume slots. 1 volume ≈ 30GB">Free / Max Slots</Tooltip>: {stats.freeSpace} / {stats.maxSpace}</p>
                <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(168,85,247,0.06)', borderRadius: 8, border: '1px solid rgba(168,85,247,0.12)' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                    <Tooltip title="Max volume slots × volume size (30GB/vol). Current provisioned capacity.">
                      Storage Capacity <QuestionCircleOutlined style={{ fontSize: 11 }} />
                    </Tooltip>
                  </div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Provisioned</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0' }}>{stats.totalDiskGB} GB</div>
                      <div style={{ fontSize: 12, color: '#a855f7' }}>{stats.totalUsableGB} GB usable</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Physical</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0' }}>{stats.physicalRawGB} GB</div>
                      <div style={{ fontSize: 12, color: '#22c55e' }}>{stats.physicalUsableGB} GB usable</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p>Loading...</p>
            )}
          </Card>
        </Col>
      </Row>

      {alerts.length > 0 && (
        <Card title={`Alerts (${alerts.length})`} style={{ marginTop: 16 }}>
          {alerts.map((alert) => (
            <Card.Grid key={alert.id} style={{ width: '100%' }}>
              <Tag color={severityColor[alert.severity]}>{alert.severity.toUpperCase()}</Tag>
              <strong> {alert.title}</strong>
              {alert.node && <span style={{ marginLeft: 8 }}>Node: {alert.node}</span>}
              <span style={{ float: 'right', color: '#999' }}>{new Date(alert.createdAt).toLocaleString()}</span>
            </Card.Grid>
          ))}
        </Card>
      )}
    </div>
  )
}
