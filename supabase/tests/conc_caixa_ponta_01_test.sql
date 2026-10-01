-- CONC-CAIXA-PONTA-01 — teste da fn_caixa_sistema_pontas e do `sistema_caixa` da fn_extratos_espelhados.
-- Roda em ROLLBACK: termina em RAISE, nada fica gravado. Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims).
--
-- P1 Sicredi Lavoura ago/26: caixa do sistema x banco, dia a dia (dif. acumulada) e saldo final.
-- P2 IDENTIDADE nos demais conta-meses: a funcao REAL (uma chamada por conta, periodo inteiro, agrupada por mes) contra o
--    lv2 de hoje (o predicado e o sinal COPIADOS do corpo da fn_extratos_espelhados). Reporta quantos conta-meses foram
--    comparados e quais diferem — conjunto vazio reprova (CLAUDE.md: prova de identidade diz o tamanho).
-- P3 a linha da parcial (Venda 19,82 t, NF 9294773): 28/08, +10.224,04, parcial, falta 347,95.
-- P4 BB do NJ mai/26 (o estorno 426aeeb0, vinculado por inteiro e programado): o total do mes nao muda.
-- P5 a RPC real: `sistema_caixa` presente, `sistema_completo` intacto (mesma soma da replica do lv2).
DO $teste$
DECLARE
  v_out text := '';
  c_nj  constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_sic constant uuid := '910e04b0-4148-4e58-885a-8937c8148581';
  v_n int; v_dif int; v_lista text; v_j jsonb; r record;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  -- ── P1
  WITH sis AS (SELECT data d, sum(valor) v FROM fn_caixa_sistema_pontas(c_nj, c_sic, '2026-08-01', '2026-08-31') GROUP BY data),
       ban AS (SELECT data_movimento d, sum(valor) v FROM extrato_bancario_v2 WHERE conta_bancaria_id = c_sic AND data_movimento BETWEEN '2026-08-01' AND '2026-08-31'
                AND cancelado_em IS NULL AND ignorado_em IS NULL GROUP BY 1),
       dias AS (SELECT coalesce(s.d, b.d) d, coalesce(b.v, 0) banco, coalesce(s.v, 0) sis FROM sis s FULL JOIN ban b ON b.d = s.d),
       acum AS (SELECT d, sum(banco - sis) OVER (ORDER BY d) dif FROM dias)
  SELECT count(*), count(*) FILTER (WHERE abs(dif) > 0.005) INTO v_n, v_dif FROM acum;
  v_out := v_out || E'\nP1 Sicredi Lavoura ago/26: dias=' || v_n || ' dias com dif=' || v_dif
    || ' saldo sistema=' || (214547.50 + (SELECT sum(valor) FROM fn_caixa_sistema_pontas(c_nj, c_sic, '2026-08-01', '2026-08-31')))
    || ' banco=' || (214547.50 + (SELECT sum(valor) FROM extrato_bancario_v2 WHERE conta_bancaria_id = c_sic AND data_movimento BETWEEN '2026-08-01' AND '2026-08-31' AND cancelado_em IS NULL AND ignorado_em IS NULL));

  -- ── P2
  CREATE TEMP TABLE _hoje ON COMMIT DROP AS
  SELECT l.cliente_id cli, cb.id conta, to_char(l.data_pagamento, 'YYYY-MM') mes,
         sum(CASE WHEN l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = cb.id THEN l.valor
                  WHEN l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = cb.id THEN -l.valor
                  WHEN l.sinal = '1' THEN l.valor ELSE -l.valor END) mov
    FROM financeiro_contas_bancarias cb JOIN financeiro_lancamentos_v2 l ON l.cliente_id = cb.cliente_id
   WHERE l.data_pagamento IS NOT NULL AND l.cancelado = false AND l.sem_movimentacao_caixa = false
     AND COALESCE(l.cenario, 'realizado') = 'realizado' AND l.status_transacao = 'realizado'
     AND ((l.sinal = '1' AND (l.conta_destino_id = cb.id OR l.conta_bancaria_id = cb.id)) OR (l.sinal = '-1' AND l.conta_bancaria_id = cb.id)
          OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = cb.id))
   GROUP BY 1, 2, 3;
  CREATE TEMP TABLE _nova ON COMMIT DROP AS
  SELECT cb.cliente_id cli, cb.id conta, to_char(x.data, 'YYYY-MM') mes, sum(x.valor) mov
    FROM financeiro_contas_bancarias cb CROSS JOIN LATERAL fn_caixa_sistema_pontas(cb.cliente_id, cb.id, '2000-01-01', '2100-12-31') x
   WHERE cb.cliente_id IS NOT NULL
   GROUP BY 1, 2, 3;
  SELECT count(*), count(*) FILTER (WHERE abs(coalesce(n.mov, 0) - coalesce(h.mov, 0)) > 0.005),
         string_agg(CASE WHEN abs(coalesce(n.mov, 0) - coalesce(h.mov, 0)) > 0.005
                         THEN (SELECT nome_conta FROM financeiro_contas_bancarias WHERE id = coalesce(h.conta, n.conta)) || ' ' || coalesce(h.mes, n.mes)
                              || ' ' || round(coalesce(n.mov, 0) - coalesce(h.mov, 0), 2) END, ' | ')
    INTO v_n, v_dif, v_lista
    FROM _hoje h FULL JOIN _nova n ON n.cli = h.cli AND n.conta = h.conta AND n.mes = h.mes;
  IF v_n = 0 THEN RAISE EXCEPTION 'P2 invalida: conjunto comparado vazio'; END IF;
  v_out := v_out || E'\nP2 identidade: conta-meses comparados=' || v_n || ' diferem=' || v_dif || ' -> ' || coalesce(v_lista, '(nenhum)');

  -- ── P3
  SELECT jsonb_agg(jsonb_build_object('data', data, 'valor', valor, 'origem', origem, 'parcial', parcial, 'falta', falta)) INTO v_j
    FROM fn_caixa_sistema_pontas(c_nj, c_sic, '2026-08-01', '2026-08-31') WHERE lancamento_id = 'df5e3244-da44-41a7-a263-9586e89a559f';
  v_out := v_out || E'\nP3 Venda 19,82 t (parcial): ' || coalesce(v_j::text, '(nenhuma linha)');

  -- ── P4
  v_out := v_out || E'\nP4 BB NJ mai/26: hoje=' || coalesce((SELECT round(mov, 2)::text FROM _hoje h JOIN financeiro_contas_bancarias cb ON cb.id = h.conta
        WHERE cb.cliente_id = c_nj AND cb.nome_conta = 'Banco do Brasil' AND h.mes = '2026-05'), '-')
    || ' nova=' || coalesce((SELECT round(mov, 2)::text FROM _nova n JOIN financeiro_contas_bancarias cb ON cb.id = n.conta
        WHERE cb.cliente_id = c_nj AND cb.nome_conta = 'Banco do Brasil' AND n.mes = '2026-05'), '-')
    || ' estorno 426aeeb0 no caixa=' || (SELECT count(*) FROM financeiro_contas_bancarias cb, fn_caixa_sistema_pontas(c_nj, cb.id, '2026-05-01', '2026-05-31') x
        WHERE cb.cliente_id = c_nj AND cb.nome_conta = 'Banco do Brasil' AND x.lancamento_id = '426aeeb0-4859-4fa8-b7f9-af9a5ecb1f0a');

  -- ── P5
  v_j := fn_extratos_espelhados(c_nj, c_sic, '2026-08');
  v_out := v_out || E'\nP5 RPC real Sicredi ago: versao=' || (v_j->>'versao')
    || ' sistema_caixa=' || jsonb_array_length(v_j->'sistema_caixa') || ' linhas, soma ' || (SELECT round(sum((e->>'valor')::numeric), 2) FROM jsonb_array_elements(v_j->'sistema_caixa') e)
    || ' | sistema_completo=' || jsonb_array_length(v_j->'sistema_completo') || ' linhas, soma ' || (SELECT round(sum((e->>'valor_assinado')::numeric), 2) FROM jsonb_array_elements(v_j->'sistema_completo') e)
    || ' (replica lv2: ' || (SELECT round(mov, 2) FROM _hoje WHERE conta = c_sic AND mes = '2026-08') || ')';

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
