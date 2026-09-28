-- 20261027167100_oc_venda_entregas_01b_dados.sql
-- OC-VENDA-ENTREGAS-01b, DADOS da 232c05aa (Santa Rita, Helder Hofig, desmama 2025). Migration de DADO: nenhuma funcao,
-- gatilho ou tabela muda; tudo pelas RPCs, como o usuario do Gabriel (`request.jwt.claims`, so' nesta transacao).
--   1. modelo_financeiro 'titulo' -> 'conta_corrente' (evento `definir_modelo_financeiro`, versao + 1). Unica OC do modelo.
--   2. `oc_sincronizar_entregas`: as 7 entregas, uma por saida adotada, pelo valor de cada lote (D7: desmama_m -> 1120,
--      garrotes -> 1140). Receita sem caixa, competencia = pagamento = data da saida.
--   3. `oc_vincular_lancamento` dos 4 recebimentos (ramo conta corrente): a conta vai de "Venda de Desmama Machos" para
--      "Adiantamento de Clientes"; valor, datas, conta bancaria (nula) e hash ficam. D6: continuam SEM conta bancaria — nenhum
--      aparece como conciliado.
-- GUARDAS: partida exatamente a medida (versao 17, modelo titulo, 7 lotes, 7 saidas ativas, zero partes e compromissos, os 4
-- recebimentos no estado medido) e chegada conferida (7 entregas 2.366.601,26; 4 recebimentos 2.365.243,37 em Adiantamento de
-- Clientes com hash e competencia iguais; saldo da conta corrente 1.357,89 'ele_deve'; caixa da Santa Rita identico).

do $mig$
declare
  c_cli constant uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  c_oc  constant uuid := '232c05aa-e531-4f91-a4ba-a61e791d4d56';
  c_rec constant uuid[] := array['aee255bc-0777-4e90-af04-413e11e34ce4', '693fc917-34f7-404b-915a-149c2b09c1b4',
                                 'e57e3e60-290e-4449-9ee8-2b47db37ad2c', '568e80e6-16e0-4f3d-a11f-d05cba1beafe']::uuid[];
  c_motivo constant text := 'OC-VENDA-ENTREGAS-01b: recebimento da conta corrente (adiantamento de cliente)';
  v_op record; v_n int; v_x jsonb; v_ver int; v_id uuid; v_caixa text; v_rec text; v_cc jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  -- ── partida ──
  select * into v_op from public.zoo_operacoes_comerciais where id = c_oc;
  if v_op.versao <> 17 or v_op.modelo_financeiro <> 'titulo' or v_op.rascunho or v_op.status_comercial <> 'programada'
     or v_op.valor_acordado <> 2366601.26 then
    raise exception 'OC 232c05aa fora do estado medido (versao %, modelo %, acordado %)', v_op.versao, v_op.modelo_financeiro,
      v_op.valor_acordado;
  end if;
  if exists (select 1 from public.zoo_operacoes_comerciais where modelo_financeiro <> 'titulo') then
    raise exception 'ja existe OC fora do modelo titulo'; end if;
  if exists (select 1 from public.zoo_operacao_partes where operacao_id = c_oc)
     or exists (select 1 from public.zoo_operacao_compromissos where operacao_id = c_oc) then
    raise exception 'a 232c05aa deveria estar sem partes e sem compromissos'; end if;
  select count(*) into v_n from public.zoo_operacao_movimentacoes m join public.lancamentos l on l.id = m.movimentacao_id
   where m.operacao_id = c_oc and l.cancelado is not true and m.origem = 'adotada';
  if v_n <> 7 then raise exception 'saidas adotadas ativas: %, esperado 7', v_n; end if;
  select md5(string_agg(id || '|' || valor || '|' || data_competencia || '|' || data_pagamento || '|' || coalesce(hash_importacao, '')
               || '|' || coalesce(conta_bancaria_id::text, '-') || '|' || subcentro || '|' || status_transacao, ';' order by id))
    into v_rec from public.financeiro_lancamentos_v2 where id = any (c_rec);
  if (select count(*) from public.financeiro_lancamentos_v2
       where id = any (c_rec) and cancelado is not true and conta_bancaria_id is null and subcentro = 'Venda de Desmama Machos'
         and favorecido_id = v_op.contraparte_id and status_transacao = 'realizado') <> 4
     or (select sum(valor) from public.financeiro_lancamentos_v2 where id = any (c_rec)) <> 2365243.37
     or exists (select 1 from public.zoo_operacao_partes where financeiro_lancamento_id = any (c_rec))
     or exists (select 1 from public.conciliacao_bancaria_itens where lancamento_id = any (c_rec) and desfeito_em is null) then
    raise exception 'os 4 recebimentos do Helder fora do estado medido';
  end if;
  -- caixa da Santa Rita: tudo que movimenta caixa (sem as entregas, que nascem sem caixa), por mes de pagamento
  select md5(string_agg(x, ';' order by x)) into v_caixa from (
    select to_char(data_pagamento, 'YYYY-MM') || '|' || tipo_operacao || '|' || coalesce(conta_bancaria_id::text, '-') || '|'
           || sum(valor) as x
      from public.financeiro_lancamentos_v2
     where cliente_id = c_cli and cancelado is not true and coalesce(sem_movimentacao_caixa, false) = false
       and status_transacao in ('realizado', 'conciliado')
     group by tipo_operacao, conta_bancaria_id, to_char(data_pagamento, 'YYYY-MM')) q;

  -- ── 1. modelo ──
  update public.zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente', versao = versao + 1, updated_at = now(),
         updated_by = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'
   where id = c_oc;
  insert into public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  values (c_cli, c_oc, 'definir_modelo_financeiro', jsonb_build_object('modelo_financeiro', 'titulo'),
          jsonb_build_object('modelo_financeiro', 'conta_corrente'),
          jsonb_build_object('motivo', 'OC-VENDA-ENTREGAS-01b: contrato do ano com entregas e recebimentos em datas proprias (ADR-2026-21)',
                             'versao_anterior', 17, 'versao_nova', 18),
          '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'migration');

  -- ── 2. entregas ──
  v_x := public.oc_sincronizar_entregas(c_oc, 18, false);
  if jsonb_array_length(v_x->'criadas') <> 7 or jsonb_array_length(v_x->'atualizadas') <> 0
     or jsonb_array_length(v_x->'canceladas') <> 0 then
    raise exception 'sincronizar_entregas: %', v_x; end if;

  -- ── 3. recebimentos ──
  foreach v_id in array c_rec loop
    select versao into v_ver from public.zoo_operacoes_comerciais where id = c_oc;
    v_x := public.oc_vincular_lancamento(c_oc, v_ver, v_id, null, c_motivo);
    if (v_x->>'ok')::boolean is not true or v_x->>'modelo' <> 'conta_corrente'
       or (v_x->'lancamento'->>'hash_preservado')::boolean is not true then
      raise exception 'vincular recebimento %: %', v_id, v_x; end if;
  end loop;

  -- ── chegada ──
  select count(*) into v_n from public.zoo_operacao_partes pt
    join public.financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id and f.cancelado is not true
   where pt.operacao_id = c_oc and pt.origem = 'entrega' and pt.cancelada = false
     and f.sem_movimentacao_caixa and f.status_transacao = 'realizado' and f.conta_bancaria_id is null;
  if v_n <> 7 or (select sum(valor) from public.zoo_operacao_partes where operacao_id = c_oc and origem = 'entrega'
                    and cancelada = false) <> 2366601.26 then
    raise exception 'entregas depois: % titulos', v_n; end if;
  if (select md5(string_agg(id || '|' || valor || '|' || data_competencia || '|' || data_pagamento || '|' || coalesce(hash_importacao, '')
               || '|' || coalesce(conta_bancaria_id::text, '-') || '|' || 'Venda de Desmama Machos' || '|' || status_transacao, ';' order by id))
        from public.financeiro_lancamentos_v2 where id = any (c_rec)) <> v_rec
     or (select count(*) from public.financeiro_lancamentos_v2 where id = any (c_rec) and subcentro = 'Adiantamento de Clientes'
           and compoe_dre is not true) <> 4 then
    raise exception 'recebimentos depois: so a conta deveria ter mudado'; end if;
  v_cc := public.oc_conta_corrente(c_oc);
  if (v_cc->>'saldo')::numeric <> 1357.89 or v_cc->>'situacao' <> 'ele_deve' or (v_cc->>'recebido')::numeric <> 2365243.37
     or (v_cc->>'entregue')::numeric <> 2366601.26 or (v_cc->>'recebimentos_sem_conta_bancaria')::int <> 4
     or (v_cc->>'saidas_sem_entrega')::int <> 0 then
    raise exception 'conta corrente depois: %', v_cc - 'linhas'; end if;
  if (select md5(string_agg(x, ';' order by x)) from (
        select to_char(data_pagamento, 'YYYY-MM') || '|' || tipo_operacao || '|' || coalesce(conta_bancaria_id::text, '-') || '|'
               || sum(valor) as x
          from public.financeiro_lancamentos_v2
         where cliente_id = c_cli and cancelado is not true and coalesce(sem_movimentacao_caixa, false) = false
           and status_transacao in ('realizado', 'conciliado')
         group by tipo_operacao, conta_bancaria_id, to_char(data_pagamento, 'YYYY-MM')) q) <> v_caixa then
    raise exception 'o caixa da Santa Rita mudou'; end if;
end $mig$;
