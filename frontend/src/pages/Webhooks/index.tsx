import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Drawer, Form, Input, Select, Tag, Popconfirm, message, Empty, Space, Modal, Descriptions, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SendOutlined, HistoryOutlined, SlackOutlined, MailOutlined, LinkOutlined, PoweroffOutlined, GithubOutlined } from '@ant-design/icons'
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, toggleWebhook, getWebhookHistory, getWebhookDeliveryDetail, getWebhookTemplates } from '../../services/api'
import type { Webhook, WebhookDelivery, WebhookTemplate } from '../../types'

const platformIcons: Record<string, React.ReactNode> = {
  slack: <SlackOutlined style={{ color: '#4A154B' }} />,
  discord: <GithubOutlined style={{ color: '#5865F2' }} />,
  email: <MailOutlined style={{ color: '#3b82f6' }} />,
  generic: <LinkOutlined style={{ color: '#a855f7' }} />,
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [templates, setTemplates] = useState<WebhookTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Webhook | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyWebhook, setHistoryWebhook] = useState<Webhook | null>(null)
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [deliveryDetail, setDeliveryDetail] = useState<WebhookDelivery | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [testing, setTesting] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const [wh, tpl] = await Promise.all([getWebhooks(), getWebhookTemplates()])
      setWebhooks(wh)
      setTemplates(tpl)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ platform: 'generic', events: [], secret: '' })
    setDrawerOpen(true)
  }

  const openEdit = (wh: Webhook) => {
    setEditing(wh)
    form.setFieldsValue({ name: wh.name, platform: wh.platform, url: wh.url, events: wh.events, secret: '' })
    setDrawerOpen(true)
  }

  const handleSave = async () => {
    const vals = await form.validateFields()
    setSubmitting(true)
    try {
      if (editing) {
        await updateWebhook(editing.id, vals)
        message.success('Webhook updated')
      } else {
        await createWebhook(vals)
        message.success('Webhook created')
      }
      setDrawerOpen(false)
      fetch()
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Failed')
    }
    setSubmitting(false)
  }

  const handleDelete = async (id: number) => {
    await deleteWebhook(id)
    message.success('Deleted')
    fetch()
  }

  const handleToggle = async (id: number) => {
    const r = await toggleWebhook(id)
    message.success(r.enabled ? 'Enabled' : 'Disabled')
    fetch()
  }

  const handleTest = async (id: number) => {
    setTesting(true)
    try {
      await testWebhook(id)
      message.success('Test triggered — check delivery log')
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Test failed')
    }
    setTesting(false)
  }

  const openHistory = async (wh: Webhook) => {
    setHistoryWebhook(wh)
    setHistoryOpen(true)
    try {
      const d = await getWebhookHistory(wh.id)
      setDeliveries(d)
    } catch {}
  }

  const openDetail = async (whId: number, dId: number) => {
    try {
      const d = await getWebhookDeliveryDetail(whId, dId)
      setDeliveryDetail(d)
      setDetailOpen(true)
    } catch {}
  }

  const columns = [
    {
      title: 'Name', key: 'name',
      render: (_: unknown, r: Webhook) => (
        <Space>
          {platformIcons[r.platform] || <LinkOutlined />}
          <span>{r.name}</span>
          {r.enabled ? <Tag color="green" style={{ fontSize: 10 }}>ON</Tag> : <Tag color="red" style={{ fontSize: 10 }}>OFF</Tag>}
        </Space>
      ),
    },
    {
      title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true,
      render: (url: string) => <Tooltip title={url}><code style={{ fontSize: 11 }}>{url.length > 50 ? url.slice(0, 50) + '...' : url}</code></Tooltip>,
    },
    {
      title: 'Events', dataIndex: 'events', key: 'events',
      render: (events: string[]) => (
        <Space size={4} wrap>
          {events.length > 0 ? events.map(e => <Tag key={e} style={{ fontSize: 10 }}>{e.replace(/_/g, ' ')}</Tag>) : <Tag color="default">all</Tag>}
        </Space>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 200,
      render: (_: unknown, r: Webhook) => (
        <Space>
          <Tooltip title="Test"><Button size="small" icon={<SendOutlined />} loading={testing} onClick={() => handleTest(r.id)} /></Tooltip>
          <Tooltip title="History"><Button size="small" icon={<HistoryOutlined />} onClick={() => openHistory(r)} /></Tooltip>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Tooltip title={r.enabled ? 'Disable' : 'Enable'}>
            <Button size="small" icon={<PoweroffOutlined />} style={{ color: r.enabled ? '#22c55e' : '#ef4444' }} onClick={() => handleToggle(r.id)} />
          </Tooltip>
          <Popconfirm title="Delete this webhook?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const historyColumns = [
    { title: 'Event', dataIndex: 'event', key: 'event', render: (e: string) => <Tag>{e}</Tag> },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (s: string) => s === 'success' ? <Tag color="green">OK</Tag> : s === 'pending' ? <Tag color="orange">Pending</Tag> : <Tag color="red">Failed</Tag>,
    },
    { title: 'Code', dataIndex: 'response_code', key: 'code', render: (c: number | null) => c ?? '—' },
    { title: 'Duration', dataIndex: 'duration_ms', key: 'dur', render: (d: number | null) => d != null ? `${d}ms` : '—' },
    { title: 'Time', dataIndex: 'created_at', key: 'time', render: (t: string) => t ? new Date(t).toLocaleString() : '—' },
    {
      title: '', key: 'view', width: 60,
      render: (_: unknown, r: WebhookDelivery) => (
        <Button size="small" onClick={() => historyWebhook && openDetail(historyWebhook.id, r.id)}>Detail</Button>
      ),
    },
  ]

  return (
    <div>
      <Card
        title="Webhooks"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Webhook</Button>}
      >
        <Table
          dataSource={webhooks.map(w => ({ ...w, key: w.id }))}
          columns={columns}
          loading={loading}
          pagination={false}
          size="middle"
          locale={{ emptyText: <Empty description="No webhooks configured. Add one to receive alerts." /> }}
        />
      </Card>

      <Drawer
        title={editing ? 'Edit Webhook' : 'New Webhook'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={submitting} onClick={handleSave}>Save</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Slack alerts" />
          </Form.Item>
          <Form.Item name="platform" label="Platform" rules={[{ required: true }]}>
            <Select options={templates?.platforms.map(p => ({ value: p.value, label: <Space>{platformIcons[p.value]}{p.label}</Space> })) ?? []} />
          </Form.Item>
          <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url', message: 'Valid URL required' }]}>
            <Input placeholder="https://hooks.slack.com/services/..." />
          </Form.Item>
          <Form.Item name="events" label="Events (empty = all)">
            <Select mode="multiple" placeholder="Select events" options={templates?.events ?? []} />
          </Form.Item>
          <Form.Item name="secret" label="Secret (optional, for HMAC-SHA256 signing)" extra="If set, X-Webhook-Signature header will be sent">
            <Input.Password placeholder="Secret key" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={`Deliveries — ${historyWebhook?.name || ''}`}
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        width={800}
        footer={null}
      >
        <Table
          dataSource={deliveries.map(d => ({ ...d, key: d.id }))}
          columns={historyColumns}
          size="small"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="No deliveries yet" /> }}
        />
      </Modal>

      <Modal
        title="Delivery Detail"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={600}
        footer={null}
      >
        {deliveryDetail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Event">{deliveryDetail.event}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={deliveryDetail.status === 'success' ? 'green' : deliveryDetail.status === 'pending' ? 'orange' : 'red'}>
                {deliveryDetail.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Response Code">{deliveryDetail.response_code ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Duration">{deliveryDetail.duration_ms != null ? `${deliveryDetail.duration_ms}ms` : '—'}</Descriptions.Item>
            {deliveryDetail.error && <Descriptions.Item label="Error">{deliveryDetail.error}</Descriptions.Item>}
            <Descriptions.Item label="Request Body">
              <pre style={{ fontSize: 11, maxHeight: 200, overflow: 'auto', background: '#1e293b', padding: 8, borderRadius: 4 }}>
                {deliveryDetail.request_body ? JSON.stringify(JSON.parse(deliveryDetail.request_body), null, 2) : '—'}
              </pre>
            </Descriptions.Item>
            {deliveryDetail.response_body && (
              <Descriptions.Item label="Response Body">
                <pre style={{ fontSize: 11, maxHeight: 200, overflow: 'auto', background: '#1e293b', padding: 8, borderRadius: 4 }}>
                  {deliveryDetail.response_body.length > 1000 ? deliveryDetail.response_body.slice(0, 1000) + '...' : deliveryDetail.response_body}
                </pre>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Created">{deliveryDetail.created_at ? new Date(deliveryDetail.created_at).toLocaleString() : '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}
