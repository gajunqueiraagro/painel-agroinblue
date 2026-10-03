-- PR-CONC-ENRIQ-IMPORT-CUSTO-01 — a importacao da planilha deixa de estourar o teto de 8 s (so' banco; nenhuma regra muda).
--
-- POR QUE (FASE 0 de 03/10, item A): cada lote de 100 custava 3,2–3,7 s no populate, e 12.845 ms das ~15 s das 470 linhas
-- iam em `_fn_classificacao_resolver_fornecedor`: cada chamada varria os 2.583 fornecedores ativos e os 736 apelidos do NJ
-- aplicando `unaccent` + `regexp` (`_fn_normalizar_texto`) LINHA A LINHA do cadastro, sem indice. A precedencia rodava sobre
-- a SESSAO INTEIRA a cada lote e resolvia de novo os fornecedores que a planilha nao resolveu.
--
-- O QUE MUDA — o COMO, nunca o O QUE (decisoes do Gabriel, 03/10):
-- D1  `financeiro_fornecedores.nome_norm` (text) e `aliases_norm` (text[], nunca NULL) GUARDAM o valor de
--     `_fn_normalizar_texto` — mantidos pelo gatilho `trg_fornecedor_norm_resolvedor` (BEFORE INSERT OR UPDATE OF nome,
--     aliases; SECURITY DEFINER porque o front grava como `authenticated`, que nao executa `_fn_normalizar_texto`).
--     ⚠ COLUNA GERADA NAO DA': `_fn_normalizar_texto` e' STABLE (depende do dicionario do `unaccent`) e declara-la
--       IMMUTABLE seria mentir. Por isso o gatilho, a conferencia `_fn_fornecedor_norm_divergentes()` (tem de dar 0) e a
--       reconstrucao `_fn_fornecedor_norm_reconstruir()` — as duas so' para `service_role`.
--     ⚠ `nome_normalizado` (outra regra: maiusculas, pontuacao vira espaco) e `trg_normalizar_fornecedor` NAO SE TOCAM.
--     Indices: btree (cliente_id, nome_norm) WHERE ativo; GIN (aliases_norm). O `_det` procura por igualdade nesses campos:
--     a ordem das camadas, o "exatamente 1" do apelido e o desempate por created_at, id ficam como estao.
-- D2  Uma resolucao por texto de fornecedor distinto: mapa por chamada no populate; CTE materializado na precedencia.
-- D3  `_fn_classificacao_precedencia_cru(uuid, uuid[])` (nova, interna) e' o corpo de hoje com o recorte opcional; a de 1
--     argumento delega com NULL (Recasar e casar manual seguem sobre a sessao). O populate passa so' as linhas do lote.
-- D4  Nenhuma RPC publica muda de assinatura; ACL preservada (as novas: so' `service_role`).
-- D5  Backfill so' das duas colunas, guardado: contagem de linhas, 0 divergencias, e o md5 da tabela SEM as duas colunas
--     (updated_at inclusive) identico antes x depois — nenhum gatilho dispara (o novo e o `trg_normalizar_fornecedor` sao
--     "UPDATE OF" colunas que o backfill nao escreve; nao ha publicacao, regra nem outro gatilho de usuario na tabela).
--
-- METODO: funcoes novas e `_det` / precedencia (1 e 2 argumentos) INTEGRAIS, guardadas por md5 de origem e de destino;
-- o populate (15.638 caracteres) por patch guardado por md5 (ancoras contadas, conceito contado, destino conferido).
--   _fn_classificacao_resolver_fornecedor_det  bdc0026e6945f5d1bd176d934cb2f947 -> bdaacbe9f73378b1c137ea255bc02b8a
--   _fn_classificacao_precedencia_cru(uuid)    c30287e0e2edfdbbdf484c998d5c76d7 -> ad89e90cfe43b9647cf334777286671c
--   _fn_classificacao_precedencia_cru(uuid, uuid[])  nova                      -> e532918e2b8018c698a2aa6d5a448682
--   fn_classificacao_populate_staging           b62d8e0e1e28264a833e5867bfbe4f47 -> 93e3eb6cef55fdd7c9fdbf4576e0090b
--   _fn_classificacao_resolver_fornecedor       cb41810ae7a4c063e7aa6689a194dd1c (intocado: delega ao _det)

-- ═══ 0. guardas de origem ═══════════════════════════════════════════════════════════════════════════════════════════════
DO $guarda$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_resolver_fornecedor_det(uuid,text)'::regprocedure))
       <> 'bdc0026e6945f5d1bd176d934cb2f947'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_resolver_fornecedor(uuid,text)'::regprocedure))
       <> 'cb41810ae7a4c063e7aa6689a194dd1c'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_precedencia_cru(uuid)'::regprocedure))
       <> 'c30287e0e2edfdbbdf484c998d5c76d7'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)'::regprocedure))
       <> 'b62d8e0e1e28264a833e5867bfbe4f47'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_normalizar_texto(text)'::regprocedure))
       <> 'a0314e0ac8327df6bba5a4c6127fd792' THEN
    RAISE EXCEPTION 'IMPORT-CUSTO-01: algum corpo de origem nao e'' o esperado. Migration abortada.';
  END IF;
  IF to_regprocedure('public._fn_classificacao_precedencia_cru(uuid,uuid[])') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'financeiro_fornecedores'
                  AND column_name IN ('nome_norm', 'aliases_norm')) THEN
    RAISE EXCEPTION 'IMPORT-CUSTO-01: ja'' aplicada (funcao ou coluna nova existe). Migration abortada.';
  END IF;
END
$guarda$;

-- a foto da tabela ANTES (sem as colunas novas, que ainda nao existem) — conferida no fim do backfill
CREATE TEMP TABLE _import_custo_01_foto ON COMMIT DROP AS
  SELECT count(*) AS n, md5(string_agg(to_jsonb(f)::text, E'\n' ORDER BY f.id)) AS h FROM public.financeiro_fornecedores f;

-- ═══ 1. as colunas guardadas, a funcao do array e o gatilho (D1) ══════════════════════════════════════════════════════
ALTER TABLE public.financeiro_fornecedores
  ADD COLUMN nome_norm text,
  ADD COLUMN aliases_norm text[] NOT NULL DEFAULT '{}'::text[];

CREATE FUNCTION public._fn_fornecedor_aliases_norm(p_aliases jsonb)
RETURNS text[] LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D1): cada apelido por `_fn_normalizar_texto` (a unica normalizacao), sem os que
  -- normalizam para NULL (nunca casavam); nunca NULL. `aliases` que nao e' array (nenhum hoje) vira vazio.
  SELECT COALESCE(array_agg(x.n ORDER BY x.o) FILTER (WHERE x.n IS NOT NULL), '{}'::text[])
    FROM (SELECT public._fn_normalizar_texto(e.valor) AS n, e.o
            FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_aliases) = 'array' THEN p_aliases ELSE '[]'::jsonb END)
                 WITH ORDINALITY AS e(valor, o)) x
$f$;

CREATE FUNCTION public._fn_fornecedor_norm_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D1): o valor normalizado GUARDADO sai so' de `_fn_normalizar_texto`.
  -- ⚠ SECURITY DEFINER: o front grava fornecedor como `authenticated`, que nao executa `_fn_normalizar_texto`.
  NEW.nome_norm := public._fn_normalizar_texto(NEW.nome);
  NEW.aliases_norm := public._fn_fornecedor_aliases_norm(NEW.aliases);
  RETURN NEW;
END;
$f$;

CREATE TRIGGER trg_fornecedor_norm_resolvedor
  BEFORE INSERT OR UPDATE OF nome, aliases ON public.financeiro_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public._fn_fornecedor_norm_trg();

CREATE FUNCTION public._fn_fornecedor_norm_divergentes()
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D5): quantas linhas tem o valor guardado diferente do que a normalizacao daria hoje
  -- (o dicionario do `unaccent` mudou, por exemplo). Tem de ser 0.
  SELECT count(*)::int FROM public.financeiro_fornecedores f
   WHERE f.nome_norm IS DISTINCT FROM public._fn_normalizar_texto(f.nome)
      OR f.aliases_norm IS DISTINCT FROM public._fn_fornecedor_aliases_norm(f.aliases)
$f$;

CREATE FUNCTION public._fn_fornecedor_norm_reconstruir()
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $f$
DECLARE n int;
BEGIN
  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D5): reconstroi o valor guardado onde ele diverge; nao toca nome, aliases nem updated_at.
  UPDATE public.financeiro_fornecedores f
     SET nome_norm = public._fn_normalizar_texto(f.nome),
         aliases_norm = public._fn_fornecedor_aliases_norm(f.aliases)
   WHERE f.nome_norm IS DISTINCT FROM public._fn_normalizar_texto(f.nome)
      OR f.aliases_norm IS DISTINCT FROM public._fn_fornecedor_aliases_norm(f.aliases);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$f$;

REVOKE ALL ON FUNCTION public._fn_fornecedor_aliases_norm(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fornecedor_norm_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fornecedor_norm_divergentes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_fornecedor_norm_reconstruir() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_aliases_norm(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_norm_divergentes() TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_norm_reconstruir() TO service_role;

-- ═══ 2. backfill so' das duas colunas, guardado (D5) ═════════════════════════════════════════════════════════════════
UPDATE public.financeiro_fornecedores f
   SET nome_norm = public._fn_normalizar_texto(f.nome),
       aliases_norm = public._fn_fornecedor_aliases_norm(f.aliases)
 WHERE f.id IS NOT NULL;

DO $backfill$
DECLARE v_antes record; v_n int; v_h text; v_div int;
BEGIN
  SELECT * INTO v_antes FROM _import_custo_01_foto;
  SELECT count(*), md5(string_agg((to_jsonb(f) - 'nome_norm' - 'aliases_norm')::text, E'\n' ORDER BY f.id))
    INTO v_n, v_h FROM public.financeiro_fornecedores f;
  IF v_n <> v_antes.n OR v_h <> v_antes.h THEN
    RAISE EXCEPTION 'IMPORT-CUSTO-01: o backfill mudou outra coluna da tabela (linhas % -> %, md5 % -> %).', v_antes.n, v_n, v_antes.h, v_h;
  END IF;
  v_div := public._fn_fornecedor_norm_divergentes();
  IF v_div <> 0 THEN RAISE EXCEPTION 'IMPORT-CUSTO-01: % linhas com o valor guardado diferente de _fn_normalizar_texto.', v_div; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_fornecedores WHERE nome_norm IS NULL AND public._fn_normalizar_texto(nome) IS NOT NULL) THEN
    RAISE EXCEPTION 'IMPORT-CUSTO-01: nome_norm nulo com nome normalizavel.';
  END IF;
  RAISE NOTICE 'IMPORT-CUSTO-01 backfill: % linhas, 0 divergencias, md5 sem as colunas novas identico (%).', v_n, v_h;
END
$backfill$;

CREATE INDEX idx_fornecedores_cliente_nome_norm ON public.financeiro_fornecedores (cliente_id, nome_norm) WHERE ativo;
CREATE INDEX idx_fornecedores_aliases_norm ON public.financeiro_fornecedores USING gin (aliases_norm);
-- estatistica para o planejador escolher os indices novos ja' na primeira chamada (nao muda dado)
ANALYZE public.financeiro_fornecedores;

-- ═══ 3. o resolvedor procura pelo valor guardado (D1) — corpo integral ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._fn_classificacao_resolver_fornecedor_det(p_cliente_id uuid, p_texto text)
RETURNS TABLE(id uuid, origem text) LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
DECLARE v_alvo text := public._fn_normalizar_texto(p_texto); v_ids uuid[]; v_id uuid;
BEGIN
  IF v_alvo IS NULL THEN RETURN; END IF;
  -- 1. o apelido ensinado no de-para, so' entre os ATIVOS
  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D1): a mesma igualdade, pelo valor GUARDADO — `aliases_norm` e' cada apelido por
  -- `_fn_normalizar_texto` (gatilho `trg_fornecedor_norm_resolvedor`), e o GIN o acha sem normalizar o cadastro.
  SELECT array_agg(f.id) INTO v_ids FROM financeiro_fornecedores f
   WHERE f.cliente_id = p_cliente_id AND f.ativo = true
     AND f.aliases_norm @> ARRAY[v_alvo];
  IF cardinality(v_ids) = 1 THEN id := v_ids[1]; origem := 'alias'; RETURN NEXT; RETURN; END IF;
  -- 2. o nome normalizado; o mais antigo desempata
  SELECT f.id INTO v_id FROM financeiro_fornecedores f
   WHERE f.cliente_id = p_cliente_id AND f.ativo = true AND f.nome_norm = v_alvo
   ORDER BY f.created_at, f.id LIMIT 1;
  IF v_id IS NOT NULL THEN id := v_id; origem := 'cadastro'; RETURN NEXT; END IF;
END;
$f$;

-- ═══ 4. a precedencia com recorte (D2/D3) — corpos integrais ═════════════════════════════════════════════════════════
CREATE FUNCTION public._fn_classificacao_precedencia_cru(p_sessao_id uuid, p_staging_ids uuid[])
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $f$
DECLARE
  -- PR-CONC-EXCEL-PLANILHA-COMPLETA-01: safra, tipo de documento e forma tambem sao da planilha no cru, do sistema no classificado
  k_class CONSTANT text[] := ARRAY['subcentro','macro_custo','grupo_custo','centro_custo','plano_conta_id','favorecido_id','fazenda_id',
                                   'safra_id','tipo_documento','forma_pagamento',
                                   -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D5): a cultura da planilha, como a safra
                                   'cultura'];
  k_plano CONSTANT text[] := ARRAY['subcentro','macro_custo','grupo_custo','centro_custo','plano_conta_id'];
  n int;
BEGIN
  WITH base AS (
    SELECT s.staging_id, s.cliente_id, s.update_proposto p, s.excel_fazenda_codigo, s.excel_fornecedor, s.excel_safra,
           s.update_proposto_original AS original,
           -- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU (D4): o par mudou NESTE Recasar (o casar marca `par_mudou_em` = now() logo antes)
           (s.casamento_meta ->> 'par_mudou_em' IS NOT NULL
             AND (s.casamento_meta ->> 'par_mudou_em')::timestamptz = now()) AS reav,
           (COALESCE(s.update_proposto -> '_meta' ->> 'origem_resolucao', '') = 'manual') AS manual,
           -- sessao antiga (sem `_planilha`): a leitura e' a que o populate pos no topo
           COALESCE(s.update_proposto -> '_planilha', jsonb_strip_nulls(jsonb_build_object(
             'subcentro', s.update_proposto -> 'subcentro', 'macro_custo', s.update_proposto -> 'macro_custo',
             'grupo_custo', s.update_proposto -> 'grupo_custo', 'centro_custo', s.update_proposto -> 'centro_custo',
             'plano_conta_id', s.update_proposto -> 'plano_conta_id', 'favorecido_id', s.update_proposto -> 'favorecido_id'))) pl0,
           (l.origem_lancamento IN ('extrato', 'ofx') AND l.subcentro IS NULL AND l.plano_conta_id IS NULL
             AND COALESCE(l.tipo_operacao, '') NOT LIKE '3-%') AS cru,
           -- PR-CONC-ENRIQ-SAFRA-COMPETENCIA (D2): a reserva da competencia que vai ser gravada
           l.data_competencia AS lanc_competencia,
           -- Excel vazio nunca apaga: so' entra o que a planilha tem ("-" e' o vazio da planilha, como no `vazio()` do front)
           jsonb_strip_nulls(jsonb_build_object(
             'data_competencia', s.excel_data, 'data_vencimento', s.excel_data_vencimento,
             'numero_documento', NULLIF(NULLIF(btrim(s.excel_documento), ''), '-'),
             'observacao', NULLIF(NULLIF(btrim(s.excel_observacao), ''), '-'),
             'produto', NULLIF(NULLIF(btrim(s.excel_produto), ''), '-'))) AS excel
      FROM financeiro_classificacao_staging s
      JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
     WHERE s.sessao_id = p_sessao_id AND NOT s.aplicado
       -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D3): o populate passa so' as linhas do lote; NULL = a sessao inteira (o Recasar)
       AND (p_staging_ids IS NULL OR s.staging_id = ANY (p_staging_ids))
       -- linha manual so' entra quando o par mudou neste Recasar (D4)
       AND (COALESCE(s.update_proposto -> '_meta' ->> 'origem_resolucao', '') <> 'manual'
            OR (s.casamento_meta ->> 'par_mudou_em' IS NOT NULL
                AND (s.casamento_meta ->> 'par_mudou_em')::timestamptz = now()))
  ), operador AS (
    -- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU (D1/D5): as chaves do operador. Com lista, a lista; manual sem lista (antes do PR), as
    -- chaves PRESENTES no topo; nao manual, nenhuma. E a base da regra: na linha manual reavaliada, a proposta comeca so'
    -- com `_planilha` e `_meta` (nada do par antigo sobrevive fora da lista); no resto, a proposta de sempre.
    SELECT b.*,
           CASE WHEN b.p -> '_meta' ? 'chaves_do_operador'
                  THEN ARRAY(SELECT jsonb_array_elements_text(b.p -> '_meta' -> 'chaves_do_operador'))
                WHEN b.manual
                  THEN ARRAY(SELECT k FROM jsonb_object_keys(b.p) AS k WHERE k NOT IN ('_planilha', '_meta'))
                ELSE '{}'::text[] END AS ops,
           CASE WHEN b.reav AND b.manual
                  THEN (SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                          FROM jsonb_each(b.p) AS e WHERE e.key IN ('_planilha', '_meta'))
                ELSE b.p END AS pr
      FROM base b
  ), forn AS MATERIALIZED (
    -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D2): uma resolucao por texto de fornecedor distinto, so' onde a planilha nao o trouxe
    -- (a mesma condicao do COALESCE abaixo); o resolvedor e' o de sempre
    SELECT d.cliente_id, d.excel_fornecedor,
           public._fn_classificacao_resolver_fornecedor(d.cliente_id, d.excel_fornecedor) AS id
      FROM (SELECT DISTINCT o.cliente_id, o.excel_fornecedor FROM operador o WHERE o.pl0 ->> 'favorecido_id' IS NULL) d
  ), planilha AS (
    -- fazenda e fornecedor pelos resolvedores (cobre a sessao antiga, que o populate de antes nao resolvia)
    SELECT o.*, o.pl0 || jsonb_strip_nulls(jsonb_build_object(
             'fazenda_id', COALESCE(o.pl0 ->> 'fazenda_id',
                                    public._fn_classificacao_resolver_fazenda(o.cliente_id, o.excel_fazenda_codigo)::text),
             'favorecido_id', COALESCE(o.pl0 ->> 'favorecido_id', fr.id::text),
             -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D7): a sessao importada antes do PR ganha a cultura no Recasar
             'cultura', COALESCE(o.pl0 ->> 'cultura',
                                 public._fn_classificacao_cultura_da_planilha(o.excel_safra, NULLIF(o.pl0 ->> 'safra_id', '')::uuid)))) AS pl
      FROM operador o
      LEFT JOIN forn fr ON fr.cliente_id = o.cliente_id AND fr.excel_fornecedor IS NOT DISTINCT FROM o.excel_fornecedor
  ), escopos AS (
    -- PR-CONC-EXCEL-PLANILHA-COMPLETA-01: a atividade da safra da planilha e a da conta do plano que ela resolveu
    SELECT pl.*,
           (SELECT sf.escopo_negocio FROM financeiro_safras sf WHERE sf.id = NULLIF(pl.pl ->> 'safra_id', '')::uuid) AS saf_esc,
           (SELECT pc.escopo_negocio FROM financeiro_plano_contas pc WHERE pc.id = NULLIF(pl.pl ->> 'plano_conta_id', '')::uuid) AS pc_esc
      FROM planilha pl
  ), topo AS (
    -- no cru, plano administrativo forca a fazenda Administrativo (a planilha continua em `_planilha`)
    SELECT e.*, CASE
             WHEN e.cru AND e.pc_esc = 'administrativo'
             THEN e.pl || COALESCE((SELECT jsonb_build_object('fazenda_id', f.id) FROM fazendas f
                                     WHERE f.cliente_id = e.cliente_id AND f.nome ILIKE '%administrat%'
                                     ORDER BY f.created_at, f.id LIMIT 1), '{}'::jsonb)
             ELSE e.pl END AS pl_adm
      FROM escopos e
  ), coerente AS (
    -- ⚠ PLANO DE OUTRA ATIVIDADE QUE A SAFRA NAO SOBE: a conta fica pendente para o operador (nunca se grava plano
    --   incoerente). Plano administrativo NAO leva safra (o gatilho a zeraria; aqui ela nem sobe).
    SELECT t.*, CASE
             WHEN t.saf_esc IS NOT NULL AND t.pc_esc IS NOT NULL AND t.pc_esc <> 'administrativo' AND t.pc_esc <> t.saf_esc
               THEN t.pl_adm - k_plano
             WHEN t.pc_esc = 'administrativo' THEN t.pl_adm - 'safra_id'
             ELSE t.pl_adm END AS pl_topo
      FROM topo t
  ), regra AS (
    -- a proposta que a REGRA monta para o par (o de sempre, sobre `pr`)
    SELECT c.*, CASE
             WHEN c.cru THEN (c.pr - k_class) || c.pl_topo || c.excel
               -- PR-CONC-ENRIQ-SAFRA-COMPETENCIA (D2): na PECUARIA a competencia decide a safra (a da planilha fica em
               -- `_planilha`). A atividade e' a do plano que sobe; sem plano (ou plano que a safra derrubou), a da safra da
               -- planilha. Sem safra candidata, vale a planilha. Lavoura, administrativo e sem atividade: nada muda.
               || CASE WHEN (CASE WHEN c.pl_topo ? 'plano_conta_id' THEN c.pc_esc ELSE c.saf_esc END) = 'pecuaria'
                       THEN jsonb_strip_nulls(jsonb_build_object('safra_id', public._fn_safra_da_competencia(c.cliente_id, 'pecuaria',
                              COALESCE(NULLIF(((c.pr - k_class) || c.pl_topo || c.excel) ->> 'data_competencia', '')::date,
                                       c.lanc_competencia))::text))
                       ELSE '{}'::jsonb END
               || jsonb_build_object('_planilha', c.pl)
             ELSE (c.pr - k_class) || jsonb_build_object('_planilha', c.pl)
           END AS r
      FROM coerente c
  ), novo AS (
    SELECT g.staging_id, g.reav, g.manual,
           CASE
             WHEN NOT (g.reav AND g.manual) THEN g.r
             -- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU (D4): a regra para o par novo, com as chaves do operador por cima — presentes
             -- com o valor dele, removidas continuam ausentes; o `_meta` diz se ainda e' manual (D6)
             ELSE (g.r - g.ops - '_meta')
                  || (SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) FROM jsonb_each(g.p) AS e WHERE e.key = ANY (g.ops))
                  || CASE WHEN cardinality(g.ops) > 0
                          THEN jsonb_build_object('_meta', COALESCE(g.p -> '_meta', '{}'::jsonb) || jsonb_build_object('chaves_do_operador', to_jsonb(g.ops)))
                          WHEN g.original ? '_meta' THEN jsonb_build_object('_meta', g.original -> '_meta')
                          ELSE '{}'::jsonb END
           END AS proposto,
           -- D6: o que a regra montou para o par novo, com o `_meta` nao-manual (o resetar devolve uma linha nao-manual)
           CASE WHEN g.reav AND g.manual
                THEN (g.r - '_meta') || CASE WHEN g.original ? '_meta' THEN jsonb_build_object('_meta', g.original -> '_meta') ELSE '{}'::jsonb END
           END AS original_novo
      FROM regra g
  )
  UPDATE financeiro_classificacao_staging s
     SET update_proposto = novo.proposto,
         update_proposto_original = CASE WHEN novo.reav AND novo.manual THEN novo.original_novo ELSE s.update_proposto_original END,
         updated_at = now()
    FROM novo
   WHERE s.staging_id = novo.staging_id
     AND (s.update_proposto IS DISTINCT FROM novo.proposto
          OR (novo.reav AND novo.manual AND s.update_proposto_original IS DISTINCT FROM novo.original_novo));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$f$;

REVOKE ALL ON FUNCTION public._fn_classificacao_precedencia_cru(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_precedencia_cru(uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public._fn_classificacao_precedencia_cru(p_sessao_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $f$
BEGIN
  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D3): a regra mora na de 2 argumentos; sem recorte = a sessao inteira (Recasar, casar
  -- manual). So' o populate passa as linhas do lote.
  RETURN public._fn_classificacao_precedencia_cru(p_sessao_id, NULL::uuid[]);
END;
$f$;

-- ═══ 5. o populate: um texto, uma resolucao (D2) e a precedencia so' do lote (D3) — patch guardado por md5 ════════════
DO $mig$
DECLARE v_oid oid := 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)'::regprocedure; v_antes text; v_novo text; a text; b text;
BEGIN
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> 'b62d8e0e1e28264a833e5867bfbe4f47' THEN
    RAISE EXCEPTION 'populate nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  a := $a$  v_total int := 0; v_inseridos int := 0; v_counts jsonb := '{}'::jsonb;
$a$;
  b := $a$  v_total int := 0; v_inseridos int := 0; v_counts jsonb := '{}'::jsonb;
  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01: D2 (um texto de fornecedor, uma resolucao) e D3 (a precedencia so' das linhas do lote)
  v_forn_cache jsonb := '{}'::jsonb; v_sid uuid; v_lote_ids uuid[] := '{}'::uuid[];
$a$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'populate: ancora 1 nao casa 1x'; END IF;
  IF (length(v_novo) - length(replace(v_novo, $a$v_counts jsonb$a$, ''))) / length($a$v_counts jsonb$a$) <> 1 THEN
    RAISE EXCEPTION 'populate: o conceito da ancora 1 nao aparece exatamente 1x';
  END IF;
  v_novo := replace(v_novo, a, b);
  a := $a$    v_favorecido_id := public._fn_classificacao_resolver_fornecedor(p_cliente_id, v_fornecedor_txt);
$a$;
  b := $a$    -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D2): o mesmo texto de fornecedor se resolve uma vez por chamada ('' = sem texto)
    IF v_forn_cache ? COALESCE(v_fornecedor_txt, '') THEN
      v_favorecido_id := NULLIF(v_forn_cache ->> COALESCE(v_fornecedor_txt, ''), '')::uuid;
    ELSE
      v_favorecido_id := public._fn_classificacao_resolver_fornecedor(p_cliente_id, v_fornecedor_txt);
      v_forn_cache := v_forn_cache || jsonb_build_object(COALESCE(v_fornecedor_txt, ''), COALESCE(v_favorecido_id::text, ''));
    END IF;
$a$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'populate: ancora 2 nao casa 1x'; END IF;
  IF (length(v_novo) - length(replace(v_novo, $a$_fn_classificacao_resolver_fornecedor($a$, ''))) / length($a$_fn_classificacao_resolver_fornecedor($a$) <> 1 THEN
    RAISE EXCEPTION 'populate: o conceito da ancora 2 nao aparece exatamente 1x';
  END IF;
  v_novo := replace(v_novo, a, b);
  a := $a$    ) ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING;
$a$;
  b := $a$    ) ON CONFLICT (sessao_id, excel_linha_origem) DO NOTHING
    RETURNING staging_id INTO v_sid;
    -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D3): a linha entra no recorte da precedencia — a que ja' existia na sessao tambem,
    -- quando o conflito a pulou (era o que a precedencia sobre a sessao inteira fazia)
    IF v_sid IS NULL THEN
      SELECT s.staging_id INTO v_sid FROM financeiro_classificacao_staging s
       WHERE s.sessao_id = p_sessao_id AND s.excel_linha_origem = v_linha;
    END IF;
    IF v_sid IS NOT NULL THEN v_lote_ids := v_lote_ids || v_sid; END IF;
$a$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'populate: ancora 3 nao casa 1x'; END IF;
  IF (length(v_novo) - length(replace(v_novo, $a$ON CONFLICT$a$, ''))) / length($a$ON CONFLICT$a$) <> 1 THEN
    RAISE EXCEPTION 'populate: o conceito da ancora 3 nao aparece exatamente 1x';
  END IF;
  v_novo := replace(v_novo, a, b);
  a := $a$  PERFORM public._fn_classificacao_precedencia_cru(p_sessao_id);
$a$;
  b := $a$  -- PR-CONC-ENRIQ-IMPORT-CUSTO-01 (D3): so' as linhas deste lote (as dos lotes anteriores ja' passaram por ela)
  PERFORM public._fn_classificacao_precedencia_cru(p_sessao_id, v_lote_ids);
$a$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'populate: ancora 4 nao casa 1x'; END IF;
  IF (length(v_novo) - length(replace(v_novo, $a$_fn_classificacao_precedencia_cru($a$, ''))) / length($a$_fn_classificacao_precedencia_cru($a$) <> 1 THEN
    RAISE EXCEPTION 'populate: o conceito da ancora 4 nao aparece exatamente 1x';
  END IF;
  v_novo := replace(v_novo, a, b);
  EXECUTE replace(pg_get_functiondef(v_oid), v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '93e3eb6cef55fdd7c9fdbf4576e0090b' THEN
    RAISE EXCEPTION 'populate: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
END
$mig$;

-- ═══ 6. guardas de destino e ACL ═════════════════════════════════════════════════════════════════════════════════════
DO $destino$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_resolver_fornecedor_det(uuid,text)'::regprocedure))
       <> 'bdaacbe9f73378b1c137ea255bc02b8a'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_precedencia_cru(uuid)'::regprocedure))
       <> 'ad89e90cfe43b9647cf334777286671c'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_precedencia_cru(uuid,uuid[])'::regprocedure))
       <> 'e532918e2b8018c698a2aa6d5a448682'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_fornecedor_aliases_norm(jsonb)'::regprocedure)) <> '4f0c33ff13d6a51d0f37c2d13eb1c41a'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_fornecedor_norm_trg()'::regprocedure)) <> '31c60ecd11e5bfbd628823006a0be327'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_fornecedor_norm_divergentes()'::regprocedure)) <> '0f15d34002e01449a2910f473348f442'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_fornecedor_norm_reconstruir()'::regprocedure)) <> '271acc7391d817cacdad8a9bfad9ea30'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_resolver_fornecedor(uuid,text)'::regprocedure))
       <> 'cb41810ae7a4c063e7aa6689a194dd1c' THEN
    RAISE EXCEPTION 'IMPORT-CUSTO-01: algum corpo de destino nao e'' o esperado.';
  END IF;
  IF has_function_privilege('authenticated', 'public._fn_classificacao_precedencia_cru(uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public._fn_classificacao_precedencia_cru(uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_fornecedor_norm_reconstruir()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_fornecedor_norm_divergentes()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_fornecedor_aliases_norm(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_precedencia_cru(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_classificacao_depara_resolver(uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public._fn_classificacao_precedencia_cru(uuid,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'IMPORT-CUSTO-01: ACL fora do esperado.';
  END IF;
END
$destino$;

