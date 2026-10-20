-- FIN-POS-FIXADO-01b, guarda — so' o dono grava o juro real. Termina em RAISE 'OK'; tudo desfeito.
--   G1 fn_espelho_casar direto com os juros estimados da parcela 2 do 8.233.040: recusa 'parcela_pos' com a frase (simulacao e gravacao)
--   G2 pelo dono passa: parcela paga, juros 39.995,50, e a marca nao sobra ligada depois
--   G3 contrato que nao e' pos: a fn_espelho_casar direta segue como sempre
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

CREATE FUNCTION pg_temp.ext(p_valor numeric, p_data date) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  VALUES (v_id, '537661af-a934-4c66-b138-f8dbc378a00f', '219dbf52-6e0a-4017-ae18-961313ce7456', p_data, p_valor,
          CASE WHEN p_valor < 0 THEN 'debito' ELSE 'credito' END, 'SINT-POS01BG-' || v_id, 'SINT POS01B GUARDA');
  RETURN v_id;
END $f$;

DO $t$
DECLARE
  c_par constant uuid := 'cb7b9963-a93b-4206-96d8-ee5d68e059b4';
  c_lp  constant uuid := 'f13e1d49-4bd2-4e81-aee5-17fd3e35fe23';
  c_lj  constant uuid := '00239d5a-389c-46b7-852e-d7ed042839c9';
  c_fin constant uuid := '74567fe0-3e09-4f22-84a5-2513d6557d27';
  c_frase constant text := 'Parcela de contrato pós-fixado: case pelo modal da linha do extrato para gravar o juro real.';
  e160 uuid; e3 uuid; r jsonb; v_itens jsonb; p3 record;
BEGIN
  e160 := pg_temp.ext(-160000, date '2027-08-15');
  v_itens := jsonb_build_array(jsonb_build_object('lancamento_id', c_lp, 'valor', 120004.50), jsonb_build_object('lancamento_id', c_lj, 'valor', 39995.50));

  -- G1
  r := public.fn_espelho_casar(e160, v_itens, true, 'casado_no_espelho');
  IF (r->>'ok')::boolean OR r->>'motivo' IS DISTINCT FROM 'parcela_pos' OR r->>'frase' IS DISTINCT FROM c_frase THEN RAISE EXCEPTION 'G1 simulacao: %', r; END IF;
  r := public.fn_espelho_casar(e160, v_itens, false, 'casado_no_espelho');
  IF (r->>'ok')::boolean OR r->>'motivo' IS DISTINCT FROM 'parcela_pos' THEN RAISE EXCEPTION 'G1 gravacao: %', r; END IF;
  IF (SELECT valor FROM public.financeiro_lancamentos_v2 WHERE id = c_lj) <> 35665.34
     OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens WHERE extrato_id = e160) THEN RAISE EXCEPTION 'G1 gravou'; END IF;

  -- G2
  r := public.fn_financiamento_parcela_pos_pagar(e160, c_par, false);
  IF NOT (r->>'ok')::boolean OR (SELECT status || '|' || valor_juros FROM public.financiamento_parcelas WHERE id = c_par) <> 'pago|39995.50' THEN
    RAISE EXCEPTION 'G2 dono: %', r; END IF;
  IF coalesce(current_setting('app.pos_pagar', true), '') = 'on' THEN RAISE EXCEPTION 'G2 a marca ficou ligada'; END IF;

  -- G3
  SELECT * INTO p3 FROM public.financiamento_parcelas WHERE financiamento_id = c_fin AND numero_parcela = 3;
  UPDATE public.financiamentos SET tipo_taxa = NULL WHERE id = c_fin;
  e3 := pg_temp.ext(-(120004.50 + 26749.00), date '2028-08-15');
  r := public.fn_espelho_casar(e3, jsonb_build_array(jsonb_build_object('lancamento_id', p3.lancamento_id, 'valor', 120004.50),
                                                      jsonb_build_object('lancamento_id', p3.lancamento_juros_id, 'valor', 26749.00)), true, 'casado_no_espelho');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'G3 nao pos devia passar: %', r; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
ROLLBACK;
