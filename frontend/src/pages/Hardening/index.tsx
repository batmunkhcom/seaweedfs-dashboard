import { useState, useEffect, useCallback } from 'react'
import { Card, Button, Switch, Select, Input, InputNumber, Statistic, Row, Col, message, Space, Tag } from 'antd'
import { SafetyCertificateOutlined, CheckCircleOutlined, LockOutlined, FileZipOutlined, SyncOutlined } from '@ant-design/icons'
import { getHardeningStatus, updateHardening, triggerChecksum, deployCompression, deployEncryption, checkReplicationDrift } from '../../services/api'
import type { HardeningSetting } from '../../types'

export default function HardeningPage() {
  const [settings, setSettings] = useState<HardeningSetting[]>([])
  const [dirty, setDirty] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [driftResult, setDriftResult] = useState<Record<string, unknown> | null>(null)

  const fetch = useCallback(async () => {
    try {
      const d = await getHardeningStatus()
      setSettings(d.settings || [])
      setDirty({})
    } catch {}
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleChange = (key: string, value: unknown) => {
    setDirty(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateHardening(dirty)
      message.success('Settings saved')
      fetch()
    } catch (e: any) { message.error(e.response?.data?.detail || 'Failed') }
    setSaving(false)
  }

  const handleAction = async (action: string, fn: () => Promise<Record<string, unknown>>) => {
    setActionLoading(action)
    try {
      const r = await fn()
      if (action === 'drift') {
        setDriftResult(r)
        message.info(`Replication: ${r.current_replication || 'unknown'} (desired: ${r.desired_replication}) — ${r.ok ? 'No drift' : 'DRIFT DETECTED'}`)
      } else {
        message.success(`${action} completed: ${r.nodes_scanned || Object.keys(r.results || {}).length} nodes, ${r.healthy || (r.ok ? 'success' : 'failed')}`)
      }
    } catch (e: any) { message.error(e.response?.data?.detail || `${action} failed`) }
    setActionLoading(null)
  }

  const completed = settings.filter(s => {
    if (s.type === 'password') return s.has_value
    if (s.type === 'select') return s.value && s.value !== 'none'
    return true
  }).length

  const score = Math.round((completed / Math.max(settings.length, 1)) * 100)

  const renderControl = (s: HardeningSetting) => {
    const val = dirty[s.key] !== undefined ? dirty[s.key] : s.value
    if (s.type === 'bool') return <Switch checked={!!val} onChange={v => handleChange(s.key, v)} />
    if (s.type === 'select') return <Select value={val as string} onChange={v => handleChange(s.key, v)} style={{ width: 160 }} options={(s.options || []).map(o => ({ value: o, label: o }))} />
    if (s.type === 'number') return <InputNumber value={val as number} onChange={v => handleChange(s.key, v)} style={{ width: 120 }} />
    if (s.type === 'password') return <Input.Password placeholder="Set key" onChange={e => handleChange(s.key, e.target.value)} style={{ width: 200 }} />
    return <Input value={val as string} />
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8}>
          <Card><Statistic title="Compliance Score" value={score} suffix="%" valueStyle={{ color: score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444' }} /></Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card><Statistic title="Settings" value={`${completed}/${settings.length}`} /></Card>
        </Col>
      </Row>

      <Card title="Production Hardening Configuration" style={{ marginTop: 16 }}
        extra={<Button type="primary" icon={<SafetyCertificateOutlined />} loading={saving} onClick={handleSave} disabled={Object.keys(dirty).length === 0}>Save</Button>}>
        {settings.map(s => (
          <Card.Grid key={s.key} style={{ width: '50%', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{s.key}</div>
              </div>
              <div>{renderControl(s)}</div>
            </div>
          </Card.Grid>
        ))}
      </Card>

      <Card title="Actions" style={{ marginTop: 16 }}>
        <Space wrap size="middle">
          <Button icon={<CheckCircleOutlined />} loading={actionLoading === 'checksum'} onClick={() => handleAction('checksum', triggerChecksum)}>
            Verify Checksums (weed fix)
          </Button>
          <Button icon={<FileZipOutlined />} loading={actionLoading === 'compression'} onClick={() => handleAction('compression', deployCompression)}>
            Deploy Compression
          </Button>
          <Button icon={<LockOutlined />} loading={actionLoading === 'encryption'} onClick={() => handleAction('encryption', deployEncryption)}>
            Deploy Encryption
          </Button>
          <Button icon={<SyncOutlined />} loading={actionLoading === 'drift'} onClick={() => handleAction('drift', checkReplicationDrift)}>
            Check Replication Drift
          </Button>
        </Space>
        {driftResult && (
          <div style={{ marginTop: 12 }}>
            <Tag color={driftResult.ok ? 'green' : 'red'}>
              Current: {driftResult.current_replication || '—'} | Desired: {driftResult.desired_replication || '—'}
              {driftResult.drifted ? ' — DRIFT DETECTED' : ' — OK'}
            </Tag>
            <span style={{ marginLeft: 8, color: '#64748b' }}>{driftResult.total_volumes} volumes</span>
          </div>
        )}
      </Card>
    </div>
  )
}
