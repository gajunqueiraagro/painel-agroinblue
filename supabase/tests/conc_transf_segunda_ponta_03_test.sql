-- CONC-TRANSF-SEGUNDA-PONTA-03 — extratos gemeos fecham meias ponta em ordem.
-- Roda em ROLLBACK: termina em RAISE, nada fica gravado. Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims).
-- O CASO (NJ, Itau BBA mar/2026): livres Itau 06/03 -100.000 (09157227, ca9c09ad), identicos; meias 1b46c5de (Itau ->
-- Sicredi Lavoura) e bd99294f (Itau -> BB), mesma data e mesmo created_at. Ordem estavel: 09157227 -> 1b46c5de,
-- ca9c09ad -> bd99294f.
-- P1 a lista de mar/26 traz os dois Itau 06/03, um para cada transferencia; a segunda ponta dos dois (gravada so' aqui)
--    deixa cada transferencia com 2 vinculos vivos.
-- P2 gemeos em numero diferente das transferencias continuam NULL: 2 extratos x 1 transferencia (bd99294f fora, so' aqui)
--    e 3 extratos x 2 (o Itau 09/03 b448c674 vira gemeo, so' aqui).
-- P3 (no ensaio, contra o corpo de antes): fora do caso gemeo nada muda — o teste reporta, para TODO extrato livre desde
--    2025 (todos os clientes) menos os dois gemeos, a transferencia que a regra aponta (md5, tamanho e quantos apontam), e
--    o md5 da irma em NJ abr, Santa Rita abr e jul. ⚠ A lista de meias do NJ mar..jul sem os gemeos ficou VAZIA (as outras
--    ja' foram confirmadas pelo Gabriel em 01/10) — conjunto vazio nao prova; por isso a varredura e' sobre os livres.
DO $teste$
DECLARE
  v_out text := '';
  c_nj  constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_g1  constant uuid := '09157227-38bc-4e3f-bcec-a10f9fd85873';
  c_g2  constant uuid := 'ca9c09ad-5ffc-4e92-af74-6fa4255fe97c';
  c_t1  constant uuid := '1b46c5de-b52c-4524-a6bd-41cf29f167fe';
  c_t2  constant uuid := 'bd99294f-8be5-4f6e-b5d5-2f7bd9d91eb8';
  v_txt text; v_n int; v_k int; v_md5 text; v_r1 jsonb; v_r2 jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  -- ── P3 (o que o ensaio compara com o de antes): meias mar..jul sem os gemeos, e a irma
  SELECT count(*), count(x.lid), md5(string_agg(x.id::text || '>' || coalesce(x.lid::text, '-'), '|' ORDER BY x.id)) INTO v_n, v_k, v_md5
    FROM (SELECT e.id, public._fn_meia_ponta_compativel(e.id) lid FROM extrato_bancario_v2 e
           WHERE e.cancelado_em IS NULL AND e.status <> 'ignorado' AND e.valor <> 0 AND e.data_movimento >= '2025-01-01'
             AND e.id NOT IN (c_g1, c_g2)
             AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = e.id AND c.desfeito_em IS NULL)) x;
  IF v_n = 0 OR v_k = 0 THEN RAISE EXCEPTION 'P3 invalida: conjunto vazio (livres %, com meia %)', v_n, v_k; END IF;
  v_out := 'P3 livres desde 2025 sem os gemeos: ' || v_n || ' (com meia ' || v_k || '), md5 ' || coalesce(v_md5, 'NULO');
  SELECT md5(string_agg((fn_transferencias_sugeridas(c.id, q.m) - 'ano_mes')::text, '|' ORDER BY q.nome, q.m)) INTO v_md5
    FROM (VALUES ('NJ Pecuária', '2026-04'), ('Santa Rita Agro', '2026-04'), ('Santa Rita Agro', '2026-07')) q(nome, m)
    JOIN clientes c ON c.nome = q.nome;
  v_out := v_out || E'\n   irma (NJ abr, SR abr, SR jul): md5 ' || coalesce(v_md5, 'NULO');

  -- ── P1
  SELECT string_agg(to_char((z->'extrato'->>'data')::date, 'DD/MM') || ' ' || left(z->'extrato'->>'id', 8) || ' -> ' || left(z->>'transferencia_id', 8), ' | '
                    ORDER BY z->'extrato'->>'id')
    INTO v_txt FROM jsonb_array_elements(fn_transferencias_meia_ponta(c_nj, '2026-03')->'linhas') z
   WHERE z->'extrato'->>'id' IN (c_g1::text, c_g2::text);
  v_out := v_out || E'\nP1 mar/26 gemeos: ' || coalesce(v_txt, '(nenhum)')
    || ' | total mar=' || coalesce(fn_transferencias_meia_ponta(c_nj, '2026-03')->>'total', 'NULO');
  -- as gravacoes num comando e a contagem em outro: na mesma expressao a contagem leria o snapshot de antes delas
  v_r1 := fn_transferencia_segunda_ponta(c_g1, c_t1, false);
  v_r2 := fn_transferencia_segunda_ponta(c_g2, c_t2, false);
  v_out := v_out || E'\n   segunda ponta: ' || coalesce(v_r1->>'ok', 'NULO') || ', ' || coalesce(v_r2->>'ok', 'NULO')
    || ' | vivos 1b46c5de=' || (SELECT count(*) FROM conciliacao_bancaria_itens WHERE lancamento_id = c_t1 AND desfeito_em IS NULL)
    || ' bd99294f=' || (SELECT count(*) FROM conciliacao_bancaria_itens WHERE lancamento_id = c_t2 AND desfeito_em IS NULL);
  -- desfaz as duas (so' aqui) para o P2 voltar ao estado de partida
  UPDATE conciliacao_bancaria_itens SET desfeito_em = now(), desfeito_motivo = 'teste_rollback'
   WHERE extrato_id IN (c_g1, c_g2) AND desfeito_em IS NULL;

  -- ── P2a: 2 gemeos x 1 transferencia (bd99294f deixa de ser compativel, so' aqui)
  UPDATE financeiro_lancamentos_v2 SET valor = 99999 WHERE id = c_t2;
  v_out := v_out || E'\nP2 2 gemeos x 1 transferencia: ' || coalesce(public._fn_meia_ponta_compativel(c_g1)::text, 'null')
    || ', ' || coalesce(public._fn_meia_ponta_compativel(c_g2)::text, 'null');
  UPDATE financeiro_lancamentos_v2 SET valor = 100000 WHERE id = c_t2;

  -- ── P2b: 3 gemeos x 2 (o Itau 09/03 vira gemeo: desligado e trazido para 06/03, so' aqui)
  UPDATE conciliacao_bancaria_itens SET desfeito_em = now(), desfeito_motivo = 'teste_rollback'
   WHERE extrato_id = 'b448c674-c228-42de-bd78-287cd7460249' AND desfeito_em IS NULL;
  UPDATE extrato_bancario_v2 SET data_movimento = '2026-03-06' WHERE id = 'b448c674-c228-42de-bd78-287cd7460249';
  v_out := v_out || ' | 3 gemeos x 2: ' || coalesce(public._fn_meia_ponta_compativel(c_g1)::text, 'null')
    || ', ' || coalesce(public._fn_meia_ponta_compativel(c_g2)::text, 'null')
    || ', ' || coalesce(public._fn_meia_ponta_compativel('b448c674-c228-42de-bd78-287cd7460249')::text, 'null');

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
