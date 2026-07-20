import { Card, Table, Tag, Button, InputNumber, Typography, Space } from 'antd'
import { HddOutlined, SaveOutlined } from '@ant-design/icons'

interface Props {
  nodeDetails: any[]
  nodeLimits: Record<string, number>
  limitsLoading: boolean
  limitsSaving: boolean
  onLimitChange: (node: string, val: number | null) => void
  onSave: () => void
}

export default function NodeLimitsPanel({ nodeDetails, nodeLimits, limitsLoading, limitsSaving, onLimitChange, onSave }: Props) {
  const allNodesNativeMax = Math.max(...nodeDetails.map((n) => n.max_native || n.Max || 9999), 9999)

  const handleApplyAll = (v: number | null) => {
    if (v !== null) {
      for (const nd of nodeDetails) {
        const nodeKey = nd.url || nd.Url
        onLimitChange(nodeKey, v)
      }
    }
  }

  const columns = [
    {
      title: 'Node', dataIndex: 'node', key: 'node', width: 200,
      render: (text: string) => (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#e2e8f0' }}>{text}</span>
      ),
    },
    {
      title: 'Usage', key: 'usage', width: 140,
      render: (_: any, record: any) => {
        const limit = nodeLimits[record.key] || record.native_max
        const pct = limit > 0 ? Math.round((record.used / limit) * 100) : 0
        return (
          <Space size={4}>
            <Typography.Text style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
              {record.used}/{limit}
            </Typography.Text>
            <Tag color={pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green'} style={{ fontSize: 10 }}>{pct}%</Tag>
          </Space>
        )
      },
    },
    {
      title: 'Native Max', dataIndex: 'native_max', key: 'native_max', width: 110,
      render: (val: number) => <Tag color="blue">{val}</Tag>,
    },
    {
      title: 'Configured Limit', key: 'limit', width: 170,
      render: (_: any, record: any) => (
        <InputNumber
          min={record.used}
          max={record.native_max * 2}
          value={nodeLimits[record.key] || record.native_max}
          onChange={(v) => onLimitChange(record.key, v)}
          style={{ width: 140 }}
          size="small"
          addonAfter="vols"
        />
      ),
    },
    {
      title: 'Free', key: 'free', width: 80,
      render: (_: any, record: any) => {
        const limit = nodeLimits[record.key] || record.native_max
        const free = Math.max(0, limit - record.used)
        return <Tag color={free === 0 ? 'red' : free < 5 ? 'orange' : 'green'}>{free}</Tag>
      },
    },
  ]

  const dataSource = nodeDetails.map((n) => ({
    key: n.url || n.Url,
    node: (n.url || n.Url).replace(':8080', ''),
    used: n.volumes || n.Volumes || 0,
    native_max: n.max_native || n.Max || 9999,
    url: n.url || n.Url,
  }))

  return (
    <Card
      title={<Space><HddOutlined style={{ color: '#f59e0b' }} /><span>Node Volume Limits</span><Tag color="blue">{nodeDetails.length} nodes</Tag></Space>}
      loading={limitsLoading}
      extra={<Button type="primary" size="small" icon={<SaveOutlined />} onClick={onSave} loading={limitsSaving}>Save Limits</Button>}
      style={{ marginTop: 16 }}
    >
      {!limitsLoading && nodeDetails.length > 0 && (
        <>
          <Table columns={columns} dataSource={dataSource} pagination={false} size="small" />
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(59,130,246,0.06)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Typography.Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Quick set — apply to all nodes:</Typography.Text>
            <InputNumber min={1} max={allNodesNativeMax} size="small" style={{ width: 120 }} placeholder={`Max ${allNodesNativeMax}`} onChange={handleApplyAll} addonAfter="vols" />
            <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>Limits applied alongside SeaweedFS native max (whichever is lower)</Typography.Text>
          </div>
        </>
      )}
    </Card>
  )
}
