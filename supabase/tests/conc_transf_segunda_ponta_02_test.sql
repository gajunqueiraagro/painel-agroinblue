-- CONC-TRANSF-SEGUNDA-PONTA-02 — a meia ponta tem prioridade sobre o par novo.
-- Roda em ROLLBACK: termina em RAISE, nada fica gravado. Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims).
--
-- O CASO (NJ abr/2026, Sicredi Lavoura -> Itau, 400.000,00): 2a9ff323 ligada so' ao debito Lavoura 27/04 (387cb0df) e
-- dc30e5b8 ligada so' ao credito Itau 28/04 (c95a0ba5); livres o credito Itau 27/04 (2b35959a) e o debito Lavoura 28/04
-- (4995d6e3). ⚠ O ESTADO REAL MUDOU DUAS VEZES EM 01/10: as ~17:50 UTC o desfazer da tela cancelou a de4e99d5 com os dois
-- vinculos dela e desfez TAMBEM o vinculo c95a0ba5 -> dc30e5b8; as 18:00-18:03 o Gabriel religou tudo pela tela (cada
-- transferencia com as duas pontas). O teste RECONSTROI o estado de ANTES do erro a partir de qualquer um dos dois, so' no
-- ROLLBACK: desliga os vinculos vivos dos dois livres de entao e garante a ponta Itau 28/04 viva da dc30e5b8.
-- P1 reconstruido o estado: fn_transferencias_sugeridas(NJ,'2026-04') NAO lista o par Lavoura 28/04 x Itau 27/04;
--    fn_transferencias_meia_ponta lista as 2 meias (Itau 27/04 -> 2a9ff323, Lavoura 28/04 -> dc30e5b8). "Sabe achar": os
--    dois livres casam pela regra do par (contas diferentes, valor oposto, |dias| <= 1) — sem a regra nova eles seriam par.
-- P2 fn_transferencia_de_extratos(Lavoura 28/04, Itau 27/04, false) -> tem_meia_ponta (nada e' criado).
-- P3 as contagens dos pares: NJ 2026-04, Santa Rita 2026-04 e 2026-07.
-- P4 varredura NJ mar..jul: nenhum extrato nas duas listas (o tamanho das duas e' reportado; meias vazias reprova).

-- reconstrucao do estado de antes do erro (so' no ROLLBACK)
-- 1. os dois livres de entao (Itau 27/04, Lavoura 28/04) voltam a ser livres
UPDATE conciliacao_bancaria_itens SET desfeito_em = now(), desfeito_motivo = 'teste_rollback'
 WHERE extrato_id IN ('2b35959a-2a2d-4c09-9b46-bc7cc0a29d46', '4995d6e3-1685-4677-8ad9-629cb302c3c1') AND desfeito_em IS NULL;
-- 2. a ponta Itau 28/04 da dc30e5b8 viva (se nao houver vinculo vivo nela, religa o original de 26/05)
UPDATE conciliacao_bancaria_itens SET desfeito_em = NULL, desfeito_motivo = NULL
 WHERE extrato_id = 'c95a0ba5-8a18-40a2-94e8-39f5786593b8' AND lancamento_id = 'dc30e5b8-ee15-4c6e-8ed2-3959bf2583e7'
   AND desfeito_em IS NOT NULL AND created_at < '2026-06-01'
   AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens v WHERE v.extrato_id = 'c95a0ba5-8a18-40a2-94e8-39f5786593b8' AND v.desfeito_em IS NULL);

DO $teste$
DECLARE
  v_out text := '';
  c_nj   constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_itau27 constant uuid := '2b35959a-2a2d-4c09-9b46-bc7cc0a29d46';   -- credito Itau 27/04 +400.000 (livre)
  c_lav28  constant uuid := '4995d6e3-1685-4677-8ad9-629cb302c3c1';   -- debito Lavoura 28/04 -400.000 (livre)
  v_r jsonb; v_n int; v_m int; v_k int; v_txt text; v_lanc_antes int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  -- ── estado reconstruido
  v_out := 'estado: dc30e5b8 vivos=' || (SELECT count(*) FROM conciliacao_bancaria_itens WHERE lancamento_id = 'dc30e5b8-ee15-4c6e-8ed2-3959bf2583e7' AND desfeito_em IS NULL)
    || ' 2a9ff323 vivos=' || (SELECT count(*) FROM conciliacao_bancaria_itens WHERE lancamento_id = '2a9ff323-96f8-4f2d-b582-1fe566dfb899' AND desfeito_em IS NULL)
    || ' de4e99d5 cancelada=' || (SELECT cancelado FROM financeiro_lancamentos_v2 WHERE id = 'de4e99d5-37f0-404c-80f0-3eaa91b11bef');

  -- ── P1: "sabe achar" — pela regra do par, os dois livres SAO par
  SELECT count(*) INTO v_n FROM extrato_bancario_v2 s, extrato_bancario_v2 e
   WHERE s.id = c_lav28 AND e.id = c_itau27 AND s.valor < 0 AND e.valor > 0 AND round(e.valor, 2) = round(-s.valor, 2)
     AND s.conta_bancaria_id <> e.conta_bancaria_id AND abs(e.data_movimento - s.data_movimento) <= 1
     AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id IN (s.id, e.id) AND c.desfeito_em IS NULL);
  v_out := v_out || E'\nP1 pela regra do par os dois livres casam: ' || (v_n = 1);
  v_r := fn_transferencias_sugeridas(c_nj, '2026-04');
  SELECT count(*) INTO v_m FROM jsonb_array_elements(v_r->'linhas') z
   WHERE z->'saida'->>'id' IN (c_lav28::text, c_itau27::text) OR z->'entrada'->>'id' IN (c_lav28::text, c_itau27::text)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(z->'candidatas') c WHERE c->>'id' IN (c_lav28::text, c_itau27::text));
  v_out := v_out || ' | sugeridas abr: total=' || (v_r->>'total') || ', linhas com os dois livres=' || v_m;
  SELECT string_agg(to_char((z->'extrato'->>'data')::date, 'DD/MM') || ' ' || (z->'extrato'->>'conta') || ' -> ' || left(z->>'transferencia_id', 8), ' | ')
    INTO v_txt FROM jsonb_array_elements(fn_transferencias_meia_ponta(c_nj, '2026-04')->'linhas') z
   WHERE z->'extrato'->>'id' IN (c_lav28::text, c_itau27::text);
  v_out := v_out || E'\n   meias abr: total=' || (fn_transferencias_meia_ponta(c_nj, '2026-04')->>'total') || ' · ' || coalesce(v_txt, '(nenhuma)');

  -- ── P2
  SELECT count(*) INTO v_lanc_antes FROM financeiro_lancamentos_v2 WHERE cliente_id = c_nj AND tipo_operacao = '3-Transferências';
  v_r := fn_transferencia_de_extratos(c_lav28, c_itau27, false);
  v_out := v_out || E'\nP2 de_extratos(Lavoura 28/04, Itau 27/04, gravar): ' || v_r::text
    || ' | transferencias criadas: ' || ((SELECT count(*) FROM financeiro_lancamentos_v2 WHERE cliente_id = c_nj AND tipo_operacao = '3-Transferências') - v_lanc_antes)
    || E'\n   segunda ponta (simular): Itau 27/04 -> ' || (fn_transferencia_segunda_ponta(c_itau27, '2a9ff323-96f8-4f2d-b582-1fe566dfb899', true)->>'ok')
    || ', Lavoura 28/04 -> ' || (fn_transferencia_segunda_ponta(c_lav28, 'dc30e5b8-ee15-4c6e-8ed2-3959bf2583e7', true)->>'ok');

  -- ── P3
  SELECT string_agg(q.nome || ' ' || q.m || '=' || (fn_transferencias_sugeridas(c.id, q.m)->>'total'), ' · ' ORDER BY q.nome, q.m) INTO v_txt
    FROM (VALUES ('NJ Pecuária', '2026-04'), ('Santa Rita Agro', '2026-04'), ('Santa Rita Agro', '2026-07')) q(nome, m)
    JOIN clientes c ON c.nome = q.nome;
  v_out := v_out || E'\nP3 pares: ' || v_txt;

  -- ── P4
  WITH m(m) AS (VALUES ('2026-03'), ('2026-04'), ('2026-05'), ('2026-06'), ('2026-07')),
       meia AS (SELECT DISTINCT z->'extrato'->>'id' id FROM m, jsonb_array_elements(fn_transferencias_meia_ponta(c_nj, m.m)->'linhas') z),
       par AS (SELECT DISTINCT i.id FROM m, jsonb_array_elements(fn_transferencias_sugeridas(c_nj, m.m)->'linhas') z,
                LATERAL (SELECT z->'saida'->>'id' UNION ALL SELECT z->'entrada'->>'id'
                         UNION ALL SELECT c->>'id' FROM jsonb_array_elements(z->'candidatas') c) i(id) WHERE i.id IS NOT NULL)
  SELECT (SELECT count(*) FROM meia), (SELECT count(*) FROM par), (SELECT count(*) FROM meia JOIN par USING (id)) INTO v_n, v_m, v_k;
  -- a lista das meias nao pode vir vazia; a dos pares pode (o conserto tira dela justamente os que seriam meia) — a prova de
  -- que a varredura SABE ACHAR a intersecao e' o ensaio, que a mede ANTES da migration
  IF v_n = 0 THEN RAISE EXCEPTION 'P4 invalida: nenhuma meia em mar..jul'; END IF;
  v_out := v_out || E'\nP4 NJ mar..jul: extratos nas meias=' || v_n || ', nos pares=' || v_m || ', nas DUAS=' || v_k;

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
