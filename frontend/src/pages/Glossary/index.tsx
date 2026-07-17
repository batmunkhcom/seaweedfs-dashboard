import { Table } from 'antd'

const terms = [
  { term: 'Master', desc: 'Cluster brain — manages topology, volume assignments, Raft consensus. 3 per cluster for HA.' },
  { term: 'Volume', desc: 'Storage unit (~15GB default). Files are split across volumes. Replication copies volumes across nodes.' },
  { term: 'Volume Server', desc: 'Node that stores and serves volumes. Each node runs one volume server (port 8080).' },
  { term: 'Filer', desc: 'POSIX-like file system layer on top of volumes. Supports directory listing, upload, delete, metadata.' },
  { term: 'S3 Gateway', desc: 'Exposes S3-compatible API. Translates S3 operations (ListObjects, GetObject, PutObject) to filer calls.' },
  { term: 'Collection', desc: 'Namespace for grouping volumes. Separate storage pools for different VMs/apps with custom replication.' },
  { term: 'Replication', desc: 'Copy count strategy. 001 = primary + 1 replica (2 copies). 002 = primary + 2 replicas (3 copies).' },
  { term: 'Rack', desc: 'Physical or logical grouping of nodes. Volumes are spread across racks for fault tolerance.' },
  { term: 'Data Center', desc: 'Geographic grouping of racks. Cluster can span multiple DCs. dc03 is our primary.' },
  { term: 'Raft', desc: 'Consensus algorithm used by Masters. Elects a Leader. All writes go through Leader, reads from any.' },
  { term: 'Garbage Collection', desc: 'Process that reclaims storage from deleted/modified files. Vacuum triggers compaction.' },
  { term: 'Vacuum', desc: 'Forces garbage collection on volumes, reclaiming space from deleted files. Run when garbage ratio is high.' },
  { term: 'Topology', desc: 'Visual tree representing DC → Rack → Node hierarchy. Shows volume distribution across the cluster.' },
  { term: 'BFF', desc: 'Backend For Frontend — Dashboard backend that proxies and aggregates SeaweedFS APIs with auth, failover, caching.' },
  { term: 'SSE', desc: 'Server-Sent Events — one-way push from server to browser. Used for real-time cluster metric updates without polling.' },
  { term: 'IAM', desc: 'Identity and Access Management — S3 user, key, and policy management. Controls who can access which buckets.' },
  { term: 'Bucket', desc: 'S3 container for objects (files). Each user gets user-{username} bucket. Quota can be set per bucket.' },
  { term: 'Volume Grow', desc: 'Create new volumes. Parameters: count, collection, replication, DC, rack. Auto-assigned to available servers.' },
  { term: 'Quota', desc: 'Storage limit. Can be set at bucket level (S3) or directory level (Filer). Prevents runaway usage.' },
  { term: 'WebDAV', desc: 'HTTP-based file access protocol. Can mount SeaweedFS filer as a network drive on any OS.' },
  { term: 'FUSE', desc: 'Filesystem in Userspace — mount SeaweedFS as a local filesystem on Linux. Lower level than WebDAV, better performance.' },
  { term: 'Replication Strategy', desc: 'How copies are placed. 001 = same DC different racks. 002 = 2 replicas across different nodes.' },
  { term: 'Heartbeat', desc: 'Volume servers ping Master every few seconds to report health. Missing heartbeats trigger alerts.' },
  { term: 'ReadOnly Volume', desc: 'Volume marked read-only (usually disk full). New writes go elsewhere. Treat as warning — needs attention.' },
  { term: 'S.M.A.R.T.', desc: 'Self-Monitoring, Analysis and Reporting Technology — disk health data (temperature, wear, errors).' },
  { term: 'Failover', desc: 'Automatic switching to backup Master/Filer/S3 on failure. Dashboard, seaweed client, and FUSE all support it.' },
  { term: 'API Key', desc: 'Key-based authentication (bkp_ prefix) for programmatic access. Permissions scoped per service: backup, filer, s3, workers.' },
  { term: 'SFTP', desc: 'SSH File Transfer Protocol — used by dashboard to pull/push backup files between filer nodes and backup storage.' },
  { term: 'LevelDB', desc: 'Embedded key-value store used by SeaweedFS filer for metadata. Backed up as a complete directory snapshot.' },
  { term: 'Snapshot', desc: 'Full point-in-time backup of Filer LevelDB metadata directory. Stored at /srv/seaweed-backups/ as tar.gz.' },
  { term: 'Backup', desc: 'Process of archiving filer metadata via SSH → tar → SFTP download. Enables disaster recovery for filer database.' },
  { term: 'Restore', desc: 'Reversing a backup: SFTP upload tar.gz → filer node → extract to LevelDB dir → restart filer service.' },
  { term: 'Permission', desc: 'Scoped access control string (e.g. backup:write). API keys and RBAC roles both use permission-based authorization.' },
  { term: 'Usage Tracking', desc: 'Per-key counters: usage_count, last_used_at, last_used_endpoint. Updated by auth middleware on every API key request.' },
  { term: 'HA Group', desc: 'High Availability pair of filer nodes (ha group). Sync LevelDB changes between peers. Only primary filer is restored.' },
  { term: 'IAM Sync', desc: 'Process of pushing S3 users/policies from dashboard SQLite to all S3 Gateway nodes via SSH.' },
  { term: 'Disk Health Scan', desc: 'Scheduled scan (every 24h) using SSH + smartctl to check disk temperature, wear level, and reallocated sectors.' },
  { term: 'SSH Key', desc: 'Private key (~/.ssh/id_rsa) used by dashboard backend to authenticate with cluster nodes for disk health and backup operations.' },
]

const columns = [
  { title: 'Term', dataIndex: 'term', key: 'term', width: 180, render: (v: string) => <strong>{v}</strong> },
  { title: 'Description', dataIndex: 'desc', key: 'desc' },
]

export default function GlossaryPage() {
  return (
    <div>
      <h2>Glossary</h2>
      <Table dataSource={terms} columns={columns} rowKey="term" pagination={{ pageSize: 50 }} size="small" />
    </div>
  )
}
