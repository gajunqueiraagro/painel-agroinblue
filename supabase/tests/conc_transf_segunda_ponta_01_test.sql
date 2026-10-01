-- CONC-TRANSF-SEGUNDA-PONTA-01 — teste da meia transferencia (lista e segunda ponta).
-- Roda em ROLLBACK: termina em RAISE, nada fica gravado. Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims).
-- P1 fn_transferencias_meia_ponta(NJ, '2026-05') = 9 linhas, com Pessoal 14/05 +2.597,00 -> b0134032 e Pessoal 12/05
--    +20.000,00 -> a transferencia BB -> Pessoal; mar..jul = 58 linhas, 58 extratos distintos (conjunto nao vazio).
-- P2 segunda ponta (Pessoal 14/05, b0134032, gravar): b0134032 com 2 vinculos vivos (Lavoura e Pessoal), 2.597,00 cada; o
--    status e a data do lancamento nao mudam; o extrato sai da lista de maio.
-- P3 recusas: repetir P2 -> ponta_ja_ligada; valor diferente -> valores_diferentes; direcao errada -> direcao_errada;
--    mes fechado -> mes_fechado.
-- P4 as irmas intactas: md5 de pg_get_functiondef de fn_transferencias_sugeridas, fn_transferencia_de_extratos e
--    _fn_transferencia_existente = os medidos em 01/10; e a saida delas num conjunto NAO vazio (NJ 2026-04, Santa Rita
--    2026-04 e 2026-07: a lista da irma e a previa de fn_transferencia_de_extratos de cada par) — md5 e tamanho, para
--    comparar com o mesmo numero medido antes da migration (o ensaio mede os dois lados). Conjunto vazio reprova.
-- auxiliar do P4 (some no ROLLBACK): a lista da irma e a previa de cada par resolvido, nos tres recortes com linhas
CREATE OR REPLACE FUNCTION public._ensaio_irmas() RETURNS TABLE(txt text) LANGUAGE sql AS $f$
  WITH q AS (SELECT c.id cli, m.m FROM clientes c
               JOIN (VALUES ('NJ Pecuária', '2026-04'), ('Santa Rita Agro', '2026-04'), ('Santa Rita Agro', '2026-07')) m(nome, m)
                 ON m.nome = c.nome),
       s AS (SELECT q.cli, q.m, public.fn_transferencias_sugeridas(q.cli, q.m) j FROM q)
  SELECT 'lista ' || s.m || ' ' || (s.j - 'ano_mes')::text FROM s
  UNION ALL
  SELECT 'previa ' || (z->'saida'->>'id') || ' ' ||
         public.fn_transferencia_de_extratos((z->'saida'->>'id')::uuid, (z->'entrada'->>'id')::uuid, true)::text
    FROM s, jsonb_array_elements(s.j->'linhas') z WHERE z->'entrada'->>'id' IS NOT NULL
$f$;
DO $teste$
DECLARE
  v_out text := '';
  c_nj  constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_ext constant uuid := 'd5b459d6-9136-458c-9141-be3ae971a0a3';   -- Sicredi Pessoal 14/05 +2.597,00 (livre)
  c_lan constant uuid := 'b0134032-eca7-4ab6-9f09-99f3789787f6';   -- Lavoura -> Pessoal 2.597,00 (so' a ponta da Lavoura)
  c_20k constant uuid := 'd7d1933f-2106-46f3-bedb-b3d21d9ff0f1';   -- Sicredi Pessoal 12/05 +20.000,00 (livre)
  v_r jsonb; v_n int; v_d int; v_m text; v_antes record; v_depois record; v_lista text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  -- ── P1
  v_r := fn_transferencias_meia_ponta(c_nj, '2026-05');
  SELECT string_agg(to_char((z->'extrato'->>'data')::date, 'DD/MM') || ' ' || (z->'extrato'->>'conta') || ' ' || (z->'extrato'->>'valor')
                    || ' -> ' || left(z->>'transferencia_id', 8) || ' (ligada: ' || (z->'ponta_ligada'->>'conta') || ')', ' | ')
    INTO v_lista FROM jsonb_array_elements(v_r->'linhas') z
   WHERE z->'extrato'->>'id' IN (c_ext::text, c_20k::text);
  v_out := 'P1 mai/26: total=' || (v_r->>'total') || ' · ' || coalesce(v_lista, '(os dois casos NAO apareceram)');
  SELECT count(*), count(DISTINCT z->'extrato'->>'id') INTO v_n, v_d
    FROM unnest(ARRAY['2026-03','2026-04','2026-05','2026-06','2026-07']) m(m),
         jsonb_array_elements(fn_transferencias_meia_ponta(c_nj, m.m)->'linhas') z;
  IF v_n = 0 THEN RAISE EXCEPTION 'P1 invalida: conjunto vazio'; END IF;
  SELECT string_agg(m.m || '=' || (fn_transferencias_meia_ponta(c_nj, m.m)->>'total'), ' ') INTO v_m
    FROM unnest(ARRAY['2026-03','2026-04','2026-05','2026-06','2026-07']) m(m);
  v_out := v_out || E'\n   mar..jul: linhas=' || v_n || ' extratos distintos=' || v_d || ' (' || v_m || ')';

  -- ── P3 (antes de gravar): valor diferente, direcao errada, mes fechado
  v_out := v_out || E'\nP3 valor diferente: ' || (fn_transferencia_segunda_ponta(c_20k, c_lan, true)->>'motivo');
  UPDATE extrato_bancario_v2 SET valor = -2597.00 WHERE id = c_ext;            -- so' no ROLLBACK: a ponta vira saida
  v_out := v_out || ' | direcao errada: ' || (fn_transferencia_segunda_ponta(c_ext, c_lan, true)->>'motivo');
  UPDATE extrato_bancario_v2 SET valor = 2597.00 WHERE id = c_ext;
  INSERT INTO financeiro_fechamentos (cliente_id, fazenda_id, ano_mes, status_fechamento)
  SELECT c_nj, fazenda_id, ano_mes, 'fechado' FROM financeiro_lancamentos_v2 WHERE id = c_lan;
  v_out := v_out || ' | mes fechado: ' || (fn_transferencia_segunda_ponta(c_ext, c_lan, true)->>'motivo');
  DELETE FROM financeiro_fechamentos f USING financeiro_lancamentos_v2 l
   WHERE l.id = c_lan AND f.cliente_id = c_nj AND f.fazenda_id = l.fazenda_id AND f.ano_mes = l.ano_mes
     AND f.status_fechamento = 'fechado' AND f.observacao IS NULL AND f.fechado_por IS NULL;

  -- ── P2
  SELECT status_transacao, data_pagamento, valor INTO v_antes FROM financeiro_lancamentos_v2 WHERE id = c_lan;
  v_r := fn_transferencia_segunda_ponta(c_ext, c_lan, true);
  v_out := v_out || E'\nP2 simular: ' || v_r::text;
  v_r := fn_transferencia_segunda_ponta(c_ext, c_lan, false);
  SELECT status_transacao, data_pagamento, valor INTO v_depois FROM financeiro_lancamentos_v2 WHERE id = c_lan;
  SELECT string_agg(cb.nome_exibicao || ' ' || c.valor_aplicado, ', ' ORDER BY cb.nome_exibicao) INTO v_lista
    FROM conciliacao_bancaria_itens c JOIN extrato_bancario_v2 x ON x.id = c.extrato_id
    JOIN financeiro_contas_bancarias cb ON cb.id = x.conta_bancaria_id
   WHERE c.lancamento_id = c_lan AND c.desfeito_em IS NULL;
  v_out := v_out || E'\n   gravado: ok=' || (v_r->>'ok') || ' vinculos vivos de b0134032: ' || v_lista
    || ' | lancamento ' || v_antes.status_transacao || '/' || v_antes.data_pagamento || ' -> ' || v_depois.status_transacao || '/' || v_depois.data_pagamento
    || ' | extrato=' || (SELECT status FROM extrato_bancario_v2 WHERE id = c_ext)
    || ' | mai/26 agora=' || (fn_transferencias_meia_ponta(c_nj, '2026-05')->>'total')
    || ' (ainda lista o extrato? ' || EXISTS (SELECT 1 FROM jsonb_array_elements(fn_transferencias_meia_ponta(c_nj, '2026-05')->'linhas') z
                                              WHERE z->'extrato'->>'id' = c_ext::text) || ')';

  -- ── P3: repetir P2
  v_out := v_out || E'\nP3 repetir P2: ' || (fn_transferencia_segunda_ponta(c_ext, c_lan, false)->>'motivo');

  -- ── P4
  v_out := v_out || E'\nP4 irmas: ' ||
    (SELECT string_agg(p.proname || '=' || left(md5(pg_get_functiondef(p.oid)), 8), ' ' ORDER BY p.proname)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('fn_transferencias_sugeridas', 'fn_transferencia_de_extratos', '_fn_transferencia_existente'));

  SELECT count(*), md5(string_agg(z.txt, '|' ORDER BY z.txt)) INTO v_n, v_m FROM public._ensaio_irmas() z;
  IF v_n = 0 THEN RAISE EXCEPTION 'P4 invalida: conjunto vazio'; END IF;
  v_out := v_out || E'\n   saida das irmas no conjunto: ' || v_n || ' itens, md5 ' || v_m;

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
