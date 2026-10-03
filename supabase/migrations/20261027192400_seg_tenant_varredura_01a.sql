-- PR-SEG-TENANT-VARREDURA-01A — guarda de tenant nas 8 funcoes de ESCRITA da Conciliacao que recebem id de linha
--
-- POR QUE (FASE 0 de 03/10): 58 funcoes SECURITY DEFINER com EXECUTE para `authenticated` nao tem guarda de tenant; elas atravessam
-- a RLS. Estas 8 sao as de escrita que as tres telas da liberacao (Lancamentos, Conciliacao, Contas a pagar/receber) chamam. Nelas
-- `auth.uid()` so' gravava o autor: um membro do cliente X que soubesse o id de um extrato do cliente Y desfazia o vinculo dele.
--
-- O QUE MUDA: no inicio de cada uma, o cliente de TODA linha recebida por parametro e' resolvido; todas tem de existir, ser do mesmo
-- cliente, e esse cliente tem de passar em `tenant_ok`. Senao, 42501 "sem acesso a este registro", sem escrever nada e sem dizer se
-- a linha existe. Com dado do proprio cliente (e para o admin), o corpo de antes roda igual. Sem usuario (auth.uid() nulo): 42501.
-- Assinatura, retorno, SECURITY DEFINER, search_path e ACL nao mudam (CREATE OR REPLACE a partir do functiondef vivo).
-- A regra de PERFIL (leitura/campo nao escrevem) e' decisao pendente (01F) e fica fora.
-- Patch guardado por md5 (origem, ancora 1x, destino): reexecutar sobre o corpo ja' corrigido FALHA na guarda de origem.

DO $mig$
DECLARE v_src text; v_def text; v_novo text; v_depois text; a text; b text; v_cfg text[]; v_acl text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proconfig, p.proacl::text INTO v_src, v_def, v_cfg, v_acl FROM pg_proc p WHERE p.oid = 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure;
  IF md5(v_src) <> 'c03d4cb4fd603a9a356becbdd01315e5' THEN
    RAISE EXCEPTION 'fn_vincular_extrato_lancamento: corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a := $a$BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
$a$;
  b := $b$BEGIN
  -- PR-SEG-TENANT-VARREDURA-01A: guarda de tenant ANTES de qualquer leitura de negocio, lock ou escrita. Confere o extrato e o lancamento.
  -- Toda linha recebida tem de EXISTIR, ser do MESMO cliente, e esse cliente tem de passar em tenant_ok (admin AgroinBlue ou membro
  -- ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a linha existe.
  DECLARE g_cli uuid[];
  BEGIN
    SELECT array_agg(q.c) INTO g_cli FROM (
      SELECT (SELECT e.cliente_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id) AS c
      UNION ALL
      SELECT (SELECT l.cliente_id FROM public.financeiro_lancamentos_v2 l WHERE l.id = p_lancamento_id) AS c
    ) q;
    IF g_cli IS NULL OR array_position(g_cli, NULL) IS NOT NULL
       OR (SELECT count(DISTINCT x) FROM unnest(g_cli) AS x) <> 1
       OR NOT COALESCE(public.tenant_ok(g_cli[1]), false) THEN
      RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
    END IF;
  END;
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
$b$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'fn_vincular_extrato_lancamento: ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_def, a, b);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure;
  IF md5(v_depois) <> '6dbfb0dc012aa35bfe3736e5b0bc1743' THEN
    RAISE EXCEPTION 'fn_vincular_extrato_lancamento: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
  -- config e ACL como estavam
  IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure) IS DISTINCT FROM v_cfg
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure) IS DISTINCT FROM v_acl
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_vincular_extrato_lancamento: config/ACL mudaram';
  END IF;
END $mig$;

DO $mig$
DECLARE v_src text; v_def text; v_novo text; v_depois text; a text; b text; v_cfg text[]; v_acl text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proconfig, p.proacl::text INTO v_src, v_def, v_cfg, v_acl FROM pg_proc p WHERE p.oid = 'public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text)'::regprocedure;
  IF md5(v_src) <> '5cf799775838a19ff5c85dad906a3a00' THEN
    RAISE EXCEPTION 'fn_vincular_grupo_conciliacao: corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a := $a$BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
$a$;
  b := $b$BEGIN
  -- PR-SEG-TENANT-VARREDURA-01A: guarda de tenant ANTES de qualquer leitura de negocio, lock ou escrita. Confere o extrato e TODOS os lancamentos do array.
  -- Toda linha recebida tem de EXISTIR, ser do MESMO cliente, e esse cliente tem de passar em tenant_ok (admin AgroinBlue ou membro
  -- ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a linha existe.
  DECLARE g_cli uuid[];
  BEGIN
    SELECT array_agg(q.c) INTO g_cli FROM (
      SELECT (SELECT e.cliente_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id) AS c
      UNION ALL
      SELECT (SELECT l.cliente_id FROM public.financeiro_lancamentos_v2 l WHERE l.id = u.id) FROM unnest(p_lancamentos) AS u(id)
    ) q;
    IF g_cli IS NULL OR array_position(g_cli, NULL) IS NOT NULL
       OR (SELECT count(DISTINCT x) FROM unnest(g_cli) AS x) <> 1
       OR NOT COALESCE(public.tenant_ok(g_cli[1]), false) THEN
      RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
    END IF;
  END;
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
$b$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'fn_vincular_grupo_conciliacao: ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_def, a, b);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text)'::regprocedure;
  IF md5(v_depois) <> 'e7fa603e8aaf0e96180e6994535a9da7' THEN
    RAISE EXCEPTION 'fn_vincular_grupo_conciliacao: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
  -- config e ACL como estavam
  IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text)'::regprocedure) IS DISTINCT FROM v_cfg
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = 'public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text)'::regprocedure) IS DISTINCT FROM v_acl
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_vincular_grupo_conciliacao(uuid, uuid[], numeric[], text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_vincular_grupo_conciliacao: config/ACL mudaram';
  END IF;
END $mig$;

DO $mig$
DECLARE v_src text; v_def text; v_novo text; v_depois text; a text; b text; v_cfg text[]; v_acl text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proconfig, p.proacl::text INTO v_src, v_def, v_cfg, v_acl FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_vinculo_extrato(uuid, text)'::regprocedure;
  IF md5(v_src) <> '07af033c158d86c2d8c69567c456b5c2' THEN
    RAISE EXCEPTION 'fn_desfazer_vinculo_extrato: corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a := $a$BEGIN
  SELECT count(*) INTO v_n FROM conciliacao_bancaria_itens
$a$;
  b := $b$BEGIN
  -- PR-SEG-TENANT-VARREDURA-01A: guarda de tenant ANTES de qualquer leitura de negocio, lock ou escrita. Confere o extrato.
  -- Toda linha recebida tem de EXISTIR, ser do MESMO cliente, e esse cliente tem de passar em tenant_ok (admin AgroinBlue ou membro
  -- ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a linha existe.
  DECLARE g_cli uuid[];
  BEGIN
    SELECT array_agg(q.c) INTO g_cli FROM (
      SELECT (SELECT e.cliente_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id) AS c
    ) q;
    IF g_cli IS NULL OR array_position(g_cli, NULL) IS NOT NULL
       OR (SELECT count(DISTINCT x) FROM unnest(g_cli) AS x) <> 1
       OR NOT COALESCE(public.tenant_ok(g_cli[1]), false) THEN
      RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
    END IF;
  END;
  SELECT count(*) INTO v_n FROM conciliacao_bancaria_itens
$b$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'fn_desfazer_vinculo_extrato: ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_def, a, b);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_vinculo_extrato(uuid, text)'::regprocedure;
  IF md5(v_depois) <> '79a1cf257bea880e516eaf7f276d4124' THEN
    RAISE EXCEPTION 'fn_desfazer_vinculo_extrato: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
  -- config e ACL como estavam
  IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_vinculo_extrato(uuid, text)'::regprocedure) IS DISTINCT FROM v_cfg
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_vinculo_extrato(uuid, text)'::regprocedure) IS DISTINCT FROM v_acl
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_vinculo_extrato(uuid, text)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_desfazer_vinculo_extrato(uuid, text)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_desfazer_vinculo_extrato(uuid, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_desfazer_vinculo_extrato: config/ACL mudaram';
  END IF;
END $mig$;

DO $mig$
DECLARE v_src text; v_def text; v_novo text; v_depois text; a text; b text; v_cfg text[]; v_acl text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proconfig, p.proacl::text INTO v_src, v_def, v_cfg, v_acl FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_grupo_conciliacao(uuid, text)'::regprocedure;
  IF md5(v_src) <> '06558026d019cc04c2b32ab2e97bfe1e' THEN
    RAISE EXCEPTION 'fn_desfazer_grupo_conciliacao: corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a := $a$BEGIN
  SELECT count(*) INTO v_n
$a$;
  b := $b$BEGIN
  -- PR-SEG-TENANT-VARREDURA-01A: guarda de tenant ANTES de qualquer leitura de negocio, lock ou escrita. Confere os vinculos do grupo e os extratos deles (grupo sem vinculo nenhum = sem acesso).
  -- Toda linha recebida tem de EXISTIR, ser do MESMO cliente, e esse cliente tem de passar em tenant_ok (admin AgroinBlue ou membro
  -- ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a linha existe.
  DECLARE g_cli uuid[];
  BEGIN
    SELECT array_agg(q.c) INTO g_cli FROM (
      SELECT c.cliente_id AS c FROM public.conciliacao_bancaria_itens c WHERE c.grupo_id = p_grupo_id
      UNION ALL
      SELECT e.cliente_id FROM public.conciliacao_bancaria_itens c JOIN public.extrato_bancario_v2 e ON e.id = c.extrato_id WHERE c.grupo_id = p_grupo_id
    ) q;
    IF g_cli IS NULL OR array_position(g_cli, NULL) IS NOT NULL
       OR (SELECT count(DISTINCT x) FROM unnest(g_cli) AS x) <> 1
       OR NOT COALESCE(public.tenant_ok(g_cli[1]), false) THEN
      RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
    END IF;
  END;
  SELECT count(*) INTO v_n
$b$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'fn_desfazer_grupo_conciliacao: ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_def, a, b);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_grupo_conciliacao(uuid, text)'::regprocedure;
  IF md5(v_depois) <> '37d02aedf1513d214c953ab0e9b70aa8' THEN
    RAISE EXCEPTION 'fn_desfazer_grupo_conciliacao: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
  -- config e ACL como estavam
  IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_grupo_conciliacao(uuid, text)'::regprocedure) IS DISTINCT FROM v_cfg
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_grupo_conciliacao(uuid, text)'::regprocedure) IS DISTINCT FROM v_acl
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.fn_desfazer_grupo_conciliacao(uuid, text)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_desfazer_grupo_conciliacao(uuid, text)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_desfazer_grupo_conciliacao(uuid, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_desfazer_grupo_conciliacao: config/ACL mudaram';
  END IF;
END $mig$;

DO $mig$
DECLARE v_src text; v_def text; v_novo text; v_depois text; a text; b text; v_cfg text[]; v_acl text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proconfig, p.proacl::text INTO v_src, v_def, v_cfg, v_acl FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure;
  IF md5(v_src) <> 'da53db4818c2ef6c0c1afd9deb315594' THEN
    RAISE EXCEPTION 'fn_espelho_casar: corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a := $a$BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id AND cancelado_em IS NULL;
$a$;
  b := $b$BEGIN
  -- PR-SEG-TENANT-VARREDURA-01A: guarda de tenant ANTES de qualquer leitura de negocio, lock ou escrita. Confere o extrato e o lancamento de TODOS os itens (vale tambem para a simulacao, que le).
  -- Toda linha recebida tem de EXISTIR, ser do MESMO cliente, e esse cliente tem de passar em tenant_ok (admin AgroinBlue ou membro
  -- ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a linha existe.
  DECLARE g_cli uuid[];
  BEGIN
    SELECT array_agg(q.c) INTO g_cli FROM (
      SELECT (SELECT e.cliente_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id) AS c
      UNION ALL
      SELECT (SELECT l.cliente_id FROM public.financeiro_lancamentos_v2 l WHERE l.id = (it.e->>'lancamento_id')::uuid)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_itens) = 'array' THEN p_itens ELSE '[]'::jsonb END) AS it(e)
    ) q;
    IF g_cli IS NULL OR array_position(g_cli, NULL) IS NOT NULL
       OR (SELECT count(DISTINCT x) FROM unnest(g_cli) AS x) <> 1
       OR NOT COALESCE(public.tenant_ok(g_cli[1]), false) THEN
      RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
    END IF;
  END;
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id AND cancelado_em IS NULL;
$b$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'fn_espelho_casar: ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_def, a, b);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure;
  IF md5(v_depois) <> 'cd21bf8d4188e2c1aa7807453d9c22e8' THEN
    RAISE EXCEPTION 'fn_espelho_casar: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
  -- config e ACL como estavam
  IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure) IS DISTINCT FROM v_cfg
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure) IS DISTINCT FROM v_acl
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_espelho_casar: config/ACL mudaram';
  END IF;
END $mig$;

DO $mig$
DECLARE v_src text; v_def text; v_novo text; v_depois text; a text; b text; v_cfg text[]; v_acl text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proconfig, p.proacl::text INTO v_src, v_def, v_cfg, v_acl FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure;
  IF md5(v_src) <> '6bb6c7d3414df925a90e16aa8bb2af46' THEN
    RAISE EXCEPTION 'fn_espelho_casar_n1: corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a := $a$BEGIN
  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
$a$;
  b := $b$BEGIN
  -- PR-SEG-TENANT-VARREDURA-01A: guarda de tenant ANTES de qualquer leitura de negocio, lock ou escrita. Confere o lancamento e TODOS os extratos do array (vale tambem para a simulacao, que le).
  -- Toda linha recebida tem de EXISTIR, ser do MESMO cliente, e esse cliente tem de passar em tenant_ok (admin AgroinBlue ou membro
  -- ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a linha existe.
  DECLARE g_cli uuid[];
  BEGIN
    SELECT array_agg(q.c) INTO g_cli FROM (
      SELECT (SELECT l.cliente_id FROM public.financeiro_lancamentos_v2 l WHERE l.id = p_lancamento_id) AS c
      UNION ALL
      SELECT (SELECT e.cliente_id FROM public.extrato_bancario_v2 e WHERE e.id = u.id) FROM unnest(p_extratos) AS u(id)
    ) q;
    IF g_cli IS NULL OR array_position(g_cli, NULL) IS NOT NULL
       OR (SELECT count(DISTINCT x) FROM unnest(g_cli) AS x) <> 1
       OR NOT COALESCE(public.tenant_ok(g_cli[1]), false) THEN
      RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
    END IF;
  END;
  SELECT * INTO v_lan FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
$b$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'fn_espelho_casar_n1: ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_def, a, b);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure;
  IF md5(v_depois) <> 'd86e57ce39ae0a9757d86ea763ff2415' THEN
    RAISE EXCEPTION 'fn_espelho_casar_n1: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
  -- config e ACL como estavam
  IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure) IS DISTINCT FROM v_cfg
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure) IS DISTINCT FROM v_acl
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_espelho_casar_n1: config/ACL mudaram';
  END IF;
END $mig$;

DO $mig$
DECLARE v_src text; v_def text; v_novo text; v_depois text; a text; b text; v_cfg text[]; v_acl text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proconfig, p.proacl::text INTO v_src, v_def, v_cfg, v_acl FROM pg_proc p WHERE p.oid = 'public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date, uuid, text, text, jsonb, date, text, uuid)'::regprocedure;
  IF md5(v_src) <> '2ea6be7a4d1ff57d42044d506a6705ac' THEN
    RAISE EXCEPTION 'fn_criar_lancamento_de_extrato: corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a := $a$BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
$a$;
  b := $b$BEGIN
  -- PR-SEG-TENANT-VARREDURA-01A: guarda de tenant ANTES de qualquer leitura de negocio, lock ou escrita. Confere o extrato e, quando informados, a fazenda, o fornecedor, a safra e a outra conta — cadastros POR CLIENTE (nenhum e' global). O plano
  -- de contas nao e' parametro: sai do texto do subcentro (ou do 18010 global, na transferencia).
  -- Toda linha recebida tem de EXISTIR, ser do MESMO cliente, e esse cliente tem de passar em tenant_ok (admin AgroinBlue ou membro
  -- ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a linha existe.
  DECLARE g_cli uuid[];
  BEGIN
    SELECT array_agg(q.c) INTO g_cli FROM (
      SELECT (SELECT e.cliente_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id) AS c
      UNION ALL
      SELECT (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = p_fazenda_id) WHERE p_fazenda_id IS NOT NULL
      UNION ALL
      SELECT (SELECT f.cliente_id FROM public.financeiro_fornecedores f WHERE f.id = p_favorecido_id) WHERE p_favorecido_id IS NOT NULL
      UNION ALL
      SELECT (SELECT s.cliente_id FROM public.financeiro_safras s WHERE s.id = p_safra_id) WHERE p_safra_id IS NOT NULL
      UNION ALL
      SELECT (SELECT b.cliente_id FROM public.financeiro_contas_bancarias b WHERE b.id = p_outra_conta) WHERE p_outra_conta IS NOT NULL
    ) q;
    IF g_cli IS NULL OR array_position(g_cli, NULL) IS NOT NULL
       OR (SELECT count(DISTINCT x) FROM unnest(g_cli) AS x) <> 1
       OR NOT COALESCE(public.tenant_ok(g_cli[1]), false) THEN
      RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
    END IF;
  END;
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
$b$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'fn_criar_lancamento_de_extrato: ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_def, a, b);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date, uuid, text, text, jsonb, date, text, uuid)'::regprocedure;
  IF md5(v_depois) <> '7952130435c04c6b5ded4f8652775e4d' THEN
    RAISE EXCEPTION 'fn_criar_lancamento_de_extrato: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
  -- config e ACL como estavam
  IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date, uuid, text, text, jsonb, date, text, uuid)'::regprocedure) IS DISTINCT FROM v_cfg
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = 'public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date, uuid, text, text, jsonb, date, text, uuid)'::regprocedure) IS DISTINCT FROM v_acl
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date, uuid, text, text, jsonb, date, text, uuid)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date, uuid, text, text, jsonb, date, text, uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_criar_lancamento_de_extrato(uuid, uuid, text, text, text, uuid, text, date, uuid, text, text, jsonb, date, text, uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_criar_lancamento_de_extrato: config/ACL mudaram';
  END IF;
END $mig$;

DO $mig$
DECLARE v_src text; v_def text; v_novo text; v_depois text; a text; b text; v_cfg text[]; v_acl text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proconfig, p.proacl::text INTO v_src, v_def, v_cfg, v_acl FROM pg_proc p WHERE p.oid = 'public.fn_reverter_desconsideracao_extrato(uuid)'::regprocedure;
  IF md5(v_src) <> '099101c8f27952a3bc588df56162c525' THEN
    RAISE EXCEPTION 'fn_reverter_desconsideracao_extrato: corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a := $a$BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
$a$;
  b := $b$BEGIN
  -- PR-SEG-TENANT-VARREDURA-01A: guarda de tenant ANTES de qualquer leitura de negocio, lock ou escrita. Confere o extrato.
  -- Toda linha recebida tem de EXISTIR, ser do MESMO cliente, e esse cliente tem de passar em tenant_ok (admin AgroinBlue ou membro
  -- ativo; sem usuario, falso). A recusa e' uma so' e nao diz se a linha existe.
  DECLARE g_cli uuid[];
  BEGIN
    SELECT array_agg(q.c) INTO g_cli FROM (
      SELECT (SELECT e.cliente_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id) AS c
    ) q;
    IF g_cli IS NULL OR array_position(g_cli, NULL) IS NOT NULL
       OR (SELECT count(DISTINCT x) FROM unnest(g_cli) AS x) <> 1
       OR NOT COALESCE(public.tenant_ok(g_cli[1]), false) THEN
      RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
    END IF;
  END;
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
$b$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'fn_reverter_desconsideracao_extrato: ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_def, a, b);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public.fn_reverter_desconsideracao_extrato(uuid)'::regprocedure;
  IF md5(v_depois) <> '7501026a3f3865184971c9dd433e92fc' THEN
    RAISE EXCEPTION 'fn_reverter_desconsideracao_extrato: corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
  -- config e ACL como estavam
  IF (SELECT p.proconfig FROM pg_proc p WHERE p.oid = 'public.fn_reverter_desconsideracao_extrato(uuid)'::regprocedure) IS DISTINCT FROM v_cfg
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = 'public.fn_reverter_desconsideracao_extrato(uuid)'::regprocedure) IS DISTINCT FROM v_acl
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.fn_reverter_desconsideracao_extrato(uuid)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_reverter_desconsideracao_extrato(uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_reverter_desconsideracao_extrato(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_reverter_desconsideracao_extrato: config/ACL mudaram';
  END IF;
END $mig$;
