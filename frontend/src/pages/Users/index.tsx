import { useState, useEffect } from 'react'
import { Table, Button, Modal, Input, Select, Switch, Popconfirm, message, Space } from 'antd'
import { UserAddOutlined } from '@ant-design/icons'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [roles, setRoles] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'viewer' })
  const role = useAuthStore((s) => s.user?.role)

  const fetchUsers = () => {
    setLoading(true)
    api.get('/users').then((r) => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false))
  }

  const fetchRoles = () => {
    api.get('/users/roles').then((r) => setRoles(r.data)).catch(() => {})
  }

  useEffect(() => { fetchUsers(); fetchRoles() }, [])

  const doCreate = async () => {
    try {
      await api.post('/users', newUser)
      message.success('User created')
      setCreateOpen(false)
      setNewUser({ username: '', password: '', role: 'viewer' })
      fetchUsers()
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Failed')
    }
  }

  const doToggle = async (id: number, enabled: boolean) => {
    await api.put(`/users/${id}`, { enabled })
    fetchUsers()
  }

  const doChangeRole = async (id: number, newRole: string) => {
    await api.put(`/users/${id}`, { role: newRole })
    fetchUsers()
  }

  const doDelete = async (id: number) => {
    await api.delete(`/users/${id}`)
    message.success('User deleted')
    fetchUsers()
  }

  const roleOptions = Object.entries(roles).map(([k, v]: [string, any]) => ({
    value: k, label: `${k} — ${v.description}`,
  }))

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username' },
    {
      title: 'Role', dataIndex: 'role', key: 'role',
      render: (r: string, record: any) => role === 'admin' ? (
        <Select value={r} size="small" style={{ width: 140 }} options={roleOptions} onChange={(v) => doChangeRole(record.id, v)} />
      ) : r,
    },
    {
      title: 'Enabled', dataIndex: 'enabled', key: 'enabled',
      render: (v: boolean, record: any) => role === 'admin' ? (
        <Switch checked={!!v} onChange={(checked) => doToggle(record.id, checked)} />
      ) : v ? 'Yes' : 'No',
    },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at' },
    ...(role === 'admin' ? [{
      title: '', key: 'actions',
      render: (_: any, r: any) => r.username !== 'admin' ? (
        <Popconfirm title="Delete this user?" onConfirm={() => doDelete(r.id)}>
          <Button size="small" danger>Delete</Button>
        </Popconfirm>
      ) : null,
    }] : []),
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <h2>User Management</h2>
        {role === 'admin' && (
          <Button icon={<UserAddOutlined />} onClick={() => setCreateOpen(true)}>Add User</Button>
        )}
      </Space>
      <Table dataSource={users} columns={columns} rowKey="id" loading={loading} size="small" />

      <Modal open={createOpen} title="Create User" onOk={doCreate} onCancel={() => setCreateOpen(false)}>
        <Input placeholder="Username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} style={{ marginBottom: 12 }} />
        <Input.Password placeholder="Password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} style={{ marginBottom: 12 }} />
        <Select value={newUser.role} onChange={(v) => setNewUser({ ...newUser, role: v })} options={roleOptions} style={{ width: '100%' }} />
      </Modal>
    </div>
  )
}
