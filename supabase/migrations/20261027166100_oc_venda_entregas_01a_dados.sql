-- 20261027166100_oc_venda_entregas_01a_dados.sql
-- OC-VENDA-ENTREGAS-01a, DADOS da 232c05aa (Santa Rita, Helder Hofig, desmama 2025). Migration de DADO: nenhuma funcao,
-- gatilho ou tabela muda; tudo pelas RPCs da OC, como o usuario do Gabriel (`request.jwt.claims`, so' nesta transacao).
--   1. `oc_salvar_lotes`: os 5 lotes de sempre + 2 lotes de garrotes (ordem 6: 6 cab, 234,77 kg, 12,80/kg; ordem 7: 11 cab,
--      189,82 kg, 12,00/kg). Caminho A: a OC so' tem os 5 vinculos estornados no PASSO A.
--   2. `oc_adotar_movimentacao` das 7 saidas historicas (13/04/2026), uma por lote, com a versao devolvida pela anterior.
-- Os lancamentos NAO sao tocados: valor, data, categoria e cabecas ficam como estavam (d6ce7648 574.041,83; 5293daf3 18.031,09).
-- GUARDAS: partida exatamente a medida (versao 9, 5 lotes, entrega aberta, 5 vinculos mortos, as 7 saidas ativas e sem OC) e
-- chegada conferida (7 lotes, 7 adotadas, entrega 779/779, acordado 2.366.601,26, lancamentos da fazenda identicos).

do $mig$
declare
  c_cli constant uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  c_faz constant uuid := '161b905e-f14c-4a9b-965f-dd3c8f82dc74';
  c_oc  constant uuid := '232c05aa-e531-4f91-a4ba-a61e791d4d56';
  v_op record; v_n int; v_p jsonb; v_ver int; r record; v_lancs text; v_x jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  -- ── partida ──
  select * into v_op from public.zoo_operacoes_comerciais where id = c_oc;
  if v_op.versao <> 9 or v_op.entrega_encerrada or v_op.status_comercial <> 'programada' or v_op.rascunho
     or v_op.valor_acordado <> 2323514.68 then
    raise exception 'OC 232c05aa fora do estado medido (versao %, entrega %, status %, acordado %)',
      v_op.versao, v_op.entrega_encerrada, v_op.status_comercial, v_op.valor_acordado;
  end if;
  select count(*) into v_n from public.zoo_operacao_lotes where operacao_id = c_oc;
  if v_n <> 5 then raise exception 'a 232c05aa tem % lotes; esperados 5', v_n; end if;
  select count(*) into v_n from public.zoo_operacao_movimentacoes m join public.lancamentos l on l.id = m.movimentacao_id
   where m.operacao_id = c_oc and l.cancelado is true;
  if v_n <> 5 or exists (select 1 from public.zoo_operacao_movimentacoes m join public.lancamentos l on l.id = m.movimentacao_id
                          where m.operacao_id = c_oc and l.cancelado is not true) then
    raise exception 'a 232c05aa deveria ter so os 5 vinculos estornados do PASSO A';
  end if;
  select count(*) into v_n from public.lancamentos l
   where l.id in ('ef0a8a40-19d1-47f3-aaba-9acc82524e49','4cc823d6-c5aa-4abb-96d6-c5abc068936b','d6ce7648-7ea7-40dd-a343-98cef9c3d510',
                  '2f734c9e-261a-4340-9303-f01118a79cf1','1bebd160-0fd7-4a90-aea1-6b3feb66605a','5293daf3-85bc-4c4c-85fd-751d0dbb197c',
                  '81e41593-d0aa-4963-bd01-99670d2c0af2')
     and l.cancelado is not true
     and not exists (select 1 from public.zoo_operacao_movimentacoes m where m.movimentacao_id = l.id);
  if v_n <> 7 then raise exception 'esperadas 7 saidas historicas ativas e sem OC, achadas %', v_n; end if;
  select md5(string_agg(l::text, '|' order by l.id)) into v_lancs from public.lancamentos l where l.fazenda_id = c_faz;

  -- ── 1. os 2 lotes de garrotes ──
  select jsonb_agg(jsonb_build_object('ordem', ordem, 'categoria_negociada', categoria_negociada, 'qtd_negociada', qtd_negociada,
           'peso_medio_negociado_kg', peso_medio_negociado_kg, 'criterio_valor', criterio_valor, 'valor_informado', valor_informado,
           'observacao', observacao) order by ordem) into v_p
    from public.zoo_operacao_lotes where operacao_id = c_oc;
  v_p := v_p || jsonb_build_array(
    jsonb_build_object('ordem', 6, 'categoria_negociada', 'garrotes', 'qtd_negociada', 6, 'peso_medio_negociado_kg', 234.77,
                       'criterio_valor', 'kg', 'valor_informado', 12.80),
    jsonb_build_object('ordem', 7, 'categoria_negociada', 'garrotes', 'qtd_negociada', 11, 'peso_medio_negociado_kg', 189.82,
                       'criterio_valor', 'kg', 'valor_informado', 12.00));
  perform public.oc_salvar_lotes(c_oc, c_cli, 9, v_p);

  -- ── 2. adotar as 7 ──
  for r in select * from (values
    (1, 'ef0a8a40-19d1-47f3-aaba-9acc82524e49'::uuid), (2, '4cc823d6-c5aa-4abb-96d6-c5abc068936b'),
    (3, 'd6ce7648-7ea7-40dd-a343-98cef9c3d510'), (4, '2f734c9e-261a-4340-9303-f01118a79cf1'),
    (5, '1bebd160-0fd7-4a90-aea1-6b3feb66605a'), (6, '5293daf3-85bc-4c4c-85fd-751d0dbb197c'),
    (7, '81e41593-d0aa-4963-bd01-99670d2c0af2')) v(ordem, lanc)
  loop
    select versao into v_ver from public.zoo_operacoes_comerciais where id = c_oc;
    v_x := public.oc_adotar_movimentacao(c_oc, c_cli,
             (select id from public.zoo_operacao_lotes where operacao_id = c_oc and ordem = r.ordem), r.lanc, v_ver);
  end loop;

  -- ── chegada ──
  select count(*) into v_n from public.zoo_operacao_lotes where operacao_id = c_oc;
  if v_n <> 7 then raise exception 'lotes: %, esperado 7', v_n; end if;
  select count(*) into v_n from public.zoo_operacao_movimentacoes where operacao_id = c_oc and origem = 'adotada';
  if v_n <> 7 then raise exception 'adotadas: %, esperado 7', v_n; end if;
  select sum(qtd_recebida) into v_n from public.vw_oc_lotes_recebimento where operacao_id = c_oc;
  if v_n <> 779 or exists (select 1 from public.vw_oc_lotes_recebimento where operacao_id = c_oc and estado_recebimento <> 'completo') then
    raise exception 'entrega: % cab entregues; esperado 779 com os 7 lotes completos', v_n; end if;
  select * into v_op from public.zoo_operacoes_comerciais where id = c_oc;
  if v_op.valor_acordado <> 2366601.26 or v_op.qtd_negociada <> 779 or v_op.versao <> 17 then
    raise exception 'OC depois: acordado %, qtd %, versao %', v_op.valor_acordado, v_op.qtd_negociada, v_op.versao; end if;
  if (select md5(string_agg(l::text, '|' order by l.id)) from public.lancamentos l where l.fazenda_id = c_faz) <> v_lancs then
    raise exception 'lancamentos da Faz. Sta. Rita mudaram'; end if;
end $mig$;
