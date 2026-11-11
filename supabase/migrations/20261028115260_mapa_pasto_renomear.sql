-- MAPA-PIQUETES-MANUAL-01 (3) (Gabriel 03/11 06:22: "renomear piquete inline na lista e no painel (✎), gravando no cadastro, com trilha").
--   * `fn_pasto_renomear(pasto, nome, simular)`: o nome do PASTO no cadastro e, no mesmo gesto, o nome do(s) polígono(s) ligado(s) a ele
--     (a lista da Validação mostra o nome do polígono: os dois ficam iguais). Trilha em `audit_log` (cadastros · pasto_renomear) com o antes.
--   * Recusas (frase pronta, nada gravado): nome vazio; mais de 120 letras; o mesmo nome de outro pasto da fazenda (ativo ou não, sem
--     acento/caixa — a régua do `fn_mapa_pasto_criar` e do import). Nome igual ao de hoje = nada a gravar (a prévia diz).
--   * A prévia é o próprio gesto feito e desfeito (ZP001). Nasce fechada (FUNCAO NOVA NASCE FECHADA): tenant_ok pelo cliente do pasto (42501).
CREATE OR REPLACE FUNCTION public.fn_pasto_renomear(p_pasto uuid, p_nome text, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  p public.pastos;
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_outro text; v_polis jsonb; v_log uuid; v_res jsonb;
BEGIN
  SELECT * INTO p FROM public.pastos WHERE id = p_pasto;
  IF p.id IS NULL OR NOT coalesce(public.tenant_ok(p.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  IF v_nome = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Dê um nome ao pasto. Nada foi gravado.';
  END IF;
  IF length(v_nome) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'O nome passa de 120 letras. Nada foi gravado.';
  END IF;
  SELECT x.nome INTO v_outro FROM public.pastos x
   WHERE x.fazenda_id = p.fazenda_id AND x.id <> p.id AND public._fn_normalizar_texto(x.nome) = public._fn_normalizar_texto(v_nome)
   LIMIT 1;
  IF v_outro IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Já existe o pasto "%s" nesta fazenda: escolha outro nome. Nada foi gravado.', v_outro);
  END IF;
  IF v_nome = p.nome THEN
    RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'mudou', false, 'pasto', jsonb_build_object('id', p.id, 'nome', p.nome),
      'poligonos', '[]'::jsonb, 'frase', format('O nome de %s não mudou: nada a gravar.', p.nome));
  END IF;

  BEGIN
    UPDATE public.pastos SET nome = v_nome WHERE id = p.id;
    WITH m AS (
      UPDATE public.fazenda_geometrias g SET nome_original = v_nome
       WHERE g.pasto_id = p.id AND g.nome_original IS DISTINCT FROM v_nome
      RETURNING g.id, g.versao
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'versao', m.versao) ORDER BY m.id), '[]'::jsonb) INTO v_polis FROM m;

    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (p.cliente_id, p.fazenda_id, auth.uid(), 'cadastros', 'pasto_renomear', 'pastos', p.id,
            format('pasto %s renomeado para %s', p.nome, v_nome),
            jsonb_build_object('nome', p.nome),
            jsonb_build_object('nome', v_nome, 'poligonos', v_polis))
    RETURNING id INTO v_log;

    v_res := jsonb_build_object('ok', true, 'simulado', p_simular, 'mudou', true, 'trilha_id', v_log,
      'pasto', jsonb_build_object('id', p.id, 'nome_antes', p.nome, 'nome', v_nome), 'poligonos', v_polis,
      'frase', format('%s passa a se chamar %s (no cadastro e no mapa).', p.nome, v_nome));
    IF p_simular THEN
      RAISE EXCEPTION USING ERRCODE = 'ZP001', MESSAGE = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZP001' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_res;
END $function$;
REVOKE ALL ON FUNCTION public.fn_pasto_renomear(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pasto_renomear(uuid, text, boolean) TO authenticated;
