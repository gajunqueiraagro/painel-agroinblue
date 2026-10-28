-- Santa Rita (1) — OK do Gabriel: 28/10/2026 09:21 — cancelar os 2 previstos de 07/2027 (dcac275b, 9e38ffc2; R$ 10.352,99) pela porta do
-- P154, motivo "fora da vigência (fim 30/06/2027)". As regras "Folha Pagamento" e10c9f7d e 0aed877c terminam em 30/06/2027; o Propagar
-- de 11/10 moveu a competência do lançamento de vencimento 02/07/2027 para 07/2027 (fora do fim). Só esses 2; o padrão da folha (dia 29 x
-- dia 02) e o julho/2026 em dobro NÃO se mexem (o Gabriel acerta com o cliente — P161).
-- Pela porta `fn_recorrencia_fora_da_vigencia` (modo encurtada, só PREVISTO; nunca apaga; o cancelado ocupa a competência). Autor = o
-- usuário do Gabriel só nesta transação (a porta exige usuário); `app.via = 'sr-fora-vigencia'`.
-- PARA (nada gravado) se a prévia não for a de hoje. REGISTRO HISTÓRICO: rodada uma vez; não se reaplica (a 2ª vez acha 0 e para).
DO $$
DECLARE
  c_motivo constant text := 'fora da vigência (fim 30/06/2027)';
  v_a uuid; v_b uuid; v_pa jsonb; v_pb jsonb; v_ra jsonb; v_rb jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('app.via', 'sr-fora-vigencia', true);
  SELECT id INTO v_a FROM public.financeiro_recorrencias WHERE id::text LIKE 'e10c9f7d%';
  SELECT id INTO v_b FROM public.financeiro_recorrencias WHERE id::text LIKE '0aed877c%';

  v_pa := public.fn_recorrencia_fora_da_vigencia(v_a, false, c_motivo, true);
  v_pb := public.fn_recorrencia_fora_da_vigencia(v_b, false, c_motivo, true);
  IF (v_pa ->> 'qtde') IS DISTINCT FROM '1' OR (v_pa -> 'cancela' -> 0 ->> 'id') IS DISTINCT FROM 'dcac275b-7e50-4e36-bc4f-0cf946240c78'
     OR (v_pa ->> 'soma')::numeric IS DISTINCT FROM 5740.23 OR jsonb_array_length(v_pa -> 'nao_mexe') <> 0
     OR (v_pb ->> 'qtde') IS DISTINCT FROM '1' OR (v_pb -> 'cancela' -> 0 ->> 'id') IS DISTINCT FROM '9e38ffc2-ae98-40af-878f-7c95a1db5541'
     OR (v_pb ->> 'soma')::numeric IS DISTINCT FROM 4612.76 OR jsonb_array_length(v_pb -> 'nao_mexe') <> 0 THEN
    RAISE EXCEPTION 'Santa Rita: a prévia mudou (% · %). Nada foi gravado.', v_pa, v_pb;
  END IF;

  v_ra := public.fn_recorrencia_fora_da_vigencia(v_a, false, c_motivo, false);
  v_rb := public.fn_recorrencia_fora_da_vigencia(v_b, false, c_motivo, false);
  IF (v_ra ->> 'qtde') IS DISTINCT FROM '1' OR (v_rb ->> 'qtde') IS DISTINCT FROM '1'
     OR (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE id IN ('dcac275b-7e50-4e36-bc4f-0cf946240c78', '9e38ffc2-ae98-40af-878f-7c95a1db5541')
           AND cancelado AND cancelado_motivo = c_motivo) <> 2
     OR (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE recorrencia_id IN (v_a, v_b) AND cancelado) <> 2
     OR (SELECT bool_and(ativo) FROM public.financeiro_recorrencias WHERE id IN (v_a, v_b)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Santa Rita: a conferência depois não bateu (% · %). Nada foi gravado.', v_ra, v_rb;
  END IF;
  RAISE NOTICE 'Santa Rita OK: 2 previstos de 07/2027 cancelados (R$ 10.352,99); as regras seguem ativas; nada mais tocado';
END $$;
