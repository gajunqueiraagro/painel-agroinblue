-- FORN-FILIAL-01 (Gabriel, 21/10/2026 08h17 — junta o FORN-FILIAL-MESMO-NOME-01) — fornecedor com filiais.
-- REGRA: matriz e filiais tem a MESMA razao social; diferenciam-se pelo CNPJ (mesma raiz de 8 digitos) e pela cidade/UF.
--   (1) TRAVA DO DOCUMENTO NO BANCO: o CPF/CNPJ que ja' e' de OUTRO cadastro ATIVO (e nao mesclado) do MESMO cliente nao grava
--       ("Este CPF/CNPJ ja' e' de <nome> (ativo). Nada foi gravado.", 23505). Duas filiais (mesmo nome, CNPJ diferente) coexistem.
--       · CONSTRAINT TRIGGER adiado para o fim da transacao: o Mesclar e o desfazer mexem nos dois cadastros na mesma transacao e o
--         que vale e' o estado final (o absorvido ja' inativo); a linha e' relida no fim.
--       · So' GRAVACAO NOVA: INSERT, ou UPDATE que MUDA a chave do documento. O legado (1 grupo no proto, NJ, 2 ativos com o mesmo
--         documento) fica como esta' ate' alguem mexer no documento de um deles. Reativar um inativo nao passa por aqui (inativo nao
--         bloqueia — FORN-01b); a tela cobra o ativo.
--       · Chave = `_fn_fornecedor_chave_documento` (digitos e letras, a do validador unico); so' 11 ou 14 caracteres contam (CPF/CNPJ).
--   (2) BUSCA UNICA ACHA PELA CIDADE: `fn_fornecedor_buscar` casa tambem quando ALGUMA palavra do termo comeca uma palavra do
--       municipio/UF e TODAS comecam uma palavra da razao social, da fantasia ou da cidade ("zeta tres" acha a filial de Tres Lagoas; sem
--       palavra na cidade, nada muda). ESPELHO de `casaComOTermo`
--       (`src/lib/fornecedores/buscaDeFornecedor.ts`), presos pelo `buscaDeFornecedor.casos.json`.
SET LOCAL lock_timeout = '2s';

CREATE INDEX IF NOT EXISTS ix_financeiro_fornecedores_chave_documento
  ON public.financeiro_fornecedores (cliente_id, public._fn_fornecedor_chave_documento(cpf_cnpj));

CREATE OR REPLACE FUNCTION public._trg_fornecedor_documento_ativo_unico()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $f$
DECLARE r record; k text; v_outro text;
BEGIN
  SELECT f.id, f.cliente_id, f.cpf_cnpj, f.ativo, f.fundido_em_id INTO r FROM public.financeiro_fornecedores f WHERE f.id = NEW.id;
  IF r.id IS NULL OR NOT coalesce(r.ativo, true) OR r.fundido_em_id IS NOT NULL THEN RETURN NULL; END IF;
  k := public._fn_fornecedor_chave_documento(r.cpf_cnpj);
  IF k IS NULL OR length(k) NOT IN (11, 14) THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND k IS NOT DISTINCT FROM public._fn_fornecedor_chave_documento(OLD.cpf_cnpj) THEN RETURN NULL; END IF;
  SELECT f.nome INTO v_outro FROM public.financeiro_fornecedores f
   WHERE f.cliente_id = r.cliente_id AND f.id <> r.id AND coalesce(f.ativo, true) AND f.fundido_em_id IS NULL
     AND public._fn_fornecedor_chave_documento(f.cpf_cnpj) = k
   ORDER BY f.created_at, f.id LIMIT 1;
  IF v_outro IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = format('Este CPF/CNPJ já é de %s (ativo). Nada foi gravado.', v_outro);
  END IF;
  RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION public._trg_fornecedor_documento_ativo_unico() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fornecedor_documento_ativo_unico ON public.financeiro_fornecedores;
CREATE CONSTRAINT TRIGGER trg_fornecedor_documento_ativo_unico
  AFTER INSERT OR UPDATE OF cpf_cnpj ON public.financeiro_fornecedores
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public._trg_fornecedor_documento_ativo_unico();

CREATE OR REPLACE FUNCTION public.fn_fornecedor_buscar(p_cliente uuid, p_busca text, p_situacao text DEFAULT 'ativos',
  p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET plan_cache_mode = force_custom_plan AS $f$
DECLARE
  v_q text := coalesce(public._fn_normalizar_texto(p_busca), '');
  v_d text := public._fn_fornecedor_busca_digitos(p_busca);
  v_palavras text[] := array_remove(string_to_array(coalesce(public._fn_normalizar_texto(p_busca), ''), ' '), '');
  v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_situacao NOT IN ('ativos', 'inativos', 'todos') THEN
    RAISE EXCEPTION 'situacao invalida: %', p_situacao USING ERRCODE = '22023';
  END IF;
  WITH uso AS (
    SELECT l.favorecido_id id, count(*) n FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.favorecido_id IS NOT NULL GROUP BY l.favorecido_id
  ), p AS (
    SELECT f.*, coalesce(f.nome_norm, '') nn, coalesce(public._fn_normalizar_texto(f.nome_fantasia), '') fnn,
           coalesce(public._fn_normalizar_texto(concat_ws(' ', f.municipio, f.uf)), '') cn,
           public._fn_fornecedor_busca_doc(f.cpf_cnpj) dg, coalesce(f.aliases_norm, '{}'::text[]) al,
           (coalesce(f.ativo, true) AND f.fundido_em_id IS NULL) ativo_v, coalesce(u.n, 0) uso_n
      FROM public.financeiro_fornecedores f LEFT JOIN uso u ON u.id = f.id
     WHERE f.cliente_id = p_cliente
  ), c AS (
    SELECT p.*,
           (v_q <> '' AND (starts_with(p.nn, v_q) OR starts_with(p.fnn, v_q) OR (v_d IS NOT NULL AND starts_with(p.dg, v_d)))) comeca
      FROM p
     WHERE (p_situacao = 'todos' OR (p_situacao = 'ativos') = p.ativo_v)
       AND (v_q = ''
            OR strpos(p.nn, v_q) > 0 OR strpos(p.fnn, v_q) > 0
            OR EXISTS (SELECT 1 FROM unnest(p.al) a WHERE strpos(a, v_q) > 0)
            -- FORN-FILIAL-01: com a CIDADE — alguma palavra COMECA uma palavra da cidade e todas comecam uma da razao social, da fantasia
            -- ou da cidade ("zeta tres"; o "g" solto nao casa com "lagoas")
            OR (p.cn <> '' AND EXISTS (SELECT 1 FROM unnest(v_palavras) w WHERE strpos(' ' || p.cn, ' ' || w) > 0)
                AND NOT EXISTS (SELECT 1 FROM unnest(v_palavras) w WHERE strpos(' ' || p.nn || ' ' || p.fnn || ' ' || p.cn, ' ' || w) = 0))
            OR (v_d IS NOT NULL AND (strpos(p.dg, v_d) > 0
                OR EXISTS (SELECT 1 FROM unnest(p.al) a WHERE strpos(coalesce(public._fn_fornecedor_busca_digitos(a), ''), v_d) > 0))))
  ), o AS (
    SELECT c.*, row_number() OVER (ORDER BY c.ativo_v DESC, c.comeca DESC, c.uso_n DESC, c.nn COLLATE "C", c.id::text COLLATE "C") ord,
           count(*) OVER () total
      FROM c
  )
  SELECT jsonb_build_object(
           'total', coalesce(max(o.total), 0),
           'itens', coalesce(jsonb_agg(
             (to_jsonb(f) - 'aliases') || jsonb_build_object('uso', o.uso_n, 'ativo_de_verdade', o.ativo_v, 'dono_nome', d.nome)
             ORDER BY o.ord) FILTER (WHERE o.ord > coalesce(p_offset, 0)
                                       AND (p_limite IS NULL OR o.ord <= coalesce(p_offset, 0) + p_limite)), '[]'::jsonb))
    INTO v
    FROM o JOIN public.financeiro_fornecedores f ON f.id = o.id
    LEFT JOIN public.financeiro_fornecedores d ON d.id = o.fundido_em_id;
  RETURN v;
END $f$;
REVOKE ALL ON FUNCTION public.fn_fornecedor_buscar(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_buscar(uuid, text, text, integer, integer) TO authenticated, service_role;
