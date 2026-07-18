import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Tag, Popconfirm, message, Tabs, Drawer, Form, Select, InputNumber, Input, Switch, Space, Empty } from 'antd'
import { ClockCircleOutlined, CloudOutlined, DeleteOutlined, EditOutlined, HistoryOutlined, PlusOutlined } from '@ant-design/icons'
import { getLifecyclePolicies, saveLifecyclePolicy, deleteLifecyclePolicy, getCollectionsTtl, setCollectionTtl, getLifecycleTransitions, getLifecycleTemplates, getS3Buckets } from '../../services/api'
import type { LifecyclePolicy, CollectionTtl, LifecycleTransition } from '../../types'

const TTL_PRESETS = [
  { label: '1 hour', value: '1h' }, { label: '6 hours', value: '6h' },
  { label: '24 hours', value: '24h' }, { label: '3 days', value: '3d' },
  { label: '7 days', value: '7d' }, { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
]

export default function LifecyclePage() {
  const [policies, setPolicies] = useState<LifecyclePolicy[]>([])
  const [collections, setCollections] = useState<CollectionTtl[]>([])
  const [transitions, setTransitions] = useState<LifecycleTransition[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<LifecyclePolicy | null>(null)
  const [buckets, setBuckets] = useState<string[]>([])
  const [templates, setTemplates] = useState<Record<string, { rules: Record<string, unknown>[] }>>({})
  const [form] = Form.useForm()

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const [pols, colls, trans, bcks, tpls] = await Promise.all([
        getLifecyclePolicies(), getCollectionsTtl(), getLifecycleTransitions(), getS3Buckets(), getLifecycleTemplates(),
      ])
      setPolicies(pols)
      setCollections(colls)
      setTransitions(trans)
      setBuckets(bcks.map(b => b.name))
      setTemplates(tpls.templates || {})
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const openCreate = (template?: string) => {
    setEditing(null)
    form.resetFields()
    if (template && templates[template]) {
      form.setFieldsValue({ template })
    }
    setDrawerOpen(true)
  }

  const handleSave = async () => {
    const vals = await form.validateFields()
    try {
      const policy = vals.template && templates[vals.template]
        ? templates[vals.template]
        : {
            rules: [{
              id: `rule-${Date.now()}`, status: vals.enabled !== false ? 'Enabled' : 'Disabled',
              filter: { prefix: vals.prefix || '' },
              expiration: vals.expireDays ? { days: vals.expireDays } : vals.transitionDays ? { days: vals.transitionDays } : undefined,
              transitions: vals.transitionDays ? [{ days: vals.transitionDays, storageClass: vals.storageClass || 'GLACIER' }] : undefined,
            }],
          }
      await saveLifecyclePolicy(vals.bucket, policy, vals.enabled !== false)
      message.success('Policy saved')
      setDrawerOpen(false)
      fetch()
    } catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
  }

  const policyColumns = [
    { title: 'Bucket', dataIndex: 'bucket', key: 'bucket', render: (b: string) => <Space><CloudOutlined /><strong>{b}</strong></Space> },
    { title: 'Enabled', dataIndex: 'enabled', key: 'enabled', render: (e: boolean) => <Tag color={e ? 'green' : 'red'}>{e ? 'ON' : 'OFF'}</Tag> },
    { title: 'Last Run', dataIndex: 'last_run_at', key: 'last_run', render: (d: string | null) => d ? new Date(d).toLocaleString() : '—' },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: LifecyclePolicy) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue({ bucket: r.bucket, enabled: r.enabled }); setDrawerOpen(true) }} />
          <Popconfirm title="Delete policy?" onConfirm={async () => { await deleteLifecyclePolicy(r.bucket); fetch() }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const collectionColumns = [
    { title: 'Collection', dataIndex: 'name', key: 'name' },
    {
      title: 'TTL', dataIndex: 'ttl', key: 'ttl',
      render: (t: string) => t ? <Tag color="purple">{t}</Tag> : <Tag color="default">None</Tag>,
    },
    { title: 'Seconds', dataIndex: 'ttl_seconds', key: 'ttl_seconds' },
    {
      title: 'Action', key: 'action',
      render: (_: unknown, r: CollectionTtl) => {
        let selTtl = ''
        return (
          <Space>
            <Select
              size="small" style={{ width: 120 }} placeholder="Set TTL"
              value={selTtl} onChange={async (v) => { await setCollectionTtl(r.name, v); message.success(`TTL set to ${v}`); fetch() }}
              options={TTL_PRESETS.concat({ label: 'Remove', value: '' } as any)}
            />
          </Space>
        )
      },
    },
  ]

  return (
    <div>
      <Tabs defaultActiveKey="policies" items={[
        {
          key: 'policies', label: <span><ClockCircleOutlined /> S3 Lifecycle</span>,
          children: (
            <Card
              title="Bucket Lifecycle Policies"
              extra={
                <Space>
                  <Select size="small" style={{ width: 160 }} placeholder="Quick template" onChange={v => openCreate(v)} options={Object.keys(templates).map(t => ({ value: t, label: t.replace(/_/g, ' ') }))} />
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openCreate()}>New Policy</Button>
                </Space>
              }
            >
              <Table dataSource={policies.map(p => ({ ...p, key: p.id }))} columns={policyColumns} loading={loading} pagination={false} size="middle"
                locale={{ emptyText: <Empty description="No lifecycle policies" /> }} />
            </Card>
          ),
        },
        {
          key: 'collections', label: <span><CloudOutlined /> Collection TTL</span>,
          children: (
            <Card title="Collection TTL Settings">
              <Table dataSource={collections.map((c, i) => ({ ...c, key: i }))} columns={collectionColumns} loading={loading} pagination={false} size="middle"
                locale={{ emptyText: <Empty description="No collections" /> }} />
            </Card>
          ),
        },
        {
          key: 'transitions', label: <span><HistoryOutlined /> Transitions</span>,
          children: (
            <Card title="Recent Lifecycle Transitions">
              <Table
                dataSource={transitions.map(t => ({ ...t, key: t.id }))}
                columns={[
                  { title: 'Bucket', dataIndex: 'bucket', key: 'bucket' },
                  { title: 'Object', dataIndex: 'object_key', key: 'object', ellipsis: true },
                  { title: 'Action', dataIndex: 'action', key: 'action', render: (a: string) => <Tag>{a}</Tag> },
                  { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'completed' ? 'green' : 'orange'}>{s}</Tag> },
                  { title: 'Date', dataIndex: 'created_at', key: 'date', render: (d: string) => d ? new Date(d).toLocaleString() : '—' },
                ]}
                loading={loading} pagination={{ pageSize: 15 }} size="small"
                locale={{ emptyText: <Empty description="No transitions yet" /> }}
              />
            </Card>
          ),
        },
      ]} />

      <Drawer title={editing ? 'Edit Policy' : 'New Lifecycle Policy'} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={420}
        extra={<Button type="primary" onClick={handleSave}>Save</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="bucket" label="Bucket" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select bucket" options={buckets.map(b => ({ value: b, label: b }))} />
          </Form.Item>
          <Form.Item name="template" label="Template (optional)">
            <Select placeholder="Start from template" allowClear options={Object.keys(templates).map(t => ({ value: t, label: t.replace(/_/g, ' ') }))} />
          </Form.Item>
          <Form.Item name="prefix" label="Prefix filter" tooltip="Only objects matching this prefix">
            <Input placeholder="e.g. logs/" />
          </Form.Item>
          <Form.Item name="expireDays" label="Expire after (days)" tooltip="Delete objects after N days">
            <InputNumber min={1} max={3650} style={{ width: '100%' }} placeholder="30" />
          </Form.Item>
          <Form.Item name="transitionDays" label="Transition after (days)" tooltip="Move to cold storage after N days">
            <InputNumber min={1} max={3650} style={{ width: '100%' }} placeholder="90" />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
