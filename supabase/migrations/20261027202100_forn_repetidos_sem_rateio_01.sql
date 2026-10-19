-- FORN-REPETIDOS-SEM-RATEIO-01 (Gabriel 19/10/2026) — o prefixo "Pec.3M-" marca o fornecedor pago POR RATEIO (a nota fiscal no nome
-- do Higino, a Vera paga a parte dela). "Pec.3M-X" e "X" sao cadastros diferentes de proposito: as sugestoes de mesclagem
-- (`fn_fornecedor_repetidos`) nunca juntam um cadastro com o prefixo e um sem ele — nem pelo nome, nem pelo CPF/CNPJ. Dois do MESMO
-- lado continuam sugeridos (ex.: "Pec.3M-Cleodir Supermercados" e "Pec.3M-Cleodir Supermercados Eireli-EPP").
-- Medido em 19/10: nenhum grupo misto hoje (nenhum "Pec.3M-" tem documento; a chave de nome mantem "pec 3m") — e' a trava para nao
-- nascer. Patch guardado por md5 (origem, cada ancora 1x, destino); assinatura, SECURITY DEFINER e ACL iguais.
set local lock_timeout = '2s';

DO $patch$
declare
  c_origem constant text := '8c9c0a2a1031cefc9d30049f431db678';
  v_oid oid := 'public.fn_fornecedor_repetidos(uuid)'::regprocedure;
  v_src text; v_new text; v_acl text;
  a1 constant text := $a$SELECT f.id, f.nome, f.cpf_cnpj, coalesce(f.ativo, true) ativo, f.created_at,$a$;
  n1 constant text := $n$SELECT f.id, f.nome, f.cpf_cnpj, coalesce(f.ativo, true) ativo, f.created_at,
           (f.nome ~* '^\s*pec\.3m-') rateio,$n$;
  a2 constant text := $a$SELECT 'documento' motivo, doc chave FROM f WHERE doc IS NOT NULL GROUP BY doc HAVING count(*) > 1
    UNION
    SELECT 'nome', chave_nome FROM f WHERE chave_nome <> '' GROUP BY chave_nome HAVING count(*) > 1$a$;
  n2 constant text := $n$SELECT 'documento' motivo, doc chave, rateio FROM f WHERE doc IS NOT NULL GROUP BY doc, rateio HAVING count(*) > 1
    UNION
    SELECT 'nome', chave_nome, rateio FROM f WHERE chave_nome <> '' GROUP BY chave_nome, rateio HAVING count(*) > 1$n$;
  a3 constant text := $a$FROM f x WHERE (g.motivo = 'documento' AND x.doc = g.chave) OR (g.motivo = 'nome' AND x.chave_nome = g.chave)))$a$;
  n3 constant text := $n$FROM f x WHERE x.rateio = g.rateio AND ((g.motivo = 'documento' AND x.doc = g.chave) OR (g.motivo = 'nome' AND x.chave_nome = g.chave))))$n$;
begin
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) is distinct from c_origem then
    raise exception 'fn_fornecedor_repetidos: origem % (esperado %)', md5(v_src), c_origem;
  end if;
  if (length(v_src) - length(replace(v_src, a1, ''))) / length(a1) <> 1
     or (length(v_src) - length(replace(v_src, a2, ''))) / length(a2) <> 1
     or (length(v_src) - length(replace(v_src, a3, ''))) / length(a3) <> 1
     or (select count(*) from regexp_matches(v_src, 'GROUP BY', 'g')) <> 2 then
    raise exception 'fn_fornecedor_repetidos: ancora nao casa exatamente 1x';
  end if;
  v_new := replace(replace(replace(v_src, a1, n1), a2, n2), a3, n3);
  if md5(v_new) is distinct from 'd66b4eab7d0f354f622c3ada39ebe688' then
    raise exception 'fn_fornecedor_repetidos: destino % (esperado d66b4eab7d0f354f622c3ada39ebe688)', md5(v_new);
  end if;
  execute replace(pg_get_functiondef(v_oid), v_src, v_new);
  if (select md5(prosrc) from pg_proc where oid = v_oid) is distinct from 'd66b4eab7d0f354f622c3ada39ebe688'
     or (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then
    raise exception 'fn_fornecedor_repetidos: gravado diferente do destino, ou ACL mudou';
  end if;
end
$patch$;
