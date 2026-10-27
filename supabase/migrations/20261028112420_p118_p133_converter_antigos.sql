-- P118 + P133 (Gabriel 27/10/2026) — OS ANTIGOS, com BACKUP e DESFAZER. So' roda depois do OK do Gabriel sobre a amostra
-- (~/Downloads/p118-amostra.md) e a lista do P133 (~/Downloads/p133-prefixo-nf.csv). Depende da 20261028112410 (a regra e o gatilho).
-- (a) `texto_conversao_backup`: cada texto trocado (operacao, tabela, registro, texto antigo, texto novo, quando) — a prova e o desfazer.
-- (b) `fn_texto_conversao_aplicar(operacao, cliente, simular)` — CLIENTE A CLIENTE (o canal do MCP tem tempo curto; o fornecedor ja' e' assim):
--     'p118-caixa-alta' — descricao TODA em caixa alta: lancamentos NAO cancelados e itens da nota (compra parcelada e recorrencia NAO);
--     'p133'            — tira o "NF <n> · " do comeco da descricao do lancamento NAO cancelado quando <n> e' o numero do documento.
--     `app.via` = 'sistema:<operacao>' (aparece na Auditoria). Simular = o mesmo caminho, desfeito no fim (SQLSTATE 'TCSIM'), devolvendo as
--     contagens por cliente e tabela.
-- (c) `fn_texto_conversao_desfazer(operacao, cliente)`: devolve o texto antigo de quem AINDA tem o texto novo (o que alguem editou depois fica como
--     esta' e e' contado a parte); o gatilho da caixa nao reconverte (`app.descricao_caixa_escritor`).
-- So' postgres / service_role (nenhuma tela chama).
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.texto_conversao_backup (
  id bigserial PRIMARY KEY,
  operacao text NOT NULL CHECK (operacao IN ('p118-caixa-alta', 'p133')),
  tabela text NOT NULL CHECK (tabela IN ('financeiro_lancamentos_v2', 'nota_fiscal_itens')),
  registro_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  texto_antigo text NOT NULL,
  texto_novo text NOT NULL,
  feito_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  desfeito_em timestamptz
);
CREATE INDEX IF NOT EXISTS ix_texto_conversao_backup_op ON public.texto_conversao_backup (operacao, tabela, registro_id);
ALTER TABLE public.texto_conversao_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.texto_conversao_backup FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_texto_conversao_aplicar(p_operacao text, p_cliente uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_ret jsonb;
BEGIN
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
