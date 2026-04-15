#!/bin/bash
# opencode session picker - runs inside the container when entering shell
set +e

TMP=/tmp/_oc_sessions.json
opencode session list --format json > "$TMP" 2>/dev/null || echo "[]" > "$TMP"

session_count=$(python3 -c "import json; print(len(json.load(open('$TMP'))))" 2>/dev/null || echo "0")

if [ "$session_count" -eq 0 ]; then
  echo "No existing sessions. Starting new opencode session..."
  exec opencode
fi

echo ""
echo "=== OpenCode Sessions ==="
python3 - "$TMP" <<'PYEOF'
import json, sys
from datetime import datetime
data = json.load(open(sys.argv[1]))
for i, s in enumerate(data):
    ts = s.get('updated', 0) // 1000
    dt = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M') if ts > 0 else "?"
    title = s.get('title', 'Untitled')
    print(f"  {i+1}) [{dt}] {title}")
PYEOF
echo "  n) New session"
echo ""
read -rp "Choose [1-$session_count / n]: " choice

if [[ "$choice" == "n" ]] || [ -z "$choice" ]; then
  exec opencode
elif [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$session_count" ]; then
  session_id=$(python3 -c "import json,sys; data=json.load(open(sys.argv[1])); print(data[int(sys.argv[2])-1]['id'])" "$TMP" "$choice" 2>/dev/null || echo "")
  if [ -n "$session_id" ]; then
    echo "Resuming session $session_id..."
    exec opencode --session "$session_id"
  else
    echo "Error selecting session. Starting new..."
    exec opencode
  fi
else
  echo "Invalid choice. Starting new session..."
  exec opencode
fi
