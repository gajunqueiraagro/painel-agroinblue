-- P149 (Gabriel 27/10/2026 19:4x) — RECLASSIFICACAO dos lancamentos de comida/gas de quem trabalha, de "Beneficios e Premiacoes
-- <atividade>" para "Alimentacao e Cantina <atividade>" (a MESMA atividade; as contas globais da 20261028114000). Modelo do P118:
-- (a) `plano_reclassificacao_backup`: cada lancamento trocado (operacao, conta antiga, conta nova, quando) — a prova e o desfazer.
-- (b) `fn_p149_reclassificar(cliente, ids, simular)` — CLIENTE A CLIENTE, pela LISTA de ids conferida pelo Gabriel (~/Downloads/
--     p149-ids.csv: os "claro" do Agnaldo e do NJ + os mistos Atacadao "sede", PF 2 "gas e gasolina" e Gulart "cantina e sede"; ficam
--     Natal, confraternizacao, bonificacao e gas de condominio; o Premix nao se toca). Tudo ou nada: id que nao e' do cliente, cancelado,
--     dividido ou fora de um "Beneficios e Premiacoes" global recusa a lista inteira. So' o `plano_conta_id` muda; macro/grupo/centro/
--     subcentro/DRE vem da conta pelos gatilhos de sempre. `app.via` = 'p149' (Auditoria). Simular = o mesmo caminho, desfeito no fim
--     (SQLSTATE 'PCSIM'), devolvendo as contagens.
-- (c) `fn_p149_desfazer(cliente)`: devolve a conta antiga de quem AINDA esta' na conta nova (o que alguem reclassificou depois fica e e'
--     contado a parte); `app.via` = 'p149-desfazer'.
-- So' postgres / service_role (nenhuma tela chama); usuario logado so' se for admin AgroInBlue (guarda do P118).
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.plano_reclassificacao_backup (
  id bigserial PRIMARY KEY,
  operacao text NOT NULL CHECK (operacao IN ('p149')),
  lancamento_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  plano_antigo uuid NOT NULL,
  plano_novo uuid NOT NULL,
  feito_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  desfeito_em timestamptz
);
CREATE INDEX IF NOT EXISTS ix_plano_reclassificacao_backup_op ON public.plano_reclassificacao_backup (operacao, cliente_id, lancamento_id);
ALTER TABLE public.plano_reclassificacao_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plano_reclassificacao_backup FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_p149_reclassificar(p_cliente uuid, p_ids uuid[], p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_ret jsonb; v_pedidos int; v_validos int;
BEGIN
  /* P118 guarda (SEG-DRE-TENANT-01): a execucao ja' e' so' do postgres/service_role (REVOKE); usuario logado so' se for admin AgroInBlue */
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: a reclassificacao do P149 e'' rotina do sistema.' USING ERRCODE = '42501';
  END IF;
  IF p_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente) THEN RAISE EXCEPTION 'Cliente nao encontrado. Nada foi gravado.'; END IF;
  SELECT count(DISTINCT x) INTO v_pedidos FROM unnest(coalesce(p_ids, '{}'::uuid[])) x;
  IF v_pedidos = 0 THEN RAISE EXCEPTION 'Lista vazia. Nada foi gravado.'; END IF;
  BEGIN
    PERFORM set_config('app.via', 'p149', true);
    SELECT count(*) INTO v_validos FROM (
      SELECT l.id, l.plano_conta_id antigo, n.id novo
        FROM financeiro_lancamentos_v2 l
        JOIN financeiro_plano_contas b ON b.id = l.plano_conta_id AND b.cliente_id IS NULL AND b.subcentro LIKE 'Benefícios e Premiações %'
        JOIN financeiro_plano_contas n ON n.cliente_id IS NULL AND n.ativo
                                      AND n.subcentro = replace(b.subcentro, 'Benefícios e Premiações', 'Alimentação e Cantina')
       WHERE l.id = ANY (p_ids) AND l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.classificacao_dividida IS NOT TRUE
       FOR UPDATE OF l) a;
    IF v_validos <> v_pedidos THEN
      RAISE EXCEPTION 'P149: % ids pedidos, % validos (do cliente, vivos, sem divisao, num Beneficios global). Nada foi gravado.', v_pedidos, v_validos;
    END IF;
    WITH alvo AS (
      SELECT l.id, l.plano_conta_id antigo, n.id novo
        FROM financeiro_lancamentos_v2 l
        JOIN financeiro_plano_contas b ON b.id = l.plano_conta_id AND b.cliente_id IS NULL AND b.subcentro LIKE 'Benefícios e Premiações %'
        JOIN financeiro_plano_contas n ON n.cliente_id IS NULL AND n.ativo
                                      AND n.subcentro = replace(b.subcentro, 'Benefícios e Premiações', 'Alimentação e Cantina')
       WHERE l.id = ANY (p_ids) AND l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.classificacao_dividida IS NOT TRUE
    ), feito AS (
      UPDATE financeiro_lancamentos_v2 l SET plano_conta_id = a.novo
        FROM alvo a WHERE l.id = a.id RETURNING l.id, a.antigo, a.novo
    )
    INSERT INTO plano_reclassificacao_backup (operacao, lancamento_id, cliente_id, plano_antigo, plano_novo)
    SELECT 'p149', id, p_cliente, antigo, novo FROM feito;
    SELECT jsonb_build_object('operacao', 'p149', 'simulado', coalesce(p_simular, true), 'total', coalesce(sum(x.n), 0),
             'valor', coalesce(sum(x.v), 0),
             'por_conta', coalesce(jsonb_agg(jsonb_build_object('de', pa.subcentro, 'para', pn.subcentro, 'n', x.n, 'valor', x.v) ORDER BY pa.subcentro), '[]'::jsonb))
      INTO v_ret
      FROM (SELECT b.plano_antigo, b.plano_novo, count(*) n, sum(l.valor) v
              FROM plano_reclassificacao_backup b JOIN financeiro_lancamentos_v2 l ON l.id = b.lancamento_id
             WHERE b.operacao = 'p149' AND b.cliente_id = p_cliente AND b.desfeito_em IS NULL AND b.feito_em >= now() GROUP BY 1, 2) x
      JOIN financeiro_plano_contas pa ON pa.id = x.plano_antigo
      JOIN financeiro_plano_contas pn ON pn.id = x.plano_novo;
    IF coalesce(p_simular, true) THEN RAISE EXCEPTION USING ERRCODE = 'PCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'PCSIM' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_ret;
END $f$;
REVOKE ALL ON FUNCTION public.fn_p149_reclassificar(uuid, uuid[], boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_p149_desfazer(p_cliente uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_n int := 0; v_ficaram int;
BEGIN
  /* P118 guarda (SEG-DRE-TENANT-01) */
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: o desfazer do P149 e'' rotina do sistema.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.via', 'p149-desfazer', true);
  WITH volta AS (
    UPDATE financeiro_lancamentos_v2 l SET plano_conta_id = b.plano_antigo
      FROM plano_reclassificacao_backup b
     WHERE b.operacao = 'p149' AND b.cliente_id = p_cliente AND b.desfeito_em IS NULL
       AND b.lancamento_id = l.id AND l.plano_conta_id IS NOT DISTINCT FROM b.plano_novo
    RETURNING b.id)
  UPDATE plano_reclassificacao_backup b SET desfeito_em = clock_timestamp() FROM volta WHERE b.id = volta.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT count(*) INTO v_ficaram FROM plano_reclassificacao_backup WHERE operacao = 'p149' AND cliente_id = p_cliente AND desfeito_em IS NULL;
  RETURN jsonb_build_object('operacao', 'p149', 'desfeitos', v_n, 'reclassificados_depois_ficaram', v_ficaram);
END $f$;
REVOKE ALL ON FUNCTION public.fn_p149_desfazer(uuid) FROM PUBLIC, anon, authenticated;
