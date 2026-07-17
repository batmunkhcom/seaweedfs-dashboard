# Backup Flow

## Overview

The backup system creates full snapshots of the SeaweedFS Filer's LevelDB metadata database. It connects to filer nodes via SSH, tars the filer database directory, transfers the archive via SFTP to the dashboard server, and records the backup in SQLite. Old backups are automatically cleaned up based on retention settings.

**Important**: Backups capture filer metadata only — file/directory names, paths, sizes, permissions, timestamps, and directory structure. File content is stored separately on volume servers and is not included in filer backups.

## Backup Creation Flow

```mermaid
sequenceDiagram
    actor U as 👤 Admin User
    participant FP as Frontend (Backup Page)
    participant AX as Axios (+ X-API-Key)
    participant AM as Auth Middleware
    participant BR as Backup Route
    participant BS as Backup Service
    participant DB as SQLite (backup_snapshots)
    participant SS as Settings Service
    participant SSH as SSH (paramiko)
    participant F102 as Filer Node .102
    participant F104 as Filer Node .104
    participant FS as Local FS (/srv/seaweed-backups/)

    U->>FP: Enters API key → clicks "Sync Now" or "New Backup"
    FP->>FP: LocalStorage.setItem('backup_api_key', key)

    Note over U,FS: === SYNC NOW (POST /api/backup/sync) ===

    U->>FP: Click "Sync Now"
    FP->>AX: POST /api/backup/sync<br/>Header: X-API-Key: bkp_...
    AX->>AM: Request intercepted
    AM->>AM: X-API-Key detected → validate_api_key()
    AM->>AM: Set role=backup_admin, permissions=[...]
    AM->>BR: Forward (check require_permission("backup:write"))
    BR->>BS: create_backup(name=None)
    BS->>SS: get_setting("backup_enabled", "true")

    alt Backup disabled
        BS-->>BR: {ok: false, error: "Backup is disabled"}
        BR-->>FP: Error shown
    else Backup enabled
        BS->>SS: get_setting("seaweedfs_filer_host", "<default from config>")
        SS-->>BS: "10.10.95.102,10.10.95.104"
        BS->>SS: get_setting("backup_filer_db_path", "/data/dc03/filer/filerldb2")
        SS-->>BS: "/data/dc03/filer/filerldb2"

        Note over BS: Generate backup name: "backup-20260717_143052"
        BS->>FS: mkdir -p /srv/seaweed-backups/

        BS->>DB: INSERT INTO backup_snapshots<br/>(name, s3_key, filer_hosts, status='running', created_at)
        DB-->>BS: sync_id

        Note over BS,FS: === SIZE CHECK (Primary Filer First) ===

        BS->>SSH: _ssh_exec(.102, "du -sb /data/dc03/filer/filerldb2")
        SSH->>F102: SSH connect + exec_command
        F102-->>SSH: stdout: "536870912\n" (approx 512MB)
        SSH-->>BS: total_bytes += 536870912

        Note over BS,FS: === BACKUP FROM PRIMARY FILER ===

        BS->>SSH: _ssh_exec(.102, "tar czf /tmp/filer-backup-20260717_143052.tar.gz -C /data/dc03/filer/filerldb2 .")
        SSH->>F102: tar czf ... (tars LevelDB directory)
        F102-->>SSH: exit_code=0 (success)

        BS->>SSH: _sftp_fetch(.102, "/tmp/filer-backup-20260717_143052.tar.gz", "/srv/seaweed-backups/backup-20260717_143052.tar.gz")
        SSH->>F102: SFTP GET (download archive)
        F102-->>SSH: transfer complete
        SSH-->>BS: ok=True

        BS->>SSH: _ssh_exec(.102, "rm -f /tmp/filer-backup-20260717_143052.tar.gz")
        SSH->>F102: Cleanup temp file
        BS->>BS: results[".102"] = "ok"

        Note over BS,FS: === BACKUP FROM SECONDARY FILER (same archive used) ===

        alt Secondary filer (.104) fails
            BS->>SSH: _ssh_exec(.104, "du -sb ...") → fails
            BS->>BS: results[".104"] = "connection refused"
            BS->>BS: error_msg = "10.10.95.104: connection refused"
        else Secondary filer succeeds
            BS->>SSH: tar + SFTP to same backup file
            BS->>BS: results[".104"] = "ok"
        end

        Note over BS,FS: === STATUS DETERMINATION ===

        alt All filers succeeded AND total_bytes > 0
            BS->>BS: status = "uploaded"
        else Some failed
            BS->>BS: status = "partial"
        else All failed
            BS->>BS: status = "failed"
        end

        BS->>DB: UPDATE backup_snapshots<br/>SET size_bytes, status, created_at WHERE id=?
        DB-->>BS: committed

        BS-->>BR: {ok, syncId, name, s3Key, bytesSynced, results, finishedAt}
        BR-->>FP: Response

        alt ok=true
            FP->>U: Success toast with size
        else ok=false (partial/failed)
            FP->>U: Warning/error toast with details
        end

        Note over BS,FS: === ASYNC CLEANUP ===
        BS->>BS: asyncio.create_task(cleanup_old_backups())
        BS->>SS: get_setting_int("backup_retention_days", 30)
        BS->>DB: SELECT name, s3_key FROM backup_snapshots<br/>WHERE created_at < cutoff AND status='uploaded'
        loop For each expired backup
            BS->>FS: file_path.unlink() (delete .tar.gz)
            BS->>DB: DELETE FROM backup_snapshots WHERE name=?
        end
    end
```

## Status Transitions

```mermaid
stateDiagram-v2
    [*] --> running: Backup initiated<br/>(INSERT INTO backup_snapshots)

    running --> uploaded: All filer hosts succeeded<br/>AND total_bytes > 0
    running --> partial: Some filer hosts failed
    running --> failed: All filer hosts failed<br/>OR total_bytes == 0

    uploaded --> missing: Physical file deleted<br/>from /srv/seaweed-backups/
    partial --> missing: Physical file deleted<br/>from /srv/seaweed-backups/

    uploaded --> [*]: Deleted by retention cleanup<br/>(>30 days) or manual delete
    partial --> [*]: Deleted by retention cleanup or manual delete
    failed --> [*]: Manual delete
    missing --> [*]: Manual delete
```

## Step-by-Step Explanation

### 1. API Key Entry
The user enters their backup API key (format: `bkp_<64-hex-chars>`) on the Backup page. The key is stored in `localStorage` under `backup_api_key`. The Axios request interceptor detects backup-related URLs (`/backup/`) and attaches the `X-API-Key` header automatically.

### 2. Permission Check
The `AuthMiddleware` validates the API key against the `api_keys` table (`is_active=1`), sets `request.state.role = "backup_admin"` and `request.state.permissions` from the key's permissions field. The route uses `Depends(require_permission("backup:write"))` to gate the operation.

### 3. Configuration Lookup
`create_backup()` fetches settings from the `runtime_settings` SQLite table (cached by `settings_service`):
- `backup_enabled` — must be `"true"`, otherwise operation is refused
- `seaweedfs_filer_host` — comma-separated list of filer hosts (defaults from `.env`/`config.py`)
- `backup_filer_db_path` — path to filer LevelDB on each filer node (default: `/data/dc03/filer/filerldb2`)

### 4. Filer Host Resolution
IP addresses are extracted from host strings (e.g., `10.10.95.102:8888` → `10.10.95.102`). SSH connections are made to port 22.

### 5. Size Measurement
Before backing up, `du -sb <db_path>` is run on the first filer node to get the raw byte count. This is logged and stored as `size_bytes`. If this command fails, the backup continues but `total_bytes` remains 0, resulting in `status="failed"`.

### 6. Tar Creation (On Each Filer)
For each filer host:
- `tar czf /tmp/filer-backup-{timestamp}.tar.gz -C {db_path} .` compresses the LevelDB directory.
- The `-C` flag changes to the db directory before archiving, so the archive root is `.` (relative paths).
- Uses gzip compression (`-z`).

### 7. SFTP Download
The tar.gz file is downloaded from the filer node to `/srv/seaweed-backups/{name}.tar.gz` via SFTP (paramiko's `sftp.get`). All filer backups go into the same archive file (sequential from first node). The temporary file on the filer node is deleted after download.

### 8. Database Record
A row is inserted into `backup_snapshots` with:
- `name` — backup identifier (e.g., `backup-20260717_143052` or user-provided name)
- `s3_key` — full path to the local `.tar.gz` file
- `filer_hosts` — JSON array of filer hostnames used
- `status` — starts as `"running"`, updated to `"uploaded"`, `"partial"`, or `"failed"` after completion
- `size_bytes` — total raw bytes measured
- `created_at` — ISO 8601 timestamp

### 9. Cleanup (Async)
After the backup completes, `cleanup_old_backups()` runs as an `asyncio.create_task()` background task. It:
1. Reads `backup_retention_days` from runtime settings (default: 30)
2. If retention is 0 or disabled, skips cleanup
3. Finds all `uploaded` backups older than the cutoff date
4. Deletes the physical `.tar.gz` file and the database row for each

### 10. Response to Frontend
The response includes:
```json
{
  "ok": true,
  "syncId": "42",
  "name": "backup-20260717_143052",
  "s3Key": "/srv/seaweed-backups/backup-20260717_143052.tar.gz",
  "bytesSynced": 536870912,
  "results": {"10.10.95.102": "ok", "10.10.95.104": "ok"},
  "finishedAt": "2026-07-17T14:30:55+00:00"
}
```

## Error Handling

| Failure Point | Behavior |
|---|---|
| SSH connection to filer fails | Result logged as `"connection refused"` or timeout message. Next filer attempted. Overall status → `"partial"` or `"failed"`. |
| `du -sb` fails | `total_bytes` stays 0. Backup continues. |
| `tar czf` fails | Specific filer marked as failed. SFTP not attempted for that host. |
| SFTP download fails | `RuntimeError("SFTP download failed")` raised. Temp file still cleaned up. |
| All filers fail | Status set to `"failed"`. Error messages aggregated. |
| Disk full on `/srv/seaweed-backups/` | Backup fails during SFTP with I/O error. Previous partial file may exist. |

## Listing and Deleting Backups

### List (`GET /api/backup/snapshots`)
Reads all rows from `backup_snapshots` ordered by `id DESC`. For each row:
- If the physical `.tar.gz` file exists, uses its actual file size (updating the DB if `size_bytes` was 0).
- If the file is missing, sets status to `"missing"`.

### Delete (`DELETE /api/backup/snapshots/{name}`)
1. Looks up the backup by name in SQLite
2. Deletes the physical `.tar.gz` file from `/srv/seaweed-backups/`
3. Deletes the database row
4. Returns `404` if the backup name is not found

## Backup Directory Structure

```
/srv/seaweed-backups/
├── backup-20260715_081200.tar.gz    (256 MB)
├── backup-20260716_090000.tar.gz    (258 MB)
├── backup-20260717_143052.tar.gz    (512 MB)
└── custom-name.tar.gz               (500 MB)
```

Each backup is a **full snapshot** — not incremental. Encryption at the volume level is transparent; if filer store uses disk encryption (LUKS), the encrypted data is backed up identically.
