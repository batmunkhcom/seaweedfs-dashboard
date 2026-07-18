import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Tag, Popconfirm, message, Drawer, Form, Input, Select, Switch, Empty, Statistic, Row, Col } from 'antd'
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons'
import { getTiers, getTierStats, saveTier, deleteTier } from '../../services/api'
import type { TierConfig, TierStats } from '../../types'

export default function TiersPage() {
  const [tiers, setTiers] = useState<TierConfig[]>([])
  const [stats, setStats] = useState<TierStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form] = Form.useForm()

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const [t, s] = await Promise.all([getTiers(), getTierStats()])
      setTiers(t)
      setStats(s)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleSave = async () => {
    const vals = await form.validateFields()
    try {
      await saveTier(vals)
      message.success('Tier saved')
      setDrawerOpen(false)
      fetch()
    } catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
  }

  const tierColor: Record<string, string> = { hot: 'red', warm: 'orange', cold: 'blue' }
  const tierIcon: Record<string, string> = { hot: 'HOT', warm: 'WARM', cold: 'COLD' }

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'tier_type', key: 'type', render: (t: string) => <Tag color={tierColor[t]}>{tierIcon[t]}</Tag> },
    { title: 'Provider', dataIndex: 'provider', key: 'provider', render: (p: string) => <Tag>{p.toUpperCase()}</Tag> },
    { title: 'Enabled', dataIndex: 'enabled', key: 'enabled', render: (e: boolean) => <Tag color={e ? 'green' : 'red'}>{e ? 'ON' : 'OFF'}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: TierConfig) => (
        <Popconfirm title="Delete tier?" onConfirm={async () => { await deleteTier(r.id); fetch() }}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Tiers" value={tiers.length} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="Est. Monthly Cost" value={`$${stats?.total_estimated_cost || 0}`} precision={2} /></Card>
        </Col>
      </Row>
      <Card
        title="Tiered Storage Config"
        style={{ marginTop: 16 }}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDrawerOpen(true) }}>Add Tier</Button>}
      >
        <Table dataSource={tiers.map(t => ({ ...t, key: t.id }))} columns={columns} loading={loading} pagination={false} size="middle"
          locale={{ emptyText: <Empty description="No tiers configured" /> }} />
      </Card>

      <Drawer title="Add Tier" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={400}
        extra={<Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>Save</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tier Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="tier_type" label="Type" initialValue="hot">
            <Select options={['hot', 'warm', 'cold'].map(t => ({ value: t, label: tierIcon[t] }))} />
          </Form.Item>
          <Form.Item name="provider" label="Provider" initialValue="local">
            <Select options={['local', 's3', 'gcs', 'azure'].map(p => ({ value: p, label: p.toUpperCase() }))} />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
