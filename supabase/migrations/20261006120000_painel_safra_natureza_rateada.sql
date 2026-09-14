-- PR-PAINEL-SAFRA — natureza e investimento passam a devolver o valor JA RATEADO.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       a42aff828fc96fe4cd90ed9222f7361d  (5.911 bytes)
--
-- O DEFEITO QUE ELA CONSERTA, medido antes e depois na 25/26:
--   A versao anterior somava o compartilhado INTEIRO em cada cultura — `coalesce(cultura,'') in
--   (p_cultura,'')` sem repartir. A cultura pequena carregava 100% do pool e a coluna "%" do
--   painel estourava:
--       mandioca  soma das naturezas 912.524,32 / custeio 354.445,65  =  257,5%
--       amendoim  1.801.576,50 / 1.828.384,24                         =   98,5%
--   Agora `valor` = direto[cultura] + compartilhado x peso de area plantada:
--       mandioca  303.066,25 / 354.445,65  =  85,5%
--       amendoim  1.637.516,97 / 1.828.384,24  =  89,6%
--
-- O QUE MUDOU (tres pontos, conferidos no diff):
--   1. declara `v_peso` e o calcula: a area PLANTADA da cultura sobre a area PLANTADA da safra;
--   2. `natureza[]` e `investimento_tipos[]` passam a devolver `valor` rateado E os dois
--      componentes separados, `direto` e `compartilhado`;
--   3. nada mais muda — talhoes, DRE, fora_do_custeio e o resto do envelope sao identicos.
--
-- ⚠ O PESO CONTA SO `status='plantada'`, a MESMA regra do `fatias` de `fn_painel_rateio_detalhe`.
--   Area em abertura nao planta e nao puxa rateio. Consequencia visivel: numa safra com area em
--   abertura o peso NAO bate com a area do cartao do topo do painel, que soma todas as areas
--   ativas — e a diferenca e' correta, nao defeito.
-- ⚠ E `direto`/`compartilhado` VEM SEPARADOS DE PROPOSITO: e' o que permite a tela explicar o
--   numero sem uma segunda consulta por linha. Antes, saber quanto de uma natureza era rateado
--   exigia uma chamada de `fn_painel_rateio_detalhe` por centro — quinze RPCs para desenhar uma
--   tabela.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` preserva privilegios, mas num
--   banco novo a funcao nasce com EXECUTE para PUBLIC por default-privilege global. Ela e SECURITY
--   DEFINER e le receita e custo de todas as safras do cliente.
--   Medido no Proto: anon=false, authenticated=true.

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
  select coalesce(sum(col.sacas_boas+col.grao_roca_sacas),0) into v_sacas
    from agri_colheita col join agri_safra_area a on a.id=col.safra_area_id
    where a.safra_id=p_safra_id and a.cultura=p_cultura and col.ativo and col.cliente_id=p_cliente;

  select jsonb_object_agg(d.linha, d.valor) into v_dre
    from public.fn_dre_agricola_por_safra(p_cliente, p_safra_id) d where d.cultura=p_cultura;

  select jsonb_agg(jsonb_build_object('centro', centro, 'n', n, 'valor', valor, 'direto', direto, 'compartilhado', compartilhado) order by valor desc) into v_natureza
    from (select coalesce(l.centro_custo,'(sem)') centro, count(*) n, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) + coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0)*v_peso valor, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) direto, coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0) compartilhado
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cultura,'') in (p_cultura,'')
        and l.compoe_dre=true and l.tipo_operacao='2-Saídas' and coalesce(l.macro_custo,'') not ilike '%investimento%'
      group by l.centro_custo) t;

  select coalesce(sum(l.valor),0) into v_fora
    from financeiro_lancamentos_v2 l
    where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cultura,'') in (p_cultura,'')
      and l.tipo_operacao='2-Saídas' and l.compoe_dre=false and coalesce(l.macro_custo,'') not ilike '%investimento%';

  select jsonb_agg(jsonb_build_object('tipo', subcentro, 'valor', valor,
           'valor_ha', case when v_area>0 then round(valor/v_area,2) else 0 end, 'direto', direto, 'compartilhado', compartilhado) order by valor desc) into v_inv_tipos
    from (select l.subcentro, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) + coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0)*v_peso valor, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) direto, coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0) compartilhado
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cultura,'') in (p_cultura,'')
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
        select sum(col.sacas_boas+col.grao_roca_sacas) sacas, sum(col.sacas_boas) boas, sum(col.grao_roca_sacas) roca, round(100*coalesce(sum(col.sacas_boas) filter (where col.aflatoxina_ppb>20),0)/nullif(sum(col.sacas_boas),0),1) pct_afla20, count(col.id) cargas
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
