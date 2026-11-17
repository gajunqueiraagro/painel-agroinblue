-- NJ-NOTAS-LENTAS (lote 20, Gabriel 17/11): a lista "Notas da Receita" perguntava à `fn_nota_ja_lancada` UMA VEZ POR NOTA (30 no NJ,
-- ~243 ms cada). Esta faz a MESMA pergunta para todas as notas numa varredura só.
-- O critério é o da `fn_nota_ja_lancada` SEM parcelas (como a lista pergunta): achado VIVO (não cancelado) por
--   · chave  — a chave num documento do lançamento (`vw_lancamento_documentos`);
--   · numero — o nº em `numero_documento` (todos os dígitos sem zeros à esquerda, ou um trecho de dígitos; o ponto de milhar sai antes);
--   · documento — o nº num documento anexado;
--   nº e documento só com o fornecedor PARECIDO com o emitente: mesma raiz de CNPJ, ou sem CNPJ com o nome igual/parecido, ou mesclado.
-- (valor, soma e fração dependem das parcelas, que a lista não manda: na `fn_nota_ja_lancada` sem parcelas eles nunca acham.)
-- A equivalência com a `fn_nota_ja_lancada` é o gate do lote (ensaio em RAISE).
create or replace function public.fn_notas_ja_lancadas(p_cliente uuid, p_notas jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
 set plan_cache_mode to 'force_custom_plan'
as $function$
declare v_ret jsonb;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_notas, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_notas, '[]'::jsonb)) > 2000 then
    raise exception using errcode = 'P0001', message = 'Notas fora do formato (lista de até 2000).';
  end if;
  with n as (
    select distinct on (ch) ch, num, raiz, nome_c from (
      select regexp_replace(coalesce(x->>'chave', ''), '\D', '', 'g') ch,
             ltrim(regexp_replace(coalesce(x->>'numero', ''), '\D', '', 'g'), '0') num,
             left(regexp_replace(coalesce(x->>'emitente_documento', ''), '\D', '', 'g'), 8) raiz,
             coalesce(public._fn_fornecedor_chave_comparavel(coalesce(x->>'nome', '')), '') nome_c
        from jsonb_array_elements(coalesce(p_notas, '[]'::jsonb)) x) s
     where ch <> ''
     order by ch
  ),
  todos as (
    select l.id, l.favorecido_id, l.numero_documento from public.financeiro_lancamentos_v2 l
     where l.cliente_id = p_cliente and coalesce(l.cenario, 'realizado') <> 'meta'
  ),
  lnum as (
    select t.id, t.favorecido_id, ltrim(regexp_replace(t.numero_documento, '\D', '', 'g'), '0') num from todos t where t.numero_documento ~ '\d'
    union
    select t.id, t.favorecido_id, ltrim(m[1], '0') from todos t
      cross join lateral regexp_matches(replace(t.numero_documento, '.', ''), '\d+', 'g') m
     where t.numero_documento ~ '\d'
  ),
  docs as (
    select d.lancamento_id, regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') ch, ltrim(regexp_replace(coalesce(d.numero, ''), '\D', '', 'g'), '0') num
      from public.vw_lancamento_documentos d
     where d.cliente_id = p_cliente and d.cancelado is not true and d.lancamento_id is not null
  ),
  cand as (
    select n.ch, 'chave'::text por, d.lancamento_id id, null::uuid fav from n join docs d on d.ch = n.ch where length(n.ch) in (44, 50)
    union all
    select n.ch, 'numero', l.id, l.favorecido_id from n join lnum l on l.num = n.num where n.num <> ''
    union all
    select n.ch, 'documento', t.id, t.favorecido_id from n join docs d on d.num = n.num join todos t on t.id = d.lancamento_id where n.num <> ''
  ),
  forn as (
    select f.id, f.fundido_em_id, regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') doc, public._fn_fornecedor_chave_comparavel(f.nome) nc
      from public.financeiro_fornecedores f
     where f.cliente_id = p_cliente
       and (f.id in (select fav from cand) or f.fundido_em_id in (select fav from cand)
            or f.id in (select f2.fundido_em_id from public.financeiro_fornecedores f2 where f2.id in (select fav from cand)))
  ),
  ok as (
    select c.ch, c.por, c.id from cand c where c.por = 'chave'
    union all
    select c.ch, c.por, c.id from cand c join n on n.ch = c.ch
     where c.por <> 'chave' and c.fav is not null and exists (
       select 1 from forn f
        where (f.id = c.fav or f.fundido_em_id = c.fav
               or f.id = (select tf.fundido_em_id from public.financeiro_fornecedores tf where tf.id = c.fav))
          and ((length(n.raiz) = 8 and length(f.doc) = 14 and left(f.doc, 8) = n.raiz)
               or (f.doc = '' and n.nome_c <> '' and (f.nc = n.nome_c or public._fn_fornecedor_parecido(f.nc, n.nome_c)))))
  ),
  achou as (
    select o.ch, jsonb_agg(distinct o.por) por from ok o join public.financeiro_lancamentos_v2 l on l.id = o.id
     where not l.cancelado group by o.ch
  )
  select coalesce(jsonb_agg(jsonb_build_object('chave', n.ch, 'ja_lancada', a.ch is not null, 'por', coalesce(a.por, '[]'::jsonb)) order by n.ch), '[]'::jsonb)
    into v_ret
    from n left join achou a on a.ch = n.ch;
  return v_ret;
end $function$;

revoke all on function public.fn_notas_ja_lancadas(uuid, jsonb) from public, anon;
grant execute on function public.fn_notas_ja_lancadas(uuid, jsonb) to authenticated;
