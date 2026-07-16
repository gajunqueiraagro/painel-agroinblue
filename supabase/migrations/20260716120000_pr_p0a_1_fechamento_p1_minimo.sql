-- PR-P1-GOV-REABERTURA-P0A — Migration 1: cabecalho minimo fechamento_p1
-- Cria a tabela de cabecalho P1 (contrato minimo desta rodada). Colunas
--   snapshot_id / oficializado_* entram no P0-B (ALTER aditivo, fora do escopo).
-- RLS multi-tenant espelhando fechamento_pastos: acesso por cliente do usuario
--   (get_user_cliente_ids, SETOF uuid com alias explicito) ou admin global.
--
-- DEFENSIVO CONTRA DRIFT (drift nao-versionado conhecido): CREATE TABLE IF NOT EXISTS
--   sozinho silenciaria uma tabela pre-existente incompativel. Portanto:
--     - ausente  -> cria com o contrato completo;
--     - presente -> VALIDA colunas/tipos/UNIQUE/CHECK e ABORTA com excecao clara se
--                   incompativel; NUNCA reconstroi nem apaga silenciosamente.
--   RLS/policy so sao aplicados apos a validacao passar.

DO $drift$
DECLARE
  v_exists boolean;
  v_type text;
  v_uk_ok boolean;
  v_check_vals text[];
  -- contrato esperado: coluna -> data_type (information_schema)
  v_expected constant text[][] := ARRAY[
    ['id','uuid'],
    ['fazenda_id','uuid'],
    ['cliente_id','uuid'],
    ['ano_mes','text'],
    ['status','text'],
    ['origem_legado','boolean'],
    ['versao','integer'],
    ['reaberto_em','timestamp with time zone'],
    ['reaberto_por','uuid']
  ];
  v_col text;
  v_exp_type text;
  i int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='fechamento_p1'
  ) INTO v_exists;

  IF NOT v_exists THEN
    -- Caminho de criacao: contrato completo.
    CREATE TABLE public.fechamento_p1 (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      fazenda_id uuid NOT NULL,
      cliente_id uuid NOT NULL,
      ano_mes text NOT NULL,
      status text NOT NULL DEFAULT 'aberto'
        CHECK (status IN ('aberto','reaberto','oficializando','oficial')),
      origem_legado boolean NOT NULL DEFAULT false,
      versao integer NOT NULL DEFAULT 1,
      reaberto_em timestamptz,
      reaberto_por uuid,
      UNIQUE (fazenda_id, ano_mes)
    );
    COMMENT ON TABLE public.fechamento_p1 IS 'Cabecalho minimo P0-A do fechamento P1. Colunas snapshot_id/oficializado_* entram no P0-B.';

  ELSE
    -- Caminho de validacao: tabela pre-existente. Conferir contrato critico.
    FOR i IN 1 .. array_length(v_expected, 1) LOOP
      v_col := v_expected[i][1];
      v_exp_type := v_expected[i][2];
      SELECT data_type INTO v_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='fechamento_p1' AND column_name=v_col;

      IF v_type IS NULL THEN
        RAISE EXCEPTION 'DRIFT fechamento_p1: coluna ausente "%" (esperado tipo %)', v_col, v_exp_type
          USING ERRCODE = '42704';
      ELSIF v_type <> v_exp_type THEN
        RAISE EXCEPTION 'DRIFT fechamento_p1: coluna "%" tem tipo "%" (esperado "%")', v_col, v_type, v_exp_type
          USING ERRCODE = '42804';
      END IF;
    END LOOP;

    -- UNIQUE (fazenda_id, ano_mes): existe constraint unica exatamente sobre esse par?
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class c ON c.oid=con.conrelid AND c.relname='fechamento_p1'
      JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
      WHERE con.contype IN ('u','p')
        AND (
          SELECT array_agg(att.attname ORDER BY att.attname)
          FROM unnest(con.conkey) k
          JOIN pg_attribute att ON att.attrelid=con.conrelid AND att.attnum=k
        ) = ARRAY['ano_mes','fazenda_id']
    ) INTO v_uk_ok;
    IF NOT v_uk_ok THEN
      RAISE EXCEPTION 'DRIFT fechamento_p1: falta UNIQUE (fazenda_id, ano_mes)'
        USING ERRCODE = '42704';
    END IF;

    -- CHECK dos status: extrair os literais entre aspas do(s) check que menciona
    -- "status" e exigir o CONJUNTO EXATO {aberto, oficial, oficializando, reaberto}.
    -- Nao basta 4 LIKE independentes (aceitariam estados adicionais no IN).
    SELECT array_agg(DISTINCT m.arr[1] ORDER BY m.arr[1])
      INTO v_check_vals
    FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid AND c.relname='fechamento_p1'
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
    CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(con.oid), '''([^'']+)''', 'g') AS m(arr)
    WHERE con.contype='c' AND pg_get_constraintdef(con.oid) ILIKE '%status%';

    IF v_check_vals IS DISTINCT FROM ARRAY['aberto','oficial','oficializando','reaberto'] THEN
      RAISE EXCEPTION 'DRIFT fechamento_p1: CHECK de status incompativel (encontrado %, esperado {aberto,oficial,oficializando,reaberto})', coalesce(v_check_vals::text, 'NULL')
        USING ERRCODE = '42704';
    END IF;

    RAISE NOTICE 'fechamento_p1 ja existe e e compativel com o contrato P0-A; nenhuma recriacao.';
  END IF;
END $drift$;

-- RLS + policy: idempotentes; aplicados apos a validacao de contrato passar.
ALTER TABLE public.fechamento_p1 ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fechamento_p1' AND policyname='fechamento_p1_tenant') THEN
    CREATE POLICY fechamento_p1_tenant ON public.fechamento_p1
      FOR ALL
      USING (
        public.is_admin_agroinblue(auth.uid())
        OR cliente_id IN (SELECT t.cliente_id FROM public.get_user_cliente_ids(auth.uid()) AS t(cliente_id))
      )
      WITH CHECK (
        public.is_admin_agroinblue(auth.uid())
        OR cliente_id IN (SELECT t.cliente_id FROM public.get_user_cliente_ids(auth.uid()) AS t(cliente_id))
      );
  END IF;
END $$;
