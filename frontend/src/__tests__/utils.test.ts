import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('API service utilities', () => {
  it('builds query params correctly', () => {
    function buildQuery(params: Record<string, string | number | undefined>): string {
      return Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    }
    const qs = buildQuery({ status: 'new', limit: 10, empty: undefined, blank: '' })
    expect(qs).toContain('status=new')
    expect(qs).toContain('limit=10')
    expect(qs).not.toContain('empty')
    expect(qs).not.toContain('blank')
  })

  it('handles empty params', () => {
    function buildQuery(params: Record<string, string | number | undefined>): string {
      return Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    }
    expect(buildQuery({})).toBe('')
  })
})

describe('Role-based access', () => {
  it('admin can do everything', () => {
    const allowedFor = (role: string, action: string): boolean => {
      const permissions: Record<string, string[]> = {
        admin: ['create', 'delete', 'update', 'view', 'manage'],
        viewer: ['view'],
      }
      return (permissions[role] || []).includes(action)
    }
    expect(allowedFor('admin', 'create')).toBe(true)
    expect(allowedFor('admin', 'delete')).toBe(true)
    expect(allowedFor('admin', 'manage')).toBe(true)
  })

  it('viewer can only view', () => {
    const allowedFor = (role: string, action: string): boolean => {
      const permissions: Record<string, string[]> = {
        admin: ['create', 'delete', 'update', 'view', 'manage'],
        viewer: ['view'],
      }
      return (permissions[role] || []).includes(action)
    }
    expect(allowedFor('viewer', 'view')).toBe(true)
    expect(allowedFor('viewer', 'create')).toBe(false)
    expect(allowedFor('viewer', 'delete')).toBe(false)
  })
})

describe('Alert severity levels', () => {
  it('maps severity to antd badge status', () => {
    function severityBadge(severity: string): 'success' | 'warning' | 'error' | 'processing' | 'default' {
      const map: Record<string, 'success' | 'warning' | 'error' | 'processing' | 'default'> = {
        info: 'processing',
        warning: 'warning',
        critical: 'error',
      }
      return map[severity] || 'default'
    }
    expect(severityBadge('critical')).toBe('error')
    expect(severityBadge('warning')).toBe('warning')
    expect(severityBadge('info')).toBe('processing')
    expect(severityBadge('unknown')).toBe('default')
  })
})

describe('Lifecycle TTL parser', () => {
  function parseTTL(ttl: string): number {
    const match = ttl.match(/^(\d+)(d|h|m)$/)
    if (!match) return 0
    const num = parseInt(match[1])
    const unit = match[2]
    switch (unit) {
      case 'd': return num * 86400
      case 'h': return num * 3600
      case 'm': return num * 60
      default: return 0
    }
  }

  it('parses days', () => { expect(parseTTL('30d')).toBe(2592000) })
  it('parses hours', () => { expect(parseTTL('24h')).toBe(86400) })
  it('parses minutes', () => { expect(parseTTL('5m')).toBe(300) })
  it('rejects invalid', () => { expect(parseTTL('abc')).toBe(0) })
  it('handles empty', () => { expect(parseTTL('')).toBe(0) })
})

describe('NFS options validator', () => {
  it('validates basic options', () => {
    function isValidNfsOptions(opts: string): boolean {
      return /\*\(.*\)/.test(opts.trim())
    }
    expect(isValidNfsOptions('*(rw,sync,no_subtree_check)')).toBe(true)
    expect(isValidNfsOptions('*(ro,sync)')).toBe(true)
    expect(isValidNfsOptions('bad-options')).toBe(false)
    expect(isValidNfsOptions('')).toBe(false)
  })
})

describe('Backup status formatter', () => {
  it('formats bytes to human readable', () => {
    function formatBytes(bytes: number): string {
      if (!bytes || bytes < 0) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
      return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
    }
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-5)).toBe('0 B')
    expect(formatBytes(512)).toBe('512.0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1073741824)).toBe('1.0 GB')
  })
})

describe('Disk health thresholds', () => {
  it('classifies disk wear', () => {
    function classifyWear(pct: number): 'ok' | 'warning' | 'critical' {
      if (pct >= 90) return 'critical'
      if (pct >= 80) return 'warning'
      return 'ok'
    }
    expect(classifyWear(50)).toBe('ok')
    expect(classifyWear(85)).toBe('warning')
    expect(classifyWear(95)).toBe('critical')
    expect(classifyWear(80)).toBe('warning')
    expect(classifyWear(89)).toBe('warning')
  })

  it('classifies temperature', () => {
    function classifyTemp(c: number): 'ok' | 'warning' | 'critical' {
      if (c >= 65) return 'critical'
      if (c >= 55) return 'warning'
      return 'ok'
    }
    expect(classifyTemp(40)).toBe('ok')
    expect(classifyTemp(58)).toBe('warning')
    expect(classifyTemp(70)).toBe('critical')
  })
})

describe('IP address validation', () => {
  it('validates IPv4 addresses', () => {
    function isValidIP(ip: string): boolean {
      const parts = ip.split('.')
      if (parts.length !== 4) return false
      return parts.every(p => {
        const n = parseInt(p)
        return n >= 0 && n <= 255 && String(n) === p
      })
    }
    expect(isValidIP('172.16.0.1')).toBe(true)
    expect(isValidIP('0.0.0.0')).toBe(true)
    expect(isValidIP('256.0.0.1')).toBe(false)
    expect(isValidIP('abc.def.ghi.jkl')).toBe(false)
    expect(isValidIP('10.10.95')).toBe(false)
    expect(isValidIP('')).toBe(false)
  })
})

describe('Time ago formatter', () => {
  it('converts seconds to human readable', () => {
    function timeAgo(seconds: number): string {
      if (seconds < 60) return '< 1m'
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
      return `${Math.floor(seconds / 86400)}d ago`
    }
    expect(timeAgo(30)).toBe('< 1m')
    expect(timeAgo(120)).toBe('2m ago')
    expect(timeAgo(7200)).toBe('2h ago')
    expect(timeAgo(172800)).toBe('2d ago')
  })
})
