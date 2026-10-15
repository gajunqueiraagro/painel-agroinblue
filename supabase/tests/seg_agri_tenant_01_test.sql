-- SEG-AGRI-TENANT-01 — guarda de cliente nas 27 funcoes SECURITY DEFINER da agricultura e da auditoria. Termina em RAISE 'OK'.
-- Compara com `is distinct from`. Transacao revertida: o que alguma chamada gravasse (se a guarda falhasse) nao fica.
--   T1 esquema: os 27 corpos no md5 de destino, SECURITY DEFINER, `anon` sem EXECUTE, `authenticated` com (menos as tres so'
--      service_role), a interna das linhas fechada
--   T2 usuario do NJ (nj@agroinblue.app, gestor so' do NJ) no NJ: as 10 leituras respondem, e o resultado = o do admin
--   T3 gestor do Agnaldo com dado do NJ: 42501 nas 27 (escritas e "so' id" inclusive; a guarda vem antes da regra de negocio);
--      as tres so' service_role tambem 42501 chamadas como o dono
--   T4 sem usuario (JWT sem `sub`): 42501 nas 27
--   T5 admin: as leituras respondem para a Vera e o Agnaldo; fornecedor de um cliente + fazenda de outro = 42501
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
SELECT set_config('e.ids', 'f2d67cd4-24d0-456f-a079-a3281dcce7fd,55d99920-add0-4091-b1a7-0b0ce3faaedb,7a14f96a-353a-4065-950c-2891d360dc2e,'
  || 'd3396cdd-7c95-4d41-bcc5-577c0563ce87,8e34fef2-e96c-4549-96b4-e9bf033a8029,5a00259d-1c49-4f33-9b6c-eea83b5028b7,'
  || 'c2357d59-d9f6-4e7f-9f2a-c59e46ec70cc,e0c66e08-aa1d-4c56-9a43-de79e4d706fc,df5c0430-1e8d-4d1b-8961-cb453e2637c3,'
  || '30ca09af-7e62-4d7d-919e-8e45e88b2bca,779d52de-3b44-4461-85a9-804180bfa950,10b06fba-6289-40f5-9f5f-9e3a460572d0', true);
-- $1 cliente  $2 safra 25/26  $3 safra 23/24  $4 fazenda  $5 fornecedor  $6 conta  $7 local  $8 venda  $9 colheita  $10 quebra
-- $11 barter  $12 area da safra (todos do NJ). As 10 primeiras sao leituras; 8, 9 e 18 (na ordem de baixo) sao so' service_role.
SELECT set_config('e.q', ARRAY[
  'agri_carga_mandioca_registrar($1,$12,current_date,$5,''X'',''T'',1000,0,500,0.1,''[]'',0,0,''X'',$6,0,0)',
  'agri_venda_graos_registrar($1,$3,''amendoim'',$4,$5,current_date,''[{"classe":"ate_20","sacas":1,"preco":10}]'',null,0,''[]'',''[]'',''X'',''{}''::uuid[],null,null,$7)',
  'agri_venda_graos_corrigir($8,''X'',$1,$3,''amendoim'',$4,$5,current_date,''[]'',null,0,''[]'',''[]'',''X'',''{}''::uuid[],null,null,$7)',
  'agri_quebra_registrar($1,$3,''amendoim'',''ate_20'',0.001,current_date,''X'',''X'',$7)',
  'agri_cotacao_graos_registrar($1,''amendoim'',current_date,''X'',''[{"classe":"ate_20","preco":1}]'')',
  'agri_local_estoque_salvar($1,null,''X'',''proprio'',$4,null,null,null,''X'',true)',
  'agri_contrato_armazenagem_salvar($1,null,$7,current_date,null,null,null,null,null,null,null,''X'',true)',
  'agri_venda_avulsa_registrar($1,$3,''amendoim'',$4,$5,current_date,''aprazo'',$6,current_date+30,''[]'')',
  'agri_local_estoque_resolver($1,$7)',
  'fn_estoque_graos($1,$2,''amendoim'',null)', 'fn_estoque_graos_resumo($1,$2,null)', 'fn_estoque_graos_balanco($1,''amendoim'',null)',
  'fn_estoque_graos_por_local($1,$2,''amendoim'')', 'fn_locais_estoque($1)', 'fn_vendas_graos($1,$2,''amendoim'')',
  'fn_estoque_movimentacoes($1,$3,''amendoim'')', 'buscar_duplicados_retroativo($1,''2026-03'')', 'auditar_integridade_classificacao($1)',
  'agri_carga_mandioca_cancelar($9,''X'')',
  'agri_carga_mandioca_corrigir($9,$12,current_date,$5,''X'',''T'',1000,0,500,0.1,''[]'',0,0,''X'',$6,0,0)',
  'agri_quebra_cancelar($10,''X'')', 'agri_quebra_editar($10,current_date,''X'',''X'')',
  'agri_venda_avulsa_cancelar($8,''X'')', 'agri_venda_avulsa_editar($8,current_date,$5,''X'')',
  'agri_barter_estornar_contrato($11)', 'agri_barter_materializar_contrato($11)', 'agri_barter_abrir_contrato($5,''X'',$4,''X'',''amendoim'')']::text, true);
DO $teste$
declare
  id uuid[] := string_to_array(current_setting('e.ids'), ',')::uuid[];
  q text[] := current_setting('e.q')::text[];
  c_vera constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; c_agn constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  c_user_nj constant text := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; c_admin constant text := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_gestor_agn constant text := '4b7e4456-113b-45d2-a00a-83b4d1c6380a';
  c_so_servico constant int[] := array[8, 9, 18];
  c_leituras constant int[] := array[10, 11, 12, 13, 14, 15, 16, 17, 18, 9];
  i int; k int; m text; m_adm text; e text; cli uuid; v_sql text;
begin
  -- T1
  if (select md5(string_agg(md5(p.prosrc), ',' order by p.proname)) from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname = any(array(select split_part(x, '(', 1) from unnest(q) x))) is distinct from '2bf020d73fc526c097a66c0e447bd5fa'
     or (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname = any(array(select split_part(x, '(', 1) from unnest(q) x)) and p.prosecdef
           and not has_function_privilege('anon', p.oid, 'EXECUTE') and has_function_privilege('service_role', p.oid, 'EXECUTE')
           and has_function_privilege('authenticated', p.oid, 'EXECUTE') = (p.proname not in
             ('agri_venda_avulsa_registrar', 'agri_local_estoque_resolver', 'auditar_integridade_classificacao'))) is distinct from 27
     or has_function_privilege('authenticated', 'public._fn_exigir_tenant_das_linhas(uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public._fn_exigir_tenant_das_linhas(uuid[])', 'EXECUTE') then
    raise exception 'T1 esquema'; end if;

  -- T2 o usuario do NJ no NJ = o admin no NJ (leituras; as so' service_role chamadas como o dono)
  foreach i in array c_leituras loop
    v_sql := 'select md5(coalesce((select json_agg(t)::text from public.' || q[i] || ' t), ''VAZIO''))';
    if not (i = any(c_so_servico)) then execute 'set local role authenticated'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
    execute v_sql into m_adm using id[1], id[2], id[3], id[4], id[5], id[6], id[7], id[8], id[9], id[10], id[11], id[12];
    perform set_config('request.jwt.claims', json_build_object('sub', c_user_nj, 'role', 'authenticated')::text, true);
    execute v_sql into m using id[1], id[2], id[3], id[4], id[5], id[6], id[7], id[8], id[9], id[10], id[11], id[12];
    reset role;
    if m is null or m is distinct from m_adm then raise exception 'T2 %: % x admin %', q[i], m, m_adm; end if;
    -- T5 admin em outro cliente (fora a resolver: ela recebe um local do NJ, que de outro cliente e' recusado pela regra dela)
    perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
    foreach cli in array case when i = 9 then '{}'::uuid[] else array[c_vera, c_agn] end loop
      e := null;
      begin execute v_sql into m using cli, id[2], id[3], id[4], id[5], id[6], id[7], id[8], id[9], id[10], id[11], id[12];
      exception when others then e := sqlstate; end;
      if e is not null then raise exception 'T5 % cliente %: %', q[i], cli, e; end if;
    end loop;
  end loop;

  -- T3 gestor do Agnaldo e T4 sem usuario: 42501 nas 27 (como authenticated; as tres so' service_role tambem como o dono)
  foreach m in array array[json_build_object('sub', c_gestor_agn, 'role', 'authenticated')::text, '{}'] loop
    perform set_config('request.jwt.claims', m, true);
    for i in 1 .. array_length(q, 1) loop
      foreach k in array case when i = any(c_so_servico) then array[0, 1] else array[0] end loop
        if k = 0 then execute 'set local role authenticated'; end if;
        e := null;
        begin execute 'select 1 from public.' || q[i] using id[1], id[2], id[3], id[4], id[5], id[6], id[7], id[8], id[9], id[10], id[11], id[12];
        exception when others then e := sqlstate; end;
        reset role;
        if e is distinct from '42501' then raise exception 'T% %: %', case when m = '{}' then 4 else 3 end, q[i], coalesce(e, 'respondeu'); end if;
      end loop;
    end loop;
  end loop;

  -- T5 admin: fornecedor do NJ + fazenda do Agnaldo no barter = 42501 (as linhas tem de ser do mesmo cliente)
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  e := null;
  begin perform public.agri_barter_abrir_contrato(id[5], 'X', (select f.id from fazendas f where f.cliente_id = c_agn limit 1), 'X', 'amendoim');
  exception when others then e := sqlstate; end;
  if e is distinct from '42501' then raise exception 'T5 barter com linhas de dois clientes: %', coalesce(e, 'respondeu'); end if;

  raise exception 'OK SEG-AGRI-TENANT-01: T1-T5';
end $teste$;
ROLLBACK;
