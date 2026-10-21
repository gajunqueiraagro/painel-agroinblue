-- FORN-SEM-CADASTRO-01 (Gabriel, mock "Fornecedores sem cadastro" de 19/10/2026; noite de 20/10/2026) — a aba "Sem cadastro" de
-- Cadastros › Fornecedores tem UM dono no banco: a leitura, o ligar (simulacao = gravacao, trilha com o antes de cada lancamento,
-- operacao com id), o desfazer e a lista das ligacoes recentes. Substitui a aba "Pendentes", que lia na tela (PostgREST, ate' 1.000
-- linhas, cancelados inclusive), ligava so' os 50 primeiros ids do grupo por UPDATE direto e criava cadastro com o nome da descricao.
--
-- O TEXTO DO GRUPO: o lancamento NAO guarda o fornecedor escrito (nao ha' coluna; o importador antigo cria o cadastro, e a linha sem
-- fornecedor chega vazia). O texto e', nesta ordem: o "Fornecedor" da planilha do Enriquecer casada com o lancamento (staging mais
-- recente, `excel_fornecedor`) — origem 'planilha' —, senao a DESCRICAO do lancamento — origem 'descricao' (o que a aba antiga
-- agrupava). Normalizacao = a da busca unica (`_fn_normalizar_texto`).
-- ENTRAM: lancamentos vivos do cliente sem fornecedor, fora transferencia ('3-'), fora o que e' de contrato (`financiamento_id`) e
-- fora titulo com parte viva de OC (o dono deles escreve o favorecido).
--
-- SUGESTAO (uma por texto, a primeira que achar, sempre do MESMO lado do rateio "Pec.3M-" e so' cadastro ativo e nao mesclado):
--   'ja_ligado'  — o mesmo texto ja' esta' em lancamentos COM fornecedor: o fornecedor mais frequente deles;
--   'nome_igual' — o texto = razao social, fantasia ou apelido de busca de um cadastro;
--   'parecido'   — o criterio de nome parecido do FORN-MESCLAR-02d (ESPELHO DECLARADO de `fn_fornecedor_repetidos`: quem mexer
--                  num confere o outro): chave sem pontuacao, "(001)", sufixo societario e "Pec.3M-"; palavras significativas (mais
--                  de 2 letras, sem digito, fora filial/unidade/matriz/loja/sede); nunca as mesmas palavras; contidas com 2+ ou
--                  trigrama >= 0,75 com a primeira palavra parecida (>= 0,4).
--
-- LIGAR NUNCA APAGA O TEXTO: so' `favorecido_id` muda (sob `app.propagando_plano`, a marca da mesclagem: nao vira "editado
-- manualmente"); o texto entra como apelido de busca do cadastro (se ainda nao for). O desfazer devolve `favorecido_id` nulo SO' aos
-- lancamentos que ainda apontam para o cadastro da operacao e tira o apelido que ela pos; cadastro criado na operacao e sem uso pode
-- sair de uso junto (pelo dono `fn_fornecedor_excluir`).

-- ── a chave comparavel e as palavras significativas (espelho do 02d) ──
CREATE OR REPLACE FUNCTION public._fn_fornecedor_chave_comparavel(p_texto text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT btrim(regexp_replace(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           coalesce(public._fn_normalizar_texto(p_texto), ''),
           '\(\s*\d+\s*\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'),
           '\m(s a|sa|ltda|me|epp|eireli|cia|companhia)\M', ' ', 'g'), '\s+', ' ', 'g')), '^pec 3m( |$)', ''))
$f$;
CREATE OR REPLACE FUNCTION public._fn_fornecedor_palavras_sig(p_chave text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$
  SELECT coalesce(ARRAY(SELECT w FROM unnest(string_to_array(coalesce(p_chave, ''), ' ')) WITH ORDINALITY u(w, o)
                         WHERE length(w) > 2 AND w !~ '[0-9]' AND w <> ALL ('{filial,unidade,matriz,loja,sede}'::text[]) ORDER BY o),
                  '{}'::text[])
$f$;
CREATE OR REPLACE FUNCTION public._fn_fornecedor_parecido(a text, b text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $f$
  WITH x AS (SELECT a ca, b cb, public._fn_fornecedor_palavras_sig(a) sa, public._fn_fornecedor_palavras_sig(b) sb)
  SELECT coalesce(ca <> '' AND cb <> '' AND ca <> cb AND cardinality(sa) > 0 AND cardinality(sb) > 0 AND NOT (sa @> sb AND sa <@ sb)
         AND ((cardinality(sa) >= 2 AND sa <@ sb) OR (cardinality(sb) >= 2 AND sb <@ sa)
              OR (public.similarity(ca, cb) >= 0.75 AND public.similarity(split_part(ca, ' ', 1), split_part(cb, ' ', 1)) >= 0.4)), false)
    FROM x
$f$;

-- ── a base: um texto por lancamento sem fornecedor ──
CREATE OR REPLACE FUNCTION public._fn_sem_cadastro_base(p_cliente uuid)
RETURNS TABLE(lancamento_id uuid, texto text, chave text, origem text, valor numeric, data date, descricao text, fazenda_id uuid,
              status text, rateio boolean)
LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT l.id, t.texto, public._fn_normalizar_texto(t.texto), t.origem, abs(l.valor),
         coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia), l.descricao, l.fazenda_id, l.status_transacao,
         (t.texto ~* '^\s*pec\.3m-')
    FROM public.financeiro_lancamentos_v2 l
    LEFT JOIN LATERAL (SELECT btrim(s.excel_fornecedor) txt FROM public.financeiro_classificacao_staging s
                        WHERE s.match_lancamento_id = l.id AND nullif(btrim(s.excel_fornecedor), '') IS NOT NULL
                          AND btrim(s.excel_fornecedor) <> '-'
                        ORDER BY s.created_at DESC LIMIT 1) p ON true
    CROSS JOIN LATERAL (SELECT coalesce(p.txt, btrim(l.descricao)) texto, CASE WHEN p.txt IS NOT NULL THEN 'planilha' ELSE 'descricao' END origem) t
   WHERE l.cliente_id = p_cliente AND l.favorecido_id IS NULL AND l.cancelado IS NOT TRUE
     AND coalesce(l.tipo_operacao, '') NOT LIKE '3-%' AND l.financiamento_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes z WHERE z.financeiro_lancamento_id = l.id AND z.cancelada = false)
     AND public._fn_normalizar_texto(t.texto) IS NOT NULL
$f$;

-- ── a leitura da aba ──
CREATE OR REPLACE FUNCTION public.fn_fornecedor_sem_cadastro(p_cliente uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET plan_cache_mode = force_custom_plan AS $f$
DECLARE v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  WITH b AS MATERIALIZED (SELECT * FROM public._fn_sem_cadastro_base(p_cliente)),
  g AS MATERIALIZED (
    SELECT b.chave, b.rateio,
           (array_agg(b.texto ORDER BY b.data DESC NULLS LAST, b.lancamento_id))[1] texto,
           (array_agg(b.origem ORDER BY b.origem DESC))[1] origem,
           count(*) qtd, sum(b.valor) valor, max(b.data) ultimo,
           public._fn_fornecedor_chave_comparavel(b.chave) cmp
      FROM b GROUP BY b.chave, b.rateio),
  /* os cadastros que podem ser destino: ativos e nao mesclados, com as chaves de comparacao calculadas UMA vez */
  forn AS MATERIALIZED (
    SELECT f.id, f.nome, f.cpf_cnpj, f.created_at, (f.nome ~* '^\s*pec\.3m-') rateio, f.nome_norm,
           public._fn_normalizar_texto(f.nome_fantasia) fant_norm, coalesce(f.aliases_norm, '{}'::text[]) aliases_norm,
           public._fn_fornecedor_chave_comparavel(f.nome) cmp
      FROM public.financeiro_fornecedores f
     WHERE f.cliente_id = p_cliente AND coalesce(f.ativo, true) AND f.fundido_em_id IS NULL),
  /* 'ja_ligado': o mesmo texto (a descricao normalizada) em lancamentos COM fornecedor — o mais frequente, do mesmo lado do rateio */
  lig AS (
    SELECT DISTINCT ON (k.chave, k.rateio) k.chave, k.rateio, k.fid
      FROM (SELECT public._fn_normalizar_texto(l.descricao) chave, fo.rateio, fo.id fid, count(*) n
              FROM public.financeiro_lancamentos_v2 l JOIN forn fo ON fo.id = l.favorecido_id
             WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE
             GROUP BY 1, 2, 3) k
      JOIN g ON g.chave = k.chave AND g.rateio = k.rateio
     ORDER BY k.chave, k.rateio, k.n DESC, k.fid),
  /* 'nome_igual': razao social, fantasia ou apelido de busca = o texto */
  igual AS (
    SELECT DISTINCT ON (g.chave, g.rateio) g.chave, g.rateio, fo.id fid
      FROM g JOIN forn fo ON fo.rateio = g.rateio AND (fo.nome_norm = g.chave OR fo.fant_norm = g.chave OR g.chave = ANY (fo.aliases_norm))
     ORDER BY g.chave, g.rateio, fo.created_at, fo.id),
  /* 'parecido': so' compara quem divide uma palavra significativa */
  gw AS (SELECT DISTINCT g.chave, g.rateio, w FROM g, unnest(public._fn_fornecedor_palavras_sig(g.cmp)) w),
  fw AS (SELECT DISTINCT fo.id, fo.rateio, w FROM forn fo, unnest(public._fn_fornecedor_palavras_sig(fo.cmp)) w),
  par AS (
    SELECT DISTINCT ON (g.chave, g.rateio) g.chave, g.rateio, fo.id fid
      FROM (SELECT DISTINCT gw.chave, gw.rateio, fw.id FROM gw JOIN fw ON fw.w = gw.w AND fw.rateio = gw.rateio) c
      JOIN g ON g.chave = c.chave AND g.rateio = c.rateio JOIN forn fo ON fo.id = c.id
     WHERE public._fn_fornecedor_parecido(g.cmp, fo.cmp)
     ORDER BY g.chave, g.rateio, public.similarity(g.cmp, fo.cmp) DESC, fo.created_at, fo.id),
  s AS (
    SELECT g.*, (SELECT jsonb_build_object('fornecedor_id', fo.id, 'nome', fo.nome, 'documento', fo.cpf_cnpj, 'motivo', x.motivo)
                   FROM (SELECT coalesce(lig.fid, igual.fid, par.fid) fid,
                                CASE WHEN lig.fid IS NOT NULL THEN 'ja_ligado' WHEN igual.fid IS NOT NULL THEN 'nome_igual'
                                     WHEN par.fid IS NOT NULL THEN 'parecido' END motivo) x
                   JOIN forn fo ON fo.id = x.fid) sugestao
      FROM g
      LEFT JOIN lig ON lig.chave = g.chave AND lig.rateio = g.rateio
      LEFT JOIN igual ON igual.chave = g.chave AND igual.rateio = g.rateio
      LEFT JOIN par ON par.chave = g.chave AND par.rateio = g.rateio),
  l AS (SELECT b.chave, b.rateio, jsonb_agg(jsonb_build_object('id', b.lancamento_id, 'descricao', b.descricao, 'data', b.data,
                 'valor', b.valor, 'fazenda_id', b.fazenda_id, 'status', b.status) ORDER BY b.data DESC NULLS LAST, b.lancamento_id) lancs
          FROM b GROUP BY b.chave, b.rateio)
  SELECT jsonb_build_object(
           'textos', coalesce(jsonb_agg(jsonb_build_object('chave', s.chave, 'texto', s.texto, 'origem', s.origem, 'rateio', s.rateio,
                       'qtd', s.qtd, 'valor', round(s.valor, 2), 'ultimo', s.ultimo, 'sugestao', s.sugestao, 'lancamentos', l.lancs)
                       ORDER BY s.qtd DESC, s.valor DESC, s.chave), '[]'::jsonb),
           'total', jsonb_build_object('textos', count(*), 'lancamentos', coalesce(sum(s.qtd), 0), 'valor', round(coalesce(sum(s.valor), 0), 2)),
           'com_sugestao', count(*) FILTER (WHERE s.sugestao IS NOT NULL),
           'sem_sugestao', count(*) FILTER (WHERE s.sugestao IS NULL))
    INTO v
    FROM s JOIN l ON l.chave = s.chave AND l.rateio = s.rateio;
  RETURN v;
END $f$;

-- ── a trilha das ligacoes ──
CREATE TABLE IF NOT EXISTS public.fornecedor_sem_cadastro_operacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  chave text NOT NULL,
  texto text NOT NULL,
  rateio boolean NOT NULL DEFAULT false,
  fornecedor_id uuid NOT NULL REFERENCES public.financeiro_fornecedores(id),
  fornecedor_criado boolean NOT NULL DEFAULT false,
  apelido_acrescentado text,
  lancamentos jsonb NOT NULL,
  feita_em timestamptz NOT NULL DEFAULT now(),
  feita_por uuid DEFAULT auth.uid(),
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeita_motivo text,
  CONSTRAINT fsc_desfeita_coerente CHECK ((desfeita_em IS NULL) = (desfeita_motivo IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_fsc_operacoes_cliente ON public.fornecedor_sem_cadastro_operacoes (cliente_id, feita_em DESC);
ALTER TABLE public.fornecedor_sem_cadastro_operacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fsc_operacoes_select_tenant ON public.fornecedor_sem_cadastro_operacoes;
CREATE POLICY fsc_operacoes_select_tenant ON public.fornecedor_sem_cadastro_operacoes FOR SELECT USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.fornecedor_sem_cadastro_operacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fornecedor_sem_cadastro_operacoes TO authenticated;
GRANT ALL ON public.fornecedor_sem_cadastro_operacoes TO service_role;

-- ── ligar ──
CREATE OR REPLACE FUNCTION public.fn_fornecedor_sem_cadastro_ligar(p_cliente uuid, p_chave text, p_rateio boolean, p_fornecedor_id uuid,
  p_fornecedor_criado boolean DEFAULT false, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_f record; v_texto text; v_ids uuid[]; v_lancs jsonb; v_rec_m text; v_rec_f text; v_ret jsonb; v_op uuid; v_apelido text;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  SELECT id, cliente_id, nome, ativo, fundido_em_id, nome_norm, aliases, aliases_norm INTO v_f
    FROM public.financeiro_fornecedores WHERE id = p_fornecedor_id;
  SELECT array_agg(b.lancamento_id ORDER BY b.lancamento_id),
         (array_agg(b.texto ORDER BY b.data DESC NULLS LAST, b.lancamento_id))[1],
         jsonb_agg(jsonb_build_object('id', l.id, 'favorecido_antes', l.favorecido_id, 'editado_manual_antes', l.editado_manual,
                                      'updated_at_antes', l.updated_at) ORDER BY l.id)
    INTO v_ids, v_texto, v_lancs
    FROM public._fn_sem_cadastro_base(p_cliente) b JOIN public.financeiro_lancamentos_v2 l ON l.id = b.lancamento_id
   WHERE b.chave = p_chave AND b.rateio = coalesce(p_rateio, false);

  IF v_f.id IS NULL OR v_f.cliente_id IS DISTINCT FROM p_cliente THEN
    v_rec_m := 'destino_invalido'; v_rec_f := 'O cadastro escolhido não é deste cliente.';
  ELSIF v_f.fundido_em_id IS NOT NULL OR v_f.ativo IS FALSE THEN
    v_rec_m := 'destino_inativo'; v_rec_f := format('"%s" está fora de uso (inativo ou mesclado): escolha um cadastro ativo.', v_f.nome);
  ELSIF v_ids IS NULL THEN
    v_rec_m := 'nada_a_ligar'; v_rec_f := 'Nenhum lançamento sem cadastro com este texto (outra tela já pode ter ligado).';
  ELSIF (v_f.nome ~* '^\s*pec\.3m-') <> coalesce(p_rateio, false) THEN
    v_rec_m := 'rateio_misto';
    v_rec_f := format('"%s" e "%s" não se ligam: "Pec.3M-" marca o pagamento por rateio (nota em nome do Higino); os dois lados ficam separados.',
                      v_texto, v_f.nome);
  END IF;
  IF v_rec_m IS NOT NULL THEN
    IF p_simular THEN
      RETURN jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', v_rec_m, 'frase', v_rec_f));
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_rec_f || ' Nada foi gravado.';
  END IF;

  BEGIN
    PERFORM set_config('app.propagando_plano', 'on', true);
    PERFORM set_config('app.motivo', 'ligado pela aba Sem cadastro: ' || v_texto, true);
    UPDATE public.financeiro_lancamentos_v2 SET favorecido_id = p_fornecedor_id WHERE id = ANY (v_ids) AND favorecido_id IS NULL;
    PERFORM set_config('app.propagando_plano', 'off', true);
    -- o texto vira apelido de busca do cadastro (o nome normalizado e os apelidos que ja' existem nao se repetem)
    IF public._fn_normalizar_texto(v_texto) IS DISTINCT FROM v_f.nome_norm
       AND NOT (public._fn_normalizar_texto(v_texto) = ANY (coalesce(v_f.aliases_norm, '{}'::text[]))) THEN
      v_apelido := v_texto;
      UPDATE public.financeiro_fornecedores
         SET aliases = (CASE WHEN jsonb_typeof(aliases) = 'array' THEN aliases ELSE '[]'::jsonb END) || to_jsonb(v_texto)
       WHERE id = p_fornecedor_id;
    END IF;
    INSERT INTO public.fornecedor_sem_cadastro_operacoes (cliente_id, chave, texto, rateio, fornecedor_id, fornecedor_criado,
                                                         apelido_acrescentado, lancamentos)
    VALUES (p_cliente, p_chave, v_texto, coalesce(p_rateio, false), p_fornecedor_id, coalesce(p_fornecedor_criado, false), v_apelido, v_lancs)
    RETURNING id INTO v_op;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'operacao_id', CASE WHEN p_simular THEN NULL ELSE v_op END,
               'texto', v_texto, 'fornecedor', jsonb_build_object('id', v_f.id, 'nome', v_f.nome),
               'lancamentos', cardinality(v_ids), 'apelido_acrescentado', v_apelido);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'SCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN sqlstate 'SCSIM' THEN
    RETURN sqlerrm::jsonb;
  END;
  RETURN v_ret;
END $f$;

-- ── desfazer ──
CREATE OR REPLACE FUNCTION public.fn_fornecedor_sem_cadastro_desfazer(p_operacao_id uuid, p_motivo text,
  p_inativar_criado boolean DEFAULT false, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_op record; v_rec_m text; v_rec_f text; v_volta uuid[]; v_ficam int; v_ret jsonb; v_uso jsonb; v_pode boolean; v_inativou boolean := false;
        v_exc jsonb;
BEGIN
  SELECT * INTO v_op FROM public.fornecedor_sem_cadastro_operacoes WHERE id = p_operacao_id;
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_op.cliente_id]);
  IF v_op.desfeita_em IS NOT NULL THEN
    v_rec_m := 'ja_desfeita'; v_rec_f := 'Esta ligação já foi desfeita.';
  ELSIF NOT p_simular AND nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    v_rec_m := 'sem_motivo'; v_rec_f := 'Informe o motivo para desfazer.';
  END IF;
  IF v_rec_m IS NOT NULL THEN
    IF p_simular THEN
      RETURN jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', v_rec_m, 'frase', v_rec_f));
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_rec_f || ' Nada foi gravado.';
  END IF;

  SELECT array_agg(l.id) INTO v_volta
    FROM jsonb_array_elements(v_op.lancamentos) e JOIN public.financeiro_lancamentos_v2 l ON l.id = (e->>'id')::uuid
   WHERE l.favorecido_id = v_op.fornecedor_id;
  v_ficam := jsonb_array_length(v_op.lancamentos) - coalesce(cardinality(v_volta), 0);

  BEGIN
    PERFORM set_config('app.propagando_plano', 'on', true);
    PERFORM set_config('app.motivo', coalesce(nullif(btrim(p_motivo), ''), 'simulação') || ' (desfazer ligação da aba Sem cadastro)', true);
    UPDATE public.financeiro_lancamentos_v2 l SET favorecido_id = NULL, editado_manual = (e->>'editado_manual_antes')::boolean
      FROM jsonb_array_elements(v_op.lancamentos) e
     WHERE l.id = (e->>'id')::uuid AND l.id = ANY (coalesce(v_volta, '{}'::uuid[]));
    PERFORM set_config('app.propagando_plano', 'off', true);
    IF v_op.apelido_acrescentado IS NOT NULL THEN
      UPDATE public.financeiro_fornecedores
         SET aliases = coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(aliases) x WHERE x <> to_jsonb(v_op.apelido_acrescentado)), '[]'::jsonb)
       WHERE id = v_op.fornecedor_id AND jsonb_typeof(aliases) = 'array';
    END IF;
    UPDATE public.fornecedor_sem_cadastro_operacoes
       SET desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = coalesce(nullif(btrim(p_motivo), ''), 'simulação')
     WHERE id = p_operacao_id;
    v_uso := public._fn_fornecedor_prende_ativo(v_op.fornecedor_id);
    v_pode := v_op.fornecedor_criado AND coalesce((v_uso->>'lancamentos')::int, 0) = 0 AND coalesce((v_uso->>'recorrencias')::int, 0) = 0
              AND EXISTS (SELECT 1 FROM public.financeiro_fornecedores f WHERE f.id = v_op.fornecedor_id AND coalesce(f.ativo, true));
    IF v_pode AND coalesce(p_inativar_criado, false) THEN
      v_exc := public.fn_fornecedor_excluir(v_op.fornecedor_id, coalesce(nullif(btrim(p_motivo), ''), 'simulação') || ' (criado pela aba Sem cadastro e sem uso)', false);
      v_inativou := coalesce((v_exc->>'ok')::boolean, false);
    END IF;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'voltaram', coalesce(cardinality(v_volta), 0), 'ficaram', v_ficam,
               'pode_inativar', v_pode, 'inativou', v_inativou,
               'fornecedor', (SELECT jsonb_build_object('id', f.id, 'nome', f.nome) FROM public.financeiro_fornecedores f WHERE f.id = v_op.fornecedor_id));
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'SCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN sqlstate 'SCSIM' THEN
    RETURN sqlerrm::jsonb;
  END;
  RETURN v_ret;
END $f$;

-- ── as ligacoes recentes (as 30 ultimas do cliente) ──
CREATE OR REPLACE FUNCTION public.fn_fornecedor_sem_cadastro_recentes(p_cliente uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(x ORDER BY x->>'feita_em' DESC) FROM (
    SELECT jsonb_build_object('id', o.id, 'texto', o.texto, 'fornecedor_id', o.fornecedor_id, 'fornecedor_nome', f.nome,
             'fornecedor_criado', o.fornecedor_criado, 'lancamentos', jsonb_array_length(o.lancamentos), 'feita_em', o.feita_em,
             'feita_por', o.feita_por, 'desfeita_em', o.desfeita_em, 'desfeita_motivo', o.desfeita_motivo) x
      FROM public.fornecedor_sem_cadastro_operacoes o JOIN public.financeiro_fornecedores f ON f.id = o.fornecedor_id
     WHERE o.cliente_id = p_cliente ORDER BY o.feita_em DESC LIMIT 30) s), '[]'::jsonb);
END $f$;

-- ── ACL: as internas fechadas; as publicas para a tela ──
REVOKE ALL ON FUNCTION public._fn_fornecedor_chave_comparavel(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fornecedor_palavras_sig(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fornecedor_parecido(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_sem_cadastro_base(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_chave_comparavel(text), public._fn_fornecedor_palavras_sig(text),
  public._fn_fornecedor_parecido(text, text), public._fn_sem_cadastro_base(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_fornecedor_sem_cadastro(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fornecedor_sem_cadastro_ligar(uuid, text, boolean, uuid, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fornecedor_sem_cadastro_desfazer(uuid, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fornecedor_sem_cadastro_recentes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_sem_cadastro(uuid), public.fn_fornecedor_sem_cadastro_ligar(uuid, text, boolean, uuid, boolean, boolean),
  public.fn_fornecedor_sem_cadastro_desfazer(uuid, text, boolean, boolean), public.fn_fornecedor_sem_cadastro_recentes(uuid) TO authenticated, service_role;
