-- OC-CRIAR-DO-LEGADO-COMPRA-01 — "Criar OC a partir deste lancamento" no lado da COMPRA, e a VENDA igual ao que era.
-- Sintetico no cliente Teste, numa transacao revertida; termina em RAISE 'OK …'. Compara com `is distinct from`, nunca `<>`.
--   C1 compra simples: nasce 'compra' em conta corrente (NASCE, nao e' convertida), concluida, entrega encerrada, quitada;
--      a entrada vira entrega no DRE e sem caixa; o pagamento sai do DRE; retorno e evento dizem o tipo
--   C2 recusas de lado, todas erro primario e nada gravado: conta fora das compras, pagamento que nao e' saida, recebimento
--      que nao e' entrada, "pague primeiro" (modal antigo programado), categoria sem conta de compra, vocabulario da compra
--   C3 as duas regras do D6: (1) pagamento ja' ligado a uma operacao; (2) entrada com OUTRO pagamento do modal antigo fora
--      dos escolhidos -> "some-o aos pagamentos"; somado, cria
--   C4 comissao e frete do modal antigo (compra_rebanho:comissao / :frete) entram como despesa da operacao, fora do saldo
--   C5 sugestoes: o lado vem do lancamento; a compra lista ENTRADAS de compra (nunca saida de venda), com a semelhanca pela
--      fazenda de origem; as irmas sao so' do lado; criterios espelhados ('entradas' = o valor das entradas)
--   C6 simulacao nao grava; ACL, SECURITY e a chamada de um argumento do dono do motivo
--   C7 VENDA (D8) — os tres casos de sempre, com os numeros de antes: simples, modal antigo com comissao, gado de outra fazenda
-- ⚠ Os testes de venda do criar-do-legado so' existem a partir deste arquivo (as migrations 01/01b/01c foram provadas por
--   ensaio avulso). O C7 foi rodado com o corpo ANTES e o DEPOIS na mesma transacao: foto identica (ver o CLAUDE.md).
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE FUNCTION pg_temp._fin(p_lado text, p_sub text, p_valor numeric, p_data date, p_status text DEFAULT 'realizado',
  p_origem_tipo text DEFAULT NULL, p_mov uuid DEFAULT NULL, p_faz uuid DEFAULT 'c2498ace-8478-410c-a697-d3f2e2934d1f')
 RETURNS uuid LANGUAGE plpgsql AS $f$
declare v uuid; pc uuid; e boolean := p_lado = 'E'; c constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
begin
  select id into strict pc from public.financeiro_plano_contas where ativo and cliente_id is null and subcentro = p_sub;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, conta_bancaria_id, data_competencia,
    data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario,
    origem_lancamento, origem_tipo, movimentacao_rebanho_id, favorecido_id)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', p_faz, case when e then c end, case when not e then c end, p_data, p_data,
    case when p_status = 'realizado' then p_data end, p_valor, case when e then '1' else '-1' end,
    case when e then '1-Entradas' else '2-Saídas' end, p_status, 'SINT ' || p_sub, pc, p_sub, 'realizado',
    case when p_mov is null then 'manual' else 'movimentacao_rebanho' end, p_origem_tipo, p_mov, '085c00ce-b4bb-48d6-9881-099db7aed3e2')
  returning id into v;
  return v;
end $f$;

CREATE FUNCTION pg_temp._mov(p_tipo text, p_cat text, p_valor numeric, p_data date,
  p_faz uuid DEFAULT 'c2498ace-8478-410c-a697-d3f2e2934d1f', p_lugar text DEFAULT NULL)
 RETURNS uuid LANGUAGE sql AS $f$
  insert into public.lancamentos (cliente_id, fazenda_id, tipo, categoria, quantidade, data, peso_medio_kg, peso_vivo_total, valor_total,
    cenario, status_operacional, origem_registro, observacao, fornecedor_id, fornecedor_nome_snapshot, fazenda_origem, fazenda_destino)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', p_faz, p_tipo, p_cat, 10, p_data, 300, 3000, p_valor, 'realizado', 'realizado', 'manual',
    'SINT gado', '085c00ce-b4bb-48d6-9881-099db7aed3e2', 'SINT', case when p_tipo = 'compra' then p_lugar end, case when p_tipo = 'venda' then p_lugar end)
  returning id
$f$;

CREATE FUNCTION pg_temp._criar(p_fin uuid[], p_mov uuid[], p_crit text DEFAULT 'recebimentos', p_sim boolean DEFAULT false)
 RETURNS jsonb LANGUAGE sql AS $f$
  select public.oc_criar_do_legado('43f32d07-dba8-4670-900c-bf645440c04a',
    jsonb_build_object('contraparte_id', '085c00ce-b4bb-48d6-9881-099db7aed3e2'), p_crit, null, p_fin,
    (select coalesce(jsonb_agg(jsonb_build_object('lancamento_id', m)), '[]'::jsonb) from unnest(p_mov) m), p_sim)
$f$;

-- a foto de uma OC, sem ids nem horarios: modelo, situacao, partes, valores e o que ela poe no DRE
CREATE FUNCTION pg_temp._foto(p_op uuid) RETURNS jsonb LANGUAGE sql AS $f$
  select jsonb_build_object(
    'op', (select jsonb_build_object('tipo', o.tipo_operacao, 'modelo', o.modelo_financeiro, 'status', o.status_comercial, 'rascunho', o.rascunho,
             'encerrada', o.entrega_encerrada, 'fazenda', o.fazenda_id, 'data', o.data_operacao, 'acordado', o.valor_acordado, 'qtd', o.qtd_negociada)
             from public.zoo_operacoes_comerciais o where o.id = p_op),
    'cc', (select jsonb_build_object('situacao', c->'situacao', 'saldo', c->'saldo', 'entregue', c->'entregue', 'recebido', c->'recebido',
             'programado', c->'programado', 'pendentes', c->'saidas_sem_entrega', 'despesas', jsonb_array_length(c->'despesas'))
             from (select public.oc_conta_corrente(p_op) c) z),
    'partes', (select jsonb_agg(jsonb_build_object('natureza', p.natureza, 'componente', p.componente, 'valor', p.valor, 'sem_caixa', p.sem_movimentacao_caixa,
             'direcao', l.tipo_operacao, 'subcentro', l.subcentro, 'dre', l.compoe_dre, 'status', l.status_transacao, 'competencia', l.data_competencia,
             'pagamento', l.data_pagamento, 'lanc_valor', l.valor, 'mov', l.movimentacao_rebanho_id is not null)
             order by p.natureza, p.componente, l.valor, l.data_competencia)
             from public.zoo_operacao_partes p left join public.financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
            where p.operacao_id = p_op and p.cancelada = false),
    'dre', (select coalesce(sum(case when l.tipo_operacao = '1-Entradas' then l.valor else -l.valor end), 0)
              from public.zoo_operacao_partes p join public.financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
             where p.operacao_id = p_op and p.cancelada = false and l.cancelado is not true and l.compoe_dre),
    'eventos', (select jsonb_object_agg(acao, n) from (select e.acao, count(*) n from public.zoo_operacao_eventos e where e.operacao_id = p_op group by 1) q),
    'adotadas', (select count(*) from public.zoo_operacao_movimentacoes m where m.operacao_id = p_op))
$f$;

-- os tres casos de VENDA (C7 / D8): devolve as tres fotos
CREATE FUNCTION pg_temp._venda3() RETURNS jsonb LANGUAGE plpgsql AS $f$
declare k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f2 uuid; s uuid; r uuid; x jsonb; v jsonb := '{}'::jsonb;
begin
  -- V1 simples
  s := pg_temp._mov('venda', 'desmama_m', 10000, '2031-05-12'); r := pg_temp._fin('E', 'Venda de Desmama Machos', 10000, '2031-05-14');
  x := pg_temp._criar(array[r], array[s]);
  if (x->>'ok') is distinct from 'true' then raise exception 'V1 nao criou: %', x->'pendencias'; end if;
  v := v || jsonb_build_object('v1', pg_temp._foto((x->>'operacao_id')::uuid));
  -- V2 modal antigo ja' recebido, com comissao
  s := pg_temp._mov('venda', 'desmama_m', 12000, '2031-06-12');
  r := pg_temp._fin('E', 'Venda de Desmama Machos', 12000, '2031-06-12', 'realizado', 'venda:parcela', s);
  perform pg_temp._fin('S', 'Impostos e Despesas de Abates e Vendas', 300, '2031-06-12', 'realizado', 'venda:comissao', s);
  x := pg_temp._criar(array[r], array[s]);
  if (x->>'ok') is distinct from 'true' then raise exception 'V2 nao criou: %', x->'pendencias'; end if;
  v := v || jsonb_build_object('v2', pg_temp._foto((x->>'operacao_id')::uuid));
  -- V3 o gado saiu de OUTRA fazenda (o lancamento financeiro fica onde esta')
  insert into public.fazendas (cliente_id, nome, codigo, owner_id) values (k, 'SINT Fazenda Dois', 'SINT2', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') returning id into f2;
  s := pg_temp._mov('venda', 'desmama_m', 9000, '2031-07-12', f2); r := pg_temp._fin('E', 'Venda de Desmama Machos', 9500, '2031-07-13');
  x := pg_temp._criar(array[r], array[s]);
  if (x->>'ok') is distinct from 'true' then raise exception 'V3 nao criou: %', x->'pendencias'; end if;
  v := v || jsonb_build_object('v3', pg_temp._foto((x->>'operacao_id')::uuid) || jsonb_build_object('fazenda_do_gado', (pg_temp._foto((x->>'operacao_id')::uuid)->'op'->>'fazenda') = f2::text,
    'fazenda_do_financeiro', (select fazenda_id from public.financeiro_lancamentos_v2 where id = r) = 'c2498ace-8478-410c-a697-d3f2e2934d1f'));
  return v;
end $f$;

DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_m constant text := 'Investimento Compra Bovinos Machos'; c_fc constant text := 'Investimento Frete/Comissão Compra Bovinos';
  e uuid; e2 uuid; p uuid; p2 uuid; pa uuid; pb uuid; co uuid; fr uuid; rv uuid; sv uuid; x jsonb; ft jsonb; o uuid; n int; t text; v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select count(*) into n from zoo_operacoes_comerciais where cliente_id = k;

  -- ── C1 compra simples ──
  e := pg_temp._mov('compra', 'garrotes', 20000, '2031-03-12', p_lugar => 'Ana Verena Milani Hernandes'); p := pg_temp._fin('S', c_m, 20000, '2031-03-10');
  x := pg_temp._criar(array[p], array[e], 'pagamentos'); o := (x->>'operacao_id')::uuid; ft := pg_temp._foto(o);
  if (x->>'ok') is distinct from 'true' or x->>'tipo' is distinct from 'compra' or x->>'criterio_valor' is distinct from 'recebimentos' then
    raise exception 'C1 retorno: %', x - 'conta_corrente' - 'lotes'; end if;
  if ft->'op' is distinct from jsonb_build_object('tipo', 'compra', 'modelo', 'conta_corrente', 'status', 'fechada', 'rascunho', false, 'encerrada', true,
       'fazenda', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'data', '2031-03-12', 'acordado', 20000.00, 'qtd', 10) then raise exception 'C1 op: %', ft->'op'; end if;
  if ft->'cc' is distinct from '{"situacao": "quitado", "saldo": 0.00, "entregue": 20000.00, "recebido": 20000.00, "programado": 0.00, "pendentes": 0, "despesas": 0}'::jsonb then
    raise exception 'C1 conta corrente: %', ft->'cc'; end if;
  if jsonb_array_length(ft->'partes') is distinct from 2
     or ft->'partes'->0 is distinct from jsonb_build_object('natureza', 'principal', 'componente', 'entrega', 'valor', 20000.00, 'sem_caixa', true, 'direcao', '2-Saídas',
          'subcentro', c_m, 'dre', true, 'status', 'realizado', 'competencia', '2031-03-12', 'pagamento', '2031-03-12', 'lanc_valor', 20000.00, 'mov', false)
     or (ft->'partes'->1) - 'pagamento' - 'competencia' is distinct from jsonb_build_object('natureza', 'principal', 'componente', 'recebimento', 'valor', 20000.00, 'sem_caixa', false,
          'direcao', '2-Saídas', 'subcentro', c_m, 'dre', false, 'status', 'realizado', 'lanc_valor', 20000.00, 'mov', false) then
    raise exception 'C1 partes: %', ft->'partes'; end if;
  if (ft->>'dre')::numeric is distinct from -20000 or (ft->>'adotadas')::int is distinct from 1 then raise exception 'C1 DRE % · adotadas %', ft->>'dre', ft->>'adotadas'; end if;
  -- D2: NASCEU em conta corrente (o evento vai de nulo para o valor; nenhuma conversao de 'titulo')
  if (select count(*) from zoo_operacao_eventos ev where ev.operacao_id = o and ev.acao = 'definir_modelo_financeiro') is distinct from 1
     or (select ev.dados_anteriores->'modelo_financeiro' from zoo_operacao_eventos ev where ev.operacao_id = o and ev.acao = 'definir_modelo_financeiro') is distinct from 'null'::jsonb
     or (select ev.detalhes->>'tipo' from zoo_operacao_eventos ev where ev.operacao_id = o and ev.acao = 'criar_do_legado') is distinct from 'compra' then
    raise exception 'C1 eventos: %', ft->'eventos'; end if;
  n := n + 1;

  -- ── C2 recusas de lado (nada gravado) ──
  e2 := pg_temp._mov('compra', 'garrotes', 5000, '2031-03-20'); rv := pg_temp._fin('E', 'Venda de Desmama Machos', 5000, '2031-03-20');
  p2 := pg_temp._fin('S', c_m, 5000, '2031-03-20');
  t := (pg_temp._criar(array[pg_temp._fin('S', c_fc, 5000, '2031-03-20')], array[e2])->'pendencias')::text;
  if t not like '%Pagamento %: Conta fora das compras de gado%' then raise exception 'C2 conta fora: %', t; end if;
  t := (pg_temp._criar(array[p2, rv], array[e2])->'pendencias')::text;
  if t not like '%Pagamento %: Pagamento tem de ser uma saida%' then raise exception 'C2 pagamento que e'' entrada: %', t; end if;
  t := (pg_temp._criar(array[rv, p2], array[e2])->'pendencias')::text;
  if t not like '%Recebimento %: Recebimento tem de ser uma entrada%' then raise exception 'C2 recebimento que e'' saida: %', t; end if;
  t := (pg_temp._criar(array[pg_temp._fin('S', c_m, 5000, '2031-03-20', 'programado', 'compra_rebanho:parcela', e2)], array[e2])->'pendencias')::text;
  if t not like '%Pague primeiro: lancamento do modal antigo ainda programado.%' then raise exception 'C2 pague primeiro: %', t; end if;
  update financeiro_lancamentos_v2 set cancelado = true where movimentacao_rebanho_id = e2;
  t := (pg_temp._criar(array[p2], array[pg_temp._mov('compra', 'categoria_x', 5000, '2031-03-20')])->'pendencias')::text;
  if t not like '%Entrada %: categoria categoria_x sem conta de compra no plano%' then raise exception 'C2 categoria: %', t; end if;
  t := (pg_temp._criar(array[p2], '{}'::uuid[])->'pendencias')::text;
  if t not like '%Marque ao menos uma entrada de gado%' then raise exception 'C2 vocabulario: %', t; end if;
  t := (public.oc_criar_do_legado(k, '{}'::jsonb, 'outro', null, array[p2], '[]'::jsonb, false)->'pendencias')::text;
  if t not like '%Informe o fornecedor%' or t not like '%Informe o total da compra%' then raise exception 'C2 vocabulario (fornecedor, total): %', t; end if;
  if (select count(*) from zoo_operacoes_comerciais where cliente_id = k) is distinct from n then raise exception 'C2 gravou OC numa recusa'; end if;

  -- ── C3 as duas regras do D6, e C4 comissao + frete ──
  t := (pg_temp._criar(array[p], array[e2])->'pendencias')::text;
  if t not like '%Pagamento %: Lancamento ja esta ligado a uma operacao%' then raise exception 'C3 regra 1: %', t; end if;
  pa := pg_temp._fin('S', c_m, 8000, '2031-03-20', 'realizado', 'compra_rebanho:parcela', e2);
  pb := pg_temp._fin('S', c_m, 4000, '2031-03-25', 'realizado', 'compra_rebanho:parcela', e2);
  co := pg_temp._fin('S', c_fc, 300, '2031-03-20', 'realizado', 'compra_rebanho:comissao', e2);
  fr := pg_temp._fin('S', c_fc, 500, '2031-03-20', 'realizado', 'compra_rebanho:frete', e2);
  t := (pg_temp._criar(array[pa], array[e2])->'pendencias')::text;
  if t not like '%Entrada ' || left(e2::text, 8) || ' tem outro pagamento do modal antigo fora desta OC (' || left(pb::text, 8) || ', R$ 4000,00): some-o aos pagamentos%'
     or t like '%' || left(co::text, 8) || '%' or t like '%' || left(fr::text, 8) || '%' then raise exception 'C3 regra 2: %', t; end if;
  if (select count(*) from zoo_operacoes_comerciais where cliente_id = k) is distinct from n then raise exception 'C3 gravou OC numa recusa'; end if;
  x := pg_temp._criar(array[pa, pb], array[e2]); o := (x->>'operacao_id')::uuid; ft := pg_temp._foto(o);
  if (x->>'ok') is distinct from 'true' or (x->>'total')::numeric is distinct from 12000 then raise exception 'C3 somado nao criou: %', x - 'conta_corrente'; end if;
  if ft->'cc' is distinct from '{"situacao": "quitado", "saldo": 0.00, "entregue": 12000.00, "recebido": 12000.00, "programado": 0.00, "pendentes": 0, "despesas": 2}'::jsonb then
    raise exception 'C4 conta corrente: %', ft->'cc'; end if;
  if (select jsonb_agg(jsonb_build_object('c', q->'componente', 'v', q->'lanc_valor', 's', q->'subcentro', 'd', q->'dre') order by q->>'componente')
        from jsonb_array_elements(ft->'partes') q where q->>'natureza' = 'obrigacao')
     is distinct from jsonb_build_array(jsonb_build_object('c', 'comissao', 'v', 300.00, 's', c_fc, 'd', true), jsonb_build_object('c', 'frete', 'v', 500.00, 's', c_fc, 'd', true)) then
    raise exception 'C4 comissao e frete: %', ft->'partes'; end if;
  if (ft->>'dre')::numeric is distinct from -12800 then raise exception 'C4 DRE: %', ft->>'dre'; end if;
  n := n + 1;

  -- ── C5 sugestoes e criterios espelhados ──
  e := pg_temp._mov('compra', 'garrotes', 18000, '2031-09-12', p_lugar => 'Ana Verena Milani Hernandes'); sv := pg_temp._mov('venda', 'desmama_m', 18000, '2031-09-12');
  p := pg_temp._fin('S', c_m, 20000, '2031-09-10'); p2 := pg_temp._fin('S', c_m, 1000, '2031-09-11'); rv := pg_temp._fin('E', 'Venda de Desmama Machos', 18000, '2031-09-10');
  x := public.oc_criar_do_legado_sugestoes(array[p]);
  if x->>'tipo' is distinct from 'compra' or not exists (select 1 from jsonb_array_elements(x->'saidas') q where q->>'id' = e::text and (q->>'semelhanca')::numeric = 1 and q->>'destino' = 'Ana Verena Milani Hernandes')
     or exists (select 1 from jsonb_array_elements(x->'saidas') q where q->>'id' = sv::text)
     or not exists (select 1 from jsonb_array_elements(x->'irmas') q where q->>'id' = p2::text) or exists (select 1 from jsonb_array_elements(x->'irmas') q where q->>'id' = rv::text)
     or x->'recebimentos'->0->'motivo' is distinct from 'null'::jsonb then raise exception 'C5 sugestoes da compra: %', x; end if;
  x := public.oc_criar_do_legado_sugestoes(array[rv]);
  if x->>'tipo' is distinct from 'venda' or not exists (select 1 from jsonb_array_elements(x->'saidas') q where q->>'id' = sv::text)
     or exists (select 1 from jsonb_array_elements(x->'saidas') q where q->>'id' = e::text) or exists (select 1 from jsonb_array_elements(x->'irmas') q where q->>'id' in (p::text, p2::text))
     or x->'recebimentos'->0->'motivo' is distinct from 'null'::jsonb then raise exception 'C5 sugestoes da venda: %', x; end if;

  -- ── C6 simulacao nao grava; e depois o criterio 'entradas' grava pelo valor das entradas ──
  x := pg_temp._criar(array[p], array[e], 'entradas', true);
  if (x->>'ok') is distinct from 'true' or (x->>'simulado') is distinct from 'true' or x->>'tipo' is distinct from 'compra' or (x->>'total')::numeric is distinct from 18000
     or (select count(*) from zoo_operacoes_comerciais where cliente_id = k) is distinct from n
     or public._oc_legado_motivo_recebimento(p) is not null then raise exception 'C6 simulacao: % (OCs %)', x - 'conta_corrente' - 'lotes', n; end if;
  x := pg_temp._criar(array[p], array[e], 'entradas'); ft := pg_temp._foto((x->>'operacao_id')::uuid);
  if (x->>'criterio_valor') is distinct from 'saidas' or (ft->'cc'->>'entregue')::numeric is distinct from 18000 or (ft->'cc'->>'recebido')::numeric is distinct from 20000
     or ft->'cc'->>'situacao' is distinct from 'adiantado' or (ft->'cc'->>'saldo')::numeric is distinct from -2000 then raise exception 'C5 criterio entradas: % / %', x->>'criterio_valor', ft->'cc'; end if;
  -- o dono do motivo: um argumento segue valendo (o lado sai do lancamento), e o lado pedido manda
  if public._oc_legado_motivo_recebimento(p2) is not null or public._oc_legado_motivo_recebimento(rv) is not null
     or public._oc_legado_motivo_recebimento(p2, 'venda') is distinct from 'Recebimento tem de ser uma entrada'
     or public._oc_legado_motivo_recebimento(rv, 'compra') is distinct from 'Pagamento tem de ser uma saida' then raise exception 'C6 dono do motivo'; end if;
  if exists (select 1 from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname in ('_oc_legado_motivo_recebimento', 'oc_criar_do_legado_sugestoes', 'oc_criar_do_legado')
              and (has_function_privilege('anon', q.oid, 'EXECUTE') or not has_function_privilege('authenticated', q.oid, 'EXECUTE')
                   or q.prosecdef is distinct from (q.proname = 'oc_criar_do_legado')))
     or (select count(*) from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname = '_oc_legado_motivo_recebimento') is distinct from 1 then
    raise exception 'C6 ACL / SECURITY / assinatura'; end if;

  -- ── C7 VENDA (D8): os numeros de antes ──
  v := pg_temp._venda3();
  if (v->'v1'->'op') - 'fazenda' is distinct from '{"tipo": "venda", "modelo": "conta_corrente", "status": "fechada", "rascunho": false, "encerrada": true, "data": "2031-05-12", "acordado": 10000.00, "qtd": 10}'::jsonb
     or v->'v1'->'cc' is distinct from '{"situacao": "quitado", "saldo": 0.00, "entregue": 10000.00, "recebido": 10000.00, "programado": 0.00, "pendentes": 0, "despesas": 0}'::jsonb
     or (v->'v1'->>'dre')::numeric is distinct from 10000 then raise exception 'C7 V1: %', v->'v1'; end if;
  if v->'v2'->'cc' is distinct from '{"situacao": "quitado", "saldo": 0.00, "entregue": 12000.00, "recebido": 12000.00, "programado": 0.00, "pendentes": 0, "despesas": 1}'::jsonb
     or (v->'v2'->>'dre')::numeric is distinct from 11700
     or not exists (select 1 from jsonb_array_elements(v->'v2'->'partes') q where q->>'natureza' = 'obrigacao' and q->>'componente' = 'comissao' and (q->>'lanc_valor')::numeric = 300) then
    raise exception 'C7 V2: %', v->'v2'; end if;
  if (v->'v3'->>'fazenda_do_gado') is distinct from 'true' or (v->'v3'->>'fazenda_do_financeiro') is distinct from 'true'
     or (v->'v3'->'cc'->>'entregue')::numeric is distinct from 9500 or (v->'v3'->>'dre')::numeric is distinct from 9500 then raise exception 'C7 V3: %', v->'v3'; end if;

  raise exception 'OK oc_criar_do_legado_compra_01 (C1-C7)';
end $teste$;
ROLLBACK;
