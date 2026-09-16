-- PR-DRE-LAVOURA-09 — `p_tipo` 'pool_fixo' / 'pool_investimento' = o pool daquele bloco, com
-- `p_chave` nulo; o filtro de `bloco_dre` deixa de ser fixo e passa a sair do proprio `p_tipo`.
--
-- ⚠ JA APLICADA NO PROTO (16/09, GO do Gabriel). E' REGISTRO HISTORICO, para que um banco novo,
--   replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NASCEU POR DELTA sobre 20261027120400 (4736b15e..., 4.909) — tres trocas, cada uma
--   casando exatamente uma vez — e foi conferido nas DUAS pontas: md5 do texto reconstruido e
--   md5(prosrc) lido do banco vivo. Os dois dao f34c7146c9d055f5cea986bb4fc3a4a6 (5.160 chars).
--   Ao contrario do PR-07, aqui o delta bateu de primeira; o banco confirmou, nao corrigiu.
--
-- ⚠ POR QUE O RAMO DE INVESTIMENTO PRECISA DAS TRES EXCECOES: o pool de investimento nao passa
--   por `compoe_dre` (investimento fica abaixo da linha) nem pode ser filtrado por
--   `macro_custo not ilike '%investimento%'` — que e' exatamente o que ele E'. As duas guardas
--   ficam desligadas so' para `pool_investimento`; `pool_fixo` continua com as duas.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` preserva privilegios, mas num
--   banco novo a funcao nasce com EXECUTE para PUBLIC por default-privilege global. Ela e SECURITY
--   DEFINER e le lancamentos de todo o cliente.

CREATE OR REPLACE FUNCTION public.fn_painel_rateio_detalhe(p_cliente uuid, p_safra_id uuid, p_cultura text, p_tipo text, p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_pool numeric:=0; v_direto numeric:=0; v_bruto numeric:=0; v_pct numeric; v_fat_atv jsonb; v_fatias jsonb; v_lanc jsonb; v_ini date; v_fim date;
begin
  select data_inicio, data_fim into v_ini, v_fim from financeiro_safras where id=p_safra_id;
  if p_tipo in ('natureza','investimento','pool_fixo','pool_investimento') then
    with lc as (
      select l.id lid, l.data_competencia dt, l.descricao ds, coalesce(f.nome_favorecido,f.nome,'-') fav, l.valor vl, (l.cultura is null) comp, l.centro_custo ctr
      from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id=l.favorecido_id
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false
        and (l.cultura is null or l.cultura=p_cultura)
        and ((p_tipo in ('natureza','pool_fixo','pool_investimento') and (p_tipo='pool_investimento' or l.compoe_dre) and l.tipo_operacao='2-Saídas' and (p_tipo='pool_investimento' or coalesce(l.macro_custo,'') not ilike '%investimento%')
                and (p_chave is null or coalesce(l.centro_custo,'(sem)')=p_chave)
                and (p_chave is not null or (l.cultura is null and exists (select 1 from financeiro_plano_contas pc where pc.id=l.plano_conta_id and pc.bloco_dre = any(case p_tipo when 'pool_fixo' then array['fixo'] when 'pool_investimento' then array['investimento'] else array['custeio','pos_colheita'] end)))))
          or (p_tipo='investimento' and coalesce(l.macro_custo,'') ilike '%investimento%' and (coalesce(l.centro_custo,'(sem)')=p_chave or coalesce(l.subcentro,'(sem)')=p_chave))))
    select coalesce(sum(vl) filter (where comp),0), coalesce(sum(vl) filter (where not comp),0),
      coalesce(jsonb_agg(jsonb_build_object('id',lid,'data',dt,'descricao',ds,'favorecido',fav,'valor',vl,'compartilhado',comp,'centro',ctr) order by dt),'[]'::jsonb)
      into v_pool, v_direto, v_lanc from lc;
  elsif p_tipo='admin' then
    select coalesce(sum(a.total*coalesce(r.percentual,0)/100.0),0) into v_pool
      from (select extract(year from l.data_competencia)::int ano, sum(l.valor) total
            from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false
              and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências') and l.data_competencia between v_ini and v_fim group by 1) a
      left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano and r.atividade='agricultura';
    select coalesce(sum(l.valor),0) into v_bruto from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências') and l.data_competencia between v_ini and v_fim;
    v_pct := round(100*v_pool/nullif(v_bruto,0),1);
    select coalesce(jsonb_agg(jsonb_build_object('atividade', atividade, 'valor', round(valor,2)) order by valor desc),'[]'::jsonb) into v_fat_atv from (select r.atividade, sum(a.total*coalesce(r.percentual,0)/100.0) valor from (select extract(year from l.data_competencia)::int ano, sum(l.valor) total from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências') and l.data_competencia between v_ini and v_fim group by 1) a join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano group by r.atividade) t;
    select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'data',l.data_competencia,'descricao',l.descricao,'favorecido',coalesce(f.nome_favorecido,f.nome,'-'),'valor',l.valor,'compartilhado',true) order by l.data_competencia),'[]'::jsonb)
      into v_lanc from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id=l.favorecido_id
      where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências') and l.data_competencia between v_ini and v_fim;
  end if;
  with areas as (select cultura, sum(area_plantada_ha) ha from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada' group by cultura), tot as (select coalesce(sum(ha),0) t from areas)
  select coalesce(jsonb_agg(jsonb_build_object('cultura',cultura,'area_ha',ha,
      'peso',case when (select t from tot)>0 then round(100*ha/(select t from tot),1) else 0 end,
      'valor',case when (select t from tot)>0 then round(v_pool*ha/(select t from tot),2) else 0 end,
      'atual',(cultura=p_cultura)) order by ha desc),'[]'::jsonb) into v_fatias from areas;
  return jsonb_build_object('pool',round(v_pool,2),'direto_cultura',round(v_direto,2),'fatias',v_fatias,'lancamentos',coalesce(v_lanc,'[]'::jsonb),'pct_agricultura',v_pct,'fatias_atividade',v_fat_atv);
end $function$;

revoke all on function public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text) from public;
grant execute on function public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text) to authenticated;
