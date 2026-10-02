-- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU — quando o Recasar troca o par, a proposta e' refeita para o par NOVO, respeitando o
-- que o operador editou.
--
-- POR QUE
-- `_fn_classificacao_precedencia_cru` monta a proposta no fim do populate e do Recasar, mas pula toda linha MANUAL, e qualquer
-- `editar_proposto` marca a linha manual para sempre. Quando o Recasar troca o par de uma linha manual, a proposta fica a do
-- par antigo (linha 16 do NJ, 02/10: editada com o par classificado 0a7c78aa, movida para o cru faf8537b; a Mesa disse "cru ·
-- planilha prevalece" e o "Vai gravar" trouxe o sistema). Deduzir "do operador x da regra" pelo diff contra o
-- `update_proposto_original` nao serve (alinhamento da linha gravada, sugestoes do Salvar, campo esvaziado, mesmo valor).
--
-- O QUE MUDA (decisoes do Gabriel, v2)
-- D1  `editar_proposto` anota em `_meta.chaves_do_operador` as chaves do patch que aplicou, INCLUSIVE as removidas; subcentro
--     leva junto macro/grupo/centro/plano_conta_id. O alinhamento interno da linha gravada NAO entra. Linha editada antes deste
--     PR (manual, sem lista): a lista nasce com as chaves PRESENTES no topo (D5).
-- D2  `"_sugestao": true` no patch = proposta automatica da tela: lida e NAO gravada; as chaves do patch nao entram na lista.
-- D3  `fn_classificacao_casar_sessao` tira a foto do par de cada linha que vai recasar e, antes da precedencia, grava em
--     `casamento_meta` `par_anterior` (id ou null) e `par_mudou_em` (now()) nas linhas NAO aplicadas, fora de grupo e de bloco
--     (o `ambiguo` com candidatos NAO e' grupo), cujo par MUDOU; nas que nao mudaram, so' devolve o `par_mudou_em`/
--     `par_anterior` que ja' tinham (o "limpa" do Recasar zera o `casamento_meta`, e o aviso da tela nao pode sumir sozinho
--     num segundo Recasar).
-- D4  a precedencia reavalia, MESMO em linha manual, as linhas cujo par mudou NESTE Recasar (`par_mudou_em` = now()): chave
--     da lista fica como esta' (com valor, ou ausente se foi removida); o resto e' recalculado pelo par novo a partir de
--     `_planilha` (cru: planilha + excel + safra da competencia na pecuaria; classificado: sai do topo).
-- D5  linha manual SEM lista: chave PRESENTE no topo conta como do operador; AUSENTE conta como da regra. Limite aceito: campo
--     esvaziado de proposito numa linha antiga volta preenchido (o aviso "par mudou" cobre).
-- D6  depois da reavaliacao de linha manual: `update_proposto_original` = o que a regra montou para o par novo (com o `_meta`
--     nao-manual, para o resetar devolver uma linha nao-manual); a linha continua manual so' se restar chave do operador.
-- D7  `_planilha` nunca muda. Linha aplicada, conferido_bloco e linha em grupo: fora.
--     ⚠ Sessao anterior a 30/09 (SEM `_planilha`): a precedencia a CRIA a partir do topo, como sempre fez nas nao manuais —
--     na linha manual reavaliada, o topo e' o do operador (244 linhas manuais nao aplicadas sem `_planilha` em 02/10).
--
-- METODO: `editar_proposto` e `casar_sessao` por patch guardado por md5 (ancoras contadas, destino conferido); a precedencia
-- (6.264 caracteres, reescrita de varios CTEs) pelo CORPO INTEGRAL abaixo, com a guarda de md5 de origem antes e de destino
-- depois. Atributos e ACL ficam como estao. Nenhum UPDATE em dado de cliente.
--   editar_proposto   83a28c3c200fc859ad176832c9bbb1a0 -> 4155bca836bec0c9cccaa899a75ddb42
--   casar_sessao      c5d725afa76d91242d2c2410984cf38c -> 01de1fd52769d00018f8058c29cf6a5a
--   precedencia_cru   f9db83d4d416f16b8fbf97f68b401975 -> c30287e0e2edfdbbdf484c998d5c76d7

-- ═══ 1. editar_proposto — a lista do operador e a sugestao (D1, D2) ═══════════════════════════════════════════════════
DO $mig$
DECLARE
  v_oid oid; v_antes text; v_novo text;
  a text; b text;
BEGIN
  v_oid := 'public.fn_classificacao_editar_proposto(uuid,jsonb)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> '83a28c3c200fc859ad176832c9bbb1a0' THEN
    RAISE EXCEPTION 'editar_proposto nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  -- (a) as variaveis
  a := $t$  v_aplicados text[] := '{}'; v_rejeitados jsonb := '{}'::jsonb;$t$;
  b := $t$  v_aplicados text[] := '{}'; v_rejeitados jsonb := '{}'::jsonb;
  -- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU (D1/D2)
  v_sugestao boolean := false; v_chaves text[] := '{}';$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'editar_proposto: ancora das variaveis'; END IF;
  v_novo := replace(v_novo, a, b);
  -- (b) a sugestao e' lida e sai do patch antes de qualquer validacao (nunca vira chave, nunca vai ao lancamento)
  a := $t$  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'patch_invalido'); END IF;$t$;
  b := $t$  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'patch_invalido'); END IF;
  -- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU (D2): "_sugestao": true = proposta AUTOMATICA da tela (alinhar subcentro, safra sugerida,
  -- forma pelo historico). E' lida e NAO gravada; com ela, as chaves do patch nao entram em `chaves_do_operador`.
  v_sugestao := COALESCE(p_patch ->> '_sugestao', '') = 'true';
  p_patch := p_patch - '_sugestao';$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'editar_proposto: ancora do patch_invalido'; END IF;
  v_novo := replace(v_novo, a, b);
  -- (c) o _meta manual passa a levar a lista do operador (o CONCEITO "marca manual" aparece 1x)
  IF (length(v_novo) - length(replace(v_novo, $c$'origem_resolucao','manual'$c$, ''))) / length($c$'origem_resolucao','manual'$c$) <> 1 THEN
    RAISE EXCEPTION 'editar_proposto: a marca manual nao aparece exatamente 1x';
  END IF;
  a := $t$  v_prop := v_prop || jsonb_build_object('_meta', jsonb_build_object('origem_resolucao','manual','tier','manual','motor_version',1));$t$;
  b := $t$  -- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU (D1): as chaves que o OPERADOR mexeu, acumuladas (removidas inclusive). Linha editada
  -- antes do PR (manual, sem lista): nasce com as chaves presentes no topo (D5). O alinhamento da linha gravada nao entra:
  -- ele so' mexe no `v_prop`, e a lista sai das chaves do PATCH.
  IF v_staging.update_proposto -> '_meta' ? 'chaves_do_operador' THEN
    SELECT COALESCE(array_agg(x), '{}') INTO v_chaves
      FROM jsonb_array_elements_text(v_staging.update_proposto -> '_meta' -> 'chaves_do_operador') AS x;
  ELSIF COALESCE(v_staging.update_proposto -> '_meta' ->> 'origem_resolucao', '') = 'manual' THEN
    SELECT COALESCE(array_agg(k), '{}') INTO v_chaves
      FROM jsonb_object_keys(COALESCE(v_staging.update_proposto, '{}'::jsonb)) AS k WHERE k NOT IN ('_planilha', '_meta');
  END IF;
  IF NOT v_sugestao THEN
    SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), '{}') INTO v_chaves
      FROM unnest(v_chaves || v_aplicados
                  || CASE WHEN 'subcentro' = ANY (v_aplicados)
                          THEN ARRAY['macro_custo','grupo_custo','centro_custo','plano_conta_id'] ELSE '{}'::text[] END) AS k;
  END IF;
  v_prop := v_prop || jsonb_build_object('_meta', jsonb_build_object('origem_resolucao','manual','tier','manual','motor_version',1,
    'chaves_do_operador', to_jsonb(v_chaves)));$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'editar_proposto: ancora do _meta'; END IF;
  v_novo := replace(v_novo, a, b);
  EXECUTE replace(pg_get_functiondef(v_oid), v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '4155bca836bec0c9cccaa899a75ddb42' THEN
    RAISE EXCEPTION 'editar_proposto: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
END $mig$;

-- ═══ 2. casar_sessao — a marca do par que mudou (D3) ══════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_oid oid; v_antes text; v_novo text;
  a text; b text;
BEGIN
  v_oid := 'public.fn_classificacao_casar_sessao(uuid,text)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> 'c5d725afa76d91242d2c2410984cf38c' THEN
    RAISE EXCEPTION 'casar_sessao nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  v_novo := v_antes;
  -- (a) a variavel da foto
  a := $t$  v_reabrir uuid[] := '{}'::uuid[]; n_reab int := 0;$t$;
  b := $t$  v_reabrir uuid[] := '{}'::uuid[]; n_reab int := 0;
  -- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU (D3): a foto do par de cada linha que vai ser recasada
  v_pares_antes jsonb;$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'casar_sessao: ancora das variaveis'; END IF;
  v_novo := replace(v_novo, a, b);
  -- (b) a foto, ANTES do "limpa" (que zera o par e o casamento_meta das linhas que vao ser recasadas)
  IF (length(v_novo) - length(replace(v_novo, 'SET match_lancamento_id = NULL, match_lancamento_ids = NULL, casamento_meta = NULL', '')))
     / length('SET match_lancamento_id = NULL, match_lancamento_ids = NULL, casamento_meta = NULL') <> 1 THEN
    RAISE EXCEPTION 'casar_sessao: o "limpa" nao aparece exatamente 1x';
  END IF;
  a := $t$  -- limpa o que vai ser recasado
$t$;
  b := $t$  -- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU (D3): a foto do par (e da marca anterior) das linhas que o "limpa" vai zerar
  SELECT jsonb_object_agg(staging_id::text, jsonb_build_object('m', match_lancamento_id,
           'ant', casamento_meta -> 'par_anterior', 'em', casamento_meta -> 'par_mudou_em'))
    INTO v_pares_antes
    FROM financeiro_classificacao_staging
   WHERE sessao_id = p_sessao_id AND NOT aplicado
     AND match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco');

  -- limpa o que vai ser recasado
$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'casar_sessao: ancora do limpa'; END IF;
  v_novo := replace(v_novo, a, b);
  -- (c) a marca, depois de casar e ANTES da precedencia (que reavalia as marcadas agora)
  a := $t$  PERFORM public._fn_classificacao_precedencia_cru(p_sessao_id);$t$;
  b := $t$  -- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU (D3): par que MUDOU (inclusive de/para sem par) ganha `par_anterior` e `par_mudou_em`;
  -- par que NAO mudou recebe de volta a marca que ja' tinha (o "limpa" a zerou). Grupo e bloco (D7): fora. O `ambiguo` com
  -- candidatos em `match_lancamento_ids` NAO e' grupo: ele perdeu o par e e' marcado.
  UPDATE financeiro_classificacao_staging s
     SET casamento_meta = COALESCE(s.casamento_meta, '{}'::jsonb) || CASE
           WHEN (v_pares_antes -> s.staging_id::text ->> 'm') IS DISTINCT FROM s.match_lancamento_id::text
             THEN jsonb_build_object('par_anterior', v_pares_antes -> s.staging_id::text -> 'm', 'par_mudou_em', now())
           ELSE jsonb_build_object('par_anterior', v_pares_antes -> s.staging_id::text -> 'ant',
                                   'par_mudou_em', v_pares_antes -> s.staging_id::text -> 'em') END
   WHERE s.sessao_id = p_sessao_id AND NOT s.aplicado
     AND s.match_status NOT IN ('sugestao_grupo', 'resolvido_grupo', 'conferido_bloco')
     AND v_pares_antes ? s.staging_id::text
     AND ((v_pares_antes -> s.staging_id::text ->> 'm') IS DISTINCT FROM s.match_lancamento_id::text
          OR jsonb_typeof(v_pares_antes -> s.staging_id::text -> 'em') = 'string');
  PERFORM public._fn_classificacao_precedencia_cru(p_sessao_id);$t$;
  IF (length(v_novo) - length(replace(v_novo, a, ''))) / length(a) <> 1 THEN RAISE EXCEPTION 'casar_sessao: ancora da precedencia'; END IF;
  v_novo := replace(v_novo, a, b);
  EXECUTE replace(pg_get_functiondef(v_oid), v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '01de1fd52769d00018f8058c29cf6a5a' THEN
    RAISE EXCEPTION 'casar_sessao: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
END $mig$;

-- ═══ 3. precedencia — CORPO INTEGRAL (D4, D5, D6) ═════════════════════════════════════════════════════════════════════
DO $g$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_precedencia_cru(uuid)'::regprocedure))
     <> 'f9db83d4d416f16b8fbf97f68b401975' THEN
    RAISE EXCEPTION 'precedencia_cru nao esta no corpo esperado. Migration abortada.';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public._fn_classificacao_precedencia_cru(p_sessao_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  ), planilha AS (
    -- fazenda e fornecedor pelos resolvedores (cobre a sessao antiga, que o populate de antes nao resolvia)
    SELECT o.*, o.pl0 || jsonb_strip_nulls(jsonb_build_object(
             'fazenda_id', COALESCE(o.pl0 ->> 'fazenda_id',
                                    public._fn_classificacao_resolver_fazenda(o.cliente_id, o.excel_fazenda_codigo)::text),
             'favorecido_id', COALESCE(o.pl0 ->> 'favorecido_id',
                                       public._fn_classificacao_resolver_fornecedor(o.cliente_id, o.excel_fornecedor)::text),
             -- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A (D7): a sessao importada antes do PR ganha a cultura no Recasar
             'cultura', COALESCE(o.pl0 ->> 'cultura',
                                 public._fn_classificacao_cultura_da_planilha(o.excel_safra, NULLIF(o.pl0 ->> 'safra_id', '')::uuid)))) AS pl
      FROM operador o
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
$function$;

DO $g$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_precedencia_cru(uuid)'::regprocedure))
     <> 'c30287e0e2edfdbbdf484c998d5c76d7' THEN
    RAISE EXCEPTION 'precedencia_cru: corpo resultante inesperado (md5 %).',
      md5((SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_classificacao_precedencia_cru(uuid)'::regprocedure));
  END IF;
END $g$;
