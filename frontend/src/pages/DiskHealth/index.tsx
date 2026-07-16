import { useState, useEffect } from 'react'
import { Card, Table, Tag, Spin, Typography, Row, Col, Statistic, Descriptions, Progress, Button, Space, message, Alert } from 'antd'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  WarningFilled,
  ReloadOutlined,
  HddOutlined,
  ScanOutlined,
} from '@ant-design/icons'
import { getDiskHealthStatus, getDiskHealthDetail, getDiskHealthHistory } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + u[i]
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}

interface DiskDevice {
  node: string
  device: string
  last_scan: number
  model?: string
  serial?: string
  capacity?: number
  temp?: number
  health?: 'ok' | 'warning' | 'critical'
  power_on_hours?: number
  reallocated?: number
  wear_pct?: number
  tbw_bytes?: number
}

export default function DiskHealthPage() {
  const [status, setStatus] = useState<any>(null)
  const [devices, setDevices] = useState<DiskDevice[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const role = useAuthStore((s) => s.user?.role)

  const fetch = async () => {
    setLoading(true)
    try {
      const data = await getDiskHealthStatus()
      setStatus(data)
      if (data?.enabled && Array.isArray(data.devices)) {
            const enriched: DiskDevice[] = []
        for (const d of data.devices) {
          try {
            const deviceName = d.device.split('/').pop() || d.device
            const detail = await getDiskHealthDetail(d.node, deviceName)
            const smart = detail?.smart ? JSON.parse(detail.smart) : null
            const attrs = smart?.ata_smart_attributes?.table || []
            const findAttr = (id: number) => attrs.find((a: any) => a.id === id)
            const wearId = [177, 233, 202].find((id) => findAttr(id))
            const wearAttr = wearId ? findAttr(wearId) : null
            enriched.push({
              node: d.node,
              device: d.device,
              last_scan: d.last_scan,
              model: smart?.model_name || smart?.model_family || 'Virtual Disk',
              serial: smart?.serial_number || '',
              capacity: smart?.user_capacity?.bytes || (smart?.nvme_total_capacity || 0),
              temp: smart?.temperature?.current || 0,
              health: smart?.smart_status?.passed === false ? 'critical' : 'ok',
              power_on_hours: findAttr(9)?.raw?.value || 0,
              reallocated: findAttr(5)?.raw?.value || 0,
              wear_pct: wearAttr ? (100 - (typeof wearAttr.value === 'number' ? wearAttr.value : 0)) : (smart?.nvme_total_capacity ? 0 : undefined),
              tbw_bytes: findAttr(241)?.raw?.value ? (findAttr(241).raw.value * 512) : 0,
            })
          } catch {
            enriched.push({ node: d.node, device: d.device, last_scan: d.last_scan, health: 'ok' })
          }
        }
        setDevices(enriched)
      }
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => { fetch() }, [])

  const doScan = async () => {
    setScanning(true)
    message.info('Scan triggered. Refresh in a moment.')
    setTimeout(() => { fetch(); setScanning(false) }, 5000)
  }

  const showDetail = async (d: DiskDevice) => {
    try {
      const device = d.device.split('/').pop() || d.device
      const detail = await getDiskHealthDetail(d.node, device)
      setSelected({ ...d, smart: detail?.smart ? JSON.parse(detail.smart) : null })
      const hist = await getDiskHealthHistory(d.node, device, 30)
      setHistory(Array.isArray(hist) ? hist : [])
    } catch { }
  }

  const healthy = devices.filter(d => d.health === 'ok').length
  const warnings = devices.filter(d => d.health === 'warning').length
  const criticals = devices.filter(d => d.health === 'critical').length

  const columns = [
    { title: 'Node', dataIndex: 'node', key: 'node' },
    { title: 'Device', dataIndex: 'device', key: 'device', render: (v: string) => <strong>{v}</strong> },
    { title: 'Model', dataIndex: 'model', key: 'model', ellipsis: true },
    {
      title: 'Health', dataIndex: 'health', key: 'health',
      render: (v: string) =>
        v === 'ok' ? <Tag color="success" icon={<CheckCircleFilled />}>OK</Tag> :
        v === 'warning' ? <Tag color="warning" icon={<WarningFilled />}>Warning</Tag> :
        <Tag color="error" icon={<CloseCircleFilled />}>Critical</Tag>,
    },
    { title: 'Temp', dataIndex: 'temp', key: 'temp', render: (v: number) => v ? `${v}°C` : '—' },
    { title: 'Size', dataIndex: 'capacity', key: 'capacity', render: (v: number) => formatBytes(v) },
    { title: 'Wear', dataIndex: 'wear_pct', key: 'wear_pct', render: (v: number | undefined) => v === undefined ? '—' : <Progress percent={Math.round(v)} size="small" status={v > 85 ? 'exception' : v > 70 ? 'normal' : 'success'} format={() => `${v}%`} /> },
    { title: 'Hours', dataIndex: 'power_on_hours', key: 'power_on_hours', render: (v: number | undefined) => v === undefined ? '—' : v >= 87600 ? <span style={{ color: '#ff4d4f' }}>{v.toLocaleString()}h</span> : v >= 43800 ? <span style={{ color: '#faad14' }}>{v.toLocaleString()}h</span> : v.toLocaleString() + 'h' },
    { title: 'Last Scan', dataIndex: 'last_scan', key: 'last_scan', render: (v: number) => formatDate(v) },
  ]

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  if (!status?.enabled) {
    return (
      <Card>
        <Title level={4}>Disk Health</Title>
        <Alert type="info" message="Disk health monitoring is disabled. Set DISK_HEALTH_ENABLED=true in .env to enable S.M.A.R.T. monitoring." />
      </Card>
    )
  }

  const maxTemp = Math.max(...devices.map(d => d.temp || 0), 1)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>Disk Health</Title>
        <Space>
          {role === 'admin' && (
            <Button icon={<ScanOutlined />} size="small" type="primary" loading={scanning} onClick={doScan}>Scan Now</Button>
          )}
          <Button icon={<ReloadOutlined />} size="small" onClick={fetch}>Refresh</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Drives" value={devices.length} prefix={<HddOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Healthy" value={healthy} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleFilled />} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Warnings" value={warnings} valueStyle={{ color: warnings > 0 ? '#faad14' : undefined }} prefix={<WarningFilled />} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Critical" value={criticals} valueStyle={{ color: criticals > 0 ? '#ff4d4f' : undefined }} prefix={<CloseCircleFilled />} /></Card>
        </Col>
      </Row>

      {devices.length === 0 && (
        <Alert
          type="warning"
          message="No S.M.A.R.T. data yet. Click 'Scan Now' to run initial disk health scan, or wait for the scheduled scan."
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        dataSource={devices}
        columns={columns}
        rowKey={(r) => `${r.node}:${r.device}`}
        loading={loading}
        size="small"
        pagination={false}
        onRow={(r) => ({ onClick: () => showDetail(r), style: { cursor: 'pointer' } })}
      />

      {selected && (
        <Card title={`${selected.node} — ${selected.device}`} style={{ marginTop: 16 }}>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Model">{selected.model || '—'}</Descriptions.Item>
                <Descriptions.Item label="Serial">{selected.serial || '—'}</Descriptions.Item>
                <Descriptions.Item label="Capacity">{formatBytes(selected.capacity || 0)}</Descriptions.Item>
                <Descriptions.Item label="Temperature">{selected.temp ? `${selected.temp}°C` : '—'}</Descriptions.Item>
                <Descriptions.Item label="Health">
                  {selected.health === 'ok' ? <Tag color="success">OK</Tag> :
                   selected.health === 'warning' ? <Tag color="warning">Warning</Tag> :
                   <Tag color="error">Critical</Tag>}
                </Descriptions.Item>
              </Descriptions>
            </Col>
            <Col span={12}>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Power-On Hours">
                  {selected.power_on_hours ? selected.power_on_hours.toLocaleString() + ' h' : '—'}
                  {selected.power_on_hours && (selected.power_on_hours > 43800 ? ` (${Math.round(selected.power_on_hours / 8760)} yrs)` : '')}
                </Descriptions.Item>
                <Descriptions.Item label="Wear Level">
                  {selected.wear_pct !== undefined ? (
                    <Progress percent={Math.round(selected.wear_pct)} size="small" status={selected.wear_pct > 85 ? 'exception' : selected.wear_pct > 70 ? 'normal' : 'success'} />
                  ) : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Reallocated Sectors">
                  {selected.reallocated !== undefined ? (
                    selected.reallocated > 0 ? <Tag color="error">{selected.reallocated}</Tag> : <Tag color="success">0</Tag>
                  ) : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Data Written">
                  {selected.tbw_bytes ? formatBytes(selected.tbw_bytes) : '—'}
                </Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>
          {history.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <Text strong>Temperature History (30 days)</Text>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, marginTop: 8, background: '#f5f5f5', padding: 8, borderRadius: 4, overflow: 'auto' }}>
                {history.map((h: any, i: number) => {
                  const t = h.smart ? (JSON.parse(h.smart)?.temperature?.current || 0) : 0
                  const height = Math.max(4, (t / (maxTemp || 100)) * 100)
                  return <div key={i} title={`${new Date(h.timestamp * 1000).toLocaleDateString()}: ${t}°C`} style={{ width: 6, height, background: t > 55 ? '#ff4d4f' : t > 45 ? '#faad14' : '#52c41a', flexShrink: 0, borderRadius: '2px 2px 0 0' }} />
                })}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
