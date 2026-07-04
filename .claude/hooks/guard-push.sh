#!/bin/bash
# Bloqueia git push fora da branch proto ou referenciando main/master/prod
input=$(cat)
cmd=$(echo "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
case "$cmd" in
  *"git push"*)
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ "$branch" != "proto" ]; then
      echo "BLOQUEADO pelo guard: branch atual '$branch' != proto. Push proibido." >&2
      exit 2
    fi
    if echo "$cmd" | grep -qE "git push[^&|;]*(main|master|prod)"; then
      echo "BLOQUEADO pelo guard: git push referenciando main/master/prod. Somente 'git push origin proto'." >&2
      exit 2
    fi
    ;;
esac
exit 0
