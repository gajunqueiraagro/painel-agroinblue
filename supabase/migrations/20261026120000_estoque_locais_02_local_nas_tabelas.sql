-- PR-ESTOQUE-EL-02 — o grão passa a ter lugar: `local_estoque_id` nas três tabelas de movimento.
--
-- ⚠ JA APLICADA NO PROTO pelo arquiteto em 15/09/2026, com GO do Gabriel. E' REGISTRO HISTORICO.
--   Nao foi reaplicada.
--
-- ⚠ OS CINCO CORPOS FORAM EXTRAIDOS DO BANCO, NAO DIGITADOS, e conferidos por md5 do
--   `pg_get_functiondef`:
--     agri_local_estoque_default   aa58c831…  (   714 caracteres)
--     fn_estoque_graos             244827e4…  ( 2.875)
--     fn_estoque_graos_resumo      37d74d71…  ( 3.022)
--     fn_estoque_graos_balanco     024da59b…  ( 3.670)
--     fn_estoque_graos_por_local   1eafaa65…  ( 1.605)  NOVA
--
-- ⚠⚠ A ORDEM DESTE ARQUIVO E' A ORDEM REAL, e ela nao e' negociavel: coluna NULA -> backfill ->
--   trigger -> NOT NULL. `not null` antes do backfill recusaria a propria migration; a trigger
--   antes do backfill nao ajudaria, porque ela so' age em INSERT e as 101 linhas ja existiam.
-- ⚠ CONFERIDO NO BANCO ANTES DE ESCREVER: as tres colunas estao `is_nullable = NO`, as tres
--   triggers existem com o nome `trg_local_default`, e o backfill alcancou 86 colheitas,
--   13 entregas e 2 movimentacoes — todas no unico local do cliente NJ.
--
-- ⚠⚠ A TRIGGER E' A REGRA 2.3 DA SPEC ESCRITA NO BANCO, e e' ela que permite este PR nao tocar
--   em modal nenhum: com UM local ativo ela preenche sozinha, e os modais de hoje continuam
--   gravando sem saber que a coluna existe. Com ZERO recusa com `LOCAL_ESTOQUE_NAO_CADASTRADO`;
--   com DOIS OU MAIS recusa com `LOCAL_ESTOQUE_OBRIGATORIO`, porque adivinhar entre dois seria
--   escolher onde o grao esta' — e isso e' do operador. O EL-03 leva o campo aos modais.
--   ⚠ ATE' LA', CADASTRAR UM SEGUNDO LOCAL TRAVA AS ESCRITAS. E' consequencia conhecida e aceita
--     no briefing (a homologacao pede justamente para provocar o erro e depois desativar).
--
-- ⚠ `safra_id` VIRA NOT NULL em `agri_operacoes_comerciais`. Ele ja era obrigatorio por regra de
--   produto — o PR-BARTER-VENDA-OBRIG-01 anotou que a tela era a UNICA guarda dele. Agora o banco
--   cobra: uma venda sem safra somia dos filtros por safra sem erro nenhum.
--
-- ⚠ AS QUATRO `fn_*` GANHARAM `p_local_id uuid default null`, e o `default null` e' o contrato de
--   compatibilidade: chamada sem o parametro = todos os locais = o comportamento de hoje. Dentro,
--   o filtro e' sempre `(p_local_id is null or <tabela>.local_estoque_id = p_local_id)` — um
--   predicado que desaparece quando nao ha' filtro, em vez de dois caminhos de codigo.
-- ⚠ O DROP DAS ASSINATURAS ANTIGAS VEM ANTES DO CREATE: acrescentar um argumento com default cria
--   uma SOBRECARGA, nao substitui. Com as duas vivas, o PostgREST escolheria por nome de argumento
--   e a chamada sem `p_local_id` casaria com a velha — que nao filtra e nao sabe disso.

alter table agri_colheita               add column if not exists local_estoque_id uuid references agri_locais_estoque(id);
alter table agri_oc_entregas            add column if not exists local_estoque_id uuid references agri_locais_estoque(id);
alter table agri_estoque_movimentacoes  add column if not exists local_estoque_id uuid references agri_locais_estoque(id);

comment on column agri_colheita.local_estoque_id is 'Local de estoque onde a carga entrou (EL-02). filial fica como historico.';
comment on column agri_oc_entregas.local_estoque_id is 'Local de estoque de onde o grao saiu (EL-02).';
comment on column agri_estoque_movimentacoes.local_estoque_id is 'Local de estoque da movimentacao (EL-02).';

-- ── BACKFILL — NJ tem um local so', e e' ele que recebe tudo o que ja existia ────────────────
-- ⚠ IDEMPOTENTE POR CONSTRUCAO: `local_estoque_id is null` so' e' verdade uma vez por linha.
update agri_colheita              set local_estoque_id = 'c2357d59-d9f6-4e7f-9f2a-c59e46ec70cc' where cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' and local_estoque_id is null;
update agri_oc_entregas           set local_estoque_id = 'c2357d59-d9f6-4e7f-9f2a-c59e46ec70cc' where cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' and local_estoque_id is null;
update agri_estoque_movimentacoes set local_estoque_id = 'c2357d59-d9f6-4e7f-9f2a-c59e46ec70cc' where cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' and local_estoque_id is null;

CREATE OR REPLACE FUNCTION public.agri_local_estoque_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_n int; v_id uuid;
begin
  if new.local_estoque_id is not null then return new; end if;
  select count(*), (array_agg(id))[1] into v_n, v_id from agri_locais_estoque where cliente_id = new.cliente_id and ativo;
  if v_n = 1 then new.local_estoque_id := v_id; return new; end if;
  if v_n = 0 then raise exception 'LOCAL_ESTOQUE_NAO_CADASTRADO: cadastre um local de estoque antes de movimentar grao'; end if;
  raise exception 'LOCAL_ESTOQUE_OBRIGATORIO: o cliente tem % locais ativos; informe local_estoque_id', v_n;
end $function$
;

create trigger trg_local_default before insert on agri_colheita              for each row execute function agri_local_estoque_default();
create trigger trg_local_default before insert on agri_oc_entregas           for each row execute function agri_local_estoque_default();
create trigger trg_local_default before insert on agri_estoque_movimentacoes for each row execute function agri_local_estoque_default();

-- ── SO' AGORA O NOT NULL ─────────────────────────────────────────────────────────────────────
alter table agri_colheita              alter column local_estoque_id set not null;
alter table agri_oc_entregas           alter column local_estoque_id set not null;
alter table agri_estoque_movimentacoes alter column local_estoque_id set not null;

alter table agri_operacoes_comerciais  alter column safra_id set not null;

-- ── AS QUATRO LEITURAS ───────────────────────────────────────────────────────────────────────
drop function if exists public.fn_estoque_graos(uuid,uuid,text);
drop function if exists public.fn_estoque_graos_resumo(uuid,uuid);
drop function if exists public.fn_estoque_graos_balanco(uuid,text);

CREATE OR REPLACE FUNCTION public.fn_estoque_graos(p_cliente uuid, p_safra_id uuid, p_cultura text, p_local_id uuid DEFAULT NULL::uuid)
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
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo and (p_local_id is null or c.local_estoque_id=p_local_id) group by 1
    union all
    select 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo and (p_local_id is null or c.local_estoque_id=p_local_id)
  ),
  colh as (select classe, sum(sc) colhido from colhido group by 1),
  entregue as (
    select e.classe_aflatoxina classe, sum(e.sacas) entregue, sum(e.valor)/nullif(sum(e.sacas),0) preco, sum(e.valor) recebido
    from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente and o.cultura=p_cultura and o.ativo and (p_local_id is null or e.local_estoque_id=p_local_id) group by 1
  ),
  mercado as (
    select distinct on (classe_aflatoxina) classe_aflatoxina classe, preco_saca, data_referencia
    from agri_cotacao_graos where cliente_id=p_cliente and cultura=p_cultura
    order by classe_aflatoxina, data_referencia desc
  ),
  quebra as (
    select classe, sum(quantidade) quebra from agri_estoque_movimentacoes
    where cliente_id=p_cliente and safra_id=p_safra_id and cultura=p_cultura and tipo='quebra' and ativo and (p_local_id is null or local_estoque_id=p_local_id) group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'classe', classe, 'colhido', round(coalesce(colhido,0),2), 'entregue', round(coalesce(entregue,0),2), 'quebra', round(coalesce(quebra,0),2), 'recebido', round(coalesce(recebido,0),2),
    'saldo', case when abs(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0))<0.5 then 0 else round(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),2) end,
    'preco_ref', round(coalesce(preco,0),2),
    'valor', round(greatest(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),0)*coalesce(preco,0),2),
    'preco_mercado', round(coalesce(m.preco_saca,0),2),
    'data_mercado', m.data_referencia,
    'valor_mercado', round(greatest(coalesce(colhido,0)-coalesce(entregue,0)-coalesce(quebra,0),0)*coalesce(m.preco_saca,0),2)
  ) order by classe) into v_res from colh full outer join entregue using(classe) left join quebra qb using(classe) left join mercado m using(classe);
  return coalesce(v_res,'[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_estoque_graos_resumo(p_cliente uuid, p_safra_id uuid, p_local_id uuid DEFAULT NULL::uuid)
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
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and c.ativo and (p_local_id is null or c.local_estoque_id=p_local_id) group by 1,2
    union all
    select a.cultura, 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and c.ativo and (p_local_id is null or c.local_estoque_id=p_local_id) group by a.cultura
  ),
  entregue as (
    select o.cultura, e.classe_aflatoxina classe, sum(e.sacas) sc, sum(e.valor) recebido
    from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente and o.ativo and (p_local_id is null or e.local_estoque_id=p_local_id) group by 1,2
  ),
  mercado as (
    select distinct on (cultura, classe_aflatoxina) cultura, classe_aflatoxina classe, preco_saca
    from agri_cotacao_graos where cliente_id=p_cliente order by cultura, classe_aflatoxina, data_referencia desc
  ),
  quebra as (
    select cultura, classe, sum(quantidade) sc from agri_estoque_movimentacoes
    where cliente_id=p_cliente and safra_id=p_safra_id and tipo='quebra' and ativo and (p_local_id is null or local_estoque_id=p_local_id) group by 1,2
  ),
  base as (
    select co.cultura, co.classe,
      coalesce(co.sc,0) colhido,
      coalesce(en.sc,0) entregue, coalesce(en.recebido,0) recebido,
      greatest(coalesce(co.sc,0)-coalesce(en.sc,0)-coalesce(qb.sc,0),0) saldo,
      coalesce(m.preco_saca,0) preco
    from colhido co
    left join entregue en on en.cultura=co.cultura and en.classe=co.classe
    left join quebra qb on qb.cultura=co.cultura and qb.classe=co.classe
    left join mercado m on m.cultura=co.cultura and m.classe=co.classe
  ),
  por_cultura as (
    select cultura, round(sum(saldo),2) saldo, round(sum(colhido),2) colhido, round(sum(entregue),2) entregue, round(sum(recebido),2) recebido, round(sum(saldo*preco),2) valor
    from base group by cultura
  )
  select jsonb_agg(jsonb_build_object(
    'cultura', cu.cultura, 'saldo', coalesce(pc.saldo,0),
    'colhido', coalesce(pc.colhido,0), 'entregue', coalesce(pc.entregue,0), 'recebido', coalesce(pc.recebido,0), 'valor', coalesce(pc.valor,0)
  ) order by cu.cultura)
  into v_res from culturas cu left join por_cultura pc on pc.cultura=cu.cultura;
  return coalesce(v_res,'[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_estoque_graos_balanco(p_cliente uuid, p_cultura text, p_local_id uuid DEFAULT NULL::uuid)
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
      where a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo and (p_local_id is null or c.local_estoque_id=p_local_id) group by a.safra_id
    ),
    saidas as (
      select o.safra_id,
        sum(e.sacas) filter (where o.condicao_pagamento='barter') barter,
        sum(e.sacas) filter (where o.condicao_pagamento='dinheiro') venda
      from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
      where e.cliente_id=p_cliente and o.cultura=p_cultura and o.ativo and (p_local_id is null or e.local_estoque_id=p_local_id) group by o.safra_id
    ),
    quebra as (
      select safra_id, sum(quantidade) sc from agri_estoque_movimentacoes
      where cliente_id=p_cliente and cultura=p_cultura and tipo='quebra' and ativo and (p_local_id is null or local_estoque_id=p_local_id) group by safra_id
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
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_estoque_graos_por_local(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with colhido as (
    select c.local_estoque_id local_id, sum(c.sacas_boas + coalesce(c.grao_roca_sacas,0)) sc
    from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo group by 1),
  entregue as (
    select e.local_estoque_id local_id, sum(e.sacas) sc
    from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente and o.cultura=p_cultura and o.ativo group by 1),
  quebra as (
    select local_estoque_id local_id, sum(quantidade) sc from agri_estoque_movimentacoes
    where cliente_id=p_cliente and safra_id=p_safra_id and cultura=p_cultura and tipo='quebra' and ativo group by 1)
  select coalesce(jsonb_agg(jsonb_build_object(
    'local_id', l.id, 'nome', l.nome, 'tipo', l.tipo,
    'colhido', round(coalesce(co.sc,0),2), 'entregue', round(coalesce(en.sc,0),2), 'quebra', round(coalesce(qb.sc,0),2),
    'saldo', round(coalesce(co.sc,0)-coalesce(en.sc,0)-coalesce(qb.sc,0),2)
  ) order by l.nome), '[]'::jsonb)
  from agri_locais_estoque l
  left join colhido co on co.local_id=l.id left join entregue en on en.local_id=l.id left join quebra qb on qb.local_id=l.id
  where l.cliente_id=p_cliente and (l.ativo or co.sc is not null or en.sc is not null or qb.sc is not null);
$function$
;

revoke all on function public.fn_estoque_graos(uuid, uuid, text, uuid) from public;
grant execute on function public.fn_estoque_graos(uuid, uuid, text, uuid) to authenticated;
revoke all on function public.fn_estoque_graos_resumo(uuid, uuid, uuid) from public;
grant execute on function public.fn_estoque_graos_resumo(uuid, uuid, uuid) to authenticated;
revoke all on function public.fn_estoque_graos_balanco(uuid, text, uuid) from public;
grant execute on function public.fn_estoque_graos_balanco(uuid, text, uuid) to authenticated;
revoke all on function public.fn_estoque_graos_por_local(uuid, uuid, text) from public;
grant execute on function public.fn_estoque_graos_por_local(uuid, uuid, text) to authenticated;
