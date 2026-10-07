-- PARC-LIVRES-01 (passo 5) — O NOME DA PARCELA E' "Descricao i/N", E TEM UM DONO (Gabriel, 06/10/2026).
--
-- `_fn_parcela_descricao(descricao, i, N)` passa a devolver `descricao || ' ' || i || '/' || N` ("Manutenção Cercas 2/3"); era
-- "Descricao - Parcela i/N". Quem a usa: `fn_parcelamento_cadastrar` (nos dois modos — antes montava o texto no proprio corpo) e
-- `fn_parcelamento_editar_parcelas` (parcela acrescentada).
-- Quando N muda na edicao, o "i/N" do nome acompanha por `_fn_parcela_renumerar(nome, i_antes, N_antes, i, N)`: troca SO' o
-- trecho "i_antes/N_antes" do FIM do nome (precedido de espaco ou sozinho) por "i/N" — vale para a forma nova e para a antiga
-- ("… - Parcela 2/3" vira "… - Parcela 2/4": o existente NAO e' renomeado, so' fica coerente); nome que nao termina nesse
-- trecho (editado a' mao) fica como esta'. Nas pagas so' esse trecho muda.
-- `fn_parcelas_dos_lancamentos(cliente)` (LEITURA, jsonb {lancamento_id: [numero, total]}): o "i/N" que a lista, a CPR e o PDF
-- mostram numa parte que nunca corta vem do CONTRATO (numero da parcela e total), so' de contrato de natureza 'parcelamento'
-- e de parcela viva. SECURITY DEFINER com `tenant_ok` e 42501; EXECUTE para `authenticated`.
-- NENHUM LANCAMENTO EXISTENTE E' RENOMEADO AQUI: renomear em massa e' script a' parte, com ensaio revertido e OK do Gabriel.
-- PATCH GUARDADO POR md5: cadastrar 7d9874b07474ca8a88df77cabc5706df -> a86837e1640a50c13e3a4a3708d3a5f8; editar parcelas 04ec64c31d729e6d720c0fca98f3e9d9 -> 1fbb077a5d14d3203f9fa6fe21e721ad.
-- Assinatura, retorno, SECURITY, search_path e ACL das duas nao mudam. As internas nascem fechadas.

CREATE OR REPLACE FUNCTION public._fn_parcela_descricao(p_descricao text, p_numero integer, p_total integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(p_descricao, '') || ' ' || p_numero::text || '/' || p_total::text
$function$;

CREATE OR REPLACE FUNCTION public._fn_parcela_renumerar(p_nome text, p_numero_antes integer, p_total_antes integer, p_numero integer, p_total integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(p_nome,
           '(^|\s)' || p_numero_antes::text || '/' || p_total_antes::text || '\s*$',
           '\1' || p_numero::text || '/' || p_total::text)
$function$;

CREATE OR REPLACE FUNCTION public.fn_parcelas_dos_lancamentos(p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return coalesce((
    select jsonb_object_agg(p.lancamento_id::text, jsonb_build_array(p.numero_parcela, f.total_parcelas))
      from public.financiamentos f
      join public.financiamento_parcelas p on p.financiamento_id = f.id
     where f.cliente_id = p_cliente_id and f.natureza = 'parcelamento'
       and p.lancamento_id is not null and coalesce(p.status, '') <> 'cancelado'
       and p.numero_parcela is not null and f.total_parcelas is not null
  ), '{}'::jsonb);
end
$function$;
REVOKE ALL ON FUNCTION public.fn_parcelas_dos_lancamentos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelas_dos_lancamentos(uuid) TO authenticated, service_role;

DO $mig$
DECLARE
  v_oid oid := 'public.fn_parcelamento_cadastrar(jsonb)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text[]; v_b text[];
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '7d9874b07474ca8a88df77cabc5706df' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 5 cadastrar: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  -- ancora 1
  v_a := v_a || $a1$       v_desc || ' - Parcela ' || i || '/' || v_n, v_comp, v_venc, null,
$a1$::text;
  v_b := v_b || $b1$       public._fn_parcela_descricao(v_desc, i, v_n), v_comp, v_venc, null,   -- PARC-LIVRES-01 passo 5: o nome tem um dono
$b1$::text;
  FOR i IN 1..array_length(v_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'PARC-LIVRES-01 5 cadastrar: a ancora % nao casa exatamente 1x', i;
    END IF;
    v_novo := replace(v_novo, v_a[i], v_b[i]);
  END LOOP;
  IF md5(v_novo) <> 'a86837e1640a50c13e3a4a3708d3a5f8' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 5 cadastrar: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_parcelamento_cadastrar(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> 'a86837e1640a50c13e3a4a3708d3a5f8' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 5 cadastrar: ACL, SECURITY DEFINER, configuracao ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;

DO $mig$
DECLARE
  v_oid oid := 'public.fn_parcelamento_editar_parcelas(uuid, jsonb, numeric)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text[]; v_b text[];
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '04ec64c31d729e6d720c0fca98f3e9d9' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 5 editar: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  -- ancora 1
  v_a := v_a || $a1$        -- o "i/N" do nome acompanha, so' quando o nome ainda e' o gerado
        v_desc := case when l.descricao = public._fn_parcela_descricao(f.descricao, p.numero_parcela, v_n_antes)
                       then public._fn_parcela_descricao(f.descricao, v_i, v_n) else l.descricao end;
$a1$::text;
  v_b := v_b || $b1$        -- PARC-LIVRES-01 passo 5: so' o trecho "i/N" do FIM do nome acompanha (qualquer forma: "Descricao 2/3" ou a antiga
        -- "Descricao - Parcela 2/3"); nome que nao termina no "i/N" de antes fica como esta'. O dono e' _fn_parcela_renumerar.
        v_desc := public._fn_parcela_renumerar(l.descricao, p.numero_parcela, v_n_antes, v_i, v_n);
$b1$::text;
  FOR i IN 1..array_length(v_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'PARC-LIVRES-01 5 editar: a ancora % nao casa exatamente 1x', i;
    END IF;
    v_novo := replace(v_novo, v_a[i], v_b[i]);
  END LOOP;
  IF md5(v_novo) <> '1fbb077a5d14d3203f9fa6fe21e721ad' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 5 editar: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_parcelamento_editar_parcelas(p_financiamento_id uuid, p_parcelas jsonb, p_valor_total numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> '1fbb077a5d14d3203f9fa6fe21e721ad' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 5 editar: ACL, SECURITY DEFINER, configuracao ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;
