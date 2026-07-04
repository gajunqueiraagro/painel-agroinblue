# Riscos estruturais e roadmap SaaS — fotografia Mai/2026

> FOTOGRAFIA DATADA (Constituição, Título II.7): diagnósticos
> medidos em Mai/2026. REVALIDAR EMPIRICAMENTE antes de usar em
> qualquer decisão — números e estados abaixo podem ter mudado.

## Riscos diagnosticados (Mai/2026)
1. RLS trivial USING(true) em tabelas multi-tenant (clientes,
   cliente_membros) — risco LGPD/segurança antes de onboarding de
   cliente externo.
2. Padrão fetchAllPaginated baixando dezenas de milhares de linhas
   para o front — estrutural, limita escala.
3. Capacidade estimada à época: 3–5 clientes do porte atual antes
   de degradação séria; aviso "exhausting multiple resources" ativo
   no Supabase no período.
4. Cache zootécnico global (zoot_mensal_cache) depende de rebuild
   explícito; correção estrutural planejada e NÃO implementada:
   ensure-on-read via fn_zoot_cache_ensure em useZootCategoriaMensal.

## Roadmap SaaS registrado (intenção, sem prazo)
Bootstrap único de contexto · RLS multi-tenant real por cliente_id ·
cache global persistente · RPCs server-side por bloco de agregados ·
observability contínua (pg_stat_statements periódico) · onboarding
de clientes.

## Regra de uso deste documento
Antes de priorizar qualquer item: nova medição (FASE 0) do estado
atual. Este arquivo registra o QUE foi visto e QUANDO — não o que
está acontecendo agora.
