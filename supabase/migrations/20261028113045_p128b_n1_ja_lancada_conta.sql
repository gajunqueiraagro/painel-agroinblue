-- P128b-N1 (Gabriel 28/10/2026 16:04) — a parcela que FALTA nasce com a conta das irmãs quando todas têm a mesma; se divergem ou não têm,
-- "conta" entra no "Falta:" da prévia da nota. Caso que mediu: NJ, Alta Paulista NF 000.008.664 — a 4/4 criada pelo "criar a que falta"
-- nasceu com `conta_bancaria_id` nulo (a Conta da prévia começa "nenhuma" e não estava nas faltas).
-- Para a tela saber a conta das irmãs, `fn_nota_ja_lancada` devolve também `conta_bancaria_id` de cada achado (só leitura; nada mais muda).
-- ⚠ PATCH DE CORPO GRANDE GUARDADO POR md5 (a função tem 12.297 caracteres): se o corpo não for o medido, NADA muda. ACL igual (o
--   CREATE OR REPLACE a mantém: authenticated executa, PUBLIC/anon não).
DO $$
DECLARE
  d text;
  v_anc constant text := '''financiamento_id'', l.financiamento_id, ''numero_documento''';
  v_novo constant text := '''financiamento_id'', l.financiamento_id, ''conta_bancaria_id'', l.conta_bancaria_id, ''numero_documento''';
BEGIN
  d := pg_get_functiondef('public.fn_nota_ja_lancada(uuid,jsonb,text,text,text,text[],uuid)'::regprocedure);
  IF md5(d) <> '3aeba95b7410a9bae79e98a68370824d' THEN
    RAISE EXCEPTION 'P128b-N1: fn_nota_ja_lancada não é a medida (md5 %). Nada foi gravado.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, v_anc, ''))) / length(v_anc) <> 1 THEN
    RAISE EXCEPTION 'P128b-N1: a âncora não casa exatamente 1 vez. Nada foi gravado.';
  END IF;
  EXECUTE replace(d, v_anc, v_novo);
END $$;
