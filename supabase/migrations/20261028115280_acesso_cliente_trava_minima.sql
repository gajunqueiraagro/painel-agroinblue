-- ACESSO-CLIENTE-TRAVA-01 (FASE 0 TRILHA E REVERSÃO, Gabriel 03/11 07:55 — o NJ entra hoje: Amanda lança; Júnior e Fernanda só veem).
-- O MÍNIMO para hoje, no banco (a tela não é permissão: "visibilidade não é permissão; quem permite é o banco"):
--   (1) QUEM SÓ VÊ NÃO GRAVA: as policies de escrita olham só o tenant (`tenant_ok`), nunca `cliente_membros.perfil`; um usuário com perfil
--       `leitura` gravava e apagava tudo pela API. Gatilho de COMANDO (barato: 1 consulta por comando) em toda tabela do cliente em que
--       `authenticated` escreve: usuário logado, não admin, cujas participações ativas são TODAS `leitura` → 42501. Vale também dentro das RPCs
--       (o `auth.uid()` é o mesmo). Rotina sem usuário (cron, migration) passa. Granularidade fina (leitura num cliente, gestor em outro) é a
--       frente do Code 6 (permissões): aqui, quem tem QUALQUER participação que lança, lança.
--   (2) APAGAR DE VERDADE SÓ PELA EQUIPE: BEFORE DELETE nas tabelas sem volta (pastos, polígonos, cadastro da fazenda, contas e saldos
--       bancários, condição de pasto, financiamento, partes da OC) — passa o dono das funções (os escritores SECURITY DEFINER, que têm trilha e
--       desfazer) e o admin AgroinBlue; o resto (API direta, função INVOKER como o "Atualizar/Remover mapa") recusa com a frase pronta.
--   (3) TRILHA onde não havia: `pastos`, `fazenda_cadastros`, `financeiro_saldos_bancarios_v2`, `financeiro_recorrencias` → `audit_log`
--       (quem, quando, antes e depois), a mesma forma do `_fn_trilha_registro`, com o módulo certo.
CREATE OR REPLACE FUNCTION public._fn_leitura_nao_grava()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.is_admin_agroinblue(v_uid) THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.cliente_membros m WHERE m.user_id = v_uid AND m.ativo AND m.perfil = 'leitura')
     AND NOT EXISTS (SELECT 1 FROM public.cliente_membros m WHERE m.user_id = v_uid AND m.ativo AND m.perfil <> 'leitura') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Seu acesso é só de leitura: nada foi gravado.';
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public._fn_leitura_nao_grava() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._fn_apagar_so_pela_equipe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  /* INVOKER de propósito: o `current_user` é o de quem rodou o DELETE — dentro de um escritor SECURITY DEFINER é o dono (passa); pela API
     é `authenticated` (recusa, salvo admin). O `current_setting('role')` NÃO serve: ele segue 'authenticated' dentro do DEFINER. */
  IF current_user <> 'authenticated' OR public.is_admin_agroinblue(auth.uid()) THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE = '42501',
    MESSAGE = format('Apagar de vez (%s) é só pela equipe AgroinBlue: use desativar/cancelar na tela ou fale com o suporte. Nada foi apagado.', TG_TABLE_NAME);
END $function$;
REVOKE ALL ON FUNCTION public._fn_apagar_so_pela_equipe() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._fn_trilha_cadastro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_row jsonb := to_jsonb(COALESCE(NEW, OLD));
  v_cli uuid := (v_row->>'cliente_id')::uuid;
  v_motivo text := NULLIF(current_setting('app.motivo', true), '');
BEGIN
  IF v_cli IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN RETURN NEW; END IF;
  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  VALUES (v_cli, (v_row->>'fazenda_id')::uuid, auth.uid(), TG_ARGV[0],
          CASE TG_OP WHEN 'INSERT' THEN 'criou' WHEN 'DELETE' THEN 'excluiu' ELSE 'editou' END, TG_TABLE_NAME, (v_row->>'id')::uuid,
          CASE WHEN v_motivo IS NOT NULL THEN 'motivo: ' || v_motivo END,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $function$;
REVOKE ALL ON FUNCTION public._fn_trilha_cadastro() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t record;
BEGIN
  /* (1) toda tabela do cliente (com cliente_id ou fazenda_id) em que `authenticated` escreve */
  FOR t IN
    SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname IN ('cliente_id', 'fazenda_id') AND NOT a.attisdropped)
       AND (has_table_privilege('authenticated', c.oid, 'INSERT') OR has_table_privilege('authenticated', c.oid, 'UPDATE')
            OR has_table_privilege('authenticated', c.oid, 'DELETE'))
       /* fora: cache, rascunho e sessão — a tela que SÓ LÊ pode refazer o cache com o login de quem vê (ex.: `zoot_mensal_cache`) */
       AND c.relname !~ '(cache|staging|sessao|_aux$)'
     ORDER BY c.relname
  LOOP
    EXECUTE format('CREATE TRIGGER trg_leitura_nao_grava BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public._fn_leitura_nao_grava()', t.relname);
  END LOOP;
  /* (2) as tabelas sem volta */
  FOR t IN SELECT unnest(ARRAY['pastos', 'fazenda_geometrias', 'fazenda_cadastros', 'financeiro_contas_bancarias', 'financeiro_saldos_bancarios_v2',
                                'pasto_condicoes', 'financiamentos', 'financiamento_parcelas', 'zoo_operacao_partes', 'zoo_operacao_movimentacoes',
                                'zoo_operacao_documentos', 'zoo_operacao_compromissos', 'zoo_operacao_parcelas_programacao', 'zoo_operacao_programacoes']) AS relname
  LOOP
    EXECUTE format('CREATE TRIGGER trg_apagar_so_pela_equipe BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._fn_apagar_so_pela_equipe()', t.relname);
  END LOOP;
  /* (3) a trilha que faltava */
  FOR t IN SELECT * FROM (VALUES ('pastos', 'cadastros'), ('fazenda_cadastros', 'cadastros'), ('financeiro_saldos_bancarios_v2', 'financeiro'),
                                 ('financeiro_recorrencias', 'financeiro')) v(relname, modulo)
  LOOP
    EXECUTE format('CREATE TRIGGER trg_trilha_cadastro AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._fn_trilha_cadastro(%L)', t.relname, t.modulo);
  END LOOP;
END $$;
