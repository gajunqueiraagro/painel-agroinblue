-- CONC-SEM-CLASSIFICACAO-01 — regra unica de "sem plano de contas", os dois avisos da Conciliacao, a leitura do DRE e a lista
-- da tela (Gabriel, 06/10/2026).
--
-- DECISOES: (D1) "sem classificacao" = lancamento ATIVO com `plano_conta_id` NULO, Dividendos por texto inclusive — a excecao
--   "texto fora do plano, exceto Dividendos" NAO vale para esta regra; (D2) lancamento COM plano e SEM fornecedor e' aviso
--   SEPARADO; (D4) a Conciliacao conta so' os REALIZADOS do mes e da conta; (D6) o contador NUNCA muda status, cor nem regua.
--
-- O QUE ENTRA:
--   · `_fn_lancamento_sem_plano` / `_fn_lancamento_sem_fornecedor` — O PREDICADO, num lugar so'. Transferencia (tipo '3-')
--     fica fora dos dois (medido em 06/10: as 4.712 transferencias vivas tem plano).
--   · `_fn_conciliacao_sem_classificacao_mes` — a contagem por conta dos realizados do mes (o MESMO recorte de "realizado" que
--     a tela usava: vivo, com caixa, status e cenario 'realizado', pago no mes); a conta e' a da direcao
--     (`_fn_conta_do_lancamento`). Somas do CRU; o arredondamento e' so' na saida (`_fn_avisos_sem_classificacao`).
--   · `_fn_conciliacao_resumo` (md5 04aa7a4d773b7d58dcdf94d7e9415daf -> eb5f162e679599ffbdce0a478d6c78cb) e `fn_conciliacao_status_ano`
--     (md5 ab397ac3b920cc3ffec95ed91914ef6d -> a7c3ee430a203d02e5ce5515b9481b95): PATCH GUARDADO POR md5. A coluna `avisos` ganha, NO FIM e so'
--     com qtde > 0, {motivo:'sem_classificacao', qtde, valor_entradas, valor_saidas} e {motivo:'sem_fornecedor', qtde} — na linha
--     de conta, no subtotal do tipo e no total. ADITIVO: status, motivos, os avisos de antes, `contas_com_aviso` (qtde,
--     qtde_alem_sem_extrato, por_aviso) e as contas citadas em `contas_nao_conciliadas` NAO mudam. Assinatura, retorno, ACL,
--     SECURITY DEFINER e configuracao iguais. `fn_conciliacao_resumo_mes` nao e' tocada (repassa a interna).
--   · `fn_dre_sem_classificacao` — a leitura do DRE: cliente + periodo de competencia (pecuaria) ou safra (lavoura), fazenda e
--     cenario opcionais -> {qtde, valor_entradas, valor_saidas}. ⚠ lancamento sem plano NAO TEM atividade (ela vem do plano):
--     o recorte e' o do periodo (ou da safra gravada no lancamento), nao o da atividade.
--   · `fn_conciliacao_sem_classificacao_lista` — a lista da tela: os realizados sem plano do cliente, mes e conta, com o que
--     falta, o resumo e a SUGESTAO. A sugestao e' a de `fn_classificacao_resolver_contexto` (regra, apelido, plano) — nenhum
--     segundo motor; so' vale com conta ATIVA e do MESMO tipo do lancamento; sem resposta = sem sugestao.
-- NAO MUDAM: fn_dre_pecuaria, fn_dre_lavoura, fn_dre_agricola_por_safra, o gatilho de classificacao e nenhum dado.

-- ═══ 1. O PREDICADO ═══
CREATE OR REPLACE FUNCTION public._fn_lancamento_sem_plano(p_cancelado boolean, p_plano_conta_id uuid, p_tipo_operacao text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- CONC-SEM-CLASSIFICACAO-01 (D1): SEM CLASSIFICACAO = ativo e sem plano de contas. Ponto. Transferencia fica fora.
  SELECT NOT coalesce(p_cancelado, false) AND p_plano_conta_id IS NULL AND coalesce(p_tipo_operacao, '') NOT LIKE '3-%'
$function$;

CREATE OR REPLACE FUNCTION public._fn_lancamento_sem_fornecedor(p_cancelado boolean, p_plano_conta_id uuid, p_favorecido_id uuid, p_tipo_operacao text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- CONC-SEM-CLASSIFICACAO-01 (D2): COM plano e SEM fornecedor — aviso separado (o sem plano ja' e' contado no outro).
  SELECT NOT coalesce(p_cancelado, false) AND p_plano_conta_id IS NOT NULL AND p_favorecido_id IS NULL
         AND coalesce(p_tipo_operacao, '') NOT LIKE '3-%'
$function$;

-- ═══ 2. A CONTAGEM DO MES, POR CONTA ═══
CREATE OR REPLACE FUNCTION public._fn_conciliacao_sem_classificacao_mes(p_cliente_id uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT coalesce(jsonb_object_agg(k.conta::text, jsonb_build_object('sc_q', k.sc_q, 'sc_e', k.sc_e, 'sc_s', k.sc_s, 'sf_q', k.sf_q)),
                  '{}'::jsonb)
    FROM (SELECT public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id) AS conta,
                 count(*) FILTER (WHERE x.sp) AS sc_q,
                 coalesce(sum(abs(l.valor)) FILTER (WHERE x.sp AND l.tipo_operacao = '1-Entradas'), 0) AS sc_e,
                 coalesce(sum(abs(l.valor)) FILTER (WHERE x.sp AND l.tipo_operacao = '2-Saídas'), 0) AS sc_s,
                 count(*) FILTER (WHERE x.sf) AS sf_q
            FROM public.financeiro_lancamentos_v2 l
            CROSS JOIN LATERAL (SELECT public._fn_lancamento_sem_plano(l.cancelado, l.plano_conta_id, l.tipo_operacao) AS sp,
                                       public._fn_lancamento_sem_fornecedor(l.cancelado, l.plano_conta_id, l.favorecido_id,
                                                                            l.tipo_operacao) AS sf) x
           WHERE l.cliente_id = p_cliente_id AND l.cancelado = false AND l.sem_movimentacao_caixa = false
             AND l.status_transacao = 'realizado' AND l.cenario = 'realizado'
             AND l.data_pagamento BETWEEN p_de AND p_ate
             AND (x.sp OR x.sf)
           GROUP BY 1) k
   WHERE k.conta IS NOT NULL
$function$;

-- a FORMA dos dois avisos, num lugar so' (linha de conta e agregados): so' com qtde > 0; valores a 2 casas na SAIDA
CREATE OR REPLACE FUNCTION public._fn_avisos_sem_classificacao(p_qtde integer, p_entradas numeric, p_saidas numeric, p_sem_fornecedor integer)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT (CASE WHEN coalesce(p_qtde, 0) > 0
               THEN jsonb_build_array(jsonb_build_object('motivo', 'sem_classificacao', 'qtde', p_qtde,
                      'valor_entradas', round(coalesce(p_entradas, 0), 2), 'valor_saidas', round(coalesce(p_saidas, 0), 2)))
               ELSE '[]'::jsonb END)
      || (CASE WHEN coalesce(p_sem_fornecedor, 0) > 0
               THEN jsonb_build_array(jsonb_build_object('motivo', 'sem_fornecedor', 'qtde', p_sem_fornecedor))
               ELSE '[]'::jsonb END)
$function$;

-- ═══ 3. O DONO DA CONCILIACAO GANHA OS DOIS AVISOS (patch guardado por md5) ═══
DO $mig$
DECLARE
  v_oid oid := 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text[]; v_b text[];
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '04aa7a4d773b7d58dcdf94d7e9415daf' THEN
    RAISE EXCEPTION 'CONC-SEM-CLASSIFICACAO-01 (_fn_conciliacao_resumo): corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  -- ancora 1
  v_a := v_a || $a1$  v_avi jsonb; v_pdif numeric; v_pfim numeric; v_navi int; v_nalem int; v_poravi jsonb; v_ppos numeric; v_jul numeric; v_tem_pos boolean;
$a1$::text;
  v_b := v_b || $b1$  v_avi jsonb; v_pdif numeric; v_pfim numeric; v_navi int; v_nalem int; v_poravi jsonb; v_ppos numeric; v_jul numeric; v_tem_pos boolean;
  -- CONC-SEM-CLASSIFICACAO-01
  v_sc jsonb; v_scc jsonb;
$b1$::text;
  -- ancora 2
  v_a := v_a || $a2$  v_ant := to_char(v_d1 - interval '1 month', 'YYYY-MM');
$a2$::text;
  v_b := v_b || $b2$  v_ant := to_char(v_d1 - interval '1 month', 'YYYY-MM');
  -- CONC-SEM-CLASSIFICACAO-01 (Gabriel, 06/10): os REALIZADOS do mes SEM PLANO DE CONTAS e os COM plano e SEM fornecedor, por
  -- conta, numa leitura so' por chamada. O predicado mora em `_fn_lancamento_sem_plano` / `_fn_lancamento_sem_fornecedor`.
  -- Viram os avisos 'sem_classificacao' e 'sem_fornecedor' — que, como todo aviso, NUNCA mudam o status — e ficam FORA da
  -- contagem `contas_com_aviso` (a marca ambar da regua e' so' do extrato).
  v_sc := public._fn_conciliacao_sem_classificacao_mes(p_cliente_id, v_d1, v_d2);
$b2$::text;
  -- ancora 3
  v_a := v_a || $a3$    dias_com_diferenca := v_dias; status := v_status; motivos := v_mot; avisos := v_avi;
$a3$::text;
  v_b := v_b || $b3$    v_scc := coalesce(v_sc->(c.id::text), '{}'::jsonb);
    dias_com_diferenca := v_dias; status := v_status; motivos := v_mot;
    avisos := v_avi || public._fn_avisos_sem_classificacao((v_scc->>'sc_q')::int, (v_scc->>'sc_e')::numeric,
                                                           (v_scc->>'sc_s')::numeric, (v_scc->>'sf_q')::int);
$b3$::text;
  -- ancora 4
  v_a := v_a || $a4$      'p_dif', proprio->'diferenca'));
$a4$::text;
  v_b := v_b || $b4$      'p_dif', proprio->'diferenca',
      'sc_q', v_scc->'sc_q', 'sc_e', v_scc->'sc_e', 'sc_s', v_scc->'sc_s', 'sf_q', v_scc->'sf_q'));
$b4$::text;
  -- ancora 5
  v_a := v_a || $a5$                   ELSE '[]'::jsonb END;
    conta_id := NULL; conta_nome := g.rot;$a5$::text;
  v_b := v_b || $b5$                   ELSE '[]'::jsonb END;
    -- CONC-SEM-CLASSIFICACAO-01: o agregado soma o CRU das contas dele (cada lancamento esta' em exatamente uma conta)
    avisos := avisos || (SELECT public._fn_avisos_sem_classificacao(sum((y->>'sc_q')::int)::int, sum((y->>'sc_e')::numeric),
                                                                    sum((y->>'sc_s')::numeric), sum((y->>'sf_q')::int)::int)
                           FROM jsonb_array_elements(v_contas) y WHERE g.k IS NULL OR y->>'grupo' = g.k);
    conta_id := NULL; conta_nome := g.rot;$b5$::text;
  FOR i IN 1..array_length(v_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'CONC-SEM-CLASSIFICACAO-01 (_fn_conciliacao_resumo): a ancora % nao casa exatamente 1x', i;
    END IF;
    v_novo := replace(v_novo, v_a[i], v_b[i]);
  END LOOP;
  IF md5(v_novo) <> 'eb5f162e679599ffbdce0a478d6c78cb' THEN
    RAISE EXCEPTION 'CONC-SEM-CLASSIFICACAO-01 (_fn_conciliacao_resumo): corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public._fn_conciliacao_resumo(p_cliente_id uuid, p_ano_mes text, p_conta_ids uuid[], p_detalhe boolean, p_sem_conta boolean)
 RETURNS TABLE(conta_id uuid, conta_nome text, consolida_em_conta_id uuid, tem_extrato boolean, saldo_inicial numeric, entradas numeric, saidas numeric, saldo_sistema numeric, saldo_extrato numeric, saldo_extrato_data date, diferenca numeric, banco jsonb, extratos_sem_par jsonb, lancamentos_sem_par jsonb, retido_em_depositos jsonb, dias_com_diferenca jsonb, status text, motivos jsonb, legado jsonb, nivel text, tipo_conta text, entradas_terceiros numeric, entradas_transferencias numeric, saidas_terceiros numeric, saidas_transferencias numeric, saldo_inicial_origem text, posicao jsonb, dias jsonb, linhas_sistema jsonb, sem_conta jsonb, diferenca_entradas numeric, diferenca_saidas numeric, proprio jsonb, par_conta_id uuid, par_status text, internas jsonb, avisos jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> 'eb5f162e679599ffbdce0a478d6c78cb' THEN
    RAISE EXCEPTION 'CONC-SEM-CLASSIFICACAO-01 (_fn_conciliacao_resumo): ACL, SECURITY DEFINER, configuracao ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;

DO $mig$
DECLARE
  v_oid oid := 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text[]; v_b text[];
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> 'ab397ac3b920cc3ffec95ed91914ef6d' THEN
    RAISE EXCEPTION 'CONC-SEM-CLASSIFICACAO-01 (fn_conciliacao_status_ano): corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  -- ancora 1
  v_a := v_a || $a1$                                                            'por_aviso', jsonb_build_object('sem_extrato', v_omit_av)))
             END$a1$::text;
  v_b := v_b || $b1$                                                            'por_aviso', jsonb_build_object('sem_extrato', v_omit_av)))
                       -- CONC-SEM-CLASSIFICACAO-01: sem 'contas_com_aviso' o total ainda pode trazer 'sem_classificacao' /
                       -- 'sem_fornecedor' — ficam, depois do aviso das contas (antes este ramo so' via a lista vazia)
                       || r.avisos
             END$b1$::text;
  FOR i IN 1..array_length(v_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'CONC-SEM-CLASSIFICACAO-01 (fn_conciliacao_status_ano): a ancora % nao casa exatamente 1x', i;
    END IF;
    v_novo := replace(v_novo, v_a[i], v_b[i]);
  END LOOP;
  IF md5(v_novo) <> 'a7c3ee430a203d02e5ce5515b9481b95' THEN
    RAISE EXCEPTION 'CONC-SEM-CLASSIFICACAO-01 (fn_conciliacao_status_ano): corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_conciliacao_status_ano(p_cliente_id uuid, p_ano integer)
 RETURNS TABLE(ano_mes text, nivel text, conta_id uuid, conta_nome text, tipo_conta text, status text, motivos jsonb, avisos jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> 'a7c3ee430a203d02e5ce5515b9481b95' THEN
    RAISE EXCEPTION 'CONC-SEM-CLASSIFICACAO-01 (fn_conciliacao_status_ano): ACL, SECURITY DEFINER, configuracao ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;


-- ═══ 4. A LEITURA DO DRE ═══
CREATE OR REPLACE FUNCTION public.fn_dre_sem_classificacao(p_cliente_id uuid, p_de text DEFAULT NULL::text, p_ate text DEFAULT NULL::text, p_safra_id uuid DEFAULT NULL::uuid, p_fazenda_id uuid DEFAULT NULL::uuid, p_cenario text DEFAULT 'realizado'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
-- CONC-SEM-CLASSIFICACAO-01 — quanto o DRE deste recorte NAO ESTA' VENDO por falta de plano de contas (o join com o plano
-- descarta o lancamento em silencio). Pecuaria: `p_de`/`p_ate` ('YYYY-MM', a competencia, como `fn_dre_pecuaria`). Lavoura:
-- `p_safra_id` (a safra gravada no lancamento, como `fn_dre_lavoura`). O predicado e' `_fn_lancamento_sem_plano`.
DECLARE v_ini date; v_fim date; v jsonb;
BEGIN
  IF p_cliente_id IS NULL OR NOT coalesce(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_safra_id IS NULL THEN
    IF coalesce(p_de, '') !~ '^\d{4}-\d{2}$' OR coalesce(p_ate, '') !~ '^\d{4}-\d{2}$' THEN
      RAISE EXCEPTION 'informe o periodo (p_de e p_ate, YYYY-MM) ou a safra';
    END IF;
    v_ini := to_date(p_de || '-01', 'YYYY-MM-DD');
    v_fim := (to_date(p_ate || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  END IF;
  SELECT jsonb_build_object('qtde', count(*),
           'valor_entradas', round(coalesce(sum(abs(l.valor)) FILTER (WHERE l.tipo_operacao = '1-Entradas'), 0), 2),
           'valor_saidas', round(coalesce(sum(abs(l.valor)) FILTER (WHERE l.tipo_operacao = '2-Saídas'), 0), 2))
    INTO v
    FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = p_cliente_id AND l.cancelado = false
     AND public._fn_lancamento_sem_plano(l.cancelado, l.plano_conta_id, l.tipo_operacao)
     AND l.cenario = coalesce(p_cenario, 'realizado')
     AND (p_fazenda_id IS NULL OR l.fazenda_id = p_fazenda_id)
     AND CASE WHEN p_safra_id IS NOT NULL THEN l.safra_id = p_safra_id
              ELSE l.data_competencia BETWEEN v_ini AND v_fim END;
  RETURN v;
END
$function$;

-- ═══ 5. A LISTA DA TELA ═══
CREATE OR REPLACE FUNCTION public.fn_conciliacao_sem_classificacao_lista(p_cliente_id uuid, p_ano_mes text, p_conta_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- CONC-SEM-CLASSIFICACAO-01 — os REALIZADOS SEM PLANO do cliente, do mes e da conta (NULL = todas), o MESMO recorte do aviso
-- 'sem_classificacao' de `fn_conciliacao_resumo_mes` (a quantidade daqui e' a de la'). Devolve
--   { resumo: {qtde, valor_entradas, valor_saidas, com_sugestao, sem_sugestao, aguarda_conta}, linhas: [...] }.
-- SUGESTAO = `fn_classificacao_resolver_contexto` (regra, apelido, plano), com o texto do subcentro, o nome do fornecedor, a
-- descricao e o historico do banco do lancamento. So' vale com conta do plano ATIVA e do MESMO tipo do lancamento (a direcao
-- e' a do tipo da conta). `aguarda_conta` = ha' texto de subcentro gravado e nenhuma conta do plano para ele (os Dividendos por
-- texto, CONC-DIVIDENDOS-PLANO-01). A tela nao conta nem soma: le' o `resumo`.
DECLARE
  v_d1 date; v_d2 date; r record; v_s jsonb; v_sug jsonb; v_linhas jsonb := '[]'::jsonb;
  v_q int := 0; v_e numeric := 0; v_sd numeric := 0; v_com int := 0; v_agu int := 0; v_p record;
BEGIN
  IF p_cliente_id IS NULL OR NOT coalesce(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_ano_mes, '') !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'p_ano_mes (YYYY-MM) obrigatorio'; END IF;
  IF p_conta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM financeiro_contas_bancarias b
                                             WHERE b.id = p_conta_id AND b.cliente_id = p_cliente_id) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  v_d1 := to_date(p_ano_mes || '-01', 'YYYY-MM-DD');
  v_d2 := (v_d1 + interval '1 month' - interval '1 day')::date;

  FOR r IN
    SELECT l.id, l.data_pagamento, l.tipo_operacao, l.valor, l.descricao, l.observacao, l.subcentro, l.centro_custo,
           l.favorecido_id, f.nome AS favorecido_nome, k.conta AS conta_id,
           coalesce(b.nome_exibicao, b.nome_conta) AS conta_nome,
           (SELECT e.descricao FROM conciliacao_bancaria_itens i JOIN extrato_bancario_v2 e ON e.id = i.extrato_id
             WHERE i.lancamento_id = l.id AND i.desfeito_em IS NULL ORDER BY e.data_movimento, e.id LIMIT 1) AS historico_banco
      FROM financeiro_lancamentos_v2 l
      CROSS JOIN LATERAL (SELECT public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id) AS conta) k
      LEFT JOIN financeiro_fornecedores f ON f.id = l.favorecido_id
      LEFT JOIN financeiro_contas_bancarias b ON b.id = k.conta
     WHERE l.cliente_id = p_cliente_id AND l.cancelado = false AND l.sem_movimentacao_caixa = false
       AND l.status_transacao = 'realizado' AND l.cenario = 'realizado'
       AND l.data_pagamento BETWEEN v_d1 AND v_d2
       AND public._fn_lancamento_sem_plano(l.cancelado, l.plano_conta_id, l.tipo_operacao)
       AND k.conta IS NOT NULL AND (p_conta_id IS NULL OR k.conta = p_conta_id)
     ORDER BY abs(l.valor) DESC, l.data_pagamento, l.id
  LOOP
    v_sug := NULL;
    v_s := public.fn_classificacao_resolver_contexto(p_cliente_id, jsonb_strip_nulls(jsonb_build_object(
             'subcentro', r.subcentro, 'fornecedor', r.favorecido_nome, 'produto', r.descricao,
             'observacao', coalesce(r.historico_banco, r.observacao), 'tipo_operacao', r.tipo_operacao,
             'data', r.data_pagamento, 'valor', abs(r.valor))), true);
    IF coalesce((v_s->>'ok')::boolean, false) THEN
      SELECT p.id, p.subcentro, p.centro_custo, p.grupo_custo, p.macro_custo INTO v_p
        FROM financeiro_plano_contas p
       WHERE p.id = (v_s->>'plano_conta_id')::uuid AND p.ativo AND p.tipo_operacao = r.tipo_operacao
         AND (p.cliente_id IS NULL OR p.cliente_id = p_cliente_id);
      IF FOUND THEN
        v_sug := jsonb_build_object('plano_conta_id', v_p.id, 'subcentro', v_p.subcentro, 'centro_custo', v_p.centro_custo,
                   'grupo_custo', v_p.grupo_custo, 'macro_custo', v_p.macro_custo, 'origem', v_s->>'tier',
                   'regra_id', v_s->'regra_id', 'alias_id', v_s->'alias_id');
      END IF;
    END IF;
    v_q := v_q + 1;
    IF r.tipo_operacao = '1-Entradas' THEN v_e := v_e + abs(r.valor); ELSE v_sd := v_sd + abs(r.valor); END IF;
    IF v_sug IS NOT NULL THEN v_com := v_com + 1; END IF;
    IF v_sug IS NULL AND coalesce(btrim(r.subcentro), '') <> '' THEN v_agu := v_agu + 1; END IF;
    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'data', r.data_pagamento, 'conta_id', r.conta_id, 'conta_nome', r.conta_nome,
      'historico_banco', r.historico_banco, 'descricao', r.descricao, 'tipo_operacao', r.tipo_operacao, 'valor', abs(r.valor),
      'favorecido_id', r.favorecido_id, 'favorecido_nome', r.favorecido_nome, 'subcentro_texto', nullif(btrim(r.subcentro), ''),
      'falta', jsonb_build_object('subcentro', true, 'fornecedor', r.favorecido_id IS NULL,
                                  'centro', coalesce(btrim(r.centro_custo), '') = ''),
      'aguarda_conta', v_sug IS NULL AND coalesce(btrim(r.subcentro), '') <> '',
      'sugestao', v_sug));
  END LOOP;

  RETURN jsonb_build_object(
    'resumo', jsonb_build_object('qtde', v_q, 'valor_entradas', round(v_e, 2), 'valor_saidas', round(v_sd, 2),
                                 'com_sugestao', v_com, 'sem_sugestao', v_q - v_com, 'aguarda_conta', v_agu),
    'linhas', v_linhas);
END
$function$;

-- ═══ 6. PERMISSOES (funcao nova nasce fechada: so' postgres e service_role) ═══
GRANT EXECUTE ON FUNCTION public.fn_dre_sem_classificacao(uuid, text, text, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_sem_classificacao_lista(uuid, text, uuid) TO authenticated, service_role;

DO $chk$
BEGIN
  IF has_function_privilege('anon', 'public.fn_dre_sem_classificacao(uuid, text, text, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_conciliacao_sem_classificacao_lista(uuid, text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_lancamento_sem_plano(boolean, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_conciliacao_sem_classificacao_mes(uuid, date, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_dre_sem_classificacao(uuid, text, text, uuid, uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_conciliacao_sem_classificacao_lista(uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONC-SEM-CLASSIFICACAO-01: permissoes diferentes do esperado';
  END IF;
END
$chk$;
