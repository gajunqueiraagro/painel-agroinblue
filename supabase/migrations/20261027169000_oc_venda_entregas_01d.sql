-- 20261027169000_oc_venda_entregas_01d.sql
-- OC-VENDA-ENTREGAS-01d (A1) — A DESCRICAO DA ENTREGA USA O NOME DA CATEGORIA, NAO O CODIGO (homologacao do 01c, 28/09/2026).
--
-- `oc_sincronizar_entregas` gravava "Entrega 193 cab desmama_m": `format('Entrega %s cab %s', r.cab, r.categoria)`, com o codigo
-- cru do lote. O resto do sistema mostra o rotulo ("Desmama M", "Garrotes") de `CATEGORIAS` (src/types/cattle.ts).
--
-- PECAS:
--   1. `_oc_rotulo_categoria(text)` — ESPELHO de `CATEGORIAS`, com teste que le este arquivo e compara par a par
--      (src/lib/oc/rotuloCategoriaEspelho.test.ts). Codigo fora da lista volta como veio: nunca inventa nome.
--   2. `oc_sincronizar_entregas` (patch guardado por md5, 20f2e321 -> ddfff259): as DUAS ocorrencias da descricao (titulo e parte)
--      passam pelo rotulo. O conceito ("Entrega %s cab") ocorre exatamente 2x no corpo, e as duas sao a ancora.
--   ⚠ O RAMO DE ATUALIZACAO NAO REESCREVE DESCRICAO (so' valor, datas e conta): as entregas ja' gravadas NAO mudam por esta
--     migration. As 7 da 232c05aa sao a migration de dado 20261027169100, aplicada so' com o OK do Gabriel.
--
-- (A2 nao tem banco: o `valor_acordado` da 232c05aa JA' e' 2.365.243,37 = soma dos lotes. O resumo lateral soma
--  `lotesApi.totais`, que nao era relido depois do ajuste de preco — conserto no front.)

create or replace function public._oc_rotulo_categoria(p_categoria text)
returns text
language sql
immutable
set search_path = public
as $fn$
  -- Espelho de CATEGORIAS (src/types/cattle.ts). Quem mudar um, muda o outro; o teste compara os dois.
  select case p_categoria
    WHEN 'mamotes_m' THEN 'Mamotes M'
    WHEN 'desmama_m' THEN 'Desmama M'
    WHEN 'garrotes' THEN 'Garrotes'
    WHEN 'bois' THEN 'Bois'
    WHEN 'touros' THEN 'Touros'
    WHEN 'mamotes_f' THEN 'Mamotes F'
    WHEN 'desmama_f' THEN 'Desmama F'
    WHEN 'novilhas' THEN 'Novilhas'
    WHEN 'vacas' THEN 'Vacas'
    else p_categoria
  end
$fn$;
revoke all on function public._oc_rotulo_categoria(text) from public, anon;
grant execute on function public._oc_rotulo_categoria(text) to authenticated, service_role;

do $p$
declare v_def text; v_a text; v_b text;
begin
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'oc_sincronizar_entregas'
                   and md5(prosrc) = '20f2e321bf3545c9ab70a403dc9a9145') then
    raise exception 'OC-VENDA-ENTREGAS-01d: oc_sincronizar_entregas fora da origem esperada'; end if;
  v_def := pg_get_functiondef('public.oc_sincronizar_entregas'::regproc);
  if (length(v_def) - length(replace(v_def, 'Entrega %s cab', ''))) / length('Entrega %s cab') <> 2 then
    raise exception 'OC-VENDA-ENTREGAS-01d: a descricao da entrega nao ocorre 2x'; end if;
  v_a := $a$format('Entrega %s cab %s', r.cab, r.categoria)$a$;
  v_b := $b$format('Entrega %s cab %s', r.cab, public._oc_rotulo_categoria(r.categoria))$b$;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 2 then
    raise exception 'OC-VENDA-ENTREGAS-01d: ancora da descricao nao casa 2x'; end if;
  execute replace(v_def, v_a, v_b);
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'oc_sincronizar_entregas'
                   and md5(prosrc) = 'ddfff259242144df3a93205fadea37cf') then
    raise exception 'OC-VENDA-ENTREGAS-01d: oc_sincronizar_entregas com destino inesperado'; end if;
  if has_function_privilege('anon', 'public.oc_sincronizar_entregas(uuid, integer, boolean)', 'execute')
     or has_function_privilege('anon', 'public._oc_rotulo_categoria(text)', 'execute') then
    raise exception 'OC-VENDA-ENTREGAS-01d: ACL aberta'; end if;
end $p$;
