-- P174 NFSE-LEITURA-01 (Gabriel, 29/10/2026) — A CHAVE DE 50 DIGITOS DA NFS-e NACIONAL PASSA ONDE HOJE SO' PASSA A DE 44 (NF-e).
-- Decisoes do Gabriel (29/10): T1 o lancamento grava 'Nota Fiscal' para as duas (a chave de 50 diz que e' servico); T2 as retencoes vao
-- no `totais` (jsonb) da `nota_fiscal`, sem coluna nova, e o lancamento nasce com o LIQUIDO. Por isso aqui so' a CHAVE muda.
-- O QUE MUDA (nenhum dado; so' a regra da chave):
--   1. `nota_fiscal.chave_acesso`: o CHECK passa de `^[0-9]{44}$` a 44 OU 50 digitos.
--   2. `fn_nota_fiscal_gravar`: aceita a chave de 44 ou 50 (a frase da recusa diz as duas).
--   3. `fn_nota_ja_lancada`: o "ja' lancada pela chave" (3 lugares) vale tambem para a de 50.
--   4. `fin_documento_registrar`: a nota repetida pela chave, idem.
--   5. `fn_documento_chave_ja_registrada`: a chave de 50 e' conferida (hoje volta vazia sem olhar).
--   6. `fin_documento_confronto`: a chave da nota (o PDF + o XML = 1 nota) aceita 50; o CNPJ tirado da chave, quando o documento nao o
--      tem, sai da posicao certa de cada leiaute: 44 = posicoes 7-20 (como hoje); 50 = 10-23 (o CPF/CNPJ do prestador).
-- FICA COMO ESTA': `_oc_documento_nota_repetida` (a OC so' recebe NF-e).
-- ⚠ PATCH DE CORPO GUARDADO POR md5: se o corpo de uma funcao nao for o medido (29/10), ou uma ancora nao casar o numero de vezes
--   esperado, NADA muda (a migration aborta inteira). As funcoes seguem SECURITY DEFINER, com os mesmos donos e permissoes
--   (CREATE OR REPLACE pelo proprio `pg_get_functiondef`).
-- GESTO CONTRARIO (so' enquanto nao houver nota de 50 gravada): os mesmos `replace` ao contrario em cada funcao e o CHECK de volta a
--   `^[0-9]{44}$`.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- ── 1. o CHECK ──
ALTER TABLE public.nota_fiscal DROP CONSTRAINT nota_fiscal_chave_acesso_check;
ALTER TABLE public.nota_fiscal ADD CONSTRAINT nota_fiscal_chave_acesso_check CHECK (chave_acesso ~ '^([0-9]{44}|[0-9]{50})$');

-- a troca exata: a ancora tem de casar `vezes` vezes
CREATE FUNCTION pg_temp._p174_trocar(d text, de text, para text, vezes int, rotulo text) RETURNS text LANGUAGE plpgsql AS $f$
begin
  if (length(d) - length(replace(d, de, ''))) / length(de) <> vezes then
    raise exception 'P174: % — a ancora «%» nao casa % vez(es). Nada foi gravado.', rotulo, de, vezes;
  end if;
  return replace(d, de, para);
end $f$;

DO $$
DECLARE
  d text; i int; pre text; pos text;
  esperado constant jsonb := jsonb_build_object(
    'fn_nota_fiscal_gravar', 'a84e6b408933e3a54c1171e0f58718a9', 'fn_nota_ja_lancada', 'be6a2be5d5fe29e46002cc1d4827d7f2',
    'fin_documento_registrar', '36003a998ba800a9589844a9e9007949', 'fn_documento_chave_ja_registrada', '370d1dde1ceac008c0baa52c18a6b111',
    'fin_documento_confronto', 'e8e50504fb8d888b19b0065d585c0486');
  f text;
BEGIN
  FOR f IN SELECT jsonb_object_keys(esperado) LOOP
    d := pg_get_functiondef(('public.' || f)::regproc);
    IF md5(d) <> esperado->>f THEN RAISE EXCEPTION 'P174: % nao e'' a medida (md5 %). Nada foi gravado.', f, md5(d); END IF;
  END LOOP;

  -- ── 2. fn_nota_fiscal_gravar ──
  d := pg_get_functiondef('public.fn_nota_fiscal_gravar'::regproc);
  d := pg_temp._p174_trocar(d, $a$v_chave !~ '^[0-9]{44}$'$a$, $a$v_chave !~ '^([0-9]{44}|[0-9]{50})$'$a$, 1, 'fn_nota_fiscal_gravar');
  d := pg_temp._p174_trocar(d, 'Nota sem chave de acesso de 44 dígitos. Nada foi gravado.',
                               'Nota sem chave de acesso de 44 dígitos (NF-e) ou 50 (NFS-e). Nada foi gravado.', 1, 'fn_nota_fiscal_gravar');
  EXECUTE d;

  -- ── 3. fn_nota_ja_lancada ──
  d := pg_get_functiondef('public.fn_nota_ja_lancada'::regproc);
  EXECUTE pg_temp._p174_trocar(d, 'length(v_chave) = 44', 'length(v_chave) IN (44, 50)', 3, 'fn_nota_ja_lancada');

  -- ── 4. fin_documento_registrar ──
  d := pg_get_functiondef('public.fin_documento_registrar'::regproc);
  EXECUTE pg_temp._p174_trocar(d, $a$'g')) = 44$a$, $a$'g')) IN (44, 50)$a$, 1, 'fin_documento_registrar');

  -- ── 5. fn_documento_chave_ja_registrada ──
  d := pg_get_functiondef('public.fn_documento_chave_ja_registrada'::regproc);
  EXECUTE pg_temp._p174_trocar(d, 'IF length(v_chave) <> 44 THEN', 'IF length(v_chave) NOT IN (44, 50) THEN', 1, 'fn_documento_chave_ja_registrada');

  -- ── 6. fin_documento_confronto: antes de "END AS chave," a chave (44 ou 50); depois, o CNPJ pela chave de cada leiaute ──
  d := pg_get_functiondef('public.fin_documento_confronto'::regproc);
  IF (length(d) - length(replace(d, ' END AS chave,', ''))) / length(' END AS chave,') <> 1 THEN
    RAISE EXCEPTION 'P174: fin_documento_confronto — «END AS chave,» nao casa 1 vez. Nada foi gravado.';
  END IF;
  i := strpos(d, ' END AS chave,');
  pre := left(d, i - 1);
  pos := substr(d, i);
  pre := pg_temp._p174_trocar(pre, $a$'g')) = 44$a$, $a$'g')) IN (44, 50)$a$, 1, 'fin_documento_confronto (chave)');
  pos := pg_temp._p174_trocar(pos, $a$'g'), 7, 14) END) AS cnpj$a$,
    $a$'g'), 7, 14) WHEN length(regexp_replace(coalesce(v.chave_acesso, ''), '\D', '', 'g')) = 50 THEN substr(regexp_replace(v.chave_acesso, '\D', '', 'g'), 10, 14) END) AS cnpj$a$,
    1, 'fin_documento_confronto (cnpj)');
  EXECUTE pre || pos;
END $$;

DROP FUNCTION pg_temp._p174_trocar(text, text, text, int, text);

-- ── guarda de destino: o CHECK novo, nenhum "44 so'" sobrando nas cinco, todas SECURITY DEFINER e fechadas para anon ──
DO $d$
DECLARE r record;
BEGIN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.nota_fiscal'::regclass AND conname = 'nota_fiscal_chave_acesso_check')
     <> $c$CHECK ((chave_acesso ~ '^([0-9]{44}|[0-9]{50})$'::text))$c$ THEN
    RAISE EXCEPTION 'P174: o CHECK da chave nao ficou como esperado.';
  END IF;
  FOR r IN SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS d, p.prosecdef FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('fn_nota_fiscal_gravar', 'fn_nota_ja_lancada', 'fin_documento_registrar', 'fn_documento_chave_ja_registrada', 'fin_documento_confronto') LOOP
    IF NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE') THEN RAISE EXCEPTION 'P174: % perdeu SECURITY DEFINER ou abriu para anon.', r.proname; END IF;
    IF r.d ~ $x$(length\(v_chave\) (=|<>) 44|'g'\)\) = 44\s+THEN regexp_replace|\{44\}\$')$x$ THEN RAISE EXCEPTION 'P174: % ainda so'' aceita 44.', r.proname; END IF;
    IF r.d !~ '50' THEN RAISE EXCEPTION 'P174: % nao recebeu a chave de 50.', r.proname; END IF;
  END LOOP;
END
$d$;
