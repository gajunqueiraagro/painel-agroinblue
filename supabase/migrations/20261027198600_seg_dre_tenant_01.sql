-- SEG-DRE-TENANT-01 (Gabriel 15/10/2026) — guarda de cliente nas 7 leituras SECURITY DEFINER da familia do DRE.
-- Medido antes (FASE 0 / Passo 1, transacao revertida, usuario gestor so' do NJ): `fn_dre_pecuaria` da Vera devolvia 8.512 bytes,
-- `fn_dre_pecuaria_patrimonio` 2.867 e `fn_painel_rateio_detalhe` 72.723, com a leitura direta das tabelas da Vera em 0 linhas
-- (a RLS fecha; SECURITY DEFINER atravessa a RLS).
-- O que muda: SO' a guarda no inicio do corpo; o calculo fica byte a byte (tirando a guarda, volta o corpo antigo EXATO — conferido aqui).
--   plpgsql (4): logo depois do `begin`:
--     if not coalesce(public.tenant_ok(p_cliente), false) then raise exception 'acesso negado ao cliente' using errcode = '42501'; end if;
--   sql (3; LANGUAGE sql nao tem RAISE): primeira instrucao `select public._fn_exigir_tenant(p_cliente);` — a interna nova faz o
--     mesmo IF ... RAISE 42501; o corpo antigo vira a segunda (e ultima) instrucao, que da' o retorno. A linguagem nao muda.
-- Sem usuario logado `tenant_ok` e' falso: 42501. Admin do AGROinBLUE passa em qualquer cliente. Nenhum cron, view ou edge function
-- chama as 7; `fn_painel_safra` chama `fn_painel_safra_entrega` (o JWT do usuario segue valendo la' dentro).
-- Patch guardado por md5 (origem -> destino) em cada funcao; ancora `\nbegin\n` 1x nas plpgsql; assinatura, retorno, volatilidade,
-- SECURITY DEFINER e search_path preservados (o texto de `pg_get_functiondef` so' troca o corpo). ACL: REVOKE de PUBLIC e anon;
-- EXECUTE para authenticated e service_role.
--   fn_dre_pecuaria              4d9be6b0dd17407b18a4440392c0f608 -> d4f982af74f7dae403498d23aa185924
--   fn_dre_pecuaria_lancamentos  1bf56818d90eadc3b2e797234572be31 -> d4576910af99981e618c3d98fdd6524f
--   fn_dre_pecuaria_patrimonio   ab60f3887af8f2b16c2543cb6addcb3d -> 68558df0a488a2e28e64df1179574a62
--   fn_painel_rateio_detalhe     983ac728a260ea02c168731f1c497dd3 -> f6bda7a801d1c9e2f37e92922b1ed84a
--   fn_painel_safra              c02dbc7b68d3601f8b6abfd7b7858e85 -> 2b8d8149ed1dbf6ed9e455b3344e135f
--   fn_painel_safra_comparativo  4d143f2a73c7628296463abdef149b0b -> c5abd2eacc56a7182abb3bd127efb9fd
--   fn_painel_safra_entrega      cf7d1861cb42e7fcab2d990267205db3 -> c16e9283563959ebc4ad0ceae8461663
-- GESTO CONTRARIO (escrito, nao executado): o mesmo patch ao contrario — tirar a linha da guarda (plpgsql) ou o prefixo
--   `\nselect public._fn_exigir_tenant(p_cliente);` (sql), conferindo o md5 de origem acima.

SET LOCAL lock_timeout = '2s';

-- a interna da guarda para as funcoes LANGUAGE sql (nasce fechada: so' postgres e service_role; quem a chama e' o dono das 7)
CREATE OR REPLACE FUNCTION public._fn_exigir_tenant(p_cliente uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $f$
begin
  if not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception 'acesso negado ao cliente' using errcode = '42501';
  end if;
end
$f$;
REVOKE ALL ON FUNCTION public._fn_exigir_tenant(uuid) FROM PUBLIC, anon, authenticated;

DO $patch$
DECLARE
  c_alvos constant text[][] := ARRAY[
    ['fn_dre_pecuaria',             '4d9be6b0dd17407b18a4440392c0f608', 'd4f982af74f7dae403498d23aa185924'],
    ['fn_dre_pecuaria_lancamentos', '1bf56818d90eadc3b2e797234572be31', 'd4576910af99981e618c3d98fdd6524f'],
    ['fn_dre_pecuaria_patrimonio',  'ab60f3887af8f2b16c2543cb6addcb3d', '68558df0a488a2e28e64df1179574a62'],
    ['fn_painel_rateio_detalhe',    '983ac728a260ea02c168731f1c497dd3', 'f6bda7a801d1c9e2f37e92922b1ed84a'],
    ['fn_painel_safra',             'c02dbc7b68d3601f8b6abfd7b7858e85', '2b8d8149ed1dbf6ed9e455b3344e135f'],
    ['fn_painel_safra_comparativo', '4d143f2a73c7628296463abdef149b0b', 'c5abd2eacc56a7182abb3bd127efb9fd'],
    ['fn_painel_safra_entrega',     'cf7d1861cb42e7fcab2d990267205db3', 'c16e9283563959ebc4ad0ceae8461663']];
  c_guarda constant text := E'\nbegin\n  if not coalesce(public.tenant_ok(p_cliente), false) then raise exception ''acesso negado ao cliente'' using errcode = ''42501''; end if;\n';
  c_prefixo constant text := E'\nselect public._fn_exigir_tenant(p_cliente);';
  i int; v_oid oid; v_src text; v_lang text; v_novo text; v_def text; v_sec boolean; v_cfg text[];
BEGIN
  FOR i IN 1 .. array_length(c_alvos, 1) LOOP
    SELECT p.oid, p.prosrc, l.lanname, p.prosecdef, p.proconfig INTO v_oid, v_src, v_lang, v_sec, v_cfg
      FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = c_alvos[i][1];
    IF v_oid IS NULL THEN RAISE EXCEPTION 'SEG-DRE-TENANT-01: % nao existe. Nada foi gravado.', c_alvos[i][1]; END IF;
    IF md5(v_src) = c_alvos[i][3] THEN CONTINUE; END IF;   -- ja' aplicada: nada a fazer
    IF md5(v_src) IS DISTINCT FROM c_alvos[i][2] THEN
      RAISE EXCEPTION 'SEG-DRE-TENANT-01: corpo de % fora do estado medido (md5 %). Nada foi gravado.', c_alvos[i][1], md5(v_src); END IF;
    IF NOT v_sec THEN RAISE EXCEPTION 'SEG-DRE-TENANT-01: % nao e'' SECURITY DEFINER', c_alvos[i][1]; END IF;
    IF v_lang = 'plpgsql' THEN
      IF (SELECT count(*) FROM regexp_matches(v_src, E'\nbegin\n', 'g')) IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'SEG-DRE-TENANT-01: ancora begin de % nao casa 1x', c_alvos[i][1]; END IF;
      v_novo := replace(v_src, E'\nbegin\n', c_guarda);
    ELSIF v_lang = 'sql' THEN
      v_novo := c_prefixo || v_src;
    ELSE
      RAISE EXCEPTION 'SEG-DRE-TENANT-01: linguagem % inesperada em %', v_lang, c_alvos[i][1];
    END IF;
    IF md5(v_novo) IS DISTINCT FROM c_alvos[i][3] THEN
      RAISE EXCEPTION 'SEG-DRE-TENANT-01: destino de % diverge (md5 %)', c_alvos[i][1], md5(v_novo); END IF;
    v_def := pg_get_functiondef(v_oid);
    IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'SEG-DRE-TENANT-01: corpo de % nao aparece 1x na definicao', c_alvos[i][1]; END IF;
    EXECUTE replace(v_def, v_src, v_novo);
    -- conferencia: corpo, SECURITY DEFINER, search_path e o calculo (sem a guarda, o corpo antigo exato)
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM c_alvos[i][3]
       OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM true
       OR (SELECT proconfig FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
       OR md5((SELECT CASE WHEN v_lang = 'plpgsql' THEN replace(prosrc, c_guarda, E'\nbegin\n')
                           ELSE substr(prosrc, length(c_prefixo) + 1) END FROM pg_proc WHERE oid = v_oid)) IS DISTINCT FROM c_alvos[i][2] THEN
      RAISE EXCEPTION 'SEG-DRE-TENANT-01: conferencia de % falhou', c_alvos[i][1]; END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_oid::regprocedure);
    IF has_function_privilege('anon', v_oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'SEG-DRE-TENANT-01: ACL de % ', c_alvos[i][1]; END IF;
  END LOOP;
END
$patch$;
