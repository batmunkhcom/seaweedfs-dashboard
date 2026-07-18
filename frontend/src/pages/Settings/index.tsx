import { useState, useEffect, useMemo } from 'react'
import { Card, Typography, InputNumber, Button, Space, message, Spin, Table, Tag, Tabs, Popconfirm, Badge, Select, Alert } from 'antd'
import {
  SaveOutlined,
  HddOutlined,
  BellOutlined,
  CloudUploadOutlined,
  ClockCircleOutlined,
  MedicineBoxOutlined,
  ClusterOutlined,
  UndoOutlined,
  SettingOutlined,
  RobotOutlined,
  ApiOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { getSettings, updateSettings, getClusterHealth, getNodeLimits, updateNodeLimits, testAiConnection, triggerEmbeddingIndex } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import {
  SettingRow,
  ALERT_SETTINGS,
  UPLOAD_SETTINGS,
  SNAPSHOT_SETTINGS,
  DISK_HEALTH_SETTINGS,
  CLUSTER_SETTINGS,
  GENERAL_SETTINGS,
  AI_SETTINGS,
  AI_EMBEDDING_SETTINGS,
  FEATURE_TOGGLES,
} from './constants'
import type { SettingMeta } from './constants'

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === 'admin'

  const [nodeLimits, setNodeLimits] = useState<Record<string, number>>({})
  const [nodeDetails, setNodeDetails] = useState<any[]>([])
  const [limitsLoading, setLimitsLoading] = useState(true)
  const [limitsSaving, setLimitsSaving] = useState(false)
  const [testingAi, setTestingAi] = useState(false)
  const [aiModels, setAiModels] = useState<{ id: string; name: string }[]>([])
  const [aiError, setAiError] = useState('')
  const [testingEmbedding, setTestingEmbedding] = useState(false)
  const [embeddingModels, setEmbeddingModels] = useState<{ id: string; name: string }[]>([])
  const [embeddingError, setEmbeddingError] = useState('')
  const [indexing, setIndexing] = useState(false)

  useEffect(() => {
    getSettings()
      .then((data) => {
        const cats = (data && data.categories) ? data.categories : {}
        const vals: Record<string, string> = {}
        for (const items of Object.values(cats)) {
          if (Array.isArray(items)) {
            for (const item of items) {
              vals[item.key] = item.value
            }
          }
        }
        setValues(vals)
        setOriginalValues({ ...vals })
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
        details.forEach((n: any) => {
          const url = n.url || n.Url
          if (!(url in saved)) saved[url] = n.max_native || 9999
        })
        setNodeLimits(saved)
      })
      .catch(() => {})
      .finally(() => setLimitsLoading(false))
  }, [isAdmin])

  const modifiedCount = useMemo(() => {
    return Object.keys(values).filter((k) => values[k] !== originalValues[k]).length
  }, [values, originalValues])

  const handleTestConnection = async () => {
    setTestingAi(true)
    setAiError('')
    try {
      const provider = values['ai_provider'] || 'openai'
      const apiBase = values['ai_api_base_url'] || 'https://api.openai.com/v1'
      const apiKey = values['ai_api_key'] || ''
      const res = await testAiConnection(provider, apiBase, apiKey)
      if (res.ok && res.models.length > 0) {
        setAiModels(res.models)
        setAiError('')
        message.success(`Found ${res.models.length} models`)
        if (res.models.length === 1) {
          setValues((prev) => ({ ...prev, ai_model: res.models[0].id }))
        }
      } else {
        setAiModels([])
        const err = res.error || 'Connection failed. Check API URL and key.'
        setAiError(err)
        message.error(err)
      }
    } catch {
      const err = 'Network error — cannot reach API server'
      setAiError(err)
      message.error(err)
    }
    setTestingAi(false)
  }

  const handleTestEmbedding = async () => {
    setTestingEmbedding(true)
    setEmbeddingError('')
    try {
      const embProvider = values['ai_embedding_provider'] || 'same'
      const chatProvider = values['ai_provider'] || 'openai'
      const provider = embProvider === 'same' ? chatProvider : embProvider
      let apiBase = values['ai_embedding_api_base_url'] || ''
      if (!apiBase) apiBase = values['ai_api_base_url'] || 'https://api.openai.com/v1'
      let apiKey = values['ai_embedding_api_key'] || ''
      if (!apiKey) apiKey = values['ai_api_key'] || ''

      const res = await testAiConnection(provider, apiBase, apiKey)
      if (res.ok && res.models.length > 0) {
        setEmbeddingModels(res.models)
        setEmbeddingError('')
        message.success(`Found ${res.models.length} embedding models`)
        if (res.models.length === 1) {
          setValues((prev) => ({ ...prev, ai_embedding_model: res.models[0].id }))
        }
      } else {
        setEmbeddingModels([])
        const err = res.error || 'Connection failed. Check API URL and key.'
        setEmbeddingError(err)
        message.error(err)
      }
    } catch {
      const err = 'Network error — cannot reach embedding API server'
      setEmbeddingError(err)
      message.error(err)
    }
    setTestingEmbedding(false)
  }

  const handleIndexNow = async () => {
    setIndexing(true)
    try {
      const res = await triggerEmbeddingIndex()
      if (res.ok) {
        message.success(`Indexed ${res.indexed}/${res.total_chunks} chunks from ${res.files} files`)
      } else {
        message.error(res.error || 'Indexing failed')
      }
    } catch {
      message.error('Indexing request failed')
    }
    setIndexing(false)
  }

  const handleSave = async (keysToSave?: string[]) => {
    setSaving(true)
    try {
      const payload: Record<string, string> = {}
      const target = keysToSave || Object.keys(values)
      target.forEach((k) => { payload[k] = values[k] })
      await updateSettings(payload)
      const newOriginals = { ...originalValues }
      target.forEach((k) => { newOriginals[k] = values[k] })
      setOriginalValues(newOriginals)
      message.success(`${Object.keys(payload).length} settings saved`)
    } catch {
      message.error('Failed to save settings')
    }
    setSaving(false)
  }

  const handleReset = (settingKeys: string[], defaults: Record<string, string>) => {
    const updated = { ...values }
    settingKeys.forEach((k) => { updated[k] = defaults[k] })
    setValues(updated)
    message.info('Reset to defaults — click Save to apply')
  }

  const handleSettingChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  const handleLimitChange = (nodeUrl: string, value: number | null) => {
    const num = value !== null && value > 0 ? value : 9999
    setNodeLimits((prev) => ({ ...prev, [nodeUrl]: num }))
  }

  const handleSaveNodeLimits = async () => {
    setLimitsSaving(true)
    try {
      await updateNodeLimits(nodeLimits)
      message.success('Node volume limits saved')
    } catch {
      message.error('Failed to save node limits')
    }
    setLimitsSaving(false)
  }

  const allNodesNativeMax = nodeDetails.length > 0
    ? Math.min(...nodeDetails.map((n) => n.max_native || n.Max || 9999))
    : 9999

  const handleApplyAll = (value: number | null) => {
    if (value && value > 0) {
      const updated: Record<string, number> = { ...nodeLimits }
      nodeDetails.forEach((n) => {
        const url = n.url || n.Url
        updated[url] = Math.min(value, n.max_native || n.Max || 9999)
      })
      setNodeLimits(updated)
      message.success(`Applied ${value} to all ${nodeDetails.length} nodes`)
    }
  }

  const settingsByCategory: Record<string, SettingMeta[]> = {
    general: GENERAL_SETTINGS,
    alerts: ALERT_SETTINGS,
    uploads: UPLOAD_SETTINGS,
    snapshot: SNAPSHOT_SETTINGS,
    disk_health: DISK_HEALTH_SETTINGS,
    cluster: CLUSTER_SETTINGS,
    ai: AI_SETTINGS,
    features: FEATURE_TOGGLES,
  }

  const defaultByCategory: Record<string, Record<string, string>> = {}
  for (const [cat, metas] of Object.entries(settingsByCategory)) {
    defaultByCategory[cat] = {}
    metas.forEach((m) => { defaultByCategory[cat][m.key] = m.defaultVal })
  }

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />

  const nodeColumns = [
    {
      title: 'Node', dataIndex: 'node', key: 'node', width: 200,
      render: (text: string) => (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#e2e8f0' }}>{text}</span>
      ),
    },
    {
      title: 'Usage', key: 'usage', width: 140,
      render: (_: any, record: any) => {
        const limit = nodeLimits[record.node] || record.native_max
        const pct = limit > 0 ? Math.round((record.used / limit) * 100) : 0
        return (
          <Space size={4}>
            <Typography.Text style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
              {record.used}/{limit}
            </Typography.Text>
            <Tag color={pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green'} style={{ fontSize: 10 }}>{pct}%</Tag>
          </Space>
        )
      },
    },
    {
      title: 'Native Max', dataIndex: 'native_max', key: 'native_max', width: 110,
      render: (val: number) => <Tag color="blue">{val}</Tag>,
    },
    {
      title: 'Configured Limit', key: 'limit', width: 170,
      render: (_: any, record: any) => (
        <InputNumber
          min={record.used}
          max={record.native_max * 2}
          value={nodeLimits[record.node] || record.native_max}
          onChange={(v) => handleLimitChange(record.node, v)}
          style={{ width: 140 }}
          size="small"
          addonAfter="vols"
        />
      ),
    },
    {
      title: 'Free', key: 'free', width: 80,
      render: (_: any, record: any) => {
        const limit = nodeLimits[record.node] || record.native_max
        const free = Math.max(0, limit - record.used)
        return <Tag color={free === 0 ? 'red' : free < 5 ? 'orange' : 'green'}>{free}</Tag>
      },
    },
  ]

  const tabItems = [
    {
      key: 'general', label: <span><SettingOutlined /> General</span>,
      children: createTabContent(GENERAL_SETTINGS, defaultByCategory.general),
    },
    {
      key: 'alerts', label: <span><BellOutlined /> Alerts</span>,
      children: createTabContent(ALERT_SETTINGS, defaultByCategory.alerts),
    },
    {
      key: 'uploads', label: <span><CloudUploadOutlined /> Uploads</span>,
      children: createTabContent(UPLOAD_SETTINGS, defaultByCategory.uploads),
    },
    {
      key: 'snapshot', label: <span><ClockCircleOutlined /> Snapshot</span>,
      children: createTabContent(SNAPSHOT_SETTINGS, defaultByCategory.snapshot),
    },
    {
      key: 'disk_health', label: <span><MedicineBoxOutlined /> Disk Health</span>,
      children: createTabContent(DISK_HEALTH_SETTINGS, defaultByCategory.disk_health),
    },
    {
      key: 'ai', label: <span><RobotOutlined /> AI</span>,
      children: (
        <>
        <Card
          extra={
            isAdmin && (
              <Space>
                <Button size="small" icon={<UndoOutlined />} onClick={() => handleReset(AI_SETTINGS.map((s) => s.key), defaultByCategory.ai)}>
                  Reset
                </Button>
                <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => handleSave(AI_SETTINGS.map((s) => s.key))} loading={saving}>
                  Save
                </Button>
              </Space>
            )
          }
        >
          {AI_SETTINGS.map((meta) => {
            if (meta.key === 'ai_api_key') {
              return (
                <div key={meta.key}>
                  <SettingRow meta={meta} value={values[meta.key]} onChange={(v) => handleSettingChange(meta.key, v)} readonly={!isAdmin} />
                  {isAdmin && (
                    <div style={{ padding: '0 0 14px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                        <Space>
                          <Button
                            icon={<ApiOutlined />}
                            onClick={handleTestConnection}
                            loading={testingAi}
                            type="primary"
                            ghost
                          >
                            Test Connection & Fetch Models
                          </Button>
                          {aiModels.length > 0 && <Tag color="success">Connected — {aiModels.length} models</Tag>}
                          {aiError && <Tag color="error">{aiError}</Tag>}
                        </Space>
                      </div>
                      {aiError && (
                        <Alert
                          type="error"
                          message="Connection Failed"
                          description={aiError}
                          showIcon
                          closable
                          onClose={() => setAiError('')}
                          style={{ marginTop: 8 }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            }
            if (meta.key === 'ai_model' && aiModels.length > 0) {
              return isAdmin ? (
                <div key={meta.key} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0',
                  borderBottom: '1px solid rgba(168,85,247,0.06)',
                }}>
                  <div style={{ flex: 1 }}>
                    <Typography.Text strong style={{ fontSize: 14 }}>{meta.label}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{meta.description}</Typography.Text>
                  </div>
                  <Select
                    value={values[meta.key]}
                    onChange={(v: string) => handleSettingChange(meta.key, v)}
                    style={{ minWidth: 220 }}
                    options={aiModels.map((m) => ({ value: m.id, label: m.name || m.id }))}
                  />
                </div>
              ) : (
                <SettingRow key={meta.key} meta={meta} value={values[meta.key]} onChange={(v) => handleSettingChange(meta.key, v)} readonly={true} />
              )
            }
            return <SettingRow key={meta.key} meta={meta} value={values[meta.key]} onChange={(v) => handleSettingChange(meta.key, v)} readonly={!isAdmin} />
          })}
        </Card>
        <Card
          title={<Typography.Text strong style={{ fontSize: 14 }}>Embedding (RAG)</Typography.Text>}
          style={{ marginTop: 16 }}
          extra={
            isAdmin && (
              <Space>
                <Button size="small" icon={<SyncOutlined />} onClick={handleIndexNow} loading={indexing}>
                  Index Now
                </Button>
                <Button size="small" icon={<UndoOutlined />} onClick={() => handleReset(AI_EMBEDDING_SETTINGS.map((s) => s.key), defaultByCategory.ai)}>
                  Reset
                </Button>
                <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => handleSave(AI_EMBEDDING_SETTINGS.map((s) => s.key))} loading={saving}>
                  Save
                </Button>
              </Space>
            )
          }
        >
          <div style={{ marginBottom: 12, fontSize: 12, color: '#94a3b8', padding: '8px 12px', background: 'rgba(59,130,246,0.06)', borderRadius: 6 }}>
            Embedding provider can be different from chat provider. Use Ollama (nomic-embed-text) for free local embeddings while keeping OpenAI for chat.
          </div>
          {AI_EMBEDDING_SETTINGS.map((meta) => {
            if (meta.key === 'ai_embedding_api_key') {
              return (
                <div key={meta.key}>
                  <SettingRow meta={meta} value={values[meta.key]} onChange={(v) => handleSettingChange(meta.key, v)} readonly={!isAdmin} />
                  {isAdmin && (
                    <div style={{ padding: '0 0 14px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                        <Space>
                          <Button
                            icon={<ApiOutlined />}
                            onClick={handleTestEmbedding}
                            loading={testingEmbedding}
                            type="primary"
                            ghost
                          >
                            Test Connection & Fetch Models
                          </Button>
                          {embeddingModels.length > 0 && <Tag color="success">Connected — {embeddingModels.length} models</Tag>}
                          {embeddingError && <Tag color="error">{embeddingError}</Tag>}
                        </Space>
                      </div>
                      {embeddingError && (
                        <Alert
                          type="error"
                          message="Embedding Connection Failed"
                          description={embeddingError}
                          showIcon
                          closable
                          onClose={() => setEmbeddingError('')}
                          style={{ marginTop: 8 }}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            }
            if (meta.key === 'ai_embedding_model' && embeddingModels.length > 0) {
              return isAdmin ? (
                <div key={meta.key} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0',
                  borderBottom: '1px solid rgba(168,85,247,0.06)',
                }}>
                  <div style={{ flex: 1 }}>
                    <Typography.Text strong style={{ fontSize: 14 }}>{meta.label}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{meta.description}</Typography.Text>
                  </div>
                  <Select
                    value={values[meta.key]}
                    onChange={(v: string) => handleSettingChange(meta.key, v)}
                    style={{ minWidth: 220 }}
                    options={embeddingModels.map((m) => ({ value: m.id, label: m.name || m.id }))}
                  />
                </div>
              ) : (
                <SettingRow key={meta.key} meta={meta} value={values[meta.key]} onChange={(v) => handleSettingChange(meta.key, v)} readonly={true} />
              )
            }
            return <SettingRow key={meta.key} meta={meta} value={values[meta.key]} onChange={(v) => handleSettingChange(meta.key, v)} readonly={!isAdmin} />
          })}
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(168,85,247,0.04)', borderRadius: 6, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
            <strong>Auto-indexing:</strong> Wiki/docs content is automatically indexed every 6 hours when AI is enabled.
            The indexer reads all <code>wiki/</code> files, chunks them, generates embeddings, and stores them in SQLite.
            Orphan data (from deleted files) is cleaned up automatically each run.
            Click <strong>Index Now</strong> to trigger immediate re-indexing.
          </div>
        </Card>
        </>
      ),
    },
    {
      key: 'cluster', label: <span><ClusterOutlined /> Cluster</span>,
      children: (
        <>
          {createTabContent(CLUSTER_SETTINGS, defaultByCategory.cluster)}
          {isAdmin && (
            <Card
              title={<Space><HddOutlined style={{ color: '#f59e0b' }} /><span>Node Volume Limits</span><Tag color="blue">{nodeDetails.length} nodes</Tag></Space>}
              loading={limitsLoading}
              extra={<Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSaveNodeLimits} loading={limitsSaving}>Save Limits</Button>}
              style={{ marginTop: 16 }}
            >
              {!limitsLoading && nodeDetails.length > 0 && (
                <>
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
                  <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(59,130,246,0.06)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Typography.Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Quick set — apply to all nodes:</Typography.Text>
                    <InputNumber min={1} max={allNodesNativeMax} size="small" style={{ width: 120 }} placeholder={`Max ${allNodesNativeMax}`} onChange={(v) => handleApplyAll(v)} addonAfter="vols" />
                    <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>Limits applied alongside SeaweedFS native max (whichever is lower)</Typography.Text>
                  </div>
                </>
              )}
            </Card>
          )}
        </>
      ),
    },
    {
      key: 'features', label: <span><ApiOutlined /> Features</span>,
      children: createTabContent(FEATURE_TOGGLES, defaultByCategory.features),
    },
  ]

  function createTabContent(metas: SettingMeta[], defaults: Record<string, string>) {
    return (
      <Card
        extra={
          isAdmin && (
            <Space>
              <Button size="small" icon={<UndoOutlined />} onClick={() => handleReset(metas.map((s) => s.key), defaults)}>Reset</Button>
              <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => handleSave(metas.map((s) => s.key))} loading={saving}>Save</Button>
            </Space>
          )
        }
      >
        {metas.map((meta) => (
          <SettingRow key={meta.key} meta={meta} value={values[meta.key]} onChange={(v) => handleSettingChange(meta.key, v)} readonly={!isAdmin} />
        ))}
      </Card>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Settings</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {isAdmin ? 'Configure system thresholds, limits, and cluster parameters' : 'View current system configuration (read-only)'}
          </Typography.Text>
        </div>
        {isAdmin && modifiedCount > 0 && (
          <Popconfirm title={`Save all ${modifiedCount} modified settings?`} onConfirm={() => handleSave()}>
            <Badge count={modifiedCount} size="small" offset={[-4, 4]}>
              <Button type="primary" icon={<SaveOutlined />} loading={saving}>Save All Changes</Button>
            </Badge>
          </Popconfirm>
        )}
      </div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  )
}
