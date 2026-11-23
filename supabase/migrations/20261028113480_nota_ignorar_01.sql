-- NOTA-IGNORAR-01 (Gabriel 23/11 11:52; o caso: Vera · Panda Max NF 1.226.616 R$ 1,18 = compra pessoal) — lote 33. Regra de produto, todos os
-- clientes. "Ignorar" uma nota da Receita: sai do "A lançar" e vai para a aba "Ignoradas" (motivo, quem, quando), segue na busca e em "Todas";
-- DESFAZER volta para onde estava. A situação 'ignorado' JÁ EXISTE em `fiscal_dfe_recebidos` (CHECK) e a busca já a respeita
-- (`fn_fiscal_dfe_registrar`: importado/ignorado/cancelado ficam quando a nota volta) — este lote só dá o gesto e a trilha.
-- O QUE MUDA:
--   1. `fiscal_dfe_ignoradas` — a TRILHA (uma linha por gesto): motivo (pessoal · nao_operacao · duplicada · outro + texto), quem, quando, a
--      situação de antes; desfazer preenche desfeita_por/desfeita_em (nada se apaga). No máximo 1 viva por nota. Leitura pela RLS do cliente;
--      escrita SÓ pelas funções.
--   2. `fn_nota_receita_ignorar(cliente, recebido, motivo, texto)` — só nota que pede ação (resumo · manifestado · xml, sem nota no sistema).
--   3. `fn_nota_receita_desfazer_ignorar(cliente, recebido)` — volta a situação: 'xml' se o XML já chegou, senão a de antes.
--   4. `fn_notas_receita_ignoradas(cliente)` — as vivas, com o NOME de quem ignorou (para a aba e para a SUGESTÃO na nota nova do mesmo
--      emitente: só sugestão, nunca automático — a tela decide mostrar).
-- A nota ignorada só com o resumo NÃO recebe a ciência automática (a ciência pega só 'resumo'); desfeito, volta a receber.
-- NENHUMA nota existente muda. GESTO CONTRÁRIO: DROP das 3 funções e da tabela (nenhuma nota está 'ignorado' hoje: 0 linhas, 23/11).

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- ── 1. a trilha ──
CREATE TABLE IF NOT EXISTS public.fiscal_dfe_ignoradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  recebido_id uuid NOT NULL REFERENCES public.fiscal_dfe_recebidos(id),
  chave text NOT NULL,
  emitente_documento text,
  motivo text NOT NULL CONSTRAINT fiscal_dfe_ignoradas_motivo_ck CHECK (motivo IN ('pessoal', 'nao_operacao', 'duplicada', 'outro')),
  texto text,
  situacao_antes text NOT NULL,
  ignorada_por uuid,
  ignorada_em timestamptz NOT NULL DEFAULT now(),
  desfeita_por uuid,
  desfeita_em timestamptz,
  CONSTRAINT fiscal_dfe_ignoradas_outro_ck CHECK (motivo <> 'outro' OR length(btrim(coalesce(texto, ''))) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_dfe_ignorada_viva ON public.fiscal_dfe_ignoradas (recebido_id) WHERE desfeita_em IS NULL;
CREATE INDEX IF NOT EXISTS ix_fiscal_dfe_ignoradas_cliente ON public.fiscal_dfe_ignoradas (cliente_id) WHERE desfeita_em IS NULL;
ALTER TABLE public.fiscal_dfe_ignoradas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fiscal_dfe_ignoradas_ler ON public.fiscal_dfe_ignoradas;
CREATE POLICY fiscal_dfe_ignoradas_ler ON public.fiscal_dfe_ignoradas FOR SELECT USING (tenant_ok(cliente_id));
REVOKE ALL ON public.fiscal_dfe_ignoradas FROM public, anon, authenticated;
GRANT SELECT ON public.fiscal_dfe_ignoradas TO authenticated;
COMMENT ON TABLE public.fiscal_dfe_ignoradas IS
  'NOTA-IGNORAR-01 — a trilha do "Ignorar" das Notas da Receita (motivo, quem, quando; desfazer preenche desfeita_*). Escrita só pelas fn_nota_receita_*.';

-- ── 2. ignorar ──
CREATE OR REPLACE FUNCTION public.fn_nota_receita_ignorar(p_cliente uuid, p_recebido uuid, p_motivo text, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r public.fiscal_dfe_recebidos%ROWTYPE; v_id uuid; v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_motivo, '') NOT IN ('pessoal', 'nao_operacao', 'duplicada', 'outro') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Escolha o motivo. Nada foi gravado.';
  END IF;
  IF p_motivo = 'outro' AND v_texto IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Em "Outro", escreva o motivo. Nada foi gravado.';
  END IF;
  SELECT * INTO r FROM public.fiscal_dfe_recebidos WHERE id = p_recebido AND cliente_id = p_cliente FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Nota não encontrada. Nada foi gravado.';
  END IF;
  IF r.situacao NOT IN ('resumo', 'manifestado', 'xml') OR r.nota_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Esta nota já está no sistema, cancelada ou ignorada. Nada foi gravado.';
  END IF;
  INSERT INTO public.fiscal_dfe_ignoradas (cliente_id, recebido_id, chave, emitente_documento, motivo, texto, situacao_antes, ignorada_por)
  VALUES (p_cliente, r.id, r.chave, r.emitente_documento, p_motivo, v_texto, r.situacao, auth.uid())
  RETURNING id INTO v_id;
  UPDATE public.fiscal_dfe_recebidos SET situacao = 'ignorado', atualizado_em = now() WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_nota_receita_ignorar(uuid, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_receita_ignorar(uuid, uuid, text, text) TO authenticated;

-- ── 3. desfazer ──
CREATE OR REPLACE FUNCTION public.fn_nota_receita_desfazer_ignorar(p_cliente uuid, p_recebido uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r public.fiscal_dfe_recebidos%ROWTYPE; i public.fiscal_dfe_ignoradas%ROWTYPE; v_volta text;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.fiscal_dfe_recebidos WHERE id = p_recebido AND cliente_id = p_cliente FOR UPDATE;
  SELECT * INTO i FROM public.fiscal_dfe_ignoradas WHERE recebido_id = p_recebido AND cliente_id = p_cliente AND desfeita_em IS NULL FOR UPDATE;
  IF r.id IS NULL OR i.id IS NULL OR r.situacao <> 'ignorado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Esta nota não está ignorada. Nada foi gravado.';
  END IF;
  v_volta := CASE WHEN r.xml IS NOT NULL THEN 'xml' WHEN i.situacao_antes IN ('resumo', 'manifestado') THEN i.situacao_antes ELSE 'resumo' END;
  UPDATE public.fiscal_dfe_recebidos SET situacao = v_volta, atualizado_em = now() WHERE id = r.id;
  UPDATE public.fiscal_dfe_ignoradas SET desfeita_por = auth.uid(), desfeita_em = now() WHERE id = i.id;
  RETURN jsonb_build_object('ok', true, 'situacao', v_volta);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_nota_receita_desfazer_ignorar(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_receita_desfazer_ignorar(uuid, uuid) TO authenticated;

-- ── 4. as ignoradas vivas, com quem ignorou ──
CREATE OR REPLACE FUNCTION public.fn_notas_receita_ignoradas(p_cliente uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('recebido_id', i.recebido_id, 'chave', i.chave, 'emitente_documento', i.emitente_documento,
             'motivo', i.motivo, 'texto', i.texto, 'em', i.ignorada_em, 'por', p.nome) ORDER BY i.ignorada_em DESC)
      FROM public.fiscal_dfe_ignoradas i
      LEFT JOIN public.profiles p ON p.user_id = i.ignorada_por
     WHERE i.cliente_id = p_cliente AND i.desfeita_em IS NULL), '[]'::jsonb);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_notas_receita_ignoradas(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_notas_receita_ignoradas(uuid) TO authenticated;
