import { Form, Input, Button, Card, Typography, Alert } from 'antd'
import { UserOutlined, LockOutlined, CloudServerOutlined } from '@ant-design/icons'
import { useAuth } from '../../hooks/useAuth'
import { useState } from 'react'

const { Title, Text } = Typography

export default function LoginPage() {
  const { login, loading } = useAuth()
  const [error, setError] = useState<string>('')

  const onFinish = (values: { username: string; password: string }) => {
    setError('')
    login(values.username, values.password, setError)
    }

  return (
     <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', position: 'relative',
     }}>
       <div className="tech-bg" />
       <div className="bg-overlay" />

       <Card
        style={{
          width: 400,
          background: 'rgba(30,41,59,0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(236,72,153,0.15)',
          borderRadius: 16,
          boxShadow: '0 8px 48px rgba(0,0,0,0.5), 0 0 80px rgba(168,85,247,0.05)',
         }}
       >
         <div style={{ textAlign: 'center', marginBottom: 32 }}>
           <CloudServerOutlined
            style={{ fontSize: 48, background: 'linear-gradient(135deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
           />
           <Title level={3} style={{ margin: '12px 0 4px', color: '#e2e8f0' }}>
            SeaweedFS Dashboard
           </Title>
           <Text style={{ color: '#64748b' }}>dc03 Cluster Management</Text>
         </div>

         {error && (
           <Alert type="error" message={error} showIcon closable onClose={() => setError('')} style={{ marginBottom: 16 }} />
         )}

         <Form name="login" onFinish={onFinish} size="large">
           <Form.Item name="username" rules={[{ required: true, message: 'Please enter username' }]}>
             <Input
              prefix={<UserOutlined style={{ color: '#a855f7' }} />}
              placeholder="Username"
              style={{
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid rgba(236,72,153,0.15)',
                color: '#e2e8f0',
               }}
             />
           </Form.Item>
           <Form.Item name="password" rules={[{ required: true, message: 'Please enter password' }]}>
             <Input.Password
              prefix={<LockOutlined style={{ color: '#a855f7' }} />}
              placeholder="Password"
              style={{
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid rgba(236,72,153,0.15)',
               }}
             />
           </Form.Item>
           <Form.Item>
             <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{
                height: 44,
                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                border: 'none',
                fontWeight: 600,
               }}
             >
              Access Console
             </Button>
           </Form.Item>
         </Form>
       </Card>
     </div>
   )
}
