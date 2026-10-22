-- CAD-CONTAS-BANCARIAS-01 — correcao do vinculo da conta interna no escritor (fn_conta_bancaria_salvar, 111701).
-- O vinculo mora na conta de INVESTIMENTO: consolida_em_conta_id aponta para a conta CORRENTE onde o banco consolida o saldo
-- (coluna de 20260910133424). A 111701 conferia o alvo como 'inv' — o lado errado. Agora:
--   consolida_em_conta_id (no cadastro de uma conta de investimento): o alvo e' uma conta corrente do cliente;
--   conta_interna_id (no cadastro da conta corrente, "Conta de investimento que vive dentro desta"): grava o vinculo NA conta de
--   investimento escolhida e solta a que apontava para esta. Nao e' coluna.
-- O resto da funcao e' o da 111701.

CREATE OR REPLACE FUNCTION public.fn_conta_bancaria_salvar(p_cliente_id uuid, p_conta_id uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_old public.financeiro_contas_bancarias;
  v_new public.financeiro_contas_bancarias;
  v_chaves text[] := ARRAY['nome_conta','codigo_conta','tipo_conta','fazenda_id','ativa','banco','agencia','numero_conta','conta_digito',
    'titular_nome','titular_documento','chave_pix','observacao','gerente_nome','gerente_telefone','gerente_celular','gerente_email',
    'gerente_desde','agencia_endereco','agencia_cidade_uf','agencia_telefone','agencia_outro_contato','agencia_observacao',
    'formato_extrato','sem_extrato_bancario','aliases','consolida_em_conta_id','conta_interna_id','mes_inicio','saldo_inicial_oficial'];
  v_k text;
  v_semente text := NULL;
  v_seed record;
BEGIN
  IF NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION 'Sem acesso a este cliente.' USING ERRCODE = '42501';
  END IF;
  FOR v_k IN SELECT jsonb_object_keys(d) LOOP
    IF NOT v_k = ANY (v_chaves) THEN
      RAISE EXCEPTION 'Campo desconhecido no cadastro da conta: %', v_k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF d ? 'mes_inicio' AND nullif(d->>'mes_inicio', '') IS NOT NULL AND (d->>'mes_inicio') !~ '\A\d{4}-(0[1-9]|1[0-2])\Z' THEN
    RAISE EXCEPTION 'Mês de início inválido.' USING ERRCODE = '22023';
  END IF;
  IF d ? 'aliases' AND jsonb_typeof(d->'aliases') NOT IN ('array', 'null') THEN
    RAISE EXCEPTION 'Nomes de reconhecimento inválidos.' USING ERRCODE = '22023';
  END IF;
  IF d ? 'consolida_em_conta_id' AND nullif(d->>'consolida_em_conta_id', '') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.financeiro_contas_bancarias x
        WHERE x.id = (d->>'consolida_em_conta_id')::uuid AND x.cliente_id = p_cliente_id AND x.tipo_conta = 'cc'
          AND x.id IS DISTINCT FROM p_conta_id) THEN
    RAISE EXCEPTION 'A conta corrente escolhida não é deste cliente.' USING ERRCODE = '22023';
  END IF;
  IF d ? 'conta_interna_id' AND nullif(d->>'conta_interna_id', '') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.financeiro_contas_bancarias x
        WHERE x.id = (d->>'conta_interna_id')::uuid AND x.cliente_id = p_cliente_id AND x.tipo_conta = 'inv'
          AND x.id IS DISTINCT FROM p_conta_id) THEN
    RAISE EXCEPTION 'A conta de investimento escolhida não é deste cliente.' USING ERRCODE = '22023';
  END IF;

  IF p_conta_id IS NULL THEN
    IF nullif(btrim(d->>'nome_conta'), '') IS NULL OR nullif(d->>'fazenda_id', '') IS NULL OR nullif(d->>'tipo_conta', '') IS NULL
       OR nullif(d->>'mes_inicio', '') IS NULL OR nullif(d->>'saldo_inicial_oficial', '') IS NULL THEN
      RAISE EXCEPTION 'Preencha nome, tipo, fazenda, a data e o saldo inicial.' USING ERRCODE = '22023';
    END IF;
    -- A conta nasce INTEIRA num INSERT so' (uma linha "criou" na Auditoria, com o saldo e a data). Texto vazio = nulo.
    v_new.id := gen_random_uuid(); v_new.ativa := true; v_new.sem_extrato_bancario := false;
    v_new.created_at := now(); v_new.updated_at := now();
    v_new := jsonb_populate_record(v_new, (SELECT coalesce(jsonb_object_agg(k, CASE WHEN jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = ''
               THEN 'null'::jsonb WHEN v = '[]'::jsonb THEN 'null'::jsonb ELSE v END), '{}'::jsonb) FROM jsonb_each(d - 'conta_interna_id') AS e(k, v)));
    v_new.cliente_id := p_cliente_id;
    v_new.nome_conta := btrim(v_new.nome_conta);
    v_new.nome_exibicao := v_new.nome_conta;
    v_new.ativa := coalesce(v_new.ativa, true);
    v_new.sem_extrato_bancario := coalesce(v_new.sem_extrato_bancario, false);
    INSERT INTO public.financeiro_contas_bancarias SELECT (v_new).* RETURNING * INTO v_new;
    p_conta_id := v_new.id;
  ELSE
    SELECT * INTO v_old FROM public.financeiro_contas_bancarias WHERE id = p_conta_id AND cliente_id = p_cliente_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta não encontrada neste cliente.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  -- Tipo novo so' do vocabulario curto (cc/inv/cartao); o que a conta ja' tem (ex.: 'permuta') segue valendo.
  IF d ? 'tipo_conta' AND (d->>'tipo_conta') IS DISTINCT FROM v_old.tipo_conta AND coalesce(d->>'tipo_conta', '') NOT IN ('cc', 'inv', 'cartao') THEN
    RAISE EXCEPTION 'Tipo de conta inválido.' USING ERRCODE = '22023';
  END IF;

  IF v_old.id IS NOT NULL THEN
  UPDATE public.financeiro_contas_bancarias c SET
    nome_conta = CASE WHEN d ? 'nome_conta' THEN coalesce(nullif(btrim(d->>'nome_conta'), ''), c.nome_conta) ELSE c.nome_conta END,
    nome_exibicao = CASE WHEN d ? 'nome_conta' THEN coalesce(nullif(btrim(d->>'nome_conta'), ''), c.nome_exibicao) ELSE c.nome_exibicao END,
    codigo_conta = CASE WHEN d ? 'codigo_conta' THEN coalesce(nullif(btrim(d->>'codigo_conta'), ''), c.codigo_conta) ELSE c.codigo_conta END,
    tipo_conta = CASE WHEN d ? 'tipo_conta' THEN d->>'tipo_conta' ELSE c.tipo_conta END,
    fazenda_id = CASE WHEN d ? 'fazenda_id' THEN coalesce(nullif(d->>'fazenda_id', '')::uuid, c.fazenda_id) ELSE c.fazenda_id END,
    ativa = CASE WHEN d ? 'ativa' THEN coalesce((d->>'ativa')::boolean, c.ativa) ELSE c.ativa END,
    banco = CASE WHEN d ? 'banco' THEN nullif(btrim(d->>'banco'), '') ELSE c.banco END,
    agencia = CASE WHEN d ? 'agencia' THEN nullif(btrim(d->>'agencia'), '') ELSE c.agencia END,
    numero_conta = CASE WHEN d ? 'numero_conta' THEN nullif(btrim(d->>'numero_conta'), '') ELSE c.numero_conta END,
    conta_digito = CASE WHEN d ? 'conta_digito' THEN nullif(btrim(d->>'conta_digito'), '') ELSE c.conta_digito END,
    titular_nome = CASE WHEN d ? 'titular_nome' THEN nullif(btrim(d->>'titular_nome'), '') ELSE c.titular_nome END,
    titular_documento = CASE WHEN d ? 'titular_documento' THEN nullif(btrim(d->>'titular_documento'), '') ELSE c.titular_documento END,
    chave_pix = CASE WHEN d ? 'chave_pix' THEN nullif(btrim(d->>'chave_pix'), '') ELSE c.chave_pix END,
    observacao = CASE WHEN d ? 'observacao' THEN nullif(btrim(d->>'observacao'), '') ELSE c.observacao END,
    gerente_nome = CASE WHEN d ? 'gerente_nome' THEN nullif(btrim(d->>'gerente_nome'), '') ELSE c.gerente_nome END,
    gerente_telefone = CASE WHEN d ? 'gerente_telefone' THEN nullif(btrim(d->>'gerente_telefone'), '') ELSE c.gerente_telefone END,
    gerente_celular = CASE WHEN d ? 'gerente_celular' THEN nullif(btrim(d->>'gerente_celular'), '') ELSE c.gerente_celular END,
    gerente_email = CASE WHEN d ? 'gerente_email' THEN nullif(btrim(d->>'gerente_email'), '') ELSE c.gerente_email END,
    gerente_desde = CASE WHEN d ? 'gerente_desde' THEN nullif(d->>'gerente_desde', '')::date ELSE c.gerente_desde END,
    agencia_endereco = CASE WHEN d ? 'agencia_endereco' THEN nullif(btrim(d->>'agencia_endereco'), '') ELSE c.agencia_endereco END,
    agencia_cidade_uf = CASE WHEN d ? 'agencia_cidade_uf' THEN nullif(btrim(d->>'agencia_cidade_uf'), '') ELSE c.agencia_cidade_uf END,
    agencia_telefone = CASE WHEN d ? 'agencia_telefone' THEN nullif(btrim(d->>'agencia_telefone'), '') ELSE c.agencia_telefone END,
    agencia_outro_contato = CASE WHEN d ? 'agencia_outro_contato' THEN nullif(btrim(d->>'agencia_outro_contato'), '') ELSE c.agencia_outro_contato END,
    agencia_observacao = CASE WHEN d ? 'agencia_observacao' THEN nullif(btrim(d->>'agencia_observacao'), '') ELSE c.agencia_observacao END,
    formato_extrato = CASE WHEN d ? 'formato_extrato' THEN nullif(d->>'formato_extrato', '') ELSE c.formato_extrato END,
    sem_extrato_bancario = CASE WHEN d ? 'sem_extrato_bancario' THEN coalesce((d->>'sem_extrato_bancario')::boolean, false) ELSE c.sem_extrato_bancario END,
    aliases = CASE WHEN d ? 'aliases' THEN nullif(d->'aliases', '[]'::jsonb) ELSE c.aliases END,
    consolida_em_conta_id = CASE WHEN d ? 'consolida_em_conta_id' THEN nullif(d->>'consolida_em_conta_id', '')::uuid ELSE c.consolida_em_conta_id END,
    mes_inicio = CASE WHEN d ? 'mes_inicio' THEN nullif(d->>'mes_inicio', '') ELSE c.mes_inicio END,
    saldo_inicial_oficial = CASE WHEN d ? 'saldo_inicial_oficial' THEN nullif(d->>'saldo_inicial_oficial', '')::numeric ELSE c.saldo_inicial_oficial END
  WHERE c.id = p_conta_id
  RETURNING * INTO v_new;
  END IF;

  -- A conta de investimento que vive DENTRO desta (a conta-mae): o vinculo mora na de investimento (consolida_em_conta_id -> esta).
  -- Escolher outra (ou nenhuma) solta a que apontava para esta.
  IF d ? 'conta_interna_id' THEN
    UPDATE public.financeiro_contas_bancarias SET consolida_em_conta_id = NULL
     WHERE cliente_id = p_cliente_id AND consolida_em_conta_id = p_conta_id AND id IS DISTINCT FROM nullif(d->>'conta_interna_id', '')::uuid;
    IF nullif(d->>'conta_interna_id', '') IS NOT NULL THEN
      UPDATE public.financeiro_contas_bancarias SET consolida_em_conta_id = p_conta_id
       WHERE id = (d->>'conta_interna_id')::uuid AND cliente_id = p_cliente_id AND consolida_em_conta_id IS DISTINCT FROM p_conta_id;
    END IF;
  END IF;

  -- O saldo inicial e o mes: a semente do mes (o caminho de sempre), so' quando um dos dois mudou.
  IF v_new.mes_inicio IS NOT NULL AND v_new.saldo_inicial_oficial IS NOT NULL
     AND (v_old.saldo_inicial_oficial IS DISTINCT FROM v_new.saldo_inicial_oficial OR v_old.mes_inicio IS DISTINCT FROM v_new.mes_inicio) THEN
    SELECT s.id, s.origem_saldo_inicial INTO v_seed
      FROM public.financeiro_saldos_bancarios_v2 s
     WHERE s.conta_bancaria_id = p_conta_id AND s.ano_mes = v_new.mes_inicio
     LIMIT 1;
    IF v_seed.id IS NULL THEN
      INSERT INTO public.financeiro_saldos_bancarios_v2 (cliente_id, fazenda_id, conta_bancaria_id, ano_mes, saldo_inicial, saldo_final,
        origem_saldo_inicial, origem_saldo, status_mes, fechado)
      VALUES (p_cliente_id, v_new.fazenda_id, p_conta_id, v_new.mes_inicio, v_new.saldo_inicial_oficial, v_new.saldo_inicial_oficial,
        'manual', 'manual', 'aberto', false);
      v_semente := 'criada';
    ELSIF v_seed.origem_saldo_inicial = 'manual' THEN
      UPDATE public.financeiro_saldos_bancarios_v2
         SET saldo_inicial = v_new.saldo_inicial_oficial, saldo_final = v_new.saldo_inicial_oficial
       WHERE id = v_seed.id;
      v_semente := 'atualizada';
    ELSE
      v_semente := 'mes_com_saldo_do_banco';
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'codigo_conta', v_new.codigo_conta, 'semente', v_semente);
END $function$;

REVOKE ALL ON FUNCTION public.fn_conta_bancaria_salvar(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conta_bancaria_salvar(uuid, uuid, jsonb) TO authenticated;
