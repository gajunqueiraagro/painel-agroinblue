# docs/historico/

O que saiu do CLAUDE.md na higiene de 29/09/2026 — movido VERBATIM, conferido por script (toda linha nao vazia do
CLAUDE.md de antes existe em algum destino, na mesma multiplicidade).

- `frentes-ate-2026-09-29.md` — os blocos das frentes fechadas (PASTO-VIGENCIA-MOTOR-01 ... FIN-V2-HOMOLOG-FIX-01),
  com as provas, os md5 e as licoes de metodo. A regra vigente de cada uma ficou no CLAUDE.md, citando o nome.
- `gates-baselines.md` — a historia das baselines do TSC, da suite de testes e do check:ui-nativo.
- `../DIVIDAS-ABERTAS.md` (fora desta pasta, porque esta' viva) — o texto integral das dividas abertas.

Para achar uma frente: `grep -n "NOME-DA-FRENTE" docs/historico/*.md docs/DIVIDAS-ABERTAS.md`.

CLAUDE-MD-ENXUTO-01 (21/10/2026): o CLAUDE.md tinha 1,3 MB (os tres Codes acrescentavam o relatorio de cada item no fim) e passou a
~19 KB — so' regras, gates, landmines e indice. Tudo o que estava nele foi movido VERBATIM, por mes, conferido por script (as 10.815
linhas nao vazias de antes existem nos destinos, na mesma multiplicidade):

- `2026-09.md` e `2026-10.md` — cada bloco de topo do CLAUDE.md pela primeira data dele ate' 21/10/2026 (sem data: o mes do bloco
  anterior), sob o titulo da secao em que estava.
- Daqui em diante, o relatorio de cada item vai no arquivo do mes dele (`AAAA-MM.md`) — nunca no CLAUDE.md.
