-- 20261027163000_oc_venda_entregas_01_limpeza.sql
-- OC-VENDA-ENTREGAS-01, PASSO A: limpeza do caso Santa Rita (Helder Hofig, desmama 2025). Migration de DADO: nenhuma
-- funcao, gatilho ou tabela muda; tudo passa pelas RPCs oficiais da OC, e depois pela rotina oficial do cache.
--
-- O CASO: em 28/09/2026 a OC 232c05aa (venda, 19/03/2025, 5 lotes de desmama, 762 cab) registrou pela aba Entrega 5
-- saidas NOVAS no rebanho (11:08-11:09) para embarques que ja existiam no historico importado (13/04/2026). Resultado:
-- 762 cab saindo duas vezes, desfrute de 2025 em 2.661 cab (certo: 1.899), a recalibracao de julho pelo fechamento
-- declarando os 762 como producao, e o cache de 2025 da Faz. Sta. Rita APAGADO pelo gatilho de invalidacao. A OC
-- 73a28eb6 era uma primeira tentativa da mesma venda, em rascunho, sem efeito nenhum.
--
-- O QUE FAZ (decisao do Gabriel):
--   1. 232c05aa: `oc_estornar_movimentacao` nas 5 saidas novas (append-only: o lancamento e' cancelado, o vinculo
--      fica). A entrega ja' estava reaberta pelo proprio Gabriel (28/09 11:21:20, motivo "garrotes", versao 5 -> 6);
--      a partida exige versao 6 e entrega aberta. Os 7 historicos NAO sao tocados.
--   2. 73a28eb6: `oc_cancelar`.
--   3. `refresh_zoot_cache(Faz. Sta. Rita, 2025)` — a unica fazenda-ano sem cache hoje (varredura).
-- As RPCs rodam como o usuario do Gabriel (`request.jwt.claims`, so' nesta transacao): a trilha em
-- `zoo_operacao_eventos` e o `updated_by` dos lancamentos ficam com o autor de quem decidiu, como pela tela.
--
-- GUARDAS: aborta se qualquer estado de partida divergir do medido (versoes, entrega, as 5 saidas ativas e vinculadas,
-- os 7 historicos ativos e soltos, a 73a28eb6 sem efeito) e confere o estado de chegada.

do $mig$
declare
  c_cli constant uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  c_faz constant uuid := '161b905e-f14c-4a9b-965f-dd3c8f82dc74';
  c_oc  constant uuid := '232c05aa-e531-4f91-a4ba-a61e791d4d56';
  c_rsc constant uuid := '73a28eb6-5909-46f7-b181-3c3ea99eeb0b';
  c_motivo constant text := 'duplicada: saida ja existia no historico importado; sera adotada pela OC';
  v_links uuid[] := array['0d7011a3-627f-4d0a-bda9-4b495c394151','c3811db8-b83b-413f-adda-326e690df0cc',
                          'a2cad16e-0950-4bc1-8899-17a58c48ef3a','242700af-bb0b-45f1-a5e8-222234d3b902',
                          '83ecacf8-59bc-4bd2-a8cd-4bc9259a6a94']::uuid[];
  v_novos uuid[] := array['4812f1e9-7246-40f1-b171-8aa32a364997','af48ead8-d35d-49de-8687-30966583e611',
                          '3780a107-8d92-444e-a737-ac32dc26cc07','eea57264-e1e9-4a1a-86f2-12432194b24c',
                          '86da927f-8da4-4e2b-bd20-f63664b40a24']::uuid[];
  v_hist uuid[] := array['ef0a8a40-19d1-47f3-aaba-9acc82524e49','4cc823d6-c5aa-4abb-96d6-c5abc068936b',
                         'd6ce7648-7ea7-40dd-a343-98cef9c3d510','2f734c9e-261a-4340-9303-f01118a79cf1',
                         '1bebd160-0fd7-4a90-aea1-6b3feb66605a','5293daf3-85bc-4c4c-85fd-751d0dbb197c',
                         '81e41593-d0aa-4963-bd01-99670d2c0af2']::uuid[];
  v_op record; v_n int; v_l uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  -- ── partida ──
  select * into v_op from public.zoo_operacoes_comerciais where id = c_oc;
  if v_op.versao <> 6 or v_op.entrega_encerrada or v_op.status_comercial <> 'programada' or v_op.rascunho then
    raise exception 'OC 232c05aa fora do estado medido (versao %, entrega %, status %, rascunho %)',
      v_op.versao, v_op.entrega_encerrada, v_op.status_comercial, v_op.rascunho;
  end if;
  select count(*) into v_n from public.zoo_operacao_movimentacoes m join public.lancamentos l on l.id = m.movimentacao_id
   where m.operacao_id = c_oc and m.id = any(v_links) and l.id = any(v_novos) and l.cancelado is not true;
  if v_n <> 5 then raise exception 'esperadas 5 saidas ativas da 232c05aa, achadas %', v_n; end if;
  select count(*) into v_n from public.zoo_operacao_movimentacoes where operacao_id = c_oc;
  if v_n <> 5 then raise exception 'a 232c05aa tem % vinculos; esperados 5', v_n; end if;
  select count(*) into v_n from public.lancamentos l where l.id = any(v_hist) and l.cancelado is not true
     and not exists (select 1 from public.zoo_operacao_movimentacoes m where m.movimentacao_id = l.id);
  if v_n <> 7 then raise exception 'esperados 7 historicos ativos e soltos, achados %', v_n; end if;
  select * into v_op from public.zoo_operacoes_comerciais where id = c_rsc;
  if v_op.versao <> 4 or v_op.status_comercial <> 'programada' then
    raise exception 'OC 73a28eb6 fora do estado medido (versao %, status %)', v_op.versao, v_op.status_comercial; end if;
  if exists (select 1 from public.zoo_operacao_movimentacoes where operacao_id = c_rsc)
     or exists (select 1 from public.zoo_operacao_compromissos where operacao_id = c_rsc)
     or exists (select 1 from public.zoo_operacao_partes where operacao_id = c_rsc) then
    raise exception 'OC 73a28eb6 tem efeito registrado'; end if;

  -- ── 1. 232c05aa: estornar as 5 saidas novas (a entrega ja foi reaberta pelo Gabriel, 28/09 11:21:20) ──
  foreach v_l in array v_links loop
    perform public.oc_estornar_movimentacao(v_l, c_cli, c_motivo);
  end loop;

  -- ── 2. 73a28eb6: cancelar ──
  perform public.oc_cancelar(c_rsc, c_cli, 4, 'duplicada da 232c05aa (teste)');

  -- ── 3. cache da Faz. Sta. Rita 2025 (os estornos acabaram de apagar de novo; a guarda e' "sem linha") ──
  select count(*) into v_n from public.zoot_mensal_cache where fazenda_id = c_faz and ano = 2025;
  if v_n > 0 then raise exception 'Faz. Sta. Rita 2025 ja tem % linhas no cache', v_n; end if;
  perform public.refresh_zoot_cache(c_faz, 2025);

  -- ── chegada ──
  select count(*) into v_n from public.lancamentos where id = any(v_novos) and cancelado is true;
  if v_n <> 5 then raise exception 'saidas novas canceladas: %, esperado 5', v_n; end if;
  select count(*) into v_n from public.lancamentos where id = any(v_hist) and cancelado is not true;
  if v_n <> 7 then raise exception 'historicos ativos: %, esperado 7', v_n; end if;
  select count(*) into v_n from public.zoo_operacoes_comerciais where id = c_rsc and status_comercial = 'cancelada';
  if v_n <> 1 then raise exception '73a28eb6 nao ficou cancelada'; end if;
  select count(*) into v_n from public.zoo_operacoes_comerciais where id = c_oc and entrega_encerrada = false;
  if v_n <> 1 then raise exception '232c05aa nao ficou com a entrega reaberta'; end if;
  select count(distinct mes) into v_n from public.zoot_mensal_cache where fazenda_id = c_faz and ano = 2025 and cenario = 'realizado';
  if v_n <> 12 then raise exception 'cache da Faz. Sta. Rita 2025 com % meses; esperado 12', v_n; end if;
end $mig$;
