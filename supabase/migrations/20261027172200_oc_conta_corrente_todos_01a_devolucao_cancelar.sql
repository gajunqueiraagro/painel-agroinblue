-- 20261027172200_oc_conta_corrente_todos_01a_devolucao_cancelar.sql
-- OC-CONTA-CORRENTE-TODOS-01a, decisoes do Gabriel sobre o relatorio (29/09/2026). Estrutura so' — nenhum dado.
--
-- (2) DEVOLUCAO DO FORNECEDOR EM CONTA PROPRIA. A 01a gravava a devolucao da compra na 5005 "Adiantamento a Fornecedores"
--     forcando `tipo_operacao = '1-Entradas'` numa conta de SAIDA. Agora ela tem conta de ENTRADA propria, espelho da 5006:
--     3016 "Devolução de Adiantamento a Fornecedores" — Entrada Financeira / Outras Entradas / Movimentacoes Financeiras,
--     pecuaria, sem bloco nem DRE, no vao ao lado da 3015 (PLANO-ORDEM-01: entra no vao, nao renumera). `oc_explicar_saldo`
--     passa a usa-la, e o `tipo_operacao` volta a ser SEMPRE o da conta (a excecao some).
--
-- (3) CANCELAR: UMA REGRA PARA TODOS OS TIPOS. So' se cancela o que e' da conta corrente — entregas/entradas,
--     recebimentos/pagamentos, explicacoes e os compromissos da conta corrente (componente 'recebimento', o "Programar
--     recebimento/pagamento"). DESPESAS PAGAS A TERCEIROS (frete, comissao, ICMS, Fundersul, Iagro...) NUNCA sao
--     canceladas: compromisso, parte, titulo e liquidacao ficam como estao. O rol ganha `despesas` (a secao "Ficam (pagas a
--     terceiros)" do dialogo). Vale para a venda tambem — hoje as duas vendas em conta corrente (232c05aa, e1ea7f4b) tem ZERO
--     compromissos, entao nada muda nelas.
--     ⚠ `oc_cancelar` (a externa) tambem muda: depois do ramo conta corrente ela recusava QUALQUER titulo ou liquidacao viva,
--       e com as despesas ficando a compra nunca cancelaria. No modelo conta corrente, as duas travas deixam de contar as
--       despesas pagas a terceiros (parte fora de entrega/explicacao e fora de 'recebimento'). Modelo titulo: identico.
--
-- PATCHES GUARDADOS POR md5 (origem, cada ancora com a contagem esperada, destino):
--   oc_explicar_saldo            f4a12b7e -> baae7c24
--   _oc_cancelar_conta_corrente  9dca4b6f -> 330f7e27
--   oc_cancelar                  fec8f7bc -> 530383d4

-- ── 1. plano ──
do $pl$
begin
  if exists (select 1 from public.financeiro_plano_contas
              where cliente_id is null and (ordem_exibicao = 3016 or subcentro = 'Devolução de Adiantamento a Fornecedores')) then
    raise exception 'OC-CONTA-CORRENTE-TODOS-01a: 3016 ou "Devolução de Adiantamento a Fornecedores" ja existe no plano'; end if;
end $pl$;

insert into public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, grupo_fluxo, escopo_negocio, ativo,
   ordem_exibicao, compoe_dre, gera_lcdpr, bloco_dre)
values (null, '1-Entradas', 'Entrada Financeira', 'Outras Entradas', 'Movimentações Financeiras', 'Devolução de Adiantamento a Fornecedores',
        null, 'pecuaria', true, 3016, false, null, null);

-- o aplicador dos patches: origem por md5, cada ancora com a contagem esperada, destino por md5. Some com a transacao.
create function pg_temp.oc_cc_patch(p_nome text, p_de text, p_para text, p_trincas text[])
returns void
language plpgsql
as $p$
declare v_def text; v_i int; v_n int; v_a text; v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = p_nome and md5(p.prosrc) = p_de;
  if v_def is null then raise exception 'OC-CONTA-CORRENTE-TODOS-01a: % fora da origem esperada (%)', p_nome, p_de; end if;
  for v_i in 1 .. array_length(p_trincas, 1) by 3 loop
    v_a := p_trincas[v_i];
    v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
    if v_n <> p_trincas[v_i + 2]::int then
      raise exception 'OC-CONTA-CORRENTE-TODOS-01a: %, ancora % casa % vez(es), esperado %', p_nome, (v_i + 2) / 3, v_n, p_trincas[v_i + 2];
    end if;
    v_def := replace(v_def, v_a, p_trincas[v_i + 1]);
  end loop;
  execute v_def;
  select md5(p.prosrc) into v_novo from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = p_nome;
  if v_novo is distinct from p_para then
    raise exception 'OC-CONTA-CORRENTE-TODOS-01a: % com destino inesperado (%)', p_nome, v_novo; end if;
end $p$;

-- ── 2. oc_explicar_saldo: devolucao do fornecedor na 3016; o tipo de operacao e' sempre o da conta ──
select pg_temp.oc_cc_patch('oc_explicar_saldo', 'f4a12b7e12a017766f647bf1ef04833e', 'baae7c2454e9126d630f4c8d6ec76959', array[
  $a$pc.subcentro = CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Adiantamento a Fornecedores' ELSE 'Devolução de Adiantamento de Clientes' END;$a$,
  $b$pc.subcentro = CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Devolução de Adiantamento a Fornecedores' ELSE 'Devolução de Adiantamento de Clientes' END;$b$, '1',
  $a$    -- a devolucao do fornecedor e' ENTRADA de caixa, mesmo na conta 5005 (decisao do Gabriel)
    v_tipo_op := CASE WHEN v_op.tipo_operacao = 'compra' AND p_tipo = 'devolucao_comprador' THEN '1-Entradas' ELSE v_pc.tipo_operacao END;$a$,
  $b$    v_tipo_op := v_pc.tipo_operacao;$b$, '1'
]);

-- ── 3. _oc_cancelar_conta_corrente: so' os compromissos da conta corrente, em todo tipo; o rol lista as despesas que ficam ──
select pg_temp.oc_cc_patch('_oc_cancelar_conta_corrente', '9dca4b6f69361ef97d005617ada0419e', '330f7e279552a6aef00fcbbf78cc794d', array[
  $a$v_entregas jsonb; v_explic jsonb; v_receb jsonb; v_saidas jsonb; v_comps jsonb; v_bloq jsonb := '[]'::jsonb;$a$,
  $b$v_entregas jsonb; v_explic jsonb; v_receb jsonb; v_saidas jsonb; v_comps jsonb; v_desp jsonb; v_bloq jsonb := '[]'::jsonb;$b$, '1',
  $a$       AND (v_op.tipo_operacao = 'venda' OR c.componente = 'recebimento');$a$,
  $b$       AND c.componente = 'recebimento';$b$, '3',
  $a$       AND (v_op.tipo_operacao = 'venda' OR componente = 'recebimento');$a$,
  $b$       AND componente = 'recebimento';$b$, '1',
  $a$  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_explic) e WHERE (e->>'pago')::boolean) THEN$a$,
  $b$  -- despesas pagas a terceiros (frete, comissao, ICMS, Fundersul, Iagro...): FICAM — nada delas e' tocado (decisao do Gabriel)
  SELECT coalesce(jsonb_agg(jsonb_build_object('compromisso_id', c.id, 'componente', c.componente, 'nome', cf.nome,
           'descricao', c.descricao, 'conta', c.subcentro, 'favorecido', fo.nome, 'valor', c.valor_total, 'status', c.status,
           'pago', coalesce((SELECT sum(f.valor) FROM public.zoo_operacao_programacoes pr
                               JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id
                               JOIN public.zoo_operacao_partes pt ON pt.programacao_parcela_id = pp.id AND pt.cancelada = false
                               JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
                              WHERE pr.compromisso_id = c.id
                                AND (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL)), 0))
           ORDER BY c.created_at), '[]')
    INTO v_desp
    FROM public.zoo_operacao_compromissos c
    LEFT JOIN public.zoo_componentes_financeiros cf ON cf.natureza = c.natureza AND cf.codigo = c.componente
    LEFT JOIN public.financeiro_fornecedores fo ON fo.id = c.favorecido_id
   WHERE c.operacao_id = p_operacao_id AND c.status <> 'cancelado' AND c.componente <> 'recebimento';

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_explic) e WHERE (e->>'pago')::boolean) THEN$b$, '1',
  $a$'compromissos', v_comps, 'bloqueios', v_bloq);$a$,
  $b$'compromissos', v_comps, 'despesas', v_desp, 'bloqueios', v_bloq);$b$, '1'
]);

-- ── 4. oc_cancelar: no modelo conta corrente, as despesas pagas a terceiros nao travam o cancelamento ──
select pg_temp.oc_cc_patch('oc_cancelar', 'fec8f7bc3540617265e23740e5d249b3', '530383d452a429073b20bb12e91fb7ff', array[
  $a$AND p.cancelada = false) INTO v_titulo_ativo;$a$,
  $b$AND p.cancelada = false
                    AND NOT (v_op.modelo_financeiro = 'conta_corrente' AND p.origem NOT IN ('entrega', 'explicacao')
                             AND p.componente <> 'recebimento')) INTO v_titulo_ativo;$b$, '1',
  $a$lq.estornado IS NOT TRUE) INTO v_liq_ativa;$a$,
  $b$lq.estornado IS NOT TRUE
                    AND NOT (v_op.modelo_financeiro = 'conta_corrente' AND EXISTS (
                      SELECT 1 FROM public.zoo_operacao_partes dp
                       WHERE dp.operacao_id = p_operacao_id AND dp.cancelada = false
                         AND dp.financeiro_lancamento_id = lq.financeiro_lancamento_id
                         AND dp.origem NOT IN ('entrega', 'explicacao') AND dp.componente <> 'recebimento'))) INTO v_liq_ativa;$b$, '1'
]);

-- ── ACL: as tres patcheadas mantem a ACL (CREATE OR REPLACE a preserva); a interna segue fechada ao front ──
do $acl$
begin
  if has_function_privilege('anon', 'public.oc_explicar_saldo(uuid, integer, text, numeric, uuid, uuid, text, date, boolean)', 'execute')
     or has_function_privilege('anon', 'public.oc_cancelar(uuid, uuid, integer, text)', 'execute')
     or has_function_privilege('authenticated', 'public._oc_cancelar_conta_corrente(uuid, text, boolean)', 'execute') then
    raise exception 'OC-CONTA-CORRENTE-TODOS-01a: ACL fora do esperado'; end if;
end $acl$;
