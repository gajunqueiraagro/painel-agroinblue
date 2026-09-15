-- PR-ESTOQUE-QUEBRA-01 (F2) — a baixa por quebra, e o estoque fechando em 100%.
--
-- ⚠ JA APLICADA NO PROTO pelo arquiteto em 15/09/2026, com GO do Gabriel. E' REGISTRO HISTORICO,
--   para que um banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ OS QUATRO CORPOS NAO FORAM REDIGITADOS: extraidos do banco vivo com `pg_get_functiondef` num
--   unico JSON em base64, decodificados e conferidos UM A UM pelo md5 (8 primeiros digitos, que e'
--   como o briefing os deu) —
--       a2ac2c03  agri_quebra_registrar       (1.181 bytes)
--       0827d8b6  fn_estoque_graos            (2.544 bytes)
--       8c2d908b  fn_estoque_graos_resumo     (2.513 bytes)
--       52dc9a7b  fn_estoque_graos_balanco    (3.450 bytes)
--   Os quatro bateram. Nenhum corpo foi "consertado".
--
-- O QUE ESTA FATIA FECHA: a coluna "Quebra" existia na tela desde a F1 imprimindo zero fixo —
--   um numero que nao vinha de lugar nenhum. Agora ha' onde registrar a perda fisica, e o saldo
--   passa a ser `colhido - entregue - quebra` nas TRES leituras.
--
-- ⚠⚠ A GUARDA MORA NO BANCO, NAO NA TELA. `agri_quebra_registrar` le' `fn_estoque_graos` — a
--   MESMA fonte que a tela le' — e recusa com `QUEBRA_ACIMA_DO_SALDO: % > %` antes de inserir.
--   O front tambem barra, mas o front e' conveniencia: quem garante que nao se baixa mais do que
--   se tem e' a funcao, porque ela e' a unica que nao da' para contornar.
--   Os outros dois avisos: `QUEBRA_CLASSE_SEM_ESTOQUE: %` quando a classe nao existe naquele
--   recorte, e `QUEBRA_QUANTIDADE_INVALIDA` para <= 0 (o CHECK da tabela diz o mesmo; a funcao
--   avisa com nome em vez de deixar o CHECK estourar).
--
-- ⚠ `classe` E' TEXTO LIVRE, SEM CHECK — igual a `agri_oc_entregas`, e de proposito: o dominio das
--   classes e' frente propria (CLASSES POR CULTURA). Um CHECK aqui com as tres classes do amendoim
--   impediria a primeira cultura que tiver outras.
--
-- ⚠ NAO HA' MOTIVO "SECAGEM", e a ausencia e' decisao: a colheita ja' grava peso verde -> seco em
--   `agri_colheita`. Uma quebra por secagem contaria a MESMA perda duas vezes. O CHECK admite
--   exatamente {umidade, praga, manuseio, outro}.
--
-- ⚠ A TOLERANCIA DE MEIO SACO SEGUE NO `saldo` do detalhe, agora sobre a conta com quebra:
--   `abs(colhido - entregue - quebra) < 0.5` zera. E `valor`/`valor_mercado` continuam sobre
--   `greatest(..., 0)` cru — a divergencia latente ja' registrada na `20261013120000` nao mudou
--   de natureza, so' ganhou um termo a mais na subtracao.
--
-- ⚠ AS TRES LEITURAS DESCONTAM EM LUGARES DIFERENTES, e vale saber qual faz o que:
--     fn_estoque_graos          — por CLASSE, e devolve a chave `quebra` para a tela mostrar;
--     fn_estoque_graos_resumo   — por CULTURA, desconta no `saldo` e no `valor` (nao expoe a chave);
--     fn_estoque_graos_balanco  — por SAFRA, a chave `quebra` da linha deixou de ser `0::numeric`
--                                 fixo e passou a somar de verdade; o `final` ja' subtraia.
--
-- ⚠ AS GRANTS DA TABELA SAO `ALL` PARA anon/authenticated/service_role, nao select/insert/update/
--   delete. Medido: e' o mesmo conjunto (`arwdDxtm`) de `agri_oc_entregas`, `agri_colheita` e
--   `agri_cotacao_graos` — vem da default-privilege do Supabase, nao de um grant explicito. A
--   migration reproduz o que ESTA' no banco.
-- ⚠ E A DEFESA REAL NAO E' A GRANT, e' a RLS: as quatro policies sao `using (true)` (o padrao
--   `*_open` das `agri_*`), entao o isolamento por cliente hoje vem do `cliente_id` que a RPC
--   escreve, nao da politica. E' divida conhecida da familia, herdada, nao criada aqui.
--
-- ⚠ A FUNCAO E' SECURITY DEFINER com EXECUTE so' para `authenticated` — medido: anon=false,
--   authenticated=true, public=false, nas quatro.

-- ── A TABELA ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.agri_estoque_movimentacoes (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null,
  safra_id uuid not null,
  cultura text not null,
  classe text,
  tipo text not null default 'quebra'::text,
  quantidade numeric not null,
  data_movimento date not null,
  motivo text not null,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  created_by uuid,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid,
  constraint agri_estoque_movimentacoes_pkey primary key (id),
  constraint agri_estoque_movimentacoes_safra_id_fkey foreign key (safra_id)
    references public.financeiro_safras(id),
  constraint agri_estoque_movimentacoes_tipo_check check ((tipo = 'quebra'::text)),
  constraint agri_estoque_movimentacoes_quantidade_check check ((quantidade > (0)::numeric)),
  constraint agri_estoque_movimentacoes_motivo_check check ((motivo = any (array['umidade'::text, 'praga'::text, 'manuseio'::text, 'outro'::text])))
);

comment on table public.agri_estoque_movimentacoes is
  'Movimentacoes de estoque de graos sem dinheiro. v1: tipo quebra = perda fisica por evento (F2, 15/09/2026). classe e texto livre (como agri_oc_entregas) ate CLASSES POR CULTURA definir o dominio; quantidade na unidade da cultura (sacas no amendoim). Secagem nao e motivo: ja esta em agri_colheita (peso verde -> seco).';

create index if not exists agri_estoque_movimentacoes_idx
  on public.agri_estoque_movimentacoes using btree (cliente_id, safra_id, cultura, classe)
  where ativo;

alter table public.agri_estoque_movimentacoes enable row level security;

create policy agri_estoque_movimentacoes_select_open on public.agri_estoque_movimentacoes
  for select using (true);
create policy agri_estoque_movimentacoes_insert_open on public.agri_estoque_movimentacoes
  for insert with check (true);
create policy agri_estoque_movimentacoes_update_open on public.agri_estoque_movimentacoes
  for update using (true);
create policy agri_estoque_movimentacoes_delete_open on public.agri_estoque_movimentacoes
  for delete using (true);

grant all on table public.agri_estoque_movimentacoes to anon, authenticated, service_role;

-- ── A ESCRITA ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agri_quebra_registrar(p_cliente uuid, p_safra_id uuid, p_cultura text, p_classe text, p_quantidade numeric, p_data date, p_motivo text, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_saldo numeric; v_id uuid;
begin
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'QUEBRA_QUANTIDADE_INVALIDA'; end if;
  select (it->>'saldo')::numeric into v_saldo
    from jsonb_array_elements(fn_estoque_graos(p_cliente, p_safra_id, p_cultura)) it where it->>'classe' = p_classe;
  if v_saldo is null then raise exception 'QUEBRA_CLASSE_SEM_ESTOQUE: %', p_classe; end if;
  if p_quantidade > v_saldo then raise exception 'QUEBRA_ACIMA_DO_SALDO: % > %', p_quantidade, v_saldo; end if;
  insert into agri_estoque_movimentacoes(cliente_id, safra_id, cultura, classe, tipo, quantidade, data_movimento, motivo, observacoes, created_by, updated_by)
  values (p_cliente, p_safra_id, p_cultura, p_classe, 'quebra', p_quantidade, p_data, p_motivo, p_observacoes, auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end $function$;

-- ── AS TRES LEITURAS, com quebra ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_estoque_graos(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_res jsonb;
begin
  with colhido as (
    select case when c.aflatoxina_ppb>20 then 'acima_20' else 'ate_20' end classe, sum(c.sacas_boas) sc
    from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo group by 1
    union all
    select 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo
  ),
  colh as (select classe, sum(sc) colhido from colhido group by 1),
  entregue as (
    select e.classe_aflatoxina classe, sum(e.sacas) entregue, sum(e.sacas*e.preco_saca)/nullif(sum(e.sacas),0) preco
    from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente and o.cultura=p_cultura group by 1
  ),
  mercado as (
    select distinct on (classe_aflatoxina) classe_aflatoxina classe, preco_saca, data_referencia
    from agri_cotacao_graos where cliente_id=p_cliente and cultura=p_cultura
    order by classe_aflatoxina, data_referencia desc
  ),
  quebra as (
    select classe, sum(quantidade) quebra from agri_estoque_movimentacoes
    where cliente_id=p_cliente and safra_id=p_safra_id and cultura=p_cultura and tipo='quebra' and ativo group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'classe', classe, 'colhido', round(coalesce(colhido,0),2), 'entregue', round(coalesce(entregue,0),2), 'quebra', round(coalesce(quebra,0),2),
    'saldo', case when abs(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0))<0.5 then 0 else round(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),2) end,
    'preco_ref', round(coalesce(preco,0),2),
    'valor', round(greatest(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),0)*coalesce(preco,0),2),
    'preco_mercado', round(coalesce(m.preco_saca,0),2),
    'data_mercado', m.data_referencia,
    'valor_mercado', round(greatest(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),0)*coalesce(m.preco_saca,0),2)
  ) order by classe) into v_res from colh full outer join entregue using(classe) left join quebra qb using(classe) left join mercado m using(classe);
  return coalesce(v_res,'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_graos_resumo(p_cliente uuid, p_safra_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_res jsonb;
begin
  with culturas as (
    select distinct a.cultura from agri_safra_area a
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.ativo and a.cultura is not null
  ),
  colhido as (
    select a.cultura, case when c.aflatoxina_ppb>20 then 'acima_20' else 'ate_20' end classe, sum(c.sacas_boas) sc
    from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and c.ativo group by 1,2
    union all
    select a.cultura, 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and c.ativo group by a.cultura
  ),
  entregue as (
    select o.cultura, e.classe_aflatoxina classe, sum(e.sacas) sc
    from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente group by 1,2
  ),
  mercado as (
    select distinct on (cultura, classe_aflatoxina) cultura, classe_aflatoxina classe, preco_saca
    from agri_cotacao_graos where cliente_id=p_cliente order by cultura, classe_aflatoxina, data_referencia desc
  ),
  quebra as (
    select cultura, classe, sum(quantidade) sc from agri_estoque_movimentacoes
    where cliente_id=p_cliente and safra_id=p_safra_id and tipo='quebra' and ativo group by 1,2
  ),
  base as (
    select co.cultura, co.classe,
      coalesce(co.sc,0) colhido,
      greatest(coalesce(co.sc,0)-coalesce(en.sc,0)-coalesce(qb.sc,0),0) saldo,
      coalesce(m.preco_saca,0) preco
    from colhido co
    left join entregue en on en.cultura=co.cultura and en.classe=co.classe
    left join quebra qb on qb.cultura=co.cultura and qb.classe=co.classe
    left join mercado m on m.cultura=co.cultura and m.classe=co.classe
  ),
  por_cultura as (
    select cultura, round(sum(saldo),2) saldo, round(sum(colhido),2) colhido, round(sum(saldo*preco),2) valor
    from base group by cultura
  )
  select jsonb_agg(jsonb_build_object(
    'cultura', cu.cultura, 'saldo', coalesce(pc.saldo,0),
    'colhido', coalesce(pc.colhido,0), 'valor', coalesce(pc.valor,0)
  ) order by cu.cultura)
  into v_res from culturas cu left join por_cultura pc on pc.cultura=cu.cultura;
  return coalesce(v_res,'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_estoque_graos_balanco(p_cliente uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_linhas jsonb:='[]'::jsonb; v_inicial numeric:=0; v_valor_total numeric; rec record;
begin
  for rec in
    with safras as (
      select distinct s.id, s.codigo, s.data_inicio
      from financeiro_safras s join agri_safra_area a on a.safra_id=s.id
      where s.cliente_id=p_cliente and a.cliente_id=p_cliente and a.cultura=p_cultura and a.ativo
    ),
    colhido as (
      select a.safra_id, sum(c.sacas_boas+c.grao_roca_sacas) sc
      from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
      where a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo group by a.safra_id
    ),
    saidas as (
      select o.safra_id,
        sum(e.sacas) filter (where o.condicao_pagamento='barter') barter,
        sum(e.sacas) filter (where o.condicao_pagamento='dinheiro') venda
      from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
      where e.cliente_id=p_cliente and o.cultura=p_cultura group by o.safra_id
    ),
    quebra as (
      select safra_id, sum(quantidade) sc from agri_estoque_movimentacoes
      where cliente_id=p_cliente and cultura=p_cultura and tipo='quebra' and ativo group by safra_id
    )
    select sf.codigo, round(coalesce(co.sc,0),2) producao, round(coalesce(sa.venda,0),2) venda,
      round(coalesce(sa.barter,0),2) barter, round(coalesce(qb.sc,0),2) quebra
    from safras sf left join colhido co on co.safra_id=sf.id left join saidas sa on sa.safra_id=sf.id left join quebra qb on qb.safra_id=sf.id
    order by sf.data_inicio, sf.codigo
  loop
    v_linhas := v_linhas || jsonb_build_object(
      'safra', rec.codigo, 'inicial', round(v_inicial,2), 'producao', rec.producao,
      'venda', rec.venda, 'barter', rec.barter, 'quebra', rec.quebra,
      'final', round(v_inicial + rec.producao - rec.venda - rec.barter - rec.quebra,2)
    );
    v_inicial := v_inicial + rec.producao - rec.venda - rec.barter - rec.quebra;
  end loop;

  with colhido_cl as (
    select case when c.aflatoxina_ppb>20 then 'acima_20' else 'ate_20' end classe, sum(c.sacas_boas) sc
    from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo group by 1
    union all
    select 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo
  ),
  colh as (select classe, sum(sc) sc from colhido_cl group by 1),
  entregue_cl as (
    select e.classe_aflatoxina classe, sum(e.sacas) sc from agri_oc_entregas e
    join agri_operacoes_comerciais o on o.id=e.operacao_id
    where e.cliente_id=p_cliente and o.cultura=p_cultura group by 1
  ),
  mercado as (
    select distinct on (classe_aflatoxina) classe_aflatoxina classe, preco_saca
    from agri_cotacao_graos where cliente_id=p_cliente and cultura=p_cultura
    order by classe_aflatoxina, data_referencia desc
  )
  select round(sum(greatest(coalesce(co.sc,0)-coalesce(en.sc,0),0)*coalesce(m.preco_saca,0)),2)
  into v_valor_total
  from colh co left join entregue_cl en using(classe) left join mercado m using(classe);

  return jsonb_build_object('linhas', v_linhas, 'valor_mercado_total', coalesce(v_valor_total,0));
end $function$;

revoke all on function public.agri_quebra_registrar(uuid, uuid, text, text, numeric, date, text, text) from public;
grant execute on function public.agri_quebra_registrar(uuid, uuid, text, text, numeric, date, text, text) to authenticated;
revoke all on function public.fn_estoque_graos(uuid, uuid, text) from public;
grant execute on function public.fn_estoque_graos(uuid, uuid, text) to authenticated;
revoke all on function public.fn_estoque_graos_resumo(uuid, uuid) from public;
grant execute on function public.fn_estoque_graos_resumo(uuid, uuid) to authenticated;
revoke all on function public.fn_estoque_graos_balanco(uuid, text) from public;
grant execute on function public.fn_estoque_graos_balanco(uuid, text) to authenticated;
