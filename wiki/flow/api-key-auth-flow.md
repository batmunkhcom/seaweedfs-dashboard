# API Key Authentication Flow

## Overview

API keys provide programmatic access to the SeaweedFS Dashboard for automation, CI/CD pipelines, and service-to-service communication. Keys use the `X-API-Key` HTTP header and bypass session/cookie-based auth entirely. Each key is assigned granular permissions at creation time, and usage is tracked (count, last used timestamp, last endpoint).

Keys are generated with the prefix `bkp_` followed by 64 hex characters (`secrets.token_hex(32)`). The full key is shown exactly once at creation time and stored as-is (not hashed) in the `api_keys` table — unlike user passwords which use bcrypt.

## Key Management Lifecycle

```mermaid
sequenceDiagram
    actor A as 👤 Admin User
    actor S as 🤖 Service/CLI

    participant FP as Frontend (API Keys Page)
    participant AKR as API Keys Route
    participant AKS as API Key Service
    participant DB as SQLite (api_keys + users)

    Note over A,DB: === CREATE KEY ===

    A->>FP: Navigate to API Keys → Click "Create Key"
    FP->>FP: Modal: Key Name + Permission checkboxes
    A->>FP: Enter name, select permissions, click Create
    FP->>AKR: POST /api/api-keys/create<br/>{name: "Backup Script", permissions: "backup:read,backup:write"}
    AKR->>AKR: require_admin() — session user must be admin
    AKR->>AKS: create_api_key(name, permissions, created_by="admin")
    AKS->>AKS: key = "bkp_" + secrets.token_hex(32)
    AKS->>DB: INSERT INTO api_keys<br/>(key, name, permissions, created_by)<br/>VALUES (?, ?, ?, ?)
    DB-->>AKS: committed
    AKS-->>AKR: {key: "bkp_a1b2c3...", name, permissions}
    AKR-->>FP: Full key returned
    FP->>FP: Show key in modal: "This key will not be shown again!"
    A->>FP: Clicks "Copy Key" → copies to clipboard
    A->>A: Stores key in vault/.env/CI secrets
    FP->>FP: Modal closed — key is now masked in table

    Note over S,DB: === SERVICE USES KEY ===

    S->>S: Set header: X-API-Key: bkp_a1b2c3d4e5f6...
    S->>AKR: GET /api/backup/status<br/>X-API-Key: bkp_a1b2c3...

    Note over AKR: AuthMiddleware intercepts
    AKR->>AKS: validate_api_key("bkp_a1b2c3...")
    AKS->>AKS: Check: starts with "bkp_"?
    AKS->>DB: SELECT * FROM api_keys<br/>WHERE key = ? AND is_active = 1
    DB-->>AKS: {id: 1, name: "Backup Script", permissions: "backup:read,backup:write", ...}

    alt Key valid
        AKS-->>AKR: key_data dict
        AKR->>AKR: request.state.user = "api_key"
        AKR->>AKR: request.state.role = "backup_admin"
        AKR->>AKR: request.state.permissions = ["backup:read", "backup:write"]
        AKR->>AKR: request.state.api_key_id = 1
        AKR->>AKS: record_usage(key_id=1, endpoint="/api/backup/status")
        AKS->>DB: UPDATE api_keys<br/>SET usage_count = usage_count + 1,<br/>    last_used_at = NOW(),<br/>    last_used_endpoint = "/api/backup/status"<br/>WHERE id = 1

        Note over AKR: Route handler checks require_permission("backup:read")
        alt Permission in key's list
            AKR-->>S: 200 OK (data returned)
        else Permission missing
            AKR-->>S: 403 "Missing permission: backup:read"
        end
    else Key invalid/revoked
        AKS-->>AKR: None
        AKR->>AKR: Fallback: check session? → No session
        AKR-->>S: 401 "Not authenticated"
    end

    Note over A,DB: === REVEAL KEY ===

    A->>FP: Click eye icon on key row
    FP->>FP: Modal: Enter admin password
    A->>FP: Enter password, click "Reveal"
    FP->>AKR: POST /api/api-keys/reveal<br/>{key_id: 1, admin_password: "..."}
    AKR->>AKS: reveal_api_key(key_id=1, admin_password, username="admin")
    AKS->>DB: SELECT password_hash FROM users<br/>WHERE username = "admin" AND enabled = 1
    DB-->>AKS: password_hash
    AKS->>AKS: bcrypt.checkpw(admin_password, password_hash)

    alt Password correct
        AKS->>DB: SELECT key FROM api_keys WHERE id = 1
        DB-->>AKS: "bkp_a1b2c3..."
        AKS-->>AKR: "bkp_a1b2c3..."
        AKR-->>FP: {key: "bkp_a1b2c3..."}
        FP->>FP: Show full key + copy button
    else Password wrong
        AKS-->>AKR: None
        AKR-->>FP: 403 "Invalid admin password or key not found"
    end

    Note over A,DB: === REVOKE KEY ===

    A->>FP: Click delete/revoke button on key row
    FP->>FP: Popconfirm: "Revoke this API key?"
    A->>FP: Confirm revocation
    FP->>AKR: POST /api/api-keys/revoke/1
    AKR->>AKR: require_admin() check
    AKR->>AKS: revoke_api_key(key_id=1)
    AKS->>DB: UPDATE api_keys SET is_active = 0 WHERE id = 1
    DB-->>AKS: committed
    AKS-->>AKR: True
    AKR-->>FP: {ok: true}
    FP->>A: Success toast: "API key revoked"

    Note over S: Any further requests with this key → 401

    Note over A,DB: === VIEW DETAILS ===

    A->>FP: Click info icon on key row
    FP->>AKR: GET /api/api-keys/{id}/detail
    AKR->>AKS: get_api_key_detail(key_id=1)
    AKS->>DB: SELECT id, name, permissions, created_at,<br/>       last_used_at, is_active, usage_count,<br/>       last_used_endpoint, created_by<br/>FROM api_keys WHERE id = 1
    DB-->>AKS: Full row
    AKS->>AKS: Split permissions string → list
    AKS-->>AKR: Detail dict
    AKR-->>FP: Full detail
    FP->>FP: Drawer with all fields (key NOT included)
```

## Permission Model

### Available Permissions

Permissions are checked as exact string matches against the comma-separated values stored in the `api_keys.permissions` column.

| Permission String | Controls Access To |
|---|---|
| `backup:read` | `GET /api/backup/status`, `GET /api/backup/snapshots` |
| `backup:write` | `POST /api/backup/sync`, `POST /api/backup/snapshots`, `DELETE /api/backup/snapshots/{name}`, `POST /api/backup/restore/{name}` |
| `filer:read` | `GET /api/filer/list/*` |
| `filer:write` | `POST /api/filer/mkdir/*`, `DELETE /api/filer/delete/*`, `POST /api/filer/upload/*` |
| `s3:read` | `GET /api/s3/buckets`, `GET /api/s3/users`, `GET /api/s3/policies` |
| `s3:write` | `POST /api/s3/buckets`, `DELETE /api/s3/buckets`, `POST /api/s3/users`, etc. |
| `workers:read` | `GET /api/workers/status`, `GET /api/workers/jobs` |
| `workers:execute` | `POST /api/workers/jobs/detect`, `POST /api/workers/jobs/execute` |

### Permission Check Logic

In `auth_middleware.py`, the `require_permission()` function handles two paths:

1. **API key user** (`request.state.role == "backup_admin"`):
   - Checks if the required permission string exists in `request.state.permissions` (list derived from the key's DB record)
   - Returns `403` if the permission is not in the list

2. **Session user** (roles like `admin`, `readonly`):
   - Delegates to `rbac.has_permission(role, permission)` which checks the `rbac.json` mapping

### Multiple Permissions Per Key

A key can hold multiple permissions simultaneously (e.g., `"backup:read,backup:write,filer:read"`). The frontend uses Ant Design `Checkbox.Group` with the following options:

```typescript
const PERMISSION_OPTIONS = [
  { label: 'Backup Read',   value: 'backup:read' },
  { label: 'Backup Write',  value: 'backup:write' },
  { label: 'Filer Read',    value: 'filer:read' },
  { label: 'Filer Write',   value: 'filer:write' },
  { label: 'S3 Read',       value: 's3:read' },
  { label: 'S3 Write',      value: 's3:write' },
  { label: 'Workers Read',  value: 'workers:read' },
  { label: 'Workers Execute', value: 'workers:execute' },
]
```

## Key Format and Generation

```python
# backend/app/services/api_key_service.py
def generate_key() -> str:
    return "bkp_" + secrets.token_hex(32)
```

| Property | Value |
|---|---|
| **Prefix** | `bkp_` (used by `validate_api_key` to reject non-backup keys) |
| **Random portion** | 64 hex characters (32 bytes of entropy via `secrets.token_hex(32)`) |
| **Total length** | 68 characters |
| **Example** | `bkp_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2` |

## Usage Tracking

Every API key request triggers `record_usage()` which updates:

```sql
UPDATE api_keys
SET usage_count = usage_count + 1,
    last_used_at = '<ISO 8601 timestamp>',
    last_used_endpoint = '/api/backup/status'
WHERE id = <key_id>
```

This allows administrators to:
- See which keys are actively used vs dormant
- Identify the last endpoint each key accessed
- Monitor usage patterns for suspicious activity
- Decide whether to revoke unused keys

## Key Visibility and Security

| State | Visibility | How to Access |
|---|---|---|
| **At creation** | Full key shown once | Modal with copy button |
| **In table (routine)** | Masked: `bkp_a1b2...` (first 8 chars) | API Keys list page |
| **In detail drawer** | Key NOT shown | Click info icon |
| **Reveal** | Full key after admin password verification | Eye icon → password prompt → bcrypt check |
| **After revocation** | Still masked in list | Marked with red "Revoked" tag |
| **In localStorage** | Stored as plain text when user enters it | Browser DevTools → Application → Local Storage |

### Reveal Security

The reveal endpoint requires:
1. The requesting user's session to be valid (logged in)
2. The user's admin password (`bcrypt.checkpw`) to match their stored hash
3. The API key to exist

This ensures that even if a session is hijacked, the attacker cannot reveal API keys without the admin's password.

## Revocation

Revocation is a **soft delete** — the `is_active` column is set to `0`. The key remains in the database for audit purposes but is rejected by `validate_api_key()`:

```python
async def validate_api_key(key: str) -> dict | None:
    db = await get_db()
    cursor = await db.execute(
        "SELECT * FROM api_keys WHERE key = ? AND is_active = 1", (key,)
    )
    row = await cursor.fetchone()
    return dict(row) if row else None
```

Revoked keys:
- Return `401` on any future request
- Remain visible in the API Keys list with a red "Revoked" tag
- Can be viewed in detail but cannot be revealed or re-activated

## Comparison: Session Auth vs API Key Auth

| Aspect | Session Auth | API Key Auth |
|---|---|---|
| **Trigger** | Browser cookie (auto-sent) | `X-API-Key` header (explicit) |
| **Identity** | `request.session["user"]` | `request.state.user = "api_key"` |
| **Role** | `admin` or `readonly` (from session) | Always `backup_admin` |
| **Permissions** | RBAC (`rbac.json` role mapping) | Explicit list from `api_keys.permissions` |
| **CSRF** | Required for state-changing requests | Not required (key is bearer token) |
| **Expiry** | Browser-session lifetime | Permanent (until revoked) |
| **Use case** | Interactive dashboard users | Automation scripts, CI/CD, S3 clients |
| **Storage** | HttpOnly cookie + localStorage | `localStorage` (frontend) / env vars (CLI) |
