import { Typography, InputNumber, Space, Tag, Switch, Select, Input } from 'antd'

export interface SettingMeta {
  key: string
  label: string
  description: string
  type: 'int' | 'float' | 'string' | 'toggle' | 'select' | 'textarea' | 'password'
  unit?: string
  min?: number
  max?: number
  step?: number
  defaultVal: string
  options?: { value: string; label: string }[]
  rows?: number
}

export const ALERT_SETTINGS: SettingMeta[] = [
  { key: 'alert_disk_usage_pct', label: 'Disk Usage Alert', description: 'Trigger alert when any node disk usage exceeds this percentage', type: 'int', unit: '%', min: 50, max: 99, defaultVal: '90' },
  { key: 'alert_garbage_ratio', label: 'Garbage Ratio Alert', description: 'Trigger alert when volume garbage ratio exceeds this value (0.0–1.0)', type: 'float', min: 0.1, max: 1.0, step: 0.05, defaultVal: '0.5' },
  { key: 'alert_max_readonly_volumes', label: 'Max Read-Only Volumes', description: 'Trigger alert when count of readonly volumes reaches this number', type: 'int', min: 1, max: 100, defaultVal: '3' },
]

export const UPLOAD_SETTINGS: SettingMeta[] = [
  { key: 'max_upload_size_mb', label: 'Max Upload Size', description: 'Maximum file size allowed for uploads (in MB). Set to 0 for unlimited', type: 'int', unit: 'MB', min: 0, max: 102400, defaultVal: '10240' },
  { key: 'allowed_extensions', label: 'Allowed Extensions', description: 'Comma-separated list of allowed file extensions (empty = allow all). Example: .jpg,.png,.pdf', type: 'string', defaultVal: '' },
  { key: 'max_files_per_upload', label: 'Max Files Per Upload', description: 'Maximum number of files allowed in a single batch upload', type: 'int', min: 1, max: 500, defaultVal: '10' },
]

export const SNAPSHOT_SETTINGS: SettingMeta[] = [
  { key: 'snapshot_interval_seconds', label: 'Polling Interval', description: 'How often the dashboard polls SeaweedFS for metrics (seconds)', type: 'int', unit: 'sec', min: 10, max: 3600, defaultVal: '60' },
  { key: 'snapshot_retention_days', label: 'Retention Period', description: 'How long to keep historical snapshot data before auto-cleanup', type: 'int', unit: 'days', min: 1, max: 365, defaultVal: '30' },
]

export const DISK_HEALTH_SETTINGS: SettingMeta[] = [
  { key: 'disk_health_scan_interval_hours', label: 'Scan Interval', description: 'How often to run S.M.A.R.T. disk health scans across all nodes', type: 'int', unit: 'hours', min: 1, max: 168, defaultVal: '24' },
  { key: 'disk_health_temp_warn_c', label: 'Temperature Warning', description: 'S.M.A.R.T. temperature warning threshold (warning alert)', type: 'int', unit: '°C', min: 30, max: 70, defaultVal: '55' },
  { key: 'disk_health_temp_crit_c', label: 'Temperature Critical', description: 'S.M.A.R.T. temperature critical threshold (critical alert)', type: 'int', unit: '°C', min: 35, max: 85, defaultVal: '65' },
  { key: 'disk_health_wear_warn_pct', label: 'SSD Wear Warning', description: 'SSD wear leveling percentage that triggers a warning', type: 'int', unit: '%', min: 50, max: 99, defaultVal: '85' },
  { key: 'disk_health_realloc_warn_count', label: 'Reallocated Sectors', description: 'Number of reallocated sectors that triggers a HDD warning', type: 'int', min: 1, max: 1000, defaultVal: '10' },
]

export const CLUSTER_SETTINGS: SettingMeta[] = [
  { key: 'seaweedfs_request_timeout', label: 'API Request Timeout', description: 'Timeout for SeaweedFS API requests. Increase if cluster is slow to respond', type: 'int', unit: 'sec', min: 5, max: 120, defaultVal: '30' },
]

export const GENERAL_SETTINGS: SettingMeta[] = [
  { key: 'timezone', label: 'Timezone', description: 'System timezone for scheduling, timestamps, and display', type: 'string', defaultVal: 'UTC' },
  { key: 'log_level', label: 'Log Level', description: 'Backend logging level. DEBUG shows most detail, ERROR shows only errors', type: 'string', defaultVal: 'INFO' },
]

export const AI_SETTINGS: SettingMeta[] = [
  { key: 'ai_enabled', label: 'Enable AI', description: 'Toggle AI-powered chatbot and analysis features on/off', type: 'toggle', defaultVal: 'false' },
  { key: 'ai_provider', label: 'AI Provider', description: 'Provider type: OpenAI-compatible API or local Ollama', type: 'select', defaultVal: 'openai', options: [{ value: 'openai', label: 'OpenAI Compatible' }, { value: 'ollama', label: 'Ollama (Local)' }] },
  { key: 'ai_api_base_url', label: 'API Base URL', description: 'Base URL for the AI API endpoint', type: 'string', defaultVal: 'https://api.openai.com/v1' },
  { key: 'ai_api_key', label: 'API Key', description: 'API key for the provider. Leave empty for Ollama if no auth required', type: 'password', defaultVal: '' },
  { key: 'ai_model', label: 'Model', description: 'AI model name. Click Test Connection to fetch available models', type: 'string', defaultVal: 'gpt-4o-mini' },
  { key: 'ai_max_tokens', label: 'Max Response Tokens', description: 'Maximum tokens in AI response', type: 'int', unit: 'tokens', min: 256, max: 32768, defaultVal: '4096' },
  { key: 'ai_temperature', label: 'Temperature', description: 'Response creativity (0.0 = deterministic, 2.0 = very creative)', type: 'float', min: 0, max: 2.0, step: 0.1, defaultVal: '0.7' },
  { key: 'ai_system_prompt', label: 'System Prompt', description: 'Base instructions for the AI. Injected with live cluster context at query time', type: 'textarea', rows: 6, defaultVal: 'You are an AI assistant for a SeaweedFS distributed storage cluster.' },
]

export const AI_EMBEDDING_SETTINGS: SettingMeta[] = [
  { key: 'ai_embedding_provider', label: 'Embedding Provider', description: 'Provider for embeddings. "Same" uses the chat provider above. Separate for cost optimization (e.g. Ollama for free embeddings)', type: 'select', defaultVal: 'same', options: [{ value: 'same', label: 'Same as Chat' }, { value: 'openai', label: 'OpenAI Compatible' }, { value: 'ollama', label: 'Ollama (Local)' }] },
  { key: 'ai_embedding_api_base_url', label: 'Embedding API URL', description: 'Base URL for embedding API. Leave empty to use chat API URL', type: 'string', defaultVal: '' },
  { key: 'ai_embedding_api_key', label: 'Embedding API Key', description: 'API key for embedding provider. Leave empty to use chat API key', type: 'password', defaultVal: '' },
  { key: 'ai_embedding_model', label: 'Embedding Model', description: 'Model for document embedding: text-embedding-3-small (OpenAI) or nomic-embed-text (Ollama)', type: 'string', defaultVal: 'text-embedding-3-small' },
]

interface SettingRowProps {
  meta: SettingMeta
  value: string
  onChange: (val: string) => void
  readonly: boolean
}

export function SettingRow({ meta, value, onChange, readonly }: SettingRowProps) {
  const val = value || meta.defaultVal
  const isDefault = val === meta.defaultVal
  const isModified = value && value !== meta.defaultVal

  const inputNode = readonly ? (
    <Typography.Text strong style={{ minWidth: 120, display: 'inline-block' }}>
      {val}{meta.unit ? ` ${meta.unit}` : ''}
    </Typography.Text>
  ) : meta.type === 'toggle' ? (
    <Switch checked={val === 'true'} onChange={(v) => onChange(v ? 'true' : 'false')} />
  ) : meta.type === 'select' && meta.options ? (
    <Select value={val} onChange={(v) => onChange(v)} style={{ width: 180 }} options={meta.options} />
  ) : meta.type === 'textarea' ? (
    <Input.TextArea
      value={val}
      onChange={(e) => onChange(e.target.value)}
      rows={meta.rows || 4}
      style={{ width: 420, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
    />
  ) : meta.type === 'password' ? (
    <Input.Password
      value={val}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 260 }}
      placeholder="Enter API key..."
    />
  ) : meta.type === 'int' || meta.type === 'float' ? (
    <Space size={4}>
      <InputNumber
        value={parseFloat(val)}
        onChange={(v) => v !== null && onChange(String(v))}
        min={meta.min}
        max={meta.max}
        step={meta.step || (meta.type === 'float' ? 0.05 : 1)}
        style={{ width: 140 }}
        addonAfter={meta.unit}
      />
      {isModified && <Tag color="orange" style={{ marginLeft: 4 }}>modified</Tag>}
    </Space>
  ) : (
    <Input
      value={val}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 320, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
      placeholder={meta.defaultVal}
    />
  )

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      padding: '14px 0',
      borderBottom: '1px solid rgba(168,85,247,0.06)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <Typography.Text strong style={{ fontSize: 14 }}>{meta.label}</Typography.Text>
          {isDefault && !readonly && <Tag color="default" style={{ fontSize: 10 }}>default</Tag>}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{meta.description}</Typography.Text>
        <div style={{ marginTop: 2 }}>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            <code style={{ background: 'rgba(168,85,247,0.08)', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>{meta.key}</code>
            {meta.defaultVal && ` — default: ${meta.defaultVal}${meta.unit ? ` ${meta.unit}` : ''}`}
          </Typography.Text>
        </div>
      </div>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        {inputNode}
      </div>
    </div>
  )
}
