import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Tag, Popconfirm, message, Drawer, Form, Input, Select, Switch, Empty, Statistic, Row, Col, Space } from 'antd'
import { PlusOutlined, DeleteOutlined, SaveOutlined, ApiOutlined, CloudSyncOutlined } from '@ant-design/icons'
import { getTiers, getTierStats, saveTier, deleteTier, testTierConnection, syncTiers } from '../../services/api'
import type { TierConfig, TierStats } from '../../types'

export default function TiersPage() {
  const [tiers, setTiers] = useState<TierConfig[]>([])
  const [stats, setStats] = useState<TierStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form] = Form.useForm()
  const [provider, setProvider] = useState('local')
  const [syncing, setSyncing] = useState(false)

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
      const config: Record<string, unknown> = {}
      if (provider === 's3') {
        config.endpoint = vals.endpoint
        config.access_key = vals.access_key
        config.secret_key = vals.secret_key
      } else if (provider === 'gcs') {
        config.bucket = vals.bucket
        config.project_id = vals.project_id
      } else if (provider === 'azure') {
        config.container = vals.container
        config.connection_string = vals.connection_string
      }
      await saveTier({ ...vals, config })
      message.success('Tier saved')
      setDrawerOpen(false)
      fetch()
    } catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
  }

  const handleTest = async () => {
    const vals = await form.validateFields()
    try {
      const config: Record<string, unknown> = {}
      if (provider === 's3') { config.endpoint = vals.endpoint; config.access_key = vals.access_key; config.secret_key = vals.secret_key }
      else if (provider === 'gcs') { config.bucket = vals.bucket; config.project_id = vals.project_id }
      else if (provider === 'azure') { config.container = vals.container; config.connection_string = vals.connection_string }
      const r = await testTierConnection(provider, config)
      message[r.ok ? 'success' : 'error'](r.ok ? 'Connection OK' : r.error || 'Test failed')
    } catch (e: any) { message.error(e.response?.data?.detail || 'Test failed') }
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const r = await syncTiers()
      message.success(`Synced ${r.synced}/${r.total} tiers`)
    } catch (e: any) { message.error(e.response?.data?.detail || 'Sync failed') }
    setSyncing(false)
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
        extra={
          <Space>
            <Button icon={<CloudSyncOutlined />} loading={syncing} onClick={handleSyncAll}>Sync to Cluster</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setProvider('local'); setDrawerOpen(true) }}>Add Tier</Button>
          </Space>
        }
      >
        <Table dataSource={tiers.map(t => ({ ...t, key: t.id }))} columns={columns} loading={loading} pagination={false} size="middle"
          locale={{ emptyText: <Empty description="No tiers configured" /> }} />
      </Card>

      <Drawer title="Add Tier" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={420}
        extra={
          <Space>
            <Button icon={<ApiOutlined />} onClick={handleTest}>Test</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>Save</Button>
          </Space>
        }>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tier Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="tier_type" label="Type" initialValue="hot">
            <Select options={['hot', 'warm', 'cold'].map(t => ({ value: t, label: t.toUpperCase() }))} />
          </Form.Item>
          <Form.Item name="provider" label="Provider" initialValue="local">
            <Select options={['local', 's3', 'gcs', 'azure'].map(p => ({ value: p, label: p.toUpperCase() }))} onChange={v => setProvider(v)} />
          </Form.Item>

          {provider === 's3' && (
            <>
              <Form.Item name="endpoint" label="Endpoint" tooltip="S3 endpoint URL"><Input placeholder="http://s3.example.com:8333" /></Form.Item>
              <Form.Item name="access_key" label="Access Key"><Input /></Form.Item>
              <Form.Item name="secret_key" label="Secret Key"><Input.Password /></Form.Item>
            </>
          )}
          {provider === 'gcs' && (
            <>
              <Form.Item name="bucket" label="Bucket" rules={[{ required: true }]}><Input placeholder="my-gcs-bucket" /></Form.Item>
              <Form.Item name="project_id" label="Project ID"><Input /></Form.Item>
            </>
          )}
          {provider === 'azure' && (
            <>
              <Form.Item name="container" label="Container" rules={[{ required: true }]}><Input placeholder="my-container" /></Form.Item>
              <Form.Item name="connection_string" label="Connection String"><Input.Password placeholder="DefaultEndpointsProtocol=..." /></Form.Item>
            </>
          )}

          <Form.Item name="enabled" label="Enabled" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
