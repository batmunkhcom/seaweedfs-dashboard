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
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                    <Tooltip title="Max volumes × 30GB volume size. 7 nodes × 1.8TB ≈ 12.6TB raw">
                      Disk Capacity <QuestionCircleOutlined style={{ fontSize: 11 }} />
                    </Tooltip>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>
                    {stats.totalDiskGB} <span style={{ fontSize: 14, fontWeight: 400, color: '#64748b' }}>GB raw</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#a855f7', marginTop: 4 }}>
                    {stats.totalUsableGB} GB usable
                    <Tooltip title="After replication 001 (2 copies). Usable = Raw / 2">
                      <QuestionCircleOutlined style={{ marginLeft: 4, fontSize: 11, color: '#64748b' }} />
                    </Tooltip>
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
