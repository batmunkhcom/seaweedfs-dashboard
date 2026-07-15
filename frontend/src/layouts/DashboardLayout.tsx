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
} from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'
import { changeMyPassword } from '../services/api'
import api from '../services/api'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/cluster', icon: <ClusterOutlined />, label: 'Cluster' },
  { key: '/volumes', icon: <HddOutlined />, label: 'Volumes' },
  { key: '/collections', icon: <FolderOpenOutlined />, label: 'Collections' },
  { key: '/filer', icon: <FolderOutlined />, label: 'Filer' },
  {
    key: '/s3',
    icon: <CloudOutlined />,
    label: 'S3',
    children: [
      { key: '/s3/buckets', label: 'Buckets' },
      { key: '/s3/users', label: 'Users' },
      { key: '/s3/policies', label: 'Policies' },
    ],
  },
  { key: '/backup', icon: <SafetyOutlined />, label: 'Backup' },
  { key: '/workers', icon: <ToolOutlined />, label: 'Workers' },
  { key: '/disk-health', icon: <MedicineBoxOutlined />, label: 'Disk Health' },
  { key: '/users', icon: <TeamOutlined />, label: 'Users' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
]

const bottomLinks = [
  { key: '/help', icon: <ReadOutlined />, label: 'Docs', tooltip: 'Documentation & guides' },
  { key: '/glossary', icon: <BookOutlined />, label: 'Glossary', tooltip: 'SeaweedFS terminology' },
  { key: '/about', icon: <InfoCircleOutlined />, label: 'About', tooltip: 'About this dashboard' },
]

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [version, setVersion] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    api.get('/info').then((r) => setVersion(r.data?.version || '')).catch(() => {})
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
  const openKeys = ['/s3']

  const userMenuItems = [
    {
      key: 'header',
      label: (
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{user?.username}</div>
          <div style={{ fontSize: 12, color: '#a855f7' }}>
            {user?.role === 'admin' ? 'System Administrator' : user?.role === 'operator' ? 'Operator' : 'Read-only Viewer'}
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
            defaultOpenKeys={openKeys}
            items={menuItems}
            onClick={handleMenuClick}
            theme="dark"
            style={{ background: 'transparent', borderInlineEnd: 'none', marginTop: 8, flex: 1 }}
          />
          {!collapsed && (
            <div style={{
              borderTop: '1px solid rgba(236,72,153,0.08)',
              padding: '8px 0 0',
            }}>
              {bottomLinks.map((link) => {
                const isActive = location.pathname === link.key
                return (
                  <Tooltip key={link.key} title={link.tooltip} placement="right">
                    <div
                      onClick={() => navigate(link.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 24px',
                        cursor: 'pointer',
                        color: isActive ? '#a855f7' : '#94a3b8',
                        background: isActive ? 'rgba(168,85,247,0.1)' : 'transparent',
                        borderRight: isActive ? '2px solid #a855f7' : '2px solid transparent',
                        transition: 'all 0.15s ease',
                        fontSize: 13,
                        margin: '0 0 1px',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.color = '#e2e8f0'
                          ;(e.currentTarget as HTMLElement).style.background = 'rgba(168,85,247,0.05)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.color = '#94a3b8'
                          ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                        }
                      }}
                    >
                      <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>
                        {link.icon}
                      </span>
                      <span>{link.label}</span>
                    </div>
                  </Tooltip>
                )
              })}
              <div style={{
                padding: '16px 24px 12px',
                fontSize: 11,
                color: '#475569',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>mBm TECHNOLOGY LLC</span>
                  {version && <span style={{ color: '#a855f7', fontWeight: 600 }}>v{version}</span>}
                </div>
              </div>
            </div>
          )}
          {collapsed && (
            <div style={{
              borderTop: '1px solid rgba(236,72,153,0.08)',
              padding: '8px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}>
              {bottomLinks.map((link) => (
                <Tooltip key={link.key} title={link.tooltip} placement="right">
                  <div
                    onClick={() => navigate(link.key)}
                    style={{
                      cursor: 'pointer',
                      color: location.pathname === link.key ? '#a855f7' : '#64748b',
                      padding: 6,
                      borderRadius: 6,
                      fontSize: 18,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#a855f7' }}
                    onMouseLeave={(e) => {
                      if (location.pathname !== link.key)
                        (e.currentTarget as HTMLElement).style.color = '#64748b'
                    }}
                  >
                    {link.icon}
                  </div>
                </Tooltip>
              ))}
            </div>
          )}
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
