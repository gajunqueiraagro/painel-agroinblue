-- NOTA-FAZENDA-PELA-IE-01 (Gabriel 22/10/2026) — gravar a IE da FAZENDA pela nota: o destinatario da NF-e e' a fazenda do cliente, e a IE
-- dele identifica a fazenda nas proximas notas. A fonte e' `fazenda_cadastros.ie` (ja' existe; nao nasce segunda coluna).
-- `fn_fazenda_gravar_ie`: simula por padrao; so' grava IE VAZIA (a gravada diferente NUNCA e' sobrescrita: recusa com a frase); recusa a
-- IE que ja' e' de outra fazenda do cliente; cria a linha de `fazenda_cadastros` se a fazenda nao tem; trilha em `audit_log` (o antes, o
-- depois, a nota de onde veio). `fn_fazenda_gravar_ie_desfazer`: volta a IE a vazio se ela ainda e' a que a trilha gravou.
set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_fazenda_gravar_ie(p_fazenda_id uuid, p_ie text, p_referencia text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.fazendas; v_ie text := regexp_replace(coalesce(p_ie, ''), '\D', '', 'g'); v_hoje text; v_outra text; v_cad uuid; v_log uuid;
BEGIN
  SELECT * INTO f FROM public.fazendas WHERE id = p_fazenda_id;
  IF f.id IS NULL OR NOT coalesce(public.tenant_ok(f.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a esta fazenda.', DETAIL = coalesce(p_fazenda_id::text, '');
  END IF;
  IF length(v_ie) < 8 OR length(v_ie) > 14 THEN
    RAISE EXCEPTION USING MESSAGE = format('"%s" não parece uma inscrição estadual. Nada foi gravado.', coalesce(p_ie, '')), DETAIL = coalesce(p_fazenda_id::text, '');
  END IF;
  SELECT c.id, c.ie INTO v_cad, v_hoje FROM public.fazenda_cadastros c WHERE c.fazenda_id = f.id AND c.cliente_id = f.cliente_id;
  IF regexp_replace(coalesce(v_hoje, ''), '\D', '', 'g') = v_ie THEN
    RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_gravada', true, 'fazenda', f.nome, 'ie', v_hoje,
      'frase', format('%s já tem a IE %s.', f.nome, v_hoje));
  END IF;
  IF coalesce(btrim(v_hoje), '') <> '' THEN
    RAISE EXCEPTION USING MESSAGE = format('%s já tem a IE %s (a nota traz %s): a IE gravada não é trocada pela nota. Confira o cadastro da fazenda. Nada foi gravado.',
      f.nome, v_hoje, v_ie), DETAIL = coalesce(p_fazenda_id::text, '');
  END IF;
  SELECT z.nome INTO v_outra FROM public.fazenda_cadastros c JOIN public.fazendas z ON z.id = c.fazenda_id
   WHERE c.cliente_id = f.cliente_id AND c.fazenda_id <> f.id AND regexp_replace(coalesce(c.ie, ''), '\D', '', 'g') = v_ie LIMIT 1;
  IF v_outra IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = format('A IE %s já é de %s. Nada foi gravado.', v_ie, v_outra), DETAIL = coalesce(p_fazenda_id::text, '');
  END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'fazenda', f.nome, 'ie', v_ie,
      'frase', format('%s passa a ter a IE %s: as próximas notas com esta IE de destinatário já vêm com a fazenda.', f.nome, v_ie));
  END IF;
  IF v_cad IS NULL THEN
    INSERT INTO public.fazenda_cadastros (fazenda_id, cliente_id, ie) VALUES (f.id, f.cliente_id, v_ie) RETURNING id INTO v_cad;
  ELSE
    UPDATE public.fazenda_cadastros SET ie = v_ie, updated_at = now() WHERE id = v_cad;
  END IF;
  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  VALUES (f.cliente_id, f.id, auth.uid(), 'cadastros', 'editou', 'fazenda_cadastros', v_cad,
    format('%s | IE vazia → %s | pela nota %s', f.nome, v_ie, coalesce(p_referencia, '—')),
    jsonb_build_object('ie', v_hoje), jsonb_build_object('ie', v_ie, 'referencia', p_referencia))
  RETURNING id INTO v_log;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'fazenda', f.nome, 'ie', v_ie, 'trilha_id', v_log);
END $$;

CREATE OR REPLACE FUNCTION public.fn_fazenda_gravar_ie_desfazer(p_trilha_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.audit_log; c public.fazenda_cadastros;
BEGIN
  SELECT * INTO a FROM public.audit_log WHERE id = p_trilha_id AND tabela_origem = 'fazenda_cadastros';
  IF a.id IS NULL OR NOT coalesce(public.tenant_ok(a.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a esta alteração.', DETAIL = coalesce(p_trilha_id::text, '');
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION USING MESSAGE = 'Diga o motivo.', DETAIL = coalesce(p_trilha_id::text, ''); END IF;
  SELECT * INTO c FROM public.fazenda_cadastros WHERE id = a.registro_id;
  IF c.id IS NULL OR coalesce(c.ie, '') IS DISTINCT FROM coalesce(a.dados_novos->>'ie', '') THEN
    RAISE EXCEPTION USING MESSAGE = 'A IE da fazenda mudou depois desta gravação: nada foi desfeito.', DETAIL = coalesce(p_trilha_id::text, '');
  END IF;
  UPDATE public.fazenda_cadastros SET ie = NULL, updated_at = now() WHERE id = c.id;
  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  VALUES (a.cliente_id, a.fazenda_id, auth.uid(), 'cadastros', 'editou', 'fazenda_cadastros', c.id,
    format('IE %s desfeita | %s', c.ie, p_motivo), jsonb_build_object('ie', c.ie), jsonb_build_object('ie', NULL, 'desfaz', p_trilha_id));
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.fn_fazenda_gravar_ie(uuid, text, text, boolean), public.fn_fazenda_gravar_ie_desfazer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fazenda_gravar_ie(uuid, text, text, boolean), public.fn_fazenda_gravar_ie_desfazer(uuid, text) TO authenticated;
