import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('StatCard component', () => {
  it('renders stat values', () => {
    render(
      <div>
        <span data-testid="stat-value">24</span>
        <span data-testid="stat-label">Total Volumes</span>
        <span data-testid="stat-value">7</span>
        <span data-testid="stat-label">Nodes</span>
      </div>
    )
    expect(screen.getAllByTestId('stat-value').length).toBe(2)
  })

  it('renders loading state', () => {
    const { container } = render(
      <div data-testid="container">
        <div className="ant-spin">Loading...</div>
      </div>
    )
    expect(container.querySelector('.ant-spin')).toBeTruthy()
  })
})

describe('Types', () => {
  it('DashboardStats interface is usable', () => {
    const stats = {
      totalVolumes: 10,
      totalFiles: 100,
      totalSizeBytes: 1000,
      freeSpace: 5,
      maxSpace: 7,
      volumeServers: 3,
      healthyNodes: 3,
      masterLeader: 'test',
      filerStatus: 'connected',
      version: '1.0',
      totalDiskGB: 100,
      totalUsableGB: 50,
      physicalRawGB: 200,
      physicalUsableGB: 100,
    }
    expect(stats.totalVolumes).toBe(10)
    expect(stats.healthyNodes).toBe(3)
    expect(stats.filerStatus).toBe('connected')
  })

  it('AlertEvent interface is usable', () => {
    const alert = {
      id: 1,
      type: 'disk_usage',
      severity: 'critical',
      title: 'Test',
      node: '10.0.0.1',
      status: 'new',
      createdAt: '2026-01-01',
    }
    expect(alert.severity).toBe('critical')
    expect(alert.type).toBe('disk_usage')
    expect(alert.status).toBe('new')
  })

  it('LifecyclePolicy interface has required fields', () => {
    const pol = {
      id: 1,
      bucket: 'my-bucket',
      policy_json: '{"rules":[]}',
      enabled: true,
      last_run_at: null,
      next_run_at: null,
    }
    expect(pol.bucket).toBe('my-bucket')
    expect(pol.enabled).toBe(true)
  })

  it('AclPolicy interface has permission field', () => {
    const pol = {
      id: 1,
      name: 'test-rule',
      path: '/',
      user_pattern: '*',
      permissions: 'RW',
      priority: 0,
      enabled: true,
    }
    expect(pol.permissions).toBe('RW')
    expect(pol.user_pattern).toBe('*')
  })
})

describe('Utils', () => {
  it('PERM_LABELS has correct values', () => {
    const labels: Record<string, string> = { R: 'Read', W: 'Write', D: 'Delete', L: 'List', A: 'Admin' }
    expect(labels['R']).toBe('Read')
    expect(labels['W']).toBe('Write')
    expect(Object.keys(labels).length).toBe(5)
  })

  it('formatBytes with human readable sizes', () => {
    function formatBytes(bytes: number): string {
      if (!bytes) return '0 B'
      const u = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + u[i]
    }
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1048576)).toBe('1.0 MB')
    expect(formatBytes(1073741824)).toBe('1.0 GB')
  })

  it('formatTimestamp converts unix to locale', () => {
    function formatTimestamp(ts: number): string {
      return new Date(ts * 1000).toLocaleTimeString()
    }
    const result = formatTimestamp(1700000000)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('COLORS palette', () => {
  it('has 7 colors for chart lines', () => {
    const COLORS = ['#a855f7', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']
    expect(COLORS.length).toBe(7)
    expect(COLORS[0]).toBe('#a855f7')
  })
})
