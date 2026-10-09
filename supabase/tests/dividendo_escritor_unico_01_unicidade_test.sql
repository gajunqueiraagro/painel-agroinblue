-- DIVIDENDO-ESCRITOR-UNICO-01 (passo 1) — a unicidade do plano por cliente e a trava cliente x global.
-- Roda depois da 20261027195200, numa transacao que TERMINA EM RAISE (nada fica). Sintetico: o cliente Teste (T), um SEGUNDO
-- cliente criado na transacao (Y) e contas de plano "SINT UNI …".
-- U0 estrutura: os dois indices unicos com o predicado certo e a trava ligada.
-- U1 MESMO NOME EM DOIS CLIENTES: aceito.            U2 repetido DENTRO do cliente: recusado (indice).
-- U3 repetido ENTRE AS GLOBAIS: recusado (indice).   U4 conta de CLIENTE com a hierarquia de uma GLOBAL: recusada pela trava, 23505,
--    com a frase que diz a conta.                    U5 GLOBAL com a hierarquia de uma conta de CLIENTE: recusada pela trava.
-- U6 REATIVAR que criaria o par: recusado, nas duas direcoes.
-- U7 UPDATE que cria o par trocando coluna da hierarquia ou o cliente_id: recusado.
-- U8 INATIVAR e' livre (a conta do par potencial inativa convive; inativar membro nunca e' barrado), e UPDATE de coluna fora da
--    regra numa conta ja' julgada passa.
-- U9 a trava compara COMO O INDICE: grupo nulo = grupo vazio; centro diferente NAO colide.
set local lock_timeout = '2s';
set local statement_timeout = '10s';

create function pg_temp.conta(p_cli uuid, p_sub text, p_centro text default 'SINT UNI', p_ativo boolean default true, p_grupo text default 'SINT UNI')
returns uuid language sql as $f$
  insert into financeiro_plano_contas (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao)
  values (p_cli, '2-Saídas', 'SINT UNI', p_grupo, p_centro, p_sub, 'administrativo', p_ativo, 99990) returning id $f$;

DO $t$
DECLARE
  c_t constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_y uuid; a uuid; b uuid; g uuid; x uuid; v_msg text; v_st text; v_n int;
BEGIN
  INSERT INTO clientes (nome) VALUES ('SINT UNI cliente Y') RETURNING id INTO v_y;

  -- ── U0 ──
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_plano_contas_cliente'
                   AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%(cliente_id, tipo_operacao, macro_custo,%' AND indexdef LIKE '%cliente_id IS NOT NULL%')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_plano_contas_global'
                   AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%(tipo_operacao, macro_custo,%' AND indexdef LIKE '%cliente_id IS NULL%') THEN
    RAISE EXCEPTION 'U0: os indices nao sao os esperados';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.financeiro_plano_contas'::regclass AND tgname='trg_guard_plano_cliente_x_global' AND tgenabled='O') THEN
    RAISE EXCEPTION 'U0: a trava nao esta'' ligada';
  END IF;

  -- ── U1: mesmo nome em dois clientes ──
  a := pg_temp.conta(c_t, 'SINT UNI Homonimo');
  b := pg_temp.conta(v_y, 'SINT UNI Homonimo');
  IF (SELECT count(*) FROM financeiro_plano_contas WHERE subcentro='SINT UNI Homonimo' AND ativo) <> 2 THEN RAISE EXCEPTION 'U1: os dois clientes nao ficaram com a conta'; END IF;

  -- ── U2: repetido dentro do cliente ──
  BEGIN
    PERFORM pg_temp.conta(c_t, 'SINT UNI Homonimo');
    RAISE EXCEPTION 'U2 FALHOU: o cliente ficou com duas contas iguais';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%uq_plano_contas_cliente%' THEN RAISE EXCEPTION 'U2: recusado por outro motivo (%)', v_msg; END IF;
  END;

  -- ── U3: repetido entre as globais ──
  g := pg_temp.conta(NULL, 'SINT UNI Global');
  BEGIN
    PERFORM pg_temp.conta(NULL, 'SINT UNI Global');
    RAISE EXCEPTION 'U3 FALHOU: duas globais iguais';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%uq_plano_contas_global%' THEN RAISE EXCEPTION 'U3: recusado por outro motivo (%)', v_msg; END IF;
  END;

  -- ── U4: conta de cliente com a hierarquia de uma global ──
  BEGIN
    PERFORM pg_temp.conta(c_t, 'SINT UNI Global');
    RAISE EXCEPTION 'U4 FALHOU: o cliente repetiu uma conta geral';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_st = RETURNED_SQLSTATE;
    IF v_st <> '23505' OR v_msg NOT LIKE 'O plano de contas já tem a conta geral «SINT UNI Global»%uma conta do cliente não pode repetir uma conta geral%' THEN
      RAISE EXCEPTION 'U4: frase ou codigo inesperado (% / %)', v_st, v_msg;
    END IF;
  END;

  -- ── U5: global com a hierarquia de uma conta de cliente ──
  BEGIN
    PERFORM pg_temp.conta(NULL, 'SINT UNI Homonimo');
    RAISE EXCEPTION 'U5 FALHOU: a geral repetiu uma conta de cliente';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE 'Já existe conta de cliente «SINT UNI Homonimo»%uma conta geral não pode repetir uma conta de cliente%' THEN
      RAISE EXCEPTION 'U5: frase inesperada (%)', v_msg;
    END IF;
  END;

  -- ── U6: reativar que criaria o par, nas duas direcoes ──
  x := pg_temp.conta(c_t, 'SINT UNI Global', 'SINT UNI', false);          -- inativa: entra (U8)
  BEGIN
    UPDATE financeiro_plano_contas SET ativo = true WHERE id = x;
    RAISE EXCEPTION 'U6 FALHOU: reativou a conta do cliente por cima da geral';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE '%conta geral «SINT UNI Global»%' THEN RAISE EXCEPTION 'U6a: frase inesperada (%)', v_msg; END IF;
  END;
  x := pg_temp.conta(NULL, 'SINT UNI Homonimo', 'SINT UNI', false);
  BEGIN
    UPDATE financeiro_plano_contas SET ativo = true WHERE id = x;
    RAISE EXCEPTION 'U6 FALHOU: reativou a geral por cima da conta do cliente';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE 'Já existe conta de cliente «SINT UNI Homonimo»%' THEN RAISE EXCEPTION 'U6b: frase inesperada (%)', v_msg; END IF;
  END;

  -- ── U7: UPDATE que cria o par pela hierarquia e pelo cliente_id ──
  x := pg_temp.conta(c_t, 'SINT UNI Outra');
  BEGIN
    UPDATE financeiro_plano_contas SET subcentro = 'SINT UNI Global' WHERE id = x;
    RAISE EXCEPTION 'U7 FALHOU: renomeou a conta do cliente para o nome da geral';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE financeiro_plano_contas SET cliente_id = c_t WHERE id = g;      -- a geral viraria do cliente: nao ha' par (segue unica) -> passa
    UPDATE financeiro_plano_contas SET cliente_id = NULL WHERE id = g;     -- e volta a geral
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'U7: trocar o cliente de uma conta sem par foi recusado';
  END;
  BEGIN
    UPDATE financeiro_plano_contas SET cliente_id = NULL WHERE id = a;     -- a conta de T viraria geral, e Y tem a mesma: par
    RAISE EXCEPTION 'U7 FALHOU: a conta do cliente virou geral por cima da de outro cliente';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE 'Já existe conta de cliente «SINT UNI Homonimo»%' THEN RAISE EXCEPTION 'U7: frase inesperada (%)', v_msg; END IF;
  END;

  -- ── U8: inativar e' livre; UPDATE fora da regra passa ──
  UPDATE financeiro_plano_contas SET ativo = false WHERE id = g;           -- inativa a geral
  x := pg_temp.conta(c_t, 'SINT UNI Global');                              -- agora o cliente pode ter o nome
  UPDATE financeiro_plano_contas SET ativo = false WHERE id = x;           -- e inativar o do cliente tambem e' livre
  UPDATE financeiro_plano_contas SET ativo = true WHERE id = g;            -- a geral volta (o do cliente esta' inativo)
  UPDATE financeiro_plano_contas SET ordem_exibicao = 99991, escopo_negocio = 'administrativo' WHERE id IN (a, b, g);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 3 THEN RAISE EXCEPTION 'U8: o UPDATE fora da regra nao passou nas 3 contas (%)', v_n; END IF;

  -- ── U9: como o indice compara ──
  PERFORM pg_temp.conta(c_t, 'SINT UNI Global', 'SINT UNI outro centro');  -- centro diferente: nao colide
  BEGIN
    PERFORM pg_temp.conta(v_y, 'SINT UNI Grupo Vazio', 'SINT UNI', true, NULL);
    PERFORM pg_temp.conta(NULL, 'SINT UNI Grupo Vazio', 'SINT UNI', true, '');   -- grupo '' = grupo nulo: par
    RAISE EXCEPTION 'U9 FALHOU: grupo nulo e grupo vazio nao colidiram';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  RAISE EXCEPTION 'OK DIVIDENDO-ESCRITOR-UNICO-01 passo 1: U0 a U9';
END
$t$;
