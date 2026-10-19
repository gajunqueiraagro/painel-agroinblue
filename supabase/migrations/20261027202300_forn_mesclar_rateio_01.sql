-- FORN-MESCLAR-RATEIO-01 (Gabriel 19/10/2026) — `fn_fornecedor_mesclar` (simulacao e gravacao) RECUSA mesclagem mista: um cadastro com
-- o prefixo "Pec.3M-" (pagamento por RATEIO, nota fiscal em nome do Higino, a Vera paga a parte dela) com um cadastro sem o prefixo. Os
-- dois lados sao diferentes de proposito; mesclar apaga a informacao do rateio (o erro de 19/10, desfeito no mesmo dia). "Pec.3M-" com
-- "Pec.3M-" e sem com sem continuam mesclando; o DESFAZER nao passa por esta regra (desfaz qualquer mesclagem viva, inclusive mista).
-- O dono da recusa e' um so', `_fn_fornecedor_mesclar_recusa` (lido por `fn_fornecedor_mesclar` e `_fn_fornecedor_mesclar_exec`):
-- patch guardado por md5 (origem, ancora 1x, destino); ACL e SECURITY conferidas. Motivo novo: 'rateio_misto'.
set local lock_timeout = '2s';

DO $patch$
declare
  c_origem  constant text := 'bdee1b723a9877c52868b9ff0358bc4c';
  c_destino constant text := '8e1067640a9ef8a58b78cf50984225f7';
  v_oid oid := 'public._fn_fornecedor_mesclar_recusa(uuid, uuid[])'::regprocedure;
  v_src text; v_new text; v_acl text; v_def boolean;
  a1 constant text := $a$  SELECT array_agg(DISTINCT format('%s (%s)', f.cpf_cnpj, f.nome) ORDER BY format('%s (%s)', f.cpf_cnpj, f.nome))$a$;
  n1 constant text := $n$  -- FORN-MESCLAR-RATEIO-01: "Pec.3M-" marca o pagamento por RATEIO (NF em nome do Higino); so' se mescla com o MESMO lado.
  -- Espelho declarado de `ehRateio` (src/lib/fornecedores/fornecedorTexto.ts) e do criterio de `fn_fornecedor_repetidos`.
  FOR v_a IN SELECT f.nome FROM public.financeiro_fornecedores f
              WHERE f.id = ANY (p_absorver) AND (f.nome ~* '^\s*pec\.3m-') IS DISTINCT FROM (coalesce(v_m.nome, '') ~* '^\s*pec\.3m-')
              ORDER BY f.nome LIMIT 1 LOOP
    RETURN jsonb_build_object('motivo', 'rateio_misto',
      'frase', format('"%s" e "%s" não se mesclam: "Pec.3M-" marca o pagamento por rateio (nota fiscal em nome do Higino) e o cadastro com o prefixo é diferente do sem prefixo de propósito.', v_m.nome, v_a.nome));
  END LOOP;
  SELECT array_agg(DISTINCT format('%s (%s)', f.cpf_cnpj, f.nome) ORDER BY format('%s (%s)', f.cpf_cnpj, f.nome))$n$;
begin
  select prosrc, proacl::text, prosecdef into v_src, v_acl, v_def from pg_proc where oid = v_oid;
  if md5(v_src) is distinct from c_origem then
    raise exception '_fn_fornecedor_mesclar_recusa: origem % (esperado %)', md5(v_src), c_origem;
  end if;
  if (length(v_src) - length(replace(v_src, a1, ''))) / length(a1) <> 1
     or (select count(*) from regexp_matches(v_src, 'cnpj_diferente', 'g')) <> 1 then
    raise exception '_fn_fornecedor_mesclar_recusa: ancora nao casa exatamente 1x';
  end if;
  v_new := replace(v_src, a1, n1);
  if md5(v_new) is distinct from c_destino then
    raise exception '_fn_fornecedor_mesclar_recusa: destino % (esperado %)', md5(v_new), c_destino;
  end if;
  execute replace(pg_get_functiondef(v_oid), v_src, v_new);
  if (select md5(prosrc) from pg_proc where oid = v_oid) is distinct from c_destino
     or (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl
     or (select prosecdef from pg_proc where oid = v_oid) is distinct from v_def then
    raise exception '_fn_fornecedor_mesclar_recusa: gravado diferente do destino, ou ACL/SECURITY mudou';
  end if;
end
$patch$;
