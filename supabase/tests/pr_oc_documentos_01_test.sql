-- PR-OC-DOCUMENTOS-01 — emitente do documento + registro em operacao fechada.
--   Requer aplicada: 20260903120000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
SELECT set_config('app.ocdoc_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_faz uuid;
  v_contraparte uuid; v_emitente uuid;
  v_op uuid; v_op_canc uuid;
  v_env jsonb; v_doc uuid; v_cnt int; v_erro text;
  v_e_id uuid; v_e_nome text; v_e_doc text;
BEGIN
  v_tag := current_setting('app.ocdoc_tag');

  /* ⚠ JOIN COM auth.users OBRIGATORIO — `cliente_membros` nao tem FK para `auth.users`
     e ha admin ativo apontando para usuario inexistente (medido no proto). */
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    JOIN auth.users u ON u.id = cm.user_id
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
   ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com usuario valido em auth.users'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  INSERT INTO public.fazendas (cliente_id, nome, codigo, owner_id)
    VALUES (v_cli, 'ZZ TESTE DOC '||v_tag, 'ZD'||left(v_tag,6), v_admin) RETURNING id INTO v_faz;

  /* DUAS figuras distintas, que e' o ponto do PR: quem negociou e quem emitiu. */
  INSERT INTO public.financeiro_fornecedores (cliente_id, nome)
    VALUES (v_cli, 'ZZ INTERMEDIARIO '||v_tag) RETURNING id INTO v_contraparte;
  INSERT INTO public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj)
    VALUES (v_cli, 'ZZ EMITENTE '||v_tag, '13825239000304') RETURNING id INTO v_emitente;

  /* Operacao FECHADA de proposito: o briefing pede a prova de que a RPC aceita —
     ela so recusa 'cancelada', e e' a TELA que bloqueia hoje (gate da FASE 2). */
  INSERT INTO public.zoo_operacoes_comerciais
    (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id,
     status_comercial, rascunho, versao)
  VALUES (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', v_contraparte, 'fechada', false, 1)
  RETURNING id INTO v_op;

  -- ===================== T1 — FECHADA aceita registro =====================
  v_env := public.oc_documento_registrar(v_op, v_cli, jsonb_build_object(
    'especie', 'nf_principal', 'numero', '12345', 'serie', '1',
    'data_emissao', '2026-05-11'));
  IF (v_env->>'ok') <> 'true' THEN RAISE EXCEPTION 'T1 FAIL: operacao fechada deveria aceitar: %', v_env; END IF;
  v_doc := (v_env->>'documento_id')::uuid;

  -- ===================== T2 — emitente AUSENTE grava NULL =====================
  SELECT emitente_id, emitente_nome, emitente_documento INTO v_e_id, v_e_nome, v_e_doc
    FROM public.zoo_operacao_documentos WHERE id = v_doc;
  IF v_e_id IS NOT NULL OR v_e_nome IS NOT NULL OR v_e_doc IS NOT NULL THEN
    RAISE EXCEPTION 'T2 FAIL: sem emitente no payload os tres campos deveriam ficar NULL (% / % / %)', v_e_id, v_e_nome, v_e_doc; END IF;

  -- ===================== T3 — emitente INFORMADO grava os tres =====================
  v_env := public.oc_documento_registrar(v_op, v_cli, jsonb_build_object(
    'especie', 'outro', 'numero', 'REC-001', 'data_emissao', '2026-05-12',
    'emitente_id', v_emitente::text,
    'emitente_nome', 'ZZ EMITENTE '||v_tag,
    'emitente_documento', '13.825.239/0003-04'));
  v_doc := (v_env->>'documento_id')::uuid;
  SELECT emitente_id, emitente_nome, emitente_documento INTO v_e_id, v_e_nome, v_e_doc
    FROM public.zoo_operacao_documentos WHERE id = v_doc;
  IF v_e_id IS DISTINCT FROM v_emitente THEN RAISE EXCEPTION 'T3 FAIL: emitente_id = % (esperado %)', v_e_id, v_emitente; END IF;
  IF v_e_nome <> 'ZZ EMITENTE '||v_tag THEN RAISE EXCEPTION 'T3 FAIL: snapshot do nome nao gravou (%)', v_e_nome; END IF;
  IF v_e_doc <> '13.825.239/0003-04' THEN RAISE EXCEPTION 'T3 FAIL: documento nao gravou (%)', v_e_doc; END IF;

  /* ⚠ O emitente e DIFERENTE da contraparte — e' a razao de a coluna existir.
     Se um dia alguem "simplificar" copiando a contraparte, este teste cai. */
  IF v_e_id = v_contraparte THEN RAISE EXCEPTION 'T3 FAIL: emitente nao pode ser a contraparte neste cenario'; END IF;

  -- ===================== T4 — editar troca so o que veio =====================
  v_env := public.oc_documento_editar(v_doc, v_cli, 1, jsonb_build_object('emitente_documento', '99.999.999/0001-99'));
  IF (v_env->>'ok') <> 'true' THEN RAISE EXCEPTION 'T4 FAIL: edicao recusada: %', v_env; END IF;
  SELECT emitente_id, emitente_nome, emitente_documento INTO v_e_id, v_e_nome, v_e_doc
    FROM public.zoo_operacao_documentos WHERE id = v_doc;
  IF v_e_doc <> '99.999.999/0001-99' THEN RAISE EXCEPTION 'T4 FAIL: documento nao atualizou (%)', v_e_doc; END IF;
  -- chave AUSENTE preserva, padrao das irmas
  IF v_e_id IS DISTINCT FROM v_emitente OR v_e_nome <> 'ZZ EMITENTE '||v_tag THEN
    RAISE EXCEPTION 'T4 FAIL: chave ausente do payload nao pode apagar o valor'; END IF;

  -- ===================== T5 — operacao CANCELADA recusa =====================
  INSERT INTO public.zoo_operacoes_comerciais
    (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id,
     status_comercial, rascunho, versao)
  VALUES (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', v_contraparte, 'cancelada', false, 1)
  RETURNING id INTO v_op_canc;
  BEGIN
    PERFORM public.oc_documento_registrar(v_op_canc, v_cli, jsonb_build_object('especie','outro'));
    RAISE EXCEPTION 'T5 FAIL: operacao cancelada deveria recusar';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    IF position('ancelada' in v_erro) = 0 THEN RAISE EXCEPTION 'T5 FAIL: mensagem inesperada: %', v_erro; END IF;
  END;

  -- ===================== T6 — o bucket existe e e PRIVADO =====================
  SELECT count(*) INTO v_cnt FROM storage.buckets
   WHERE id = 'oc-documentos' AND public = false AND file_size_limit = 10485760;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'T6 FAIL: bucket oc-documentos ausente, publico ou com limite errado'; END IF;

  /* ⚠ CADA POLITICA PELO NOME E PELO COMANDO, nao so a contagem.
     A contagem sozinha pega uma quinta politica, mas NAO pega alguem ALARGAR uma das
     quatro — trocar `oc_doc_select` de SELECT para ALL passaria batido e abriria
     delete. E alargar e' o caso MAIS provavel: quem mexe numa politica existente
     costuma estar apagando um incendio de permissao, sem pensar em delete.
     Nomes `oc_doc_*` (nao `oc_documentos_*`) e comandos conferidos no proto. */
  SELECT count(*) INTO v_cnt FROM (VALUES
    ('oc_doc_select', 'SELECT'),
    ('oc_doc_insert', 'INSERT'),
    ('oc_doc_update', 'UPDATE'),
    ('oc_doc_admin',  'ALL')
  ) AS esperado(nome, comando)
  WHERE EXISTS (
    SELECT 1 FROM pg_policies pol
     WHERE pol.schemaname='storage' AND pol.tablename='objects'
       AND pol.policyname = esperado.nome AND pol.cmd = esperado.comando
  );
  IF v_cnt <> 4 THEN
    RAISE EXCEPTION 'T6 FAIL: das 4 politicas esperadas (nome + comando), so % conferem. Alguem alargou, estreitou ou renomeou.', v_cnt; END IF;

  /* Nenhuma politica ALEM dessas quatro: uma quinta tambem tem de aparecer aqui. */
  SELECT count(*) INTO v_cnt FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'oc\_doc\_%';
  IF v_cnt <> 4 THEN RAISE EXCEPTION 'T6 FAIL: esperadas exatamente 4 politicas oc_doc_*, achou %', v_cnt; END IF;

  /* ⚠ A REGRA DE PRODUTO NAO MUDOU COM `oc_doc_admin`. Ela e' FOR ALL e portanto
     alcanca DELETE para admin, mas isso e' MANUTENCAO, nao caminho de uso: documento se
     cancela por `oc_documento_cancelar`, com motivo e auditoria, e nenhuma tela oferece
     apagar arquivo. Quem ler o FOR ALL e concluir que apagar virou valido esta lendo a
     permissao, nao a regra. */

  -- ===================== T7 — a especie 'recibo' e aceita =====================
  --   Compra de animais vem com NF ou RECIBO; sem a especie propria o recibo cairia em
  --   'outro' e o balde do desconhecido viraria maioria.
  v_env := public.oc_documento_registrar(v_op, v_cli, jsonb_build_object(
    'especie', 'recibo', 'numero', 'REC-777', 'data_emissao', '2026-05-13'));
  IF (v_env->>'especie') <> 'recibo' THEN RAISE EXCEPTION 'T7 FAIL: especie recibo nao gravou (%)', v_env->>'especie'; END IF;

  BEGIN
    PERFORM public.oc_documento_registrar(v_op, v_cli, jsonb_build_object('especie','inexistente'));
    RAISE EXCEPTION 'T7 FAIL: especie invalida deveria ser recusada';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;

  RAISE NOTICE 'PR-OC-DOCUMENTOS-01: T1..T7 PASS';
END $t$;

ROLLBACK;
