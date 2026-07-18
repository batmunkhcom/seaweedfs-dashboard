import { useState, useEffect } from 'react'
import { Table, Button, Modal, Input, Select, Switch, Popconfirm, message, Space, Tag, Tooltip } from 'antd'
import { UserAddOutlined, CopyOutlined } from '@ant-design/icons'
import { listUsers, createUser, updateUser, deleteUser, getAclPolicies } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const PERM_LABELS: Record<string, string> = { R: 'Read', W: 'Write', D: 'Delete', L: 'List', A: 'Admin' }

export default function UsersPage() {
  const roleColor: Record<string, string> = { admin: 'pink', operator: 'purple', viewer: 'blue', user: 'cyan' }
  const [users, setUsers] = useState<any[]>([])
  const [roles, setRoles] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editUser, setEditUser] = useState<any>({})
  const [newUser, setNewUser] = useState({
    username: '', password: '', firstname: '', lastname: '', email: '', phone: '',
    role: '', create_bucket: false, s3_permission: 'readwrite',
  })
  const [aclPolicies, setAclPolicies] = useState<any[]>([])
  const role = useAuthStore((s) => s.user?.role)

  const fetchUsers = () => {
    setLoading(true)
    listUsers().then(setUsers).catch(() => {}).finally(() => setLoading(false))
  }

  const fetchRoles = () => {
    import('../../services/api').then(({ default: api }) => {
      api.get('/users/roles').then((r: any) => setRoles(r.data)).catch(() => {})
    })
  }

  useEffect(() => { fetchUsers(); fetchRoles(); getAclPolicies().then(setAclPolicies).catch(() => {}) }, [])

  const doCreate = async () => {
    if (!newUser.username.trim() || !newUser.firstname.trim() || !newUser.lastname.trim() || !newUser.email.trim() || !newUser.password) {
      message.error('Username, First Name, Last Name, Email, Password are required')
      return
    }
    try {
      const result = await createUser(newUser)
      message.success('User created')
      if (result.s3_access_key) {
        Modal.info({
          title: 'S3 Credentials',
          content: `Access Key: ${result.s3_access_key}\nSecret Key: ${result.s3_secret_key}`,
          width: 500,
        })
      }
      setCreateOpen(false)
      setNewUser({ username: '', password: '', firstname: '', lastname: '', email: '', phone: '', role: 'viewer', create_bucket: false, s3_permission: 'readwrite' })
      fetchUsers()
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Failed')
    }
  }

  const doToggle = async (id: number, enabled: boolean) => {
    await updateUser(id, { enabled })
    fetchUsers()
  }

  const doChangeRole = async (id: number, newRole: string) => {
    await updateUser(id, { role: newRole })
    fetchUsers()
  }

  const doEdit = (user: any) => {
    setEditUser({ ...user })
    setEditOpen(true)
  }

  const doSaveEdit = async () => {
    await updateUser(editUser.id, {
      firstname: editUser.firstname,
      lastname: editUser.lastname,
      email: editUser.email,
      phone: editUser.phone,
    })
    message.success('Updated')
    setEditOpen(false)
    fetchUsers()
  }

  const doDelete = async (id: number) => {
    await deleteUser(id)
    message.success('User deleted')
    fetchUsers()
  }

  const showDetail = (user: any) => { setSelectedUser(user); setDetailOpen(true) }
  const copyText = (text: string) => { navigator.clipboard.writeText(text); message.success('Copied') }

  const roleOptions = Object.entries(roles).map(([k, v]: [string, any]) => ({
    value: k, label: `${k} — ${v.description}`,
  }))

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string, r: any) => <a onClick={() => showDetail(r)}>{v}</a> },
    { title: 'Full Name', key: 'name', render: (_: any, r: any) => `${r.firstname || ''} ${r.lastname || ''}` },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role', dataIndex: 'role', key: 'role',
      render: (r: string, record: any) => role === 'admin' ? (
        <Select value={r} size="small" style={{ width: 130 }} options={roleOptions} onChange={(v) => doChangeRole(record.id, v)} />
      ) : <Tag color={roleColor[r] || 'blue'}>{r}</Tag>,
    },
    {
      title: 'Enabled', dataIndex: 'enabled', key: 'enabled',
      render: (v: boolean, record: any) => role === 'admin' ? (
        <Switch checked={!!v} onChange={(checked) => doToggle(record.id, checked)} />
      ) : v ? 'Yes' : 'No',
    },
    {
      title: 'ACL Perms', key: 'acl',
      render: (_: any, r: any) => {
        const matched = aclPolicies.filter(p =>
          p.enabled && (p.user_pattern === '*' || p.user_pattern === r.username)
        )
        if (!matched.length) return <Tag>none</Tag>
        const allPerms = [...new Set(matched.flatMap((p: any) => (p.permissions || '').split('')))]
        return (
          <Space size={2}>
            {allPerms.map((c: string) => (
              <Tag key={c} color="blue">{PERM_LABELS[c] || c}</Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: 'S3', dataIndex: 's3_access_key', key: 's3',
      render: (v: string) => v ? <Tag color="green">Active</Tag> : <Tag>None</Tag>,
    },
    ...(role === 'admin' ? [{
      title: '', key: 'actions', width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" onClick={() => doEdit(r)}>Edit</Button>
          {r.username !== 'admin' && (
            <Popconfirm title="Delete this user?" onConfirm={() => doDelete(r.id)}>
              <Button size="small" danger>Del</Button>
            </Popconfirm>
          )}
        </Space>
      ),
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

      <Modal open={createOpen} title="Create User" onOk={doCreate} onCancel={() => setCreateOpen(false)} width={480}>
        <Input placeholder="Username *" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} style={{ marginBottom: 10 }} />
        <Input placeholder="First Name *" value={newUser.firstname} onChange={(e) => setNewUser({ ...newUser, firstname: e.target.value })} style={{ marginBottom: 10 }} />
        <Input placeholder="Last Name *" value={newUser.lastname} onChange={(e) => setNewUser({ ...newUser, lastname: e.target.value })} style={{ marginBottom: 10 }} />
        <Input placeholder="Email *" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} style={{ marginBottom: 10 }} />
        <Input placeholder="Phone (optional)" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} style={{ marginBottom: 10 }} />
        <Input.Password placeholder="Password *" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} style={{ marginBottom: 10 }} />
        <Select value={newUser.role} onChange={(v) => setNewUser({ ...newUser, role: v })} options={roleOptions} style={{ width: '100%', marginBottom: 10 }} />
        <Select
          value={newUser.s3_permission}
          onChange={(v) => setNewUser({ ...newUser, s3_permission: v })}
          style={{ width: '100%', marginBottom: 10 }}
          options={[
            { value: 'readwrite', label: 'S3: Read + Write (full access)' },
            { value: 'readonly', label: 'S3: Read Only (list + download)' },
          ]}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="create_bucket" checked={newUser.create_bucket} onChange={(e) => setNewUser({ ...newUser, create_bucket: e.target.checked })} />
          <label htmlFor="create_bucket">Create S3 bucket (user-{newUser.username || 'username'})</label>
        </div>
      </Modal>

      <Modal open={editOpen} title="Edit User" onOk={doSaveEdit} onCancel={() => setEditOpen(false)}>
        <Input placeholder="First Name" value={editUser.firstname} onChange={(e) => setEditUser({ ...editUser, firstname: e.target.value })} style={{ marginBottom: 10 }} />
        <Input placeholder="Last Name" value={editUser.lastname} onChange={(e) => setEditUser({ ...editUser, lastname: e.target.value })} style={{ marginBottom: 10 }} />
        <Input placeholder="Email" value={editUser.email} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} style={{ marginBottom: 10 }} />
        <Input placeholder="Phone" value={editUser.phone} onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })} style={{ marginBottom: 10 }} />
      </Modal>

      <Modal open={detailOpen} title={selectedUser?.username} footer={null} onCancel={() => setDetailOpen(false)} width={480}>
        {selectedUser && (
          <div>
            <p><strong>Full Name:</strong> {selectedUser.firstname} {selectedUser.lastname}</p>
            <p><strong>Email:</strong> {selectedUser.email}</p>
            <p><strong>Phone:</strong> {selectedUser.phone || '—'}</p>
            <p><strong>Role:</strong> {selectedUser.role}</p>
            <p><strong>Enabled:</strong> {selectedUser.enabled ? 'Yes' : 'No'}</p>
            {selectedUser.s3_access_key && (
              <>
                <hr />
                <p><strong>S3 Access Key:</strong> {selectedUser.s3_access_key} <Tooltip title="Copy"><CopyOutlined onClick={() => copyText(selectedUser.s3_access_key)} style={{ cursor: 'pointer' }} /></Tooltip></p>
                <p><strong>Bucket:</strong> user-{selectedUser.username} <Button size="small" onClick={async () => { try { await import('../../services/api').then(m => m.createMyBucket()); message.success('Bucket created') } catch { message.error('Failed') } }}>Create Bucket</Button></p>
              </>
            )}
            <p><strong>Created:</strong> {selectedUser.created_at}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
