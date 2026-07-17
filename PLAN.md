# SeaweedFS Dashboard — Security Audit PLAN

> **Project**: SeaweedFS Dashboard  
> **Server**: 10.10.0.80 (Debian 13 trixie, KVM VM)  
> **Path**: /home/seaweed-dashboard  
> **Git**: git@github.com:batmunkhcom/seaweedfs-dashboard.git  
> **Date**: 2026-07-18  
> **Auditor**: mBm AI Assistant (Kali Linux 2026.2)

---

## 1. OBJECTIVE

Perform a comprehensive, multi-layered security audit of the SeaweedFS Dashboard web application and its underlying server infrastructure. Generate detailed findings with severity ratings, remediation recommendations, and maintain a historical comparison mechanism for future audits.

**Rule**: No modifications shall be made to the audited system. This is a **read-only** audit.

---

## 2. AUDIT SCOPE

### 2.1 In-Scope Assets

| Layer | Asset | Location |
|-------|-------|----------|
| Server | Debian 13, Kernel 6.12 | 10.10.0.80 |
| Backend | Python 3.13 / FastAPI | /home/seaweed-dashboard/backend/ |
| Frontend | React 19 / TypeScript / Vite | /home/seaweed-dashboard/frontend/ |
| Database | SQLite (WAL mode) | /home/seaweed-dashboard/backend/data/ |
| Reverse Proxy | nginx | Port 8081, 80 |
| Documentation | Wiki HTML/MD | /home/seaweed-dashboard/wiki/ |
| Configuration | .env, nginx.conf, rbac.json, docker-compose.yml | /home/seaweed-dashboard/ |
| Dependencies | Python (14 packages), Node (11 packages) | requirements.txt, package.json |
| SSH | OpenSSH | Port 22 |
| Secrets | API keys, passwords, tokens | .env, runtime_settings, code |

### 2.2 Out-of-Scope

- SeaweedFS cluster nodes (10.10.95.101-107) — only connectivity tested
- Cloudflared tunnel — not directly tested
- Physical security — not applicable

---

## 3. METHODOLOGY

### 3.1 Severity Classification

| Level | Criteria |
|-------|----------|
| **CRITICAL** | Direct system compromise, remote code execution, full data exposure |
| **HIGH** | Significant security bypass, credential exposure, missing critical controls |
| **MEDIUM** | Security weakness requiring multiple conditions to exploit |
| **LOW** | Best practice deviation, defense-in-depth improvement |
| **INFO** | Observation, no immediate risk |

### 3.2 Scanning Tools & Commands

#### Static Analysis (Code)
```bash
# Hardcoded secrets
gitleaks detect --no-git --source=/path/to/src -f json -r gitleaks-report.json

# Python SAST
bandit -r backend/app/ -f json -o bandit-report.json

# Dependency vulnerabilities
pip-audit -r backend/requirements.txt --format json -o pip-audit-report.json
npm audit --json > npm-audit-report.json          # (requires Node.js)

# Manual code review
rg "(password|secret|api_key|token)\s*=\s*['\"]"  backend/app/
rg "exec_command|AutoAddPolicy"                    backend/app/
rg "subprocess|os\.system|os\.popen"               backend/app/
```

#### Network & Web Scanning
```bash
# Port & service discovery
nmap -sV -p 1-65535 TARGET

# Vulnerability scanning
nmap -sV --script=vuln -p 22,80,8000,8081 TARGET

# Web application scan
nikto -h http://TARGET:8081 -Format txt -o nikto-scan.txt

# HTTP headers check
curl -sI http://TARGET:8081
curl -sI http://TARGET:80
```

#### SSH & Configuration Audit
```bash
# SSH config
ssh TARGET "grep -v '^#' /etc/ssh/sshd_config | grep -v '^$'"

# Firewall status
ssh TARGET "iptables -L -n; nft list ruleset; ufw status"

# File permissions
ssh TARGET "find /home/seaweed-dashboard -type f -perm /o+w"
ssh TARGET "stat -c '%a %U:%G %n' /home/seaweed-dashboard/backend/data/data.db"

# Database inspection (metadata only)
ssh TARGET "sqlite3 backend/data/data.db '.schema'"
ssh TARGET "sqlite3 backend/data/data.db 'SELECT key, length(value) FROM runtime_settings'"
```

#### Runtime Checks
```bash
# Running services
ssh TARGET "ss -tlnp"

# Process inspection
ssh TARGET "ps aux | grep -E 'uvicorn|nginx'"

# Listening ports from external view
nmap -sV TARGET
```

---

## 4. AUDIT CATEGORIES

| # | Category | Tools | Key Checks |
|---|----------|-------|------------|
| 1 | Credential & Secret Management | gitleaks, manual grep | Hardcoded passwords, API keys, tokens in code/docs |
| 2 | Network & Firewall | nmap, ss, iptables | Open ports, firewall rules, backend isolation |
| 3 | Web Security | nikto, curl, manual | Security headers, CORS, CSP, HTTPS |
| 4 | SSH Security | manual, ssh | Host key verification, root login, key strength |
| 5 | Code Security (SAST) | bandit, manual | SQL injection, shell injection, insecure functions |
| 6 | Dependency Security | pip-audit | Known vulnerabilities in Python/Node packages |
| 7 | Configuration Security | manual | Database permissions, nginx hardening, .env exposure |
| 8 | Authentication & Authorization | manual | Session config, RBAC, CSRF, API key management |
| 9 | Data Protection | manual | Encryption at rest, backup integrity, sensitive data exposure |
| 10 | API Endpoint Security | manual, curl | Rate limiting, input validation, error disclosure |

---

## 5. CONTINUOUS COMPARISON MECHANISM

### 5.1 Report Index

Each report is recorded in `report-index.json` with:
- Report ID, date, severity counts
- Scanners used
- Categories covered

### 5.2 Finding Tracking

Each finding has a unique ID (`SWD-SEC-XXX`) and tracks:
- **Status**: NEW / OPEN / FIXED / WORSENED
- **First Seen**: Date of initial discovery
- **Last Seen**: Date of most recent check
- **History**: Array of status changes

### 5.3 Diff Report

After each new audit, a `diff-report-YYYYMMDD-HHMMSS.md` is generated:
- **New Findings**: Issues discovered since last audit
- **Resolved**: Issues no longer present
- **Worsened**: Severity increased or regression
- **Unchanged**: Same status as before

---

## 6. DELIVERABLES

| File | Format | Purpose |
|------|--------|---------|
| `docs/security-reports/security-report-YYYYMMDD-HHMMSS.md` | Markdown | Detailed findings report |
| `docs/security-reports/security-report-YYYYMMDD-HHMMSS.html` | HTML | Web-viewable version (collapsible sections) |
| `docs/security-reports/report-index.json` | JSON | Historical report index |
| `docs/security-reports/diff-report-YYYYMMDD-HHMMSS.md` | Markdown | Comparison with previous report |
| `PLAN.md` | Markdown | This audit plan document |

---

## 7. SCHEDULE & FREQUENCY

| Event | Frequency |
|-------|-----------|
| Full security audit | After every major release or monthly |
| Dependency scan | Weekly (automated via CI) |
| Web scan (nikto) | Monthly |
| Network scan (nmap) | Monthly |
| Diff comparison | After each full audit |

---

## 8. REPORTING FORMAT

### Finding Template
```
### SWD-SEC-XXX: Title
- **Severity**: CRITICAL | HIGH | MEDIUM | LOW | INFO
- **Category**: Category Name
- **Location**: `file:line`
- **Tool**: scanner_name
- **CVSS 3.1**: X.X (if applicable)
- **Description**: What was found
- **Impact**: What could happen if exploited
- **Proof**: Evidence (snippet, URL, command output)
- **Remediation**: How to fix
- **References**: Links to CVE, OWASP, best practices
```

---

*Generated by mBm AI Assistant — 2026-07-18*
