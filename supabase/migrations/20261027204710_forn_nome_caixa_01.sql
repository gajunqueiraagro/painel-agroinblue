-- FORN-NOME-CAIXA-01 (Gabriel, pedido de 19/10/2026; noite de 20/10/2026) — o nome do fornecedor gravado em maiúscula/minúscula padronizado,
-- por UMA funcao no banco, chamada pelo gatilho de gravacao de `financeiro_fornecedores` (tela, XML, importacao, "Sem cadastro" e mesclagem
-- passam por ela). Vale para razao social (`nome`), nome fantasia e contato.
--   · So' converte texto que chega TODO em maiusculas ou TODO em minusculas (contando so' as letras); caixa mista fica como foi digitada
--     ("AGROinBLUE", "iFood").
--   · Cada palavra: primeira letra maiuscula, o resto minusculo; acentos preservados.
--   · Minusculas no meio: de, da, do, das, dos, e, em, a, o, para (a primeira palavra sempre maiuscula).
--   · Siglas em maiusculo: ME, EPP, S.A., S/A, SA, as 27 UFs, palavra de ate' 4 letras SEM VOGAL (BG, MMM) e a lista extra
--     `_fn_nome_caixa_siglas()` (BRDE, BB, CPF, CNPJ, IE). Iniciais com ponto ("A.Z.A.") ficam em maiusculo.
--   · "LTDA" -> "Ltda", "EIRELI" -> "Eireli", "CIA" -> "Cia" (a regra de cada palavra).
--   · O prefixo "Pec.3M-" fica intocado (a regra vale para o resto).
--   · Escolha conservadora da noite (converte MENOS): algarismo romano (II, III, IV…) e palavra com algarismo (3M, P5A, BR163) ficam
--     em maiusculo, como vieram.
--   · O texto original, se mudou, vira apelido de busca do cadastro (`aliases`).
-- ⚠ NO UPDATE SO' CONVERTE QUANDO O CAMPO MUDA DE VALOR (escolha conservadora da noite): editar outro campo de um cadastro antigo nao reescreve
--   o nome dele. Os existentes so' mudam pela aplicacao `fn_fornecedor_nome_caixa_aplicar` (preparada, com trilha e desfazer — NAO aplicada).

CREATE OR REPLACE FUNCTION public._fn_nome_caixa_siglas()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$
  /* a lista extra, configuravel AQUI: siglas que nao se reconhecem pela regra (tem vogal) */
  SELECT ARRAY['BRDE','BB','CPF','CNPJ','IE','ME','EPP','SA','S.A.','S/A',
               'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
$f$;

CREATE OR REPLACE FUNCTION public._fn_nome_caixa(p_texto text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $f$
DECLARE v_pref text := ''; v_resto text; v_letras text; v_out text := ''; v_tok text; v_up text; v_primeira boolean := true; v_base text;
        v_low text; v_i int;
BEGIN
  IF p_texto IS NULL OR btrim(p_texto) = '' THEN RETURN p_texto; END IF;
  v_resto := p_texto;
  IF v_resto ~* '^\s*pec\.3m-' THEN
    v_pref := substring(v_resto FROM '^\s*[Pp][Ee][Cc]\.3[Mm]-');
    v_resto := substr(v_resto, length(v_pref) + 1);
  END IF;
  v_letras := regexp_replace(v_resto, '[^[:alpha:]]', '', 'g');
  IF v_letras = '' OR NOT (v_letras = upper(v_letras) OR v_letras = lower(v_letras)) THEN RETURN p_texto; END IF;
  /* fatias: palavras (sem espaco nem hifen) e separadores, na ordem */
  FOR v_tok IN SELECT m[1] FROM regexp_matches(v_resto, '([^[:space:]-]+|[[:space:]-]+)', 'g') m LOOP
    IF v_tok ~ '^[[:space:]-]+$' THEN v_out := v_out || v_tok; CONTINUE; END IF;
    v_up := upper(v_tok);
    v_base := regexp_replace(v_up, '[,;:()]+$', '');
    IF v_base = ANY (public._fn_nome_caixa_siglas())
       OR (length(regexp_replace(v_base, '[^[:alpha:]]', '', 'g')) BETWEEN 1 AND 4
           AND regexp_replace(v_base, '[^[:alpha:]]', '', 'g') !~ '[AEIOUÁÉÍÓÚÂÊÔÃÕÀY]')
       OR v_base ~ '^([[:alpha:]]\.)+[[:alpha:]]?\.?$'
       OR v_base ~ '^[IVX]{2,4}$'
       OR v_base ~ '[0-9]' THEN
      v_out := v_out || v_up;
    ELSIF NOT v_primeira AND lower(v_tok) = ANY (ARRAY['de','da','do','das','dos','e','em','a','o','para']) THEN
      v_out := v_out || lower(v_tok);
    ELSE
      /* a primeira LETRA maiuscula (pula pontuacao e digito do comeco: "(joao)" -> "(Joao)") */
      v_low := lower(v_tok);
      v_i := length(coalesce(substring(v_low FROM '^[^[:alpha:]]*'), ''));
      v_out := v_out || left(v_low, v_i) || upper(substr(v_low, v_i + 1, 1)) || substr(v_low, v_i + 2);
    END IF;
    v_primeira := false;
  END LOOP;
  RETURN v_pref || v_out;
END $f$;

-- O apelido: o texto original entra em `aliases` (jsonb array de texto) se mudou e ainda nao esta' la' (texto exato).
CREATE OR REPLACE FUNCTION public._fn_nome_caixa_apelido(p_aliases jsonb, p_original text, p_novo text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN p_original IS NULL OR btrim(p_original) = '' OR p_original IS NOT DISTINCT FROM p_novo THEN v.a
    WHEN v.a @> jsonb_build_array(p_original) THEN v.a
    ELSE v.a || jsonb_build_array(p_original) END
  FROM (SELECT CASE WHEN jsonb_typeof(p_aliases) = 'array' THEN p_aliases ELSE '[]'::jsonb END AS a) v
$f$;

-- O GATILHO: INSERT sempre; UPDATE so' no campo que mudou. Razao social e fantasia viram apelido; o contato nao (nao e' busca).
-- Quem ja' calculou os valores (a aplicacao e o desfazer abaixo) liga `app.nome_caixa_escritor` e o gatilho nao age.
CREATE OR REPLACE FUNCTION public._fn_fornecedor_nome_caixa_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v text; v_aliases jsonb := NEW.aliases; v_mudou boolean := false;
BEGIN
  IF current_setting('app.nome_caixa_escritor', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.nome IS DISTINCT FROM OLD.nome THEN
    v := public._fn_nome_caixa(NEW.nome);
    IF v IS DISTINCT FROM NEW.nome THEN
      v_aliases := public._fn_nome_caixa_apelido(v_aliases, NEW.nome, v); NEW.nome := v; v_mudou := true;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.nome_fantasia IS DISTINCT FROM OLD.nome_fantasia THEN
    v := public._fn_nome_caixa(NEW.nome_fantasia);
    IF v IS DISTINCT FROM NEW.nome_fantasia THEN
      v_aliases := public._fn_nome_caixa_apelido(v_aliases, NEW.nome_fantasia, v); NEW.nome_fantasia := v; v_mudou := true;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.contato_nome IS DISTINCT FROM OLD.contato_nome THEN
    NEW.contato_nome := public._fn_nome_caixa(NEW.contato_nome);
  END IF;
  IF v_mudou THEN
    NEW.aliases := v_aliases;
    /* o gatilho dos normalizados e' por coluna: UPDATE so' da fantasia nao o dispara. A conta dos dois aqui e' a dele. */
    NEW.nome_norm := public._fn_normalizar_texto(NEW.nome);
    NEW.aliases_norm := public._fn_fornecedor_aliases_norm(NEW.aliases);
  END IF;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS trg_aa_fornecedor_nome_caixa ON public.financeiro_fornecedores;
CREATE TRIGGER trg_aa_fornecedor_nome_caixa
  BEFORE INSERT OR UPDATE OF nome, nome_fantasia, contato_nome ON public.financeiro_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public._fn_fornecedor_nome_caixa_trg();

-- A APLICACAO NOS CADASTROS QUE JA' EXISTEM — PREPARADA, NAO EXECUTADA (a aplicacao e' do Gabriel, cliente a cliente).
CREATE TABLE IF NOT EXISTS public.fornecedor_nome_caixa_operacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  feita_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  feita_por uuid,
  itens jsonb NOT NULL,           -- [{id, antes {nome, nome_fantasia, contato_nome, aliases}, depois {...}}]
  desfeita_em timestamptz, desfeita_por uuid, desfeita_motivo text,
  CONSTRAINT fornecedor_nome_caixa_op_desfeita_chk CHECK ((desfeita_em IS NULL) = (desfeita_motivo IS NULL))
);
ALTER TABLE public.fornecedor_nome_caixa_operacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fornecedor_nome_caixa_op_select ON public.fornecedor_nome_caixa_operacoes;
CREATE POLICY fornecedor_nome_caixa_op_select ON public.fornecedor_nome_caixa_operacoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.fornecedor_nome_caixa_operacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fornecedor_nome_caixa_operacoes TO authenticated;

-- `fn_fornecedor_nome_caixa_aplicar(cliente, simular)`: todo cadastro do cliente cujo nome, fantasia ou contato mude pela regra.
-- Simulacao = gravacao (o mesmo caminho, desfeito por SQLSTATE 'NCSIM'). So' postgres / service_role (nenhuma tela chama).
CREATE OR REPLACE FUNCTION public.fn_fornecedor_nome_caixa_aplicar(p_cliente uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_itens jsonb; v_op uuid; v_ret jsonb;
BEGIN
  IF p_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente) THEN
    RAISE EXCEPTION 'Cliente nao encontrado. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id,
             'antes', jsonb_build_object('nome', x.nome, 'nome_fantasia', x.nome_fantasia, 'contato_nome', x.contato_nome, 'aliases', x.aliases),
             'depois', jsonb_build_object('nome', x.n_nome, 'nome_fantasia', x.n_fant, 'contato_nome', x.n_cont,
                         'aliases', public._fn_nome_caixa_apelido(public._fn_nome_caixa_apelido(x.aliases, x.nome, x.n_nome), x.nome_fantasia, x.n_fant)))
             ORDER BY x.nome, x.id), '[]'::jsonb)
      INTO v_itens
      FROM (SELECT f.id, f.nome, f.nome_fantasia, f.contato_nome, f.aliases,
                   public._fn_nome_caixa(f.nome) n_nome, public._fn_nome_caixa(f.nome_fantasia) n_fant, public._fn_nome_caixa(f.contato_nome) n_cont
              FROM financeiro_fornecedores f WHERE f.cliente_id = p_cliente) x
     WHERE x.n_nome IS DISTINCT FROM x.nome OR x.n_fant IS DISTINCT FROM x.nome_fantasia OR x.n_cont IS DISTINCT FROM x.contato_nome;

    INSERT INTO fornecedor_nome_caixa_operacoes (cliente_id, feita_por, itens) VALUES (p_cliente, auth.uid(), v_itens) RETURNING id INTO v_op;
    PERFORM set_config('app.nome_caixa_escritor', 'on', true);
    PERFORM set_config('app.motivo', 'nome padronizado em maiúscula/minúscula — FORN-NOME-CAIXA-01', true);
    UPDATE financeiro_fornecedores f
       SET nome = i->'depois'->>'nome', nome_fantasia = i->'depois'->>'nome_fantasia', contato_nome = i->'depois'->>'contato_nome',
           aliases = i->'depois'->'aliases', updated_at = now()
      FROM jsonb_array_elements(v_itens) i
     WHERE f.id = (i->>'id')::uuid AND f.cliente_id = p_cliente;
    PERFORM set_config('app.nome_caixa_escritor', 'off', true);
    v_ret := jsonb_build_object('operacao_id', v_op, 'simulado', p_simular, 'fornecedores', jsonb_array_length(v_itens),
      'nomes', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'nome' IS DISTINCT FROM i->'depois'->>'nome'),
      'fantasias', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'nome_fantasia' IS DISTINCT FROM i->'depois'->>'nome_fantasia'),
      'contatos', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'contato_nome' IS DISTINCT FROM i->'depois'->>'contato_nome'));
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'NCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'NCSIM' THEN
    v_ret := SQLERRM::jsonb || jsonb_build_object('operacao_id', NULL);
  END;
  RETURN v_ret;
END $f$;

-- `fn_fornecedor_nome_caixa_desfazer(operacao, motivo, simular)`: volta o cadastro que esta' exatamente como a aplicacao o deixou;
-- o que mudou depois fica (e e' contado). Motivo obrigatorio na gravacao.
CREATE OR REPLACE FUNCTION public.fn_fornecedor_nome_caixa_desfazer(p_operacao uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_op fornecedor_nome_caixa_operacoes%ROWTYPE; v_volta int := 0; v_fica int := 0; v_ret jsonb;
BEGIN
  SELECT * INTO v_op FROM fornecedor_nome_caixa_operacoes WHERE id = p_operacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao nao encontrada. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  IF v_op.desfeita_em IS NOT NULL THEN RAISE EXCEPTION 'Esta padronizacao ja foi desfeita. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  IF NOT p_simular AND coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  BEGIN
    PERFORM set_config('app.nome_caixa_escritor', 'on', true);
    PERFORM set_config('app.motivo', 'desfeita a padronizacao de nome: ' || coalesce(p_motivo, ''), true);
    WITH alvo AS (
      SELECT (i->>'id')::uuid id, i->'antes' a, i->'depois' d FROM jsonb_array_elements(v_op.itens) i
    ), volta AS (
      UPDATE financeiro_fornecedores f
         SET nome = alvo.a->>'nome', nome_fantasia = alvo.a->>'nome_fantasia', contato_nome = alvo.a->>'contato_nome', aliases = alvo.a->'aliases',
             updated_at = now()
        FROM alvo
       WHERE f.id = alvo.id AND f.cliente_id = v_op.cliente_id
         AND f.nome IS NOT DISTINCT FROM alvo.d->>'nome' AND f.nome_fantasia IS NOT DISTINCT FROM alvo.d->>'nome_fantasia'
         AND f.contato_nome IS NOT DISTINCT FROM alvo.d->>'contato_nome' AND f.aliases IS NOT DISTINCT FROM alvo.d->'aliases'
      RETURNING f.id)
    SELECT count(*) INTO v_volta FROM volta;
    PERFORM set_config('app.nome_caixa_escritor', 'off', true);
    v_fica := jsonb_array_length(v_op.itens) - v_volta;
    UPDATE fornecedor_nome_caixa_operacoes SET desfeita_em = clock_timestamp(), desfeita_por = auth.uid(), desfeita_motivo = coalesce(nullif(btrim(p_motivo), ''), 'simulacao')
     WHERE id = p_operacao;
    v_ret := jsonb_build_object('operacao_id', p_operacao, 'simulado', p_simular, 'voltaram', v_volta, 'ficaram', v_fica);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'NCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'NCSIM' THEN
    v_ret := SQLERRM::jsonb;
  END;
  RETURN v_ret;
END $f$;

REVOKE ALL ON FUNCTION public._fn_nome_caixa_siglas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_nome_caixa(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_nome_caixa_apelido(jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fornecedor_nome_caixa_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fornecedor_nome_caixa_aplicar(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fornecedor_nome_caixa_desfazer(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_nome_caixa_aplicar(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_nome_caixa_desfazer(uuid, text, boolean) TO service_role;
