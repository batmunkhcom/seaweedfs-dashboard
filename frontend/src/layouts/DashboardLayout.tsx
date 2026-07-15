import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Dropdown, Typography, Space, Avatar } from 'antd'
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
  ApiOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'

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
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
]

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleMenuClick = ({ key }: { key: string }) => navigate(key)

  const selectedKeys = [location.pathname]
  const openKeys = ['/s3']

  const userMenuItems = [
    {
      key: 'role',
      label: (
        <Space>
          <ApiOutlined style={{ color: '#a855f7' }} />
          <span>{user?.role === 'admin' ? 'System Admin' : 'Viewer'}</span>
        </Space>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: user?.username || 'User',
      disabled: true,
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
            style={{ background: 'transparent', borderInlineEnd: 'none', marginTop: 8 }}
          />
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
    </>
  )
}
