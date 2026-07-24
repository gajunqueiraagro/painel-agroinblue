-- PR-INT-COM-01A — Integridade referencial por tenant do vinculo FINV2 -> contraparte.
-- Torna imposta pelo banco a relacao financeiro_lancamentos_v2.favorecido_id ->
--   financeiro_fornecedores, ancorada em cliente_id (FK COMPOSTA), porque a RLS vigente e
--   aberta (policies true/true, forced=false) e NAO isola tenant. Cobre 69.277 linhas com
--   favorecido preenchido. A FK composta e a defesa estrutural de tenant; a RLS e outra frente.
--
-- Escopo estrito (DB-only): NAO inclui a FK de movimentacao_rebanho_id nem UNIQUE(id,cliente_id)
--   em lancamentos (ambas sao do PR-INT-COM-01B, bloqueado pela colisao com o hard-delete de
--   cliente). Sem frontend, backfill, deduplicacao, alteracao de RLS, cliente_id NOT NULL ou
--   remocao de tabela legada.
--
-- Pericia de dados (2026-07-18, Proto): favorecido_id 69.277 preenchidos -> 0 orfaos,
--   0 cross-tenant, 0 com cliente_id nulo. Os gates abaixo REPROVAM a aplicacao se isso mudou.
--
-- Locks: ADD CONSTRAINT UNIQUE (financeiro_fornecedores ~6.636 linhas) = ACCESS EXCLUSIVE breve.
--   CREATE INDEX parcial (~69k linhas nao-nulas em FINV2) = SHARE (bloqueia escrita durante o
--   build, curto). VALIDATE CONSTRAINT = SHARE UPDATE EXCLUSIVE (permite leitura/escrita).
--   lock_timeout/statement_timeout evitam prender a operacao se o lock nao vier rapido.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  v_orfao       integer;
  v_cross       integer;
  v_sem_cliente integer;
BEGIN
  -- Gate 1: nomes de constraint/indice pretendidos ainda livres.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_financeiro_fornecedores_id_cliente') THEN
    RAISE EXCEPTION USING ERRCODE = '42710',
      MESSAGE = 'int01a_gate: constraint uq_financeiro_fornecedores_id_cliente ja existe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_flv2_favorecido_tenant') THEN
    RAISE EXCEPTION USING ERRCODE = '42710',
      MESSAGE = 'int01a_gate: constraint fk_flv2_favorecido_tenant ja existe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class
              WHERE relkind = 'i' AND relname = 'idx_flv2_favorecido_cliente'
                AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION USING ERRCODE = '42P07',
      MESSAGE = 'int01a_gate: indice idx_flv2_favorecido_cliente ja existe';
  END IF;

  -- Gate 2: zero orfaos (favorecido_id preenchido sem contraparte correspondente).
  SELECT count(*) INTO v_orfao
    FROM public.financeiro_lancamentos_v2 f
    LEFT JOIN public.financeiro_fornecedores ff ON ff.id = f.favorecido_id
   WHERE f.favorecido_id IS NOT NULL AND ff.id IS NULL;
  IF v_orfao <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = format('int01a_gate: %s titulos com favorecido_id orfao; corrigir antes', v_orfao);
  END IF;

  -- Gate 3: zero cross-tenant (favorecido existe, porem em outro cliente).
  SELECT count(*) INTO v_cross
    FROM public.financeiro_lancamentos_v2 f
    JOIN public.financeiro_fornecedores ff ON ff.id = f.favorecido_id
   WHERE f.favorecido_id IS NOT NULL AND ff.cliente_id IS DISTINCT FROM f.cliente_id;
  IF v_cross <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23503',
      MESSAGE = format('int01a_gate: %s titulos cross-tenant favorecido/cliente; corrigir antes', v_cross);
  END IF;

  -- Gate 4: zero linhas com favorecido preenchido e cliente_id nulo (escapariam do MATCH SIMPLE).
  SELECT count(*) INTO v_sem_cliente
    FROM public.financeiro_lancamentos_v2
   WHERE favorecido_id IS NOT NULL AND cliente_id IS NULL;
  IF v_sem_cliente <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23502',
      MESSAGE = format('int01a_gate: %s titulos com favorecido e cliente_id nulo; a FK nao os cobriria', v_sem_cliente);
  END IF;
END $$;

-- Chave-alvo composta (id ja e PK; esta UNIQUE habilita referenciar (id, cliente_id) na FK).
ALTER TABLE public.financeiro_fornecedores
  ADD CONSTRAINT uq_financeiro_fornecedores_id_cliente UNIQUE (id, cliente_id);

-- Lado filho: indice parcial que sustenta a FK e o ON DELETE RESTRICT do lado da contraparte
--   (favorecido_id estava sem indice; sem isto o RESTRICT varreria FINV2 inteira).
CREATE INDEX idx_flv2_favorecido_cliente
  ON public.financeiro_lancamentos_v2 (favorecido_id, cliente_id)
  WHERE favorecido_id IS NOT NULL;

-- FK composta por tenant. Criada NOT VALID e validada em seguida para minimizar o lock.
ALTER TABLE public.financeiro_lancamentos_v2
  ADD CONSTRAINT fk_flv2_favorecido_tenant
  FOREIGN KEY (favorecido_id, cliente_id)
  REFERENCES public.financeiro_fornecedores (id, cliente_id)
  MATCH SIMPLE
  ON UPDATE NO ACTION
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.financeiro_lancamentos_v2
  VALIDATE CONSTRAINT fk_flv2_favorecido_tenant;

COMMENT ON CONSTRAINT fk_flv2_favorecido_tenant ON public.financeiro_lancamentos_v2 IS
  'PR-INT-COM-01A: vinculo FINV2->contraparte imposto por tenant (favorecido_id, cliente_id). Defesa estrutural de tenant, independente da RLS (aberta). MATCH SIMPLE: linhas com favorecido_id nulo nao sao verificadas; favorecido preenchido exige contraparte do mesmo cliente. ON DELETE RESTRICT espelha lancamentos.fornecedor_id.';

COMMENT ON CONSTRAINT uq_financeiro_fornecedores_id_cliente ON public.financeiro_fornecedores IS
  'PR-INT-COM-01A: chave-alvo composta (id, cliente_id) para a FK por tenant de financeiro_lancamentos_v2.favorecido_id.';
