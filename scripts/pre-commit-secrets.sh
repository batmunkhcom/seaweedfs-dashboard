#!/bin/bash
# Pre-commit hook: Scan staged files for secrets and hardcoded IPs
# Install: ln -sf ../../scripts/pre-commit-secrets.sh .git/hooks/pre-commit

RED='\033[0;31m'
NC='\033[0m'

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

FOUND=0

check_pattern() {
    local pattern="$1"
    local label="$2"
    for f in $STAGED_FILES; do
        if [ ! -f "$f" ]; then continue; fi
        if grep -q "$pattern" "$f" 2>/dev/null; then
            echo -e "${RED}[SECURITY] $label found in: $f${NC}"
            grep -n "$pattern" "$f"
            FOUND=1
        fi
    done
}

check_pattern 'ADMIN_PASSWORD[[:space:]]*=[[:space:]]*"[^"]*"' "Admin password in config"
check_pattern '[Pp]assword[[:space:]]*=[[:space:]]*"[A-Za-z0-9*!@#$%^&()]{4,}"' "Possible hardcoded password"
check_pattern '[Ss]ecret[[:space:]]*=[[:space:]]*"[A-Za-z0-9]{8,}"' "Possible hardcoded secret"
check_pattern '10\.10\.95\.(10[1-7])\b' "Production IP (dc03)"
check_pattern '10\.10\.0\.80\b' "Production deploy server IP"
check_pattern 'seaweed\.mbm\.mn' "Production domain"

if [ "$FOUND" -eq 1 ]; then
    echo ""
    echo -e "${RED}Commit blocked: secrets or hardcoded IPs detected.${NC}"
    echo "Use environment variables or runtime config instead."
    exit 1
fi

exit 0
