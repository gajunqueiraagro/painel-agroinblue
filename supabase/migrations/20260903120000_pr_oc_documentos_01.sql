-- PR-OC-DOCUMENTOS-01 — o EMITENTE da nota, a especie RECIBO e o lugar do arquivo.
--
--   ⚠ ESPELHO DO APLICADO. As pecas estao no proto desde 28/08, aplicadas e testadas
--   pelo Chat. Os corpos das duas RPCs foram conferidos por md5 contra o vigente:
--     oc_documento_registrar  9fa70022d3228b078e0dc01db255d1e3 (3007 chars)
--     oc_documento_editar     bbbb340bead76a28324cdace6f1cdc66 (2713 chars)
--   md5 de PARTIDA, antes das colunas do emitente e da especie nova:
--     registrar 08ce496eb483f156f942936e1f761680 · editar 4d34a47f7377e704fd81eda667af2244
--   Homologado com a NF da OC f6d3e180, FECHADA, emitente distinto da contraparte.
--
--   ⚠⚠ ACHADO COLATERAL, GRAVE E FORA DESTE PR — REGISTRADO PARA NAO SE PERDER.
--   As migrations dos buckets `kml-files` (20260331050632) e `abate-anexos`
--   (20260415000542) estao VERSIONADAS e NUNCA FORAM APLICADAS no proto: antes deste
--   PR, `storage.buckets` estava VAZIO e `storage.objects` nao tinha politica nenhuma.
--   Consequencia viva: o upload de foto de abate (AbateDetalhesDialog.tsx:470) aponta
--   para um bucket inexistente e FALHA HOJE se alguem tentar. Ninguem reportou porque
--   provavelmente ninguem usou. Frente propria — nao corrigir aqui.
--
-- ── 1. O EMITENTE ────────────────────────────────────────────────────────────
--   Caso real (OC f6d3e180): a CONTRAPARTE foi "Carlinhos (Silvana)", que intermediou;
--   quem EMITIU a nota foi "Vinicius Fernandes Cacula". Sao duas figuras e o modelo so
--   tinha uma.
--   ⚠ NAO E' ORGANIZACAO, E' APURACAO. No LCDPR e no Lucro Rural vale o EMITENTE. Sem o
--   campo, a apuracao puxaria o nome do intermediario — erro que so apareceria na
--   entrega da declaracao.
--   NULL e' o caso COMUM: emitente igual a contraparte nao se repete aqui. A coluna
--   existe para quando DIVERGE, e o consumidor le `COALESCE(emitente_id, contraparte_id)`.
--   `emitente_nome`/`emitente_documento` sao SNAPSHOT, como
--   `lancamentos.fornecedor_nome_snapshot`: ficam MESMO havendo `emitente_id`, porque a
--   nota guarda quem emitiu NAQUELE dia e renomear o cadastro nao reescreve o passado.
--
-- ── 2. A ESPECIE 'recibo' ────────────────────────────────────────────────────
--   Compra de animais vem com NF ou RECIBO. O CHECK tinha nf_principal, nf_complementar
--   e 'outro'. Deixar recibo em 'outro' faria o BALDE DO DESCONHECIDO virar maioria —
--   e 'outro' so informa enquanto for excecao. Custou uma linha, com a tabela vazia.
--
-- ── 3. O BUCKET ──────────────────────────────────────────────────────────────
--   ⚠ O PADRAO DAS MIGRATIONS ANTIGAS NAO FOI SEGUIDO, de proposito. `kml-files` e
--   `abate-anexos` liberam por `bucket_id = X AND authenticated`, SEM isolamento por
--   cliente — qualquer autenticado de qualquer tenant leria arquivo de qualquer outro,
--   e `abate-anexos` ainda e' `public = true`. Copiar reproduziria buraco cross-tenant,
--   mesma familia de SEC-VIEWS-TENANT-01B. Nota fiscal e' dado de cliente.
--
--   Aqui o `cliente_id` e' a PRIMEIRA PASTA do caminho:
--       {cliente_id}/{operacao_id}/{documento_id}.{ext}
--   e a politica compara essa pasta com `get_user_cliente_ids`.
--   ⚠ Comparacao como TEXTO, sem cast para uuid: caminho malformado deve NEGAR acesso,
--   nao estourar erro de cast dentro da policy.
--
--   ⚠ NENHUMA POLITICA DE DELETE PARA O USUARIO COMUM, de proposito. Documento se
--   cancela por `oc_documento_cancelar` (logico, com motivo e auditoria); apagar o
--   arquivo por baixo deixaria a linha apontando para o nada. A quarta politica
--   (`oc_doc_admin`, `FOR ALL`) alcanca delete para ADMIN — para manutencao, nao como
--   caminho de uso: nenhuma tela oferece apagar arquivo, e a regra de produto continua
--   sendo o cancelamento logico.
--
--   10 MB: DANFE em PDF fica em centenas de KB, mas RECIBO fotografado por celular passa
--   de 5 MB com facilidade. O limite existe contra abuso, nao contra o uso normal —
--   apertar demais faz o operador desistir de anexar.
--
--   Aplicado no PROTO (binbcdfbisgscrifztia). NAO aplicar em producao.

-- ═══ 1. COLUNAS DO EMITENTE ═══════════════════════════════════════════════════
ALTER TABLE public.zoo_operacao_documentos
  ADD COLUMN IF NOT EXISTS emitente_id        uuid REFERENCES public.financeiro_fornecedores(id),
  ADD COLUMN IF NOT EXISTS emitente_nome      text,
  ADD COLUMN IF NOT EXISTS emitente_documento text;

COMMENT ON COLUMN public.zoo_operacao_documentos.emitente_id IS
  'PR-OC-DOCUMENTOS-01: quem EMITIU a nota, quando difere da contraparte da operacao (intermediacao). NULL = emitente e a propria contraparte. LCDPR/Lucro Rural usam o emitente.';
COMMENT ON COLUMN public.zoo_operacao_documentos.emitente_nome IS
  'Snapshot do nome do emitente no ato, como lancamentos.fornecedor_nome_snapshot. Fica mesmo havendo emitente_id: renomear o cadastro nao reescreve a nota.';
COMMENT ON COLUMN public.zoo_operacao_documentos.emitente_documento IS
  'CNPJ/CPF impresso na nota. Snapshot, pelo mesmo motivo do nome.';

CREATE INDEX IF NOT EXISTS idx_zoo_oc_doc_emitente
  ON public.zoo_operacao_documentos (emitente_id)
  WHERE emitente_id IS NOT NULL;

-- ═══ 2. ESPECIE 'recibo' ══════════════════════════════════════════════════════
ALTER TABLE public.zoo_operacao_documentos
  DROP CONSTRAINT IF EXISTS zoo_operacao_documentos_especie_check;
ALTER TABLE public.zoo_operacao_documentos
  ADD CONSTRAINT zoo_operacao_documentos_especie_check
  CHECK (especie = ANY (ARRAY['nf_principal'::text, 'nf_complementar'::text, 'recibo'::text, 'outro'::text]));

-- ═══ 3. REGISTRAR ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.oc_documento_registrar(
  p_operacao_id uuid,
  p_cliente_id  uuid,
  p_payload     jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_id uuid;
  v_especie text := COALESCE(NULLIF(p_payload->>'especie',''), 'outro');
  v_origem uuid := NULLIF(p_payload->>'documento_origem_id','')::uuid;
  v_nome text;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id=p_operacao_id AND cliente_id=p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE='P0001'; END IF;
  IF v_especie NOT IN ('nf_principal','nf_complementar','recibo','outro') THEN
    RAISE EXCEPTION 'Especie invalida: %', v_especie USING ERRCODE='P0001'; END IF;

  IF v_especie = 'nf_complementar' THEN
    IF v_origem IS NULL THEN RAISE EXCEPTION 'Complementar exige documento_origem_id' USING ERRCODE='P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_documentos d
                    WHERE d.id=v_origem AND d.operacao_id=p_operacao_id AND d.cliente_id=p_cliente_id AND d.cancelado=false) THEN
      RAISE EXCEPTION 'Documento de origem % invalido/cancelado/alheio', v_origem USING ERRCODE='P0002'; END IF;
  ELSIF v_origem IS NOT NULL THEN
    RAISE EXCEPTION 'documento_origem_id so e permitido em nf_complementar' USING ERRCODE='P0001';
  END IF;

  v_nome := COALESCE(NULLIF(p_payload->>'nome',''), v_especie || COALESCE(' ' || NULLIF(p_payload->>'numero',''), ''));

  INSERT INTO public.zoo_operacao_documentos (
    cliente_id, operacao_id, nome, tipo, url, especie, numero, serie, chave_acesso, data_emissao,
    documento_origem_id, observacao, uploaded_em, uploaded_por, versao,
    emitente_id, emitente_nome, emitente_documento)
  VALUES (
    p_cliente_id, p_operacao_id, v_nome, NULLIF(p_payload->>'tipo',''), NULLIF(p_payload->>'url',''),
    v_especie, NULLIF(p_payload->>'numero',''), NULLIF(p_payload->>'serie',''), NULLIF(p_payload->>'chave_acesso',''),
    NULLIF(p_payload->>'data_emissao','')::date, v_origem, NULLIF(p_payload->>'observacao',''), now(), v_actor, 1,
    NULLIF(p_payload->>'emitente_id','')::uuid, NULLIF(p_payload->>'emitente_nome',''), NULLIF(p_payload->>'emitente_documento',''))
  RETURNING id INTO v_id;

  PERFORM public._oc_documento_aplicar(v_id, p_operacao_id, p_cliente_id, v_actor,
                                       p_payload->'componentes', p_payload->'lotes');

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'documento_registrar',
          jsonb_build_object('documento_id', v_id, 'especie', v_especie), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'documento_id', v_id, 'especie', v_especie, 'versao', 1);
END;
$$;

-- ═══ 4. EDITAR ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.oc_documento_editar(
  p_documento_id    uuid,
  p_cliente_id      uuid,
  p_versao_esperada integer,
  p_payload         jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_doc public.zoo_operacao_documentos;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;
  SELECT * INTO v_doc FROM public.zoo_operacao_documentos WHERE id=p_documento_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento % nao encontrado', p_documento_id USING ERRCODE='P0002'; END IF;
  IF v_doc.cancelado THEN RAISE EXCEPTION 'Documento cancelado nao pode ser editado' USING ERRCODE='P0001'; END IF;
  IF v_doc.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_doc.versao USING ERRCODE='40001'; END IF;

  UPDATE public.zoo_operacao_documentos SET
    numero       = CASE WHEN p_payload ? 'numero' THEN NULLIF(p_payload->>'numero','') ELSE numero END,
    serie        = CASE WHEN p_payload ? 'serie' THEN NULLIF(p_payload->>'serie','') ELSE serie END,
    chave_acesso = CASE WHEN p_payload ? 'chave_acesso' THEN NULLIF(p_payload->>'chave_acesso','') ELSE chave_acesso END,
    data_emissao = CASE WHEN p_payload ? 'data_emissao' THEN NULLIF(p_payload->>'data_emissao','')::date ELSE data_emissao END,
    url          = CASE WHEN p_payload ? 'url' THEN NULLIF(p_payload->>'url','') ELSE url END,
    observacao   = CASE WHEN p_payload ? 'observacao' THEN NULLIF(p_payload->>'observacao','') ELSE observacao END,
    emitente_id  = CASE WHEN p_payload ? 'emitente_id' THEN NULLIF(p_payload->>'emitente_id','')::uuid ELSE emitente_id END,
    emitente_nome = CASE WHEN p_payload ? 'emitente_nome' THEN NULLIF(p_payload->>'emitente_nome','') ELSE emitente_nome END,
    emitente_documento = CASE WHEN p_payload ? 'emitente_documento' THEN NULLIF(p_payload->>'emitente_documento','') ELSE emitente_documento END,
    versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_documento_id;

  IF (p_payload ? 'componentes') OR (p_payload ? 'lotes') THEN
    PERFORM public._oc_documento_aplicar(p_documento_id, v_doc.operacao_id, p_cliente_id, v_actor,
                                         COALESCE(p_payload->'componentes','[]'::jsonb),
                                         COALESCE(p_payload->'lotes','[]'::jsonb));
  END IF;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, v_doc.operacao_id, 'documento_editar', jsonb_build_object('documento_id', p_documento_id), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'documento_id', p_documento_id, 'versao', v_doc.versao + 1);
END;
$$;

-- ═══ 5. BUCKET PRIVADO + RLS POR CLIENTE ══════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('oc-documentos', 'oc-documentos', false, 10485760,
        ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "oc_doc_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'oc-documentos'
    AND (storage.foldername(name))[1] IN (SELECT (public.get_user_cliente_ids(auth.uid()))::text)
  );

CREATE POLICY "oc_doc_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'oc-documentos'
    AND (storage.foldername(name))[1] IN (SELECT (public.get_user_cliente_ids(auth.uid()))::text)
  );

-- UPDATE existe para o re-envio do MESMO arquivo (upsert), nao para trocar de dono.
CREATE POLICY "oc_doc_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'oc-documentos'
    AND (storage.foldername(name))[1] IN (SELECT (public.get_user_cliente_ids(auth.uid()))::text)
  );

/* ADMIN — resolve uma ASSIMETRIA MEDIDA entre as RPCs e o Storage.
   As tres RPCs de documento deixam o admin passar (`is_admin_agroinblue OR ...`); as
   politicas acima, nao. Resultado: o admin veria a LINHA do documento e nao conseguiria
   ABRIR o PDF — a tela mostraria um anexo que nao abre.
   MEDIDO no proto: o unico admin real (atendimento@agroinblue.com.br) tem 3 vinculos
   ativos e ha 7 clientes. Em Agnaldo, Raul, RRCC e Vera ele cairia exatamente nesse
   buraco.
   ⚠ A CAUSA DE FUNDO NAO E' ESTA POLITICA. Quem "tem" vinculo naqueles quatro clientes
   e' o usuario fantasma 2290944b, que nao existe em `auth.users` — 6 dos 9 registros de
   `cliente_membros` sao orfaos. Esta politica trata o SINTOMA; a auditoria dos membros
   continua na fila, registrada.
   ⚠ E' `FOR ALL`, entao inclui DELETE para admin — e isso NAO muda a regra de produto:
   documento se CANCELA por `oc_documento_cancelar`, com motivo e auditoria, e nenhuma
   tela oferece apagar arquivo. A politica existe para manutencao, nao para virar
   caminho de uso. Quem ler o `FOR ALL` e concluir que apagar e' valido esta lendo a
   permissao, nao a regra. */
CREATE POLICY "oc_doc_admin" ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'oc-documentos' AND public.is_admin_agroinblue(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'oc-documentos' AND public.is_admin_agroinblue(auth.uid())
  );
