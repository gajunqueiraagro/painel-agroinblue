-- DRE-FECH-INVALIDADO-01 — o DRE e o modal da Variacao so' leem item de fechamento VALIDADO.
--
-- CASO: Faz Baia Grande, set/26. O fechamento foi reaberto em 01/11 (valor_rebanho_fechamento.status = 'aberto',
-- valor_rebanho_realizado_validado.status = 'invalidado'), os 9 itens ficaram em valor_rebanho_fechamento_itens e a
-- fn_dre_pecuaria os lia como foto do mes (p0f/p1f sem status). No proto inteiro e' o unico caso (663 fechados = 663 validados).
--
-- REGRA (Gabriel 05/11 10:11 e 10:31, D1/D2):
--   1. Item de fechamento so' vale com valor_rebanho_realizado_validado.status = 'validado' na mesma fazenda e mes — a regra que o
--      ramo da META da fn_dre_pecuaria ja' usava (v_ini, tem_fech_p0, tem_gado). Uma regra so' nos dois ramos e no modal.
--   2. Ponta sem fechamento validado = cadastro (zoot_mensal_cache), como ja' era, ao PRECO DO ULTIMO FECHAMENTO VALIDADO ate' p_de
--      (por fazenda x categoria). Antes era o preco do fechamento de p_de: sem ele o preco ficava nulo e o rebanho valia ZERO (o
--      filtro sozinho zerava out/26 da BG: -206.180,94 -> 0,00 no ensaio). O selo "fim pelo cadastro" e' p1_fonte = 'cadastro'.
--   3. O P1 do cadastro segue SEM preco proprio (mercado 0 pela regra de hoje; o modal mostra "—", D3). O DRE nao muda fora disso.
--   4. fn_dre_pecuaria_patrimonio (o modal) leva as MESMAS trocas (D2) e os precos dos movimentos (prcf/prcc) tambem so' do validado.
--
-- O QUE NAO MUDA: fn_rateio_admin_mes e fn_zoot_cache_buracos (usam os itens so' para saber se o mes existe). A grade continua
-- somando as mesmas chaves; nenhum nome de chave muda.
--
-- METODO: patch guardado por md5 do prosrc (origem; cada ancora exatamente 1x; destino calculado no banco com a mesma cadeia).
--   fn_dre_pecuaria             md5 prosrc ANTES 902d4207f4380f8f6620ec7c9af47869  DEPOIS 1e4f59861462a95d391b985d8752cedc
--   fn_dre_pecuaria_patrimonio  md5 prosrc ANTES 68558df0a488a2e28e64df1179574a62  DEPOIS 1b64aee80105219a78e0f10e0e126bef
-- ENSAIO (05/11, a migration inteira numa transacao que termina em RAISE; nada ficou): 6 clientes, 114 janelas (DRE + modal), 19
--   diferentes — BG set/26 e out/26 (realizado e modal), BG jan->set, BG meta out/26, e o MES CORRENTE (nov/26) de todos os clientes,
--   cujo rebanho no modal valia 0,00 (sem fechamento em out/26 o preco vinha de nov). O resto igual, inclusive 2020-01, 2022-06 e 2025.
-- ACL refeita igual a' medida: {postgres, service_role, authenticated}; SECURITY DEFINER, STABLE, search_path pg_catalog, public.

do $mig$
declare
  v_antes text; v_novo text; i int;
  /* o filtro do validado, para tabela sem apelido e com os apelidos usados nas funcoes */
  ok_t text := $o$ and exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=valor_rebanho_fechamento_itens.cliente_id and rv.fazenda_id=valor_rebanho_fechamento_itens.fazenda_id and rv.ano_mes=valor_rebanho_fechamento_itens.ano_mes and rv.status='validado')$o$;
  ok_fi text := $o$ and exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=fi.cliente_id and rv.fazenda_id=fi.fazenda_id and rv.ano_mes=fi.ano_mes and rv.status='validado')$o$;
  ok_i text := $o$ and exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=i.cliente_id and rv.fazenda_id=i.fazenda_id and rv.ano_mes=i.ano_mes and rv.status='validado')$o$;
  a text[]; b text[];
begin
  ---------------------------------------------------------------------------------------------------- fn_dre_pecuaria
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria' and n.nspname = 'public';
  if md5(v_antes) <> '902d4207f4380f8f6620ec7c9af47869' then
    raise exception 'fn_dre_pecuaria nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  a := array[
    $a$from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=v_p0 and p_cenario='realizado'),$a$,
    $a$  pk_ini as (select fazenda_id, categoria, max(preco_kg) pk from valor_rebanho_fechamento_itens
             where cliente_id=p_cliente and ano_mes=p_de group by 1,2),$a$,
    $a$from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=p_ate and p_cenario='realizado'),$a$,
    $a$where cliente_id=p_cliente and ano_mes=v_p0 and p_cenario<>'realizado' group by 1,2),$a$,
    $a$where fi.cliente_id=p_cliente and fi.fazenda_id=f.id and fi.ano_mes=v_p0), 0) cab_ini,$a$];
  b := array[
    $b$from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=v_p0 and p_cenario='realizado'$b$||ok_t||'),',
    $b$  /* DRE-FECH-INVALIDADO-01: o preco da ponta pelo cadastro = o do ULTIMO fechamento VALIDADO ate' p_de (por fazenda x categoria);
     antes, o de p_de, e sem ele o rebanho valia zero */
  pk_ini as (select fazenda_id, categoria, max(preco_kg) pk from (
               select fazenda_id, categoria, ano_mes, preco_kg, max(ano_mes) over (partition by fazenda_id, categoria) ult
               from valor_rebanho_fechamento_itens
               where cliente_id=p_cliente and ano_mes<=p_de and preco_kg is not null$b$||ok_t||$b$) u
             where ano_mes=ult group by 1,2),$b$,
    $b$from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=p_ate and p_cenario='realizado'$b$||ok_t||'),',
    $b$where cliente_id=p_cliente and ano_mes=v_p0 and p_cenario<>'realizado'$b$||ok_t||' group by 1,2),',
    $b$where fi.cliente_id=p_cliente and fi.fazenda_id=f.id and fi.ano_mes=v_p0$b$||ok_fi||'), 0) cab_ini,'];
  v_novo := v_antes;
  for i in 1..array_length(a,1) loop
    if (length(v_novo) - length(replace(v_novo, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'fn_dre_pecuaria: a ancora % nao casa exatamente 1x. Migration abortada.', i; end if;
    v_novo := replace(v_novo, a[i], b[i]);
  end loop;
  execute 'CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text DEFAULT ''realizado''::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria' and n.nspname = 'public';
  if md5(v_antes) <> '1e4f59861462a95d391b985d8752cedc' then
    raise exception 'fn_dre_pecuaria: corpo resultante inesperado (md5 %). Esperado 1e4f59861462a95d391b985d8752cedc.', md5(v_antes); end if;
  -- a guarda de cliente (SEG-DRE-TENANT-01) segue no corpo: o patch nao toca a linha dela
  if position('if not coalesce(public.tenant_ok(p_cliente), false) then raise exception' in v_antes) = 0 then
    raise exception 'fn_dre_pecuaria perdeu a guarda de cliente (tenant_ok). Migration abortada.'; end if;

  ---------------------------------------------------------------------------------------------------- fn_dre_pecuaria_patrimonio
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria_patrimonio' and n.nspname = 'public';
  if md5(v_antes) <> '68558df0a488a2e28e64df1179574a62' then
    raise exception 'fn_dre_pecuaria_patrimonio nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  a := array[
    $a$where i.cliente_id=p_cliente and i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda)),$a$,
    $a$pk_ini as (select fazenda_id, categoria, max(preco_kg) pk from valor_rebanho_fechamento_itens
      where cliente_id=p_cliente and ano_mes=left(p_de,7) group by 1,2),$a$,
    $a$where i.cliente_id=p_cliente and i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda)),$a$,
    $a$where i.cliente_id=p_cliente and i.ano_mes <= per.p1 group by 1,2,3),$a$,
    $a$where i.cliente_id=p_cliente and i.ano_mes <= per.p1 group by 1,2),$a$];
  b := array[
    $b$where i.cliente_id=p_cliente and i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda)$b$||ok_i||'),',
    $b$/* DRE-FECH-INVALIDADO-01: a mesma regra da fn_dre_pecuaria — o ultimo fechamento VALIDADO ate' p_de */
pk_ini as (select fazenda_id, categoria, max(preco_kg) pk from (
        select fazenda_id, categoria, ano_mes, preco_kg, max(ano_mes) over (partition by fazenda_id, categoria) ult
        from valor_rebanho_fechamento_itens
        where cliente_id=p_cliente and ano_mes<=left(p_de,7) and preco_kg is not null$b$||ok_t||$b$) u
      where ano_mes=ult group by 1,2),$b$,
    $b$where i.cliente_id=p_cliente and i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda)$b$||ok_i||'),',
    $b$where i.cliente_id=p_cliente and i.ano_mes <= per.p1$b$||ok_i||' group by 1,2,3),',
    $b$where i.cliente_id=p_cliente and i.ano_mes <= per.p1$b$||ok_i||' group by 1,2),'];
  v_novo := v_antes;
  for i in 1..array_length(a,1) loop
    if (length(v_novo) - length(replace(v_novo, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'fn_dre_pecuaria_patrimonio: a ancora % nao casa exatamente 1x. Migration abortada.', i; end if;
    v_novo := replace(v_novo, a[i], b[i]);
  end loop;
  execute 'CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria_patrimonio' and n.nspname = 'public';
  if md5(v_antes) <> '1b64aee80105219a78e0f10e0e126bef' then
    raise exception 'fn_dre_pecuaria_patrimonio: corpo resultante inesperado (md5 %). Esperado 1b64aee80105219a78e0f10e0e126bef.', md5(v_antes); end if;
  -- a guarda de cliente (SEG-DRE-TENANT-01, LANGUAGE sql) segue como primeira instrucao
  if position('select public._fn_exigir_tenant(p_cliente);' in v_antes) = 0 then
    raise exception 'fn_dre_pecuaria_patrimonio perdeu a guarda de cliente (_fn_exigir_tenant). Migration abortada.'; end if;
end $mig$;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text) TO authenticated, service_role;
