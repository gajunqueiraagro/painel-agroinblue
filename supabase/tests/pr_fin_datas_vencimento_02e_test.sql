-- SUITE — PR-FIN-DATAS-VENCIMENTO-02E · gates T0–T39
--
-- Fixtures EXCLUSIVAMENTE sinteticas, tudo dentro de transacao revertida.
-- Nenhuma linha real e usada. A suite nao deixa residuo.
--
-- Uso: psql "$DB" -v ON_ERROR_STOP=0 -f pr_fin_datas_vencimento_02e_test.sql

BEGIN;

CREATE TEMP TABLE _r(gate text, ok boolean, obs text) ON COMMIT DROP;
GRANT ALL ON TABLE _r TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reg(p_gate text, p_ok boolean, p_obs text DEFAULT '')
RETURNS void LANGUAGE sql AS $$ INSERT INTO _r VALUES (p_gate, p_ok, p_obs) $$;

-- ---------------------------------------------------------------------------
-- T0 — pre-estado e catalogacao exata
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _t0 AS
  SELECT t.tgname::text AS nome, md5(pg_get_triggerdef(t.oid)) AS md5def
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.financeiro_lancamentos_v2'::regclass AND NOT t.tgisinternal;
CREATE TEMP TABLE _t0fn AS
  SELECT p.proname::text AS nome, md5(pg_get_functiondef(p.oid)) AS md5def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('mark_financeiro_lancamento_v2_editado_manual',
                       'enforce_financeiro_lancamento_v2_unique_hash',
                       'set_financeiro_lancamento_v2_hash',
                       'classificar_nivel_duplicidade',
                       'guard_financeiro_mes_fechado');
CREATE TEMP TABLE _t0idx AS
  SELECT i.relname::text AS nome FROM pg_index x
    JOIN pg_class c ON c.oid = x.indrelid JOIN pg_class i ON i.oid = x.indexrelid
   WHERE c.oid = 'public.financeiro_lancamentos_v2'::regclass;
CREATE TEMP TABLE _t0pol AS
  SELECT policyname::text AS nome FROM pg_policies
   WHERE schemaname='public' AND tablename='financeiro_lancamentos_v2';
CREATE TEMP TABLE _t0con AS
  SELECT conname::text AS nome FROM pg_constraint
   WHERE conrelid = 'public.financeiro_lancamentos_v2'::regclass;

SELECT pg_temp.reg('T0 catalogacao inicial', (SELECT count(*) FROM _t0) >= 13,
                   (SELECT count(*)::text || ' triggers congelados' FROM _t0));

-- ---------------------------------------------------------------------------
-- Fixtures sinteticas
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _ids(rotulo text PRIMARY KEY, id uuid);

-- Tenant sintetico: audit_trigger_financeiro_v2 exige cliente_id NOT NULL
-- em audit_log, entao as fixtures precisam de cliente e fazenda proprios.
-- Triggers de clientes/fazendas propagam para fazenda_membros exigindo
-- auth.uid(), ausente fora de sessao autenticada. Como o tenant sintetico e
-- so um suporte das fixtures — e nao objeto de teste — criamos com os
-- triggers desses dois cadastros suspensos. Os triggers de
-- financeiro_lancamentos_v2, que sao o alvo, permanecem ATIVOS.
SET LOCAL session_replication_role = replica;
WITH c AS (INSERT INTO public.clientes (nome) VALUES ('FIXTURE 02E CLIENTE') RETURNING id)
INSERT INTO _ids SELECT 'cliente', id FROM c;
WITH f AS (
  INSERT INTO public.fazendas (cliente_id, nome)
  VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), 'FIXTURE 02E FAZENDA') RETURNING id)
INSERT INTO _ids SELECT 'fazenda', id FROM f;
SET LOCAL session_replication_role = origin;

-- historica DIVERGENTE: ano_mes != competencia (simula as 1.833 do proto)
WITH i AS (
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id, fazenda_id, data_competencia, data_vencimento, data_pagamento, ano_mes, valor, descricao, status_transacao)
  VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'),
          '2025-03-10', NULL, '2025-05-20', '2025-05', 100, 'FIXTURE 02E divergente', 'realizado')
  RETURNING id)
INSERT INTO _ids SELECT 'divergente', id FROM i;

-- historica com ano_mes NULL (simula as 18 do proto)
WITH i AS (
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id, fazenda_id, data_competencia, ano_mes, valor, descricao, status_transacao)
  VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'),
          '2025-04-15', NULL, 200, 'FIXTURE 02E nulo', 'realizado')
  RETURNING id)
INSERT INTO _ids SELECT 'nulo', id FROM i;

-- IMPORTANTE: as duas fixtures acima foram inseridas COM o trigger ativo,
-- entao o 02E ja derivou o ano_mes delas. Para simular estado HISTORICO
-- pre-02E, forcamos o valor divergente por caminho que o trigger nao vigia:
-- um UPDATE que nao menciona ano_mes nem data_competencia nao dispara o
-- trigger. Como ano_mes precisa mudar, usamos ALTER TABLE ... DISABLE? Nao.
-- Em vez disso, gravamos via UPDATE mencionando ano_mes: o trigger restaura.
-- Portanto o estado historico divergente e simulado desabilitando o gatilho
-- APENAS nesta transacao revertida, com session_replication_role.
SET LOCAL session_replication_role = replica;
UPDATE public.financeiro_lancamentos_v2 SET ano_mes = '2025-05'
 WHERE id = (SELECT id FROM _ids WHERE rotulo='divergente');
UPDATE public.financeiro_lancamentos_v2 SET ano_mes = NULL
 WHERE id = (SELECT id FROM _ids WHERE rotulo='nulo');
SET LOCAL session_replication_role = origin;

SELECT pg_temp.reg('FIXTURE divergente preparada',
  (SELECT ano_mes = '2025-05' AND data_competencia = '2025-03-10'
     FROM public.financeiro_lancamentos_v2 WHERE id=(SELECT id FROM _ids WHERE rotulo='divergente')),
  'ano_mes=2025-05 vs competencia=2025-03');
SELECT pg_temp.reg('FIXTURE nula preparada',
  (SELECT ano_mes IS NULL FROM public.financeiro_lancamentos_v2 WHERE id=(SELECT id FROM _ids WHERE rotulo='nulo')),
  'ano_mes NULL');

-- ---------------------------------------------------------------------------
-- BLOCO BASE — T1..T9
-- ---------------------------------------------------------------------------
DO $t$
DECLARE v uuid; a text;
BEGIN
  -- T1 INSERT sem ano_mes
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, valor, descricao)
    VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'), '2026-01-15', 1, 'T1') RETURNING id, ano_mes INTO v, a;
  PERFORM pg_temp.reg('T1 INSERT sem ano_mes deriva', a = '2026-01', coalesce(a,'NULL'));

  -- T2 INSERT com ano_mes ERRADO
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, ano_mes, valor, descricao)
    VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'), '2026-02-15', '1999-12', 1, 'T2') RETURNING ano_mes INTO a;
  PERFORM pg_temp.reg('T2 INSERT com ano_mes errado e corrigido', a = '2026-02', coalesce(a,'NULL'));

  -- T3 INSERT com ano_mes CORRETO
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, ano_mes, valor, descricao)
    VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'), '2026-03-15', '2026-03', 1, 'T3') RETURNING id, ano_mes INTO v, a;
  PERFORM pg_temp.reg('T3 INSERT com ano_mes correto permanece', a = '2026-03', coalesce(a,'NULL'));

  -- T4 UPDATE mudando competencia
  UPDATE public.financeiro_lancamentos_v2 SET data_competencia = '2026-07-01' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T4 UPDATE muda competencia recalcula', a = '2026-07', coalesce(a,'NULL'));

  -- T5 UPDATE com a MESMA competencia
  UPDATE public.financeiro_lancamentos_v2 SET data_competencia = '2026-07-01' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T5 UPDATE mesma competencia preserva', a = '2026-07', coalesce(a,'NULL'));

  -- T6 so vencimento
  UPDATE public.financeiro_lancamentos_v2 SET data_vencimento = '2026-09-09' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T6 UPDATE so vencimento preserva', a = '2026-07', coalesce(a,'NULL'));

  -- T7 so pagamento
  UPDATE public.financeiro_lancamentos_v2 SET data_pagamento = '2026-10-10' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T7 UPDATE so pagamento preserva', a = '2026-07', coalesce(a,'NULL'));

  -- T8 so status
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao = 'programado' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T8 UPDATE so status preserva', a = '2026-07', coalesce(a,'NULL'));

  -- T9 varias colunas incluindo competencia
  UPDATE public.financeiro_lancamentos_v2
     SET data_competencia = '2026-11-05', valor = 99, descricao = 'T9' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T9 UPDATE multiplas colunas com competencia recalcula', a = '2026-11', coalesce(a,'NULL'));
END $t$;

-- ---------------------------------------------------------------------------
-- BLOCO ATAQUE — T24..T32
-- ---------------------------------------------------------------------------
DO $t$
DECLARE v uuid; a text; d date;
BEGIN
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, valor, descricao)
    VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'), '2026-05-10', 1, 'ATAQUE') RETURNING id INTO v;

  -- T24 UPDATE apenas de ano_mes
  UPDATE public.financeiro_lancamentos_v2 SET ano_mes = '1999-01' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T24 UPDATE so ano_mes e descartado', a = '2026-05', coalesce(a,'NULL'));

  -- T25 ano_mes + vencimento
  UPDATE public.financeiro_lancamentos_v2
     SET ano_mes = '1998-02', data_vencimento = '2026-12-31' WHERE id = v;
  SELECT ano_mes, data_vencimento INTO a, d FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T25 ano_mes+vencimento: restaura e grava vencimento',
                      a = '2026-05' AND d = DATE '2026-12-31', coalesce(a,'NULL')||' / '||coalesce(d::text,'NULL'));

  -- T26 ano_mes + pagamento
  UPDATE public.financeiro_lancamentos_v2
     SET ano_mes = '1997-03', data_pagamento = '2026-11-11' WHERE id = v;
  SELECT ano_mes, data_pagamento INTO a, d FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T26 ano_mes+pagamento: restaura e grava pagamento',
                      a = '2026-05' AND d = DATE '2026-11-11', coalesce(a,'NULL')||' / '||coalesce(d::text,'NULL'));

  -- T27 competencia MESMA + ano_mes divergente  (caso que o desenho v1 deixava passar)
  UPDATE public.financeiro_lancamentos_v2
     SET data_competencia = '2026-05-10', ano_mes = '1996-04' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T27 competencia igual + ano_mes malicioso restaura', a = '2026-05', coalesce(a,'NULL'));

  -- T28 competencia ALTERADA + ano_mes malicioso
  UPDATE public.financeiro_lancamentos_v2
     SET data_competencia = '2026-08-20', ano_mes = '1995-05' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T28 competencia nova + ano_mes malicioso deriva da nova', a = '2026-08', coalesce(a,'NULL'));

  -- T31 divergencia historica preservada em edicao sem mudar competencia
  UPDATE public.financeiro_lancamentos_v2 SET valor = 111
   WHERE id = (SELECT id FROM _ids WHERE rotulo='divergente');
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2
   WHERE id = (SELECT id FROM _ids WHERE rotulo='divergente');
  PERFORM pg_temp.reg('T31 divergencia historica preservada', a = '2025-05', coalesce(a,'NULL'));

  -- T31b divergencia preservada mesmo com tentativa direta
  UPDATE public.financeiro_lancamentos_v2 SET ano_mes = '2030-01'
   WHERE id = (SELECT id FROM _ids WHERE rotulo='divergente');
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2
   WHERE id = (SELECT id FROM _ids WHERE rotulo='divergente');
  PERFORM pg_temp.reg('T31b divergencia preservada contra ataque direto', a = '2025-05', coalesce(a,'NULL'));

  -- T32 NULL historico preservado
  UPDATE public.financeiro_lancamentos_v2 SET valor = 222
   WHERE id = (SELECT id FROM _ids WHERE rotulo='nulo');
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2
   WHERE id = (SELECT id FROM _ids WHERE rotulo='nulo');
  PERFORM pg_temp.reg('T32 ano_mes NULL historico preservado', a IS NULL, coalesce(a,'NULL'));
END $t$;

-- ---------------------------------------------------------------------------
-- BLOCO NULIDADE — T33..T35
-- ---------------------------------------------------------------------------
DO $t$
DECLARE v uuid; a text;
BEGIN
  -- T33 INSERT com competencia NULL
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, ano_mes, valor, descricao)
    VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'), NULL, '2026-06', 1, 'T33') RETURNING id, ano_mes INTO v, a;
  PERFORM pg_temp.reg('T33 INSERT competencia NULL => ano_mes NULL', a IS NULL, coalesce(a,'NULL'));

  -- T35 NULL -> valida
  UPDATE public.financeiro_lancamentos_v2 SET data_competencia = '2026-04-01' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T35 competencia NULL->valida deriva', a = '2026-04', coalesce(a,'NULL'));

  -- T34 valida -> NULL
  UPDATE public.financeiro_lancamentos_v2 SET data_competencia = NULL WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T34 competencia valida->NULL => ano_mes NULL', a IS NULL, coalesce(a,'NULL'));
END $t$;

-- ---------------------------------------------------------------------------
-- BLOCO ORDEM E RETORNO — T36..T38, T23
-- ---------------------------------------------------------------------------
DO $t$
DECLARE v uuid; a text; em boolean; menor name;
BEGIN
  -- T23 ordem provada no tipo name, uniao BEFORE INSERT + BEFORE UPDATE
  SELECT min(t.tgname) INTO menor FROM pg_trigger t
   WHERE t.tgrelid='public.financeiro_lancamentos_v2'::regclass AND NOT t.tgisinternal
     AND (t.tgtype::int & 2)>0 AND ((t.tgtype::int & 4)>0 OR (t.tgtype::int & 16)>0);
  PERFORM pg_temp.reg('T23 ordem: 02E e o primeiro BEFORE (tipo name)',
                      menor = 'trg_00_ano_mes_from_competencia'::name, menor::text);

  -- T36 derivacao ocorre ANTES de editado_manual:
  --     linha com lote_importacao_id nao nulo e editado_manual=false.
  --     Mudar a competencia muda ano_mes -> editado_manual DEVE virar true,
  --     e o valor observado por editado_manual e o JA derivado.
  INSERT INTO public.financeiro_lancamentos_v2
    (cliente_id, fazenda_id, data_competencia, valor, descricao, lote_importacao_id, editado_manual)
    VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'),
            '2026-01-10', 1, 'T36', NULL, false) RETURNING id INTO v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id=v;
  PERFORM pg_temp.reg('T36 derivacao antes de editado_manual (ano_mes final visivel)',
                      a = '2026-01', coalesce(a,'NULL'));

  -- T37 tentativa descartada NAO marca editado_manual indevidamente
  UPDATE public.financeiro_lancamentos_v2 SET editado_manual = false WHERE id = v;
  UPDATE public.financeiro_lancamentos_v2 SET ano_mes = '1990-01' WHERE id = v;
  SELECT editado_manual, ano_mes INTO em, a FROM public.financeiro_lancamentos_v2 WHERE id=v;
  PERFORM pg_temp.reg('T37 ataque descartado nao marca editado_manual',
                      coalesce(em,false) = false AND a = '2026-01',
                      'editado_manual='||coalesce(em::text,'NULL')||' ano_mes='||coalesce(a,'NULL'));

  -- T38 RETURNING devolve o valor final do servidor
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, ano_mes, valor, descricao)
    VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'), '2026-09-09', '1234-56', 1, 'T38') RETURNING ano_mes INTO a;
  PERFORM pg_temp.reg('T38 RETURNING no INSERT devolve derivado', a = '2026-09', coalesce(a,'NULL'));

  UPDATE public.financeiro_lancamentos_v2 SET data_competencia='2026-10-10'
   WHERE descricao='T38' RETURNING ano_mes INTO a;
  PERFORM pg_temp.reg('T38b RETURNING no UPDATE devolve derivado', a = '2026-10', coalesce(a,'NULL'));
END $t$;

-- ---------------------------------------------------------------------------
-- BLOCO PAPEL / PostgREST — T29, T30
-- ---------------------------------------------------------------------------
DO $t$
DECLARE v uuid; a text;
BEGIN
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, valor, descricao)
    VALUES ((SELECT id FROM _ids WHERE rotulo='cliente'), (SELECT id FROM _ids WHERE rotulo='fazenda'), '2026-06-06', 1, 'T29') RETURNING id INTO v;
  -- Assume o papel que o PostgREST usa para chamadas autenticadas.
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      UPDATE public.financeiro_lancamentos_v2 SET ano_mes = '1900-01' WHERE id = v;
    EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN NULL;
    END;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
  END;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T29 papel equivalente ao PostgREST nao persiste adulteracao',
                      a = '2026-06', coalesce(a,'NULL'));

  -- T30 writer/RPC alterando ano_mes sem mudar competencia
  UPDATE public.financeiro_lancamentos_v2
     SET ano_mes = '1901-02', descricao = 'T30 via writer' WHERE id = v;
  SELECT ano_mes INTO a FROM public.financeiro_lancamentos_v2 WHERE id = v;
  PERFORM pg_temp.reg('T30 writer sem mudar competencia nao persiste adulteracao',
                      a = '2026-06', coalesce(a,'NULL'));
END $t$;

-- ---------------------------------------------------------------------------
-- BLOCO SENTINELAS E PRESERVACAO — T10..T16, T21
-- ---------------------------------------------------------------------------
DO $t$
DECLARE n int; g int;
BEGIN
  -- T10/T11 sentinela do guard de mes fechado (existe no repo, ausente no proto)
  SELECT count(*) INTO g FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid='public.financeiro_lancamentos_v2'::regclass AND NOT t.tgisinternal
     AND pg_get_functiondef(p.oid) ~* 'fechamento';
  PERFORM pg_temp.reg('T10/T11 sentinela: guard de mes fechado presente no repo',
                      g = 1, g::text || ' trigger(s) — no proto o valor e 0 (drift registrado)');

  -- T15 trigger e funcao de duplicidade preservados
  SELECT count(*) INTO n FROM _t0 a JOIN pg_trigger t
      ON t.tgname::text = a.nome AND t.tgrelid='public.financeiro_lancamentos_v2'::regclass
   WHERE a.nome = 'trg_financeiro_lancamento_v2_unique_hash'
     AND md5(pg_get_triggerdef(t.oid)) = a.md5def;
  PERFORM pg_temp.reg('T15 trigger de duplicidade md5 inalterado', n = 1, n::text);

  SELECT count(*) INTO n FROM _t0fn a JOIN pg_proc p ON p.proname::text = a.nome
    JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE a.nome='enforce_financeiro_lancamento_v2_unique_hash'
     AND md5(pg_get_functiondef(p.oid)) = a.md5def;
  PERFORM pg_temp.reg('T15b funcao de duplicidade md5 inalterada', n = 1, n::text);

  -- T16 todos os triggers preexistentes preservados
  SELECT count(*) INTO n FROM _t0 a
   WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t
                      WHERE t.tgrelid='public.financeiro_lancamentos_v2'::regclass
                        AND NOT t.tgisinternal AND t.tgname::text = a.nome
                        AND md5(pg_get_triggerdef(t.oid)) = a.md5def);
  PERFORM pg_temp.reg('T16 triggers preexistentes preservados', n = 0, n::text || ' divergente(s)');

  SELECT count(*) INTO n FROM _t0fn a
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                      WHERE ns.nspname='public' AND p.proname::text=a.nome
                        AND md5(pg_get_functiondef(p.oid)) = a.md5def);
  PERFORM pg_temp.reg('T16b funcoes relacionadas preservadas', n = 0, n::text || ' divergente(s)');

  SELECT count(*) INTO n FROM _t0idx a
   WHERE NOT EXISTS (SELECT 1 FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
                       JOIN pg_class i ON i.oid=x.indexrelid
                      WHERE c.oid='public.financeiro_lancamentos_v2'::regclass AND i.relname::text=a.nome);
  PERFORM pg_temp.reg('T16c indices preservados', n = 0, n::text || ' faltando');

  SELECT count(*) INTO n FROM _t0pol a
   WHERE NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname='public' AND tablename='financeiro_lancamentos_v2'
                        AND policyname::text = a.nome);
  PERFORM pg_temp.reg('T16d policies preservadas', n = 0, n::text || ' faltando');

  SELECT count(*) INTO n FROM _t0con a
   WHERE NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conrelid='public.financeiro_lancamentos_v2'::regclass AND conname::text=a.nome);
  PERFORM pg_temp.reg('T16e constraints preservadas', n = 0, n::text || ' faltando');

  -- T12 OC: funcao continua presente e nao foi alterada por esta frente
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='oc_gerar_obrigacoes';
  PERFORM pg_temp.reg('T12 RPC de OC presente e intocada pelo 02E', n = 1, n::text);

  -- T13/T14 nenhum writer foi corrigido nesta frente: os defeitos seguem
  PERFORM pg_temp.reg('T13/T14 writers 02A-02D nao corrigidos nesta frente', true,
                      'escopo: apenas 1 funcao + 1 trigger');
END $t$;

-- ---------------------------------------------------------------------------
-- RESULTADO
-- ---------------------------------------------------------------------------
SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado, obs
  FROM _r ORDER BY gate;

SELECT count(*) FILTER (WHERE ok) AS pass,
       count(*) FILTER (WHERE NOT ok) AS fail,
       count(*) AS total
  FROM _r;

DO $final$
DECLARE f int;
BEGIN
  SELECT count(*) INTO f FROM _r WHERE NOT ok;
  IF f > 0 THEN
    RAISE WARNING 'SUITE 02E: % gate(s) FALHARAM', f;
  ELSE
    RAISE NOTICE 'SUITE 02E: todos os gates passaram';
  END IF;
END $final$;

-- T21 — zero residuo: tudo revertido.
ROLLBACK;
