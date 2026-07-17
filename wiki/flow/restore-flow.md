# Restore Flow

## Overview

The restore operation takes a previously created backup (a `.tar.gz` archive of the filer's LevelDB metadata) and pushes it back to the filer nodes, overwriting the current filer database. This is a **destructive operation** — the current filer metadata is fully replaced. After restore, the filer service must be manually restarted for changes to take effect.

The filer LevelDB contains only metadata (file names, paths, sizes, permissions, directory structure). File content resides on volume servers and is not affected by this operation. After a restore and filer restart, the filer reconnects to existing volumes and rebuilds its metadata-to-volume mappings.

## Restore Sequence

```mermaid
sequenceDiagram
    actor U as 👤 Admin User
    participant FP as Frontend (Backup Page)
    participant AX as Axios (+ X-API-Key)
    participant AM as Auth Middleware
    participant BR as Backup Route
    participant BS as Backup Service
    participant SS as Settings Service
    participant FS as Local FS (/srv/seaweed-backups/)
    participant SSH as SSH (paramiko)
    participant F102 as Filer Node .102
    participant F104 as Filer Node .104

    Note over U,F104: === INITIATE RESTORE ===

    U->>FP: Clicks "Restore" on a backup snapshot
    FP->>FP: Show confirmation modal
    Note over FP: ⚠️ Warning: "This will overwrite the Filer database!"
    Note over FP: "After restore, restart filer service manually."

    U->>FP: Confirms restore
    FP->>AX: POST /api/backup/restore/{name}<br/>Header: X-API-Key: bkp_...
    AX->>AM: Request intercepted
    AM->>AM: X-API-Key detected → validate_api_key()
    AM->>AM: Set role=backup_admin, permissions=[...]
    AM->>BR: Forward (check require_permission("backup:write"))
    BR->>BS: restore_backup(name="backup-20260717_143052")

    Note over BS,FS: === VALIDATION ===

    BS->>SS: get_setting("backup_enabled", "true")
    SS-->>BS: "true"

    alt Backup disabled
        BS-->>BR: {ok: false, error: "Backup is disabled"}
        BR-->>FP: Error shown
    end

    BS->>BS: backup_file = Path("/srv/seaweed-backups/{name}.tar.gz")
    BS->>FS: Check: does backup_file exist?

    alt File not found
        FS-->>BS: FileNotFoundError
        BS-->>BR: 404 "Backup file not found: backup-20260717_143052"
        BR-->>FP: Error: "Backup file not found"
    end

    Note over BS,F104: === CONFIG LOOKUP ===

    BS->>SS: get_setting("seaweedfs_filer_host", "...")
    SS-->>BS: "10.10.95.102:8888,10.10.95.104:8888"
    BS->>BS: filer_hosts = ["10.10.95.102", "10.10.95.104"]

    BS->>SS: get_setting("backup_filer_db_path", "/data/dc03/filer/filerldb2")
    SS-->>BS: "/data/dc03/filer/filerldb2"

    Note over BS,F104: === RESTORE TO PRIMARY FILER ONLY ===

    Note over BS: Only first filer host (filer_hosts[:1]) is used.
    Note over BS: Rest of loop iterates but only .102 is processed.

    BS->>FS: Read backup file: /srv/seaweed-backups/backup-20260717_143052.tar.gz
    FS-->>BS: File ready (512 MB)

    BS->>SSH: _sftp_push(.102, local_file, "/tmp/filer-restore-backup-20260717_143052.tar.gz")
    SSH->>F102: SFTP PUT (upload archive to filer)
    F102-->>SSH: transfer complete

    alt SFTP upload fails
        SSH-->>BS: ok=False, error="Connection refused"
        BS->>BS: results[".102"] = "Connection refused"
        BS->>BS: error_msg accumulated
    else SFTP upload succeeds
        SSH-->>BS: ok=True

        Note over BS,F102: Extract archive into LevelDB directory

        BS->>SSH: _ssh_exec(.102, "tar xzf /tmp/filer-restore-...tar.gz -C /data/dc03/filer/filerldb2/.. && rm -f /tmp/filer-restore-...tar.gz")
        SSH->>F102: Run tar extract command
        Note over F102: tar xzf overwrites existing LevelDB files
        F102-->>SSH: exit_code=0 (success)

        alt Extract fails
            SSH-->>BS: exit_code != 0, stderr: "tar: ... No space left on device"
            BS->>BS: results[".102"] = "Extract failed: No space left..."
            BS->>BS: error_msg accumulated
        else Extract succeeds
            BS->>BS: results[".102"] = "ok"
          end
    end

    Note over BS,F104: === RESULT ===

    alt All processed hosts succeeded
        BS-->>BR: {ok: true, results: {".102": "ok"}, name: "backup-20260717_143052"}
        BR-->>FP: 200 {ok: true, results: {...}}
        FP->>U: Success toast + warning banner
    else Host(s) failed
        BS-->>BR: {ok: false, results: {...}, error_details}
        BR-->>FP: 200 {ok: false, ...}
        FP->>U: Error toast with details
    end

    Note over U,F104: === MANUAL STEP REQUIRED ===

    FP->>U: ⚠️ "Restore complete. You MUST restart filer service on both nodes!"
    Note over U: ssh root@10.10.95.102
    Note over U: systemctl restart seaweed-filer
    Note over U: ssh root@10.10.95.104
    Note over U: systemctl restart seaweed-filer

    Note over F102,F104: Filer restarts, reads restored LevelDB
    Note over F102,F104: Filer reconnects to volume servers
    Note over F102,F104: Metadata-to-volume mappings rebuilt automatically
```

## Why Only the Primary Filer?

The restore logic (`restore_backup` in `backup_service.py`) restores to **only the first filer host** (`filer_hosts[:1]`). This is because:

1. Both filer nodes (`10.10.95.102` and `10.10.95.104`) are in an HA group (`ha`, `filerGroup=ha`)
2. They synchronize metadata via gRPC peer sync on port `18888`
3. After restoring one node and restarting both, the peer sync replicates the restored data to the other node

## Why Filer Restart is Required

The filer reads its LevelDB database at startup and keeps it in memory (with periodic flushes). Simply overwriting the LevelDB files on disk while the filer is running:

1. Does not reload the in-memory data structures
2. May cause corruption if the filer writes to the database concurrently
3. Leaves stale in-memory state that contradicts the new on-disk state

After a restart (`systemctl restart seaweed-filer`), the filer:
1. Reads the restored LevelDB from disk
2. Loads all file/directory metadata into memory
3. Reconnects to the volume servers to rebuild chunk-to-volume mappings
4. Resumes normal operation with the restored metadata

## Why Metadata-Only Restore Works

The filer LevelDB stores **metadata only**:

| Stored in LevelDB | NOT stored in LevelDB |
|---|---|
| File names and paths | File content (bytes) |
| File sizes | Chunk data |
| Permissions and owners | Volume-to-chunk mappings (built at runtime) |
| Timestamps (mtime, ctime) | |
| Directory structure | |
| Extended attributes | |

When the filer restarts with restored metadata, it:
1. Scans the volume servers it knows about (`weed filer -peers` or master-announced)
2. Finds which volumes hold which file chunks
3. Rebuilds the in-memory mapping that routes file requests to the correct volume servers

This means file content is never lost during a filer restore — it stays on the volume servers. The restore only recovers the "index" (metadata) that tells the filer where everything is.

## Restore Confirmation (Frontend)

```mermaid
sequenceDiagram
    actor U as 👤 Admin
    participant FP as Backup Page
    participant M as Restore Modal

    U->>FP: Clicks "Restore" on a backup row
    FP->>M: Open confirmation modal

    Note over M: Title: ⚠️ Restore Backup
    Note over M: Alert (warning): "This will overwrite the Filer database!"
    Note over M: Body: "Restoring backup 'backup-20260717_143052'"
    Note over M: Body: "Current filer data will be replaced."
    Note over M: Footer: "After restore, restart filer service on both nodes."

    U->>M: Clicks "Restore Now" (danger button)
    M->>FP: doRestore() called
    FP->>FP: POST /api/backup/restore/{name}

    alt Restore succeeds
        FP->>U: ✅ "Restore initiated"
        FP->>U: ⚠️ "WARNING: Filer will be overwritten. Restart filer service after restore."
    else Restore fails
        FP->>U: ❌ Error message from backend
    end
```

The confirmation modal uses Ant Design's `Modal` with:
- `okButtonProps={{ danger: true }}` — red danger button to emphasize destructive action
- `ExclamationCircleOutlined` icon for visual warning
- Explicit mention of the filer restart requirement

## Error Handling

| Failure Point | Behavior |
|---|---|
| Backup file missing | `FileNotFoundError` → HTTP `404` "Backup file not found: {name}" |
| `backup_enabled` is false | Returns `{ok: false, error: "Backup is disabled"}` |
| SFTP upload fails | Host marked as failed in results. Error message recorded. |
| `tar xzf` fails (disk full, permissions) | `RuntimeError("Extract failed: ...")` with stderr excerpt |
| SSH connection fails | Host marked as failed. Error message recorded. |
| All filers fail | `ok: false` returned with aggregated error messages |

## Full Filer Restore Procedure (Operator Checklist)

1. **Pre-flight**: Verify backup file exists: `ls -lh /srv/seaweed-backups/{name}.tar.gz`
2. **Dashboard**: Navigate to Backup page, click Restore on desired snapshot
3. **Confirm**: Read warning, click "Restore Now"
4. **Wait**: SFTP upload + extract typically takes 1-5 minutes depending on DB size
5. **Restart filers**:
   ```bash
   ssh root@10.10.95.102 systemctl restart seaweed-filer
   ssh root@10.10.95.104 systemctl restart seaweed-filer
   ```
6. **Verify**: Check filer is responding:
   ```bash
   curl -s http://10.10.95.102:8888/ | head
   ```
7. **Monitor**: Watch filer logs for peer sync and volume reconnection:
   ```bash
   ssh root@10.10.95.102 journalctl -u seaweed-filer -f
   ```
