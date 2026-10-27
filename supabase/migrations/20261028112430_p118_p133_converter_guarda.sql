-- P118 + P133 (27/10/2026) — a GUARDA que faltou na 20261028112420 (a guarda de cliente das migrations, SEG-DRE-TENANT-01, acusou:
-- SECURITY DEFINER com parametro de cliente). A 112420 e' registro historico (ledger = arquivo) e nao se reescreve: esta REDEFINE as duas
-- funcoes, com o MESMO corpo + a guarda no comeco (usuario logado que nao e' admin AgroInBlue -> 42501; sem usuario — postgres e
-- service_role, os unicos que executam — segue). Nada mais muda.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_texto_conversao_aplicar(p_operacao text, p_cliente uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_ret jsonb;
BEGIN
  /* P118 guarda (SEG-DRE-TENANT-01): a execucao ja' e' so' do postgres/service_role (REVOKE); usuario logado so' se for admin AgroInBlue */
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: a conversao de textos e'' rotina do sistema.' USING ERRCODE = '42501';
  END IF;
  IF p_operacao NOT IN ('p118-caixa-alta', 'p133') THEN RAISE EXCEPTION 'Operacao desconhecida: %. Nada foi gravado.', p_operacao; END IF;
  IF p_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente) THEN RAISE EXCEPTION 'Cliente nao encontrado. Nada foi gravado.'; END IF;
  BEGIN
    PERFORM set_config('app.via', p_operacao, true);
    IF p_operacao = 'p118-caixa-alta' THEN
      WITH alvo AS (
        SELECT l.id, l.cliente_id, l.descricao antigo FROM financeiro_lancamentos_v2 l
         WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND public._fn_descricao_caixa(l.descricao) IS DISTINCT FROM l.descricao
         FOR UPDATE
      ), feito AS (
        UPDATE financeiro_lancamentos_v2 l SET descricao = public._fn_descricao_caixa(a.antigo)
          FROM alvo a WHERE l.id = a.id RETURNING l.id, l.cliente_id, a.antigo, l.descricao novo
      )
      INSERT INTO texto_conversao_backup (operacao, tabela, registro_id, cliente_id, texto_antigo, texto_novo)
      SELECT p_operacao, 'financeiro_lancamentos_v2', id, cliente_id, antigo, novo FROM feito;
      WITH alvo AS (
        SELECT i.id, i.cliente_id, i.descricao antigo FROM nota_fiscal_itens i
         WHERE i.cliente_id = p_cliente AND public._fn_descricao_caixa(i.descricao) IS DISTINCT FROM i.descricao
         FOR UPDATE
      ), feito AS (
        UPDATE nota_fiscal_itens i SET descricao = public._fn_descricao_caixa(a.antigo)
          FROM alvo a WHERE i.id = a.id RETURNING i.id, i.cliente_id, a.antigo, i.descricao novo
      )
      INSERT INTO texto_conversao_backup (operacao, tabela, registro_id, cliente_id, texto_antigo, texto_novo)
      SELECT p_operacao, 'nota_fiscal_itens', id, cliente_id, antigo, novo FROM feito;
    ELSE
      WITH alvo AS (
        SELECT l.id, l.cliente_id, l.descricao antigo FROM financeiro_lancamentos_v2 l
         WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.descricao ~ '^NF [0-9.]+ · '
           AND ltrim(regexp_replace(substring(l.descricao FROM '^NF ([0-9.]+) · '), '\D', '', 'g'), '0')
             = ltrim(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), '0')
         FOR UPDATE
      ), feito AS (
        UPDATE financeiro_lancamentos_v2 l SET descricao = regexp_replace(a.antigo, '^NF [0-9.]+ · ', '')
          FROM alvo a WHERE l.id = a.id RETURNING l.id, l.cliente_id, a.antigo, l.descricao novo
      )
      INSERT INTO texto_conversao_backup (operacao, tabela, registro_id, cliente_id, texto_antigo, texto_novo)
      SELECT p_operacao, 'financeiro_lancamentos_v2', id, cliente_id, antigo, novo FROM feito;
    END IF;
    SELECT jsonb_build_object('operacao', p_operacao, 'simulado', coalesce(p_simular, true),
             'por_cliente', coalesce(jsonb_agg(jsonb_build_object('cliente', c.nome, 'tabela', x.tabela, 'n', x.n) ORDER BY c.nome, x.tabela), '[]'::jsonb),
             'total', coalesce(sum(x.n), 0))
      INTO v_ret
      FROM (SELECT b.cliente_id, b.tabela, count(*) n FROM texto_conversao_backup b
             WHERE b.operacao = p_operacao AND b.cliente_id = p_cliente AND b.desfeito_em IS NULL AND b.feito_em >= now() GROUP BY 1, 2) x
      JOIN clientes c ON c.id = x.cliente_id;
    IF coalesce(p_simular, true) THEN RAISE EXCEPTION USING ERRCODE = 'TCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'TCSIM' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_ret;
END $f$;
REVOKE ALL ON FUNCTION public.fn_texto_conversao_aplicar(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_texto_conversao_desfazer(p_operacao text, p_cliente uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_l int := 0; v_i int := 0; v_mudados int;
BEGIN
  /* P118 guarda (SEG-DRE-TENANT-01): a execucao ja' e' so' do postgres/service_role (REVOKE); usuario logado so' se for admin AgroInBlue */
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    RAISE EXCEPTION 'Acesso negado: a conversao de textos e'' rotina do sistema.' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.via', p_operacao || '-desfazer', true);
  PERFORM set_config('app.descricao_caixa_escritor', 'on', true);
  WITH volta AS (
    UPDATE financeiro_lancamentos_v2 l SET descricao = b.texto_antigo
      FROM texto_conversao_backup b
     WHERE b.operacao = p_operacao AND b.cliente_id = p_cliente AND b.tabela = 'financeiro_lancamentos_v2' AND b.desfeito_em IS NULL
       AND b.registro_id = l.id AND l.descricao IS NOT DISTINCT FROM b.texto_novo
    RETURNING b.id)
  UPDATE texto_conversao_backup b SET desfeito_em = clock_timestamp() FROM volta WHERE b.id = volta.id;
  GET DIAGNOSTICS v_l = ROW_COUNT;
  WITH volta AS (
    UPDATE nota_fiscal_itens i SET descricao = b.texto_antigo
      FROM texto_conversao_backup b
     WHERE b.operacao = p_operacao AND b.cliente_id = p_cliente AND b.tabela = 'nota_fiscal_itens' AND b.desfeito_em IS NULL
       AND b.registro_id = i.id AND i.descricao IS NOT DISTINCT FROM b.texto_novo
    RETURNING b.id)
  UPDATE texto_conversao_backup b SET desfeito_em = clock_timestamp() FROM volta WHERE b.id = volta.id;
  GET DIAGNOSTICS v_i = ROW_COUNT;
  PERFORM set_config('app.descricao_caixa_escritor', '', true);
  SELECT count(*) INTO v_mudados FROM texto_conversao_backup WHERE operacao = p_operacao AND cliente_id = p_cliente AND desfeito_em IS NULL;
  RETURN jsonb_build_object('operacao', p_operacao, 'lancamentos', v_l, 'itens', v_i, 'editados_depois_ficaram', v_mudados);
END $f$;
REVOKE ALL ON FUNCTION public.fn_texto_conversao_desfazer(text, uuid) FROM PUBLIC, anon, authenticated;
