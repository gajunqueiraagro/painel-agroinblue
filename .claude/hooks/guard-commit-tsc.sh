#!/bin/bash
# Bloqueia git commit se TSC strict > baseline 95
input=$(cat)
cmd=$(echo "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
case "$cmd" in
  *"git commit"*)
    n=$(npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS")
    if [ -z "$n" ]; then
      echo "AVISO guard TSC: contagem vazia — verificar comando" >&2
      exit 0
    fi
    if [ "$n" -gt 95 ]; then
      echo "BLOQUEADO pelo guard: TSC strict = $n erros (baseline 95). Corrigir antes de commitar." >&2
      exit 2
    fi
    ;;
esac
exit 0
