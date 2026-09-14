-- PAINEL DA SAFRA — a RPC ganha investimento por tipo e produtividade por talhao/variedade.
--
-- JA APLICADA NO PROTO pelo arquiteto; este arquivo VERSIONA o que esta vivo em 14/09/2026.
-- Corpo extraido de pg_get_functiondef, nao redigitado.
-- md5(prosrc) conferido = cb393bd13045b8be8ed738ebe06c1f68
--   (era e65e98bff5966929147ceeb7ba084f1c na migration 20260930120000)
--
-- ⚠⚠ ESTA MIGRATION CORRIGE UM DEFEITO DE CONTAGEM, e ele merece ser lido antes do resto: a area
--   por talhao vinha de um `sum(area_plantada_ha)` sobre um join com `agri_colheita`. O join
--   REPETE a linha da area uma vez por carga, entao a soma MULTIPLICAVA a area pelo numero de
--   cargas — o Ind 02, de 94,3 ha, aparecia com 1.320 ha (14 cargas x 94,3). E a produtividade,
--   que divide sacas por area, saia catorze vezes MENOR.
--   ⚠ O DEFEITO ERA SILENCIOSO NA DIRECAO PERIGOSA: nao dava erro, nao dava zero, dava um numero
--   plausivel e baixo. Uma safra boa pareceria ruim, e ninguem desconfia de um numero ruim.
--   Agora area e cargas sao somadas SEPARADO — subquery agrupada para a area, LATERAL para as
--   cargas — e so depois se juntam. Medido 24/25: Ind 02 94,3 ha / 158,64 sc/ha, Ind 03 92,2 ha /
--   151,78 sc/ha, total 186,5 ha.
--
-- ⚠ `investimento_tipos` QUEBRA O INVESTIMENTO POR SUBCENTRO (Formacao de Area, Maquinas
--   Agricolas). Ele continua FORA do resultado do ciclo — vira patrimonio e amortiza em anos —,
--   e a quebra existe para o produtor ver o que foi abertura de solo e o que foi maquina, que
--   sao decisoes de natureza diferente com prazos de retorno diferentes.
--
-- ⚠ A CHAVE DO TALHAO E `pasto_id + variedade`, nao so o pasto: o mesmo talhao pode ter duas
--   variedades na mesma safra, e desde o AGRI-AREA-VARIEDADE-NA-CHAVE elas sao duas linhas de
--   `agri_safra_area`. O `coalesce(variedade,'')` dos dois lados do LATERAL e o que faz a
--   variedade NULA casar com ela mesma — sem ele, a linha sem variedade nao acharia carga nenhuma.
--
-- ⚠ SO A PRODUTIVIDADE E REAL POR TALHAO. O custo NAO liga a talhao: `financeiro_lancamentos_v2`
--   guarda safra e cultura, nunca a area plantada. Por isso esta funcao nao devolve custo por
--   talhao — e a tela diz isso por escrito, em vez de dividir o custo pela area e fingir que sabe.

CREATE OR REPLACE FUNCTION public.fn_painel_safra(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_area numeric; v_sacas numeric; v_res jsonb; v_dre jsonb; v_natureza jsonb; v_fora numeric;
  v_inv_tipos jsonb; v_talhoes jsonb;
begin
  select coalesce(sum(a.area_plantada_ha),0) into v_area
    from agri_safra_area a where a.safra_id=p_safra_id and a.cultura=p_cultura and a.ativo and a.cliente_id=p_cliente;
  select coalesce(sum(col.sacas_boas+col.grao_roca_sacas),0) into v_sacas
    from agri_colheita col join agri_safra_area a on a.id=col.safra_area_id
    where a.safra_id=p_safra_id and a.cultura=p_cultura and col.ativo and col.cliente_id=p_cliente;

  select jsonb_object_agg(d.linha, d.valor) into v_dre
    from public.fn_dre_agricola_por_safra(p_cliente, p_safra_id) d where d.cultura=p_cultura;

  select jsonb_agg(jsonb_build_object('centro', centro, 'n', n, 'valor', valor) order by valor desc) into v_natureza
    from (select coalesce(l.centro_custo,'(sem)') centro, count(*) n, sum(l.valor) valor
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cultura,'') in (p_cultura,'')
        and l.compoe_dre=true and l.tipo_operacao='2-Saídas' and coalesce(l.macro_custo,'') not ilike '%investimento%'
      group by l.centro_custo) t;

  select coalesce(sum(l.valor),0) into v_fora
    from financeiro_lancamentos_v2 l
    where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cultura,'') in (p_cultura,'')
      and l.tipo_operacao='2-Saídas' and l.compoe_dre=false and coalesce(l.macro_custo,'') not ilike '%investimento%';

  select jsonb_agg(jsonb_build_object('tipo', subcentro, 'valor', valor,
           'valor_ha', case when v_area>0 then round(valor/v_area,2) else 0 end) order by valor desc) into v_inv_tipos
    from (select l.subcentro, sum(l.valor) valor
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cultura,'') in (p_cultura,'')
        and l.macro_custo ilike '%investimento%'
      group by l.subcentro) t;

  -- CORRIGIDO: area e sacas somadas SEPARADO antes de juntar (senao o join multiplica a area)
  select jsonb_agg(jsonb_build_object('talhao', talhao, 'variedade', variedade, 'area_ha', ha,
           'sacas', sacas, 'sacas_ha', case when ha>0 then round(sacas/ha,2) else 0 end, 'cargas', cargas)
           order by (case when ha>0 then sacas/ha else 0 end) desc) into v_talhoes
    from (
      select coalesce(p.nome,'(sem talhao)') talhao, ar.variedade, ar.ha,
             coalesce(c.sacas,0) sacas, coalesce(c.cargas,0) cargas
      from (
        select a.pasto_id, a.variedade, sum(a.area_plantada_ha) ha
        from agri_safra_area a
        where a.safra_id=p_safra_id and a.cultura=p_cultura and a.ativo and a.cliente_id=p_cliente
        group by a.pasto_id, a.variedade
      ) ar
      left join pastos p on p.id=ar.pasto_id
      left join lateral (
        select sum(col.sacas_boas+col.grao_roca_sacas) sacas, count(col.id) cargas
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


-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` NAO preserva privilegios de
--   forma confiavel quando o default-privilege global concede EXECUTE a PUBLIC. A funcao e
--   SECURITY DEFINER e le o financeiro inteiro do cliente. Medido depois de aplicada:
--   anon=false, authenticated=true.
revoke all on function public.fn_painel_safra(uuid, uuid, text) from public;
grant execute on function public.fn_painel_safra(uuid, uuid, text) to authenticated;
