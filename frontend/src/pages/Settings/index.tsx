import { useState, useEffect } from 'react'
import { Card, Typography, Input, Button, Space, message, Spin } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { getSettings, updateSettings } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

interface SettingItem {
  key: string
  value: string
  description: string
}

export default function SettingsPage() {
  const [categories, setCategories] = useState<Record<string, SettingItem[]>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === 'admin'

  useEffect(() => {
    getSettings()
      .then((data) => {
        setCategories(data.categories)
        const vals: Record<string, string> = {}
        for (const items of Object.values(data.categories)) {
          for (const item of items) {
            vals[item.key] = item.value
          }
        }
        setValues(vals)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings(values)
      message.success('Settings saved')
    } catch {
      message.error('Failed to save settings')
    }
    setSaving(false)
  }

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  const categoryTitles: Record<string, string> = {
    alerts: 'Alerts',
    uploads: 'Upload Limits',
    snapshot: 'Snapshot',
    disk_health: 'Disk Health',
    cluster: 'Cluster',
    general: 'General',
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Settings</Typography.Title>
        {isAdmin && (
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            Save All Changes
          </Button>
        )}
      </Space>

      {Object.entries(categories).map(([cat, items]) => (
        <Card key={cat} title={categoryTitles[cat] || cat} style={{ marginBottom: 16 }}>
          {items.map((item) => (
            <div key={item.key} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Typography.Text style={{ minWidth: 200 }}>{item.description}</Typography.Text>
              <Typography.Text type="secondary" style={{ minWidth: 100 }}>
                {item.key}
              </Typography.Text>
              {isAdmin ? (
                <Input
                  value={values[item.key] || ''}
                  onChange={(e) => setValues({ ...values, [item.key]: e.target.value })}
                  style={{ maxWidth: 160 }}
                />
              ) : (
                <Typography.Text strong>{values[item.key]}</Typography.Text>
              )}
            </div>
          ))}
        </Card>
      ))}
    </div>
  )
}
