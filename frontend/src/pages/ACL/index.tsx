import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Tag, Popconfirm, message, Tabs, Drawer, Form, Input, Select, Space, Empty, Modal, Descriptions } from 'antd'
import { SafetyOutlined, AuditOutlined, PlusOutlined, DeleteOutlined, EditOutlined, ExperimentOutlined } from '@ant-design/icons'
import { getAclPolicies, createAclPolicy, updateAclPolicy, deleteAclPolicy, testAclPermission, getAclAuditLog } from '../../services/api'
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
  const [form] = Form.useForm()
  const [testForm] = Form.useForm()

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const [pols, log] = await Promise.all([getAclPolicies(), getAclAuditLog()])
      setPolicies(pols)
      setAuditLog(log)
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
                  <Button icon={<ExperimentOutlined />} onClick={() => testForm.resetFields()}>Test</Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Rule</Button>
                </Space>
              }
            >
              <Card size="small" style={{ marginBottom: 12 }}>
                <Form form={testForm} layout="inline">
                  <Form.Item name="user" rules={[{ required: true }]}><Input placeholder="username" style={{ width: 140 }} /></Form.Item>
                  <Form.Item name="path" initialValue="/"><Input placeholder="/path" style={{ width: 180 }} /></Form.Item>
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
    </div>
  )
}
