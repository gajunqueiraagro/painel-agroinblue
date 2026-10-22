-- DOC-NOTA-XML-PDF-01 (Gabriel 22/10/2026) — a MESMA nota guardada em dois arquivos (o PDF e o XML) e' UMA nota, nao uma "repetida".
-- Antes: `fin_documento_confronto` devolvia o par em `repetidas` ('duplicada': "registrada 2 vezes — cancele uma"), mandando cancelar um
-- arquivo legitimo. Agora o grupo da nota (o mesmo `chave_nota` da 02a) que, no MESMO caminho (lancamento ou OC), tem no maximo UM PDF e
-- UM XML, sem chave de acesso nem serie que se contradigam, e' `arquivos_da_nota`: conta uma vez (ja' contava) e NAO volta em
-- `repetidas`. Dois PDFs da mesma nota seguem 'duplicada'; a nota na OC e no lancamento segue 'oc_e_lancamento'.
-- Nenhum dado muda (as linhas e os arquivos ficam como estao; a aba Documentos junta o par numa linha). Troca de cinco trechos do corpo,
-- cada um conferido (1 ocorrencia), sobre a origem guardada por md5 (3ecc8917… = a 20261027202600); ACL e SECURITY DEFINER conferidos.
set local lock_timeout = '2s';

DO $patch$
declare
  c_origem constant text := '3ecc89177e987223808fd55751a44d41';
  v_oid oid := 'public.fin_documento_confronto(uuid, uuid)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_def_txt text;
  t text[][] := array[
    array[$a$SELECT DISTINCT ON (v.documento_id) v.documento_id, v.origem, v.especie, v.valor_documento AS valor, v.numero, v.chave_acesso, v.emitente_id,$a$,
          $b$SELECT DISTINCT ON (v.documento_id) v.documento_id, v.origem, v.especie, v.valor_documento AS valor, v.numero, v.chave_acesso, v.emitente_id,
           /* DOC-NOTA-XML-PDF-01 — o formato do arquivo (o PDF e o XML da mesma nota sao UMA nota) e a serie sem zeros */
           CASE WHEN lower(coalesce(v.nome, '')) LIKE '%.xml' OR coalesce(v.tipo, '') ILIKE '%xml%' THEN 'xml'
                WHEN lower(coalesce(v.nome, '')) LIKE '%.pdf' OR coalesce(v.tipo, '') ILIKE '%pdf%' THEN 'pdf' ELSE 'outro' END AS formato,
           nullif(ltrim(coalesce(v.serie, ''), '0'), '') AS serie_n,$b$],
    array[$a$           d.classe, d.emitente_id,
$a$, $b$           d.classe, d.emitente_id, d.formato, d.serie_n,
$b$],
    array[$a$           count(*) OVER (PARTITION BY k.papel, k.chave_nota, k.origem) AS vezes_origem
$a$, $b$           count(*) OVER (PARTITION BY k.papel, k.chave_nota, k.origem) AS vezes_origem,
           count(*) OVER (PARTITION BY k.papel, k.chave_nota, k.origem, k.formato) AS vezes_arquivo
$b$],
    array[$a$    SELECT r.*, max(r.vezes_origem) OVER (PARTITION BY r.papel, r.chave_nota) AS maior_origem FROM r
$a$, $b$    SELECT r.*, max(r.vezes_origem) OVER (PARTITION BY r.papel, r.chave_nota) AS maior_origem,
           /* DOC-NOTA-XML-PDF-01 — a nota em dois arquivos: um caminho so', no maximo um PDF e um XML, chave e serie sem contradicao */
           (max(r.vezes_arquivo) OVER p = 1 AND bool_and(r.formato IN ('pdf', 'xml')) OVER p
            AND min(r.origem) OVER p = max(r.origem) OVER p
            AND coalesce(min(r.serie_n) OVER p = max(r.serie_n) OVER p, true)
            AND coalesce(min(r.chave) OVER p = max(r.chave) OVER p, true)) AS arquivos_da_nota
      FROM r WINDOW p AS (PARTITION BY r.papel, r.chave_nota)
$b$],
    array[$a$WHERE e->>'papel' = 'fiscal' AND (e->>'vezes')::int > 1;$a$,
          $b$WHERE e->>'papel' = 'fiscal' AND (e->>'vezes')::int > 1 AND NOT (e->>'arquivos_da_nota')::boolean;$b$]
  ];
  i int;
begin
  select prosrc, proacl::text, prosecdef into v_src, v_acl, v_def from pg_proc where oid = v_oid;
  if md5(v_src) is distinct from c_origem then
    raise exception 'fin_documento_confronto: origem % (esperado %)', md5(v_src), c_origem;
  end if;
  v_novo := v_src;
  for i in 1 .. array_length(t, 1) loop
    if (length(v_novo) - length(replace(v_novo, t[i][1], ''))) / length(t[i][1]) <> 1 then
      raise exception 'fin_documento_confronto: trecho % nao ocorre exatamente 1 vez', i;
    end if;
    v_novo := replace(v_novo, t[i][1], t[i][2]);
  end loop;
  v_def_txt := pg_get_functiondef(v_oid);
  if position(v_src in v_def_txt) = 0 then raise exception 'corpo nao achado na definicao'; end if;
  execute replace(v_def_txt, v_src, v_novo);
  if (select prosrc from pg_proc where oid = v_oid) is distinct from v_novo
     or (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl
     or (select prosecdef from pg_proc where oid = v_oid) is distinct from v_def then
    raise exception 'fin_documento_confronto: gravado diferente do novo, ou ACL/SECURITY mudou';
  end if;
  raise notice 'fin_documento_confronto: destino %', md5(v_novo);
end
$patch$;
