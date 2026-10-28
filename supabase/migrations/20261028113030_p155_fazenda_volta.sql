-- P155 (b) (OK do Gabriel 28/10/2026 08:39) — A FAZENDA DE VOLTA: os lançamentos que o Salvar do "Editar lançamento" levou para "Administrativo"
-- sem a pessoa pedir (o defeito consertado no front, `classificacaoDe`) voltam à fazenda de ANTES daquela edição, com BACKUP e DESFAZER, cliente
-- a cliente. Prévia: ~/Downloads/relatorios/notas-20261028-0838-P155-previa.md (7 no proto). Os ids NÃO estão aqui (dado de cliente): vão na
-- chamada.
-- Para cada id pedido, do cliente, vivo: a ÚLTIMA edição humana (`audit_log` 'editou', via nula) desde 11/09/2026 21:28 UTC (a trava que nasceu
-- o defeito, 65a33cc0) que levou a fazenda PARA a de agora; a de antes dela é a que volta (do mesmo cliente).
-- GUARDA: só volta se a fazenda de AGORA ainda é a "Administrativo" que aquela edição pôs (o nome, a mesma regra do front
-- `fazendaAdministrativa`). Quem alguém mudou depois fica, e é contado em `pulados` com o motivo.
-- (a) `fazenda_volta_backup`: cada troca (operação, lançamento, cliente, fazenda de agora, a que voltou, a entrada do audit, quando, desfeito).
-- (b) `fn_p155_fazenda_aplicar(cliente, ids, simular)`: `app.via` = 'p155' (Auditoria: "sistema:p155"); simular = o mesmo caminho, desfeito no
--     fim (SQLSTATE 'FVSIM'). Só muda `fazenda_id`: valor, data, status, conta e conciliação não.
-- (c) `fn_p155_fazenda_desfazer(operação)`: volta para "Administrativo" quem AINDA está na fazenda que voltou.
-- Só postgres / service_role (REVOKE); usuário logado só se for admin AgroInBlue.
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.fazenda_volta_backup (
  id bigserial PRIMARY KEY,
  operacao uuid NOT NULL,
  lancamento_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  fazenda_antes uuid NOT NULL,
  fazenda_volta uuid NOT NULL,
  audit_id uuid NOT NULL,
  feito_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  desfeito_em timestamptz
);
CREATE INDEX IF NOT EXISTS ix_fazenda_volta_backup_op ON public.fazenda_volta_backup (operacao);
ALTER TABLE public.fazenda_volta_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fazenda_volta_backup FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_p155_fazenda_aplicar(p_cliente uuid, p_ids uuid[], p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_op uuid := gen_random_uuid(); v_ret jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: a volta da fazenda e'' rotina do sistema.' USING ERRCODE = '42501';
  END IF;
  IF p_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente) THEN RAISE EXCEPTION 'Cliente nao encontrado. Nada foi gravado.'; END IF;
  IF coalesce(cardinality(p_ids), 0) = 0 THEN RAISE EXCEPTION 'Nenhum lancamento pedido. Nada foi gravado.'; END IF;
  BEGIN
    PERFORM set_config('app.via', 'p155', true);
    WITH pedidos AS (SELECT DISTINCT unnest(p_ids) id),
    lanc AS (
      SELECT l.id, l.fazenda_id, fz.nome ILIKE '%administrat%' em_adm
        FROM financeiro_lancamentos_v2 l JOIN fazendas fz ON fz.id = l.fazenda_id
       WHERE l.id IN (SELECT id FROM pedidos) AND l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE
       FOR UPDATE OF l
    ),
    ultima AS (
      SELECT DISTINCT ON (a.registro_id) a.registro_id id, a.id audit_id, (a.dados_anteriores->>'fazenda_id')::uuid volta,
             (a.dados_novos->>'fazenda_id')::uuid pos
        FROM audit_log a
       WHERE a.registro_id IN (SELECT id FROM pedidos) AND a.tabela_origem = 'financeiro_lancamentos_v2' AND a.acao = 'editou' AND a.via IS NULL
         AND a.created_at >= '2026-09-11 21:28:27+00'
         AND (a.dados_anteriores->>'fazenda_id') IS DISTINCT FROM (a.dados_novos->>'fazenda_id')
       ORDER BY a.registro_id, a.created_at DESC
    ),
    alvo AS (
      SELECT x.id, x.fazenda_id agora, u.volta, u.audit_id FROM lanc x JOIN ultima u ON u.id = x.id
       WHERE x.em_adm AND u.pos = x.fazenda_id AND u.volta IS NOT NULL
         AND EXISTS (SELECT 1 FROM fazendas f WHERE f.id = u.volta AND f.cliente_id = p_cliente)
    ),
    feito AS (
      UPDATE financeiro_lancamentos_v2 l SET fazenda_id = a.volta FROM alvo a WHERE l.id = a.id
      RETURNING l.id
    ),
    bk AS (
      INSERT INTO fazenda_volta_backup (operacao, lancamento_id, cliente_id, fazenda_antes, fazenda_volta, audit_id)
      SELECT v_op, a.id, p_cliente, a.agora, a.volta, a.audit_id FROM alvo a JOIN feito f ON f.id = a.id
      RETURNING lancamento_id, fazenda_volta
    )
    SELECT jsonb_build_object('simulado', coalesce(p_simular, true), 'operacao', v_op,
             'voltaram', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.lancamento_id, 'fazenda', fz.nome) ORDER BY b.lancamento_id), '[]'::jsonb)
                            FROM bk b JOIN fazendas fz ON fz.id = b.fazenda_volta),
             'pulados', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'motivo',
                            CASE WHEN x.id IS NULL THEN 'nao e'' deste cliente, cancelado ou nao existe'
                                 WHEN NOT x.em_adm THEN 'a fazenda de agora nao e'' mais Administrativo (mudada depois)'
                                 WHEN u.id IS NULL THEN 'sem a edicao que o levou para a fazenda de agora'
                                 WHEN u.pos IS DISTINCT FROM x.fazenda_id THEN 'a ultima edicao da fazenda nao foi a que o pos aqui'
                                 ELSE 'a fazenda de antes nao e'' deste cliente' END) ORDER BY p.id), '[]'::jsonb)
                            FROM pedidos p LEFT JOIN lanc x ON x.id = p.id LEFT JOIN ultima u ON u.id = p.id
                           WHERE p.id NOT IN (SELECT id FROM alvo)))
      INTO v_ret;
    IF coalesce(p_simular, true) THEN RAISE EXCEPTION USING ERRCODE = 'FVSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'FVSIM' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_ret;
END $f$;
REVOKE ALL ON FUNCTION public.fn_p155_fazenda_aplicar(uuid, uuid[], boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_p155_fazenda_desfazer(p_operacao uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_n int := 0; v_ficaram int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: a volta da fazenda e'' rotina do sistema.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.via', 'p155-desfazer', true);
  WITH volta AS (
    UPDATE financeiro_lancamentos_v2 l SET fazenda_id = b.fazenda_antes
      FROM fazenda_volta_backup b
     WHERE b.operacao = p_operacao AND b.desfeito_em IS NULL AND b.lancamento_id = l.id AND l.fazenda_id = b.fazenda_volta
    RETURNING b.id)
  UPDATE fazenda_volta_backup b SET desfeito_em = clock_timestamp() FROM volta WHERE b.id = volta.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT count(*) INTO v_ficaram FROM fazenda_volta_backup WHERE operacao = p_operacao AND desfeito_em IS NULL;
  RETURN jsonb_build_object('voltaram', v_n, 'mudados_depois_ficaram', v_ficaram);
END $f$;
REVOKE ALL ON FUNCTION public.fn_p155_fazenda_desfazer(uuid) FROM PUBLIC, anon, authenticated;
