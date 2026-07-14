# ADR-2026-14 — Views tenant-safe
Status: ACEITO (14/07/2026) · Decide sobre: views tenant-safe

## Contexto e evidências
8 views (`vw_financeiro_*`×4, `vw_zoot_*`×2, `vw_valor_rebanho_realizado_global_mensal`, `vw_classificacao_staging_preview`), owner=postgres, **`security_invoker` unset** (rodam com privilégio do owner → bypassam RLS das bases), **anon SELECT concedido**. Caso "tabela protegida, mas view aberta".

## Decisão
O ADR fixa o **padrão**; o inventário individual fica no pacote `SEC-VIEWS-TENANT-01`. Padrão preferencial: **`security_invoker=on` + revoke anon + manter authenticated** (a view herda a RLS-alvo das bases). Onde agregação exigir privilégio elevado ou `security_invoker` degradar performance/semântica → **substituir por RPC SECDEF tenant-scoped**. Nenhuma view permanece definer-like com anon. Por view, o pacote registra: versão PG, tabelas-base, presença de `cliente_id`/`fazenda_id`, grants, consumidores no front, agregações, performance, decisão (invoker | RPC | revoke-anon | remover).

## Invariantes
- Nenhuma view devolve cross-tenant a anon.
- View não é caminho de bypass de RLS.
- Atenção a **agregações e inferência lateral** (mesmo agregados podem vazar informação de tenant).

## Consequências
**+** fecha a superfície views. **−** `security_invoker` pode exigir revisão de performance/índices; algumas viram RPC.

## Alternativas consideradas
Aplicar `security_invoker=on` cegamente a todas sem inventário — rejeitada (pode quebrar views que dependem de agregação privilegiada).

## Riscos e limitações
View que dependia de bypass quebra ao virar invoker; impacto de performance a medir por view.

## Implicações para a Fase C
`SEC-VIEWS-TENANT-01` (inventário + conversão por view; gate anon=0 e dono-vê).

## Referências cruzadas
ADR-2026-12 (anon), ADR-2026-13 (RLS das bases), ADR-2026-15 (onda de views). Pacote: `SEC-VIEWS-TENANT-01`.
