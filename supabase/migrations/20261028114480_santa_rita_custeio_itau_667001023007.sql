-- FINANC-SANTA-RITA-01 (Gabriel 27/11 13:17, URGENTE) — lote 114480 · Code 2
-- Cadastro do custeio Itaú 667001023007 da Santa Rita PELA PORTA DO SISTEMA: a MESMA sequência que a tela Financiamentos › Novo grava
-- (useFinanciamentoCadastro, ramo financiamento), numa transação só:
--   1. financiamentos (os campos que a tela grava; taxa mensal = (1,125^(1/12) − 1) = 0,9865% a.m.)
--   2. financiamento_parcelas — a parcela única (bullet) de 26/07/2027 (linhasDasParcelas: principal + juros, status 'pendente')
--   3. fn_reconciliar_financiamento(id, false, true) — os lançamentos previstos da parcela (o "Vai ter caixa?" passa a vê-la)
--   4. o lançamento de CAPTAÇÃO (entrada realizada em 02/10/2026 na conta "Banco Itaú"; o extrato de OUTUBRO dessa conta ainda NÃO foi
--      importado: o movimento do banco casa com ele quando chegar) + financiamentos.lancamento_captacao_id
--   5. fn_financiamento_liberacao_salvar — a liberação (forma 'conta', o lançamento da captação)
-- Autor: o usuário que cadastra os contratos (as funções pedem usuário logado: `_fn_contrato_do_usuario`); `app.via` = este lote.
-- Fora do lote: o PDF do banco (Documentos › "Demonstrativo de saldo") — arquivo vai ao storage pela tela.
-- DESFAZER (ordem): fn_financiamento_liberacao_remover(<liberação>, motivo) → fn_cancelar_lancamento_auditoria nos lançamentos do contrato
--   (captação e parcela) → financiamentos.status = 'cancelado'. Nada se apaga.

select set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
select set_config('app.via', 'lote 114480 · FINANC-SANTA-RITA-01', true);

do $$
declare
  c_cli constant uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  c_fin constant uuid := '66700102-3007-4000-8000-000000000001';
  c_par constant uuid := '66700102-3007-4000-8000-000000000002';
  c_cap constant uuid := '66700102-3007-4000-8000-000000000003';
  c_autor constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_saldo jsonb; v_lib jsonb;
begin
  -- GUARDAS: o contrato e o lançamento ainda não existem; as chaves usadas são as que a leitura de 27/11 achou
  if exists (select 1 from public.financiamentos where cliente_id = c_cli and regexp_replace(coalesce(numero_contrato, ''), '\D', '', 'g') = '667001023007') then
    raise exception 'o contrato 667001023007 já existe no cliente: reler antes de aplicar';
  end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 where cliente_id = c_cli and cancelado = false and abs(abs(valor) - 1740396.72) < 0.005) then
    raise exception 'já há um lançamento de R$ 1.740.396,72 no cliente: reler antes de aplicar';
  end if;
  if (select count(*) from public.financeiro_fornecedores where id = '222c6c82-a184-43de-95ad-b20840ac78d4' and cliente_id = c_cli and nome = 'Banco Itaú' and ativo) <> 1
     or (select count(*) from public.financeiro_contas_bancarias where id = '6acfb6ea-ebc7-43e3-ac39-15459a9d0669' and cliente_id = c_cli and nome_exibicao = 'Banco Itaú') <> 1
     or (select count(*) from public.fazendas where id = 'cfe61cf4-5c33-44f4-9e75-7a0fcc634799' and cliente_id = c_cli) <> 1
     or (select count(*) from public.financeiro_plano_contas where id = '287caabf-91ba-40e2-82b6-379f33f31ab2' and subcentro = 'Entrada de Financiamento Pecuária' and ativo) <> 1
     or (select count(*) from public.financeiro_plano_contas where id = '0d42d354-926a-4a10-ab3a-f082adaef972' and subcentro = 'Amortização Financiamento Pecuária' and ativo) <> 1 then
    raise exception 'credor, conta, fazenda ou contas do plano não conferem: reler antes de aplicar';
  end if;

  -- 1. o contrato (os campos do Novo financiamento da tela)
  insert into public.financiamentos (id, cliente_id, fazenda_id, natureza, descricao, numero_contrato, tipo_financiamento, credor_id, conta_bancaria_id,
    valor_total, valor_entrada, taxa_juros_mensal, total_parcelas, data_contrato, data_primeira_parcela, plano_conta_captacao_id,
    plano_conta_parcela_id, gerar_lancamento_captacao, observacao, status, created_by)
  values (c_fin, c_cli, 'cfe61cf4-5c33-44f4-9e75-7a0fcc634799', 'financiamento', 'Custeio Pecuária — Rural Custeio Recursos Próprios Livres', '667001023007',
    'pecuaria', '222c6c82-a184-43de-95ad-b20840ac78d4', '6acfb6ea-ebc7-43e3-ac39-15459a9d0669',
    1740396.72, 0, round(((power(1.125::numeric, 1.0 / 12) - 1) * 100)::numeric, 4), 1, '2026-10-02', '2027-07-26',
    '287caabf-91ba-40e2-82b6-379f33f31ab2', '0d42d354-926a-4a10-ab3a-f082adaef972', true,
    'Itaú · RURAL CUSTEIO RECURSOS PRÓPRIOS LIVRES · PRÉ 12,50% a.a. (juros compostos, 365 dias corridos) · bullet em 26/07/2027. Posição do banco em 26/11/2026: principal 1.740.396,72 + juros 31.164,52 = 1.771.561,24. Cadastrado pelo lote 114480 (FINANC-SANTA-RITA-01).',
    'ativo', c_autor);

  -- 2. a parcela única: 297 dias corridos a 12,50% a.a. compostos → juros 175.054,05
  insert into public.financiamento_parcelas (id, financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (c_par, c_fin, c_cli, 1, '2027-07-26', 1740396.72, 175054.05, 1915450.77, 'pendente');

  -- 3. os lançamentos previstos da parcela (o mesmo passo da tela)
  perform public.fn_reconciliar_financiamento(c_fin, false, true);

  -- 4. a captação (entrada realizada na conta do Itaú, como a tela grava)
  insert into public.financeiro_lancamentos_v2 (id, cliente_id, fazenda_id, financiamento_id, conta_bancaria_id, conta_destino_id, favorecido_id, tipo_operacao,
    sinal, valor, data_competencia, data_pagamento, data_vencimento, ano_mes, origem_lancamento, origem_tipo, plano_conta_id, descricao,
    status_transacao, sem_movimentacao_caixa, cancelado, created_by)
  values (c_cap, c_cli, 'cfe61cf4-5c33-44f4-9e75-7a0fcc634799', c_fin, null, '6acfb6ea-ebc7-43e3-ac39-15459a9d0669', '222c6c82-a184-43de-95ad-b20840ac78d4',
    '1-Entradas', 1, 1740396.72, '2026-10-02', '2026-10-02', '2026-10-02', '2026-10', 'financiamento', 'financiamento_captacao',
    '287caabf-91ba-40e2-82b6-379f33f31ab2', 'Custeio Pecuária — Rural Custeio Recursos Próprios Livres', 'realizado', false, false, c_autor);
  update public.financiamentos set lancamento_captacao_id = c_cap where id = c_fin;

  -- 5. a liberação (forma 'conta', o lançamento da captação)
  v_lib := public.fn_financiamento_liberacao_salvar(c_fin, null, '2026-10-02', 1740396.72, 'conta', c_cap, null, null, null,
    'Crédito do custeio na conta Banco Itaú (o extrato de out/2026 dessa conta ainda não foi importado).');

  -- CONFERÊNCIA: o saldo do sistema (principal) em 26/11 = o principal em aberto do banco; os juros previstos = os da parcela
  v_saldo := public._fn_financiamento_saldo(c_fin, '2026-11-26');
  if (v_saldo->>'saldo')::numeric <> 1740396.72 or (v_saldo->>'liberado')::numeric <> 1740396.72 or (v_saldo->>'juros_previstos')::numeric <> 175054.05 then
    raise exception 'conferência do saldo falhou: %', v_saldo;
  end if;
end $$;
