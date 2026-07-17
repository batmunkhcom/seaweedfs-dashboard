# Authentication Flow

## Overview

The SeaweedFS Dashboard uses a dual authentication strategy: **session-based auth** for browser users (with cookies and CSRF tokens) and **API key auth** for programmatic/service access via the `X-API-Key` header. Both paths hit the same `AuthMiddleware`, which resolves identity and performs RBAC checks.

## Session-Based Auth Flow

```mermaid
sequenceDiagram
    actor U as 👤 User
    participant LP as Login Page (React)
    participant AX as Axios Instance
    participant CS as CSRF Middleware
    participant AM as Auth Middleware
    participant BE as FastAPI Backend
    participant DB as SQLite (users)

    %% LOGIN
    U->>LP: Enters username + password
    LP->>AX: POST /api/auth/login<br/>{username, password}
    AX->>BE: POST /api/auth/login<br/>Rate limited: 20 req / 5 min
    BE->>DB: SELECT username, password_hash, role, enabled<br/>FROM users WHERE username = ?
    DB-->>BE: row (or None)

    alt User not found or disabled
        BE-->>AX: 401 "Invalid credentials"
        AX-->>LP: Error shown
    else Password wrong
        BE->>BE: bcrypt.checkpw(password, row.password_hash)
        BE-->>AX: 401 "Invalid credentials"
        AX-->>LP: Error shown
    else Password correct
        BE->>BE: csrf_token = secrets.token_hex(32)
        BE->>BE: request.session["user"] = username
        BE->>BE: request.session["role"] = row.role
        BE->>BE: request.session["csrf_token"] = csrf_token
        BE-->>AX: 200 {user: {username, role}, csrfToken}
        AX->>AX: setCsrfToken(data.csrfToken)
        AX-->>LP: Login success
        LP->>LP: saveSession(user, csrfToken) → localStorage
        LP->>LP: Redirect to /dashboard
    end

    %% AUTHENTICATED REQUEST (READ)
    U->>LP: Navigate to Dashboard
    LP->>AX: GET /api/dashboard/stats<br/>(session cookie auto-sent)
    AX->>AM: Request intercepted
    AM->>AM: Check: path in PUBLIC_PATHS? → No
    AM->>AM: Check: X-API-Key header? → No
    AM->>AM: Check: request.session["user"]?
    alt Session valid
        AM->>AM: request.state.user = session["user"]
        AM->>AM: request.state.role = session["role"]
        AM-->>BE: Forward request
        BE-->>AX: 200 {stats data}
    else Session expired/missing
        AM-->>AX: 401 "Not authenticated"
        AX->>AX: Response interceptor: status 401
        AX->>AX: useAuthStore.logout()
        AX-->>LP: Redirect to /login
    end

    %% AUTHENTICATED REQUEST (WRITE) — CSRF
    U->>LP: Creates a new S3 bucket
    LP->>AX: POST /api/s3/buckets<br/>X-CSRF-Token: storedToken
    AX->>CS: Request intercepted (method=POST, not /api/auth)
    CS->>CS: Get X-CSRF-Token from header
    CS->>CS: Get csrf_token from session
    alt Token matches
        CS-->>AM: Forward to Auth middleware
        AM-->>BE: Forward request
        BE-->>AX: 200 {bucket created}
    else Token missing or mismatched
        CS-->>AX: 403 "Invalid CSRF token"
    end

    %% SESSION EXPIRY
    Note over U,DB: Session expires after server-defined timeout
    U->>LP: Makes a request after session expiry
    AX->>AM: Session check fails
    AM-->>AX: 401
    AX->>AX: Interceptor: logout() → clear localStorage
    AX-->>LP: Redirect to /login

    %% LOGOUT
    U->>LP: Clicks Logout
    LP->>AX: POST /api/auth/logout
    AX->>BE: POST /api/auth/logout
    BE->>BE: request.session.clear()
    BE-->>AX: 200 {message: "logged out"}
    AX->>AX: setCsrfToken('')
    AX-->>LP: Logout success
    LP->>LP: saveSession(null, '') → clear localStorage
    LP->>LP: Redirect to /login
```

## API Key Auth Flow

```mermaid
sequenceDiagram
    actor S as 🤖 Service/CLI
    participant AM as Auth Middleware
    participant KS as API Key Service
    participant DB as SQLite (api_keys)
    participant BE as Route Handler

    S->>AM: GET /api/backup/status<br/>X-API-Key: bkp_abc123...
    AM->>AM: Check: path in PUBLIC_PATHS? → No
    AM->>AM: Check: X-API-Key header present? → Yes
    AM->>KS: validate_api_key("bkp_abc123...")
    KS->>KS: Check: starts with "bkp_"? → Yes
    KS->>DB: SELECT * FROM api_keys<br/>WHERE key = ? AND is_active = 1
    DB-->>KS: row (or None)

    alt Key valid
        KS-->>AM: {id, name, permissions: "backup:read,backup:write", ...}
        AM->>AM: request.state.user = "api_key"
        AM->>AM: request.state.role = "backup_admin"
        AM->>AM: request.state.permissions = ["backup:read", "backup:write"]
        AM->>AM: request.state.api_key_id = key_data["id"]
        AM->>KS: record_usage(key_id, "/api/backup/status")
        KS->>DB: UPDATE api_keys<br/>SET usage_count++, last_used_at=now, last_used_endpoint=?
        AM->>BE: Forward request

        Note over BE: Route has require_permission("backup:read")
        BE->>BE: Check: role == "backup_admin"?
        BE->>BE: Check: "backup:read" in request.state.permissions?
        alt Permission granted
            BE-->>S: 200 {backup status}
        else Missing permission
            BE-->>S: 403 "Missing permission: backup:read"
        end
    else Key invalid/revoked
        KS-->>AM: None
        AM->>AM: Fallback: check session? → None
        AM-->>S: 401 "Not authenticated"
    end
```

## Auth Resolution Priority

The `AuthMiddleware` resolves identity in this order:

| Priority | Method | Role Assigned | Permissions Source |
|---|---|---|---|
| 1 | Public paths (`/api/health`, `/api/info`, `/api/auth/login`, `/api/auth/csrf-token`, `/docs`, `/openapi.json`) | None (bypass) | N/A |
| 2 | `X-API-Key` header (starts with `bkp_`) | `backup_admin` | `api_keys.permissions` field (comma-separated) |
| 3 | Session cookie (`request.session["user"]`) | From session (`admin` / `readonly`) | `rbac.json` role-to-permissions mapping |

**Public paths** (`backend/app/middleware/auth_middleware.py`):
```
/api/health, /api/info, /api/auth/login, /api/auth/csrf-token, /docs, /openapi.json
```

## CSRF Protection

The `CsrfMiddleware` (`backend/app/middleware/csrf_middleware.py`) applies to all state-changing requests:

| Aspect | Detail |
|---|---|
| **Safe methods** (bypassed) | `GET`, `HEAD`, `OPTIONS` |
| **Also bypassed** | `/api/auth/*` paths (login/logout need no prior session) |
| **Checked methods** | `POST`, `PUT`, `DELETE`, `PATCH` |
| **Header checked** | `X-CSRF-Token` |
| **Expected value** | `request.session["csrf_token"]` (set at login) |
| **On mismatch** | HTTP `403` — "Invalid CSRF token" |

The CSRF token is a hex string generated via `secrets.token_hex(32)` (64 hex chars). It is:

1. Created at login and stored in the server session
2. Returned in the login response body
3. Stored in the frontend's `localStorage` (via Zustand `authStore`)
4. Attached by Axios request interceptor to all non-GET/HEAD/OPTIONS requests

## Session Lifecycle

| Event | Action |
|---|---|
| **Login** | Session created server-side with `user`, `role`, `csrf_token`. Cookie sent to browser. |
| **Page refresh** | Frontend calls `GET /api/auth/me` + `GET /api/auth/csrf-token` to rehydrate session. |
| **401 response** | Axios interceptor calls `useAuthStore.getState().logout()` — clears localStorage, redirects. |
| **Logout** | `POST /api/auth/logout` → `request.session.clear()`. Frontend clears localStorage. |
| **Expiry** | Starlette `SessionMiddleware` default cookie lifetime (browser-session). Server-side invalidation on expiry. |

## RBAC Permissions

Role-based access control is defined in `backend/rbac.json`. Session users get permissions mapped from their role:

| Role | Typical Permissions |
|---|---|
| `admin` | `cluster:read`, `cluster:write`, `volumes:read`, `volumes:write`, `filer:read`, `filer:write`, `s3:read`, `s3:write`, `backup:read`, `backup:write`, `workers:read`, `workers:execute`, `settings:read`, `settings:write`, `users:read`, `users:write`, `disk_health:read` |
| `readonly` | Read-only variants of all the above |
| `backup_admin` (API key) | Determined by the API key's `permissions` field, not RBAC |

Permission checks in routes use `Depends(require_permission("resource:action"))` which internally:
1. For `backup_admin` role: checks the permission string against `request.state.permissions` list
2. For session roles: delegates to `rbac.has_permission(role, permission)`

## Rate Limiting

Applied via slowapi. The login endpoint is protected with:

```
@limiter.limit("20/5minute")
```

Allowing 20 attempts per 5-minute window per client IP. Exceeding this returns HTTP `429 Too Many Requests`.
