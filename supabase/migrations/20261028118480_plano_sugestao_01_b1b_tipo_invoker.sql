-- PLANO-SUGESTAO-01 B1b (Code 4 18:14, detector guardaDeClienteNasMigrations): public._fn_nota_tipo_operacao(p_cliente, p_emitente) nasceu
-- no 118460 como SECDEF com parâmetro de cliente e sem guarda. FASE 0: ela já era FECHADA (EXECUTE só postgres e service_role; anon,
-- authenticated e authenticator NÃO) e só é chamada pelas duas da tela, fn_nota_itens_sugerir_conta e fn_item_regra_gravar, que guardam
-- pelo cliente da nota (tenant_ok, 42501) ANTES de chamá-la. Não havia leitura de outro cliente; o furo era latente (um GRANT futuro a abriria).
-- O QUE FAZ: a mesma função, o mesmo corpo, passa a SECURITY INVOKER (roda com os direitos de quem chama: dentro das duas da tela, o dono
-- delas; chamada direta por usuário, a RLS dele em fiscal_titulares) e continua fechada (revoke de novo). Guardado por md5 antes e depois;
-- as duas chamadoras não mudam (md5 conferido).
-- NÃO FAZ: não muda resultado (venda '1-Entradas' se o emitente é produtor do cliente; senão '2-Saídas'), não toca dado.
-- DESFAZER: create or replace com "security definer" no lugar de "security invoker" (o resto igual) — volta ao 118460.

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $antes$
begin
  if md5(pg_get_functiondef('public._fn_nota_tipo_operacao(uuid,text)'::regprocedure)) <> 'afee338be36508dfea81b663d9bed498'
     or md5(pg_get_functiondef('public.fn_nota_itens_sugerir_conta(uuid)'::regprocedure)) <> '349c8a822480a1473f1cce3d03fb2778'
     or md5(pg_get_functiondef('public.fn_item_regra_gravar(uuid,uuid,text,boolean)'::regprocedure)) <> '8f9535fe9e18aec95e3e773a526af070' then
    raise exception 'PLANO-SUGESTAO-01 B1b: uma das 3 funções mudou desde o 118460. Nada foi gravado.';
  end if;
end $antes$;

create or replace function public._fn_nota_tipo_operacao(p_cliente uuid, p_emitente text) returns text
language sql stable security invoker set search_path = public, pg_temp as $f$
  select case when exists (select 1 from public.fiscal_titulares t
                            where t.cliente_id = p_cliente and t.papel = 'produtor' and public._fn_documento_normalizar(p_emitente) <> ''
                              and public._fn_documento_normalizar(p_emitente) in (public._fn_documento_normalizar(t.documento), public._fn_documento_normalizar(t.cnpj_produtor)))
              then '1-Entradas' else '2-Saídas' end
$f$;
revoke all on function public._fn_nota_tipo_operacao(uuid, text) from public, anon, authenticated;

do $chegada$
begin
  if (select prosecdef from pg_proc where oid = 'public._fn_nota_tipo_operacao(uuid,text)'::regprocedure)
     or md5(pg_get_functiondef('public._fn_nota_tipo_operacao(uuid,text)'::regprocedure)) <> 'd7cb463e7af9755626d7b2b4a2ef644e'
     or has_function_privilege('anon', 'public._fn_nota_tipo_operacao(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_nota_tipo_operacao(uuid,text)', 'execute')
     or md5(pg_get_functiondef('public.fn_nota_itens_sugerir_conta(uuid)'::regprocedure)) <> '349c8a822480a1473f1cce3d03fb2778'
     or md5(pg_get_functiondef('public.fn_item_regra_gravar(uuid,uuid,text,boolean)'::regprocedure)) <> '8f9535fe9e18aec95e3e773a526af070' then
    raise exception 'PLANO-SUGESTAO-01 B1b: a chegada não confere (invoker, md5 %, fechada). Nada foi gravado.',
      md5(pg_get_functiondef('public._fn_nota_tipo_operacao(uuid,text)'::regprocedure));
  end if;
end $chegada$;
