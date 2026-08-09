-- =====================================================================
-- PR-FIN-DATAS-VENCIMENTO-02B — SUITE DE TESTES
--
-- Fixtures EXCLUSIVAMENTE sinteticas, em transacao unica encerrada em
-- ROLLBACK. Nenhum dado real e lido, escrito ou derivado.
-- Executar SOMENTE em stack local efemera.
-- =====================================================================
\set ON_ERROR_STOP on
\timing off

BEGIN;

DO $$
BEGIN
  IF pg_catalog.inet_server_port() NOT IN (5432, 54322) THEN
    RAISE EXCEPTION 'SUITE: porta inesperada (%)', pg_catalog.inet_server_port();
  END IF;
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'SUITE: banco inesperado (%)', current_database();
  END IF;
END $$;

CREATE TEMP TABLE _res(n serial, caso text, ok boolean, detalhe text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.chk(p_caso text, p_ok boolean, p_det text DEFAULT '') RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO _res(caso, ok, detalhe) VALUES (p_caso, p_ok, p_det) $$;

-- ---------------------------------------------------------------------
-- FIXTURES SINTETICAS
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _ids(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO _ids(k, v) VALUES
  ('cli',  '00000000-0000-4000-8000-00000000c001'),
  ('faz',  '00000000-0000-4000-8000-00000000f001'),
  ('usr',  '00000000-0000-4000-8000-00000000a001'),
  ('conta','00000000-0000-4000-8000-00000000b001'),
  ('fin',  '00000000-0000-4000-8000-000000001001'),
  ('p1',   '00000000-0000-4000-8000-000000002001'),  -- futura, pendente
  ('p2',   '00000000-0000-4000-8000-000000002002'),  -- futura, vencimento diferente
  ('p3',   '00000000-0000-4000-8000-000000002003'),  -- paga
  ('pleg', '00000000-0000-4000-8000-000000002004'),  -- legada programada (formato antigo)
  ('preal','00000000-0000-4000-8000-000000002005'),  -- legada realizada com pagamento real
  ('pcanc','00000000-0000-4000-8000-000000002006'),  -- cancelada
  ('lleg', '00000000-0000-4000-8000-000000003001'),  -- lancamento legado da pleg
  ('lreal','00000000-0000-4000-8000-000000003002'),  -- lancamento legado da preal
  ('ltot', '00000000-0000-4000-8000-000000003003');  -- totalizador legado cancelado

-- planos de conta com os ids que a RPC referencia (constantes do dominio)
INSERT INTO public.financeiro_plano_contas (id, cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro)
VALUES ('0d42d354-926a-4a10-ab3a-f082adaef972', (SELECT v FROM _ids WHERE k='cli'), '2-Saidas','SINT','SINT','SINT','Amortizacao sintetica'),
       ('5d4a5c70-311d-4302-98f0-b2846d9738fc', (SELECT v FROM _ids WHERE k='cli'), '2-Saidas','SINT','SINT','SINT','Juros sinteticos')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users(id) SELECT v FROM _ids WHERE k='usr';
INSERT INTO public.clientes(id, nome) SELECT v,'SINT-02B' FROM _ids WHERE k='cli';
INSERT INTO public.fazendas(id, cliente_id, nome, owner_id)
  SELECT (SELECT v FROM _ids WHERE k='faz'), (SELECT v FROM _ids WHERE k='cli'), 'FAZ-SINT-02B',
         (SELECT v FROM _ids WHERE k='usr');
INSERT INTO public.financeiro_contas_bancarias(id, cliente_id, nome_conta)
  SELECT (SELECT v FROM _ids WHERE k='conta'), (SELECT v FROM _ids WHERE k='cli'), 'CONTA-SINT';

-- captacao em 2031-01-10; parcelas vencendo em meses diferentes
INSERT INTO public.financiamentos(id, cliente_id, fazenda_id, tipo_financiamento, descricao,
                                  numero_contrato, valor_total, data_contrato, conta_bancaria_id, status)
SELECT (SELECT v FROM _ids WHERE k='fin'), (SELECT v FROM _ids WHERE k='cli'),
       (SELECT v FROM _ids WHERE k='faz'), 'pecuaria', 'FIN SINTETICO', 'SINT-001',
       1000, DATE '2031-01-10', (SELECT v FROM _ids WHERE k='conta'), 'ativo';

INSERT INTO public.financiamento_parcelas(id, financiamento_id, cliente_id, numero_parcela,
       data_vencimento, valor_principal, valor_juros, valor_total, status, data_pagamento)
VALUES
  ((SELECT v FROM _ids WHERE k='p1'),   (SELECT v FROM _ids WHERE k='fin'), (SELECT v FROM _ids WHERE k='cli'), 1, DATE '2031-06-10', 100, 10, 110, 'pendente', NULL),
  ((SELECT v FROM _ids WHERE k='p2'),   (SELECT v FROM _ids WHERE k='fin'), (SELECT v FROM _ids WHERE k='cli'), 2, DATE '2031-09-10', 100, 10, 110, 'pendente', NULL),
  ((SELECT v FROM _ids WHERE k='p3'),   (SELECT v FROM _ids WHERE k='fin'), (SELECT v FROM _ids WHERE k='cli'), 3, DATE '2031-07-10', 100, 10, 110, 'pago',     DATE '2031-07-08'),
  ((SELECT v FROM _ids WHERE k='pleg'), (SELECT v FROM _ids WHERE k='fin'), (SELECT v FROM _ids WHERE k='cli'), 4, DATE '2031-11-10', 100,  0, 100, 'pendente', NULL),
  ((SELECT v FROM _ids WHERE k='preal'),(SELECT v FROM _ids WHERE k='fin'), (SELECT v FROM _ids WHERE k='cli'), 5, DATE '2031-05-10', 100,  0, 100, 'pago',     DATE '2031-05-09'),
  ((SELECT v FROM _ids WHERE k='pcanc'),(SELECT v FROM _ids WHERE k='fin'), (SELECT v FROM _ids WHERE k='cli'), 6, DATE '2031-12-10', 100,  0, 100, 'cancelado',NULL);

-- Lancamentos LEGADOS, no formato defeituoso: vencimento gravado em data_pagamento,
-- data_vencimento nula, ano_mes derivado do pagamento.
INSERT INTO public.financeiro_lancamentos_v2
  (id, cliente_id, fazenda_id, valor, descricao, data_pagamento, data_competencia, data_vencimento,
   status_transacao, tipo_operacao, financiamento_id, origem_lancamento, origem_tipo, observacao,
   plano_conta_id, conta_bancaria_id, cancelado)
VALUES
  ((SELECT v FROM _ids WHERE k='lleg'), (SELECT v FROM _ids WHERE k='cli'), (SELECT v FROM _ids WHERE k='faz'),
   100, 'Amortizacao SINT legada', DATE '2031-11-10', DATE '2031-01-10', NULL,
   'programado', '2-Saidas', (SELECT v FROM _ids WHERE k='fin'), 'parcela_financiamento', 'parcela_principal',
   'parcela:' || (SELECT v FROM _ids WHERE k='pleg')::text || ':parcela_principal',
   '0d42d354-926a-4a10-ab3a-f082adaef972', (SELECT v FROM _ids WHERE k='conta'), false),
  ((SELECT v FROM _ids WHERE k='lreal'), (SELECT v FROM _ids WHERE k='cli'), (SELECT v FROM _ids WHERE k='faz'),
   100, 'Amortizacao SINT realizada', DATE '2031-05-09', DATE '2031-01-10', NULL,
   'realizado', '2-Saidas', (SELECT v FROM _ids WHERE k='fin'), 'parcela_financiamento', 'parcela_principal',
   'parcela:' || (SELECT v FROM _ids WHERE k='preal')::text || ':parcela_principal',
   '0d42d354-926a-4a10-ab3a-f082adaef972', (SELECT v FROM _ids WHERE k='conta'), false),
  -- totalizador legado, CANCELADO: alvo do bloco de limpeza, que deve permanecer inerte
  ((SELECT v FROM _ids WHERE k='ltot'), (SELECT v FROM _ids WHERE k='cli'), (SELECT v FROM _ids WHERE k='faz'),
   100, 'Totalizador legado', DATE '2031-11-10', DATE '2031-01-10', NULL,
   'programado', '2-Saidas', (SELECT v FROM _ids WHERE k='fin'), 'financiamento', 'financiamento_parcela',
   NULL, '0d42d354-926a-4a10-ab3a-f082adaef972', (SELECT v FROM _ids WHERE k='conta'), true);

-- vinculo estrutural das legadas
UPDATE public.financiamento_parcelas SET lancamento_id = (SELECT v FROM _ids WHERE k='lleg')
 WHERE id = (SELECT v FROM _ids WHERE k='pleg');
-- preal fica SEM FK de proposito: exercita o fallback por marcador de observacao

-- =====================================================================
-- BLOCO 1 — PARCELA NOVA
-- =====================================================================
DO $$
DECLARE r record; v_n int; v_capt date := DATE '2031-01-10';
BEGIN
  PERFORM public.fn_reconciliar_parcela_financiamento((SELECT v FROM _ids WHERE k='p1'), false, false, NULL);

  SELECT l.* INTO r FROM public.financeiro_lancamentos_v2 l
   WHERE l.observacao = 'parcela:' || (SELECT v FROM _ids WHERE k='p1')::text || ':parcela_principal'
     AND l.cancelado = false;

  PERFORM pg_temp.chk('T5a competencia = data da captacao', r.data_competencia = v_capt, coalesce(r.data_competencia::text,'-'));
  PERFORM pg_temp.chk('T5b vencimento = vencimento da parcela', r.data_vencimento = DATE '2031-06-10', coalesce(r.data_vencimento::text,'-'));
  PERFORM pg_temp.chk('T5c data_pagamento NULL', r.data_pagamento IS NULL, coalesce(r.data_pagamento::text,'NULL'));
  PERFORM pg_temp.chk('T5d status programado', r.status_transacao = 'programado', coalesce(r.status_transacao,'-'));
  PERFORM pg_temp.chk('T5e ano_mes derivado da competencia pelo 02E',
    r.ano_mes = to_char(v_capt,'YYYY-MM'), coalesce(r.ano_mes,'NULL'));

  -- T6: segunda parcela, vencimento diferente, mesma competencia
  PERFORM public.fn_reconciliar_parcela_financiamento((SELECT v FROM _ids WHERE k='p2'), false, false, NULL);
  SELECT count(DISTINCT data_competencia) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE observacao IN ('parcela:' || (SELECT v FROM _ids WHERE k='p1')::text || ':parcela_principal',
                        'parcela:' || (SELECT v FROM _ids WHERE k='p2')::text || ':parcela_principal')
     AND cancelado = false;
  PERFORM pg_temp.chk('T6 duas parcelas, vencimentos distintos, competencia unica', v_n = 1, v_n::text);

  SELECT count(DISTINCT data_vencimento) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE observacao IN ('parcela:' || (SELECT v FROM _ids WHERE k='p1')::text || ':parcela_principal',
                        'parcela:' || (SELECT v FROM _ids WHERE k='p2')::text || ':parcela_principal')
     AND cancelado = false;
  PERFORM pg_temp.chk('T6b vencimentos permanecem distintos', v_n = 2, v_n::text);

  -- T7: parcela paga
  PERFORM public.fn_reconciliar_parcela_financiamento((SELECT v FROM _ids WHERE k='p3'), false, false, NULL);
  SELECT l.* INTO r FROM public.financeiro_lancamentos_v2 l
   WHERE l.observacao = 'parcela:' || (SELECT v FROM _ids WHERE k='p3')::text || ':parcela_principal'
     AND l.cancelado = false;
  PERFORM pg_temp.chk('T7a pagamento efetivo preenchido', r.data_pagamento = DATE '2031-07-08', coalesce(r.data_pagamento::text,'NULL'));
  PERFORM pg_temp.chk('T7b competencia inalterada na paga', r.data_competencia = v_capt, coalesce(r.data_competencia::text,'-'));
  PERFORM pg_temp.chk('T7c vencimento no campo proprio', r.data_vencimento = DATE '2031-07-10', coalesce(r.data_vencimento::text,'-'));
  PERFORM pg_temp.chk('T7d status realizado', r.status_transacao = 'realizado', coalesce(r.status_transacao,'-'));
  PERFORM pg_temp.chk('T7e ano_mes segue a competencia, nao o pagamento',
    r.ano_mes = to_char(v_capt,'YYYY-MM'), coalesce(r.ano_mes,'NULL'));
END $$;

-- =====================================================================
-- BLOCO 2 — CASAMENTO, RETRY E MULTIPLICIDADE
-- =====================================================================
DO $$
DECLARE v_n int; v_antes int; r record;
BEGIN
  -- T8 legada reconhecida por FK, sem duplicar
  SELECT count(*) INTO v_antes FROM public.financeiro_lancamentos_v2
   WHERE financiamento_id = (SELECT v FROM _ids WHERE k='fin')
     AND origem_tipo = 'parcela_principal' AND cancelado = false;
  PERFORM public.fn_reconciliar_parcela_financiamento((SELECT v FROM _ids WHERE k='pleg'), false, false, NULL);
  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE financiamento_id = (SELECT v FROM _ids WHERE k='fin')
     AND origem_tipo = 'parcela_principal' AND cancelado = false;
  PERFORM pg_temp.chk('T8 legada reconhecida por FK, sem criar linha nova', v_n = v_antes,
    format('antes=%s depois=%s', v_antes, v_n));

  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE id = (SELECT v FROM _ids WHERE k='lleg');
  PERFORM pg_temp.chk('T8b o lancamento legado continua sendo o mesmo id', v_n = 1, v_n::text);

  -- T8c fix-forward na legada programada
  SELECT * INTO r FROM public.financeiro_lancamentos_v2 WHERE id = (SELECT v FROM _ids WHERE k='lleg');
  PERFORM pg_temp.chk('T8c legada programada: vencimento preenchido', r.data_vencimento = DATE '2031-11-10', coalesce(r.data_vencimento::text,'NULL'));
  PERFORM pg_temp.chk('T8d legada programada: falso pagamento limpo', r.data_pagamento IS NULL, coalesce(r.data_pagamento::text,'NULL'));
  PERFORM pg_temp.chk('T8e legada programada: competencia preservada', r.data_competencia = DATE '2031-01-10', coalesce(r.data_competencia::text,'-'));

  -- T9 fallback por marcador de observacao (parcela sem FK)
  PERFORM public.fn_reconciliar_parcela_financiamento((SELECT v FROM _ids WHERE k='preal'), false, false, NULL);
  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE observacao LIKE 'parcela:' || (SELECT v FROM _ids WHERE k='preal')::text || ':parcela_principal%'
     AND cancelado = false;
  PERFORM pg_temp.chk('T9 fallback por marcador reconhece sem duplicar', v_n = 1, v_n::text);

  SELECT lancamento_id INTO r FROM public.financiamento_parcelas WHERE id = (SELECT v FROM _ids WHERE k='preal');
  PERFORM pg_temp.chk('T9b FK re-vinculada ao lancamento existente',
    (SELECT lancamento_id FROM public.financiamento_parcelas WHERE id = (SELECT v FROM _ids WHERE k='preal'))
      = (SELECT v FROM _ids WHERE k='lreal'), '');

  -- T9c realizada com pagamento real NAO pode ter pagamento limpo
  SELECT * INTO r FROM public.financeiro_lancamentos_v2 WHERE id = (SELECT v FROM _ids WHERE k='lreal');
  PERFORM pg_temp.chk('T9c realizada preserva o pagamento real', r.data_pagamento = DATE '2031-05-09', coalesce(r.data_pagamento::text,'NULL'));
  PERFORM pg_temp.chk('T9d realizada recebe o vencimento no campo proprio', r.data_vencimento = DATE '2031-05-10', coalesce(r.data_vencimento::text,'NULL'));

  -- T10 retry idempotente
  SELECT count(*) INTO v_antes FROM public.financeiro_lancamentos_v2
   WHERE financiamento_id = (SELECT v FROM _ids WHERE k='fin') AND cancelado = false;
  PERFORM public.fn_reconciliar_parcela_financiamento((SELECT v FROM _ids WHERE k='p1'), false, false, NULL);
  PERFORM public.fn_reconciliar_parcela_financiamento((SELECT v FROM _ids WHERE k='pleg'), false, false, NULL);
  PERFORM public.fn_reconciliar_parcela_financiamento((SELECT v FROM _ids WHERE k='preal'), false, false, NULL);
  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE financiamento_id = (SELECT v FROM _ids WHERE k='fin') AND cancelado = false;
  PERFORM pg_temp.chk('T10 retry nao cria segunda linha', v_n = v_antes, format('antes=%s depois=%s', v_antes, v_n));

  -- T11 parcelas distintas nao se misturam
  SELECT count(*) INTO v_n FROM (
    SELECT l.observacao, count(DISTINCT l.id) c
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.financiamento_id = (SELECT v FROM _ids WHERE k='fin')
       AND l.origem_lancamento = 'parcela_financiamento' AND l.cancelado = false
     GROUP BY 1 HAVING count(DISTINCT l.id) > 1) d;
  PERFORM pg_temp.chk('T11 nenhum marcador de parcela aponta para mais de um lancamento', v_n = 0, v_n::text);

  -- T12 multiplicidade maxima 1 por parcela e tipo
  SELECT coalesce(max(c),0) INTO v_n FROM (
    SELECT p.id, l.origem_tipo, count(*) c
      FROM public.financiamento_parcelas p
      JOIN public.financeiro_lancamentos_v2 l
        ON l.observacao = 'parcela:' || p.id::text || ':' || l.origem_tipo
     WHERE p.financiamento_id = (SELECT v FROM _ids WHERE k='fin') AND l.cancelado = false
     GROUP BY 1,2) d;
  PERFORM pg_temp.chk('T12 multiplicidade maxima por parcela/tipo = 1', v_n <= 1, v_n::text);
END $$;

-- =====================================================================
-- BLOCO 3 — PROTECOES
-- =====================================================================
DO $$
DECLARE v_j jsonb; r record; v_n int;
BEGIN
  -- T13 cancelada
  SELECT public.fn_reconciliar_parcela_financiamento((SELECT v FROM _ids WHERE k='pcanc'), false, false, NULL) INTO v_j;
  PERFORM pg_temp.chk('T13 parcela cancelada e ignorada', v_j ? 'skip', coalesce(v_j->>'skip','-'));
  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE observacao LIKE 'parcela:' || (SELECT v FROM _ids WHERE k='pcanc')::text || '%';
  PERFORM pg_temp.chk('T13b cancelada nao gerou lancamento', v_n = 0, v_n::text);

  -- T14 totalizador legado cancelado permanece intocado (bloco de limpeza inerte)
  SELECT * INTO r FROM public.financeiro_lancamentos_v2 WHERE id = (SELECT v FROM _ids WHERE k='ltot');
  PERFORM pg_temp.chk('T14 totalizador legado cancelado segue cancelado', r.cancelado, r.cancelado::text);
  PERFORM pg_temp.chk('T14b totalizador legado nao teve observacao reescrita', r.observacao IS NULL, coalesce(r.observacao,'NULL'));
  PERFORM pg_temp.chk('T14c totalizador legado manteve data_pagamento', r.data_pagamento = DATE '2031-11-10', coalesce(r.data_pagamento::text,'NULL'));

  -- T15 regra financeira fora das datas: valores e classificacao preservados
  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE financiamento_id = (SELECT v FROM _ids WHERE k='fin') AND cancelado = false
     AND (valor IS NULL OR plano_conta_id IS NULL OR tipo_operacao IS NULL);
  PERFORM pg_temp.chk('T15 valor/plano/tipo_operacao preservados em todos', v_n = 0, v_n::text);

  -- T16 orquestrador herda a correcao
  PERFORM public.fn_reconciliar_financiamento((SELECT v FROM _ids WHERE k='fin'), false, false);
  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE financiamento_id = (SELECT v FROM _ids WHERE k='fin') AND cancelado = false
     AND status_transacao = 'programado' AND data_pagamento IS NOT NULL;
  PERFORM pg_temp.chk('T16 apos o orquestrador, nenhum programado tem data_pagamento', v_n = 0, v_n::text);

  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE financiamento_id = (SELECT v FROM _ids WHERE k='fin') AND cancelado = false
     AND origem_lancamento = 'parcela_financiamento' AND data_vencimento IS NULL;
  PERFORM pg_temp.chk('T16b nenhum lancamento de parcela ficou sem vencimento', v_n = 0, v_n::text);

  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2
   WHERE financiamento_id = (SELECT v FROM _ids WHERE k='fin') AND cancelado = false
     AND origem_lancamento = 'parcela_financiamento'
     AND ano_mes <> to_char(DATE '2031-01-10','YYYY-MM');
  PERFORM pg_temp.chk('T16c todos os ano_mes seguem a competencia da captacao', v_n = 0, v_n::text);
END $$;

RESET ROLE;
SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FALHA' END AS status, caso, detalhe FROM _res ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS passaram, count(*) FILTER (WHERE NOT ok) AS falharam, count(*) AS total FROM _res;

DO $$
DECLARE v_f int;
BEGIN
  SELECT count(*) INTO v_f FROM _res WHERE NOT ok;
  IF v_f > 0 THEN RAISE EXCEPTION 'SUITE 02B: % casos falharam', v_f; END IF;
  RAISE NOTICE 'SUITE 02B: todos os casos passaram.';
END $$;

ROLLBACK;

-- T18 zero residuo
SELECT 'residuo' AS verificacao,
       (SELECT count(*) FROM public.financiamentos) AS financiamentos,
       (SELECT count(*) FROM public.financiamento_parcelas) AS parcelas,
       (SELECT count(*) FROM public.financeiro_lancamentos_v2) AS lancamentos,
       (SELECT count(*) FROM public.financeiro_plano_contas) AS planos,
       (SELECT count(*) FROM auth.users) AS users;
