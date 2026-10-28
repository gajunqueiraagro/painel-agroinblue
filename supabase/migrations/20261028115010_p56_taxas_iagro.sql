-- P56 (Gabriel 28/10/2026 06:53, "era Iagro") — NJ Pecuária: as taxas do Iagro lançadas em "RS Agro Industria" e as "Taxa de Abate"
-- de "Sefaz MS" passam a ter o favorecido "Iagro". SÓ o favorecido muda (a classificação já está certa).
-- ⚠ PELA PORTA DA TELA (FORN-TROCAR-LOTE-01): `fn_lancamentos_trocar_favorecido` (trilha em `lancamento_favorecido_trocas`, desfazer
--   por `fn_lancamentos_trocar_favorecido_desfazer(operacao_id)`); nunca UPDATE solto. A porta exige `tenant_ok`: o autor é o usuário do
--   Gabriel (admin AgroinBlue), só nesta transação; `app.via = 'p56'` marca a rotina na Auditoria.
-- Ficam (apontados na prévia): "Fundersul - Abate" do RS Agro (outro tributo) e as 4 "Taxa de Abate" da Associação Sul-Matogrossense de
--   Produtores de Novilho Precoce (R$ 9,99/cab: a contribuição da associação). Item 2 (juntar "Sefaz MS") já estava feito em 18–19/10.
-- PARA (nada gravado) se: a lista não for 201 / R$ 49.512,74 (a prévia), ou o total do cliente / a base do DRE mudar.
-- REGISTRO HISTÓRICO: rodada uma vez no proto; não se reaplica (a 2ª vez acha 0 e para).
DO $$
DECLARE
  v_cliente uuid; v_ids uuid[]; v_soma numeric; v_r jsonb;
  v_tot_antes numeric; v_dre_antes text; v_tot_depois numeric; v_dre_depois text;
BEGIN
  SELECT id INTO v_cliente FROM public.clientes WHERE id::text LIKE 'f2d67cd4%';
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'P56: cliente NJ não encontrado. Nada foi gravado.'; END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('app.via', 'p56', true);

  SELECT array_agg(l.id ORDER BY l.id), round(sum(l.valor), 2) INTO v_ids, v_soma
    FROM public.financeiro_lancamentos_v2 l
   WHERE l.cliente_id = v_cliente AND NOT l.cancelado AND (
         (l.favorecido_id = 'c275e9b1-c528-4823-bb49-cdba6a52f842'
          AND lower(unaccent(coalesce(l.descricao, ''))) ~ '(taxa de abate|taxa iagro|lagro|multa iagro)')
      OR (l.favorecido_id = '948cab3f-52e3-46bd-b4b8-3e022828125b'
          AND lower(unaccent(coalesce(l.descricao, ''))) LIKE '%taxa de abate%'));
  IF coalesce(cardinality(v_ids), 0) <> 201 OR v_soma IS DISTINCT FROM 49512.74 THEN
    RAISE EXCEPTION 'P56: a lista mudou desde a prévia (% lançamentos, R$ %; a prévia: 201, R$ 49.512,74). Nada foi gravado.',
      coalesce(cardinality(v_ids), 0), v_soma;
  END IF;

  SELECT round(sum(valor), 2) INTO v_tot_antes FROM public.financeiro_lancamentos_v2 WHERE cliente_id = v_cliente AND NOT cancelado;
  SELECT md5(string_agg(k, ',' ORDER BY k)) INTO v_dre_antes FROM (
    SELECT coalesce(plano_conta_id::text, '-') || '|' || coalesce(fazenda_id::text, '-') || '|' || to_char(data_competencia, 'YYYY-MM')
           || '|' || coalesce(status_transacao, '') || '|' || round(sum(valor), 2) k
      FROM public.financeiro_lancamentos_v2 WHERE cliente_id = v_cliente AND NOT cancelado
     GROUP BY plano_conta_id, fazenda_id, to_char(data_competencia, 'YYYY-MM'), status_transacao) x;

  v_r := public.fn_lancamentos_trocar_favorecido(v_cliente, v_ids, 'ac1e6db1-2028-47f8-8811-a6dfd9009775',
           'P56: taxa de abate / Iagro → Iagro (OK do Gabriel 28/10)', false);
  IF (v_r->>'ok')::boolean IS NOT TRUE OR (v_r->>'lancamentos')::int <> 201 THEN
    RAISE EXCEPTION 'P56: a porta não confirmou (%). Nada foi gravado.', v_r;
  END IF;

  SELECT round(sum(valor), 2) INTO v_tot_depois FROM public.financeiro_lancamentos_v2 WHERE cliente_id = v_cliente AND NOT cancelado;
  SELECT md5(string_agg(k, ',' ORDER BY k)) INTO v_dre_depois FROM (
    SELECT coalesce(plano_conta_id::text, '-') || '|' || coalesce(fazenda_id::text, '-') || '|' || to_char(data_competencia, 'YYYY-MM')
           || '|' || coalesce(status_transacao, '') || '|' || round(sum(valor), 2) k
      FROM public.financeiro_lancamentos_v2 WHERE cliente_id = v_cliente AND NOT cancelado
     GROUP BY plano_conta_id, fazenda_id, to_char(data_competencia, 'YYYY-MM'), status_transacao) x;
  IF v_tot_depois IS DISTINCT FROM v_tot_antes OR v_dre_depois IS DISTINCT FROM v_dre_antes THEN
    RAISE EXCEPTION 'P56: total (% → %) ou base do DRE (% → %) mudou. Nada foi gravado.', v_tot_antes, v_tot_depois, v_dre_antes, v_dre_depois;
  END IF;
  RAISE NOTICE 'P56 OK: operacao_id=% · 201 lançamentos · R$ 49.512,74 → Iagro · total % e DRE % iguais', v_r->>'operacao_id', v_tot_depois, v_dre_depois;
END $$;
