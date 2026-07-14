import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, theme, Typography } from 'antd'
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
  SunOutlined,
  MoonOutlined,
  MedicineBoxOutlined,
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
  const [darkTheme, setDarkTheme] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const logout = useAuthStore((state) => state.logout)

  const handleMenuClick = ({ key }: { key: string }) => navigate(key)

  const selectedKeys = [location.pathname]
  const openKeys = ['/s3']

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme={darkTheme ? 'dark' : 'light'}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography.Title level={4} style={{ margin: 0, color: darkTheme ? '#fff' : token.colorPrimary }}>
            {collapsed ? 'SF' : 'SeaweedFS'}
          </Typography.Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={openKeys}
          items={menuItems}
          onClick={handleMenuClick}
          theme={darkTheme ? 'dark' : 'light'}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 16px',
            background: darkTheme ? '#141414' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="text" icon={darkTheme ? <SunOutlined /> : <MoonOutlined />} onClick={() => setDarkTheme(!darkTheme)} />
            <Button type="text" icon={<LogoutOutlined />} onClick={() => logout()} />
          </div>
        </Header>
        <Content style={{ margin: 16, padding: 16, background: darkTheme ? '#141414' : '#fff', borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
