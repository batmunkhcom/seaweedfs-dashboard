import { Card, Statistic, Row, Col, Tooltip } from 'antd'
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
        <Tooltip title={`Total ${stats?.totalDiskGB || 0} GB · Usable ${stats?.totalUsableGB || 0} GB (replication 001)`}>
          <Card>
            <Statistic
              title="Disk Capacity"
              value={stats?.totalDiskGB ? `${stats.totalDiskGB} / ${stats.totalUsableGB}` : '—'}
              suffix="GB usable"
              prefix={<PieChartOutlined />}
              loading={loading}
            />
          </Card>
        </Tooltip>
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
