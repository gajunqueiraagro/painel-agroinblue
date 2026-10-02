-- CONC-CRIAR-TRANSFERENCIA-01 — o "Criar" a partir do extrato permite Transferencia, gravada pela propria
-- fn_criar_lancamento_de_extrato (lancamento + vinculo na MESMA transacao — a regra do B-32b fica).
--
-- Fato (homologacao do Gabriel, 01/10 18:32, NJ Sicredi Lavoura set/26): "PAGTO FATURA MASTER" (10/09 -8.519,53) e
-- "INTEGR.CAPITAL" (22/09 -100,00) sao transferencias e o Criar da linha so permitia Saida: a funcao fixava o tipo pelo
-- sinal e gravava so a conta do extrato.
-- REGRA: o extrato dita valor, data e A CONTA DELE; o operador escolhe o tipo pelo sinal — extrato < 0: Saidas ou
-- Transferencias (origem = conta do extrato, destino obrigatorio); extrato > 0: Entradas ou Transferencias (destino =
-- conta do extrato, origem obrigatoria). Nunca o tipo de sinal contrario.
-- MODELO DA TRANSFERENCIA (o de fn_transferencia_de_extratos): 1 lancamento '3-Transferências', sinal -1, plano 18010,
-- conta_bancaria_id = origem, conta_destino_id = destino, realizado na data do extrato; fazenda Administrativo do cliente,
-- senao a da conta de origem, depois a de destino. O vinculo nasce na mesma transacao pelo INSERT de sempre (direto em
-- conciliacao_bancaria_itens: a ponta de entrada nao depende de p_dupla_ponta).
-- Recusa 'ja_existe_transferencia' quando o extrato e' meia ponta (_fn_meia_ponta_compativel) ou ha' transferencia
-- lancada compativel (_fn_transferencia_existente): o caminho e' "Transferencias entre contas".
-- SEM OS DOIS PARAMETROS NOVOS O COMPORTAMENTO E' O DE HOJE (provado no ensaio: mesma saida, menos os ids).
-- ASSINATURA MUDA (p_tipo_operacao, p_outra_conta com DEFAULT NULL) => DROP + CREATE pelo corpo de hoje patcheado (guarda
-- de origem, cada ancora 1x, guarda de destino). Chamadores: o front (CriarLancamentoDaLinha) por nome e
-- fn_extrato_conciliar_mes posicional com 2 argumentos — os dois resolvem na assinatura nova.
-- ACL: a de hoje dava EXECUTE a PUBLIC (=X/postgres); recriada, fica na regra da casa (sem PUBLIC/anon; authenticated e
-- service_role).
-- GESTO CONTRARIO: o corpo de origem (md5 4f5d4c55) com a assinatura antiga esta' no ledger (20260628 d2 e seguintes).

DO $mig$
DECLARE
  v_antes text; v_novo text; v_args text; v_depois text;
  a text[]; b text[]; i int;
BEGIN
  SELECT prosrc, pg_get_function_arguments(oid) INTO v_antes, v_args FROM pg_proc
   WHERE oid = 'public.fn_criar_lancamento_de_extrato(uuid,uuid,text,text,text,uuid,text,date,uuid,text,text,jsonb,date)'::regprocedure;
  IF md5(v_antes) <> '4f5d4c55954b24e93758d75ba305374f' THEN
    RAISE EXCEPTION 'fn_criar_lancamento_de_extrato nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;

  a := ARRAY[
    -- 1. as variaveis novas
    E'  v_status   text;\nBEGIN\n',
    -- 2. a transferencia, depois de o tipo do sinal estar calculado
    E'  v_ano_mes := to_char(v_ext.data_movimento, ''YYYY-MM'');\n',
    -- 3. o mes fechado pela fazenda que vai ao lancamento
    E'      AND f.fazenda_id = p_fazenda_id\n',
    -- 4. a coluna do plano
    E'    subcentro, descricao, observacao, numero_documento, favorecido_id,\n',
    -- 5. a fazenda que vai ao lancamento
    E'    gen_random_uuid(), v_ext.cliente_id, p_fazenda_id,\n',
    -- 6. as contas
    E'    CASE WHEN v_tipo = ''1-Entradas'' THEN NULL ELSE v_ext.conta_bancaria_id END,\n    CASE WHEN v_tipo = ''1-Entradas'' THEN v_ext.conta_bancaria_id ELSE NULL END,\n',
    -- 7. o plano e o subcentro
    E'    NULLIF(btrim(p_subcentro), ''''),\n'
  ];
  b := ARRAY[
    E'  v_status   text;\n'
    || E'  -- CONC-CRIAR-TRANSFERENCIA-01\n'
    || E'  v_faz      uuid;\n  v_origem   uuid;\n  v_destino  uuid;\n  v_pc_id    uuid;\n  v_pc_sub   text;\n  v_transf   boolean := false;\n'
    || E'BEGIN\n',
    E'  v_ano_mes := to_char(v_ext.data_movimento, ''YYYY-MM'');\n'
    || E'  v_faz     := p_fazenda_id;\n\n'
    || E'  -- CONC-CRIAR-TRANSFERENCIA-01: o operador pode trocar o tipo do sinal por TRANSFERENCIA (e so'' por ela). O extrato\n'
    || E'  -- dita valor, data e a conta dele; a outra conta e'' do operador. Modelo: o de fn_transferencia_de_extratos.\n'
    || E'  IF p_tipo_operacao IS NOT NULL AND p_tipo_operacao IS DISTINCT FROM v_tipo THEN\n'
    || E'    IF p_tipo_operacao <> ''3-Transferências'' THEN\n'
    || E'      RAISE EXCEPTION ''tipo_incoerente: o tipo % contraria o sinal do extrato (%)'', p_tipo_operacao, v_tipo;\n'
    || E'    END IF;\n'
    || E'    IF p_outra_conta IS NULL THEN\n'
    || E'      RAISE EXCEPTION ''outra_conta_obrigatoria: informe a conta % da transferência'', CASE WHEN v_ext.valor < 0 THEN ''de destino'' ELSE ''de origem'' END;\n'
    || E'    END IF;\n'
    || E'    IF p_outra_conta = v_ext.conta_bancaria_id THEN\n'
    || E'      RAISE EXCEPTION ''mesma_conta: a outra conta da transferência não pode ser a do extrato'';\n'
    || E'    END IF;\n'
    || E'    IF NOT EXISTS (SELECT 1 FROM financeiro_contas_bancarias cb WHERE cb.id = p_outra_conta AND cb.cliente_id = v_ext.cliente_id) THEN\n'
    || E'      RAISE EXCEPTION ''outra_conta_invalida: a conta % não é deste cliente'', p_outra_conta;\n'
    || E'    END IF;\n'
    || E'    v_origem  := CASE WHEN v_ext.valor < 0 THEN v_ext.conta_bancaria_id ELSE p_outra_conta END;\n'
    || E'    v_destino := CASE WHEN v_ext.valor < 0 THEN p_outra_conta ELSE v_ext.conta_bancaria_id END;\n'
    || E'    -- a transferencia que ja'' existe se fecha pelo "Transferencias entre contas", nunca duplicada aqui\n'
    || E'    IF public._fn_meia_ponta_compativel(p_extrato_id) IS NOT NULL\n'
    || E'       OR public._fn_transferencia_existente(v_ext.cliente_id, v_origem, v_destino, v_valor, v_ext.data_movimento, v_ext.data_movimento) IS NOT NULL THEN\n'
    || E'      RAISE EXCEPTION ''ja_existe_transferencia: já existe transferência lançada para este movimento — feche pelo "Transferências entre contas"'';\n'
    || E'    END IF;\n'
    || E'    SELECT p.id, p.subcentro INTO v_pc_id, v_pc_sub FROM financeiro_plano_contas p\n'
    || E'     WHERE p.cliente_id IS NULL AND p.ordem_exibicao = 18010 AND p.subcentro = ''Transferência entre Contas Bancárias''\n'
    || E'       AND p.ativo IS NOT FALSE\n'
    || E'     ORDER BY p.id LIMIT 1;\n'
    || E'    IF v_pc_id IS NULL THEN RAISE EXCEPTION ''plano 18010 nao encontrado''; END IF;\n'
    || E'    -- transferencia e'' administrativa: a fazenda "Administrativo" do cliente; sem ela, a da origem, depois a do destino\n'
    || E'    v_faz := NULL;\n'
    || E'    SELECT f.id INTO v_faz FROM fazendas f\n'
    || E'     WHERE f.cliente_id = v_ext.cliente_id AND f.nome ILIKE ''%administrat%'' ORDER BY f.created_at, f.id LIMIT 1;\n'
    || E'    IF v_faz IS NULL THEN\n'
    || E'      SELECT COALESCE(co.fazenda_id, cd.fazenda_id) INTO v_faz\n'
    || E'        FROM financeiro_contas_bancarias co, financeiro_contas_bancarias cd WHERE co.id = v_origem AND cd.id = v_destino;\n'
    || E'    END IF;\n'
    || E'    IF v_faz IS NULL THEN RAISE EXCEPTION ''sem_fazenda: sem fazenda para a transferência''; END IF;\n'
    || E'    -- mes fechado tambem nas fazendas das duas contas (a regra da irma)\n'
    || E'    IF EXISTS (SELECT 1 FROM financeiro_fechamentos f\n'
    || E'                WHERE f.cliente_id = v_ext.cliente_id AND f.ano_mes = v_ano_mes AND f.status_fechamento = ''fechado''\n'
    || E'                  AND f.fazenda_id IN (SELECT fazenda_id FROM financeiro_contas_bancarias WHERE id IN (v_origem, v_destino) AND fazenda_id IS NOT NULL)) THEN\n'
    || E'      RAISE EXCEPTION ''competencia % em mes fechado: criacao bloqueada'', v_ano_mes;\n'
    || E'    END IF;\n'
    || E'    v_tipo := ''3-Transferências''; v_sinal := ''-1''; v_transf := true;\n'
    || E'  END IF;\n',
    E'      AND f.fazenda_id = v_faz\n',
    E'    plano_conta_id, subcentro, descricao, observacao, numero_documento, favorecido_id,\n',
    E'    gen_random_uuid(), v_ext.cliente_id, v_faz,\n',
    E'    CASE WHEN v_transf THEN v_origem WHEN v_tipo = ''1-Entradas'' THEN NULL ELSE v_ext.conta_bancaria_id END,\n    CASE WHEN v_transf THEN v_destino WHEN v_tipo = ''1-Entradas'' THEN v_ext.conta_bancaria_id ELSE NULL END,\n',
    E'    CASE WHEN v_transf THEN v_pc_id END,\n    CASE WHEN v_transf THEN v_pc_sub ELSE NULLIF(btrim(p_subcentro), '''') END,\n'
  ];

  v_novo := v_antes;
  FOR i IN 1 .. array_length(a, 1) LOOP
    IF (length(v_novo) - length(replace(v_novo, a[i], ''))) / length(a[i]) <> 1 THEN
      RAISE EXCEPTION 'a ancora % nao casa exatamente 1x em fn_criar_lancamento_de_extrato', i;
    END IF;
    v_novo := replace(v_novo, a[i], b[i]);
  END LOOP;

  DROP FUNCTION public.fn_criar_lancamento_de_extrato(uuid,uuid,text,text,text,uuid,text,date,uuid,text,text,jsonb,date);
  EXECUTE 'CREATE FUNCTION public.fn_criar_lancamento_de_extrato(' || v_args
       || ', p_tipo_operacao text DEFAULT NULL::text, p_outra_conta uuid DEFAULT NULL::uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';

  SELECT prosrc INTO v_depois FROM pg_proc
   WHERE oid = 'public.fn_criar_lancamento_de_extrato(uuid,uuid,text,text,text,uuid,text,date,uuid,text,text,jsonb,date,text,uuid)'::regprocedure;
  IF md5(v_depois) <> '2ea6be7a4d1ff57d42044d506a6705ac' THEN
    RAISE EXCEPTION 'corpo resultante inesperado de fn_criar_lancamento_de_extrato (md5 %)', md5(v_depois);
  END IF;
END $mig$;

REVOKE ALL ON FUNCTION public.fn_criar_lancamento_de_extrato(uuid,uuid,text,text,text,uuid,text,date,uuid,text,text,jsonb,date,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_criar_lancamento_de_extrato(uuid,uuid,text,text,text,uuid,text,date,uuid,text,text,jsonb,date,text,uuid) TO authenticated, service_role;
