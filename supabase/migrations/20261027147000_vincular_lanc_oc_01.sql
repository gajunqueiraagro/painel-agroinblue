-- VINCULAR-LANC-OC-01 — pendurar um lancamento financeiro JA EXISTENTE numa Operacao Comercial
--
-- POR QUE
-- Funrural, Fundersul, Iagro, frete, comissao, recebimento de abate/boitel e compra de reposicao
-- lancados a mao, por OFX ou por importacao ficam fora da OC. A OC nao os soma, o operador os ve
-- em duas telas e, quando a OC tambem gerou o titulo daquele componente, o mesmo dinheiro existe
-- duas vezes. Regras do Gabriel: o financeiro conciliado manda no VALOR; a data da OC manda na
-- COMPETENCIA; nunca somar; um motivo por gesto.
--
-- O MODELO VIVO E' O UNICO CAMINHO: compromisso -> programacao -> parcela -> parte -> titulo.
--   `oc_adotar_titulo_financeiro` (md5 f92fb3bd) NAO serve: grava parte `origem='manual'` SEM
--   parcela (a view `vw_oc_operacao_compromissos_resumo` passa a dizer `misto_inconsistente`),
--   recusa saida em venda/abate, nao move competencia e nao tem chamador. Fica como esta'.
--   O titulo adotado fica EXATAMENTE como um titulo materializado e pago fica hoje:
--     parcela `materializada` (o estado `paga` nao e' escrito por funcao nenhuma do banco — os 117
--       titulos realizados de OC tem parcela `materializada`), parte `origem='programacao'` com
--       `programacao_parcela_id`, `incluso_no_total=false`, `valor` = parcela = titulo.
--   Por isso as telas da OC, o "Gerar previsao", o "Desfazer compromisso" (`oc_estornar_materializacao`
--   recusa titulo realizado/conciliado, como deve) e o revalorar (com programacao devolve `pendente`)
--   reconhecem o titulo adotado sem mudar uma linha.
--   ⚠ PRECEDENTE MANUAL: 91e6a216 (Vera, 7f7de76f, frete 3.991,80) e' este mesmo gesto feito a mao em
--     31/08 ("curativo maio"): o titulo materializado 1b76c682 foi cancelado e a parte re-apontada ao
--     avulso conciliado. Aqui a parte velha e' CANCELADA e uma nova nasce na mesma parcela (o indice
--     `zoo_operacao_partes_parcela_prog_ativa_uniq` e' parcial em `cancelada=false`), porque a parte
--     velha guarda a trilha do titulo que ela representou.
--
-- D1  titulo vivo da OC para o compromisso escolhido: o lancamento SUBSTITUI. O titulo da OC e' cancelado
--     (motivo do gesto) SO se nao estiver liquidado; realizado, conciliado ou com liquidacao ativa ->
--     recusa, devolvendo os dois (sem escrever nada). `agendado` CONTA COMO ABERTO e e' substituido
--     (decisao do Gabriel); o envelope devolve o `status_transacao` do titulo substituido.
-- SIMULACAO: `p_simular = true` percorre o MESMO caminho e desfaz tudo no fim (subtransacao), sem
--     exigir motivo nem versao (o idioma de `oc_reprogramar_compromisso_do_lote`). E' dela que a tela
--     monta o "o que vai acontecer" — nenhuma regra copiada no front.
-- D2  o componente vem confirmado pelo operador (a sugestao e' de `oc_candidatas_vinculo`).
--     COMPONENTE NAO E' UNICO POR OC (medido: 12 compromissos `taxas_impostos` repetidos — Iagro e
--     Fundersul na mesma OC; 14 parcelados). Mais de um compromisso vivo do componente -> recusa
--     `escolher_compromisso` com a lista; mais de uma parcela -> `escolher_parcela`.
-- D3  importados: a competencia muda e o HASH ORIGINAL FICA — e fica POR CONSTRUCAO, sem tocar em
--     gatilho nenhum. `compute_financeiro_lancamento_v2_hash` RECEBE `_data_competencia` e NAO A USA:
--     o hash e' cliente | fazenda | pagamento | valor | tipo | conta | favorecido | descricao | documento.
--     (A FASE 0 afirmou o contrario, lendo so' a lista de argumentos. Medido na prova: um UPDATE cru da
--     competencia de um importado deixa o hash identico.) A RPC nao muda nenhum desses campos e ainda
--     CONFERE o invariante: se o hash depois do UPDATE diferir do de antes, ela aborta — no dia em que
--     alguem puser a competencia no hash, o vinculo para de funcionar em vez de trocar a identidade
--     de importacao calado.
--     ⚠ E A REIMPORTACAO NEM USA O HASH: `useImportLancamentosExcel` reconhece a linha pela regua
--       `classificar_nivel_duplicidade` (pagamento + valor + conta + descricao...), que tambem nao le
--       competencia. Quem le o hash e' `buscar_duplicados_retroativo`.
-- D4  lancamento com `movimentacao_rebanho_id`: o elo e' SOLTO (null, como no AGNALDO-DEDUP-01b) e o id
--     antigo vai para a trilha. O zootecnico nao se mexe. Se a OC ja tem movimento proprio em
--     `zoo_operacao_movimentacoes` e o antigo nao e' um deles, a RPC vincula e devolve o aviso
--     `movimento_duplicado` com os ids — o dobro do REBANHO nao e' resolvido aqui.
--
-- ⚠ CONCILIACAO: nada aqui toca `data_pagamento`, `valor` ou `conta_bancaria_id` do lancamento — o
--   snapshot da conciliacao (`fn_snapshot_conciliacao`) guarda pagamento e valor. A conciliacao segue.
-- ⚠ SAFRA E FAVORECIDO sao do Financeiro (fronteira OC x Financeiro): nao mudam; divergencia vira aviso.
--
-- METODO: quatro funcoes NOVAS, nenhuma existente alterada. Todas nascem com rodape de ACL (EXECUTE
--   nunca para PUBLIC/anon). Provado em BEGIN ... ROLLBACK no proto, com o md5 de cada corpo conferido
--   contra este arquivo.

-- ─── 1. O mapa: que subcentro vai para que tipo de OC, natureza e componente ─────────────────
-- Medido das 178 partes vivas (FASE 0, item 3). Uma fonte so', lida pela RPC e pelas candidatas.
-- Fora do mapa de proposito: Venda de Tropa (1060) e Taxas e Impostos Fixos Pecuaria (6090).
CREATE OR REPLACE FUNCTION public._oc_vinculo_mapa()
 RETURNS TABLE(subcentro text, tipos_oc text[], natureza text, componentes text[], tipo_operacao text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT m.subcentro, m.tipos_oc, m.natureza, m.componentes, m.tipo_operacao
    FROM (VALUES
      ('Abates de Fêmeas'::text,                      ARRAY['abate']::text[],          'principal'::text, ARRAY['principal']::text[],                                      '1-Entradas'::text),
      ('Abates de Machos',                             ARRAY['abate'],                  'principal',       ARRAY['principal'],                                              '1-Entradas'),
      ('Venda de Desmama Fêmeas',                      ARRAY['venda'],                  'principal',       ARRAY['principal'],                                              '1-Entradas'),
      ('Venda de Desmama Machos',                      ARRAY['venda'],                  'principal',       ARRAY['principal'],                                              '1-Entradas'),
      ('Venda de Fêmeas Adultas',                      ARRAY['venda'],                  'principal',       ARRAY['principal'],                                              '1-Entradas'),
      ('Venda de Machos Adultos',                      ARRAY['venda'],                  'principal',       ARRAY['principal'],                                              '1-Entradas'),
      ('Venda em Boitel',                              ARRAY['venda'],                  'principal',       ARRAY['principal'],                                              '1-Entradas'),
      ('Adiantamento de Boitel',                       ARRAY['venda'],                  'obrigacao',       ARRAY['adiantamento'],                                           '2-Saídas'),
      ('Devolução de Adiantamento de Boitel',          ARRAY['venda'],                  'obrigacao',       ARRAY['adiantamento_devolvido'],                                 '1-Entradas'),
      ('Impostos e Despesas de Abates e Vendas',       ARRAY['venda','abate'],          'obrigacao',       ARRAY['taxas_impostos','frete','comissao','taxa_aquisicao'],     '2-Saídas'),
      ('Investimento Compra Bovinos Fêmeas',           ARRAY['compra'],                 'principal',       ARRAY['principal'],                                              '2-Saídas'),
      ('Investimento Compra Bovinos Machos',           ARRAY['compra'],                 'principal',       ARRAY['principal'],                                              '2-Saídas'),
      ('Investimento Frete/Comissão Compra Bovinos',   ARRAY['compra'],                 'obrigacao',       ARRAY['frete','comissao','taxa_aquisicao'],                      '2-Saídas')
    ) AS m(subcentro, tipos_oc, natureza, componentes, tipo_operacao);
$function$;

-- ─── 2. D2: o componente sugerido pela descricao (so' sugestao — a RPC recebe o confirmado) ────
CREATE OR REPLACE FUNCTION public._oc_vinculo_sugerir_componente(p_descricao text, p_subcentro text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN m.componentes IS NULL THEN NULL
           WHEN cardinality(m.componentes) = 1
             THEN jsonb_build_object('codigo', m.componentes[1], 'rotulo', NULL, 'fonte', 'subcentro')
           WHEN s.codigo IS NOT NULL AND s.codigo = ANY (m.componentes)
             THEN jsonb_build_object('codigo', s.codigo, 'rotulo', s.rotulo, 'fonte', 'descricao')
           ELSE NULL
         END
    FROM (SELECT lower(coalesce(p_descricao, '')) AS d) x
    LEFT JOIN public._oc_vinculo_mapa() m ON m.subcentro = p_subcentro
    LEFT JOIN LATERAL (
      SELECT CASE
               WHEN x.d ~ 'fundersul'             THEN 'taxas_impostos'
               WHEN x.d ~ '(iagro|gta)'           THEN 'taxas_impostos'
               WHEN x.d ~ '(funrural|senar|inss)' THEN 'taxas_impostos'
               WHEN x.d ~ 'icms'                  THEN 'taxa_aquisicao'
               WHEN x.d ~ '(frete|comitiva)'      THEN 'frete'
               WHEN x.d ~ 'comiss'                THEN 'comissao'
             END AS codigo,
             CASE
               WHEN x.d ~ 'fundersul'             THEN 'Fundersul'
               WHEN x.d ~ '(iagro|gta)'           THEN 'Iagro/GTA'
               WHEN x.d ~ '(funrural|senar|inss)' THEN 'Funrural/Senar'
               WHEN x.d ~ 'icms'                  THEN 'ICMS'
               WHEN x.d ~ '(frete|comitiva)'      THEN 'Frete'
               WHEN x.d ~ 'comiss'                THEN 'Comissão'
             END AS rotulo
    ) s ON true;
$function$;

-- ─── 3. A RPC ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_vincular_lancamento(
  p_operacao_id uuid,
  p_versao_esperada integer,
  p_lancamento_id uuid,
  p_componente text,
  p_motivo text,
  p_compromisso_id uuid DEFAULT NULL,
  p_parcela_id uuid DEFAULT NULL,
  p_criar_novo boolean DEFAULT false,
  p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(), '') = 'service_role');
  v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais;
  v_cli uuid;
  v_l public.financeiro_lancamentos_v2;
  v_l_depois public.financeiro_lancamentos_v2;
  v_regra record;
  v_natureza text; v_componente text;
  v_valor numeric;
  v_comp public.zoo_operacao_compromissos;
  v_comp_antes jsonb; v_comp_acao text; v_comp_valor_antes numeric;
  v_prog_id uuid; v_prog_criada boolean := false;
  v_parc public.zoo_operacao_parcelas_programacao;
  v_parc_acao text;
  v_parte_velha public.zoo_operacao_partes;
  v_tit_velho public.financeiro_lancamentos_v2;
  v_tit_substituido jsonb;
  v_n int; v_qtd int; v_seq int;
  v_parte_id uuid; v_lote uuid;
  v_soma numeric; v_base numeric; v_soma_principal numeric;
  v_comp_nova date; v_mov_antigo uuid; v_movs_oc jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_lista jsonb;
  v_vinculo_id uuid := gen_random_uuid();
  v_nova int;
  v_conc boolean;
  v_ret jsonb;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  IF p_simular IS NOT TRUE AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
    RAISE EXCEPTION 'Vincular lancamento exige motivo' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;
  v_tem_acesso := (v_actor IS NOT NULL AND v_cli IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501'; END IF;
  IF p_simular IS NOT TRUE AND v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN
    RAISE EXCEPTION 'Operacao em rascunho nao aceita vinculo de lancamento' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao aceita vinculo de lancamento' USING ERRCODE = 'P0001'; END IF;

  -- ── o lancamento ──
  SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND OR v_l.cliente_id <> v_cli THEN
    RAISE EXCEPTION 'Lancamento % nao encontrado neste cliente', p_lancamento_id USING ERRCODE = 'P0001'; END IF;
  IF v_l.cancelado IS TRUE THEN
    RAISE EXCEPTION 'Lancamento cancelado nao pode ser vinculado' USING ERRCODE = 'P0001'; END IF;
  IF coalesce(v_l.cenario, 'realizado') = 'meta' THEN
    RAISE EXCEPTION 'Lancamento de meta nao se vincula a operacao' USING ERRCODE = 'P0001'; END IF;
  IF v_l.financiamento_id IS NOT NULL OR v_l.transferencia_grupo_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lancamento de financiamento ou transferencia nao se vincula a operacao' USING ERRCODE = 'P0001'; END IF;
  IF v_l.valor IS NULL OR v_l.valor <= 0 THEN
    RAISE EXCEPTION 'Lancamento sem valor positivo' USING ERRCODE = 'P0001'; END IF;
  -- `zoo_operacao_partes_titulo_uniq` e' INTEGRAL (inclui parte cancelada): um lancamento que ja teve
  -- parte nao pode ganhar outra.
  SELECT p.id INTO v_parte_id FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = v_l.id LIMIT 1;
  IF v_parte_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lancamento ja esta ligado a uma operacao (parte %)', v_parte_id USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_regra FROM public._oc_vinculo_mapa() m WHERE m.subcentro = v_l.subcentro;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcentro "%" nao se vincula a operacao comercial', v_l.subcentro USING ERRCODE = 'P0001'; END IF;
  IF NOT (v_op.tipo_operacao = ANY (v_regra.tipos_oc)) THEN
    RAISE EXCEPTION 'Lancamento de "%" nao cabe numa operacao de %', v_l.subcentro, v_op.tipo_operacao USING ERRCODE = 'P0001'; END IF;
  IF v_l.tipo_operacao IS DISTINCT FROM v_regra.tipo_operacao THEN
    RAISE EXCEPTION 'Direcao do lancamento (%) nao confere com o subcentro (%)', v_l.tipo_operacao, v_regra.tipo_operacao USING ERRCODE = 'P0001'; END IF;
  v_natureza := v_regra.natureza;
  v_valor := round(v_l.valor, 2);

  -- ── o compromisso do componente ──
  IF p_compromisso_id IS NOT NULL THEN
    SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
     WHERE id = p_compromisso_id AND operacao_id = p_operacao_id AND cliente_id = v_cli FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compromisso % nao encontrado nesta operacao', p_compromisso_id USING ERRCODE = 'P0001'; END IF;
    IF v_comp.status = 'cancelado' THEN
      RAISE EXCEPTION 'Compromisso cancelado nao recebe vinculo' USING ERRCODE = 'P0001'; END IF;
    IF v_comp.natureza <> v_natureza OR NOT (v_comp.componente = ANY (v_regra.componentes)) THEN
      RAISE EXCEPTION 'Compromisso %/% nao cabe no subcentro "%"', v_comp.natureza, v_comp.componente, v_l.subcentro USING ERRCODE = 'P0001'; END IF;
    IF p_componente IS NOT NULL AND p_componente <> v_comp.componente THEN
      RAISE EXCEPTION 'Componente informado (%) diverge do compromisso escolhido (%)', p_componente, v_comp.componente USING ERRCODE = 'P0001'; END IF;
    v_componente := v_comp.componente;
  ELSE
    v_componente := coalesce(p_componente,
                             CASE WHEN cardinality(v_regra.componentes) = 1 THEN v_regra.componentes[1] END);
    IF v_componente IS NULL THEN
      RAISE EXCEPTION 'Informe o componente (%)', array_to_string(v_regra.componentes, ', ') USING ERRCODE = 'P0001'; END IF;
    IF NOT (v_componente = ANY (v_regra.componentes)) THEN
      RAISE EXCEPTION 'Componente % nao cabe no subcentro "%"', v_componente, v_l.subcentro USING ERRCODE = 'P0001'; END IF;
    SELECT count(*) INTO v_n FROM public.zoo_operacao_compromissos c
     WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado';
    IF v_n > 1 THEN
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'descricao', c.descricao, 'valor_total', c.valor_total,
                                          'status', c.status, 'lote_id', c.lote_id) ORDER BY c.created_at)
        INTO v_lista
        FROM public.zoo_operacao_compromissos c
       WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado';
      RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'escolher_compromisso',
        'compromissos', v_lista, 'operacao_versao', v_op.versao);
    ELSIF v_n = 1 THEN
      SELECT * INTO v_comp FROM public.zoo_operacao_compromissos c
       WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado'
       FOR UPDATE;
    ELSIF p_criar_novo IS NOT TRUE THEN
      -- ⚠ NENHUM DO COMPONENTE, MAS HA' OUTRO QUE CABE NO SUBCENTRO: o componente nao e' usado de forma
      -- uniforme (medido: o Fundersul da OC 02be1a41 esta' como `taxa_aquisicao`, e a sugestao pela
      -- descricao diria `taxas_impostos`). Criar aqui seria o dobro. Quem escolhe e' o operador;
      -- criar mesmo assim exige `p_criar_novo`.
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'componente', c.componente, 'descricao', c.descricao,
                                          'valor_total', c.valor_total, 'status', c.status) ORDER BY c.created_at)
        INTO v_lista
        FROM public.zoo_operacao_compromissos c
       WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza
         AND c.componente = ANY (v_regra.componentes) AND c.status <> 'cancelado';
      IF v_lista IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'escolher_compromisso',
          'pode_criar_novo', true, 'compromissos', v_lista, 'operacao_versao', v_op.versao);
      END IF;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zoo_componentes_financeiros cf
                  WHERE cf.natureza = v_natureza AND cf.codigo = v_componente AND cf.ativo IS TRUE) THEN
    RAISE EXCEPTION 'Componente %/% inexistente ou inativo no catalogo', v_natureza, v_componente USING ERRCODE = 'P0001'; END IF;

  -- ── a parcela, e o D1 (tudo ainda sem escrever) ──
  IF v_comp.id IS NOT NULL THEN
    v_comp_antes := to_jsonb(v_comp);
    v_comp_valor_antes := v_comp.valor_total;
    SELECT pr.id INTO v_prog_id FROM public.zoo_operacao_programacoes pr
     WHERE pr.compromisso_id = v_comp.id AND pr.status = 'ativa' FOR UPDATE;
    IF v_prog_id IS NOT NULL THEN
      IF p_parcela_id IS NOT NULL THEN
        SELECT * INTO v_parc FROM public.zoo_operacao_parcelas_programacao
         WHERE id = p_parcela_id AND programacao_id = v_prog_id AND status <> 'cancelada' FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Parcela % nao pertence a programacao ativa do compromisso', p_parcela_id USING ERRCODE = 'P0001'; END IF;
      ELSE
        SELECT count(*) INTO v_n FROM public.zoo_operacao_parcelas_programacao
         WHERE programacao_id = v_prog_id AND status <> 'cancelada';
        IF v_n > 1 THEN
          SELECT jsonb_agg(jsonb_build_object('id', pp.id, 'sequencia', pp.sequencia, 'valor', pp.valor,
                   'vencimento', pp.vencimento, 'status', pp.status,
                   'titulo_id', f.id, 'titulo_status', f.status_transacao) ORDER BY pp.sequencia)
            INTO v_lista
            FROM public.zoo_operacao_parcelas_programacao pp
            LEFT JOIN public.zoo_operacao_partes pa ON pa.programacao_parcela_id = pp.id AND pa.cancelada = false
            LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pa.financeiro_lancamento_id
           WHERE pp.programacao_id = v_prog_id AND pp.status <> 'cancelada';
          RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'escolher_parcela',
            'compromisso_id', v_comp.id, 'parcelas', v_lista, 'operacao_versao', v_op.versao);
        ELSIF v_n = 1 THEN
          SELECT * INTO v_parc FROM public.zoo_operacao_parcelas_programacao
           WHERE programacao_id = v_prog_id AND status <> 'cancelada' FOR UPDATE;
        END IF;
      END IF;
    END IF;

    IF v_parc.id IS NOT NULL THEN
      SELECT * INTO v_parte_velha FROM public.zoo_operacao_partes
       WHERE programacao_parcela_id = v_parc.id AND cancelada = false FOR UPDATE;
      IF v_parte_velha.id IS NOT NULL AND v_parte_velha.financeiro_lancamento_id IS NOT NULL THEN
        SELECT * INTO v_tit_velho FROM public.financeiro_lancamentos_v2
         WHERE id = v_parte_velha.financeiro_lancamento_id FOR UPDATE;
        IF v_tit_velho.id IS NOT NULL AND v_tit_velho.cancelado IS NOT TRUE AND (
             v_tit_velho.status_transacao IN ('realizado', 'conciliado')
             OR v_tit_velho.conciliado_em IS NOT NULL
             OR EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq
                         WHERE lq.financeiro_lancamento_id = v_tit_velho.id AND lq.estornado IS NOT TRUE)
             OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi
                         WHERE cbi.lancamento_id = v_tit_velho.id AND cbi.desfeito_em IS NULL)) THEN
          v_conc := EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi
                             WHERE cbi.lancamento_id = v_tit_velho.id AND cbi.desfeito_em IS NULL);
          RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'titulo_oc_liquidado',
            'compromisso_id', v_comp.id,
            'titulo_oc', jsonb_build_object('id', v_tit_velho.id, 'valor', v_tit_velho.valor,
                          'status_transacao', v_tit_velho.status_transacao, 'data_pagamento', v_tit_velho.data_pagamento,
                          'conciliado', v_conc),
            'lancamento', jsonb_build_object('id', v_l.id, 'valor', v_l.valor, 'status_transacao', v_l.status_transacao,
                          'data_pagamento', v_l.data_pagamento,
                          'conciliado', EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi
                                                 WHERE cbi.lancamento_id = v_l.id AND cbi.desfeito_em IS NULL)),
            'operacao_versao', v_op.versao);
        END IF;
      END IF;
    END IF;
  END IF;

  -- ═══ daqui para baixo, escreve ═══

  -- compromisso
  IF v_comp.id IS NULL THEN
    IF v_natureza = 'principal'
       AND (SELECT count(*) FROM public.zoo_operacao_lotes lo WHERE lo.operacao_id = p_operacao_id) = 1 THEN
      SELECT lo.id INTO v_lote FROM public.zoo_operacao_lotes lo WHERE lo.operacao_id = p_operacao_id;
    END IF;
    INSERT INTO public.zoo_operacao_compromissos
      (cliente_id, operacao_id, natureza, componente, favorecido_id,
       macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id, lote_id, valor_total, descricao, status)
    VALUES
      (v_cli, p_operacao_id, v_natureza, v_componente, v_l.favorecido_id,
       v_l.macro_custo, v_l.grupo_custo, v_l.centro_custo, v_l.subcentro, v_l.plano_conta_id, v_lote,
       v_valor, v_l.descricao, 'programado')
    RETURNING * INTO v_comp;
    v_comp_acao := 'criado';
  END IF;

  -- programacao
  IF v_prog_id IS NULL THEN
    INSERT INTO public.zoo_operacao_programacoes (cliente_id, compromisso_id, condicoes, status)
    VALUES (v_cli, v_comp.id, 'vinculo de lancamento existente', 'ativa')
    RETURNING id INTO v_prog_id;
    v_prog_criada := true;
  END IF;

  -- parcela (+ D1)
  IF v_parc.id IS NULL THEN
    SELECT coalesce(max(pp.sequencia), 0) + 1 INTO v_seq
      FROM public.zoo_operacao_parcelas_programacao pp WHERE pp.programacao_id = v_prog_id;
    INSERT INTO public.zoo_operacao_parcelas_programacao
      (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
    VALUES
      (v_cli, v_prog_id, v_seq, v_valor, coalesce(v_l.data_vencimento, v_l.data_pagamento, v_op.data_operacao),
       v_l.conta_bancaria_id, NULL, 'materializada')
    RETURNING * INTO v_parc;
    v_parc_acao := 'criada';
  ELSE
    IF v_parte_velha.id IS NOT NULL THEN
      IF v_tit_velho.id IS NOT NULL AND v_tit_velho.cancelado IS NOT TRUE THEN
        UPDATE public.financeiro_lancamentos_v2
           SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = p_motivo,
               updated_at = now(), updated_by = v_actor
         WHERE id = v_tit_velho.id;
      END IF;
      UPDATE public.zoo_operacao_partes
         SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = p_motivo, updated_at = now()
       WHERE id = v_parte_velha.id;
      v_tit_substituido := jsonb_build_object('titulo_id', v_tit_velho.id, 'parte_id', v_parte_velha.id,
        'valor', v_tit_velho.valor, 'status_transacao', v_tit_velho.status_transacao,
        'ja_estava_cancelado', coalesce(v_tit_velho.cancelado, false));
      v_parc_acao := 'substituida';
    ELSE
      v_parc_acao := 'preenchida';
    END IF;
    UPDATE public.zoo_operacao_parcelas_programacao
       SET valor = v_valor, status = 'materializada', updated_at = now()
     WHERE id = v_parc.id;
  END IF;

  -- o compromisso vale o que as parcelas vivas valem: o financeiro manda no valor
  SELECT coalesce(sum(pp.valor), 0) INTO v_soma
    FROM public.zoo_operacao_parcelas_programacao pp
   WHERE pp.programacao_id = v_prog_id AND pp.status IN ('prevista', 'materializada', 'paga');
  IF v_comp_acao IS NULL THEN
    IF round(v_soma, 2) <> round(v_comp.valor_total, 2) THEN
      UPDATE public.zoo_operacao_compromissos
         SET valor_total = round(v_soma, 2), status = 'programado', updated_at = now()
       WHERE id = v_comp.id;
      INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
      VALUES (v_cli, p_operacao_id, 'ajustar_valor_compromisso', v_comp_antes,
              jsonb_build_object('motivo', p_motivo, 'origem', 'vinculo de lancamento', 'vinculo_id', v_vinculo_id,
                'compromisso_id', v_comp.id, 'valor_anterior', v_comp.valor_total, 'valor_novo', round(v_soma, 2),
                'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
              v_actor, 'rpc');
      v_comp_acao := 'ajustado';
    ELSE
      UPDATE public.zoo_operacao_compromissos SET status = 'programado', updated_at = now()
       WHERE id = v_comp.id AND status <> 'programado';
      v_comp_acao := 'mantido';
    END IF;
  END IF;

  -- a parte: o titulo existente passa a ser o titulo daquela parcela
  SELECT count(*) INTO v_qtd FROM public.zoo_operacao_parcelas_programacao pp WHERE pp.programacao_id = v_prog_id;
  INSERT INTO public.zoo_operacao_partes (
    cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas,
    valor, data_vencimento, descricao, incluso_no_total,
    favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, lote_id,
    programacao_parcela_id, financeiro_lancamento_id)
  VALUES (
    v_cli, p_operacao_id, 'programacao', v_natureza, v_componente, v_parc.sequencia, v_qtd,
    v_valor, coalesce(v_l.data_vencimento, v_l.data_pagamento, v_parc.vencimento), coalesce(v_comp.descricao, v_l.descricao), false,
    v_l.favorecido_id, v_l.plano_conta_id, v_l.macro_custo, v_l.grupo_custo, v_l.centro_custo, v_l.subcentro, v_comp.lote_id,
    v_parc.id, v_l.id)
  RETURNING id INTO v_parte_id;

  -- o lancamento: competencia = data da OC, elo zootecnico solto (D4)
  v_comp_nova := v_op.data_operacao;
  v_mov_antigo := v_l.movimentacao_rebanho_id;
  IF v_l.data_competencia IS DISTINCT FROM v_comp_nova OR v_mov_antigo IS NOT NULL THEN
    UPDATE public.financeiro_lancamentos_v2
       SET data_competencia = v_comp_nova, movimentacao_rebanho_id = NULL,
           updated_at = now(), updated_by = v_actor
     WHERE id = v_l.id;
  END IF;
  SELECT * INTO v_l_depois FROM public.financeiro_lancamentos_v2 WHERE id = v_l.id;
  -- D3: a identidade de importacao nao pode mudar (ver cabecalho). Se mudar, nada fica gravado.
  IF v_l_depois.hash_importacao IS DISTINCT FROM v_l.hash_importacao THEN
    RAISE EXCEPTION 'Vincular mudaria o hash de importacao do lancamento % (de % para %); abortado',
      v_l.id, v_l.hash_importacao, v_l_depois.hash_importacao USING ERRCODE = 'P0001'; END IF;

  -- ── avisos (nenhum deles impede o vinculo) ──
  IF v_mov_antigo IS NOT NULL THEN
    SELECT jsonb_agg(m.movimentacao_id) INTO v_movs_oc
      FROM public.zoo_operacao_movimentacoes m
      JOIN public.lancamentos z ON z.id = m.movimentacao_id AND z.cancelado IS NOT TRUE
     WHERE m.operacao_id = p_operacao_id AND m.movimentacao_id <> v_mov_antigo;
    IF v_movs_oc IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.lancamentos z WHERE z.id = v_mov_antigo AND z.cancelado IS NOT TRUE)
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m
                        WHERE m.operacao_id = p_operacao_id AND m.movimentacao_id = v_mov_antigo) THEN
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'movimento_duplicado',
        'movimento_antigo', v_mov_antigo, 'movimentos_da_oc', v_movs_oc));
    END IF;
  END IF;
  IF to_char(v_l.data_competencia, 'YYYY-MM') IS DISTINCT FROM to_char(v_comp_nova, 'YYYY-MM') THEN
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'competencia_mudou_de_mes',
      'de', v_l.data_competencia, 'para', v_comp_nova));
  END IF;
  IF v_comp_antes IS NOT NULL THEN
    IF (v_comp_antes->>'favorecido_id') IS NOT NULL AND v_l.favorecido_id IS NOT NULL
       AND (v_comp_antes->>'favorecido_id')::uuid <> v_l.favorecido_id THEN
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'favorecido_diferente',
        'compromisso', v_comp_antes->>'favorecido_id', 'lancamento', v_l.favorecido_id));
    END IF;
    IF (v_comp_antes->>'subcentro') IS DISTINCT FROM v_l.subcentro THEN
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'classificacao_diverge_do_compromisso',
        'compromisso', v_comp_antes->>'subcentro', 'lancamento', v_l.subcentro));
    END IF;
  END IF;
  IF v_natureza = 'principal' THEN
    SELECT b.base INTO v_base FROM public._oc_base_saldo_operacao(p_operacao_id) b;
    SELECT coalesce(sum(c.valor_total), 0) INTO v_soma_principal FROM public.zoo_operacao_compromissos c
     WHERE c.operacao_id = p_operacao_id AND c.natureza = 'principal' AND c.status IN ('aberto', 'programado');
    IF v_base IS NULL OR abs(round(v_soma_principal, 2) - round(v_base, 2)) > 0.01 THEN
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'principal_diverge_da_base',
        'base', v_base, 'soma_principal', round(v_soma_principal, 2)));
    END IF;
  END IF;
  IF v_l.safra_id IS DISTINCT FROM public.fn_safra_sugerida(v_cli, v_comp_nova,
       (SELECT pc.escopo_negocio FROM public.financeiro_plano_contas pc WHERE pc.id = v_l.plano_conta_id)) THEN
    v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'safra_diverge_da_competencia',
      'safra_atual', v_l.safra_id));
  END IF;

  -- ── trilha ──
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  VALUES (v_cli, p_operacao_id, 'vincular_lancamento',
    jsonb_build_object('lancamento', to_jsonb(v_l), 'compromisso', v_comp_antes,
                       'parte_substituida', to_jsonb(v_parte_velha), 'titulo_substituido', to_jsonb(v_tit_velho)),
    jsonb_build_object(
      'lancamento', to_jsonb(v_l_depois),
      'compromisso', (SELECT to_jsonb(c) FROM public.zoo_operacao_compromissos c WHERE c.id = v_comp.id),
      'parcela', (SELECT to_jsonb(pp) FROM public.zoo_operacao_parcelas_programacao pp WHERE pp.id = v_parc.id),
      'parte', (SELECT to_jsonb(p) FROM public.zoo_operacao_partes p WHERE p.id = v_parte_id)),
    jsonb_build_object(
      'vinculo_id', v_vinculo_id, 'motivo', p_motivo,
      'lancamento_id', v_l.id, 'compromisso_id', v_comp.id, 'compromisso_acao', v_comp_acao,
      'programacao_id', v_prog_id, 'programacao_criada', v_prog_criada,
      'parcela_id', v_parc.id, 'parcela_acao', v_parc_acao, 'parte_id', v_parte_id,
      'titulo_substituido', v_tit_substituido,
      'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
      'movimentacao_rebanho_id_anterior', v_mov_antigo,
      'hash_importacao_anterior', v_l.hash_importacao, 'hash_importacao_depois', v_l_depois.hash_importacao,
      'avisos', v_avisos,
      'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
    v_actor, 'rpc');

  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  v_ret := jsonb_build_object(
    'ok', true, 'acao', CASE WHEN p_simular THEN 'simulado' ELSE 'vinculado' END, 'vinculo_id', v_vinculo_id,
    'simulado', coalesce(p_simular, false),
    -- "a OC soma o item 1 vez": contado DEPOIS das escritas, nao presumido
    'titulos_vivos_do_compromisso', (SELECT count(*) FROM public.zoo_operacao_partes pt
        JOIN public.zoo_operacao_parcelas_programacao pp ON pp.id = pt.programacao_parcela_id
        JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id AND pr.status = 'ativa'
        JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id
       WHERE pr.compromisso_id = v_comp.id AND pt.cancelada = false AND f.cancelado IS NOT TRUE),
    'conciliado', EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi
                           WHERE cbi.lancamento_id = v_l.id AND cbi.desfeito_em IS NULL),
    -- na simulacao o incremento de versao e' desfeito: devolve a versao que continua valendo
    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_nova END,
    'compromisso', jsonb_build_object('id', v_comp.id, 'acao', v_comp_acao,
                     'valor_anterior', v_comp_valor_antes, 'valor_total', round(v_soma, 2)),
    'parcela', jsonb_build_object('id', v_parc.id, 'acao', v_parc_acao),
    'parte_id', v_parte_id,
    'titulo_substituido', v_tit_substituido,
    'lancamento', jsonb_build_object('id', v_l.id,
                     'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
                     'hash_preservado', v_l.hash_importacao IS NOT DISTINCT FROM v_l_depois.hash_importacao,
                     'movimentacao_rebanho_id_solto', v_mov_antigo),
    'avisos', v_avisos);

  -- ⚠ SIMULACAO = O MESMO CAMINHO, DESFEITO. O resumo "o que vai acontecer" (valor do compromisso
  -- depois, titulo substituido, avisos, titulos vivos) so' existe depois das escritas; calcula-lo a
  -- parte seria a segunda copia da regra. Com `p_simular`, tudo acima roda e esta excecao desfaz o
  -- bloco inteiro (subtransacao); as variaveis sobrevivem, e o envelope volta ao chamador.
  IF p_simular THEN
    RAISE EXCEPTION 'simulacao de vinculo (desfeita)' USING ERRCODE = 'OCSIM';
  END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$function$;

-- ─── 4. As candidatas (leitura; roda com a RLS de quem chama) ─────────────────────────────────
-- Criterios e ordem da FASE 0: mesmo cliente, tipo compativel com o subcentro, mesma fazenda (ou OC
-- sem fazenda), distancia de datas ate a janela; ordem = VALOR EXATO AO CENTAVO (um compromisso que
-- cabe no subcentro com o valor do lancamento — decisao do Gabriel na FASE 1a), mesma fazenda, menor
-- distancia, OC SEM titulo vivo do componente-alvo, valor mais proximo. A distancia e' a MENOR entre competencia e pagamento
-- do lancamento e a data de referencia da OC (abate > embarque > operacao): o Fundersul da Vera
-- 57f5ce96 tem competencia a 63 dias da OC 02be1a41 e pagamento a 28.
-- ⚠ RASCUNHO FICA FORA: a FASE 0 contou rascunhos vazios como plausiveis (5 no NJ em 16/04/2026).
CREATE OR REPLACE FUNCTION public.oc_candidatas_vinculo(p_lancamento_id uuid, p_janela_dias integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.financeiro_lancamentos_v2;
  v_regra record;
  v_sug jsonb; v_alvo text;
  v_parte uuid; v_motivo text;
  v_cab jsonb; v_cands jsonb;
BEGIN
  SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'lancamento_nao_encontrado');
  END IF;
  SELECT p.id INTO v_parte FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = v_l.id LIMIT 1;
  SELECT * INTO v_regra FROM public._oc_vinculo_mapa() m WHERE m.subcentro = v_l.subcentro;
  v_sug := public._oc_vinculo_sugerir_componente(v_l.descricao, v_l.subcentro);
  v_alvo := v_sug->>'codigo';

  v_cab := jsonb_build_object(
    'id', v_l.id, 'descricao', v_l.descricao, 'valor', v_l.valor, 'tipo_operacao', v_l.tipo_operacao,
    'subcentro', v_l.subcentro, 'data_competencia', v_l.data_competencia, 'data_pagamento', v_l.data_pagamento,
    'status_transacao', v_l.status_transacao, 'fazenda_id', v_l.fazenda_id,
    'fazenda_nome', (SELECT fz.nome FROM public.fazendas fz WHERE fz.id = v_l.fazenda_id),
    'favorecido_id', v_l.favorecido_id,
    'favorecido_nome', (SELECT fo.nome FROM public.financeiro_fornecedores fo WHERE fo.id = v_l.favorecido_id),
    'conciliado', EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi
                           WHERE cbi.lancamento_id = v_l.id AND cbi.desfeito_em IS NULL),
    'origem_lancamento', v_l.origem_lancamento, 'importado', v_l.lote_importacao_id IS NOT NULL,
    'movimentacao_rebanho_id', v_l.movimentacao_rebanho_id, 'safra_id', v_l.safra_id);

  v_motivo := CASE
    WHEN v_l.cancelado IS TRUE THEN 'cancelado'
    WHEN coalesce(v_l.cenario, 'realizado') = 'meta' THEN 'meta'
    WHEN v_parte IS NOT NULL THEN 'ja_vinculado'
    WHEN v_l.financiamento_id IS NOT NULL OR v_l.transferencia_grupo_id IS NOT NULL THEN 'financiamento_ou_transferencia'
    WHEN v_regra.subcentro IS NULL THEN 'subcentro_sem_regra'
    WHEN v_l.tipo_operacao IS DISTINCT FROM v_regra.tipo_operacao THEN 'direcao_diverge_do_subcentro'
    WHEN coalesce(v_l.valor, 0) <= 0 THEN 'sem_valor'
  END;
  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', v_motivo, 'lancamento', v_cab, 'parte_id', v_parte);
  END IF;

  WITH ocs AS (
    SELECT o.*, coalesce(o.data_abate, o.data_embarque, o.data_operacao) AS d_ref,
           least(abs(coalesce(o.data_abate, o.data_embarque, o.data_operacao) - v_l.data_competencia),
                 abs(coalesce(o.data_abate, o.data_embarque, o.data_operacao) - coalesce(v_l.data_pagamento, v_l.data_competencia))) AS dist,
           (o.fazenda_id IS NOT DISTINCT FROM v_l.fazenda_id) AS mesma_faz
      FROM public.zoo_operacoes_comerciais o
     WHERE o.cliente_id = v_l.cliente_id
       AND o.tipo_operacao = ANY (v_regra.tipos_oc)
       AND o.rascunho IS NOT TRUE
       AND o.cancelado_em IS NULL AND o.status_comercial <> 'cancelada'
       AND o.is_teste IS NOT TRUE
       AND (o.fazenda_id IS NULL OR v_l.fazenda_id IS NULL OR o.fazenda_id = v_l.fazenda_id)
  ),
  filtradas AS (SELECT * FROM ocs WHERE dist <= p_janela_dias),
  parc AS (
    SELECT c.id AS compromisso_id,
           count(pp.id) AS n_parcelas,
           jsonb_agg(jsonb_build_object('parcela_id', pp.id, 'sequencia', pp.sequencia, 'valor', pp.valor,
                       'status', pp.status, 'titulo_id', f.id, 'titulo_status', f.status_transacao,
                       'titulo_cancelado', f.cancelado, 'titulo_conciliado', x.conc, 'titulo_liquidado', x.liq)
                     ORDER BY pp.sequencia) FILTER (WHERE pp.id IS NOT NULL) AS parcelas,
           coalesce(bool_or(f.id IS NOT NULL AND f.cancelado IS NOT TRUE
                       AND (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL OR x.conc OR x.liq)), false) AS liquidado,
           coalesce(bool_or(f.id IS NOT NULL AND f.cancelado IS NOT TRUE), false) AS vivo
      FROM public.zoo_operacao_compromissos c
      LEFT JOIN public.zoo_operacao_programacoes pr ON pr.compromisso_id = c.id AND pr.status = 'ativa'
      LEFT JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id AND pp.status <> 'cancelada'
      LEFT JOIN public.zoo_operacao_partes pa ON pa.programacao_parcela_id = pp.id AND pa.cancelada = false
      LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pa.financeiro_lancamento_id
      LEFT JOIN LATERAL (
        SELECT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens cbi WHERE cbi.lancamento_id = f.id AND cbi.desfeito_em IS NULL) AS conc,
               EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq WHERE lq.financeiro_lancamento_id = f.id AND lq.estornado IS NOT TRUE) AS liq
      ) x ON true
     WHERE c.operacao_id IN (SELECT id FROM filtradas) AND c.status <> 'cancelado'
       AND c.natureza = v_regra.natureza AND c.componente = ANY (v_regra.componentes)
     GROUP BY c.id
  ),
  comps AS (
    SELECT c.operacao_id,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'componente', c.componente, 'descricao', c.descricao, 'valor_total', c.valor_total,
             'status', c.status, 'lote_id', c.lote_id, 'parcelas', coalesce(p.parcelas, '[]'::jsonb),
             'diferenca', round(v_l.valor - c.valor_total, 2),
             'valor_exato', round(c.valor_total, 2) = round(v_l.valor, 2),
             'acao_prevista', CASE WHEN p.n_parcelas > 1 THEN 'escolher_parcela'
                                   WHEN p.liquidado THEN 'recusar'
                                   WHEN p.vivo THEN 'substituir'
                                   ELSE 'preencher' END)
             ORDER BY (c.componente = v_alvo) DESC, abs(v_l.valor - c.valor_total)) AS lista,
           count(*) FILTER (WHERE v_alvo IS NULL OR c.componente = v_alvo) AS n_alvo,
           coalesce(bool_or(p.vivo AND (v_alvo IS NULL OR c.componente = v_alvo)), false) AS vivo_alvo,
           min(abs(v_l.valor - c.valor_total)) AS menor_dif,
           coalesce(bool_or(round(c.valor_total, 2) = round(v_l.valor, 2)), false) AS valor_exato
      FROM public.zoo_operacao_compromissos c
      JOIN parc p ON p.compromisso_id = c.id
     GROUP BY c.operacao_id
  ),
  movs AS (
    SELECT m.operacao_id, jsonb_agg(m.movimentacao_id) AS ids
      FROM public.zoo_operacao_movimentacoes m
      JOIN public.lancamentos z ON z.id = m.movimentacao_id AND z.cancelado IS NOT TRUE
     WHERE m.operacao_id IN (SELECT id FROM filtradas)
       AND v_l.movimentacao_rebanho_id IS NOT NULL
       AND m.movimentacao_id <> v_l.movimentacao_rebanho_id
     GROUP BY m.operacao_id
  )
  SELECT jsonb_agg(jsonb_build_object(
           'operacao_id', f.id, 'tipo_operacao', f.tipo_operacao, 'numero_documento', f.numero_documento,
           'status_comercial', f.status_comercial, 'versao', f.versao,
           'data_operacao', f.data_operacao, 'data_referencia', f.d_ref, 'distancia_dias', f.dist,
           'fazenda_id', f.fazenda_id, 'fazenda_nome', fz.nome, 'mesma_fazenda', f.mesma_faz,
           'contraparte_id', f.contraparte_id, 'contraparte_nome', fo.nome,
           'valor_acordado', f.valor_acordado,
           'lotes', (SELECT jsonb_agg(jsonb_build_object('id', lo.id, 'qtd', lo.qtd_negociada, 'categoria', lo.categoria_negociada,
                                                         'valor', lo.valor_informado) ORDER BY lo.ordem)
                       FROM public.zoo_operacao_lotes lo WHERE lo.operacao_id = f.id),
           'compromissos', coalesce(cp.lista, '[]'::jsonb),
           -- 'criar' so' quando nenhum compromisso vivo cabe no subcentro: com um de OUTRO componente
           -- (o Fundersul da 02be1a41 esta' como `taxa_aquisicao`) a RPC recusa `escolher_compromisso`.
           'acao_prevista', CASE WHEN cp.operacao_id IS NULL THEN 'criar'
                                 WHEN cp.n_alvo = 1 THEN 'usar_compromisso'
                                 ELSE 'escolher_compromisso' END,
           'tem_titulo_vivo_do_componente', coalesce(cp.vivo_alvo, false),
           'valor_exato', coalesce(cp.valor_exato, false),
           'competencia_nova', f.data_operacao,
           'competencia_muda_de_mes', to_char(f.data_operacao, 'YYYY-MM') IS DISTINCT FROM to_char(v_l.data_competencia, 'YYYY-MM'),
           'movimento_duplicado', CASE WHEN mv.ids IS NOT NULL
                                       THEN jsonb_build_object('movimento_antigo', v_l.movimentacao_rebanho_id, 'movimentos_da_oc', mv.ids) END)
         ORDER BY coalesce(cp.valor_exato, false) DESC, f.mesma_faz DESC, f.dist, coalesce(cp.vivo_alvo, false),
                  coalesce(cp.menor_dif, abs(v_l.valor - coalesce(f.valor_acordado, 0))), f.id)
    INTO v_cands
    FROM filtradas f
    LEFT JOIN comps cp ON cp.operacao_id = f.id
    LEFT JOIN movs mv ON mv.operacao_id = f.id
    LEFT JOIN public.fazendas fz ON fz.id = f.fazenda_id
    LEFT JOIN public.financeiro_fornecedores fo ON fo.id = f.contraparte_id;

  RETURN jsonb_build_object(
    'elegivel', true, 'lancamento', v_cab,
    'regra', jsonb_build_object('natureza', v_regra.natureza, 'componentes', to_jsonb(v_regra.componentes),
                                'tipos_oc', to_jsonb(v_regra.tipos_oc)),
    'componente_sugerido', v_sug, 'janela_dias', p_janela_dias,
    'candidatas', coalesce(v_cands, '[]'::jsonb));
END;
$function$;

-- ─── 5. ACL: nada para PUBLIC/anon ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._oc_vinculo_mapa() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._oc_vinculo_sugerir_componente(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_candidatas_vinculo(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._oc_vinculo_mapa() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._oc_vinculo_sugerir_componente(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oc_candidatas_vinculo(uuid, integer) TO authenticated, service_role;
