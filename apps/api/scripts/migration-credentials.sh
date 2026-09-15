#!/usr/bin/env bash
#
# migration-credentials.sh
#
# One-shot migration to the unified `credentials` table. Run this BEFORE
# deploying code that removes GitCredentialEntity (synchronize:true would
# otherwise DROP git_credentials on boot, losing the data).
#
# Prerequisites:
#   - The API is stopped (or at least not writing to the DB).
#   - `sqlite3` is installed on the host.
#   - You know the CodePods data directory (contains codepods.db).
#
# Usage:
#   ./migration-credentials.sh /path/to/data-dir
#
# What it does:
#   1. Migrates git_credentials → credentials (type='user_pass', copies
#      tokenSecret ciphertext as `secret` — same AES-256-GCM, no re-encrypt).
#      Rewrites workspaces.credentialId to the new ids.
#   2. Migrates ai_providers.apiKeySecret → credentials (type='key', copies
#      the ciphertext as `secret'). Sets ai_providers.credentialId and NULLs
#      apiKeySecret so the unified store becomes the single source of truth.
#   3. Prints a summary. git_credentials is left as backup (dropped on boot).
#
set -euo pipefail

DATA_DIR="${1:-}"
if [ -z "$DATA_DIR" ]; then
  echo "Usage: $0 <data-dir>" >&2
  exit 1
fi

DB="$DATA_DIR/codepods.db"

if [ ! -f "$DB" ]; then
  echo "Database not found at $DB" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required but not installed. Install with: sudo apt install sqlite3" >&2
  exit 1
fi

echo "Migrating legacy credentials → unified credentials in $DB ..."

# Safety: back up the DB first.
BACKUP="$DB.bak-$(date +%Y%m%d%H%M%S)"
cp "$DB" "$BACKUP"
echo "Backup created: $BACKUP"

# --- Part 1: git_credentials → credentials (type='user_pass') ---
sqlite3 "$DB" <<'SQL'
BEGIN;

CREATE TEMP TABLE _cred_map (old_id INTEGER, new_id INTEGER);

INSERT INTO credentials (codepodId, label, type, host, username, secret, createdAt, updatedAt)
SELECT
  gc.codepodId,
  gc.label,
  'user_pass',
  gc.host,
  gc.username,
  gc.tokenSecret,
  gc.createdAt,
  gc.updatedAt
FROM git_credentials gc
WHERE NOT EXISTS (
  SELECT 1 FROM credentials c
  WHERE c.codepodId = gc.codepodId AND c.label = gc.label
);

-- Build the mapping: old git_credentials.id → new credentials.id (matched by codepodId+label).
INSERT INTO _cred_map (old_id, new_id)
SELECT gc.id, c.id
FROM git_credentials gc
JOIN credentials c ON c.codepodId = gc.codepodId AND c.label = gc.label;

-- Rewrite workspaces.credentialId to the new unified ids.
UPDATE workspaces
SET credentialId = (SELECT new_id FROM _cred_map WHERE old_id = workspaces.credentialId)
WHERE credentialId IS NOT NULL
  AND credentialId IN (SELECT old_id FROM _cred_map);

DROP TABLE _cred_map;

COMMIT;
SQL

echo "  git_credentials migrated."

# --- Part 2: ai_providers.apiKeySecret → credentials (type='key') ---
sqlite3 "$DB" <<'SQL'
BEGIN;

-- Create a credential for each provider that has an encrypted apiKeySecret
-- and doesn't already have a credentialId. Label = provider name (suffixed
-- if it collides with an existing credential label for the same codepod).
INSERT INTO credentials (codepodId, label, type, host, username, secret, createdAt, updatedAt)
SELECT
  ap.codepodId,
  ap.name,
  'key',
  NULL,
  NULL,
  ap.apiKeySecret,
  ap.createdAt,
  ap.updatedAt
FROM ai_providers ap
WHERE ap.apiKeySecret IS NOT NULL
  AND ap.credentialId IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM credentials c
    WHERE c.codepodId = ap.codepodId AND c.label = ap.name
  );

-- Link providers to their newly created credential (matched by codepodId+label).
UPDATE ai_providers
SET credentialId = (
    SELECT c.id FROM credentials c
    WHERE c.codepodId = ai_providers.codepodId AND c.label = ai_providers.name
  )
WHERE apiKeySecret IS NOT NULL
  AND credentialId IS NULL;

-- Null out apiKeySecret — the unified credential is now the source of truth.
UPDATE ai_providers
SET apiKeySecret = NULL
WHERE credentialId IS NOT NULL;

COMMIT;
SQL

echo "  ai_providers.apiKeySecret migrated."
echo ""
echo "Summary:"
echo "  Unified credentials (user_pass):"
sqlite3 "$DB" "SELECT COUNT(*) FROM credentials WHERE type='user_pass';"
echo "  Unified credentials (key):"
sqlite3 "$DB" "SELECT COUNT(*) FROM credentials WHERE type='key';"
echo "  Workspaces referencing credentials:"
sqlite3 "$DB" "SELECT COUNT(*) FROM workspaces WHERE credentialId IS NOT NULL;"
echo "  AI providers with credentialId:"
sqlite3 "$DB" "SELECT COUNT(*) FROM ai_providers WHERE credentialId IS NOT NULL;"
echo "  AI providers with leftover apiKeySecret:"
sqlite3 "$DB" "SELECT COUNT(*) FROM ai_providers WHERE apiKeySecret IS NOT NULL;"
echo ""
echo "The legacy git_credentials table is left in place as a backup."
echo "On the next API boot, the new code (synchronize:true) will drop it automatically."