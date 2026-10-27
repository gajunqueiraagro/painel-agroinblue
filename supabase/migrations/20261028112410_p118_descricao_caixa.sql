-- P118 (Gabriel 27/10/2026, extensao do FORN-NOME-CAIXA-01) — DESCRICAO EM CAIXA ALTA VIRA PRIMEIRA MAIUSCULA, pela MESMA `_fn_nome_caixa`.
-- (a) A lista UNICA de siglas (fornecedor e produto) ganha: UN, IATF, PIX, UF, IRRF, INSS, CCIR, ITR, DARF, GTA, FGTS, NF, NFE, ICMS, CNH, CDI,
--     IOF, IPTU, IPVA, IRPJ, IRPF, FCO, DAEMS, SOS, ONU (Gabriel, sobre a amostra) e as unidades L, ML, KG, G, MG, CX, SC, FR, GL, LT, PC, M, M2, M3, DS, KM, HA (CNPJ, CPF e as 27 UFs ja' estavam). Palavra com
--     numero segue como veio (regra de antes).
-- (b) Conectivos minusculos NO MEIO (nem a primeira nem a ULTIMA palavra) e entre espacos: de, da, do, das, dos, e, em, com, para, a, o
--     ("com" entrou; a ultima palavra deixou de virar conectivo: "Vitamina A" nao vira "Vitamina a"). '/', '_' e '.' tambem separam palavras
--     ("FGTS/GRF", "INSS/FGTS-3M", "PIX_DEB" — antes a sigla grudada virava "Fgts/grf"; "INTEGR.CAPITAL" -> "Integr.Capital", Gabriel).
-- (c) `_fn_descricao_caixa(texto)`: so' o texto TODO em caixa alta passa pela `_fn_nome_caixa` (todo minusculo fica como esta' — o
--     fornecedor segue convertendo os dois, pela propria `_fn_nome_caixa`).
-- (d) Gatilho BEFORE INSERT OR UPDATE OF descricao em `financeiro_lancamentos_v2` e `nota_fiscal_itens` (`trg_00_descricao_caixa`: roda
--     antes do hash da importacao, que entao ja' ve o texto convertido — reimportar a mesma planilha da' o mesmo hash).
-- (e) `fn_parcelamento_propagar`: o nome novo da parcela passa pela mesma regra antes de comparar com o gravado (sem isso, compra com
--     descricao em caixa alta acusaria "nome mudou" em toda parcela ja' convertida). Patch guardado por md5.
-- Os registros antigos NAO mudam aqui (migration propria, depois do OK do Gabriel).
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_nome_caixa_siglas()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$
  /* a lista UNICA, configuravel AQUI (fornecedor e produto): siglas que nao se reconhecem pela regra (tem vogal), unidades e embalagens */
  SELECT ARRAY['BRDE','BB','CPF','CNPJ','IE','ME','EPP','SA','S.A.','S/A',
               'UN','IATF','PIX','UF','IRRF','INSS','CCIR','ITR','DARF','GTA','FGTS','NF','NFE','ICMS','CNH','CDI','IOF',
               'IPTU','IPVA','IRPJ','IRPF','FCO','DAEMS','SOS','ONU',
               'L','ML','KG','G','MG','CX','SC','FR','GL','LT','PC','M','M2','M3','DS','KM','HA',
               'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
$f$;

CREATE OR REPLACE FUNCTION public._fn_nome_caixa(p_texto text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $f$
DECLARE v_pref text := ''; v_resto text; v_letras text; v_out text := ''; v_tok text; v_up text; v_base text;
        v_low text; v_i int; v_toks text[]; v_k int; v_npal int; v_pal int := 0;
BEGIN
  IF p_texto IS NULL OR btrim(p_texto) = '' THEN RETURN p_texto; END IF;
  v_resto := p_texto;
  IF v_resto ~* '^\s*pec\.3m-' THEN
    v_pref := substring(v_resto FROM '^\s*[Pp][Ee][Cc]\.3[Mm]-');
    v_resto := substr(v_resto, length(v_pref) + 1);
  END IF;
  v_letras := regexp_replace(v_resto, '[^[:alpha:]]', '', 'g');
  IF v_letras = '' OR NOT (v_letras = upper(v_letras) OR v_letras = lower(v_letras)) THEN RETURN p_texto; END IF;
  /* fatias: palavras e separadores, na ordem. P118 — '/', '_' e '.' tambem separam ("FGTS/GRF", "PIX_DEB": cada pedaco pela regra); conta as
     palavras para saber qual e' a ULTIMA */
  SELECT array_agg(m[1] ORDER BY o) INTO v_toks FROM regexp_matches(v_resto, '([^[:space:]/_.-]+|[[:space:]/_.-]+)', 'g') WITH ORDINALITY AS r(m, o);
  SELECT count(*) INTO v_npal FROM unnest(v_toks) t WHERE t !~ '^[[:space:]/_.-]+$';
  FOR v_k IN 1..coalesce(array_length(v_toks, 1), 0) LOOP
    v_tok := v_toks[v_k];
    IF v_tok ~ '^[[:space:]/_.-]+$' THEN v_out := v_out || v_tok; CONTINUE; END IF;
    v_pal := v_pal + 1;
    v_up := upper(v_tok);
    v_base := regexp_replace(v_up, '[,;:()]+$', '');
    IF v_base = ANY (public._fn_nome_caixa_siglas())
       OR (length(regexp_replace(v_base, '[^[:alpha:]]', '', 'g')) BETWEEN 1 AND 4
           AND regexp_replace(v_base, '[^[:alpha:]]', '', 'g') !~ '[AEIOUÁÉÍÓÚÂÊÔÃÕÀY]')
       OR v_base ~ '^([[:alpha:]]\.)+[[:alpha:]]?\.?$'
       OR v_base ~ '^[IVX]{2,4}$'
       OR v_base ~ '[0-9]' THEN
      v_out := v_out || v_up;
    /* conectivo so' ENTRE ESPACOS ("S/A" nao vira "S/a") */
    ELSIF v_pal > 1 AND v_pal < v_npal AND v_k > 1 AND v_toks[v_k - 1] ~ '[[:space:]]'
          AND lower(v_tok) = ANY (ARRAY['de','da','do','das','dos','e','em','com','para','a','o']) THEN
      v_out := v_out || lower(v_tok);
    ELSE
      /* a primeira LETRA maiuscula (pula pontuacao e digito do comeco: "(joao)" -> "(Joao)") */
      v_low := lower(v_tok);
      v_i := length(coalesce(substring(v_low FROM '^[^[:alpha:]]*'), ''));
      v_out := v_out || left(v_low, v_i) || upper(substr(v_low, v_i + 1, 1)) || substr(v_low, v_i + 2);
    END IF;
  END LOOP;
  RETURN v_pref || v_out;
END $f$;

-- (c) so' o TODO em caixa alta (as letras; ao menos uma)
CREATE OR REPLACE FUNCTION public._fn_descricao_caixa(p_texto text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $f$
  SELECT CASE WHEN p_texto IS NOT NULL
               AND regexp_replace(p_texto, '[^[:alpha:]]', '', 'g') <> ''
               AND regexp_replace(p_texto, '[^[:alpha:]]', '', 'g') = upper(regexp_replace(p_texto, '[^[:alpha:]]', '', 'g'))
               AND regexp_replace(p_texto, '[^[:alpha:]]', '', 'g') <> lower(regexp_replace(p_texto, '[^[:alpha:]]', '', 'g'))
              THEN public._fn_nome_caixa(p_texto) ELSE p_texto END
$f$;
GRANT EXECUTE ON FUNCTION public._fn_descricao_caixa(text) TO authenticated;

-- (d) o gatilho: INSERT sempre; UPDATE so' quando a descricao muda (editar outro campo nao reescreve a descricao antiga)
CREATE OR REPLACE FUNCTION public._fn_descricao_caixa_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  /* quem ja' decidiu o texto (o DESFAZER da conversao dos antigos, que devolve o texto de antes) liga `app.descricao_caixa_escritor` */
  IF current_setting('app.descricao_caixa_escritor', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.descricao IS DISTINCT FROM OLD.descricao THEN
    NEW.descricao := public._fn_descricao_caixa(NEW.descricao);
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public._fn_descricao_caixa_trg() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_00_descricao_caixa
  BEFORE INSERT OR UPDATE OF descricao ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public._fn_descricao_caixa_trg();
CREATE OR REPLACE TRIGGER trg_00_descricao_caixa
  BEFORE INSERT OR UPDATE OF descricao ON public.nota_fiscal_itens
  FOR EACH ROW EXECUTE FUNCTION public._fn_descricao_caixa_trg();

-- (e) o nome novo da parcela pela mesma regra
CREATE OR REPLACE FUNCTION pg_temp._troca_texto(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (length(d) - length(replace(d, p_pares[3*i-2], ''))) / length(p_pares[3*i-2]);
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := replace(d, p_pares[3*i-2], p_pares[3*i-1]);
  END LOOP;
  EXECUTE d;
END $$;

SELECT pg_temp._troca_texto('public.fn_parcelamento_propagar(uuid,jsonb,text,boolean)', '2cc981d328c1e2a53dbd765fb3690d52', ARRAY[
  $p$v_novo_nome := public._fn_parcela_descricao(v_desc, r.numero_parcela, v_n);$p$,
  $r$v_novo_nome := public._fn_descricao_caixa(public._fn_parcela_descricao(v_desc, r.numero_parcela, v_n));  /* P118 */$r$, '1']);
