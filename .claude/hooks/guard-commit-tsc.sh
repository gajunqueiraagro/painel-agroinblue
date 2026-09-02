#!/bin/bash
# Bloqueia o commit se TSC strict exceder a baseline.
#
# ⚠ A BASELINE É LIDA DO CLAUDE.md, NUNCA ESCRITA AQUI. O número já morou neste
# script, congelado em 89 desde 19/08 enquanto o CLAUDE.md era mantido três
# vezes (95 -> 89 -> 73). Durante semanas o guard aceitou até 16 erros novos sem
# reclamar: quem segurou foi a conferência humana de conjunto, não o automático.
# Duas fontes para o mesmo número divergem sempre; com uma só, o guard não tem
# como discordar do documento que rege a execução.
input=$(cat)
cmd=$(echo "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
case "$cmd" in
  *"git commit"*)
    raiz="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    base=$(grep -oE 'TSC baseline: [0-9]+' "$raiz/CLAUDE.md" 2>/dev/null | head -1 | grep -oE '[0-9]+')
    # ⚠ SEM BASELINE LEGÍVEL, NÃO SE ADIVINHA UM NÚMERO. Um default aqui seria a
    # terceira fonte da mesma verdade — e a mais silenciosa das três.
    if [ -z "$base" ]; then
      echo "BLOQUEADO pelo guard: nao consegui ler 'TSC baseline: N' do CLAUDE.md." >&2
      exit 2
    fi
    n=$(npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS")
    if [ -z "$n" ]; then
      echo "AVISO guard TSC: contagem vazia — verificar comando" >&2
      exit 0
    fi
    if [ "$n" -gt "$base" ]; then
      echo "BLOQUEADO pelo guard: TSC strict = $n erros (baseline $base, lida do CLAUDE.md). Corrigir antes." >&2
      exit 2
    fi
    ;;
esac
exit 0
