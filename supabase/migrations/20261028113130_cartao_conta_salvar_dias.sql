-- CARTAO-LANCAMENTO-01 — o escritor único do cadastro da conta (`fn_conta_bancaria_salvar`) passa a aceitar os dois dias do cartão
-- (`dia_fechamento`, 20261028113100; `dia_vencimento`, 20261028113120). Ele recusa chave fora da lista ("Campo desconhecido no cadastro
-- da conta"), então sem isto a tela não grava os dias. Só troca o CORPO (mesma assinatura, SECURITY INVOKER, search_path, ACL).
-- Patch guardado pelo md5 do corpo de hoje (c824863cc45106e399438035494f430a): 3 âncoras, cada uma casa exatamente 1 vez:
--   1. as chaves aceitas ganham 'dia_fechamento' e 'dia_vencimento';
--   2. dia fora de 1–31 (ou não inteiro) recusa com frase pronta, antes de gravar;
--   3. o UPDATE da conta existente grava os dois (vazio = nulo). A conta NOVA já os grava pelo `jsonb_populate_record` (vazio = nulo).
DO $mig$
DECLARE
  v_src text;
  v_novo text;
  v_a1 text := $a$'mes_inicio','saldo_inicial_oficial'];$a$;
  v_b1 text := $b$'mes_inicio','saldo_inicial_oficial','dia_fechamento','dia_vencimento'];$b$;
  v_a2 text := $a$  IF d ? 'consolida_em_conta_id' AND nullif(d->>'consolida_em_conta_id', '') IS NOT NULL AND NOT EXISTS ($a$;
  v_b2 text := $b$  -- CARTAO-LANCAMENTO-01: os dias do cartão, inteiros de 1 a 31 (vazio = nulo)
  IF d ? 'dia_fechamento' AND nullif(d->>'dia_fechamento', '') IS NOT NULL
     AND ((d->>'dia_fechamento') !~ '\A\d{1,2}\Z' OR (d->>'dia_fechamento')::int NOT BETWEEN 1 AND 31) THEN
    RAISE EXCEPTION 'Dia de fechamento inválido: use um dia de 1 a 31.' USING ERRCODE = '22023';
  END IF;
  IF d ? 'dia_vencimento' AND nullif(d->>'dia_vencimento', '') IS NOT NULL
     AND ((d->>'dia_vencimento') !~ '\A\d{1,2}\Z' OR (d->>'dia_vencimento')::int NOT BETWEEN 1 AND 31) THEN
    RAISE EXCEPTION 'Dia de vencimento inválido: use um dia de 1 a 31.' USING ERRCODE = '22023';
  END IF;
  IF d ? 'consolida_em_conta_id' AND nullif(d->>'consolida_em_conta_id', '') IS NOT NULL AND NOT EXISTS ($b$;
  v_a3 text := $a$saldo_inicial_oficial = CASE WHEN d ? 'saldo_inicial_oficial' THEN nullif(d->>'saldo_inicial_oficial', '')::numeric ELSE c.saldo_inicial_oficial END$a$;
  v_b3 text := $b$saldo_inicial_oficial = CASE WHEN d ? 'saldo_inicial_oficial' THEN nullif(d->>'saldo_inicial_oficial', '')::numeric ELSE c.saldo_inicial_oficial END,
    dia_fechamento = CASE WHEN d ? 'dia_fechamento' THEN nullif(d->>'dia_fechamento', '')::smallint ELSE c.dia_fechamento END,
    dia_vencimento = CASE WHEN d ? 'dia_vencimento' THEN nullif(d->>'dia_vencimento', '')::smallint ELSE c.dia_vencimento END$b$;
  n int;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.proname = 'fn_conta_bancaria_salvar' AND p.pronamespace = 'public'::regnamespace
     AND pg_get_function_identity_arguments(p.oid) = 'p_cliente_id uuid, p_conta_id uuid, p_dados jsonb';
  IF md5(v_src) <> 'c824863cc45106e399438035494f430a' THEN
    RAISE EXCEPTION 'fn_conta_bancaria_salvar mudou desde a prévia (md5 %): parar', md5(v_src);
  END IF;
  SELECT (length(v_src) - length(replace(v_src, v_a1, ''))) / length(v_a1) INTO n; IF n <> 1 THEN RAISE EXCEPTION 'âncora 1 casa % vezes', n; END IF;
  SELECT (length(v_src) - length(replace(v_src, v_a2, ''))) / length(v_a2) INTO n; IF n <> 1 THEN RAISE EXCEPTION 'âncora 2 casa % vezes', n; END IF;
  SELECT (length(v_src) - length(replace(v_src, v_a3, ''))) / length(v_a3) INTO n; IF n <> 1 THEN RAISE EXCEPTION 'âncora 3 casa % vezes', n; END IF;
  v_novo := replace(replace(replace(v_src, v_a1, v_b1), v_a2, v_b2), v_a3, v_b3);
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_conta_bancaria_salvar(p_cliente_id uuid, p_conta_id uuid, p_dados jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS %L$f$, v_novo);
END
$mig$;
