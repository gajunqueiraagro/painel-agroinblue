-- DRE-MODAL-VALOR-01a — BANCO do modal de valor do DRE: rateio administrativo ABERTO POR GRUPO na pecuaria, a lista
-- de custo fixo da pecuaria sem a CTE de datas materializada, Pgto/status/fazenda nas listas e a lista do rateio adm da
-- pecuaria pelo MESMO ramo admin da lavoura (decisoes do Gabriel no mock dre_modal_valor_mock_v1, 26/09/2026).
--
-- NENHUM NUMERO EXISTENTE DO DRE MUDA: todas as mudancas sao CHAVES NOVAS no jsonb devolvido (nenhuma assinatura de
-- retorno muda) e uma CTE marcada NOT MATERIALIZED. As provas estao no fim deste cabecalho.
--
-- (1) fn_dre_pecuaria — PATCH GUARDADO POR md5 (corpo de 23.499 caracteres; alternativa aprovada no CLAUDE.md):
--     md5(prosrc) 18742cc2… -> e9b5b5dcd2ca2c9cf902ff7b07892b51. Cinco ancoras, cada uma casando exatamente 1x:
--     `admg` (pool por GRUPO = a MESMA formula do `adm`, agrupada pelo centro_custo do lancamento administrativo — linear,
--     entao a soma dos grupos e' o pool por construcao); `admfz` (a parte de cada fazenda por grupo pela MESMA regra das
--     cabecas medias, arredondada a centavos, com o residuo do arredondamento no maior grupo — a soma dos grupos da fazenda
--     e' EXATAMENTE o `rateio_adm` dela); chaves `rateio_adm_grupos` por fazenda e no total; `rateio_adm.grupos` (pool).
--     Casamento de grupos (mock): Administracao, Impostos, Mao de Obra, Maquinas -> os de mesmo nome do Custo Fixo
--     Pecuaria; Financeiro -> linha propria. Os cinco centros administrativos sao os unicos com saida no pool (medido,
--     nenhum centro nulo). Variaveis nao tem rateio: o adm nao tem esses centros.
-- (2) fn_dre_pecuaria_lancamentos — CORPO INTEGRAL (md5 3f0e203d -> aa6d090f): `per` passa a `as not materialized`
--     (materializada, o filtro de data deixava de ser condicao de indice e o plano visitava ~765 mil linhas) e cada linha
--     ganha `pagamento` (data_pagamento; nulo no planejamento e na meta calculada).
-- (3) fn_painel_rateio_detalhe — CORPO INTEGRAL, DROP + CREATE (md5 964888bb -> 6f69f1cc): quatro parametros NOVOS com
--     default — p_atividade ('agricultura'), p_de/p_ate (NULL = as datas da safra, como sempre), p_cenario ('realizado') —
--     e por isso nao da' para ser CREATE OR REPLACE (outra lista de argumentos seria uma sobrecarga ambigua). Os chamadores
--     (so' AgriDreLavouraTab, por nome) seguem identicos: sem os novos, vale o comportamento de antes.
--     O ramo admin GENERALIZADO serve a pecuaria: p_atividade='pecuaria' + p_de/p_ate + p_cenario, e cada linha traz
--     `grupo`, `pct` (o % do ano da atividade), `parte` (valor x pct / 100, sem arredondar — a soma e' o pool) e
--     `origem` (lancamento | planejamento, este so' na meta, espelho do `plm` do fn_dre_pecuaria). Sai tambem `grupos`
--     (bruto e parte por grupo) e `pct_atividade`. As listas ganham `pagamento`, `status` e `fazenda`.
--     ⚠ GENERALIZAR E NAO CRIAR: o ramo admin da lavoura ja' era a lista de lancamentos administrativos com a MESMA
--       exclusao de macro_custo e o % por ano de agri_rateio_admin; o que faltava era a atividade, o periodo em meses e
--       o cenario. Uma funcao nova seria a QUARTA copia da lista de exclusoes.
-- ACL: REVOKE ALL de PUBLIC e anon; EXECUTE so' authenticated e service_role, nas tres.
--
-- PROVAS (em rollback, com as funcoes ANTIGAS copiadas em pg_temp na mesma transacao, 26/09/2026):
--   fn_dre_pecuaria: 7 clientes x 16 periodos (civis 2019-2026, safras 19/20-25/26, jan-ago e jan-dez 2026) x
--     2 cenarios = 224 saidas; 224 IDENTICAS depois de tirar so' as chaves novas. Soma dos grupos = rateio_adm no
--     total (224/224), no pool (224/224) e em cada fazenda-periodo (283/283), ao centavo. Com grupos nao vazios: 61
--     fora o NJ (a rodada do NJ nao contou esse numero).
--   fn_dre_pecuaria_lancamentos: 6 clientes x 2 periodos x 2 cenarios x (todos os blocos, fixo) = 48 chamadas, 20.587
--     linhas; 48/48 IDENTICAS tirando `pagamento`, e toda linha nova tem a chave. Tempo somado: 105,6 s -> 7,3 s.
--     NJ 07/2025-06/2026, Total, custo fixo (1.533 linhas): 4.074 / 1.647 / 2.915 ms -> 260 / 318 / 409 ms.
--   fn_painel_rateio_detalhe, LAVOURA (sem os parametros novos): 35 chamadas (natureza, pool_fixo, pool_investimento,
--     admin e os 3 maiores centros de cada safra x cultura), 5.664 linhas, 35/35 IDENTICAS tirando as chaves novas.
--   fn_painel_rateio_detalhe, PECUARIA (p_atividade='pecuaria'): 7 clientes x 2 periodos x 2 cenarios = 28; soma das
--     `parte` = rateio_adm.pool do fn_dre_pecuaria, soma dos `valor` = rateio_adm.bruto e soma dos grupos = pool,
--     28/28 ao centavo (11 com pool <> 0, 3.176 linhas).

CREATE TYPE pg_temp.par_patch AS (ancora text, troca text, n int);

DO $patch$
DECLARE
  v_oid oid; v_def text; v_src text; v_par pg_temp.par_patch; v_n int;
  v_pares pg_temp.par_patch[] := ARRAY[
    row(E'    left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano and r.atividade=''pecuaria''\n  ),\n  areap as (', E'    left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano and r.atividade=''pecuaria''\n  ),\n  admg as (\n    select a.grupo, coalesce(sum(a.total*coalesce(r.percentual,0)/100.0),0) pool, coalesce(sum(a.total),0) bruto\n    from (select ano, grupo, sum(valor) total from (\n          select extract(year from l.data_competencia)::int ano, coalesce(l.centro_custo,''(sem)'') grupo, l.valor from financeiro_lancamentos_v2 l\n          where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and l.escopo_negocio=''administrativo'' and l.tipo_operacao=''2-Saídas''\n            and l.macro_custo not in (''Dividendos'',''Investimento na Fazenda'',''Saída Financeira'',''Transferências'',''Tributos'')\n            and l.data_competencia between v_ini and v_fim\n          union all\n          select extract(year from comp)::int, coalesce(centro_custo,''(sem)''), valor from plm\n          where escopo_negocio=''administrativo'' and tipo_operacao=''2-Saídas''\n            and macro_custo not in (''Dividendos'',''Investimento na Fazenda'',''Saída Financeira'',''Transferências'',''Tributos'')\n          ) u group by 1,2) a\n    left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano and r.atividade=''pecuaria''\n    group by 1\n  ),\n  areap as (', 1)::pg_temp.par_patch,
    row(E'  js as (\n    select fazenda_id, nome, jsonb_build_object(', E'  admfz as (\n    select y.fazenda_id, y.grupo, y.v + case when y.rk=1 then y.rateio_adm - y.tot else 0 end valor\n    from (select x.*, sum(x.v) over (partition by x.fazenda_id) tot,\n                 row_number() over (partition by x.fazenda_id order by abs(x.pool) desc, x.grupo) rk\n          from (select c.fazenda_id, c.rateio_adm, g.grupo, g.pool,\n                  case when (select sum(cab_media) from base)>0 then round(g.pool*c.cab_media/(select sum(cab_media) from base),2) else 0 end v\n                from linhas c cross join admg g) x) y\n  ),\n  js as (\n    select fazenda_id, nome, jsonb_build_object(', 1)::pg_temp.par_patch,
    row(E'''rateio_adm'',rateio_adm,', E'''rateio_adm'',rateio_adm,''rateio_adm_grupos'',coalesce((select jsonb_agg(jsonb_build_object(''grupo'',a.grupo,''valor'',a.valor) order by a.grupo) from admfz a where a.fazenda_id=linhas.fazenda_id),''[]''::jsonb),', 1)::pg_temp.par_patch,
    row(E'''rateio_adm'',sum(rateio_adm),', E'''rateio_adm'',sum(rateio_adm),''rateio_adm_grupos'',coalesce((select jsonb_agg(jsonb_build_object(''grupo'',t.grupo,''valor'',t.valor) order by t.grupo) from (select grupo, sum(valor) valor from admfz group by 1) t),''[]''::jsonb),', 1)::pg_temp.par_patch,
    row(E'''criterio'',''cabecas medias no periodo''),', E'''criterio'',''cabecas medias no periodo'',''grupos'',coalesce((select jsonb_agg(jsonb_build_object(''grupo'',grupo,''pool'',pool) order by grupo) from admg),''[]''::jsonb)),', 1)::pg_temp.par_patch
  ];
BEGIN
  SELECT p.oid, p.prosrc INTO v_oid, v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_dre_pecuaria';
  IF md5(v_src) NOT LIKE '18742cc2%' THEN RAISE EXCEPTION 'fn_dre_pecuaria: md5 de origem % (esperado 18742cc2)', md5(v_src); END IF;
  v_def := pg_get_functiondef(v_oid);
  FOREACH v_par IN ARRAY v_pares LOOP
    v_n := (length(v_src) - length(replace(v_src, v_par.ancora, ''))) / length(v_par.ancora);
    IF v_n <> v_par.n THEN RAISE EXCEPTION 'fn_dre_pecuaria: ancora casa % vezes (esperado %): %', v_n, v_par.n, left(v_par.ancora, 60); END IF;
    v_src := replace(v_src, v_par.ancora, v_par.troca);
    v_def := replace(v_def, v_par.ancora, v_par.troca);
  END LOOP;
  EXECUTE v_def;
  SELECT md5(p.prosrc) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_dre_pecuaria';
  IF 'e9b5b5dcd2ca2c9cf902ff7b07892b51' <> 'PLACEHOLDER' AND v_src <> 'e9b5b5dcd2ca2c9cf902ff7b07892b51' THEN RAISE EXCEPTION 'fn_dre_pecuaria: md5 de destino % (esperado e9b5b5dcd2ca2c9cf902ff7b07892b51)', v_src; END IF;
  RAISE NOTICE 'fn_dre_pecuaria md5 destino %', v_src;
END
$patch$;

CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria_lancamentos(p_cliente uuid, p_fazenda uuid, p_bloco text, p_centro text, p_de text, p_ate text, p_cenario text DEFAULT 'realizado'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
with per as not materialized (select to_date(p_de||'-01','YYYY-MM-DD') v_ini, (to_date(p_ate||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')::date v_fim),
ln as (
select jsonb_build_object('id', l.id, 'data', l.data_competencia, 'pagamento', l.data_pagamento, 'descricao', l.descricao, 'favorecido', coalesce(f.nome_favorecido, f.nome, '-'),
  'valor', (case when p.bloco_dre='venda' and l.tipo_operacao='2-Saídas' then -l.valor else l.valor end), 'status', l.status_transacao, 'fazenda', fz.nome, 'fazenda_id', l.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', l.documento) j,
  l.data_competencia d, l.descricao s
from financeiro_lancamentos_v2 l join per on true
join financeiro_plano_contas p on p.id=l.plano_conta_id
left join financeiro_fornecedores f on f.id=l.favorecido_id
left join fazendas fz on fz.id=l.fazenda_id
where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
  and not (p_cenario='meta' and l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao'))
  and l.data_competencia between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre<>'receita' and l.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or l.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
),
pl as (
select jsonb_build_object('id', pf.id, 'data', make_date(pf.ano, pf.mes, 1), 'pagamento', null, 'descricao', pf.subcentro, 'favorecido', null,
  'valor', case when p.bloco_dre='venda' and p.tipo_operacao='2-Saídas' then -pf.valor_planejado else pf.valor_planejado end, 'status', null, 'fazenda', fz.nome, 'fazenda_id', pf.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', null,
  'origem', 'planejamento') j,
  make_date(pf.ano, pf.mes, 1) d, pf.subcentro s
from planejamento_financeiro pf join per on true
join financeiro_plano_contas p on p.subcentro=pf.subcentro and p.escopo_negocio=pf.escopo_negocio
     and (p.cliente_id is null or p.cliente_id=pf.cliente_id) and p.ativo
left join fazendas fz on fz.id=pf.fazenda_id
where p_cenario='meta' and pf.cenario='meta' and pf.cliente_id=p_cliente and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
  and make_date(pf.ano, pf.mes, 1) between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and p.tipo_operacao='1-Entradas') or (p.bloco_dre<>'receita' and p.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or pf.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
),
pc as (
select jsonb_build_object('id', null, 'data', make_date(y.ano, c.mes, 1), 'pagamento', null, 'descricao', p.subcentro || ' (meta calculada)', 'favorecido', null,
  'valor', case when p.bloco_dre='venda' and p.tipo_operacao='2-Saídas' then -c.valor else c.valor end, 'status', null, 'fazenda', fz.nome, 'fazenda_id', c.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', null,
  'origem', 'calculado') j,
  make_date(y.ano, c.mes, 1) d, p.subcentro s
from per
cross join lateral generate_series(extract(year from per.v_ini)::int, extract(year from per.v_fim)::int) as y(ano)
cross join lateral public.fn_meta_calculada_pecuaria(p_cliente, y.ano) c
join financeiro_plano_contas p on p.ordem_exibicao=c.ordem and p.escopo_negocio='pecuaria'
     and p.cliente_id is null and p.ativo
left join fazendas fz on fz.id=c.fazenda_id
where p_cenario='meta' and p.bloco_dre is not null
  and make_date(y.ano, c.mes, 1) between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and p.tipo_operacao='1-Entradas') or (p.bloco_dre<>'receita' and p.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or c.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
)
select coalesce(jsonb_agg(j order by d, s), '[]'::jsonb) from (select j, d, s from ln union all select j, d, s from pl union all select j, d, s from pc) u
$function$;

DROP FUNCTION public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text);
CREATE FUNCTION public.fn_painel_rateio_detalhe(p_cliente uuid, p_safra_id uuid, p_cultura text, p_tipo text, p_chave text,
  p_atividade text DEFAULT 'agricultura'::text, p_de text DEFAULT NULL::text, p_ate text DEFAULT NULL::text, p_cenario text DEFAULT 'realizado'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_pool numeric:=0; v_direto numeric:=0; v_bruto numeric:=0; v_pct numeric; v_fat_atv jsonb; v_fatias jsonb; v_lanc jsonb; v_ini date; v_fim date; v_grupos jsonb;
begin
  if p_de is not null and p_ate is not null then
    v_ini := to_date(p_de||'-01','YYYY-MM-DD');
    v_fim := (to_date(p_ate||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  else
    select data_inicio, data_fim into v_ini, v_fim from financeiro_safras where id=p_safra_id;
  end if;
  if p_tipo in ('natureza','investimento','pool_fixo','pool_investimento') then
    with lc as (
      select l.id lid, l.data_competencia dt, l.descricao ds, coalesce(f.nome_favorecido,f.nome,'-') fav, l.valor vl, (l.cultura is null) comp, l.centro_custo ctr, l.data_pagamento pg, l.status_transacao st, fz.nome fzn
      from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id=l.favorecido_id left join fazendas fz on fz.id=l.fazenda_id
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and l.cenario='realizado'
        and (l.cultura is null or l.cultura=p_cultura)
        and ((p_tipo in ('natureza','pool_fixo','pool_investimento') and (p_tipo='pool_investimento' or l.compoe_dre) and l.tipo_operacao='2-Saídas' and (p_tipo='pool_investimento' or coalesce(l.macro_custo,'') not ilike '%investimento%')
                and (p_chave is null or coalesce(l.centro_custo,'(sem)')=p_chave)
                and (p_chave is not null or (l.cultura is null and exists (select 1 from financeiro_plano_contas pc where pc.id=l.plano_conta_id and pc.bloco_dre = any(case p_tipo when 'pool_fixo' then array['fixo'] when 'pool_investimento' then array['investimento'] else array['custeio','pos_colheita'] end)))))
          or (p_tipo='investimento' and coalesce(l.macro_custo,'') ilike '%investimento%' and (coalesce(l.centro_custo,'(sem)')=p_chave or coalesce(l.subcentro,'(sem)')=p_chave))))
    select coalesce(sum(vl) filter (where comp),0), coalesce(sum(vl) filter (where not comp),0),
      coalesce(jsonb_agg(jsonb_build_object('id',lid,'data',dt,'descricao',ds,'favorecido',fav,'valor',vl,'compartilhado',comp,'centro',ctr,'pagamento',pg,'status',st,'fazenda',fzn) order by dt),'[]'::jsonb)
      into v_pool, v_direto, v_lanc from lc;
  elsif p_tipo='admin' then
    with adml as (
      select l.id, l.data_competencia dt, l.data_pagamento pg, l.descricao ds, coalesce(f.nome_favorecido,f.nome,'-') fav, l.valor vl, l.status_transacao st, fz.nome fzn,
             coalesce(l.centro_custo,'(sem)') grupo, 'lancamento'::text origem
      from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id=l.favorecido_id left join fazendas fz on fz.id=l.fazenda_id
      where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos') and l.data_competencia between v_ini and v_fim
      union all
      select pf.id, make_date(pf.ano, pf.mes, 1), null::date, pf.subcentro, null::text, pf.valor_planejado, null::text, fz.nome,
             coalesce(p.centro_custo,'(sem)'), 'planejamento'::text
      from planejamento_financeiro pf
      join financeiro_plano_contas p on p.subcentro=pf.subcentro and p.escopo_negocio=pf.escopo_negocio and (p.cliente_id is null or p.cliente_id=pf.cliente_id) and p.ativo
      left join fazendas fz on fz.id=pf.fazenda_id
      where p_cenario='meta' and pf.cenario='meta' and pf.cliente_id=p_cliente and make_date(pf.ano, pf.mes, 1) between v_ini and v_fim
        and p.escopo_negocio='administrativo' and p.tipo_operacao='2-Saídas' and p.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
    ), admp as (
      select a.*, coalesce(r.percentual,0) pct, a.vl*coalesce(r.percentual,0)/100.0 parte
      from adml a left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=extract(year from a.dt)::int and r.atividade=p_atividade
    )
    select coalesce(sum(parte),0), coalesce(sum(vl),0),
      coalesce(jsonb_agg(jsonb_build_object('id',id,'data',dt,'descricao',ds,'favorecido',fav,'valor',vl,'compartilhado',true,'pagamento',pg,'status',st,'fazenda',fzn,'grupo',grupo,'pct',pct,'parte',parte,'origem',origem) order by dt),'[]'::jsonb)
      into v_pool, v_bruto, v_lanc from admp;
    select coalesce(jsonb_agg(jsonb_build_object('grupo',grupo,'bruto',bruto,'parte',parte) order by parte desc, grupo),'[]'::jsonb) into v_grupos
      from (select coalesce(l.centro_custo,'(sem)') grupo, sum(l.valor) bruto, sum(l.valor*coalesce(r.percentual,0)/100.0) parte
            from financeiro_lancamentos_v2 l left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=extract(year from l.data_competencia)::int and r.atividade=p_atividade
            where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos') and l.data_competencia between v_ini and v_fim
            group by 1
            union all
            select coalesce(p.centro_custo,'(sem)'), sum(pf.valor_planejado), sum(pf.valor_planejado*coalesce(r.percentual,0)/100.0)
            from planejamento_financeiro pf
            join financeiro_plano_contas p on p.subcentro=pf.subcentro and p.escopo_negocio=pf.escopo_negocio and (p.cliente_id is null or p.cliente_id=pf.cliente_id) and p.ativo
            left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=pf.ano and r.atividade=p_atividade
            where p_cenario='meta' and pf.cenario='meta' and pf.cliente_id=p_cliente and make_date(pf.ano, pf.mes, 1) between v_ini and v_fim
              and p.escopo_negocio='administrativo' and p.tipo_operacao='2-Saídas' and p.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
            group by 1) g;
    v_pct := round(100*v_pool/nullif(v_bruto,0),1);
    select coalesce(jsonb_agg(jsonb_build_object('atividade', atividade, 'valor', round(valor,2)) order by valor desc),'[]'::jsonb) into v_fat_atv from (select r.atividade, sum(a.total*coalesce(r.percentual,0)/100.0) valor from (select extract(year from l.data_competencia)::int ano, sum(l.valor) total from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos') and l.data_competencia between v_ini and v_fim group by 1) a join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano group by r.atividade) t;
  end if;
  with areas as (select cultura, sum(area_plantada_ha) ha from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada' group by cultura), tot as (select coalesce(sum(ha),0) t from areas)
  select coalesce(jsonb_agg(jsonb_build_object('cultura',cultura,'area_ha',ha,
      'peso',case when (select t from tot)>0 then round(100*ha/(select t from tot),1) else 0 end,
      'valor',case when (select t from tot)>0 then round(v_pool*ha/(select t from tot),2) else 0 end,
      'atual',(cultura=p_cultura)) order by ha desc),'[]'::jsonb) into v_fatias from areas;
  return jsonb_build_object('pool',round(v_pool,2),'direto_cultura',round(v_direto,2),'fatias',v_fatias,'lancamentos',coalesce(v_lanc,'[]'::jsonb),'pct_agricultura',v_pct,'fatias_atividade',v_fat_atv,'pct_atividade',v_pct,'grupos',coalesce(v_grupos,'[]'::jsonb));
end $function$;

REVOKE ALL ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text, text, text, text, text) TO authenticated, service_role;
