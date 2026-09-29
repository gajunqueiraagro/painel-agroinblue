-- 20261027172100_oc_conta_corrente_todos_01a_dados.sql
-- OC-CONTA-CORRENTE-TODOS-01a, DADOS da OC de homologacao 1337bb2d (Agnaldo, compra de 121 desmama machos, 25/03/2026).
-- Migration de DADO: nenhuma funcao, gatilho ou tabela muda; tudo pelas RPCs, como o usuario do Gabriel (`request.jwt.claims`,
-- so' nesta transacao). As OUTRAS compras continuam no modelo titulo (a migracao delas e' o PR 3).
--   1. `oc_desvincular_lancamento` do principal f110eb68 (307.460, pago em 25/04): a parte, a parcela, a programacao e o
--      compromisso do modelo titulo saem; a liquidacao automatica e' estornada; o titulo fica vivo, com o mesmo valor, datas,
--      conta bancaria e hash.
--   2. modelo_financeiro 'titulo' -> 'conta_corrente' (evento `definir_modelo_financeiro`, versao + 1).
--   3. `oc_sincronizar_entregas`: a ENTRADA do gado — "Compra 121 DM", 307.460 em "Investimento Compra Bovinos Machos",
--      sem caixa, competencia 25/03/2026 (a data da entrada).
--   4. `oc_vincular_lancamento` do f110eb68 (ramo conta corrente da compra): a conta vai para "Adiantamento a Fornecedores";
--      valor, datas, conta bancaria e hash ficam.
--   Frete, comissoes e ICMS (4 titulos pagos) NAO mudam: ficam como despesas da operacao, fora do saldo.
-- GUARDAS: partida exatamente a medida e chegada conferida — extrato com entrada 307.460,00, pago -307.460,00, saldo 0
-- ('quitado'); o titulo do pagamento identico salvo a conta; DRE do Agnaldo 2026, caixa do Agnaldo e rebanho do Agnaldo com
-- md5 identico antes e depois.

do $mig$
declare
  c_cli constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  c_oc  constant uuid := '1337bb2d-9c86-4d76-bc24-59ef7df34f30';
  c_tit constant uuid := 'f110eb68-3511-400b-a27f-071a306b3b17';
  c_ator constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_op record; v_x jsonb; v_ver int; v_cc jsonb;
  v_tit0 text; v_tit1 text; v_caixa0 text; v_caixa1 text; v_dre0 text; v_dre1 text; v_reb0 text; v_reb1 text;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  -- ── partida ──
  select * into v_op from public.zoo_operacoes_comerciais where id = c_oc;
  if v_op.versao <> 23 or v_op.modelo_financeiro <> 'titulo' or v_op.rascunho or v_op.status_comercial <> 'fechada'
     or v_op.tipo_operacao <> 'compra' or v_op.valor_acordado <> 307460 then
    raise exception 'OC 1337bb2d fora do estado medido (versao %, modelo %, status %)', v_op.versao, v_op.modelo_financeiro,
      v_op.status_comercial;
  end if;
  if (select count(*) from public.zoo_operacao_partes where operacao_id = c_oc and cancelada = false) <> 5
     or (select count(*) from public.zoo_operacao_partes where operacao_id = c_oc and cancelada = false
          and natureza = 'principal' and financeiro_lancamento_id = c_tit) <> 1
     or (select count(*) from public.financeiro_lancamentos_v2 where id = c_tit and cancelado is not true
          and valor = 307460 and status_transacao = 'realizado' and subcentro = 'Investimento Compra Bovinos Machos') <> 1
     or (select count(*) from public.zoo_operacao_movimentacoes m join public.lancamentos l on l.id = m.movimentacao_id
          where m.operacao_id = c_oc and l.cancelado is not true) <> 1 then
    raise exception 'partes, titulo ou entrada da 1337bb2d fora do estado medido';
  end if;
  select md5(id || '|' || valor || '|' || data_competencia || '|' || coalesce(data_pagamento::text, '') || '|' || coalesce(hash_importacao, '')
             || '|' || coalesce(conta_bancaria_id::text, '-') || '|' || status_transacao || '|' || tipo_operacao)
    into v_tit0 from public.financeiro_lancamentos_v2 where id = c_tit;
  select md5(string_agg(x, ';' order by x)) into v_caixa0 from (
    select to_char(data_pagamento, 'YYYY-MM') || '|' || tipo_operacao || '|' || coalesce(conta_bancaria_id::text, '-') || '|' || sum(valor) as x
      from public.financeiro_lancamentos_v2
     where cliente_id = c_cli and cancelado is not true and coalesce(sem_movimentacao_caixa, false) = false
       and status_transacao in ('realizado', 'conciliado')
     group by tipo_operacao, conta_bancaria_id, to_char(data_pagamento, 'YYYY-MM')) q;
  v_dre0 := md5((public.fn_dre_pecuaria(c_cli, '2026-01', '2026-12', 'realizado') - 'gerado_em')::text);
  select md5(string_agg(id || '|' || quantidade || '|' || coalesce(peso_medio_kg, 0) || '|' || data || '|' || tipo || '|'
             || coalesce(cancelado, false) || '|' || coalesce(valor_total, 0), ';' order by id))
    into v_reb0 from public.lancamentos where cliente_id = c_cli;

  -- ── 1. o principal sai do modelo titulo ──
  v_x := public.oc_desvincular_lancamento(c_oc, 23, c_tit,
           'OC-CONTA-CORRENTE-TODOS-01a: o principal vira pagamento da conta corrente (homologacao)', null, false);
  if (v_x->>'ok')::boolean is not true then raise exception 'desvincular: %', v_x; end if;

  -- ── 2. modelo ──
  update public.zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente', versao = versao + 1, updated_at = now(),
         updated_by = c_ator
   where id = c_oc returning versao into v_ver;
  insert into public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  values (c_cli, c_oc, 'definir_modelo_financeiro', jsonb_build_object('modelo_financeiro', 'titulo'),
          jsonb_build_object('modelo_financeiro', 'conta_corrente'),
          jsonb_build_object('motivo', 'OC-CONTA-CORRENTE-TODOS-01a: compra de homologacao no modelo conta corrente (ADR-2026-21)',
                             'versao_anterior', v_ver - 1, 'versao_nova', v_ver),
          c_ator, 'migration');

  -- ── 3. a entrada do gado ──
  v_x := public.oc_sincronizar_entregas(c_oc, v_ver, false);
  if jsonb_array_length(v_x->'criadas') <> 1 or (v_x->'criadas'->0->>'valor')::numeric <> 307460
     or v_x->'criadas'->0->>'subcentro' <> 'Investimento Compra Bovinos Machos' then
    raise exception 'sincronizar_entregas: %', v_x; end if;

  -- ── 4. o pagamento ──
  select versao into v_ver from public.zoo_operacoes_comerciais where id = c_oc;
  v_x := public.oc_vincular_lancamento(c_oc, v_ver, c_tit, null,
           'OC-CONTA-CORRENTE-TODOS-01a: pagamento da conta corrente (homologacao)', null, null, false, false);
  if (v_x->>'ok')::boolean is not true or v_x->>'modelo' <> 'conta_corrente'
     or (v_x->'lancamento'->>'hash_preservado')::boolean is not true then
    raise exception 'vincular pagamento: %', v_x; end if;

  -- ── chegada ──
  select md5(id || '|' || valor || '|' || data_competencia || '|' || coalesce(data_pagamento::text, '') || '|' || coalesce(hash_importacao, '')
             || '|' || coalesce(conta_bancaria_id::text, '-') || '|' || status_transacao || '|' || tipo_operacao)
    into v_tit1 from public.financeiro_lancamentos_v2 where id = c_tit;
  if v_tit1 <> v_tit0 or (select subcentro from public.financeiro_lancamentos_v2 where id = c_tit) <> 'Adiantamento a Fornecedores' then
    raise exception 'pagamento depois: so a conta deveria ter mudado'; end if;
  v_cc := public.oc_conta_corrente(c_oc);
  if (v_cc->>'entregue')::numeric <> 307460 or (v_cc->>'recebido')::numeric <> 307460 or (v_cc->>'saldo')::numeric <> 0
     or v_cc->>'situacao' <> 'quitado' or jsonb_array_length(v_cc->'linhas') <> 2
     or (v_cc->'linhas'->0->>'mov_entrega')::numeric <> 307460 or (v_cc->'linhas'->1->>'mov_recebido')::numeric <> -307460
     or jsonb_array_length(v_cc->'despesas') <> 4 then
    raise exception 'conta corrente depois: %', v_cc - 'linhas' - 'despesas'; end if;
  select md5(string_agg(x, ';' order by x)) into v_caixa1 from (
    select to_char(data_pagamento, 'YYYY-MM') || '|' || tipo_operacao || '|' || coalesce(conta_bancaria_id::text, '-') || '|' || sum(valor) as x
      from public.financeiro_lancamentos_v2
     where cliente_id = c_cli and cancelado is not true and coalesce(sem_movimentacao_caixa, false) = false
       and status_transacao in ('realizado', 'conciliado')
     group by tipo_operacao, conta_bancaria_id, to_char(data_pagamento, 'YYYY-MM')) q;
  v_dre1 := md5((public.fn_dre_pecuaria(c_cli, '2026-01', '2026-12', 'realizado') - 'gerado_em')::text);
  select md5(string_agg(id || '|' || quantidade || '|' || coalesce(peso_medio_kg, 0) || '|' || data || '|' || tipo || '|'
             || coalesce(cancelado, false) || '|' || coalesce(valor_total, 0), ';' order by id))
    into v_reb1 from public.lancamentos where cliente_id = c_cli;
  if v_caixa1 <> v_caixa0 then raise exception 'o caixa do Agnaldo mudou'; end if;
  if v_dre1 <> v_dre0 then raise exception 'o DRE do Agnaldo 2026 mudou'; end if;
  if v_reb1 <> v_reb0 then raise exception 'o rebanho do Agnaldo mudou'; end if;
end $mig$;
