-- P167-B2 (OK do Gabriel 28/10/2026 19:4x: "B2 no banco: SIM, numa migration própria 113070, com REVOKE/GRANT regravados e teste de que a
-- assinatura antiga sumiu e o authenticated executa") — A SOMA DOS LANÇAMENTOS QUE RECEBEM A NOTA NUNCA PASSA DA NOTA. A NF 119.237 do NJ
-- (R$ 67.500) ficou ligada a 6 parcelas que somavam R$ 135.000 e a tela só dizia "falta R$ 67.500". A `fn_nota_completar` ganha
-- `p_valor_nota` (opcional): com ele, a soma do que FICA nos lançamentos do pedido > nota + R$ 0,01 = recusa com a frase, nada gravado.
-- Sem ele (o lote do P164, que junta notas diferentes num pedido por cliente), a função segue como era.
-- ⚠ ASSINATURA NOVA = DROP DA ANTIGA (aprovado pelo Gabriel; nenhuma função do banco chama a antiga — conferido 28/10; a tela e os lotes chamam
--   pelos nomes dos parâmetros, e o novo tem DEFAULT). O corpo é o de hoje (md5 medido, depois da 113060) com 3 trechos a mais; ACL regravada:
--   REVOKE de PUBLIC/anon, EXECUTE para authenticated.
SET LOCAL lock_timeout = '2s';

DO $$
DECLARE
  d text; n text;
  v_cab constant text := $a$p_simular boolean DEFAULT true)
 RETURNS jsonb$a$;
  v_cab_novo constant text := $a$p_simular boolean DEFAULT true, p_valor_nota numeric DEFAULT NULL::numeric)
 RETURNS jsonb$a$;
  v_var constant text := 'v_fin uuid; m text;';
  v_var_novo constant text := 'v_fin uuid; m text; v_soma numeric := 0;';
  v_laco constant text := $a$  END LOOP;

  /* P167 — UMA COMPRA SÓ$a$;
  v_laco_novo constant text := $a$    v_soma := v_soma + coalesce((v_fica->>'valor')::numeric, 0);
  END LOOP;

  /* P167-B2 — a soma do que FICA nos lançamentos do pedido nunca passa da nota (a NF 119.237 do NJ ligada a R$ 135.000 de parcelas) */
  IF p_valor_nota IS NOT NULL AND v_soma > p_valor_nota + 0.01 THEN
    v_recusas := v_recusas || jsonb_build_object('frase', format('Os lançamentos somam R$ %s, mais que a nota (R$ %s): a nota não cobre todos.',
      translate(to_char(v_soma, 'FM999,999,990.00'), ',.', '.,'), translate(to_char(p_valor_nota, 'FM999,999,990.00'), ',.', '.,')));
  END IF;

  /* P167 — UMA COMPRA SÓ$a$;
BEGIN
  d := pg_get_functiondef('public.fn_nota_completar(uuid,jsonb,boolean,text,boolean)'::regprocedure);
  IF md5(d) <> 'c74eb53e2e3c64c85d40a3510cd204ae' THEN
    RAISE EXCEPTION 'P167-B2: fn_nota_completar não é a medida (md5 %). Nada foi gravado.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, v_cab, ''))) / length(v_cab) <> 1
     OR (length(d) - length(replace(d, v_var, ''))) / length(v_var) <> 1
     OR (length(d) - length(replace(d, v_laco, ''))) / length(v_laco) <> 1 THEN
    RAISE EXCEPTION 'P167-B2: uma das âncoras não casa exatamente 1 vez. Nada foi gravado.';
  END IF;
  n := replace(replace(replace(d, v_cab, v_cab_novo), v_var, v_var_novo), v_laco, v_laco_novo);
  DROP FUNCTION public.fn_nota_completar(uuid, jsonb, boolean, text, boolean);
  EXECUTE n;
END $$;

REVOKE ALL ON FUNCTION public.fn_nota_completar(uuid, jsonb, boolean, text, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_completar(uuid, jsonb, boolean, text, boolean, numeric) TO authenticated;
