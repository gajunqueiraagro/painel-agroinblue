-- PR-AGRI-MANDIOCA-01 — o Painel da Safra e o comparativo tambem deixam de assumir sacas.
--
-- ⚠ O MESMO `coalesce` DE 20261027121100, nas outras duas funcoes que somavam colheita: duas
--   ocorrencias em `fn_painel_safra` (o total e a agregacao por talhao) e uma no comparativo.
--   As tres precisavam mudar JUNTAS — o DRE ja lia tonelada, e deixar o Painel em saca faria as
--   duas telas discordarem sobre a mesma colheita.
-- ⚠ AS CHAVES DO JSON CONTINUAM SE CHAMANDO `sacas` E `sacas_ha`, de proposito: renomea-las
--   quebraria os tres consumidores do front num PR que e' de CONTEUDO, nao de contrato. Quem
--   troca o rotulo para "t"/"t/ha" e' a tela, pelo mapa `modeloComercial`. O nome da chave e' o
--   passo seguinte, e tem de ser deliberado.
-- ⚠ JA APLICADAS NO PROTO (16/09, GO do Gabriel). Deltas conferidos nas duas pontas:
--   fn_painel_safra 2098a1d5f61ece0257db1c19f7e2a65a (5.808) -> 3d700f7ba593413b8f6eccac7fac0fc0 (5.858)
--   fn_painel_safra_comparativo 5bb101207a7eb5cd1e96eca32c2acad7 (2.565) -> 4d143f2a73c7628296463abdef149b0b (2.588)

CREATE OR REPLACE FUNCTION public.fn_painel_safra(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_area numeric; v_sacas numeric; v_res jsonb; v_dre jsonb; v_natureza jsonb; v_fora numeric;
  v_inv_tipos jsonb; v_talhoes jsonb; v_peso numeric := 0;
begin
  select coalesce(sum(a.area_plantada_ha),0) into v_area
    from agri_safra_area a where a.safra_id=p_safra_id and a.cultura=p_cultura and a.ativo and a.cliente_id=p_cliente;
  select case when coalesce((select sum(area_plantada_ha) from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada'),0)>0 then coalesce((select sum(area_plantada_ha) from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and cultura=p_cultura and ativo and status='plantada'),0) / (select sum(area_plantada_ha) from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada') else 0 end into v_peso;
  select coalesce(sum(coalesce(col.toneladas, col.sacas_boas+col.grao_roca_sacas)),0) into v_sacas
    from agri_colheita col join agri_safra_area a on a.id=col.safra_area_id
    where a.safra_id=p_safra_id and a.cultura=p_cultura and col.ativo and col.cliente_id=p_cliente;

  select jsonb_object_agg(d.linha, d.valor) into v_dre
    from public.fn_dre_agricola_por_safra(p_cliente, p_safra_id) d where d.cultura=p_cultura;

  select jsonb_agg(jsonb_build_object('centro', centro, 'n', n, 'valor', valor, 'direto', direto, 'compartilhado', compartilhado) order by valor desc) into v_natureza
    from (select coalesce(l.centro_custo,'(sem)') centro, count(*) n, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) + coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0)*v_peso valor, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) direto, coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0) compartilhado
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and coalesce(l.cultura,'') in (p_cultura,'')
        and l.compoe_dre=true and l.tipo_operacao='2-Saídas' and coalesce(l.macro_custo,'') not ilike '%investimento%'
      group by l.centro_custo) t;

  select coalesce(sum(l.valor),0) into v_fora
    from financeiro_lancamentos_v2 l
    where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and coalesce(l.cultura,'') in (p_cultura,'')
      and l.tipo_operacao='2-Saídas' and l.compoe_dre=false and coalesce(l.macro_custo,'') not ilike '%investimento%';

  select jsonb_agg(jsonb_build_object('tipo', subcentro, 'valor', valor,
           'valor_ha', case when v_area>0 then round(valor/v_area,2) else 0 end, 'direto', direto, 'compartilhado', compartilhado) order by valor desc) into v_inv_tipos
    from (select l.subcentro, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) + coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0)*v_peso valor, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) direto, coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0) compartilhado
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and coalesce(l.cultura,'') in (p_cultura,'')
        and l.macro_custo ilike '%investimento%'
      group by l.subcentro) t;

  -- CORRIGIDO: area e sacas somadas SEPARADO antes de juntar (senao o join multiplica a area)
  select jsonb_agg(jsonb_build_object('talhao', talhao, 'variedade', variedade, 'area_ha', ha,
           'sacas', sacas, 'sacas_boas', boas, 'roca_sacas', roca, 'pct_afla20', pct_afla20, 'sacas_ha', case when ha>0 then round(sacas/ha,2) else 0 end, 'cargas', cargas)
           order by (case when ha>0 then sacas/ha else 0 end) desc) into v_talhoes
    from (
      select coalesce(p.nome,'(sem talhao)') talhao, ar.variedade, ar.ha,
             coalesce(c.sacas,0) sacas, coalesce(c.boas,0) boas, coalesce(c.roca,0) roca, coalesce(c.pct_afla20,0) pct_afla20, coalesce(c.cargas,0) cargas
      from (
        select a.pasto_id, a.variedade, sum(a.area_plantada_ha) ha
        from agri_safra_area a
        where a.safra_id=p_safra_id and a.cultura=p_cultura and a.ativo and a.cliente_id=p_cliente
        group by a.pasto_id, a.variedade
      ) ar
      left join pastos p on p.id=ar.pasto_id
      left join lateral (
        select sum(coalesce(col.toneladas, col.sacas_boas+col.grao_roca_sacas)) sacas, sum(col.sacas_boas) boas, sum(col.grao_roca_sacas) roca, round(100*coalesce(sum(col.sacas_boas) filter (where col.aflatoxina_ppb>20),0)/nullif(sum(col.sacas_boas),0),1) pct_afla20, count(col.id) cargas
        from agri_colheita col join agri_safra_area a2 on a2.id=col.safra_area_id
        where a2.pasto_id=ar.pasto_id and coalesce(a2.variedade,'')=coalesce(ar.variedade,'')
          and a2.safra_id=p_safra_id and a2.cultura=p_cultura and col.ativo
      ) c on true
    ) t;

  v_res := jsonb_build_object(
    'area_ha', v_area, 'total_sacas', v_sacas,
    'sacas_ha', case when v_area>0 then round(v_sacas/v_area,2) else 0 end,
    'faturamento', coalesce((v_dre->>'receita_bruta')::numeric,0),
    'deducoes', coalesce((v_dre->>'deducoes')::numeric,0),
    'custo_variavel', coalesce((v_dre->>'custo_variavel')::numeric,0),
    'custo_fixo', coalesce((v_dre->>'custo_fixo')::numeric,0),
    'juros', coalesce((v_dre->>'juros')::numeric,0),
    'rateio_compartilhado', coalesce((v_dre->>'rateio_compartilhado')::numeric,0),
    'rateio_admin', coalesce((v_dre->>'rateio_admin')::numeric,0),
    'saldo', coalesce((v_dre->>'resultado_caixa')::numeric,0),
    'investimento', coalesce((v_dre->>'investimento')::numeric,0),
    'investimento_tipos', coalesce(v_inv_tipos,'[]'::jsonb),
    'talhoes', coalesce(v_talhoes,'[]'::jsonb),
    'natureza', coalesce(v_natureza,'[]'::jsonb),
    'fora_do_custeio', v_fora
  );
  return v_res;
end $function$;

revoke all on function public.fn_painel_safra(uuid, uuid, text) from public;
grant execute on function public.fn_painel_safra(uuid, uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.fn_painel_safra_comparativo(p_cliente uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_safras jsonb;
begin
  select jsonb_agg(row_to_json(t) order by t.codigo) into v_safras from (
    select s.codigo, s.id safra_id,
      coalesce(ar.ha,0) area_ha,
      coalesce(col.sacas,0) total_sacas,
      case when coalesce(ar.ha,0)>0 then round(coalesce(col.sacas,0)/ar.ha,2) else 0 end sacas_ha,
      coalesce(col.boas,0) sacas_boas, coalesce(col.roca,0) sacas_roca,
      case when coalesce(col.sacas,0)>0 then round(100*coalesce(col.roca,0)/col.sacas,1) else 0 end pct_roca,
      coalesce(fin.receita,0) receita,
      coalesce(fin.custo,0) custeio_direto,
      case when coalesce(ar.ha,0)>0 then round(coalesce(fin.receita,0)/ar.ha,2) else 0 end receita_ha,
      coalesce(dre.custeio_total,0) custeio_total,
      case when coalesce(ar.ha,0)>0 then round(coalesce(dre.custeio_total,0)/ar.ha,2) else 0 end custeio_ha,
      case when coalesce(ar.ha,0)>0 then round((coalesce(fin.receita,0)-coalesce(dre.custeio_total,0))/ar.ha,2) else 0 end margem_ha,
      -- flag: receita parece incompleta se ha producao mas receita muito baixa por saca
      case when coalesce(col.sacas,0)>0 and coalesce(fin.receita,0)/nullif(col.sacas,0) < 40 then true else false end receita_incompleta
    from financeiro_safras s
    left join lateral (select sum(a.area_plantada_ha) ha from agri_safra_area a where a.safra_id=s.id and a.cultura=p_cultura and a.ativo) ar on true
    left join lateral (select sum(coalesce(c.toneladas, c.sacas_boas+c.grao_roca_sacas)) sacas, sum(c.sacas_boas) boas, sum(c.grao_roca_sacas) roca
       from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id where a.safra_id=s.id and a.cultura=p_cultura and c.ativo) col on true
    left join lateral (select sum(l.valor) filter (where l.tipo_operacao='1-Entradas') receita,
       sum(l.valor) filter (where l.tipo_operacao='2-Saídas' and l.compoe_dre=true and coalesce(l.macro_custo,'') not ilike '%investimento%') custo
       from financeiro_lancamentos_v2 l where l.safra_id=s.id and coalesce(l.cultura,'') in (p_cultura,'')) fin on true
    left join lateral (select sum(d.valor) filter (where d.linha in ('deducoes','custo_variavel','custo_fixo','juros','rateio_compartilhado','rateio_admin')) custeio_total from public.fn_dre_agricola_por_safra(p_cliente, s.id) d where d.cultura=p_cultura) dre on true
    where s.cliente_id=p_cliente and s.escopo_negocio='agricultura'
      and exists (select 1 from agri_safra_area a where a.safra_id=s.id and a.cultura=p_cultura and a.ativo)
  ) t;
  return jsonb_build_object('cultura', p_cultura, 'safras', coalesce(v_safras,'[]'::jsonb));
end $function$;

revoke all on function public.fn_painel_safra_comparativo(uuid, text) from public;
grant execute on function public.fn_painel_safra_comparativo(uuid, text) to authenticated;
