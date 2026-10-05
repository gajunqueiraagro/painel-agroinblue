-- REC-PROPAGAR-VALOR-DO-MES-01 — o Propagar da recorrencia nao apaga o valor do mes (Gabriel, 05/10/2026).
--
-- POR QUE
--   `fn_recorrencia_propagar`, em "futuros" e "todos", regrava valor = abs(valor_base) — e descricao, fornecedor, fazenda,
--   conta, subcentro, safra, forma e observacao — em TODA linha viva da recorrencia em previsto/programado/agendado sem
--   pagamento, sem olhar o valor atual. O valor da regra e' ESTIMATIVA; o valor e a data do MES vem da planilha (ou de ajuste
--   a' mao) e valem mais. No NJ ha' 31 contas com o valor do mes trazido pela planilha em 05/10
--   (docs/investigacao/fin-import-previsoes-nj-limpeza-01.sql): um clique em Propagar apagaria os 31.
--
-- ESTADO ANTERIOR (medido em 05/10/2026)
--   fn_recorrencia_propagar(uuid, text, boolean)  md5(prosrc) = fdde526a47a8193a7670089cf88b60b4
--     SECURITY DEFINER, search_path = public, ACL {postgres, service_role, authenticated} (sem anon, sem PUBLIC)
--   financeiro_lancamentos_v2 nao tem `valor_do_mes_em` nem `valor_do_mes_origem`.
--   Nada no banco marca "esta ocorrencia foi ajustada": `editado_manual` e' ligado pelo front em QUALQUER edicao (e pelo
--   gatilho so' em linha com lote de importacao) — diz "alguem mexeu", nao "o valor do mes e' este"; `financeiro_recorrencias.
--   tipo_valor` ('exato'|'estimado', todas 'exato') e' da REGRA, nao da ocorrencia; nao ha' tabela de excecao por competencia.
--
-- O QUE MUDA
--   A. A MARCA, na linha do lancamento: `valor_do_mes_em timestamptz` (quando) + `valor_do_mes_origem text`
--      ('planilha' | 'manual'). As duas nulas em todo o resto; CHECK garante que andam juntas. E' um FATO GRAVADO, nao uma
--      comparacao de valores na hora — o `valor_base` da regra pode mudar depois.
--   B. `fn_recorrencia_propagar` PULA a ocorrencia marcada: nenhum campo dela muda (valor, descricao, fazenda, conta,
--      classificacao, competencia). O retorno ganha, NO FIM, `puladas_valor_do_mes` (as do escopo pedido) e `valor_do_mes`
--      {futuros, todos} (as que cada escopo pularia); os campos de antes nao mudam de nome nem de sentido.
--      PATCH GUARDADO POR md5 (origem, 7 ancoras exatamente 1x, destino) — a regra do CLAUDE.md para corpo grande.
--      `CREATE OR REPLACE` preserva a ACL (conferida no fim).
--   C. BACKFILL 'planilha': as 31 contas de recorrencia do NJ que receberam o valor do mes na limpeza de 05/10 (ids do script).
--   D. BACKFILL 'manual' (decisao do Gabriel, 05/10): toda linha viva de recorrencia, em aberto (previsto/programado/agendado,
--      sem data de pagamento), com valor <> abs(valor_base) da regra, em todos os clientes, que nao seja uma das 31 — ja' e'
--      "ajustada" de fato (editada a' mao). A lista e' calculada NA HORA (o Gabriel estava editando a folha da Vera); a marca
--      leva o `updated_at` da linha, que e' quando o ajuste foi feito. GUARDA: mais de 40 linhas, ou cliente fora de Vera/NJ,
--      aborta a migration inteira. Medido em 05/10 antes de aplicar: 8 linhas, todas da Vera.
--   ⚠ A marca pelo MODAL (editar valor/vencimento de uma ocorrencia) NAO entra aqui: fica para o PR da tela, sem gatilho.
-- NAO MUDA: `fn_recorrencia_gerar`, a regra da recorrencia, nenhum outro escritor, nenhuma view (as views sobre a tabela tem as
--   colunas expandidas na criacao; a coluna nova nao aparece nelas).

-- ── A. a marca ─────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN valor_do_mes_em timestamptz,
  ADD COLUMN valor_do_mes_origem text;
ALTER TABLE public.financeiro_lancamentos_v2
  ADD CONSTRAINT fin_lanc_v2_valor_do_mes_chk CHECK (
    (valor_do_mes_em IS NULL AND valor_do_mes_origem IS NULL)
    -- ⚠ `IS NOT NULL` EXPLICITO: `origem IN (...)` com origem nula da' NULL, e CHECK que da' NULL PASSA (achado no ensaio).
    OR (valor_do_mes_em IS NOT NULL AND valor_do_mes_origem IS NOT NULL AND valor_do_mes_origem IN ('planilha', 'manual'))
  );
COMMENT ON COLUMN public.financeiro_lancamentos_v2.valor_do_mes_em IS
  'REC-PROPAGAR-VALOR-DO-MES-01: quando o valor/vencimento DESTE mes foi ajustado (planilha ou a mao). Preenchido = fn_recorrencia_propagar pula a linha.';
COMMENT ON COLUMN public.financeiro_lancamentos_v2.valor_do_mes_origem IS
  'REC-PROPAGAR-VALOR-DO-MES-01: de onde veio o ajuste do mes — planilha | manual.';

-- ── B. o Propagar pula a marcada ───────────────────────────────────────────────────────────────────────────────────────
DO $patch$
DECLARE
  v_oid oid := 'public.fn_recorrencia_propagar(uuid, text, boolean)'::regprocedure;
  v_src text; v_novo text; v_a text; v_b text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> 'fdde526a47a8193a7670089cf88b60b4' THEN
    RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  v_a := $a1$  -- fix2
  v_row record; v_aviso text;
BEGIN
$a1$;
  v_b := $b1$  -- fix2
  v_row record; v_aviso text;
  -- REC-PROPAGAR-VALOR-DO-MES-01: ocorrencias com o valor do mes ajustado (valor_do_mes_em), por grupo
  v_aj_fut int := 0; v_aj_pas int := 0;
BEGIN
$b1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);
  v_a := $a2$  IF p_escopo <> 'nenhum' AND v_sinal_ruim > 0 THEN
$a2$;
  v_b := $b2$  -- REC-PROPAGAR-VALOR-DO-MES-01 (Gabriel, 05/10/2026): o valor da regra e' ESTIMATIVA; o valor e a data do MES (planilha
  -- ou ajuste a' mao) valem mais. Ocorrencia MARCADA (valor_do_mes_em preenchido) e' PULADA: nenhum campo dela muda —
  -- nem valor, nem descricao/fazenda/conta/classificacao, nem competencia. A contagem sai daqui, pelo MESMO predicado.
  SELECT count(*) FILTER (WHERE status_transacao IN ('previsto','programado','agendado','meta') AND data_pagamento IS NULL AND conciliado_em IS NULL),
         count(*) FILTER (WHERE NOT (status_transacao IN ('previsto','programado','agendado','meta') AND data_pagamento IS NULL AND conciliado_em IS NULL))
    INTO v_aj_fut, v_aj_pas
    FROM public.financeiro_lancamentos_v2
   WHERE recorrencia_id = p_recorrencia_id AND coalesce(cancelado,false) = false AND valor_do_mes_em IS NOT NULL;

  IF p_escopo <> 'nenhum' AND v_sinal_ruim > 0 THEN
$b2$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: ancora 2 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);
  v_a := $a3$         CASE WHEN l.data_vencimento IS NULL THEN l.data_competencia
              ELSE (date_trunc('month', l.data_vencimento) - make_interval(months => v_desloc))::date END AS comp_nova,
$a3$;
  v_b := $b3$         -- REC-PROPAGAR-VALOR-DO-MES-01: a ocorrencia ajustada NAO SE MOVE (comp_nova = a que ela tem); assim ela conta
         -- no estado final (colisao, marca, vagas) como o que e': uma linha que fica onde esta'.
         CASE WHEN l.data_vencimento IS NULL OR l.valor_do_mes_em IS NOT NULL THEN l.data_competencia
              ELSE (date_trunc('month', l.data_vencimento) - make_interval(months => v_desloc))::date END AS comp_nova,
$b3$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: ancora 3 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);
  v_a := $a4$    RETURN jsonb_build_object('futuros', v_fut, 'passados', v_pas, 'aplicados_futuros', 0, 'aplicados_passados', 0, 'simulado', p_simular)
        || jsonb_build_object('competencia', v_comp);
$a4$;
  v_b := $b4$    RETURN jsonb_build_object('futuros', v_fut, 'passados', v_pas, 'aplicados_futuros', 0, 'aplicados_passados', 0, 'simulado', p_simular)
        || jsonb_build_object('competencia', v_comp)
        -- REC-PROPAGAR-VALOR-DO-MES-01: quantas o escopo pedido pula, e quantas cada escopo pularia (a tela le' a do escolhido)
        || jsonb_build_object('puladas_valor_do_mes', CASE p_escopo WHEN 'futuros' THEN v_aj_fut WHEN 'todos' THEN v_aj_fut + v_aj_pas ELSE 0 END,
                              'valor_do_mes', jsonb_build_object('futuros', v_aj_fut, 'todos', v_aj_fut + v_aj_pas));
$b4$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: ancora 4 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);
  v_a := $a5$         valor = abs(v_r.valor_base), updated_by = v_uid
   WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
     AND l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL;
$a5$;
  v_b := $b5$         valor = abs(v_r.valor_base), updated_by = v_uid
   WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
     AND l.valor_do_mes_em IS NULL   -- REC-PROPAGAR-VALOR-DO-MES-01: a ajustada fica como esta'
     AND l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL;
$b5$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: ancora 5 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);
  v_a := $a6$     WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
       AND NOT (l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL);
$a6$;
  v_b := $b6$     WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
       AND l.valor_do_mes_em IS NULL   -- REC-PROPAGAR-VALOR-DO-MES-01
       AND NOT (l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL);
$b6$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: ancora 6 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);
  v_a := $a7$           'a_gerar', v_proj -> p_escopo -> 'a_gerar',
           'duplicidades', v_proj -> p_escopo -> 'duplicidades'));
$a7$;
  v_b := $b7$           'a_gerar', v_proj -> p_escopo -> 'a_gerar',
           'duplicidades', v_proj -> p_escopo -> 'duplicidades'))
      || jsonb_build_object('puladas_valor_do_mes', CASE p_escopo WHEN 'futuros' THEN v_aj_fut WHEN 'todos' THEN v_aj_fut + v_aj_pas ELSE 0 END,
                            'valor_do_mes', jsonb_build_object('futuros', v_aj_fut, 'todos', v_aj_fut + v_aj_pas));
$b7$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: ancora 7 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);
  IF md5(v_novo) <> '6a932aa9771cbfb81ae09bbef4572f57' THEN
    RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_recorrencia_propagar(p_recorrencia_id uuid, p_escopo text DEFAULT 'futuros'::text, p_simular boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$, v_novo);
END
$patch$;

-- ── C. backfill: as 31 contas do NJ com o valor do mes da planilha (limpeza de 05/10/2026) ─────────────────────────────
DO $backfill$
DECLARE
  c_ids constant uuid[] := ARRAY[
    '0957386c-772c-4d3e-af26-d61c41876b52',
    '0d620482-069a-4fa5-aa37-7d4bf3169025',
    '0f66be2b-6abf-40fb-9888-94cf0270d356',
    '2a517e43-8cc5-4c92-a767-d35c7eb115e1',
    '2f48e571-acca-4173-a8cc-7513e6cabec1',
    '30bef276-ceb5-4f04-9af8-52601bc1cf09',
    '3407501e-432c-43b7-b467-a69be693c93c',
    '38af62ef-e712-438a-b6ac-2816456ca24b',
    '3cd97ef9-055b-4272-a5ba-9b8d4f62bd76',
    '41b087af-7a3d-4fac-92d2-c59277969390',
    '47e502e7-78ef-40f6-a72f-c86b045b4fcc',
    '50262d86-d07d-4df5-bf34-4b5902f44419',
    '54dd7458-591f-4512-b7c4-4bf0ef06d3e5',
    '58454822-493e-43cf-bd5b-d7dca78045f5',
    '589909af-10f6-488c-95f9-db3c854bf115',
    '666e9ae6-cb4d-454b-83d1-69ffed8b607f',
    '68573320-50c9-445e-903f-746106ea469c',
    '6fbcdfbd-fb6f-4a74-9491-8ce50ea0b210',
    '777bc8ea-05a1-4d3a-a2e1-c360c43d3254',
    '7c47fdd8-9f00-4dbf-b630-8c01c729dd8a',
    '8c746fc4-828f-403c-b932-26a4295dc035',
    '9581c1dd-6d0d-48f6-9830-f6caa880ac0c',
    '9e520992-d77e-4f19-a00a-9b9b697ebba1',
    'a4c50c78-f516-4dda-a269-4eb8a2187c2b',
    'aaa1f023-7d15-4df7-bff5-872812b051e9',
    'b57017cc-dd04-49fd-8519-3030fdc50396',
    'bac38a7f-9557-4148-991f-0ca391ce6914',
    'ca76fa56-5dc9-4a6b-ac3d-f008e36ac29a',
    'dc61535f-8c53-4f9f-9710-c153b741cbac',
    'e34dd733-a871-4040-93ae-573500b8ea93',
    'f4766a16-7d88-4f80-bd5d-f4d56aad2a5b'
  ]::uuid[];
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE id = ANY (c_ids) AND cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' AND recorrencia_id IS NOT NULL
     AND cancelado = false AND valor_do_mes_em IS NULL;
  IF v_n <> 31 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: esperava as 31 contas do NJ vivas e sem marca, achei %', v_n; END IF;
  -- cada uma tem a linha da planilha que lhe deu o valor: cancelada com o motivo da limpeza, mesmo fornecedor
  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2 s
   WHERE s.id = ANY (c_ids) AND EXISTS (
     SELECT 1 FROM public.financeiro_lancamentos_v2 x
      WHERE x.cliente_id = s.cliente_id AND x.origem_lancamento = 'excel' AND x.cancelado = true
        AND x.cancelado_motivo = 'Duplicada na importação Excel de 05/10/2026 — valor do mês levado para a conta da recorrência'
        AND x.favorecido_id IS NOT DISTINCT FROM s.favorecido_id);
  IF v_n <> 31 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: so % das 31 tem a linha da planilha cancelada pela limpeza', v_n; END IF;
  UPDATE public.financeiro_lancamentos_v2
     SET valor_do_mes_em = '2026-10-05 13:36:03+00', valor_do_mes_origem = 'planilha'
   WHERE id = ANY (c_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 31 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: backfill alcancou % (esperado 31)', v_n; END IF;
END
$backfill$;

-- ── D. backfill 'manual': as ocorrencias em aberto ja' ajustadas a' mao (valor <> valor base da regra) ────────────────────────
DO $manual$
DECLARE
  c_vera constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  c_nj   constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_n int; v_fora int; v_m int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE l.cliente_id NOT IN (c_vera, c_nj)) INTO v_n, v_fora
    FROM public.financeiro_lancamentos_v2 l JOIN public.financeiro_recorrencias r ON r.id = l.recorrencia_id
   WHERE l.cancelado = false AND l.status_transacao IN ('previsto', 'programado', 'agendado') AND l.data_pagamento IS NULL
     AND l.valor <> abs(r.valor_base) AND l.valor_do_mes_em IS NULL;
  IF v_fora > 0 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: % linha(s) ajustada(s) a mao em cliente fora de Vera/NJ — conferir antes de marcar', v_fora; END IF;
  IF v_n > 40 THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: % linhas ajustadas a mao (teto 40) — conferir antes de marcar', v_n; END IF;
  UPDATE public.financeiro_lancamentos_v2 l
     SET valor_do_mes_em = l.updated_at, valor_do_mes_origem = 'manual'
    FROM public.financeiro_recorrencias r
   WHERE r.id = l.recorrencia_id
     AND l.cancelado = false AND l.status_transacao IN ('previsto', 'programado', 'agendado') AND l.data_pagamento IS NULL
     AND l.valor <> abs(r.valor_base) AND l.valor_do_mes_em IS NULL;
  GET DIAGNOSTICS v_m = ROW_COUNT;
  IF v_m <> v_n THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: backfill manual alcancou % (contadas %)', v_m, v_n; END IF;
END
$manual$;

-- ── conferencia ────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $confere$
DECLARE
  f regprocedure := 'public.fn_recorrencia_propagar(uuid, text, boolean)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: anon executa a funcao'; END IF;
  IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: authenticated perdeu o EXECUTE'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = f) THEN RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: a funcao deixou de ser SECURITY DEFINER'; END IF;
  IF (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE valor_do_mes_origem = 'planilha') <> 31 THEN
    RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: marcadas pela planilha <> 31';
  END IF;
  IF (SELECT count(*) FROM public.financeiro_lancamentos_v2 WHERE valor_do_mes_origem = 'manual') > 40 THEN
    RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: marcadas a mao > 40';
  END IF;
  -- nenhuma ocorrencia em aberto com valor <> base ficou sem marca
  IF EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 l JOIN public.financeiro_recorrencias r ON r.id = l.recorrencia_id
              WHERE l.cancelado = false AND l.status_transacao IN ('previsto', 'programado', 'agendado') AND l.data_pagamento IS NULL
                AND l.valor <> abs(r.valor_base) AND l.valor_do_mes_em IS NULL) THEN
    RAISE EXCEPTION 'REC-PROPAGAR-VALOR-DO-MES-01: sobrou ocorrencia ajustada sem marca';
  END IF;
END
$confere$;
