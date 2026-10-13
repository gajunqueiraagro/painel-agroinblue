-- CUSTEIO-HASH-01 — o hash explicito sobrevive ao gatilho de quem nao tem lote.
-- Sintetico no cliente Teste, numa transacao revertida; termina em RAISE 'OK …'. Compara com `is distinct from`, nunca `<>`.
--   H1 INSERT sem lote com hash explicito -> o hash gravado e' o que veio
--   H2 INSERT sem lote e sem hash -> nulo
--   H3 INSERT com lote -> o hash e' o CALCULADO (o explicito e' sobrescrito, como sempre)
--   H4 UPDATE de descricao num lancamento sem lote com hash -> o hash permanece; UPDATE que cita a coluna (o gesto contrario) muda
--   H5 cancelar pelo dono (`fn_cancelar_lancamento_auditoria`) -> o hash permanece
-- Mutacao: no corpo antigo (md5 09380837…) cai em H1.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_hash constant text := 'sint-custeio-hash-01-' || repeat('a', 44);
  ps record; l1 uuid; l2 uuid; l3 uuid; v_lote uuid; v_h text; v_calc text; q record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id, subcentro into ps from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '2-Saídas' and macro_custo <> 'Dividendos' order by ordem_exibicao limit 1;

  -- H1
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, hash_importacao)
  values (k, f, c, '2031-04-30', '2031-04-30', '2031-04-30', 110, '-1', '2-Saídas', 'realizado', 'SINT CUSTEIO H1', ps.id, ps.subcentro, 'realizado', 'manual', c_hash) returning id, hash_importacao into l1, v_h;
  if v_h is distinct from c_hash then raise exception 'H1 o hash explicito de quem nao tem lote foi trocado: %', coalesce(v_h, '(nulo)'); end if;

  -- H2
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento)
  values (k, f, c, '2031-04-30', '2031-04-30', '2031-04-30', 120, '-1', '2-Saídas', 'realizado', 'SINT CUSTEIO H2', ps.id, ps.subcentro, 'realizado', 'manual') returning id, hash_importacao into l2, v_h;
  if v_h is not null then raise exception 'H2 sem lote e sem hash deveria ficar nulo: %', v_h; end if;

  -- H3
  insert into financeiro_importacoes_v2 (cliente_id, fazenda_id, nome_arquivo, status) values (k, f, 'SINT custeio_hash_01', 'processada') returning id into v_lote;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, lote_importacao_id, hash_importacao)
  values (k, f, c, '2031-04-30', '2031-04-30', '2031-04-30', 130, '-1', '2-Saídas', 'realizado', 'SINT CUSTEIO H3', ps.id, ps.subcentro, 'realizado', 'importacao', v_lote, c_hash) returning id, hash_importacao into l3, v_h;
  select public.compute_financeiro_lancamento_v2_hash(x.cliente_id, x.fazenda_id, x.data_competencia, x.data_pagamento, x.valor, x.tipo_operacao, x.conta_bancaria_id, x.descricao, x.favorecido_id, x.documento, x.numero_documento)
    into v_calc from financeiro_lancamentos_v2 x where x.id = l3;
  if v_calc is null then raise exception 'H3 o calculo do hash do lote devolveu nulo: o teste nao mede nada'; end if;
  if v_h is distinct from v_calc or v_h is not distinct from c_hash then raise exception 'H3 com lote o hash deveria ser o calculado: gravado %, calculado %', v_h, v_calc; end if;

  -- H4
  update financeiro_lancamentos_v2 set descricao = 'SINT CUSTEIO H1 editado' where id = l1;
  select hash_importacao h, descricao d into q from financeiro_lancamentos_v2 where id = l1;
  if q.d is distinct from 'SINT CUSTEIO H1 editado' or q.h is distinct from c_hash then raise exception 'H4 editar a descricao apagou o hash: % / %', q.d, coalesce(q.h, '(nulo)'); end if;
  update financeiro_lancamentos_v2 set descricao = 'SINT CUSTEIO H3 editado' where id = l3;
  select hash_importacao h into q from financeiro_lancamentos_v2 where id = l3;
  if q.h is null then raise exception 'H4 com lote o hash sumiu na edicao'; end if;
  update financeiro_lancamentos_v2 set hash_importacao = null where id = l2;
  update financeiro_lancamentos_v2 set hash_importacao = c_hash || '-b' where id = l2;
  if (select hash_importacao from financeiro_lancamentos_v2 where id = l2) is distinct from c_hash || '-b' then raise exception 'H4 o UPDATE que cita a coluna nao gravou o hash'; end if;
  update financeiro_lancamentos_v2 set hash_importacao = null where id = l2;
  if (select hash_importacao from financeiro_lancamentos_v2 where id = l2) is not null then raise exception 'H4 o gesto contrario (hash = NULL) nao apagou'; end if;

  -- H5
  perform public.fn_cancelar_lancamento_auditoria(l1, 'SINT custeio_hash_01');
  select hash_importacao h, cancelado x into q from financeiro_lancamentos_v2 where id = l1;
  if q.x is distinct from true then raise exception 'H5 o lancamento nao foi cancelado: o teste nao mede nada'; end if;
  if q.h is distinct from c_hash then raise exception 'H5 cancelar apagou o hash: %', coalesce(q.h, '(nulo)'); end if;

  raise exception 'OK custeio_hash_01: H1 explicito sem lote fica; H2 sem hash fica nulo; H3 com lote e'' o calculado; H4 edicao mantem (e o UPDATE da coluna grava e apaga); H5 cancelar mantem';
end
$teste$;
ROLLBACK;
