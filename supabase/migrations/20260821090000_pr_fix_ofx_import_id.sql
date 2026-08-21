-- 20260821090000_pr_fix_ofx_import_id.sql
-- PR-FIX-OFX-IMPORT-ID — alinha o contrato versionado ao banco: fazenda_id NULLABLE
-- em public.financeiro_importacoes_v2.
--
-- CAUSA-RAIZ (FASE 0, proto 2026-08-21).
-- extrato_bancario_v2.importacao_id esta NULL em 3.638 de 3.638 linhas. Zero lotes
-- rastreaveis. Nenhuma importacao de extrato jamais gravou cabecalho — e nao por
-- esquecimento: src/hooks/useImportacaoExtrato.ts:1066-1073 DECLARA o motivo,
--     "O cabecalho opcional em financeiro_importacoes_v2 ainda exige fazenda_id
--      NOT NULL, entao so criamos esse header quando o usuario esta em uma fazenda
--      especifica."
-- e :1106 aplica o gate `if (fazendaEspecifica)`. Em modo global o header nao nasce
-- e importacao_id fica NULL.
--
-- A PREMISSA E FALSA NO BANCO E VERDADEIRA NO REPO — DRIFT, na direcao inversa da
-- habitual: aqui o banco esta MAIS PERMISSIVO que o contrato versionado.
--   migration de criacao 20260329150002_f535e4b8-...sql:10
--       fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE
--   proto, medido 21/08:  attnotnull = false
--   migrations com DROP NOT NULL nessa coluna: NENHUMA (17 migrations citam a
--   tabela; nenhuma toca a nulidade dessa coluna).
-- RLS tambem nao impedia: a policy fiv_ins tem WITH CHECK true, sem clausula de
-- fazenda. O gate era do front, e a razao que ele dava para existir nao valia.
--
-- DECISAO DE PRODUTO (Gabriel, 21/08) — OPCAO B.
-- Extrato bancario NAO TEM FAZENDA. A conta bancaria pertence ao cliente, e
-- extrato_bancario_v2 nao tem coluna fazenda_id. Logo o cabecalho de importacao DE
-- EXTRATO grava fazenda_id NULL SEMPRE — inclusive com fazenda selecionada na tela.
-- Preencher ali seria informacao decorativa, e abriria o risco de o MESMO extrato
-- ser importado duas vezes em fazendas diferentes e tratado como coisas distintas.
-- O fluxo Excel de lancamentos (useFinanceiro.ts:949) NAO muda: la a fazenda e real.
--
-- ESCOPO. Somente a nulidade da coluna. Tipo, FK, owner, ACL, indices, constraints,
-- policies e volumetria ficam INTOCADOS — e isso e EXIGIDO nominalmente nos pre e
-- pos-checks, nao apenas congelado.
--
-- IDEMPOTENTE. attnotnull=true -> DROP NOT NULL. attnotnull=false -> no-op validado.
-- NO PROTO ESTA MIGRATION E NO-OP: a coluna ja e nullable la. Ela existe para que o
-- repo pare de afirmar o contrario — e para que um ambiente novo, criado a partir das
-- migrations, nasca com o mesmo contrato do proto.
--
-- DROP NOT NULL nao falha por dado e nao reescreve a tabela: e catalogo, ACCESS
-- EXCLUSIVE instantaneo. Nenhuma linha e lida ou movida.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? Sim: a coluna e a tabela sao de 20260329150002.
--   (b) Reutilizar? Sim: nenhuma estrutura nova; so a nulidade muda.
--   (c) Fonte soberana? A migration versionada. Aqui ela e' que estava atrasada em
--       relacao ao banco, e o PR conserta o VERSIONADO, nao o proto.
--   (d) Segunda forma? Nao. Um unico ALTER COLUMN DROP NOT NULL.
--   (e) Tela ou plataforma? Plataforma.
--   (f) Divida? Reduz: encerra o drift nesta coluna e desbloqueia a rastreabilidade
--       de lote no extrato. Ficam abertos, como PRs proprios: o rollback de extrato
--       em excluirImportacao, a regeneracao de types.ts (que declara fazenda_id como
--       string obrigatorio) e o CHECK de vocabulario em status.
--
-- NAO HA BACKFILL. As 3.638 linhas historicas ficam com importacao_id NULL: sem os
-- arquivos de origem nao ha como reconstruir os lotes. O PR conserta daqui para frente.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.


-- N.0 PRE-CHECKS FATAIS ------------------------------------------------------------------------
DO $$
DECLARE
  v_tipo text; v_notnull boolean; v_fk text; v_total bigint; v_faz_null bigint;
  v_ncon int;
BEGIN
  ----------------------------------------------------------------- tabela
  IF to_regclass('public.financeiro_importacoes_v2') IS NULL THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: tabela financeiro_importacoes_v2 inexistente';
  END IF;

  ----------------------------------------------------------------- coluna
  SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull
    INTO v_tipo, v_notnull
    FROM pg_attribute a
   WHERE a.attrelid = 'public.financeiro_importacoes_v2'::regclass
     AND a.attname = 'fazenda_id' AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: coluna fazenda_id inexistente em financeiro_importacoes_v2';
  END IF;
  IF v_tipo <> 'uuid' THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: fazenda_id e "%", esperado uuid. Nada foi tocado.', v_tipo;
  END IF;

  ----------------------------------------------------------------- FK nominal
  -- A FK para fazendas(id) tem que existir ANTES e continuar IDENTICA DEPOIS.
  -- DROP NOT NULL nao a toca; o pos-check e a prova, nao a confianca.
  SELECT count(*), max(pg_get_constraintdef(c.oid))
    INTO v_ncon, v_fk
    FROM pg_constraint c
   WHERE c.conrelid = 'public.financeiro_importacoes_v2'::regclass
     AND c.contype = 'f'
     AND c.confrelid = 'public.fazendas'::regclass
     AND (SELECT a.attnum FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attname = 'fazenda_id') = ANY (c.conkey);
  IF v_ncon <> 1 THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: esperava 1 FK de fazenda_id para fazendas, encontrei %', v_ncon;
  END IF;

  ----------------------------------------------------------------- volumetria
  EXECUTE 'SELECT count(*), count(*) FILTER (WHERE fazenda_id IS NULL) '
          'FROM public.financeiro_importacoes_v2'
     INTO v_total, v_faz_null;

  ------------------------------------------------- congela para o pos-check
  PERFORM set_config('app.ofx01_notnull_pre', v_notnull::text, true);
  PERFORM set_config('app.ofx01_tipo_pre',    v_tipo, true);
  PERFORM set_config('app.ofx01_fk_pre',      v_fk, true);
  PERFORM set_config('app.ofx01_total_pre',   v_total::text, true);
  PERFORM set_config('app.ofx01_faznull_pre', v_faz_null::text, true);
  PERFORM set_config('app.ofx01_owner', (SELECT pg_get_userbyid(relowner) FROM pg_class
       WHERE oid='public.financeiro_importacoes_v2'::regclass), true);
  PERFORM set_config('app.ofx01_acl', (SELECT coalesce(relacl::text,'') FROM pg_class
       WHERE oid='public.financeiro_importacoes_v2'::regclass), true);
  PERFORM set_config('app.ofx01_idx', (SELECT coalesce(string_agg(indexdef, E'\n' ORDER BY indexname),'')
       FROM pg_indexes WHERE schemaname='public' AND tablename='financeiro_importacoes_v2'), true);
  PERFORM set_config('app.ofx01_con', (SELECT coalesce(string_agg(conname||':'||pg_get_constraintdef(oid), E'\n' ORDER BY conname),'')
       FROM pg_constraint WHERE conrelid='public.financeiro_importacoes_v2'::regclass), true);
  PERFORM set_config('app.ofx01_pol', (SELECT coalesce(string_agg(polname, ',' ORDER BY polname),'')
       FROM pg_policy WHERE polrelid='public.financeiro_importacoes_v2'::regclass), true);

  IF NOT v_notnull THEN
    RAISE NOTICE 'OFX-IMPORT-ID: fazenda_id JA e nullable — N.1 sera NO-OP. '
                 'linhas=%, fazenda_id NULL=%.', v_total, v_faz_null;
  ELSE
    RAISE NOTICE 'OFX-IMPORT-ID pre-checks OK: fazenda_id uuid NOT NULL, FK nominal presente, '
                 'linhas=%, fazenda_id NULL=%. Prosseguindo para DROP NOT NULL.', v_total, v_faz_null;
  END IF;
END $$;


-- N.1 CONVERSAO CONDICIONAL IDEMPOTENTE ----------------------------------------------------------
DO $$
DECLARE
  v_notnull boolean := current_setting('app.ofx01_notnull_pre', true)::boolean;
  v_t0 timestamptz; v_ms numeric;
BEGIN
  IF NOT v_notnull THEN
    RAISE NOTICE 'OFX-IMPORT-ID: coluna ja e nullable — NO-OP. Nada a alterar.';
  ELSE
    v_t0 := clock_timestamp();
    ALTER TABLE public.financeiro_importacoes_v2
      ALTER COLUMN fazenda_id DROP NOT NULL;
    v_ms := round(extract(epoch FROM (clock_timestamp() - v_t0)) * 1000, 1);
    RAISE NOTICE 'OFX-IMPORT-ID: NOT NULL removido em % ms (catalogo; sem rewrite de tabela).', v_ms;
  END IF;
END $$;


-- N.2 POS-CHECKS FATAIS --------------------------------------------------------------------------
DO $$
DECLARE
  v_tipo text; v_notnull boolean; v_fk text; v_total bigint; v_faz_null bigint;
  v_owner text; v_acl text; v_idx text; v_con text; v_pol text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod), a.attnotnull
    INTO v_tipo, v_notnull
    FROM pg_attribute a
   WHERE a.attrelid = 'public.financeiro_importacoes_v2'::regclass
     AND a.attname = 'fazenda_id' AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_notnull THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: pos-check FALHOU — fazenda_id continua NOT NULL';
  END IF;
  IF v_tipo IS DISTINCT FROM current_setting('app.ofx01_tipo_pre', true) THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: tipo mudou (% -> %)',
                    current_setting('app.ofx01_tipo_pre', true), v_tipo;
  END IF;

  ----------------------------------------------------------------- FK identica
  SELECT max(pg_get_constraintdef(c.oid)) INTO v_fk
    FROM pg_constraint c
   WHERE c.conrelid = 'public.financeiro_importacoes_v2'::regclass
     AND c.contype = 'f'
     AND c.confrelid = 'public.fazendas'::regclass
     AND (SELECT a.attnum FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attname = 'fazenda_id') = ANY (c.conkey);
  IF v_fk IS DISTINCT FROM current_setting('app.ofx01_fk_pre', true) THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: FK mudou. antes="%", depois="%"',
                    current_setting('app.ofx01_fk_pre', true), v_fk;
  END IF;

  ----------------------------------------------------------------- entorno intocado
  SELECT pg_get_userbyid(relowner), coalesce(relacl::text,'') INTO v_owner, v_acl
    FROM pg_class WHERE oid='public.financeiro_importacoes_v2'::regclass;
  IF v_owner IS DISTINCT FROM current_setting('app.ofx01_owner', true) THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: owner mudou (% -> %)', current_setting('app.ofx01_owner', true), v_owner;
  END IF;
  IF v_acl IS DISTINCT FROM current_setting('app.ofx01_acl', true) THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: ACL da tabela mudou';
  END IF;

  SELECT coalesce(string_agg(indexdef, E'\n' ORDER BY indexname),'') INTO v_idx
    FROM pg_indexes WHERE schemaname='public' AND tablename='financeiro_importacoes_v2';
  IF v_idx IS DISTINCT FROM current_setting('app.ofx01_idx', true) THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: conjunto de indices mudou';
  END IF;

  SELECT coalesce(string_agg(conname||':'||pg_get_constraintdef(oid), E'\n' ORDER BY conname),'') INTO v_con
    FROM pg_constraint WHERE conrelid='public.financeiro_importacoes_v2'::regclass;
  IF v_con IS DISTINCT FROM current_setting('app.ofx01_con', true) THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: conjunto de constraints mudou';
  END IF;

  SELECT coalesce(string_agg(polname, ',' ORDER BY polname),'') INTO v_pol
    FROM pg_policy WHERE polrelid='public.financeiro_importacoes_v2'::regclass;
  IF v_pol IS DISTINCT FROM current_setting('app.ofx01_pol', true) THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: conjunto de policies mudou';
  END IF;

  ----------------------------------------------------------------- volumetria
  EXECUTE 'SELECT count(*), count(*) FILTER (WHERE fazenda_id IS NULL) '
          'FROM public.financeiro_importacoes_v2'
     INTO v_total, v_faz_null;
  IF v_total::text IS DISTINCT FROM current_setting('app.ofx01_total_pre', true) THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: volumetria mudou (% -> %)',
                    current_setting('app.ofx01_total_pre', true), v_total;
  END IF;
  IF v_faz_null::text IS DISTINCT FROM current_setting('app.ofx01_faznull_pre', true) THEN
    RAISE EXCEPTION 'OFX-IMPORT-ID: contagem de fazenda_id NULL mudou (% -> %). '
                    'Esta migration nao escreve dado.',
                    current_setting('app.ofx01_faznull_pre', true), v_faz_null;
  END IF;

  RAISE NOTICE 'OFX-IMPORT-ID pos-checks OK: fazenda_id uuid/nullable; FK, owner, ACL, indices, '
               'constraints e policies inalterados; linhas=%, fazenda_id NULL=%.', v_total, v_faz_null;
END $$;


-- N.3 CONTRATO EXPLICITO NA COLUNA ---------------------------------------------------------------
-- O NULL aqui NAO e' ausencia de dado por descuido: e' o contrato do extrato.
COMMENT ON COLUMN public.financeiro_importacoes_v2.fazenda_id IS
  'Fazenda da importação. NULL em importação de EXTRATO BANCÁRIO: extrato pertence a cliente+conta e extrato_bancario_v2 não tem fazenda_id. Preenchido no fluxo Excel de lançamentos.';


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- FALHA FECHADA: se existir QUALQUER linha com fazenda_id NULL, o rollback ABORTA.
-- Nenhuma linha e' apagada automaticamente — reverter para NOT NULL as destruiria, e
-- sao exatamente os cabecalhos de extrato que este PR passou a criar.
-- Reverter reintroduz o defeito: extrato volta a importar sem lote rastreavel.
-- ------------------------------------------------------------------------------------------------
-- DO $rb$
-- DECLARE v_notnull boolean; v_faz_null bigint;
-- BEGIN
--   SELECT a.attnotnull INTO v_notnull FROM pg_attribute a
--    WHERE a.attrelid='public.financeiro_importacoes_v2'::regclass
--      AND a.attname='fazenda_id' AND a.attnum>0 AND NOT a.attisdropped;
--   IF v_notnull THEN
--     RAISE EXCEPTION 'rollback OFX-IMPORT-ID: fazenda_id ja e NOT NULL, nada a reverter';
--   END IF;
--
--   EXECUTE 'SELECT count(*) FILTER (WHERE fazenda_id IS NULL) FROM public.financeiro_importacoes_v2'
--      INTO v_faz_null;
--   IF v_faz_null > 0 THEN
--     RAISE EXCEPTION 'rollback OFX-IMPORT-ID: ABORTADO — % cabecalho(s) com fazenda_id NULL. '
--                     'Reverter para NOT NULL os destruiria. Decisao humana obrigatoria; '
--                     'nenhum dado foi tocado.', v_faz_null;
--   END IF;
--
--   ALTER TABLE public.financeiro_importacoes_v2
--     ALTER COLUMN fazenda_id SET NOT NULL;
--
--   COMMENT ON COLUMN public.financeiro_importacoes_v2.fazenda_id IS NULL;
--
--   RAISE NOTICE 'rollback OFX-IMPORT-ID OK: fazenda_id de volta a NOT NULL. '
--                'IMPORTACAO DE EXTRATO VOLTA A NAO GRAVAR LOTE.';
-- END $rb$;
-- ================================================================================================
