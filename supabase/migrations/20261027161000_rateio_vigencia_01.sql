-- 20261027161000_rateio_vigencia_01.sql
-- RATEIO-VIGENCIA-01: o rateio administrativo passa a olhar QUAIS ATIVIDADES EXISTEM EM CADA MES. Decisoes do Gabriel e
-- do Chat, 28/09/2026. Retroativo: todo o historico de todos os clientes; os DREs recalculam sozinhos (nada e' gravado).
--
-- O DEFEITO: `agri_rateio_admin` guarda uma chave por ANO CIVIL, e os quatro leitores aplicavam a chave do ano a todos os
-- meses do ano, existisse ou nao a atividade. NJ 2023 (80/15/5): a lavoura so' comeca em jul/23 e a silvicultura nao tem DRE
-- nenhum — R$ 115.592,95 do administrativo de 2023 nao apareciam em DRE nenhum. A pecuaria ficava com custo fixo a menos.
--
-- A FUNCAO UNICA `fn_rateio_admin_mes(cliente, de, ate, cenario, safra)`: uma linha por lancamento administrativo (ou linha de
-- planejamento, na meta) com o PESO de cada atividade no mes dele. Os quatro leitores passam a usa-la — `fn_dre_pecuaria`,
-- `fn_dre_lavoura`, `fn_dre_agricola_por_safra` e `fn_painel_rateio_detalhe` — e a LISTA DE EXCLUSAO DE MACROS mora so' nela
-- (antes eram cinco copias, e a do Painel Safra nao tinha 'Tributos').
--   Existencia no mes:  pecuaria     = rebanho > 0 (zoot_mensal_cache realizado OU valor_rebanho_fechamento_itens); depois
--                                      do ULTIMO mes com dado de rebanho do cliente, herda a existencia daquele mes (mes futuro)
--                       agricultura  = safra agricola com area plantada cobrindo o mes
--                       silvicultura = o cliente tem lancamento de silvicultura (realizado) desde o primeiro (decisao 3)
--   Regra (decisao 4):  nenhuma existe            -> tudo nao alocado ('mes sem atividade')
--                       so' uma existe            -> 100% dela
--                       mais de uma, sem chave    -> tudo nao alocado ('mes sem chave')
--                       mais de uma, com chave    -> a chave do ano, renormalizada so' sobre as que existem
--                                                    (se ela zera todas: nao alocado, 'chave zera as atividades do mes')
--   A parte da SILVICULTURA vai para "nao alocado", visivel, ate existir DRE dela (decisao 2, opcao A).
--   INVARIANTE (decisao 8), verificado na propria funcao: pecuaria + agricultura + silvicultura + nao alocado = 1 em todo
--   mes; ela aborta se nao fechar.
--   ANO SEM CHAVE deixa de ser 0% calado (o `coalesce(percentual,0)` saiu com os leitores).
--   CONTA DUPLA NA LAVOURA (item 9): com `p_safra`, o peso da agricultura de um mes e' multiplicado pela fatia de area plantada
--   daquela safra entre TODAS as safras plantadas que cobrem o mes. A soma das fatias e' 1 — a parte de um mes nunca aparece
--   em duas safras. Safra sem area plantada recebe zero (o NJ tem -Lav, -AMD e -MAND por periodo; so' a -Lav tem cultura).
-- ⚠ SECURITY INVOKER de proposito: chamada direto, respeita a RLS de quem chama; dentro dos leitores SECURITY DEFINER roda
--   como o dono, como o resto do corpo deles.
--
-- OS QUATRO LEITORES: PATCH GUARDADO POR md5 (origem, ancoras que casam 1x, destino), por BLOCO — o trecho entre duas ancoras
-- unicas e' trocado inteiro; a guarda de origem garante que o trecho e' o esperado.
--   fn_dre_pecuaria            e9b5b5dcd2ca2c9cf902ff7b07892b51 -> 41f7f0986a647099ee3bd8dd6b08b74c
--   fn_dre_lavoura             2108094b3146b145ebdd73e24d56953d -> eece80eb967a179a41752401d5ab7ced
--   fn_dre_agricola_por_safra  7aad0a266d7b8eadae903a576b9573ac -> 604e6948f84ba9f7cd5638fea1621a56
--   fn_painel_rateio_detalhe   634705c39f0452f98ad9c09cf2daaeb8 -> 7472a39323ab4528aac56c04727824ef
-- Chave nova (aditiva): `rateio_adm.nao_alocado` em `fn_dre_pecuaria` e `nao_alocado` em `fn_painel_rateio_detalhe` (admin):
--   { valor, silvicultura, outros, motivos: [{motivo, valor}] }.
--   fn_rateio_admin_mes        (nova)                           -> 0f115ffb9f29b379b4e27cd9af575c8f
-- PROVA (rollback no proto, 28/09/2026, antes de aplicar):
--   fn_dre_pecuaria realizado, 49 cliente-ano (7 clientes x 2020-2026, jsonb por valor, tirada a chave nova): mudam SO' NJ 2023
--   (Lucro operacional 3.672.308,97 -> 3.604.289,07; nao alocado 47.573,04), NJ 2026 (2.791.954,04 -> 2.753.788,51) e Raul 2021
--   (-3,90); meta 49 de 49 identica (rateio 0). Lavoura: as tres -Lav identicas no DRE; -AMD/-MAND/26/27 com parte 0; o Painel
--   Safra passa a bater com o DRE (23/24 227.329,53 -> 222.044,34). Invariante em 385 cliente-meses, zero quebra.
--   A regra do mes futuro, contra a versao sem ela: 9.895 linhas ate' 2026-12 identicas; mudam so' as 60 de 2027 (NJ e SR com
--   pecuaria + silvicultura, Vera 100% pecuaria) e as 24 das safras 26/27 em 2027 (parte da safra 0 nas duas).

do $g$
begin
  if exists (select 1 from pg_proc where proname='fn_rateio_admin_mes' and pronamespace='public'::regnamespace) then
    raise exception 'fn_rateio_admin_mes ja existe: esta migration a cria, nao a substitui';
  end if;
end $g$;

create or replace function public.fn_rateio_admin_mes(
  p_cliente uuid, p_de text, p_ate text, p_cenario text default 'realizado', p_safra uuid default null)
returns table (
  ano_mes text, lancamento_id uuid, data_competencia date, valor numeric, grupo text, subcentro text, origem text,
  descricao text, favorecido_id uuid, fazenda_id uuid, data_pagamento date, status_transacao text,
  peso_pecuaria numeric, peso_agricultura numeric, peso_agricultura_mes numeric, peso_silvicultura numeric,
  peso_nao_alocado numeric, motivo text, tem_chave boolean,
  existe_pecuaria boolean, existe_agricultura boolean, existe_silvicultura boolean)
language plpgsql stable security invoker set search_path to 'pg_catalog', 'public'
as $fn$
#variable_conflict use_column
declare
  v_ini date := to_date(left(p_de,7)||'-01','YYYY-MM-DD');
  v_fim date := (to_date(left(p_ate,7)||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  rec record;
begin
  /* ⚠ SEM TABELA TEMPORARIA: a funcao e' STABLE e roda dentro de transacao read only (os DREs sao lidos assim). O laco
     confere o INVARIANTE linha a linha — toda linha de um mes carrega os pesos do mes, entao conferir cada uma e' conferir
     todos os meses. */
  for rec in
  with base as (
    /* ⚠ A LISTA DE EXCLUSAO DE MACROS MORA SO' AQUI. */
    select to_char(l.data_competencia,'YYYY-MM') am, l.id, l.data_competencia dt, l.valor vl,
           coalesce(l.centro_custo,'(sem)') gr,
           (select pcs.subcentro from financeiro_plano_contas pcs where pcs.id=l.plano_conta_id) sub,
           'lancamento'::text org, l.descricao ds, l.favorecido_id fav, l.fazenda_id faz, l.data_pagamento pg, l.status_transacao st
    from financeiro_lancamentos_v2 l
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario
      and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas'
      and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
      and l.data_competencia between v_ini and v_fim
    union all
    select to_char(make_date(pf.ano, pf.mes, 1),'YYYY-MM'), pf.id, make_date(pf.ano, pf.mes, 1), pf.valor_planejado,
           coalesce(p.centro_custo,'(sem)'), p.subcentro, 'planejamento'::text, pf.subcentro, null::uuid, pf.fazenda_id,
           null::date, null::text
    from planejamento_financeiro pf
    join financeiro_plano_contas p on p.subcentro=pf.subcentro and p.escopo_negocio=pf.escopo_negocio
         and (p.cliente_id is null or p.cliente_id=pf.cliente_id) and p.ativo
    where p_cenario='meta' and pf.cenario='meta' and pf.cliente_id=p_cliente
      and make_date(pf.ano, pf.mes, 1) between v_ini and v_fim
      and p.escopo_negocio='administrativo' and p.tipo_operacao='2-Saídas'
      and p.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
  ),
  meses as (select distinct am from base),
  pec as (
    select z.ano_mes am from zoot_mensal_cache z
     where z.cliente_id=p_cliente and z.cenario='realizado' and z.ano_mes in (select am from meses)
     group by 1 having sum(z.saldo_final) > 0
    union
    select i.ano_mes from valor_rebanho_fechamento_itens i
     where i.cliente_id=p_cliente and i.ano_mes in (select am from meses)
     group by 1 having sum(i.quantidade) > 0
  ),
  safra_area as (
    select s.id, to_char(s.data_inicio,'YYYY-MM') de, to_char(s.data_fim,'YYYY-MM') ate, sum(a.area_plantada_ha) ha
      from financeiro_safras s
      join agri_safra_area a on a.safra_id=s.id and a.cliente_id=p_cliente and a.ativo and a.status='plantada'
     where s.cliente_id=p_cliente and s.escopo_negocio='agricultura' and s.data_inicio is not null and s.data_fim is not null
     group by 1,2,3 having sum(a.area_plantada_ha) > 0
  ),
  lav as (
    select m.am, sum(sa.ha) ha_total, coalesce(sum(sa.ha) filter (where sa.id = p_safra), 0) ha_safra
      from meses m join safra_area sa on m.am between sa.de and sa.ate
     group by 1
  ),
  silv as (
    select min(to_char(l.data_competencia,'YYYY-MM')) desde from financeiro_lancamentos_v2 l
     where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario='realizado'
       and l.escopo_negocio='silvicultura'
  ),
  /* ⚠ MES FUTURO (decisao do Gabriel): depois do ULTIMO mes com dado de rebanho do cliente (cache realizado ou fechamento),
     a pecuaria HERDA a existencia daquele mes. Antes dele vale so' o dado do proprio mes. Sem isto, os previstos de 2027
     (sem cache) caiam em "so' silvicultura" ou em "mes sem atividade". */
  ult as (
    select u.am ult_am,
           (exists (select 1 from zoot_mensal_cache z where z.cliente_id=p_cliente and z.cenario='realizado' and z.ano_mes=u.am
                     group by z.ano_mes having sum(z.saldo_final) > 0)
            or exists (select 1 from valor_rebanho_fechamento_itens i where i.cliente_id=p_cliente and i.ano_mes=u.am
                     group by i.ano_mes having sum(i.quantidade) > 0)) ep_ult
      from (select max(x.am) am from (
              select max(z.ano_mes) am from zoot_mensal_cache z where z.cliente_id=p_cliente and z.cenario='realizado'
              union all
              select max(i.ano_mes) from valor_rebanho_fechamento_itens i where i.cliente_id=p_cliente) x) u
  ),
  chave as (
    select r.ano,
           coalesce(max(r.percentual) filter (where r.atividade='pecuaria'),0)/100.0 pp,
           coalesce(max(r.percentual) filter (where r.atividade='agricultura'),0)/100.0 pa,
           coalesce(max(r.percentual) filter (where r.atividade='silvicultura'),0)/100.0 ps
      from agri_rateio_admin r where r.cliente_id=p_cliente group by 1
  ),
  /* ⚠ MATERIALIZED, E A EXISTENCIA POR JOIN: sem isto o planejador embute este CTE e reavalia as subconsultas de rebanho e
     de silvicultura a cada referencia de `ep`/`el`/`es` nos CASE abaixo — medido, 2 s no NJ 2023 contra 0,33 s assim. */
  ex as materialized (
    select m.am,
           (pc.am is not null or coalesce(m.am > ut.ult_am and ut.ep_ult, false))::int ep,
           (l.am is not null)::int el,
           (coalesce(m.am >= sv.desde, false))::int es,
           coalesce(l.ha_total,0) ha_total, coalesce(l.ha_safra,0) ha_safra,
           k.ano is not null tk, coalesce(k.pp,0) pp, coalesce(k.pa,0) pa, coalesce(k.ps,0) ps
      from meses m cross join silv sv cross join ult ut left join pec pc on pc.am=m.am left join lav l on l.am=m.am
           left join chave k on k.ano=left(m.am,4)::int
  ),
  peso as (
    select e.*, e.ep+e.el+e.es n, e.pp*e.ep+e.pa*e.el+e.ps*e.es den from ex e
  ),
  w as (
    select p.am, p.tk, p.ep, p.el, p.es, p.ha_total, p.ha_safra,
      case when p.n=1 then p.ep::numeric when p.n>1 and p.tk and p.den>0 then p.pp*p.ep/p.den else 0 end wp,
      case when p.n=1 then p.el::numeric when p.n>1 and p.tk and p.den>0 then p.pa*p.el/p.den else 0 end wa,
      case when p.n=1 then p.es::numeric when p.n>1 and p.tk and p.den>0 then p.ps*p.es/p.den else 0 end ws,
      case when p.n=0 then 1 when p.n>1 and not p.tk then 1 when p.n>1 and p.den=0 then 1 else 0 end::numeric wn,
      case when p.n=0 then 'mes sem atividade' when p.n>1 and not p.tk then 'mes sem chave'
           when p.n>1 and p.den=0 then 'chave zera as atividades do mes' end mot
      from peso p
  )
  select b.am, b.id, b.dt, b.vl, b.gr, b.sub, b.org, b.ds, b.fav, b.faz, b.pg, b.st,
         w.wp,
         /* ⚠ A FATIA DA SAFRA: sem `p_safra` e' o peso inteiro; com ela, so' a parte de area dela no mes. */
         case when p_safra is null then w.wa when w.ha_total > 0 then w.wa * w.ha_safra / w.ha_total else 0 end wa_safra,
         w.wa, w.ws, w.wn, w.mot, w.tk, w.ep=1 xp, w.el=1 xl, w.es=1 xs
    from base b join w on w.am=b.am
  loop
    if abs(rec.wp + rec.wa + rec.ws + rec.wn - 1) > 0.000000001 then
      raise exception 'fn_rateio_admin_mes: os pesos nao fecham em 1 no mes % (pec %, agr %, silv %, nao alocado %)',
        rec.am, rec.wp, rec.wa, rec.ws, rec.wn;
    end if;
    ano_mes := rec.am; lancamento_id := rec.id; data_competencia := rec.dt; valor := rec.vl; grupo := rec.gr;
    subcentro := rec.sub; origem := rec.org; descricao := rec.ds; favorecido_id := rec.fav; fazenda_id := rec.faz;
    data_pagamento := rec.pg; status_transacao := rec.st;
    peso_pecuaria := rec.wp; peso_agricultura := rec.wa_safra; peso_agricultura_mes := rec.wa; peso_silvicultura := rec.ws;
    peso_nao_alocado := rec.wn; motivo := rec.mot; tem_chave := rec.tk;
    existe_pecuaria := rec.xp; existe_agricultura := rec.xl; existe_silvicultura := rec.xs;
    return next;
  end loop;
end $fn$;

do $g$
begin
  if (select md5(prosrc) from pg_proc where proname='fn_rateio_admin_mes' and pronamespace='public'::regnamespace)
     is distinct from '0f115ffb9f29b379b4e27cd9af575c8f' then
    raise exception 'fn_rateio_admin_mes: corpo criado difere do provado';
  end if;
end $g$;

revoke all on function public.fn_rateio_admin_mes(uuid, text, text, text, uuid) from public;
/* ⚠ O MESMO ALCANCE DO LEITOR MAIS AMPLO: `fn_dre_agricola_por_safra` e' INVOKER e tem EXECUTE para o usuario de leitura. */
grant execute on function public.fn_rateio_admin_mes(uuid, text, text, text, uuid) to authenticated, service_role, supabase_read_only_user;

do $mig$
declare
  v_src text; v_ini int; v_fim int; v_novo text; v_md5 text;
  c_pec constant text := '41f7f0986a647099ee3bd8dd6b08b74c'; c_lav constant text := 'eece80eb967a179a41752401d5ab7ced';
  c_agr constant text := '604e6948f84ba9f7cd5638fea1621a56'; c_pai constant text := '7472a39323ab4528aac56c04727824ef';
  a_ini text; a_fim text; b_novo text;
begin
  /* ───────── fn_dre_pecuaria ───────── */
  select prosrc into v_src from pg_proc where proname='fn_dre_pecuaria' and pronamespace='public'::regnamespace;
  if md5(v_src) <> 'e9b5b5dcd2ca2c9cf902ff7b07892b51' then raise exception 'fn_dre_pecuaria fora do corpo esperado (%)', md5(v_src); end if;
  a_ini := E'  adm as (\n'; a_fim := E'  areap as (';
  if (length(v_src)-length(replace(v_src,a_ini,'')))/length(a_ini) <> 1 or (length(v_src)-length(replace(v_src,a_fim,'')))/length(a_fim) <> 1 then
    raise exception 'fn_dre_pecuaria: ancoras do bloco adm nao casam 1x'; end if;
  b_novo := E'  /* RATEIO-VIGENCIA-01: o administrativo e o peso da pecuaria no mes vem de fn_rateio_admin_mes (lista de exclusao e existencia\n'
         || E'     moram la). A soma dos grupos continua sendo o pool por construcao. */\n'
         || E'  ram as (select * from public.fn_rateio_admin_mes(p_cliente, p_de, p_ate, p_cenario)),\n'
         || E'  adm as (\n'
         || E'    select coalesce(sum(valor*peso_pecuaria),0) pool, coalesce(sum(valor),0) bruto,\n'
         || E'           coalesce(sum(valor*peso_silvicultura),0) na_silv, coalesce(sum(valor*peso_nao_alocado),0) na_outros\n'
         || E'    from ram\n'
         || E'  ),\n'
         || E'  admn as (\n'
         || E'    select coalesce(jsonb_agg(jsonb_build_object(''motivo'',motivo,''valor'',round(v,2)) order by v desc),''[]''::jsonb) j from (\n'
         || E'      select ''silvicultura sem DRE''::text motivo, sum(valor*peso_silvicultura) v from ram having sum(valor*peso_silvicultura) > 0\n'
         || E'      union all\n'
         || E'      select motivo, sum(valor*peso_nao_alocado) from ram where peso_nao_alocado > 0 group by motivo) t\n'
         || E'  ),\n'
         || E'  admg as (\n'
         || E'    select grupo, coalesce(sum(valor*peso_pecuaria),0) pool, coalesce(sum(valor),0) bruto from ram group by 1\n'
         || E'  ),\n';
  v_ini := strpos(v_src, a_ini); v_fim := strpos(v_src, a_fim);
  v_novo := substr(v_src, 1, v_ini-1) || b_novo || substr(v_src, v_fim);
  a_ini := $a$'criterio','cabecas medias no periodo',$a$;
  if (length(v_novo)-length(replace(v_novo,a_ini,'')))/length(a_ini) <> 1 then raise exception 'fn_dre_pecuaria: ancora do criterio nao casa 1x'; end if;
  v_novo := replace(v_novo, a_ini, $a$'nao_alocado',jsonb_build_object('valor',round((select na_silv+na_outros from adm),2),'silvicultura',round((select na_silv from adm),2),'outros',round((select na_outros from adm),2),'motivos',(select j from admn)),'criterio','cabecas medias no periodo',$a$);
  execute 'CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text DEFAULT ''realizado''::text)'
       || ' RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $f$' || v_novo || '$f$';
  select md5(prosrc) into v_md5 from pg_proc where proname='fn_dre_pecuaria' and pronamespace='public'::regnamespace;
  if c_pec not like '@%' and v_md5 <> c_pec then raise exception 'fn_dre_pecuaria: destino inesperado (%)', v_md5; end if;

  /* ───────── fn_dre_lavoura ───────── */
  select prosrc into v_src from pg_proc where proname='fn_dre_lavoura' and pronamespace='public'::regnamespace;
  if md5(v_src) <> '2108094b3146b145ebdd73e24d56953d' then raise exception 'fn_dre_lavoura fora do corpo esperado (%)', md5(v_src); end if;
  a_ini := 'admin_por_ano AS ('; a_fim := 'admin_rat AS (';
  if (length(v_src)-length(replace(v_src,a_ini,'')))/length(a_ini) <> 1 or (length(v_src)-length(replace(v_src,a_fim,'')))/length(a_fim) <> 1 then
    raise exception 'fn_dre_lavoura: ancoras do bloco admin nao casam 1x'; end if;
  b_novo := E'admin_pool AS (\n'
         || E'  -- RATEIO-VIGENCIA-01: a parte da agricultura desta safra, mes a mes, por fn_rateio_admin_mes (com a fatia de area da safra).\n'
         || E'  SELECT coalesce(sum(r.valor * r.peso_agricultura),0)::numeric AS valor,\n'
         || E'         coalesce(bool_and(r.tem_chave), true) AS declarado,\n'
         || E'         coalesce(sum(r.valor),0)::numeric AS admin_total\n'
         || E'    FROM safra s, public.fn_rateio_admin_mes(p_cliente_id, to_char(s.data_inicio,''YYYY-MM''), to_char(s.data_fim,''YYYY-MM''), ''realizado'', p_safra_id) r\n'
         || E'   WHERE s.data_inicio IS NOT NULL AND s.data_fim IS NOT NULL\n'
         || E'),\n';
  v_ini := strpos(v_src, a_ini); v_fim := strpos(v_src, a_fim);
  v_novo := substr(v_src, 1, v_ini-1) || b_novo || substr(v_src, v_fim);
  execute 'CREATE OR REPLACE FUNCTION public.fn_dre_lavoura(p_cliente_id uuid, p_safra_id uuid)'
       || ' RETURNS jsonb LANGUAGE sql STABLE AS $f$' || v_novo || '$f$';
  select md5(prosrc) into v_md5 from pg_proc where proname='fn_dre_lavoura' and pronamespace='public'::regnamespace;
  if c_lav not like '@%' and v_md5 <> c_lav then raise exception 'fn_dre_lavoura: destino inesperado (%)', v_md5; end if;

  /* ───────── fn_dre_agricola_por_safra ───────── */
  select prosrc into v_src from pg_proc where proname='fn_dre_agricola_por_safra' and pronamespace='public'::regnamespace;
  if md5(v_src) <> '7aad0a266d7b8eadae903a576b9573ac' then raise exception 'fn_dre_agricola_por_safra fora do corpo esperado (%)', md5(v_src); end if;
  a_ini := 'admin_por_ano as ('; a_fim := 'base as (';
  if (length(v_src)-length(replace(v_src,a_ini,'')))/length(a_ini) <> 1 or (length(v_src)-length(replace(v_src,a_fim,'')))/length(a_fim) <> 1 then
    raise exception 'fn_dre_agricola_por_safra: ancoras do bloco admin nao casam 1x'; end if;
  b_novo := E'admin_rateado as (\n'
         || E'  -- RATEIO-VIGENCIA-01: a mesma parte de fn_dre_lavoura (fn_rateio_admin_mes); a lista de exclusao passa a ter ''Tributos''.\n'
         || E'  select coalesce(sum(r.valor*r.peso_agricultura),0)::numeric valor,\n'
         || E'         coalesce(bool_and(r.tem_chave),true) declarado\n'
         || E'  from safra s, public.fn_rateio_admin_mes(p_cliente_id, to_char(s.data_inicio,''YYYY-MM''), to_char(s.data_fim,''YYYY-MM''), ''realizado'', p_safra_id) r\n'
         || E'  where s.data_inicio is not null and s.data_fim is not null\n'
         || E'),\n';
  v_ini := strpos(v_src, a_ini); v_fim := strpos(v_src, a_fim);
  v_novo := substr(v_src, 1, v_ini-1) || b_novo || substr(v_src, v_fim);
  execute 'CREATE OR REPLACE FUNCTION public.fn_dre_agricola_por_safra(p_cliente_id uuid, p_safra_id uuid)'
       || ' RETURNS TABLE(cultura text, area_ha numeric, area_cadastrada boolean, ordem integer, linha text, rotulo text, valor numeric, rateio_admin_declarado boolean)'
       || ' LANGUAGE sql STABLE SET search_path TO ''public'' AS $f$' || v_novo || '$f$';
  select md5(prosrc) into v_md5 from pg_proc where proname='fn_dre_agricola_por_safra' and pronamespace='public'::regnamespace;
  if c_agr not like '@%' and v_md5 <> c_agr then raise exception 'fn_dre_agricola_por_safra: destino inesperado (%)', v_md5; end if;

  /* ───────── fn_painel_rateio_detalhe (ramo admin) ───────── */
  select prosrc into v_src from pg_proc where proname='fn_painel_rateio_detalhe' and pronamespace='public'::regnamespace;
  if md5(v_src) <> '634705c39f0452f98ad9c09cf2daaeb8' then raise exception 'fn_painel_rateio_detalhe fora do corpo esperado (%)', md5(v_src); end if;
  a_ini := E'  elsif p_tipo=''admin'' then\n'; a_fim := E'  end if;\n  with areas as';
  if (length(v_src)-length(replace(v_src,a_ini,'')))/length(a_ini) <> 1 or (length(v_src)-length(replace(v_src,a_fim,'')))/length(a_fim) <> 1 then
    raise exception 'fn_painel_rateio_detalhe: ancoras do ramo admin nao casam 1x'; end if;
  b_novo := E'  elsif p_tipo=''admin'' then\n'
         || E'    -- RATEIO-VIGENCIA-01: linhas, pesos e nao alocado de fn_rateio_admin_mes, numa leitura so'' (a CTE e'' materializada uma vez).\n'
         || E'    -- pct = o peso EFETIVO do mes (x100), nao a chave crua; na lavoura, ja'' com a fatia de area da safra.\n'
         || E'    with ram as materialized (\n'
         || E'      select r.*, case p_atividade when ''pecuaria'' then r.peso_pecuaria when ''agricultura'' then r.peso_agricultura\n'
         || E'                                   when ''silvicultura'' then r.peso_silvicultura else 0 end w\n'
         || E'      from public.fn_rateio_admin_mes(p_cliente, to_char(v_ini,''YYYY-MM''), to_char(v_fim,''YYYY-MM''), p_cenario,\n'
         || E'             case when p_atividade=''agricultura'' then p_safra_id end) r\n'
         || E'    ), admp as (\n'
         || E'      select r.lancamento_id id, r.data_competencia dt, r.data_pagamento pg, r.descricao ds,\n'
         || E'             case when r.origem=''planejamento'' then null else coalesce(f.nome_favorecido,f.nome,''-'') end fav,\n'
         || E'             r.valor vl, r.status_transacao st, fz.nome fzn, r.grupo, r.origem, r.subcentro sub, r.w\n'
         || E'      from ram r left join financeiro_fornecedores f on f.id=r.favorecido_id left join fazendas fz on fz.id=r.fazenda_id\n'
         || E'    )\n'
         || E'    select (select coalesce(sum(vl*w),0) from admp), (select coalesce(sum(vl),0) from admp),\n'
         || E'      (select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''data'',dt,''descricao'',ds,''favorecido'',fav,''valor'',vl,''compartilhado'',true,''pagamento'',pg,''status'',st,''fazenda'',fzn,''grupo'',grupo,''subcentro'',sub,''pct'',round(100*w,4),''parte'',vl*w,''origem'',origem) order by dt),''[]''::jsonb) from admp),\n'
         || E'      (select coalesce(jsonb_agg(jsonb_build_object(''grupo'',grupo,''bruto'',bruto,''parte'',parte) order by parte desc, grupo),''[]''::jsonb)\n'
         || E'         from (select grupo, sum(valor) bruto, sum(valor*w) parte from ram group by 1) g),\n'
         || E'      (select coalesce(jsonb_agg(jsonb_build_object(''atividade'', atividade, ''valor'', round(v,2)) order by v desc),''[]''::jsonb)\n'
         || E'         from (select ''pecuaria''::text atividade, sum(valor*peso_pecuaria) v from ram\n'
         || E'               union all select ''agricultura'', sum(valor*peso_agricultura_mes) from ram\n'
         || E'               union all select ''silvicultura'', sum(valor*peso_silvicultura) from ram\n'
         || E'               union all select ''nao_alocado'', sum(valor*peso_nao_alocado) from ram) t where v is not null),\n'
         || E'      (select jsonb_build_object(''valor'', round(coalesce(sum(valor*(peso_silvicultura+peso_nao_alocado)),0),2),\n'
         || E'         ''silvicultura'', round(coalesce(sum(valor*peso_silvicultura),0),2), ''outros'', round(coalesce(sum(valor*peso_nao_alocado),0),2),\n'
         || E'         ''motivos'', coalesce((select jsonb_agg(jsonb_build_object(''motivo'',m,''valor'',round(v,2)) order by v desc) from (\n'
         || E'            select ''silvicultura sem DRE''::text m, sum(valor*peso_silvicultura) v from ram having sum(valor*peso_silvicultura) > 0\n'
         || E'            union all select motivo, sum(valor*peso_nao_alocado) from ram where peso_nao_alocado > 0 group by motivo) q), ''[]''::jsonb))\n'
         || E'         from ram)\n'
         || E'      into v_pool, v_bruto, v_lanc, v_grupos, v_fat_atv, v_nao_aloc;\n'
         || E'    v_pct := round(100*v_pool/nullif(v_bruto,0),1);\n';
  v_ini := strpos(v_src, a_ini); v_fim := strpos(v_src, a_fim);
  v_novo := substr(v_src, 1, v_ini-1) || b_novo || substr(v_src, v_fim);
  a_ini := 'v_grupos jsonb;';
  if (length(v_novo)-length(replace(v_novo,a_ini,'')))/length(a_ini) <> 1 then raise exception 'fn_painel_rateio_detalhe: ancora do declare nao casa 1x'; end if;
  v_novo := replace(v_novo, a_ini, 'v_grupos jsonb; v_nao_aloc jsonb;');
  a_ini := $a$'grupos',coalesce(v_grupos,'[]'::jsonb));$a$;
  if (length(v_novo)-length(replace(v_novo,a_ini,'')))/length(a_ini) <> 1 then raise exception 'fn_painel_rateio_detalhe: ancora do retorno nao casa 1x'; end if;
  v_novo := replace(v_novo, a_ini, $a$'grupos',coalesce(v_grupos,'[]'::jsonb),'nao_alocado',v_nao_aloc);$a$);
  execute 'CREATE OR REPLACE FUNCTION public.fn_painel_rateio_detalhe(p_cliente uuid, p_safra_id uuid, p_cultura text, p_tipo text, p_chave text, p_atividade text DEFAULT ''agricultura''::text, p_de text DEFAULT NULL::text, p_ate text DEFAULT NULL::text, p_cenario text DEFAULT ''realizado''::text)'
       || ' RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $f$' || v_novo || '$f$';
  select md5(prosrc) into v_md5 from pg_proc where proname='fn_painel_rateio_detalhe' and pronamespace='public'::regnamespace;
  if c_pai not like '@%' and v_md5 <> c_pai then raise exception 'fn_painel_rateio_detalhe: destino inesperado (%)', v_md5; end if;
end $mig$;
