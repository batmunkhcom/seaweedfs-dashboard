import { Card, Statistic, Row, Col } from 'antd'
import { HddOutlined, FileOutlined, DatabaseOutlined, CheckCircleOutlined, CloudServerOutlined, PieChartOutlined } from '@ant-design/icons'
import type { DashboardStats } from '../types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

interface Props {
  stats: DashboardStats | null
  loading: boolean
}

export default function StatCards({ stats, loading }: Props) {
  const freePct = stats ? Math.round((stats.freeSpace / Math.max(stats.maxSpace, 1)) * 100) : 0

  return (
    <Row gutter={[16, 16]}>
      <Col xs={12} sm={8} lg={4}>
        <Card>
          <Statistic title="Total Volumes" value={stats?.totalVolumes || 0} prefix={<HddOutlined />} loading={loading} />
        </Card>
      </Col>
      <Col xs={12} sm={8} lg={4}>
        <Card>
          <Statistic title="Total Files" value={stats?.totalFiles || 0} prefix={<FileOutlined />} loading={loading} />
        </Card>
      </Col>
      <Col xs={12} sm={8} lg={4}>
        <Card>
          <Statistic title="Total Size" value={stats ? formatBytes(stats.totalSizeBytes) : '—'} prefix={<DatabaseOutlined />} loading={loading} />
        </Card>
      </Col>
      <Col xs={12} sm={8} lg={4}>
        <Card>
          <Statistic title="Free Space" value={freePct} suffix="%" prefix={<PieChartOutlined />} loading={loading} />
        </Card>
      </Col>
      <Col xs={12} sm={8} lg={4}>
        <Card>
          <Statistic title="Servers" value={stats?.volumeServers || 0} prefix={<CloudServerOutlined />} loading={loading} />
        </Card>
      </Col>
      <Col xs={12} sm={8} lg={4}>
        <Card>
          <Statistic
            title="Healthy"
            value={stats ? `${stats.healthyNodes}/${stats.volumeServers}` : '—'}
            valueStyle={{ color: stats && stats.healthyNodes === stats.volumeServers ? '#3f8600' : '#cf1322' }}
            prefix={<CheckCircleOutlined />}
            loading={loading}
          />
        </Card>
      </Col>
    </Row>
  )
}
