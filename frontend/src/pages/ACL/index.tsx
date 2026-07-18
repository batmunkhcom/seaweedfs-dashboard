import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Tag, Popconfirm, message, Tabs, Drawer, Form, Input, Select, Space, Empty, Modal, Descriptions } from 'antd'
import { SafetyOutlined, AuditOutlined, PlusOutlined, DeleteOutlined, EditOutlined, ExperimentOutlined, CloudSyncOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { getAclPolicies, createAclPolicy, updateAclPolicy, deleteAclPolicy, testAclPermission, getAclAuditLog, syncAclToFiler, getAclSyncStatus } from '../../services/api'
import { getFilerList } from '../../services/api'
import type { AclPolicy, AclAuditEntry, AclTestResult } from '../../types'

const PERM_CHIPS: Record<string, { color: string; label: string }> = {
  R: { color: 'blue', label: 'Read' }, W: { color: 'green', label: 'Write' },
  D: { color: 'red', label: 'Delete' }, L: { color: 'orange', label: 'List' }, A: { color: 'purple', label: 'Admin' },
}

export default function AclPage() {
  const [policies, setPolicies] = useState<AclPolicy[]>([])
  const [auditLog, setAuditLog] = useState<AclAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<AclPolicy | null>(null)
  const [testModal, setTestModal] = useState(false)
  const [testResult, setTestResult] = useState<AclTestResult | null>(null)
  const [filerBrowserOpen, setFilerBrowserOpen] = useState(false)
  const [filerPath, setFilerPath] = useState('/')
  const [filerItems, setFilerItems] = useState<any[]>([])
  const [filerLoading, setFilerLoading] = useState(false)
  const [form] = Form.useForm()
  const [testForm] = Form.useForm()
  const [syncStatus, setSyncStatus] = useState<{ status: string; rule_count: number; last_sync_at: string | null }>({ status: 'never_synced', rule_count: 0, last_sync_at: null })

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const [pols, log, sync] = await Promise.all([getAclPolicies(), getAclAuditLog(), getAclSyncStatus()])
      setPolicies(pols)
      setAuditLog(log)
      setSyncStatus(sync)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const openCreate = () => { setEditing(null); form.resetFields(); setDrawerOpen(true) }
  const openEdit = (p: AclPolicy) => { setEditing(p); form.setFieldsValue(p); setDrawerOpen(true) }

  const handleSave = async () => {
    const vals = await form.validateFields()
    try {
      if (editing) { await updateAclPolicy(editing.id, vals); message.success('Updated') }
      else { await createAclPolicy(vals); message.success('Created') }
      setDrawerOpen(false); fetch()
    } catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
  }

  const handleTest = async () => {
    const vals = await testForm.validateFields()
    try {
      const r = await testAclPermission(vals.user, vals.path, vals.action)
      setTestResult(r); setTestModal(true)
    } catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
  }

  const openFilerBrowser = async (path: string = '/') => {
    setFilerBrowserOpen(true)
    setFilerPath(path)
    setFilerLoading(true)
    try {
      const items = await getFilerList(path)
      setFilerItems(Array.isArray(items) ? items : [])
    } catch { setFilerItems([]) }
    setFilerLoading(false)
  }

  const selectFilerPath = (item: any) => {
    const fullPath = filerPath === '/' ? `/${item.name}` : `${filerPath}/${item.name}`
    if (item.type === 'directory') {
      openFilerBrowser(fullPath)
    } else {
      testForm.setFieldsValue({ path: fullPath })
      setFilerBrowserOpen(false)
    }
  }

  const policyColumns = [
    { title: '#', dataIndex: 'priority', key: 'priority', width: 50 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Path', dataIndex: 'path', key: 'path', render: (p: string) => <code>{p}</code> },
    { title: 'User', dataIndex: 'user_pattern', key: 'user', render: (u: string) => u === '*' ? <Tag>Everyone</Tag> : <Tag color="cyan">{u}</Tag> },
    {
      title: 'Permissions', dataIndex: 'permissions', key: 'perms',
      render: (p: string) => <Space size={2}>{p.split('').map(c => <Tag key={c} color={PERM_CHIPS[c]?.color}>{PERM_CHIPS[c]?.label || c}</Tag>)}</Space>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: AclPolicy) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete?" onConfirm={async () => { await deleteAclPolicy(r.id); fetch() }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Tabs defaultActiveKey="policies" items={[
        {
          key: 'policies', label: <span><SafetyOutlined /> Policies</span>,
          children: (
            <Card
              title="ACL Policies"
              extra={
                <Space>
                  <Tag color={syncStatus.status === 'synced' ? 'green' : syncStatus.status === 'partial' ? 'orange' : 'red'}>
                    {syncStatus.status === 'never_synced' ? 'Not Synced' : syncStatus.status}
                  </Tag>
                  <Button icon={<CloudSyncOutlined />} onClick={async () => {
                    const r = await syncAclToFiler()
                    message[r.ok ? 'success' : 'error'](r.ok ? 'Synced to all filers' : 'Sync failed on some filers')
                    const s = await getAclSyncStatus()
                    setSyncStatus(s)
                  }}>Sync to Filer</Button>
                  <Button icon={<ExperimentOutlined />} onClick={() => testForm.resetFields()}>Test</Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Rule</Button>
                </Space>
              }
            >
              <Card size="small" style={{ marginBottom: 12 }}>
                <Form form={testForm} layout="inline">
                  <Form.Item name="user" rules={[{ required: true }]}><Input placeholder="username" style={{ width: 140 }} /></Form.Item>
                  <Form.Item name="path" initialValue="/">
                    <Input placeholder="/path" style={{ width: 180 }} addonAfter={
                      <Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={() => openFilerBrowser('/')} />
                    } />
                  </Form.Item>
                  <Form.Item name="action" initialValue="R">
                    <Select style={{ width: 100 }} options={Object.entries(PERM_CHIPS).map(([k, v]) => ({ value: k, label: v.label }))} />
                  </Form.Item>
                  <Form.Item><Button onClick={handleTest}>Test</Button></Form.Item>
                </Form>
              </Card>
              <Table dataSource={policies.map(p => ({ ...p, key: p.id }))} columns={policyColumns} loading={loading} pagination={false} size="middle"
                locale={{ emptyText: <Empty description="No ACL policies" /> }} />
            </Card>
          ),
        },
        {
          key: 'audit', label: <span><AuditOutlined /> Audit Log</span>,
          children: (
            <Card title="Permission Audit Log">
              <Table
                dataSource={auditLog.map(e => ({ ...e, key: e.id }))}
                columns={[
                  { title: 'User', dataIndex: 'user_name', key: 'user' },
                  { title: 'Action', dataIndex: 'action', key: 'action', render: (a: string) => <Tag>{a}</Tag> },
                  { title: 'Path', dataIndex: 'path', key: 'path', render: (p: string) => <code>{p}</code> },
                  { title: 'Result', dataIndex: 'result', key: 'result', render: (r: string) => <Tag color={r === 'allowed' ? 'green' : 'red'}>{r}</Tag> },
                  { title: 'Details', dataIndex: 'details', key: 'details', ellipsis: true },
                  { title: 'Time', dataIndex: 'created_at', key: 'time', render: (t: string) => t ? new Date(t).toLocaleString() : '—' },
                ]}
                loading={loading} pagination={{ pageSize: 15 }} size="small"
                locale={{ emptyText: <Empty description="No audit entries" /> }}
              />
            </Card>
          ),
        },
      ]} />

      <Drawer title={editing ? 'Edit Rule' : 'New ACL Rule'} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={420}
        extra={<Button type="primary" onClick={handleSave}>Save</Button>}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Rule Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="path" label="Path" initialValue="/" tooltip="Filer path pattern"><Input placeholder="/buckets/my-bucket" /></Form.Item>
          <Form.Item name="user_pattern" label="User" initialValue="*" tooltip="* for everyone, or specific username"><Input /></Form.Item>
          <Form.Item name="permissions" label="Permissions" initialValue="R" tooltip="R=Read W=Write D=Delete L=List A=Admin">
            <Select mode="multiple" options={Object.entries(PERM_CHIPS).map(([k, v]) => ({ value: k, label: v.label }))} />
          </Form.Item>
          <Form.Item name="priority" label="Priority" initialValue={0}><Input type="number" /></Form.Item>
        </Form>
      </Drawer>

      <Modal title="Permission Test Result" open={testModal} onCancel={() => setTestModal(false)} footer={null}>
        {testResult && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="User">{testResult.user}</Descriptions.Item>
            <Descriptions.Item label="Path"><code>{testResult.path}</code></Descriptions.Item>
            <Descriptions.Item label="Action"><Tag>{testResult.action}</Tag></Descriptions.Item>
            <Descriptions.Item label="Result">
              <Tag color={testResult.allowed ? 'green' : 'red'}>{testResult.allowed ? 'ALLOWED' : 'DENIED'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Matched Rule">{testResult.matched_rule || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal title={`Filer Directory — ${filerPath}`} open={filerBrowserOpen} onCancel={() => setFilerBrowserOpen(false)} footer={null} width={500}>
        <Space style={{ marginBottom: 8 }}>
          {filerPath !== '/' && (
            <Button size="small" onClick={() => openFilerBrowser(filerPath.split('/').slice(0, -1).join('/') || '/')}>..</Button>
          )}
          <Button size="small" type="primary" onClick={() => { testForm.setFieldsValue({ path: filerPath }); setFilerBrowserOpen(false) }}>
            Select this directory
          </Button>
        </Space>
        <Table
          dataSource={filerItems.map((item: any, i: number) => ({ ...item, key: i }))}
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name', render: (n: string, r: any) => (
              <a onClick={() => selectFilerPath(r)} style={{ cursor: 'pointer' }}>
                {r.type === 'directory' ? <FolderOpenOutlined style={{ marginRight: 6 }} /> : null}
                {n}
              </a>
            )},
            { title: 'Type', dataIndex: 'type', key: 'type', width: 80, render: (t: string) => <Tag>{t === 'directory' ? 'dir' : 'file'}</Tag> },
          ]}
          loading={filerLoading}
          size="small"
          pagination={false}
        />
      </Modal>
    </div>
  )
}
