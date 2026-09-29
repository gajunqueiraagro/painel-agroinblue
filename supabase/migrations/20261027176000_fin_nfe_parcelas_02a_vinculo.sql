-- FIN-NFE-PARCELAS-01 · PR 2a — a NF da compra gravada UMA vez e ligada as N parcelas (29/09/2026).
--
-- POR QUE: o documento pertencia a UM lancamento (FK `lancamento_id`). A NF de uma compra parcelada
-- ou ia so' para a parcela 1 (o PR 1 faz isso) ou virava N copias. Decisoes do Gabriel (29/09):
--   1. a NF e' gravada uma vez e LIGADA as parcelas (opcao 3 da FASE 0: tabela de vinculo);
--   2. documento compartilhado e' conferido contra a COMPRA INTEIRA — a soma das parcelas ATIVAS
--      ligadas a ele; parcela cancelada continua ligada (historico) e sai da soma;
--   3. documento proprio (boleto de uma parcela, NF de lancamento avulso) segue conferido contra o
--      proprio lancamento, como hoje;
--   4. OC fica FORA: o ramo da OC na view e o confronto de documento de OC nao mudam;
--   5. tirar a NF compartilhada = cancelar o documento (fin_documento_cancelar, que ja existe).
--
-- ESTADO ANTERIOR (medido):
--   financeiro_documento_vinculos      nao existia
--   fin_documento_vincular             nao existia
--   vw_lancamento_documentos           md5(pg_get_viewdef) d225b90047c6337f5f75468a7400fa7a, {security_invoker=true}
--   fin_documento_confronto            md5(pg_get_functiondef) eb115b80d93b257046d778b37c8ec2d4
--   fin_documento_registrar/editar/cancelar  cc674c8d / 53c71a77 / 63b62da2 — NAO mudam
--
-- O QUE MUDA:
--   A. Tabela financeiro_documento_vinculos: guarda os OUTROS lancamentos de um documento — o dono
--      (financeiro_lancamento_documentos.lancamento_id) nunca entra. Documento sem vinculo = hoje.
--      ⚠ ESCOLHA 1 — A FK DO DOCUMENTO: composta (documento_id, documento_lancamento_id, cliente_id)
--        -> financeiro_lancamento_documentos(id, lancamento_id, cliente_id), a UNIQUE que ja existe.
--        Para isso o vinculo leva a coluna `documento_lancamento_id` (o dono). Ela garante NO BANCO,
--        mesmo para insert direto que nao passe pela RPC: (a) o documento e o vinculo sao do MESMO
--        cliente; (b) o dono nao entra no vinculo (CHECK lancamento_id <> documento_lancamento_id).
--        A alternativa — FK so' no id e conferir o cliente na RPC — deixaria as duas regras so' na RPC,
--        e a tabela tem policy de INSERT para authenticated. Nenhuma coluna nova em
--        financeiro_lancamento_documentos. O dono de um documento nunca muda, entao a copia nao diverge.
--   B. RPC fin_documento_vincular(p_documento, p_cliente, p_lancamentos): guarda identica a
--      fin_documento_registrar; recusa documento inexistente, cancelado ou de outro cliente, e
--      lancamento de outro cliente ou cancelado; idempotente (ON CONFLICT DO NOTHING).
--      ⚠ ESCOLHA 2 — O DONO NA LISTA E' IGNORADO EM SILENCIO, e contado em `ignorados_dono`: a tela
--        do PR 2b vai mandar "as N parcelas", e a parcela 1 e' a dona. Recusar obrigaria o front a
--        saber quem e' o dono so' para tira-lo da lista, e o resultado seria o mesmo.
--   C. vw_lancamento_documentos: ramo novo (molde do ramo da OC) que mostra o documento em cada
--      lancamento vinculado; coluna nova NO FIM, `ligado_a_qtd` = 1 + vinculos (NULL no ramo da OC).
--      Os dois ramos de antes entregam exatamente as mesmas colunas e linhas; o `WITH
--      (security_invoker = true)` vai junto no replace.
--   D. fin_documento_confronto: com documento COMPARTILHADO ativo ligado ao lancamento, esse documento
--      e' conferido contra a soma dos lancamentos ATIVOS do grupo (dono + vinculados); o documento
--      proprio continua contra o proprio lancamento. Sem documento compartilhado, o SELECT de hoje,
--      byte a byte. As chaves de hoje ficam; com compartilhado entram tres novas: grupo_valor_documento,
--      grupo_soma_lancamentos, grupo_qtd. Nenhuma especie e' filtrada (hoje nao e': a soma e' de todos
--      os documentos ativos com valor, e medido em 29/09 so' nf, comprovante e recibo tem valor).
--
-- O QUE NAO MUDA:
--   - corpo de fin_documento_registrar / editar / cancelar; colunas de financeiro_lancamento_documentos;
--   - o ramo da OC na view e o resultado do confronto para lancamento sem documento compartilhado;
--   - front, bucket, policies de storage;
--   - dado: nenhum vinculo e' criado para lancamento existente (a Vera inclusive).
--
-- ⚠ CASCADE: o vinculo cai se o lancamento vinculado for APAGADO. Hoje so' apagam lancamento o
--   ModalBaixaParcela (legado `origem_lancamento = 'financiamento'`), agri_barter_estornar_contrato,
--   oc_limpar_operacao_teste e fn_contrato_editar_e_regenerar. As parcelas do parcelamento
--   (fn_parcelamento_cadastrar) nascem com origem nula e sao so' CANCELADAS quando o parcelamento e'
--   excluido — o vinculo fica, e a parcela cancelada sai da soma do grupo.

-- ── A. tabela de vinculo ───────────────────────────────────────────────────────────────────────
CREATE TABLE public.financeiro_documento_vinculos (
  documento_id            uuid        NOT NULL,
  documento_lancamento_id uuid        NOT NULL,
  lancamento_id           uuid        NOT NULL,
  cliente_id              uuid        NOT NULL,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  criado_por              uuid                 DEFAULT auth.uid(),
  CONSTRAINT financeiro_documento_vinculos_pkey PRIMARY KEY (documento_id, lancamento_id),
  CONSTRAINT fin_doc_vinc_documento_fk FOREIGN KEY (documento_id, documento_lancamento_id, cliente_id)
    REFERENCES public.financeiro_lancamento_documentos (id, lancamento_id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT fin_doc_vinc_lancamento_fk FOREIGN KEY (lancamento_id, cliente_id)
    REFERENCES public.financeiro_lancamentos_v2 (id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT fin_doc_vinc_nao_e_o_dono CHECK (lancamento_id <> documento_lancamento_id)
);

CREATE INDEX idx_fin_doc_vinc_lancamento ON public.financeiro_documento_vinculos (lancamento_id);

ALTER TABLE public.financeiro_documento_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_documento_vinculos_select ON public.financeiro_documento_vinculos
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT get_user_cliente_ids(auth.uid()) AS get_user_cliente_ids)));
CREATE POLICY financeiro_documento_vinculos_insert ON public.financeiro_documento_vinculos
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT get_user_cliente_ids(auth.uid()) AS get_user_cliente_ids)));
CREATE POLICY financeiro_documento_vinculos_update ON public.financeiro_documento_vinculos
  FOR UPDATE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT get_user_cliente_ids(auth.uid()) AS get_user_cliente_ids)))
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT get_user_cliente_ids(auth.uid()) AS get_user_cliente_ids)));
CREATE POLICY financeiro_documento_vinculos_delete ON public.financeiro_documento_vinculos
  FOR DELETE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT get_user_cliente_ids(auth.uid()) AS get_user_cliente_ids)));

REVOKE ALL ON TABLE public.financeiro_documento_vinculos FROM PUBLIC;
REVOKE ALL ON TABLE public.financeiro_documento_vinculos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financeiro_documento_vinculos TO authenticated;
GRANT ALL ON TABLE public.financeiro_documento_vinculos TO service_role;

-- ── B. RPC de vinculo ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_documento_vincular(p_documento uuid, p_cliente uuid, p_lancamentos uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_doc public.financeiro_lancamento_documentos;
  v_ids uuid[];
  v_ruim uuid;
  v_ignorados int := 0;
  v_pedidos int;
  v_novos int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: sessao sem usuario' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente USING ERRCODE='42501'; END IF;

  SELECT * INTO v_doc FROM public.financeiro_lancamento_documentos
   WHERE id = p_documento AND cliente_id = p_cliente FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado neste cliente.' USING ERRCODE='P0002'; END IF;
  IF v_doc.cancelado THEN
    RAISE EXCEPTION 'Documento cancelado não pode ser ligado a outros lançamentos.' USING ERRCODE='P0001'; END IF;

  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(COALESCE(p_lancamentos, '{}'::uuid[])) x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Informe ao menos um lançamento para ligar o documento.' USING ERRCODE='P0001'; END IF;

  /* O dono ja tem o documento: fica fora do vinculo, sem erro (ESCOLHA 2 do cabecalho). */
  IF v_doc.lancamento_id = ANY (v_ids) THEN v_ignorados := 1; END IF;
  v_ids := array_remove(v_ids, v_doc.lancamento_id);

  SELECT x INTO v_ruim FROM unnest(v_ids) x
   WHERE NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 l WHERE l.id = x AND l.cliente_id = p_cliente)
   LIMIT 1;
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'Lançamento % não encontrado neste cliente.', v_ruim USING ERRCODE='P0002'; END IF;
  SELECT x INTO v_ruim FROM unnest(v_ids) x
    JOIN public.financeiro_lancamentos_v2 l ON l.id = x
   WHERE COALESCE(l.cancelado, false)
   LIMIT 1;
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'Lançamento % está cancelado e não recebe documento.', v_ruim USING ERRCODE='P0001'; END IF;

  v_pedidos := COALESCE(array_length(v_ids, 1), 0);
  INSERT INTO public.financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id, criado_por)
  SELECT p_documento, v_doc.lancamento_id, x, p_cliente, v_actor FROM unnest(v_ids) x
  ON CONFLICT (documento_id, lancamento_id) DO NOTHING;
  GET DIAGNOSTICS v_novos = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'documento_id', p_documento,
    'vinculados', v_novos,
    'ja_existiam', v_pedidos - v_novos,
    'ignorados_dono', v_ignorados,
    'ligado_a_qtd', 1 + (SELECT count(*) FROM public.financeiro_documento_vinculos WHERE documento_id = p_documento));
END $function$;

REVOKE ALL ON FUNCTION public.fin_documento_vincular(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_documento_vincular(uuid, uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fin_documento_vincular(uuid, uuid, uuid[]) TO authenticated;

-- ── C. view ────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_lancamento_documentos WITH (security_invoker = true) AS
 SELECT d.cliente_id,
    d.lancamento_id,
    d.id AS documento_id,
    'lancamento'::text AS origem,
    NULL::uuid AS operacao_id,
    d.nome,
    d.tipo,
    d.url,
    d.tamanho_bytes,
    d.uploaded_em,
    d.uploaded_por,
    d.especie,
    d.numero,
    d.serie,
    d.chave_acesso,
    d.data_emissao,
    d.valor_documento,
    d.emitente_id,
    d.emitente_nome,
    d.emitente_documento,
    d.observacao,
    d.cancelado,
    d.cancelado_em,
    d.cancelado_motivo,
    d.versao,
    (1 + ( SELECT count(*) AS count
           FROM financeiro_documento_vinculos vv
          WHERE (vv.documento_id = d.id)))::integer AS ligado_a_qtd
   FROM financeiro_lancamento_documentos d
UNION ALL
 SELECT od.cliente_id,
    pt.financeiro_lancamento_id AS lancamento_id,
    od.id AS documento_id,
    'operacao'::text AS origem,
    od.operacao_id,
    od.nome,
    od.tipo,
    od.url,
    od.tamanho_bytes,
    od.uploaded_em,
    od.uploaded_por,
    od.especie,
    od.numero,
    od.serie,
    od.chave_acesso,
    od.data_emissao,
    ( SELECT COALESCE(sum(c.valor), (0)::numeric) AS "coalesce"
           FROM zoo_operacao_documento_componentes c
          WHERE ((c.documento_id = od.id) AND (c.cancelado IS NOT TRUE))) AS valor_documento,
    od.emitente_id,
    od.emitente_nome,
    od.emitente_documento,
    od.observacao,
    od.cancelado,
    od.cancelado_em,
    od.cancelado_motivo,
    od.versao,
    NULL::integer AS ligado_a_qtd
   FROM (zoo_operacao_documentos od
     JOIN zoo_operacao_partes pt ON (((pt.operacao_id = od.operacao_id) AND (pt.financeiro_lancamento_id IS NOT NULL) AND (pt.cancelada IS NOT TRUE))))
UNION ALL
 SELECT d.cliente_id,
    v.lancamento_id,
    d.id AS documento_id,
    'lancamento'::text AS origem,
    NULL::uuid AS operacao_id,
    d.nome,
    d.tipo,
    d.url,
    d.tamanho_bytes,
    d.uploaded_em,
    d.uploaded_por,
    d.especie,
    d.numero,
    d.serie,
    d.chave_acesso,
    d.data_emissao,
    d.valor_documento,
    d.emitente_id,
    d.emitente_nome,
    d.emitente_documento,
    d.observacao,
    d.cancelado,
    d.cancelado_em,
    d.cancelado_motivo,
    d.versao,
    (1 + ( SELECT count(*) AS count
           FROM financeiro_documento_vinculos vv
          WHERE (vv.documento_id = d.id)))::integer AS ligado_a_qtd
   FROM (financeiro_documento_vinculos v
     JOIN financeiro_lancamento_documentos d ON (((d.id = v.documento_id) AND (d.cliente_id = v.cliente_id))));

-- ── D. confronto ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_documento_confronto(p_lancamento_id uuid, p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_docs uuid[];
  v_valor numeric;
  v_prop_total numeric; v_prop_n int; v_prop_nv int;
  v_comp_total numeric; v_comp_n int; v_comp_nv int;
  v_grupo_soma numeric; v_grupo_qtd int;
  v_dif numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: sessao sem usuario' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;

  /* Documentos COMPARTILHADOS e ATIVOS ligados a este lancamento — como dono ou como vinculado. */
  SELECT array_agg(d.id) INTO v_docs
    FROM public.financeiro_lancamento_documentos d
   WHERE d.cliente_id = p_cliente_id AND d.cancelado = false
     AND EXISTS (SELECT 1 FROM public.financeiro_documento_vinculos v WHERE v.documento_id = d.id)
     AND (d.lancamento_id = p_lancamento_id
          OR EXISTS (SELECT 1 FROM public.financeiro_documento_vinculos v
                      WHERE v.documento_id = d.id AND v.lancamento_id = p_lancamento_id));

  /* Sem documento compartilhado: o calculo de antes, byte a byte. */
  IF v_docs IS NULL THEN
  RETURN (
  SELECT jsonb_build_object(
    'valor_lancamento',  l.valor,
    'valor_documentado', COALESCE(d.total, 0),
    'docs_ativos',       COALESCE(d.n, 0),
    'docs_com_valor',    COALESCE(d.n_valor, 0),
    'diferenca',         ROUND(COALESCE(d.total,0) - COALESCE(l.valor,0), 2),
    'confere',           (d.n_valor > 0 AND ABS(COALESCE(d.total,0) - COALESCE(l.valor,0)) <= 0.01))
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN (
    SELECT lancamento_id, SUM(valor_documento) total, COUNT(*) n, COUNT(valor_documento) n_valor
    FROM public.financeiro_lancamento_documentos
    WHERE lancamento_id = p_lancamento_id AND cliente_id = p_cliente_id AND cancelado = false
    GROUP BY lancamento_id
  ) d ON d.lancamento_id = l.id
  WHERE l.id = p_lancamento_id AND l.cliente_id = p_cliente_id
  );
  END IF;

  SELECT l.valor INTO v_valor FROM public.financeiro_lancamentos_v2 l
   WHERE l.id = p_lancamento_id AND l.cliente_id = p_cliente_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  /* Proprios: do lancamento e sem vinculo — conferidos contra o proprio lancamento. */
  SELECT COALESCE(SUM(d.valor_documento), 0), COUNT(*), COUNT(d.valor_documento)
    INTO v_prop_total, v_prop_n, v_prop_nv
    FROM public.financeiro_lancamento_documentos d
   WHERE d.lancamento_id = p_lancamento_id AND d.cliente_id = p_cliente_id AND d.cancelado = false
     AND NOT (d.id = ANY (v_docs));

  /* Compartilhados: conferidos contra a soma dos lancamentos ATIVOS do grupo (donos + vinculados). */
  SELECT COALESCE(SUM(d.valor_documento), 0), COUNT(*), COUNT(d.valor_documento)
    INTO v_comp_total, v_comp_n, v_comp_nv
    FROM public.financeiro_lancamento_documentos d
   WHERE d.id = ANY (v_docs);

  SELECT COALESCE(SUM(l.valor), 0), COUNT(*)
    INTO v_grupo_soma, v_grupo_qtd
    FROM public.financeiro_lancamentos_v2 l
   WHERE l.cliente_id = p_cliente_id AND COALESCE(l.cancelado, false) = false
     AND l.id IN (SELECT d.lancamento_id FROM public.financeiro_lancamento_documentos d WHERE d.id = ANY (v_docs)
                  UNION
                  SELECT v.lancamento_id FROM public.financeiro_documento_vinculos v WHERE v.documento_id = ANY (v_docs));

  IF v_prop_nv = 0 AND v_comp_nv = 0 THEN
    v_dif := 0 - COALESCE(v_valor, 0);
  ELSE
    v_dif := (CASE WHEN v_prop_nv > 0 THEN v_prop_total - COALESCE(v_valor, 0) ELSE 0 END)
           + (CASE WHEN v_comp_nv > 0 THEN v_comp_total - v_grupo_soma ELSE 0 END);
  END IF;

  RETURN jsonb_build_object(
    'valor_lancamento',       v_valor,
    'valor_documentado',      v_prop_total + v_comp_total,
    'docs_ativos',            v_prop_n + v_comp_n,
    'docs_com_valor',         v_prop_nv + v_comp_nv,
    'diferenca',              ROUND(v_dif, 2),
    'confere',                ((v_prop_nv + v_comp_nv) > 0 AND ABS(v_dif) <= 0.01),
    'grupo_valor_documento',  v_comp_total,
    'grupo_soma_lancamentos', v_grupo_soma,
    'grupo_qtd',              v_grupo_qtd);
END $function$;

REVOKE ALL ON FUNCTION public.fin_documento_confronto(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_documento_confronto(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fin_documento_confronto(uuid, uuid) TO authenticated;
