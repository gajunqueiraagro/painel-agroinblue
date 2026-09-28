-- 20261027170000_fin_v2_sem_caixa_01.sql
-- FIN-V2-SEM-CAIXA-01 (adendo, item 8) — A DESCRICAO DA ENTREGA VIRA "Venda <cab:3> <sigla>" (decisao do Gabriel, opcao a,
-- 28/09/2026): "Venda 183 DM", "Venda 006 G". Sem "Entrega" e sem "cab". O MESMO formato dos titulos das OCs
-- (`descricaoCompromissoLote`, src/lib/financeiro/produtoOC.ts: `{Verbo} {qtd:3} {SIGLA}`).
--
-- PECAS:
--   1. `_oc_sigla_categoria(text)` — ESPELHO de `SIGLA_POR_SLUG` + `siglaCategoria` (src/lib/financeiro/produtoOC.ts), com teste
--      que le este arquivo e compara par a par (src/lib/financeiro/siglaCategoriaEspelho.test.ts). Fora do mapa, o mesmo
--      fallback do front: o rotulo sem espacos, em maiusculas (ou o codigo). Uma fonte so' para a sigla em cada lado.
--   2. `oc_sincronizar_entregas` (patch guardado por md5, ddfff259 -> de36ab1e): as DUAS escritas da descricao (titulo e parte).
--      Cabecas com no minimo 3 digitos, sem truncar acima de 999 — `lpad` sozinho CORTARIA "1200" em "120"; por isso o
--      comprimento e' `greatest(3, length(...))`, o `padStart(3, '0')` do front.
--   ⚠ O RAMO DE ATUALIZACAO CONTINUA SEM REESCREVER DESCRICAO: descricao editada a mao nunca e' sobrescrita pelo sincronizar. As
--     7 da 232c05aa sao a migration de dado 20261027170100 (com o OK do Gabriel, inclusive a f3ef425a).
--   ⚠ `_oc_rotulo_categoria` (01d) FICA: o espelho do nome continua valendo e testado; so' deixa de ser usado aqui.

create or replace function public._oc_sigla_categoria(p_categoria text)
returns text
language sql
immutable
set search_path = public
as $fn$
  -- Espelho de SIGLA_POR_SLUG (src/lib/financeiro/produtoOC.ts). Quem mudar um, muda o outro; o teste compara os dois.
  select case p_categoria
    WHEN 'mamotes_m' THEN 'MM'
    WHEN 'mamotes_f' THEN 'MF'
    WHEN 'desmama_m' THEN 'DM'
    WHEN 'desmama_f' THEN 'DF'
    WHEN 'garrotes' THEN 'G'
    WHEN 'novilhas' THEN 'N'
    WHEN 'bois' THEN 'B'
    WHEN 'vacas' THEN 'V'
    WHEN 'touros' THEN 'T'
    else upper(replace(public._oc_rotulo_categoria(p_categoria), ' ', ''))
  end
$fn$;
revoke all on function public._oc_sigla_categoria(text) from public, anon;
grant execute on function public._oc_sigla_categoria(text) to authenticated, service_role;

do $p$
declare v_def text; v_a text; v_b text;
begin
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'oc_sincronizar_entregas'
                   and md5(prosrc) = 'ddfff259242144df3a93205fadea37cf') then
    raise exception 'FIN-V2-SEM-CAIXA-01: oc_sincronizar_entregas fora da origem esperada'; end if;
  v_def := pg_get_functiondef('public.oc_sincronizar_entregas'::regproc);
  if (length(v_def) - length(replace(v_def, 'Entrega %s cab', ''))) / length('Entrega %s cab') <> 2 then
    raise exception 'FIN-V2-SEM-CAIXA-01: a descricao da entrega nao ocorre 2x'; end if;
  v_a := $a$format('Entrega %s cab %s', r.cab, public._oc_rotulo_categoria(r.categoria))$a$;
  v_b := $b$format('Venda %s %s', lpad(r.cab::text, greatest(3, length(r.cab::text)), '0'), public._oc_sigla_categoria(r.categoria))$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 2 then
    raise exception 'FIN-V2-SEM-CAIXA-01: ancora da descricao nao casa 2x'; end if;
  execute replace(v_def, v_a, v_b);
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'oc_sincronizar_entregas'
                   and md5(prosrc) = 'de36ab1e6cf6480d359da66bcf69b7de') then
    raise exception 'FIN-V2-SEM-CAIXA-01: oc_sincronizar_entregas com destino inesperado'; end if;
  if has_function_privilege('anon', 'public.oc_sincronizar_entregas(uuid, integer, boolean)', 'execute')
     or has_function_privilege('anon', 'public._oc_sigla_categoria(text)', 'execute') then
    raise exception 'FIN-V2-SEM-CAIXA-01: ACL aberta'; end if;
end $p$;
