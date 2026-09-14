-- PAINEL DA SAFRA — a RPC de leitura do raio-x do ciclo.
--
-- JA APLICADA NO PROTO pelo arquiteto sob GO; este arquivo VERSIONA o que esta vivo.
-- Corpo extraido de pg_get_functiondef em 13/09/2026, nao redigitado.
-- md5(prosrc) conferido = e65e98bff5966929147ceeb7ba084f1c
--
-- ⚠ FONTE UNICA, NAO SEGUNDA CONTA. Faturamento, custos, rateios e saldo saem de
--   `fn_dre_agricola_por_safra` — a mesma funcao que alimenta a tela "DRE por cultura". Se esta
--   funcao recalculasse, o Painel da Safra e o DRE responderiam a mesma pergunta com numeros
--   diferentes, e nenhum operador saberia qual dos dois esta certo. O que ela ACRESCENTA e o que
--   o DRE nao tem: area, producao e o desdobramento por centro.
--
-- ⚠ A PRODUCAO INCLUI O GRAO DE ROCA (`sacas_boas + grao_roca_sacas`). Medido no Proto: a 23/24
--   de amendoim tem 7.746,65 boas + 620,63 de roca = 8.367,28. Somar so as boas daria 7.746,65 e
--   o R$/saca do painel ficaria 8% alto.
--   ⚠ E ISSO DIVERGE DE `totaisColheita` NO FRONT DE PROPOSITO: la a roca fica FORA das faixas de
--   aflatoxina, porque a cooperativa a paga a parte. Sao perguntas diferentes — "quanto se
--   vendeu em cada classe" e "quanto o talhao produziu" — e as duas respostas estao certas.
--
-- ⚠ O BREAKDOWN `natureza` NAO SOMA O CUSTEIO TOTAL, e quem montar a tela precisa saber: ele
--   traz so o custeio DIRETO da safra (561.069,03 na 23/24), porque e o que existe lancado com
--   `safra_id`. O rateio administrativo (104.675,83) vem do DRE, por janela de datas e peso da
--   cultura, e nao tem centro de custo proprio. 561.069,03 + 104.675,83 = 665.744,86, o custeio
--   total. A tela mostra o rateio como LINHA PROPRIA marcada "estimado".
--
-- ⚠ `coalesce(cultura,'') in (p_cultura,'')` — o vazio entra de proposito. Medido: 2 lancamentos
--   da 23/24 (R$ 87,58, centro Administracao) estao com cultura NULA. Um filtro estrito por
--   cultura os perderia, e o custeio nao fecharia com o DRE por centavos que ninguem acharia.
--
-- ⚠ `fora_do_custeio` EXISTE PARA NAO MENTIR POR OMISSAO: sao as saidas da safra que NAO compoem
--   DRE (R$ 20.000 na 23/24, uma "Saida Financeira"). Elas nao entram no custeio e nao deveriam,
--   mas o operador que somar os lancamentos a mao vai achar a diferenca — e a tela precisa dizer
--   que ela existe antes que ele a descubra sozinho.
--
-- Medido na 23/24 amendoim: area 60,60 ha, 8.367,28 sc, 138,07 sc/ha, faturamento 873.663,36,
-- custeio total 665.744,86 (variavel 557.546,79 + fixo 3.434,66 + rateio comp 87,58 + rateio
-- admin 104.675,83), saldo 207.918,50, fora_do_custeio 20.000,00.

CREATE OR REPLACE FUNCTION public.fn_painel_safra(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_area numeric; v_sacas numeric; v_res jsonb; v_dre jsonb; v_natureza jsonb; v_fora numeric;
begin
  -- area e producao (colheita liga talhao; producao = boas + roca)
  select coalesce(sum(a.area_plantada_ha),0) into v_area
    from agri_safra_area a where a.safra_id=p_safra_id and a.cultura=p_cultura and a.ativo and a.cliente_id=p_cliente;
  select coalesce(sum(col.sacas_boas+col.grao_roca_sacas),0) into v_sacas
    from agri_colheita col join agri_safra_area a on a.id=col.safra_area_id
    where a.safra_id=p_safra_id and a.cultura=p_cultura and col.ativo and col.cliente_id=p_cliente;

  -- DRE por cultura como FONTE UNICA (nao recalcula)
  select jsonb_object_agg(d.linha, d.valor) into v_dre
    from public.fn_dre_agricola_por_safra(p_cliente, p_safra_id) d where d.cultura=p_cultura;

  -- breakdown por natureza (centro), so custeio direto: compoe DRE, saida, sem investimento
  select jsonb_agg(jsonb_build_object('centro', centro, 'n', n, 'valor', valor)
           order by valor desc) into v_natureza
    from (
      select coalesce(l.centro_custo,'(sem)') centro, count(*) n, sum(l.valor) valor
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id
        and coalesce(l.cultura,'') in (p_cultura,'')
        and l.compoe_dre=true and l.tipo_operacao='2-Saídas'
        and coalesce(l.macro_custo,'') not ilike '%investimento%'
      group by l.centro_custo
    ) t;

  -- lancamentos da safra que NAO compoem DRE (o operador precisa saber que existem)
  select coalesce(sum(l.valor),0) into v_fora
    from financeiro_lancamentos_v2 l
    where l.cliente_id=p_cliente and l.safra_id=p_safra_id
      and coalesce(l.cultura,'') in (p_cultura,'')
      and l.tipo_operacao='2-Saídas' and l.compoe_dre=false
      and coalesce(l.macro_custo,'') not ilike '%investimento%';

  v_res := jsonb_build_object(
    'area_ha', v_area,
    'total_sacas', v_sacas,
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
    'natureza', coalesce(v_natureza,'[]'::jsonb),
    'fora_do_custeio', v_fora
  );
  return v_res;
end $function$;


-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: o default-privilege global concede EXECUTE a
--   PUBLIC em funcao nova. A funcao e SECURITY DEFINER e le o financeiro inteiro do cliente;
--   sem o revoke, o papel `anon` — visitante nao autenticado — leria faturamento e custo de
--   qualquer safra. Medido depois de aplicada: anon=false, authenticated=true.
revoke all on function public.fn_painel_safra(uuid, uuid, text) from public;
grant execute on function public.fn_painel_safra(uuid, uuid, text) to authenticated;
