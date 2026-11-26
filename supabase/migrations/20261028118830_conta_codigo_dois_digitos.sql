-- CONTAS-BANCARIAS-AJUSTES-01 (c) — lote 118830 (Code 4; a aprovar). REGRA DO NASCIMENTO: o "013" do Kemp não foi digitado — quem o fez foi o
-- gerador `fn_gerar_codigo_conta` (gatilho `trg_auto_codigo_conta`, conta nova sem código), que numera POR tipo_conta em 3 dígitos
-- (`to_char(v_max + 1, 'FM000')`). Desde 23/04 nasceram assim 12 contas. A régua da casa é 2 dígitos: o gerador passa a devolver "13".
--   · o resto da função fica byte a byte (o máximo do MESMO tipo, o advisory lock por cliente+tipo); acima de 99 sai "100" (nunca "##" nem o "10" que o `lpad` puro corta).
--   · NENHUMA conta existente muda aqui: as 3 dígitos de hoje se convertem à parte, com prévia e OK (o Kemp já aprovado).
-- ⚠ PATCH GUARDADO POR MD5: o corpo de hoje tem de ser o conferido em 25/11 (a81c8d77…); o trecho casa exatamente 1 vez; ACL e config iguais.
set local lock_timeout = '2s';

do $patch$
declare
  c_fn constant regprocedure := 'public.fn_gerar_codigo_conta(uuid, text)'::regprocedure;
  c_md5 constant text := 'a81c8d779377721222e63ade1e2a22cd';
  c_de constant text := $$RETURN to_char(v_max + 1, 'FM000');$$;
  c_para constant text := $$RETURN lpad((v_max + 1)::text, greatest(2, length((v_max + 1)::text)), '0');$$;
  v_def text; v_md5 text; v_n int; v_acl text; v_cfg text;
begin
  select md5(prosrc), pg_get_functiondef(oid), proacl::text, proconfig::text into v_md5, v_def, v_acl, v_cfg from pg_proc where oid = c_fn;
  if v_md5 is distinct from c_md5 then
    raise exception 'CONTAS-BANCARIAS-AJUSTES-01: fn_gerar_codigo_conta mudou desde a conferência (md5 %, esperava %)', v_md5, c_md5; end if;
  v_n := (length(v_def) - length(replace(v_def, c_de, ''))) / length(c_de);
  if v_n <> 1 then raise exception 'CONTAS-BANCARIAS-AJUSTES-01: o trecho casa % vez(es), esperava 1', v_n; end if;
  execute replace(v_def, c_de, c_para);
  if (select md5(prosrc) from pg_proc where oid = c_fn) = c_md5 then raise exception 'CONTAS-BANCARIAS-AJUSTES-01: o corpo não mudou'; end if;
  if (select proacl::text from pg_proc where oid = c_fn) is distinct from v_acl or (select proconfig::text from pg_proc where oid = c_fn) is distinct from v_cfg then
    raise exception 'CONTAS-BANCARIAS-AJUSTES-01: a ACL ou a configuração da função mudou'; end if;
end $patch$;
