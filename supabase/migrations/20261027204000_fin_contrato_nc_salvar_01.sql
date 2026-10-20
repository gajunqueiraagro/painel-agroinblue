-- FIN-CONTRATO-NC-SALVAR-01 — o Regerar diz na linha de base o que o BANCO vai usar (Gabriel, 20/10/2026). Nasce do 8.233.040 da RRCC: a tela
-- mostrava Anual e a prévia gerou parcelas MENSAIS, porque o regerar lê o contrato gravado (periodicidade gravada 'mensal'; nula vira mensal).
--   `_fn_financiamento_parcelas_regerar_exec` (65790a2f… -> c0a3a49c…): a chave `base` do retorno ganha `periodicidade` (a usada:
--   coalesce(gravada, 'mensal')) e `periodicidade_gravada` (nula quando o contrato não tem). Nada mais muda: a conta, a recusa e a gravação
--   são as de antes. Patch guardado por md5 (origem, a âncora 1x, destino); ACL igual.

set local lock_timeout = '2s';

create or replace function pg_temp._troca(t text, a text, b text, rotulo text) returns text language plpgsql as $f$
begin
  if (length(t) - length(replace(t, a, ''))) / length(a) <> 1 then raise exception 'ancora % nao casa 1x', rotulo; end if;
  return replace(t, a, b);
end $f$;

do $mig$
declare v_oid oid; v_src text; v_new text; v_acl text;
begin
  v_oid := 'public._fn_financiamento_parcelas_regerar_exec(uuid, text)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> 'c0a3a49c051575161b88da1640316e6c' then
    if md5(v_src) <> '65790a2f26bcbfcf78df726d1f45b015' then raise exception 'regerar: origem inesperada %', md5(v_src); end if;
    v_new := pg_temp._troca(pg_get_functiondef(v_oid),
      $a$'taxa_aa', v_aa, 'sistema', f.sistema_amortizacao, 'mantidas', v_mantidas)$a$,
      $a$'taxa_aa', v_aa, 'sistema', f.sistema_amortizacao, 'mantidas', v_mantidas,
      -- FIN-CONTRATO-NC-SALVAR-01: a periodicidade que o banco USA (a gravada; nula = mensal), para a tela dizer na linha de base
      'periodicidade', coalesce(f.periodicidade, 'mensal'), 'periodicidade_gravada', f.periodicidade)$a$, 'R1');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> 'c0a3a49c051575161b88da1640316e6c' then raise exception 'regerar: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'regerar: ACL mudou'; end if;
  end if;
end $mig$;
