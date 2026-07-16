import { useState, useEffect } from 'react'
import { Card, Typography, Input, Button, Space, message, Spin, Table, Tag, Tooltip, InputNumber } from 'antd'
import { SaveOutlined, HddOutlined } from '@ant-design/icons'
import { getSettings, updateSettings, getClusterHealth, getNodeLimits, updateNodeLimits } from '../../services/api'
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

  // Node volume limits state
  const [nodeLimits, setNodeLimits] = useState<Record<string, number>>({})
  const [nodeDetails, setNodeDetails] = useState<any[]>([])
  const [limitsLoading, setLimitsLoading] = useState(true)

  useEffect(() => {
    getSettings()
       .then((data) => {
         const cats = (data && data.categories) ? data.categories : {}
         setCategories(cats)
         const vals: Record<string, string> = {}
         for (const items of Object.values(cats)) {
           if (Array.isArray(items)) {
             for (const item of items) {
               vals[item.key] = item.value
              }
            }
          }
         setValues(vals)
        })
       .catch(() => {})
       .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([getClusterHealth(), getNodeLimits()])
      .then(([health, limitsData]) => {
        const details = health.nodes || []
        setNodeDetails(details)
        const saved: Record<string, number> = {}
        const raw = limitsData.limits || {}
        if (typeof raw === 'object' && !Array.isArray(raw)) {
          Object.entries(raw).forEach(([k, v]) => {
            saved[k] = typeof v === 'number' ? v : parseInt(v as any, 10) || 9999
           })
          }
        // Fill in defaults for nodes without limits
        details.forEach((n: any) => {
          const url = n.url || n.Url
          if (!(url in saved)) {
            saved[url] = n.max_native || 9999
           }
          })
        setNodeLimits(saved)
       })
      .catch(() => {})
      .finally(() => setLimitsLoading(false))
   }, [isAdmin])

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

  const handleSaveNodeLimits = async () => {
    setSaving(true)
    try {
      await updateNodeLimits(nodeLimits)
      message.success('Node volume limits saved')
     } catch {
      message.error('Failed to save node limits')
     }
     setSaving(false)
    }

  const handleLimitChange = (nodeUrl: string, value: number | null) => {
    const num = value !== null && value > 0 ? value : 9999
    setNodeLimits((prev) => ({ ...prev, [nodeUrl]: num }))
    }

  const allNodesNativeMax = Math.min(...nodeDetails.map((n) => n.max_native || n.Max || 9999))

  const handleApplyAll = (value: number | null) => {
    if (value && value > 0) {
      const updated: Record<string, number> = {}
      nodeDetails.forEach((n) => {
        const url = n.url || n.Url
        updated[url] = Math.min(value, n.max_native || n.Max || 9999)
        })
      setNodeLimits(updated)
      message.success(`Applied to all ${nodeDetails.length} nodes`)
      }
    }

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  const categoryTitles: Record<string, string> = {
    alerts: 'Alerts',
    uploads: 'Upload Limits',
    snapshot: 'Snapshot',
    disk_health: 'Disk Health',
    cluster: 'Cluster',
    general: 'General',
    timezone: 'Timezone',
   }

  const nodeColumns = [
     {
       title: 'Node',
       dataIndex: 'node',
       key: 'node',
       width: 200,
       render: (text: string) => <Tooltip title={text}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{text}</span></Tooltip>,
      },
      {
        title: 'Used',
        dataIndex: 'used',
        key: 'used',
        width: 100,
        render: (_: any, record: any) => `${record.used} / ${record.native_max}`,
       },
       {
         title: 'Native Max',
         dataIndex: 'native_max',
         key: 'native_max',
         width: 120,
         render: (val: number, record: any) => (
           <Tooltip title={`Disk capacity based (${record.physical_gb} GB)`}>
             <Tag color="blue">{val}</Tag>
            </Tooltip>
           ),
          },
          {
            title: 'Configured Limit',
            dataIndex: 'limit',
            key: 'limit',
            width: 200,
            render: (_: any, record: any) => (
              <Input
                type="number"
                min={record.used}
                max={record.native_max * 2}
                value={nodeLimits[record.node] || record.native_max}
                onChange={(e) => handleLimitChange(record.node, parseInt(e.target.value, 10))}
                style={{ width: '100%' }}
               />
              ),
             },
             {
               title: 'Free',
               dataIndex: 'free',
               key: 'free',
               width: 120,
               render: (_: any, record: any) => {
                 const limit = nodeLimits[record.node] || record.native_max
                 const free = Math.max(0, limit - record.used)
                 const pct = Math.round((record.used / limit) * 100)
                 const color = pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green'
                 return <Tag color={color}>{free} free</Tag>
                },
               },
              ]

  return (
     <div>
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>Settings</Typography.Title>
          {isAdmin && (
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              Save All Changes
             </Button>
            )
           }
        </Space>

        {/* Node Volume Limits */}
        {isAdmin && !limitsLoading && nodeDetails.length > 0 && (
          <Card
            title={
               <span>
                 <HddOutlined style={{ marginRight: 6, color: '#f59e0b' }} />
                 Node Volume Limits
                <Tag color="blue" style={{ marginLeft: 8 }}>{Object.keys(nodeLimits).length} nodes</Tag>
              </span>
            }
            extra={
               <Space>
                 <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSaveNodeLimits} loading={saving}>
                    Save Limits
                  </Button>
                </Space>
              }
            style={{ marginBottom: 16 }}
           >
              <Table
                columns={nodeColumns}
                dataSource={nodeDetails.map((n) => ({
                  key: n.url || n.Url,
                  node: (n.url || n.Url).replace(':8080', ''),
                  used: n.volumes || n.Volumes || 0,
                  native_max: n.max_native || n.Max || 9999,
                }))}
                pagination={false}
                size="small"
              />
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Apply to all nodes:</Typography.Text>
                <InputNumber
                  min={1}
                  max={allNodesNativeMax}
                  size="small"
                  style={{ width: 100 }}
                  placeholder={`Max ${allNodesNativeMax}`}
                  onChange={(val) => handleApplyAll(val)}
                />
              </div>
             <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
                Set per-node volume limits. Each node has different disk capacity — the limit controls how many volumes each server can hold.
               <br />
                Limits are applied alongside SeaweedFS native max (whichever is lower).
              </div>
            </Card>
          )}

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
