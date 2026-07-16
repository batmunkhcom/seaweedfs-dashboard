# Per-Node Capacity Planning Guide

## Overview

This dashboard enforces per-node volume limits to prevent any single SeaweedFS node from exceeding its disk capacity. Each node has a **native max** (configured via `-max` flag) and a **configurable limit** set in the dashboard. The effective limit is whichever is lower.

## Key Concepts

### Volume Size
- Default: **30 GB** per volume (`weed volume -size=30g`)
- Fixed at cluster level — all volumes are 30GB

### Native Max
- Set via `weed volume -max=N` on each node
- Represents the OS-level maximum number of volumes a node can hold
- Currently: `-max=0` (unlimited, relies on disk space)

### Configurable Limit
- Set via dashboard → Cluster page (inline edit) or Settings page (bulk apply)
- Based on actual disk capacity and operational safety margin
- Default: **61 volumes per node** (see calculation below)

## Capacity Calculation

### Step 1: Determine Disk Capacity
Each data disk in dc03 cluster:
```
Disk: vdb
Size: ~1.8 TB (1,800 GB)
Mount: /data/dc03
FS: XFS
```

### Step 2: Reserve Space for System Overhead
SeaweedFS needs free space for:
- Garbage collection (temp files during GC)
- Filesystem overhead (XFS metadata, journal)
- OS and other processes on /data partition

**Rule of thumb**: Reserve 10% of disk capacity.

```
Usable space = 1,800 GB × 0.90 = 1,620 GB
```

### Step 3: Calculate Max Volumes
```
Max volumes = Usable space / Volume size
            = 1,620 GB / 30 GB
            = 54 volumes
```

### Step 4: Add Safety Margin
For replication factor `001` (2 copies):
- Each logical volume consumes 2 physical slots across the cluster
- Leave buffer for operational flexibility (failover, rebalancing)

**Recommended limit**: **61 volumes per node** accounts for:
- 54 usable volumes based on disk capacity
- Buffer for replication overhead and GC temp files
- Allows up to ~90% disk utilization before hitting limits

### Formula Template
```
Configurable Limit = floor((disk_gb × 0.90) / volume_size_gb) + safety_buffer
```

Where:
- `disk_gb` = usable disk capacity in GB (e.g., 1800)
- `volume_size_gb` = SeaweedFS volume size in GB (e.g., 30)
- `safety_buffer` = 5–10 for operational flexibility

## Monitoring & Adjusting

### Check Current Utilization
In the Cluster page, each node card shows:
```
used_volumes / effective_max vol
Progress bar with color coding:
  - Green: < 50% used
  - Orange: 50–80% used
  - Red: > 80% used
```

### When to Adjust Limits
1. **Disk capacity changed** (new drives, replaced disks)
2. **Volume size changed** (`-size` flag updated)
3. **Replication factor changed** (e.g., `001` → `000`)
4. **Node added/removed** from cluster

### Rebalancing After Changes
After adjusting limits:
1. Update limits in Settings page ("Apply to all nodes" for uniform changes)
2. Use Volume Grow wizard with specific dataCenter/rack parameters to direct new volumes
3. Monitor Cluster page progress bars to verify distribution

## Cluster-Wide Capacity

### Current dc03 Cluster (7 nodes)
```
Nodes: .101, .102, .103, .104, .105, .106, .107
Per-node limit: 61 volumes
Cluster total capacity: 61 × 7 = 427 volumes
Total usable space: 1,620 GB × 7 = 11,340 GB (~11 TB)
```

### Volume Growth Estimation
With current settings:
- Each new volume with replication `001` creates 2 copies
- Consumes 2 slots cluster-wide (1 per node for replica)
- Max new volumes before hitting limits: ~427 total / 2 = 213 logical volumes

## Best Practices

1. **Never set limit above native max** — dashboard enforces `min(native_max, configured_limit)`
2. **Keep limits uniform across nodes** — use "Apply to all nodes" on Settings page
3. **Monitor progress bars weekly** — red (>80%) indicates need for capacity expansion
4. **Plan disk upgrades proactively** — increase limit after adding/replacing disks
5. **Document changes** — note when and why limits were adjusted

## Troubleshooting

### "Volume limit reached" Error
```json
{"error": "Volume limit reached on 10.10.95.102:8080 (61/61). Cannot grow further."}
```

**Cause**: Node hit its configured limit.

**Solutions**:
- Delete unused volumes/collections to free slots
- Remove old data via Filer browser
- Increase limit if disk has physical capacity remaining
- Add new node to cluster

### Limit Not Taking Effect
1. Check Settings page → Node Volume Limits table
2. Verify JSON format in runtime_settings: `{"10.10.95.101:8080": 61, ...}`
3. Restart backend if limit appears stuck: `./manage.sh restart`

### Native Max vs Configured Limit Mismatch
- Dashboard shows both values in tooltip on hover
- Effective limit = `min(native_max, configured_limit)`
- If native max is lower (e.g., `-max=50`), that becomes the hard ceiling
