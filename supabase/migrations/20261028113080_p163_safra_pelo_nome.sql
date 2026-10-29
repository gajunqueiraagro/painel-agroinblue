-- P163 (o caso da Vera, NF 31776; Gabriel 28/10: "datas dd/mm/aaaa, safra pelo nome") — a prévia "Como vai ficar" mostrava a safra pelo
-- CÓDIGO ("26/27-Pec"); passa a mostrar o NOME do cadastro (todas as 47 safras do proto têm nome; sem nome, o código). Só a leitura do nome
-- muda: `_fn_nota_completar_nome` (o nome de cada valor na prévia da `fn_nota_completar`); nada é gravado por ela. A data em dd/mm/aaaa é da tela.
-- ⚠ GUARDA: o corpo de hoje tem de ser o da 113040 (md5 medido); se não for, NADA muda. ACL igual (interna: só postgres/service_role).
SET LOCAL lock_timeout = '2s';
DO $$
DECLARE
  d text;
  v_anc constant text := $a$WHEN 'safra_id' THEN (SELECT codigo FROM financeiro_safras WHERE id::text = p_valor)$a$;
  v_novo constant text := $a$WHEN 'safra_id' THEN (SELECT coalesce(nullif(btrim(nome), ''), codigo) FROM financeiro_safras WHERE id::text = p_valor)$a$;
BEGIN
  d := pg_get_functiondef('public._fn_nota_completar_nome(text,text)'::regprocedure);
  IF md5(d) <> 'c83b32e388d338508beeed4f8b86d5d1' THEN
    RAISE EXCEPTION 'P163: _fn_nota_completar_nome não é a medida (md5 %). Nada foi gravado.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, v_anc, ''))) / length(v_anc) <> 1 THEN
    RAISE EXCEPTION 'P163: a âncora da safra não casa exatamente 1 vez. Nada foi gravado.';
  END IF;
  EXECUTE replace(d, v_anc, v_novo);
END $$;
