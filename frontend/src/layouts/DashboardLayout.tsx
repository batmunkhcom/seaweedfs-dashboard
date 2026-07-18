import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Dropdown, Typography, Avatar, Input, Modal, message, Tooltip } from 'antd'
import {
  DashboardOutlined,
  ClusterOutlined,
  HddOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  CloudOutlined,
  SafetyOutlined,
  ToolOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  UserOutlined,
  KeyOutlined,
  IdcardOutlined,
  InfoCircleOutlined,
  TeamOutlined,
  ReadOutlined,
  BookOutlined,
  ApiOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
  SendOutlined,
  FileSearchOutlined,
  GatewayOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  CloudServerOutlined,
  LockOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'
import { changeMyPassword } from '../services/api'
import api from '../services/api'

const { Header, Sider, Content } = Layout

interface MenuItem {
  type?: 'group' | 'divider'
  key?: string
  label?: string
  icon?: React.ReactNode
  children?: MenuItem[]
  style?: React.CSSProperties
}

const baseMenuItems: MenuItem[] = [
  { type: 'group', label: 'Monitor', children: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/metrics', icon: <LineChartOutlined />, label: 'Metrics' },
    { key: '/logs', icon: <FileSearchOutlined />, label: 'Logs' },
  ]},
  { type: 'group', label: 'Cluster', children: [
    { key: '/cluster', icon: <ClusterOutlined />, label: 'Cluster' },
    { key: '/disk-health', icon: <MedicineBoxOutlined />, label: 'Disk Health' },
  ]},
  { type: 'group', label: 'Storage', children: [
    { key: '/volumes', icon: <HddOutlined />, label: 'Volumes' },
    { key: '/collections', icon: <FolderOpenOutlined />, label: 'Collections' },
    { key: '/filer', icon: <FolderOutlined />, label: 'Filer' },
  ]},
  { type: 'group', label: 'S3', children: [
    { key: '/s3/buckets', icon: <CloudOutlined />, label: 'Buckets' },
    { key: '/s3/secrets', icon: <KeyOutlined />, label: 'Secrets / API Keys' },
    { key: '/s3/policies', icon: <SafetyCertificateOutlined />, label: 'Policies' },
  ]},
  { type: 'group', label: 'Services', children: [
    { key: '/backup', icon: <SafetyOutlined />, label: 'Backup' },
    { key: '/workers', icon: <ToolOutlined />, label: 'Workers' },
    { key: '/gateways', icon: <GatewayOutlined />, label: 'Gateways' },
    { key: '/webhooks', icon: <SendOutlined />, label: 'Webhooks' },
  ]},
  { type: 'group', label: 'Advanced', children: [
    { key: '/lifecycle', icon: <ClockCircleOutlined />, label: 'Lifecycle' },
    { key: '/acl', icon: <SafetyCertificateOutlined />, label: 'ACL' },
    { key: '/tiers', icon: <CloudServerOutlined />, label: 'Tiers' },
    { key: '/hardening', icon: <LockOutlined />, label: 'Hardening' },
  ]},
  { type: 'group', label: 'System', children: [
    { key: '/users', icon: <TeamOutlined />, label: 'Users' },
    { key: '/chatbot', icon: <RobotOutlined />, label: 'AI Chat' },
    { key: '/feedback', icon: <BulbOutlined />, label: 'Feedback' },
    { key: '/tools', icon: <ThunderboltOutlined />, label: 'Tools' },
    { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
  ]},
  { type: 'divider', style: { borderColor: 'rgba(168,85,247,0.4)', margin: '4px 16px' } },
  { type: 'group', label: 'Documentation', children: [
    { key: '/help', icon: <ReadOutlined />, label: 'Docs' },
    { key: '/api-doc', icon: <ApiOutlined />, label: 'API Doc' },
    { key: '/glossary', icon: <BookOutlined />, label: 'Glossary' },
    { key: '/about', icon: <InfoCircleOutlined />, label: 'About' },
  ]},
]

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [version, setVersion] = useState('')
  const [aiEnabled, setAiEnabled] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const roleLabel: Record<string, string> = {
    admin: 'System Administrator',
    operator: 'Operator',
    viewer: 'Read-only Viewer',
    user: 'Standard User',
  }

  const userAllowedKeys = new Set(['/dashboard', '/cluster', '/volumes', '/filer', '/s3/buckets', '/s3/secrets', '/s3/policies'])

  function getMenuItems(role?: string, aiOn = false): MenuItem[] {
    const result: MenuItem[] = []

    for (const group of baseMenuItems) {
      if (group.type === 'divider') {
        result.push({ ...group })
        continue
      }

      if (group.type === 'group' && group.children) {
        let children = group.children.filter((child) => {
          if (!aiOn && child.key === '/chatbot') return false
          if (role === 'user') {
            return userAllowedKeys.has(child.key as string)
          }
          return true
        })

        if (role === 'admin' && group.label === 'System') {
          const settingsIdx = children.findIndex((c) => c.key === '/settings')
          if (settingsIdx >= 0) {
            children = [
              ...children.slice(0, settingsIdx),
              { key: '/api-keys', icon: <KeyOutlined />, label: 'API Keys' },
              ...children.slice(settingsIdx),
            ]
          }
        }

        if (children.length > 0) {
          result.push({ ...group, children })
        }
      }
    }

    return result
  }

  const menuItems = getMenuItems(user?.role, aiEnabled)

  useEffect(() => {
    api.get('/info').then((r) => setVersion(r.data?.version || '')).catch(() => {})
    api.get('/chatbot/status').then((r) => setAiEnabled(r.data?.enabled || false)).catch(() => {})
  }, [])

  const handleMenuClick = ({ key }: { key: string }) => navigate(key)

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) {
      message.error('All fields are required')
      return
    }
    if (newPw !== confirmPw) {
      message.error('Passwords do not match')
      return
    }
    setPwLoading(true)
    try {
      await changeMyPassword(currentPw, newPw)
      message.success('Password changed')
      setPasswordOpen(false)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e: any) {
      message.error(e.response?.data?.detail || 'Failed to change password')
    } finally {
      setPwLoading(false)
    }
  }

  const selectedKeys = [location.pathname]

  const userMenuItems = [
    {
      key: 'header',
      label: (
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{user?.username}</div>
          <div style={{ fontSize: 12, color: '#a855f7' }}>
            {roleLabel[user?.role || ''] || user?.role || 'Unknown Role'}
          </div>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'profile',
      icon: <IdcardOutlined />,
      label: 'Profile',
    },
    {
      key: 'password',
      icon: <KeyOutlined />,
      label: 'Change Password',
      onClick: () => setPasswordOpen(true),
    },
    { type: 'divider' as const },
    {
      key: 'about',
      icon: <InfoCircleOutlined />,
      label: 'About SeaweedFS Dashboard',
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
      onClick: () => logout(),
    },
  ]

  return (
    <>
      <div className="tech-bg" />
      <div className="bg-overlay" />
      <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          theme="dark"
          width={240}
          style={{
            background: 'rgba(15,23,42,0.9)',
            borderRight: '1px solid rgba(236,72,153,0.08)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              borderBottom: '1px solid rgba(236,72,153,0.1)',
            }}
          >
            <Typography.Title
              level={4}
              style={{ margin: 0 }}
              className="neon-text"
            >
              {collapsed ? 'SF' : 'SeaweedFS'}
            </Typography.Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={selectedKeys}
            items={menuItems}
            onClick={handleMenuClick}
            theme="dark"
            inlineCollapsed={collapsed}
            style={{ background: 'transparent', borderInlineEnd: 'none', marginTop: 8, flex: 1, overflow: 'auto' }}
            className="sidebar-menu"
          />
          <div style={{
            flexShrink: 0,
            padding: collapsed ? '8px 0' : '12px 24px',
            fontSize: 11,
            color: '#475569',
            display: 'flex',
            gap: 4,
            flexDirection: collapsed ? 'column' : 'row',
            justifyContent: collapsed ? 'center' : 'space-between',
            alignItems: 'center',
            borderTop: '1px solid rgba(236,72,153,0.08)',
          }}>
            <span>{collapsed ? '' : 'mBm TECHNOLOGY LLC'}</span>
            {version && (
              <span style={{ color: '#a855f7', fontWeight: 600, fontSize: collapsed ? 10 : 11 }}>
                v{version}
              </span>
            )}
          </div>
        </Sider>
        <Layout style={{ background: 'transparent' }}>
          <Header
            style={{
              padding: '0 24px',
              background: 'rgba(15,23,42,0.85)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(236,72,153,0.08)',
            }}
          >
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ color: '#94a3b8', fontSize: 16 }}
            />
            <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
              <Button
                type="text"
                style={{
                  color: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 40,
                }}
              >
                <Avatar
                  size={28}
                  icon={<UserOutlined />}
                  style={{
                    background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.username}
                </span>
              </Button>
            </Dropdown>
          </Header>
          <Content style={{ margin: 20, padding: 20, background: 'transparent' }}>
            <div className="glass-panel" style={{ padding: 20, minHeight: 'calc(100vh - 124px)', borderRadius: 12 }}>
              <Outlet />
            </div>
          </Content>
        </Layout>
      </Layout>

      <Modal
        open={passwordOpen}
        title="Change Password"
        onOk={handleChangePassword}
        onCancel={() => {
          setPasswordOpen(false)
          setCurrentPw('')
          setNewPw('')
          setConfirmPw('')
        }}
        confirmLoading={pwLoading}
        okText="Change"
      >
        <Input.Password
          placeholder="Current password"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <Input.Password
          placeholder="New password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <Input.Password
          placeholder="Confirm new password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
        />
      </Modal>
    </>
  )
}
