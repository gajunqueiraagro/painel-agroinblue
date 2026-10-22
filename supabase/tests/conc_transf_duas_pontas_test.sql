-- CONC-TRANSF-DUAS-PONTAS-01 — prova no CASO REAL (cliente 77d37bbf, transferencia 74c3eb77 Bradesco -> BB de R$ 50.000 em 29/06/2026,
-- ja' ligada no Bradesco ao extrato 1855db2d). TUDO DESFEITO: o bloco termina em RAISE (a mensagem comeca com "OK" quando passa).
-- Rodar como authenticated (o canal de escrita do proto, com o jwt do admin):
--   T1 a Conferencia do BB mostra a transferencia SEM vinculo e a frase "conciliado no Banco Bradesco · falta o Banco do Brasil";
--      a do Bradesco, conciliada
--   T2 a ponta BB liga pelo Casar com o banco (Pix 29/06 R$ 50.000 ef2fd158) -> "conciliado nas duas pontas", extrato BB conciliado
--   T3 a MESMA conta recusa: outro extrato do Bradesco (6b36eeba) para a mesma transferencia -> "já está ligado"
--   T4 sinal errado recusa: saida do BB (4329fa46) na ponta de destino -> "é da conta"
--   T5 desfazer a ponta BB nao mexe na do Bradesco (item vivo, status do lancamento realizado)
--   T6 fora de transferencia nada muda: lancamento de despesa ja' ligado (23898794) recusa outro extrato da mesma conta
--   T7 bloco: a ponta BB simula no bloco (saldo livre por conta, direcao de entrada)
--   T8 "Ligar os exatos do mes" (simular) no BB de junho inclui a transferencia da Rita
DO $$
DECLARE
  c_lanc constant uuid := '74c3eb77-79c3-4ebd-ad3b-adfa5bcfadc1';
  c_cli  constant uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  c_bb   constant uuid := 'a5ed9922-e476-4ec0-a19c-6481140e52eb';
  c_brad constant uuid := 'dd6f1aa0-e061-40a2-bcb8-857e6d22e8cf';
  c_pix  constant uuid := 'ef2fd158-9e70-4757-a1b1-21ff75f1fe37';
  c_ext_brad constant uuid := '1855db2d-be3a-4f3c-9b44-8e576b39f2e8';
  res jsonb; sis jsonb; msg text; st text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  -- T1
  res := public.fn_extratos_espelhados(c_cli, c_bb, '2026-06');
  SELECT x INTO sis FROM jsonb_array_elements(res->'sistema_completo') x WHERE x->>'lancamento_id' = c_lanc::text;
  IF sis->>'status' <> 'sem_vinculo' THEN RAISE EXCEPTION 'T1 BB: status % (esperado sem_vinculo)', sis->>'status'; END IF;
  IF sis->'pontas'->>'frase' <> 'conciliado no Banco Bradesco · falta o Banco do Brasil' THEN RAISE EXCEPTION 'T1 frase: %', sis->'pontas'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(res->'vinculos') v WHERE v->>'lancamento_id' = c_lanc::text) THEN
    RAISE EXCEPTION 'T1 o vinculo do Bradesco aparece na Conferencia do BB'; END IF;
  res := public.fn_extratos_espelhados(c_cli, c_brad, '2026-06');
  SELECT x INTO sis FROM jsonb_array_elements(res->'sistema_completo') x WHERE x->>'lancamento_id' = c_lanc::text;
  IF sis->>'status' <> 'conciliado' THEN RAISE EXCEPTION 'T1 Bradesco: status %', sis->>'status'; END IF;

  -- T7 (antes de ligar: o bloco simula a ponta BB)
  res := public.fn_conciliar_bloco(ARRAY[c_pix], ARRAY[c_lanc], 'exato', true);
  IF (res->'resumo'->>'diferenca')::numeric <> 0 THEN RAISE EXCEPTION 'T7 bloco: %', res->'resumo'; END IF;

  -- T8
  res := public.fn_vincular_exatos_mes(c_cli, c_bb, '2026-06-01', '2026-06-30', true);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(res->'pares') p WHERE p->>'lancamento_id' = c_lanc::text) THEN
    RAISE EXCEPTION 'T8 os exatos do mes nao trazem a transferencia (% pares)', jsonb_array_length(res->'pares'); END IF;

  -- T2
  res := public.fn_espelho_casar(c_pix, jsonb_build_array(jsonb_build_object('lancamento_id', c_lanc, 'valor', 50000)), false, 'teste');
  IF NOT (res->>'ok')::boolean THEN RAISE EXCEPTION 'T2 casar: %', res; END IF;
  IF public._fn_conc_transf_pontas(c_lanc)->>'frase' <> 'conciliado nas duas pontas' THEN RAISE EXCEPTION 'T2 pontas: %', public._fn_conc_transf_pontas(c_lanc); END IF;
  SELECT status INTO st FROM extrato_bancario_v2 WHERE id = c_pix;
  IF st <> 'conciliado' THEN RAISE EXCEPTION 'T2 extrato BB: %', st; END IF;

  -- T3
  msg := NULL;
  BEGIN PERFORM public.fn_vincular_extrato_lancamento('6b36eeba-3456-4980-bafd-d3f3c4dee518', c_lanc, 50000);
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg IS NULL OR msg NOT LIKE '%já está ligado a outro movimento%' THEN RAISE EXCEPTION 'T3 a mesma conta nao recusou: %', msg; END IF;
  -- T3b a mesma recusa pelo Casar com o banco
  res := public.fn_espelho_casar('6b36eeba-3456-4980-bafd-d3f3c4dee518', jsonb_build_array(jsonb_build_object('lancamento_id', c_lanc, 'valor', 50000)), true, 'teste');
  IF res->>'motivo' IS DISTINCT FROM 'lancamento_ja_conciliado' THEN RAISE EXCEPTION 'T3b Casar na mesma conta nao recusou: %', res; END IF;

  -- T5 (desfaz a ponta BB; a do Bradesco fica)
  PERFORM public.fn_desfazer_vinculo_extrato(c_pix, 'teste');
  IF NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens WHERE extrato_id = c_ext_brad AND lancamento_id = c_lanc AND desfeito_em IS NULL) THEN
    RAISE EXCEPTION 'T5 desfazer o BB mexeu no Bradesco'; END IF;
  IF (SELECT status_transacao FROM financeiro_lancamentos_v2 WHERE id = c_lanc) <> 'realizado' THEN RAISE EXCEPTION 'T5 status do lancamento mudou'; END IF;
  IF public._fn_conc_transf_pontas(c_lanc)->>'frase' <> 'conciliado no Banco Bradesco · falta o Banco do Brasil' THEN RAISE EXCEPTION 'T5 pontas: %', public._fn_conc_transf_pontas(c_lanc); END IF;

  -- T4 (sinal errado: saida do BB na ponta de destino)
  msg := NULL;
  BEGIN PERFORM public.fn_vincular_extrato_lancamento('4329fa46-6d63-456c-a07d-a125f39e13ee', c_lanc, 50000);
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg IS NULL OR msg NOT LIKE '%é da conta%' THEN RAISE EXCEPTION 'T4 sinal errado nao recusou: %', msg; END IF;

  -- T6 (fora de transferencia, a regra antiga)
  msg := NULL;
  BEGIN PERFORM public.fn_vincular_extrato_lancamento('4329fa46-6d63-456c-a07d-a125f39e13ee', '23898794-c568-4faa-ad5f-48eb8de4b2e6', 430);
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg IS NULL OR msg NOT LIKE '%já está ligado a outro movimento%' THEN RAISE EXCEPTION 'T6 nao-transferencia nao recusou: %', msg; END IF;

  RAISE EXCEPTION 'OK CONC-TRANSF-DUAS-PONTAS-01: T1-T8 passaram (tudo desfeito)';
END $$;
