import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, Input, Select, Button, Space, Tag, Spin, Empty, Switch, Badge, Tooltip } from 'antd'
import { SearchOutlined, ReloadOutlined, PauseCircleOutlined, CaretRightOutlined, WarningOutlined, InfoCircleOutlined, BugOutlined, FileTextOutlined } from '@ant-design/icons'
import { queryLokiLogs, getLokiLabels, getLokiLabelValues, getLokiStatus } from '../../services/api'
import type { LokiStream, LokiLogEntry } from '../../types'

const LEVEL_COLORS: Record<string, string> = { error: '#ef4444', warn: '#f59e0b', info: '#3b82f6', debug: '#64748b' }
const LEVEL_PATTERNS: Record<string, RegExp> = {
  error: /error|err |fatal|critical|panic/i,
  warn: /warn|warning/i,
  debug: /debug|trace/i,
}

function detectLevel(line: string): string {
  for (const [level, pattern] of Object.entries(LEVEL_PATTERNS)) {
    if (pattern.test(line)) return level
  }
  return 'info'
}

function formatLogTime(ts: string): string {
  try {
    const ns = parseInt(ts)
    const ms = Math.floor(ns / 1000000)
    return new Date(ms).toLocaleTimeString()
  } catch { return ts }
}

function formatLogLine(line: string): { json: Record<string, unknown> | null; text: string } {
  try {
    const parsed = JSON.parse(line)
    if (typeof parsed === 'object' && parsed !== null) {
      return { json: parsed, text: line }
    }
  } catch {}
  return { json: null, text: line }
}

const TIME_PRESETS = [
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
]

function timeAgo(duration: string): number {
  const d = parseInt(duration)
  const unit = duration.replace(d.toString(), '')
  const multipliers: Record<string, number> = { m: 60, h: 3600 }
  return d * (multipliers[unit] || 60)
}

export default function LogsPage() {
  const [lokiOk, setLokiOk] = useState<boolean | null>(null)
  const [query, setQuery] = useState('{job=~".+"}')
  const [timeRange, setTimeRange] = useState('1h')
  const [limit, setLimit] = useState(500)
  const [results, setResults] = useState<LokiStream[]>([])
  const [loading, setLoading] = useState(false)
  const [labels, setLabels] = useState<string[]>([])
  const [labelValues, setLabelValues] = useState<Record<string, string[]>>({})
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({})
  const [tailing, setTailing] = useState(false)
  const [filterLevel, setFilterLevel] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getLokiStatus().then(r => setLokiOk(r.ok)).catch(() => setLokiOk(false))
    getLokiLabels().then(setLabels).catch(() => {})
  }, [])

  const fetchLabelValues = useCallback(async (label: string) => {
    if (labelValues[label]) return
    try {
      const vals = await getLokiLabelValues(label)
      setLabelValues(prev => ({ ...prev, [label]: vals }))
    } catch {}
  }, [labelValues])

  useEffect(() => {
    labels.forEach(fetchLabelValues)
  }, [labels, fetchLabelValues])

  const buildQuery = (): string => {
    const selectors = Object.entries(selectedLabels)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}="${v}"`)
      .join(', ')
    if (selectors) return `{${selectors}}`
    return query || '{job=~".+"}'
  }

  const fetchLogs = useCallback(async () => {
    if (lokiOk === false) return
    setLoading(true)
    try {
      const now = Math.floor(Date.now()) * 1000000
      const start = (now - timeAgo(timeRange) * 1000000000).toString()
      const data = await queryLokiLogs(buildQuery(), start, now.toString(), limit)
      setResults(data.result || [])
    } catch {}
    setLoading(false)
  }, [lokiOk, query, timeRange, limit, selectedLabels])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (!tailing) return
    const interval = setInterval(fetchLogs, 3000)
    return () => clearInterval(interval)
  }, [tailing, fetchLogs])

  useEffect(() => {
    if (tailing && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [results, tailing])

  const entries: LokiLogEntry[] = results.flatMap(stream =>
    stream.values.map(([ts, line]) => ({
      timestamp: ts, line, labels: stream.stream,
    }))
  )

  const filtered = filterLevel
    ? entries.filter(e => detectLevel(e.line) === filterLevel)
    : entries

  const counts = { error: 0, warn: 0, info: 0, debug: 0 }
  entries.forEach(e => { counts[detectLevel(e.line) as keyof typeof counts]++ })

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Badge status={lokiOk === null ? 'processing' : lokiOk ? 'success' : 'error'} text={lokiOk === null ? 'Checking...' : lokiOk ? 'Connected' : 'Offline'} />
          <Button icon={<ReloadOutlined />} size="small" onClick={fetchLogs} loading={loading}>Refresh</Button>
          <Switch
            checkedChildren={<><PauseCircleOutlined /> Tail</>}
            unCheckedChildren={<><CaretRightOutlined /> Tail</>}
            checked={tailing}
            onChange={setTailing}
          />
        </Space>
      </Card>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap style={{ width: '100%' }}>
          <Input
            prefix={<SearchOutlined />}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onPressEnter={fetchLogs}
            placeholder={'LogQL query, e.g. {job="seaweed-master"}'}
            style={{ minWidth: 300, flex: 1 }}
            allowClear
          />
          <Select value={timeRange} onChange={setTimeRange} options={TIME_PRESETS} style={{ width: 90 }} />
          <Select value={limit} onChange={setLimit} options={[100, 500, 1000, 5000].map(v => ({ value: v, label: `${v}` }))} style={{ width: 80 }} />
          <Button type="primary" icon={<SearchOutlined />} onClick={fetchLogs}>Search</Button>
        </Space>
        {labels.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <Space wrap size={4}>
              {labels.map(label => (
                <Tooltip key={label} title={labelValues[label]?.slice(0, 10).join(', ') || 'Loading...'}>
                  <Tag
                    style={{ cursor: 'pointer' }}
                    color={selectedLabels[label] ? 'purple' : 'default'}
                    onClick={() => {
                      if (selectedLabels[label]) {
                        const next = { ...selectedLabels }
                        delete next[label]
                        setSelectedLabels(next)
                      } else {
                        fetchLabelValues(label)
                        setSelectedLabels(prev => ({ ...prev, [label]: '' }))
                      }
                    }}
                  >
                    {label}{selectedLabels[label] ? `=${selectedLabels[label]}` : ''}
                  </Tag>
                </Tooltip>
              ))}
            </Space>
            {Object.keys(selectedLabels).length > 0 && (
              <div style={{ marginTop: 8 }}>
                {Object.entries(selectedLabels).map(([label, val]) => (
                  val !== undefined ? (
                    <Select
                      key={label}
                      value={val}
                      onChange={v => setSelectedLabels(prev => ({ ...prev, [label]: v }))}
                      placeholder={`${label}=`}
                      style={{ width: 160, marginRight: 8, marginBottom: 4 }}
                      options={(labelValues[label] || []).map(v => ({ value: v, label: v }))}
                      allowClear
                      showSearch
                    />
                  ) : null
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          {(['error', 'warn', 'info', 'debug'] as const).map(level => (
            <Tag
              key={level}
              color={filterLevel === level ? LEVEL_COLORS[level] : 'default'}
              style={{ cursor: 'pointer' }}
              onClick={() => setFilterLevel(filterLevel === level ? null : level)}
            >
              {level.toUpperCase()} ({counts[level]})
            </Tag>
          ))}
          <Button size="small" onClick={() => setFilterLevel(null)}>Clear</Button>
        </Space>
      </Card>

      <Card ref={containerRef} style={{ maxHeight: 500, overflow: 'auto' }}>
        <Spin spinning={loading}>
          {filtered.length > 0 ? (
            <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: '20px' }}>
              {filtered.map((entry, i) => {
                const level = detectLevel(entry.line)
                const { json, text } = formatLogLine(entry.line)
                const isExpanded = expanded === i
                return (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    style={{
                      borderBottom: '1px solid rgba(148,163,184,0.08)',
                      padding: '2px 0',
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(168,85,247,0.06)' : 'transparent',
                    }}
                    onClick={() => setExpanded(isExpanded ? null : i)}
                  >
                    <Space size={4}>
                      <span style={{ color: '#475569' }}>{formatLogTime(entry.timestamp)}</span>
                      {(() => {
                        const ico = level === 'error' ? <BugOutlined /> : level === 'warn' ? <WarningOutlined /> : level === 'debug' ? <FileTextOutlined /> : <InfoCircleOutlined />
                        return <span style={{ color: LEVEL_COLORS[level] }}>{ico}</span>
                      })()}
                      <span style={{ color: '#e2e8f0' }}>{json ? (json.event || json.message || text) as string : text}</span>
                    </Space>
                    {isExpanded && json && (
                      <pre style={{ margin: '4px 0 4px 24px', padding: 8, background: '#1e293b', borderRadius: 4, fontSize: 11, color: '#94a3b8', maxHeight: 200, overflow: 'auto' }}>
                        {JSON.stringify(json, null, 2)}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty description={lokiOk === false ? 'Loki not reachable. Check settings.' : 'No logs. Try a different query.'} />
          )}
        </Spin>
      </Card>
    </div>
  )
}
