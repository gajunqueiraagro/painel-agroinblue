-- PR-FIN-DATAS-VENCIMENTO-02E — ano_mes derivado no servidor.  [KIT v2]
--
-- Cria EXATAMENTE dois objetos:
--   1. public.fn_ano_mes_from_competencia()  — funcao trigger, SECURITY INVOKER
--   2. trg_00_ano_mes_from_competencia       — trigger em financeiro_lancamentos_v2
--
-- NAO faz: ALTER de coluna, UPDATE historico, mudanca de default/nullability/tipo,
--          alteracao de RLS, indices, constraints, ACLs de objetos existentes,
--          nem qualquer toque no trigger/funcao de duplicidade.
--
-- CONTRATO FUNCIONAL (inalterado em relacao ao kit v1)
--   INSERT  -> NEW.ano_mes := to_char(NEW.data_competencia,'YYYY-MM'), sempre.
--   UPDATE  -> competencia mudou  => deriva da nova
--              competencia igual  => NEW.ano_mes := OLD.ano_mes  (restauracao)
--
-- EVENTO: BEFORE INSERT OR UPDATE OF ano_mes, data_competencia
--
-- ---------------------------------------------------------------------------
-- CORRECAO v2 — P1 do parecer: idempotencia real da FUNCAO.
--
-- O kit v1 detectava a funcao existente, comparava apenas atributos gerais,
-- anunciava "no-op validado" e em seguida executava CREATE OR REPLACE
-- INCONDICIONALMENTE. Consequencias: corpo divergente era sobrescrito em
-- silencio; owner e ACL divergentes passavam.
--
-- v2: CREATE OR REPLACE FUNCTION NAO EXISTE nesta migration. A funcao e criada
--     por EXECUTE dinamico SOMENTE quando ausente, a partir do MESMO literal
--     de corpo usado na comparacao. Presente e identica => nenhum comando de
--     escrita e emitido. Presente e divergente => aborta antes de tudo.
-- ---------------------------------------------------------------------------

DO $mig$
DECLARE
  -- Corpo canonico. Este literal e a UNICA fonte: e o que se cria e o que se
  -- compara. `prosrc` guarda exatamente o texto entre os delimitadores, entao
  -- a comparacao e por igualdade de texto, nao por hash aproximado.
  c_corpo constant text :=
$corpo$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Sempre derivar. O ano_mes enviado pelo cliente e ignorado.
    NEW.ano_mes := pg_catalog.to_char(NEW.data_competencia, 'YYYY-MM');
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF NEW.data_competencia IS DISTINCT FROM OLD.data_competencia THEN
    -- Mudanca efetiva da competencia: deriva do novo valor.
    NEW.ano_mes := pg_catalog.to_char(NEW.data_competencia, 'YYYY-MM');
  ELSE
    -- Competencia inalterada: restaura o valor anterior, descartando qualquer
    -- tentativa de alterar ano_mes diretamente. Preserva literalmente
    -- divergencias e NULLs historicos.
    NEW.ano_mes := OLD.ano_mes;
  END IF;

  RETURN NEW;
END
$corpo$;

  -- Hash literal congelado do corpo. Redundante em relacao a igualdade de
  -- texto, mantido para o relatorio apresentar esperado x obtido.
  c_corpo_md5 constant text := '74488066033372765adf6f7b1818ad2b';

  c_owner    constant name := 'postgres';
  c_config   constant text := 'search_path=public, pg_temp';
  c_comment  constant text :=
    'PR-FIN-DATAS-VENCIMENTO-02E. Deriva ano_mes de data_competencia no INSERT e '
    'quando a competencia muda; restaura OLD.ano_mes caso contrario. '
    'Competencia NULL resulta em ano_mes NULL (falha visivel sem recusa).';
  c_trgdef   constant text :=
    'CREATE TRIGGER trg_00_ano_mes_from_competencia BEFORE INSERT OR UPDATE OF ano_mes, data_competencia ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION fn_ano_mes_from_competencia()';

  v_reg          oid;
  v_n            int;
  v_menor_before name;
  v_fn           pg_proc%ROWTYPE;
  v_fn_oid       oid;
  v_tg_existe    boolean;
  v_acl_txt      text;
  v_com          text;
  v_div          text := '';
BEGIN
  -- =========================================================================
  -- PRE-CHECKS DE AMBIENTE
  -- =========================================================================
  SELECT c.oid INTO v_reg FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'financeiro_lancamentos_v2' AND c.relkind = 'r';
  IF v_reg IS NULL THEN
    RAISE EXCEPTION '02E P1: tabela public.financeiro_lancamentos_v2 nao encontrada';
  END IF;

  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = v_reg AND NOT a.attisdropped
     AND ((a.attname='ano_mes'          AND format_type(a.atttypid,a.atttypmod)='text')
       OR (a.attname='data_competencia' AND format_type(a.atttypid,a.atttypmod)='date')
       OR (a.attname='data_vencimento'  AND format_type(a.atttypid,a.atttypmod)='date')
       OR (a.attname='data_pagamento'   AND format_type(a.atttypid,a.atttypmod)='date'));
  IF v_n <> 4 THEN RAISE EXCEPTION '02E P2: esperadas 4 colunas com tipos exatos, encontrei %', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=v_reg AND a.attname='ano_mes'
     AND a.attnotnull=false AND d.adbin IS NULL AND a.attgenerated='';
  IF v_n <> 1 THEN RAISE EXCEPTION '02E P3: ano_mes deve ser nullable, sem default e nao-gerada'; END IF;

  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE ano_mes IS NOT NULL AND ano_mes !~ '^[0-9]{4}-[0-9]{2}$';
  IF v_n <> 0 THEN RAISE EXCEPTION '02E P4: % linha(s) com ano_mes fora do padrao YYYY-MM', v_n; END IF;

  -- P5. Congelamento do trigger de duplicidade — comparacao CANONICA, nao textual.
  --     Le a lista UPDATE OF de pg_trigger.tgattr (a fonte real; tgtype nao a
  --     codifica) e confere tipo/estado/funcao/WHEN. Nao depende de como o
  --     servidor renderiza pg_get_triggerdef, portanto nao produz falso
  --     vermelho por diferenca de formatacao entre ambientes.
  SELECT count(*) INTO v_n FROM pg_trigger t JOIN pg_proc pf ON pf.oid = t.tgfoid
   WHERE t.tgrelid=v_reg AND NOT t.tgisinternal
     AND t.tgname='trg_financeiro_lancamento_v2_unique_hash'
     AND t.tgtype::int = 23            -- ROW(1) + BEFORE(2) + INSERT(4) + UPDATE(16), sem DELETE(8)
     AND t.tgenabled = 'O'
     AND t.tgqual IS NULL              -- sem clausula WHEN
     AND pf.proname = 'enforce_financeiro_lancamento_v2_unique_hash'::name
     AND (SELECT string_agg(a.attname::text, ',' ORDER BY x.ord)
            FROM unnest(string_to_array(t.tgattr::text,' ')::int2[]) WITH ORDINALITY AS x(att,ord)
            JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=x.att)
         = 'cliente_id,fazenda_id,data_pagamento,valor,tipo_operacao,conta_bancaria_id,cancelado,lote_importacao_id';
  IF v_n <> 1 THEN RAISE EXCEPTION '02E P5: trigger de duplicidade ausente ou divergente (tipo, estado, funcao, WHEN ou lista UPDATE OF)'; END IF;

  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid=v_reg AND NOT t.tgisinternal
     AND t.tgname='trg_financeiro_lancamento_v2_editado_manual' AND t.tgattr=''::int2vector;
  IF v_n <> 1 THEN RAISE EXCEPTION '02E P6: trg_..._editado_manual ausente ou passou a ter lista UPDATE OF'; END IF;

  -- P7. GATE DE ORDEM — tipo `name`, sem cast para text, uniao dos BEFORE.
  --     Exclui o proprio 02E para nao comparar o nome consigo mesmo na reaplicacao.
  SELECT min(t.tgname) INTO v_menor_before FROM pg_trigger t
   WHERE t.tgrelid=v_reg AND NOT t.tgisinternal
     AND t.tgname <> 'trg_00_ano_mes_from_competencia'::name
     AND (t.tgtype::int & 2) > 0
     AND ((t.tgtype::int & 4) > 0 OR (t.tgtype::int & 16) > 0);
  IF v_menor_before IS NOT NULL
     AND NOT ('trg_00_ano_mes_from_competencia'::name < v_menor_before) THEN
    RAISE EXCEPTION '02E P7: ordem impossivel — trg_00_ano_mes_from_competencia nao ordena antes de % (tipo name)', v_menor_before;
  END IF;

  -- =========================================================================
  -- P8. FUNCAO — equivalencia INTEGRAL. Tres estados, sem CREATE OR REPLACE.
  -- =========================================================================
  SELECT p.* INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_ano_mes_from_competencia'
     AND p.pronargs = 0;

  IF FOUND THEN
    -- --- Estado 2 ou 3: existe. Comparar TUDO antes de decidir. ---
    v_fn_oid := v_fn.oid;
    IF v_fn.prosrc IS DISTINCT FROM c_corpo THEN
      v_div := v_div || format(' corpo(prosrc md5 obtido=%s esperado=%s);',
                               md5(coalesce(v_fn.prosrc,'')), c_corpo_md5);
    END IF;
    IF v_fn.prorettype <> 'pg_catalog.trigger'::regtype THEN v_div := v_div || ' retorno;'; END IF;
    IF v_fn.prolang <> (SELECT oid FROM pg_language WHERE lanname='plpgsql') THEN v_div := v_div || ' linguagem;'; END IF;
    IF v_fn.prosecdef IS DISTINCT FROM false THEN v_div := v_div || ' SECURITY DEFINER;'; END IF;
    IF v_fn.provolatile IS DISTINCT FROM 'v'::"char" THEN v_div := v_div || ' volatilidade;'; END IF;
    IF v_fn.proisstrict IS DISTINCT FROM false THEN v_div := v_div || ' strict;'; END IF;
    IF v_fn.proleakproof IS DISTINCT FROM false THEN v_div := v_div || ' leakproof;'; END IF;
    IF v_fn.proparallel IS DISTINCT FROM 'u'::"char" THEN v_div := v_div || ' parallel;'; END IF;
    IF pg_get_userbyid(v_fn.proowner) IS DISTINCT FROM c_owner THEN
      v_div := v_div || format(' owner(obtido=%s);', pg_get_userbyid(v_fn.proowner));
    END IF;
    IF array_to_string(v_fn.proconfig,',') IS DISTINCT FROM c_config THEN
      v_div := v_div || format(' proconfig(obtido=%s);', coalesce(array_to_string(v_fn.proconfig,','),'(nulo)'));
    END IF;

    -- ACL integral por aclexplode. Esperado: EXCLUSIVAMENTE
    -- (postgres, EXECUTE, grantor postgres, sem grant option).
    SELECT coalesce(string_agg(
             coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') || ':' ||
             a.privilege_type || ':' || pg_get_userbyid(a.grantor) || ':' || a.is_grantable,
             ',' ORDER BY 1), '(vazia)')
      INTO v_acl_txt
      FROM aclexplode(coalesce(v_fn.proacl, acldefault('f', v_fn.proowner))) a;
    IF v_acl_txt IS DISTINCT FROM 'postgres:EXECUTE:postgres:false' THEN
      v_div := v_div || format(' ACL(obtida=%s);', v_acl_txt);
    END IF;

    SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_com;
    IF v_com IS DISTINCT FROM c_comment THEN v_div := v_div || ' comentario;'; END IF;

    IF v_div <> '' THEN
      RAISE EXCEPTION '02E P8: funcao fn_ano_mes_from_competencia EXISTE e DIVERGE em:%  — abortando SEM alterar nada', v_div;
    END IF;

    RAISE NOTICE '02E P8: funcao ja existe e e INTEGRALMENTE identica (corpo, atributos, owner, proconfig, ACL, comentario) — NO-OP VERDADEIRO, nenhum comando emitido';
  ELSE
    -- --- Estado 1: ausente. Criar a partir do MESMO literal comparado. ---
    EXECUTE format(
      'CREATE FUNCTION public.fn_ano_mes_from_competencia() RETURNS trigger '
      'LANGUAGE plpgsql SECURITY INVOKER SET search_path TO %L, %L AS %L',
      'public', 'pg_temp', c_corpo);

    EXECUTE format('ALTER FUNCTION public.fn_ano_mes_from_competencia() OWNER TO %I', c_owner);

    -- ACL final exata: revoga PUBLIC e tambem service_role, que recebe EXECUTE
    -- por ALTER DEFAULT PRIVILEGES do schema. Execucao de funcao de trigger
    -- nao exige EXECUTE do usuario do DML — a checagem ocorre no CREATE TRIGGER.
    REVOKE ALL ON FUNCTION public.fn_ano_mes_from_competencia() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.fn_ano_mes_from_competencia() FROM anon;
    REVOKE ALL ON FUNCTION public.fn_ano_mes_from_competencia() FROM authenticated;
    REVOKE ALL ON FUNCTION public.fn_ano_mes_from_competencia() FROM service_role;

    EXECUTE format('COMMENT ON FUNCTION public.fn_ano_mes_from_competencia() IS %L', c_comment);

    RAISE NOTICE '02E: funcao CRIADA (ausente), owner=%, PUBLIC/anon/authenticated/service_role revogados, comentario aplicado', c_owner;
  END IF;

  -- =========================================================================
  -- TRIGGER — criado somente se ausente; divergente aborta; sem DROP cego.
  -- =========================================================================
  SELECT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid=v_reg AND NOT t.tgisinternal
                    AND t.tgname='trg_00_ano_mes_from_competencia') INTO v_tg_existe;

  IF v_tg_existe THEN
    SELECT count(*) INTO v_n FROM pg_trigger t
     WHERE t.tgrelid=v_reg AND NOT t.tgisinternal
       AND t.tgname='trg_00_ano_mes_from_competencia'
       AND t.tgenabled='O'
       AND pg_get_triggerdef(t.oid) = c_trgdef;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '02E: trigger trg_00_ano_mes_from_competencia EXISTE com definicao DIVERGENTE — abortando sem alterar';
    END IF;
    RAISE NOTICE '02E: trigger ja existe e e identico — NO-OP VERDADEIRO, nenhum comando emitido';
  ELSE
    CREATE TRIGGER trg_00_ano_mes_from_competencia
      BEFORE INSERT OR UPDATE OF ano_mes, data_competencia
      ON public.financeiro_lancamentos_v2
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_ano_mes_from_competencia();
    RAISE NOTICE '02E: trigger CRIADO';
  END IF;

  RAISE NOTICE '02E pre-checks OK: 4 colunas, ano_mes nullable/sem default, formato YYYY-MM integro, duplicidade congelada, editado_manual sem lista, ordem antes de %', v_menor_before;
END
$mig$;

-- ============================================================================
-- POS-CHECKS FATAIS
-- ============================================================================
DO $pos$
DECLARE
  v_reg     oid := 'public.financeiro_lancamentos_v2'::regclass;
  v_n       int;
  v_menor   name;
  v_acl_txt text;
  v_oid     oid;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_ano_mes_from_competencia' AND p.pronargs=0;
  IF v_oid IS NULL THEN RAISE EXCEPTION '02E Q1: funcao ausente apos a migration'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.oid=v_oid
     AND p.prosecdef=false
     AND p.prorettype='pg_catalog.trigger'::regtype
     AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
     AND p.provolatile='v'::"char" AND p.proisstrict=false
     AND p.proleakproof=false AND p.proparallel='u'::"char"
     AND pg_get_userbyid(p.proowner)='postgres'::name
     AND array_to_string(p.proconfig,',')='search_path=public, pg_temp';
  IF v_n <> 1 THEN RAISE EXCEPTION '02E Q1: funcao com atributos divergentes'; END IF;

  -- Q2. ACL INTEGRAL nominal — nada alem de postgres:EXECUTE.
  SELECT coalesce(string_agg(
           coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') || ':' ||
           a.privilege_type || ':' || pg_get_userbyid(a.grantor) || ':' || a.is_grantable,
           ',' ORDER BY 1), '(vazia)')
    INTO v_acl_txt
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
   WHERE p.oid = v_oid;
  IF v_acl_txt <> 'postgres:EXECUTE:postgres:false' THEN
    RAISE EXCEPTION '02E Q2: ACL divergente — obtida [%], esperada [postgres:EXECUTE:postgres:false]', v_acl_txt;
  END IF;

  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE t.tgrelid=v_reg AND NOT t.tgisinternal
     AND t.tgname='trg_00_ano_mes_from_competencia' AND t.tgenabled='O'
     AND pg_get_triggerdef(t.oid) = 'CREATE TRIGGER trg_00_ano_mes_from_competencia BEFORE INSERT OR UPDATE OF ano_mes, data_competencia ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION fn_ano_mes_from_competencia()';
  IF v_n <> 1 THEN RAISE EXCEPTION '02E Q3: trigger ausente ou com definicao divergente'; END IF;

  SELECT min(t.tgname) INTO v_menor FROM pg_trigger t
   WHERE t.tgrelid=v_reg AND NOT t.tgisinternal
     AND (t.tgtype::int & 2)>0 AND ((t.tgtype::int & 4)>0 OR (t.tgtype::int & 16)>0);
  IF v_menor <> 'trg_00_ano_mes_from_competencia'::name THEN
    RAISE EXCEPTION '02E Q4: ordem incorreta — primeiro BEFORE e %', v_menor;
  END IF;

  -- Q5. Mesma comparacao canonica de P5, agora como pos-check.
  SELECT count(*) INTO v_n FROM pg_trigger t JOIN pg_proc pf ON pf.oid = t.tgfoid
   WHERE t.tgrelid=v_reg AND NOT t.tgisinternal
     AND t.tgname='trg_financeiro_lancamento_v2_unique_hash'
     AND t.tgtype::int = 23 AND t.tgenabled = 'O' AND t.tgqual IS NULL
     AND pf.proname = 'enforce_financeiro_lancamento_v2_unique_hash'::name
     AND (SELECT string_agg(a.attname::text, ',' ORDER BY x.ord)
            FROM unnest(string_to_array(t.tgattr::text,' ')::int2[]) WITH ORDINALITY AS x(att,ord)
            JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=x.att)
         = 'cliente_id,fazenda_id,data_pagamento,valor,tipo_operacao,conta_bancaria_id,cancelado,lote_importacao_id';
  IF v_n <> 1 THEN RAISE EXCEPTION '02E Q5: trigger de duplicidade foi alterado'; END IF;

  RAISE NOTICE '02E pos-checks OK: funcao INVOKER/plpgsql/volatile/owner=postgres/search_path fixado, ACL integral = [%], trigger com lista exata, PRIMEIRO entre os BEFORE, duplicidade intocada', v_acl_txt;
END
$pos$;
