-- FECH-ROTACAO-01 · GRUPO DE PASTEJO · FATIA 2 (cadastro do grupo) · Code 1
-- O grupo se monta com pastos que JÁ existem; o pasto não muda de nome (decisão 6). Um escritor só, como a casa:
--   fn_pasto_grupo_salvar  — criar / renomear / pôr e tirar pastos / reativar; p_simular (padrão true) = a prévia, nada gravado;
--   fn_pasto_grupo_desativar — o grupo fica inativo e solta os pastos (a trilha guarda quem estava, para voltar).
-- Trilha em audit_log (o antes e o depois: nome, pastos, área). As duas nascem fechadas (sem PUBLIC/anon).
-- Escrita direta fecha: pasto_grupos perde INSERT/UPDATE/DELETE do authenticated, e pastos.grupo_id só muda pelo escritor
-- (gatilho de guarda; o cadastro do pasto continua gravando o resto da linha direto, como hoje).
-- Nada disto muda número: a lotação (fn_lotacao_do_mes) lê alocações, não o grupo.
set local lock_timeout = '2s';

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pasto_grupos FROM authenticated;

-- O grupo do pasto muda só pelo escritor (que liga a marca da transação).
CREATE FUNCTION public.fn_pastos_grupo_so_pelo_escritor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.grupo_id IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.grupo_id END)
     AND coalesce(current_setting('app.pasto_grupo_escritor', true), '') <> '1' THEN
    RAISE EXCEPTION 'O grupo de pastejo do pasto muda só em "Grupos de pastejo". Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_pastos_grupo_so_pelo_escritor
  BEFORE INSERT OR UPDATE OF grupo_id ON public.pastos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pastos_grupo_so_pelo_escritor();

-- Os pastos de um grupo, como a trilha e a prévia os mostram.
CREATE FUNCTION public._fn_pasto_grupo_membros(p_grupo_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'area_ha', p.area_produtiva_ha) ORDER BY p.nome), '[]'::jsonb)
    FROM public.pastos p WHERE p.grupo_id = p_grupo_id
$function$;
REVOKE ALL ON FUNCTION public._fn_pasto_grupo_membros(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_pasto_grupo_salvar(p_grupo_id uuid, p_fazenda_id uuid, p_nome text, p_pasto_ids uuid[],
                                             p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  f        public.fazendas;
  g        public.pasto_grupos;
  v_nome   text := btrim(coalesce(p_nome, ''));
  v_ids    uuid[];
  v_frase  text;
  v_outro  text;
  v_antes  jsonb := '[]'::jsonb;
  v_depois jsonb;
  v_entram jsonb;
  v_saem   jsonb;
  v_area   numeric;
  v_log    uuid;
  v_reativa boolean := false;
  v_nome_antes text;
BEGIN
  IF p_grupo_id IS NOT NULL THEN
    SELECT * INTO g FROM public.pasto_grupos WHERE id = p_grupo_id FOR UPDATE;
    IF g.id IS NULL THEN
      RAISE EXCEPTION 'Este grupo não existe mais. Nada foi gravado.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  SELECT * INTO f FROM public.fazendas WHERE id = p_fazenda_id;
  IF f.id IS NULL OR NOT coalesce(public.tenant_ok(f.cliente_id), false) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta fazenda.' USING ERRCODE = '42501';
  END IF;
  IF g.id IS NOT NULL AND g.fazenda_id <> f.id THEN
    RAISE EXCEPTION 'O grupo é de outra fazenda. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF v_nome = '' THEN
    RAISE EXCEPTION 'Dê um nome ao grupo. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  SELECT x.nome INTO v_outro FROM public.pasto_grupos x
   WHERE x.fazenda_id = f.id AND lower(btrim(x.nome)) = lower(v_nome) AND x.id IS DISTINCT FROM g.id;
  IF v_outro IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe o grupo % nesta fazenda. Nada foi gravado.', v_outro USING ERRCODE = 'P0001';
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_pasto_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
  IF cardinality(v_ids) < 2 THEN
    RAISE EXCEPTION 'Um grupo precisa de pelo menos 2 pastos. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.pastos p ON p.id = x WHERE p.id IS NULL OR p.fazenda_id <> f.id) THEN
    RAISE EXCEPTION 'Só dá para usar pastos desta fazenda. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  SELECT p.nome INTO v_outro FROM unnest(v_ids) x JOIN public.pastos p ON p.id = x
   WHERE NOT coalesce(p.ativo, false) AND (g.id IS NULL OR p.grupo_id IS DISTINCT FROM g.id) ORDER BY p.nome LIMIT 1;
  IF v_outro IS NOT NULL THEN
    RAISE EXCEPTION 'O pasto % está inativo. Nada foi gravado.', v_outro USING ERRCODE = 'P0001';
  END IF;
  SELECT format('O pasto %s já está no grupo %s. Tire-o de lá antes. Nada foi gravado.', p.nome, o.nome) INTO v_frase
    FROM unnest(v_ids) x JOIN public.pastos p ON p.id = x JOIN public.pasto_grupos o ON o.id = p.grupo_id
   WHERE p.grupo_id IS DISTINCT FROM g.id ORDER BY p.nome LIMIT 1;
  IF v_frase IS NOT NULL THEN
    RAISE EXCEPTION '%', v_frase USING ERRCODE = 'P0001';
  END IF;

  IF g.id IS NOT NULL THEN v_antes := public._fn_pasto_grupo_membros(g.id); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'area_ha', p.area_produtiva_ha) ORDER BY p.nome), '[]'::jsonb),
         sum(p.area_produtiva_ha)
    INTO v_depois, v_area FROM public.pastos p WHERE p.id = ANY (v_ids);
  SELECT coalesce(jsonb_agg(e ORDER BY e->>'nome'), '[]'::jsonb) INTO v_entram
    FROM jsonb_array_elements(v_depois) e
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_antes) a WHERE a->>'id' = e->>'id');
  SELECT coalesce(jsonb_agg(e ORDER BY e->>'nome'), '[]'::jsonb) INTO v_saem
    FROM jsonb_array_elements(v_antes) e WHERE NOT (e->>'id')::uuid = ANY (v_ids);

  IF g.id IS NOT NULL AND g.ativo AND g.nome = v_nome AND jsonb_array_length(v_entram) = 0 AND jsonb_array_length(v_saem) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'sem_mudanca', true, 'grupo_id', g.id, 'nome', g.nome,
      'pastos', v_depois, 'area_ha', v_area, 'frase', format('O grupo %s já está assim.', g.nome));
  END IF;

  -- a área no jeito da tela (1.234,50): o to_char do banco sai em 1,234.50
  v_frase := format('%s %s: %s pastos, %s ha.',
    CASE WHEN g.id IS NULL THEN 'Cria o grupo' WHEN NOT g.ativo THEN 'Reativa o grupo' ELSE 'O grupo' END, v_nome, cardinality(v_ids),
    translate(to_char(coalesce(v_area, 0), 'FM999G999G990D00'), ',.', '.,'));
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'grupo_id', g.id, 'nome', v_nome, 'nome_antes', g.nome,
      'pastos', v_depois, 'entram', v_entram, 'saem', v_saem, 'area_ha', v_area, 'frase', v_frase);
  END IF;

  v_reativa := g.id IS NOT NULL AND NOT g.ativo;
  v_nome_antes := g.nome;
  PERFORM set_config('app.pasto_grupo_escritor', '1', true);
  IF g.id IS NULL THEN
    INSERT INTO public.pasto_grupos (cliente_id, fazenda_id, nome) VALUES (f.cliente_id, f.id, v_nome) RETURNING * INTO g;
  ELSE
    UPDATE public.pasto_grupos SET nome = v_nome, ativo = true, updated_at = now() WHERE id = g.id;
  END IF;
  UPDATE public.pastos SET grupo_id = NULL WHERE grupo_id = g.id AND NOT id = ANY (v_ids);
  UPDATE public.pastos SET grupo_id = g.id WHERE id = ANY (v_ids) AND grupo_id IS DISTINCT FROM g.id;
  PERFORM set_config('app.pasto_grupo_escritor', '', true);

  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  VALUES (f.cliente_id, f.id, auth.uid(), 'cadastros', CASE WHEN p_grupo_id IS NULL THEN 'criou' ELSE 'editou' END, 'pasto_grupos', g.id,
    v_frase,
    CASE WHEN p_grupo_id IS NULL THEN NULL ELSE jsonb_build_object('nome', v_nome_antes, 'ativo', NOT v_reativa, 'pastos', v_antes) END,
    jsonb_build_object('nome', v_nome, 'pastos', v_depois, 'area_ha', v_area))
  RETURNING id INTO v_log;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'grupo_id', g.id, 'nome', v_nome, 'pastos', v_depois,
    'entram', v_entram, 'saem', v_saem, 'area_ha', v_area, 'frase', v_frase, 'trilha_id', v_log);
END $function$;

CREATE FUNCTION public.fn_pasto_grupo_desativar(p_grupo_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  g       public.pasto_grupos;
  v_antes jsonb;
  v_frase text;
  v_log   uuid;
BEGIN
  SELECT * INTO g FROM public.pasto_grupos WHERE id = p_grupo_id FOR UPDATE;
  IF g.id IS NULL OR NOT coalesce(public.tenant_ok(g.cliente_id), false) THEN
    RAISE EXCEPTION 'Você não tem acesso a este grupo.' USING ERRCODE = '42501';
  END IF;
  IF NOT g.ativo THEN
    RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'sem_mudanca', true, 'frase', format('O grupo %s já está inativo.', g.nome));
  END IF;
  v_antes := public._fn_pasto_grupo_membros(g.id);
  v_frase := format('Desativa o grupo %s: %s pastos voltam a ficar sem grupo, com o mesmo nome e a mesma área.', g.nome, jsonb_array_length(v_antes));
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'grupo_id', g.id, 'nome', g.nome, 'saem', v_antes, 'frase', v_frase);
  END IF;
  PERFORM set_config('app.pasto_grupo_escritor', '1', true);
  UPDATE public.pastos SET grupo_id = NULL WHERE grupo_id = g.id;
  UPDATE public.pasto_grupos SET ativo = false, updated_at = now() WHERE id = g.id;
  PERFORM set_config('app.pasto_grupo_escritor', '', true);
  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  VALUES (g.cliente_id, g.fazenda_id, auth.uid(), 'cadastros', 'editou', 'pasto_grupos', g.id, v_frase,
    jsonb_build_object('nome', g.nome, 'ativo', true, 'pastos', v_antes), jsonb_build_object('nome', g.nome, 'ativo', false, 'pastos', '[]'::jsonb))
  RETURNING id INTO v_log;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'grupo_id', g.id, 'nome', g.nome, 'saem', v_antes, 'frase', v_frase, 'trilha_id', v_log);
END $function$;

REVOKE ALL ON FUNCTION public.fn_pasto_grupo_salvar(uuid, uuid, text, uuid[], boolean), public.fn_pasto_grupo_desativar(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pasto_grupo_salvar(uuid, uuid, text, uuid[], boolean), public.fn_pasto_grupo_desativar(uuid, boolean) TO authenticated;
