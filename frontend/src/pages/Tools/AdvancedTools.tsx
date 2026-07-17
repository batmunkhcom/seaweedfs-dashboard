import { useState } from 'react'
import { Card, Button, Input, Tag, Space, message, Row, Col, Typography, InputNumber } from 'antd'
import {
  GlobalOutlined, SendOutlined, ApiOutlined, SafetyOutlined,
  CloudServerOutlined, ClockCircleOutlined, FileTextOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import api from '../../services/api'

const { Text } = Typography

export default function AdvancedTools() {
  const [dnsHost, setDnsHost] = useState('')
  const [dnsResult, setDnsResult] = useState<{ ok: boolean; host: string; output: string } | null>(null)
  const [dnsLoading, setDnsLoading] = useState(false)

  const [portHost, setPortHost] = useState('')
  const [portNum, setPortNum] = useState<number | null>(443)
  const [portResult, setPortResult] = useState<{ ok: boolean; host: string; port: number; open: boolean; latency_ms: number } | null>(null)
  const [portLoading, setPortLoading] = useState(false)

  const [httpUrl, setHttpUrl] = useState('')
  const [httpResult, setHttpResult] = useState<{ ok: boolean; url: string; status?: number; latency_ms?: number; headers?: Record<string, string>; error?: string } | null>(null)
  const [httpLoading, setHttpLoading] = useState(false)

  const [sslHost, setSslHost] = useState('')
  const [sslPort, setSslPort] = useState<number | null>(443)
  const [sslResult, setSslResult] = useState<{ ok: boolean; host: string; port: number; cn: string; expires: string; verified: boolean; output: string } | null>(null)
  const [sslLoading, setSslLoading] = useState(false)

  const [sysHost, setSysHost] = useState('')
  const [sysResult, setSysResult] = useState<{ ok: boolean; host: string; output: string } | null>(null)
  const [sysLoading, setSysLoading] = useState(false)

  const [uptimeHost, setUptimeHost] = useState('')
  const [uptimeResult, setUptimeResult] = useState<{ ok: boolean; host: string; output: string } | null>(null)
  const [uptimeLoading, setUptimeLoading] = useState(false)

  const [logHost, setLogHost] = useState('')
  const [logResult, setLogResult] = useState<{ ok: boolean; host: string; output: string } | null>(null)
  const [logLoading, setLogLoading] = useState(false)

  const handleDns = async () => {
    const h = dnsHost.trim(); if (!h) return
    setDnsLoading(true); setDnsResult(null)
    try { const { data } = await api.post('/tools/dns-resolve', { host: h }); setDnsResult(data) }
    catch { message.error('DNS query failed') }
    setDnsLoading(false)
  }

  const handlePort = async () => {
    const h = portHost.trim(); if (!h || !portNum) return
    setPortLoading(true); setPortResult(null)
    try { const { data } = await api.post('/tools/port-check', { host: h, port: portNum }); setPortResult(data) }
    catch { message.error('Port check failed') }
    setPortLoading(false)
  }

  const handleHttp = async () => {
    const u = httpUrl.trim(); if (!u) return
    setHttpLoading(true); setHttpResult(null)
    try { const { data } = await api.post('/tools/http-head', { url: u }); setHttpResult(data) }
    catch { message.error('HTTP check failed') }
    setHttpLoading(false)
  }

  const handleSsl = async () => {
    const h = sslHost.trim(); if (!h || !sslPort) return
    setSslLoading(true); setSslResult(null)
    try { const { data } = await api.post('/tools/ssl-check', { host: h, port: sslPort }); setSslResult(data) }
    catch { message.error('SSL check failed') }
    setSslLoading(false)
  }

  const handleSystem = async () => {
    const h = sysHost.trim(); if (!h) return
    setSysLoading(true); setSysResult(null)
    try { const { data } = await api.post('/tools/system-info', { host: h }); setSysResult(data) }
    catch { message.error('SSH failed') }
    setSysLoading(false)
  }

  const handleUptime = async () => {
    const h = uptimeHost.trim(); if (!h) return
    setUptimeLoading(true); setUptimeResult(null)
    try { const { data } = await api.post('/tools/service-uptime', { host: h }); setUptimeResult(data) }
    catch { message.error('SSH failed') }
    setUptimeLoading(false)
  }

  const handleLogs = async () => {
    const h = logHost.trim(); if (!h) return
    setLogLoading(true); setLogResult(null)
    try { const { data } = await api.post('/tools/logs-tail', { host: h }); setLogResult(data) }
    catch { message.error('SSH failed') }
    setLogLoading(false)
  }

  return (
    <>
      <Card title={<><GlobalOutlined /> DNS & Network</>} style={{ marginTop: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12}>
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="Hostname (e.g. google.com)" value={dnsHost} onChange={(e) => setDnsHost(e.target.value)} onPressEnter={handleDns} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
              <Button icon={dnsLoading ? <LoadingOutlined /> : <GlobalOutlined />} loading={dnsLoading} onClick={handleDns}>DNS</Button>
            </Space.Compact>
            {dnsResult && <pre style={{ margin: '6px 0 0', padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>{dnsResult.output}</pre>}
          </Col>
          <Col xs={24} sm={12}>
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="Host" value={portHost} onChange={(e) => setPortHost(e.target.value)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, width: '40%' }} />
              <InputNumber placeholder="Port" value={portNum} onChange={(v) => setPortNum(v)} min={1} max={65535} style={{ width: 90 }} />
              <Button icon={portLoading ? <LoadingOutlined /> : <ApiOutlined />} loading={portLoading} onClick={handlePort} disabled={!portHost.trim() || !portNum}>Port</Button>
            </Space.Compact>
            {portResult && <div style={{ marginTop: 6 }}><Tag color={portResult.open ? 'success' : 'error'}>{portResult.open ? `Open · ${portResult.latency_ms}ms` : 'Closed'}</Tag></div>}
          </Col>
        </Row>
      </Card>

      <Card title={<><ApiOutlined /> HTTP & SSL</>} style={{ marginTop: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12}>
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="https://example.com" value={httpUrl} onChange={(e) => setHttpUrl(e.target.value)} onPressEnter={handleHttp} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
              <Button icon={httpLoading ? <LoadingOutlined /> : <SendOutlined />} loading={httpLoading} onClick={handleHttp}>HEAD</Button>
            </Space.Compact>
            {httpResult && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
                {(httpResult as any).error ? <Tag color="error">{(httpResult as any).error}</Tag> : (
                  <Space size={[4, 4]} wrap>
                    <Tag color={httpResult.status && httpResult.status < 400 ? 'success' : 'error'}>Status {httpResult.status}</Tag>
                    <Tag>{httpResult.latency_ms}ms</Tag>
                    {httpResult.headers && Object.entries(httpResult.headers).slice(0, 4).map(([k, v]) => <Text key={k} code style={{ fontSize: 10 }}>{k}: {v}</Text>)}
                  </Space>
                )}
              </div>
            )}
          </Col>
          <Col xs={24} sm={12}>
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="Host" value={sslHost} onChange={(e) => setSslHost(e.target.value)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, width: '40%' }} />
              <InputNumber placeholder="443" value={sslPort} onChange={(v) => setSslPort(v)} min={1} max={65535} style={{ width: 90 }} />
              <Button icon={sslLoading ? <LoadingOutlined /> : <SafetyOutlined />} loading={sslLoading} onClick={handleSsl} disabled={!sslHost.trim() || !sslPort}>SSL</Button>
            </Space.Compact>
            {sslResult && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
                <Space size={[4, 4]} wrap>
                  <Tag color={sslResult.verified ? 'success' : 'error'}>{sslResult.verified ? 'Verified' : 'Failed'}</Tag>
                  {sslResult.cn && <Text code style={{ fontSize: 10 }}>CN: {sslResult.cn}</Text>}
                  {sslResult.expires && <Text type="secondary" style={{ fontSize: 10 }}>Exp: {sslResult.expires}</Text>}
                </Space>
              </div>
            )}
          </Col>
        </Row>
      </Card>

      <Card title={<><CloudServerOutlined /> System Access (SSH)</>} style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Requires SSH key access to cluster nodes. Uses the same credentials as Disk Health.</Text>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8}>
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="Node IP" value={sysHost} onChange={(e) => setSysHost(e.target.value)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
              <Button icon={sysLoading ? <LoadingOutlined /> : <CloudServerOutlined />} loading={sysLoading} onClick={handleSystem} disabled={!sysHost.trim()}>Info</Button>
            </Space.Compact>
            {sysResult && <pre style={{ margin: '6px 0 0', padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{sysResult.output}</pre>}
          </Col>
          <Col xs={24} sm={8}>
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="Node IP" value={uptimeHost} onChange={(e) => setUptimeHost(e.target.value)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
              <Button icon={uptimeLoading ? <LoadingOutlined /> : <ClockCircleOutlined />} loading={uptimeLoading} onClick={handleUptime} disabled={!uptimeHost.trim()}>Uptime</Button>
            </Space.Compact>
            {uptimeResult && <pre style={{ margin: '6px 0 0', padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{uptimeResult.output}</pre>}
          </Col>
          <Col xs={24} sm={8}>
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="Node IP" value={logHost} onChange={(e) => setLogHost(e.target.value)} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} />
              <Button icon={logLoading ? <LoadingOutlined /> : <FileTextOutlined />} loading={logLoading} onClick={handleLogs} disabled={!logHost.trim()}>Logs</Button>
            </Space.Compact>
            {logResult && <pre style={{ margin: '6px 0 0', padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#94a3b8', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{logResult.output}</pre>}
          </Col>
        </Row>
      </Card>
    </>
  )
}
