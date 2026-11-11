#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAR="$PLUGIN_DIR/target/business-diagnostic-mcp.jar"

# Credentials are loaded from an untracked file so that secrets never live inside
# the repository. Set BUSINESS_DIAGNOSTIC_ENV_FILE to override the default path.
# All diagnostics must go to stderr: stdout carries the MCP JSON-RPC stream.
ENV_FILE="${BUSINESS_DIAGNOSTIC_ENV_FILE:-$HOME/.business-diagnostic/env.sh}"
if [[ -f "$ENV_FILE" ]]; then
  set +u
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set -u
else
  echo "[business-diagnostic-mcp] credentials file not found: $ENV_FILE" >&2
fi

if [[ ! -f "$JAR" ]]; then
  (
    cd "$PLUGIN_DIR"
    mvn -q -DskipTests package
  )
fi

exec java -Xms8m -Xmx64m -XX:MaxMetaspaceSize=64m -XX:ReservedCodeCacheSize=24m -Xss512k -XX:+UseSerialGC -jar "$JAR"
