-- ACESSOS-PERFIL-01 (Gabriel 20/10/2026), parte 2: a guarda do `resolver_nome_usuario`.
-- A 20261027204300 fez o resolver DELEGAR a' regra unica do nome (`_fn_nome_do_usuario`); ele e' SECURITY DEFINER e recebe um id,
-- e o detector `guardaDeClienteNasMigrations` (SEG-AGRI-TENANT-01) cobra guarda. Medido: o unico chamador e' `oc_salvar_rascunho`,
-- com `auth.uid()` (o snapshot do nome de quem salva). Guarda: com usuario logado, so' o PROPRIO nome — ou qualquer um para o admin
-- do AGROinBLUE; sem usuario (rotina), passa. O nome de OUTRA pessoa a tela le^ por `fn_nomes_dos_autores`, que tem a guarda do
-- cliente. ACL igual (postgres, service_role).
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.resolver_nome_usuario(p_user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin_agroinblue(auth.uid()) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(public._fn_nome_do_usuario(p_user_id), '(sem nome)');
END $$;
REVOKE ALL ON FUNCTION public.resolver_nome_usuario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_nome_usuario(uuid) TO service_role;
