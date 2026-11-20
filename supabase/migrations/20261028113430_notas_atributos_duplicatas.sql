-- NOTAS-RECEITA-VENC-01 (Gabriel 19/11 07:36) — lote 28. A coluna "Venc." da lista "Notas da Receita": a `fn_notas_atributos_fiscais` (lote 25)
-- passa a devolver também as DUPLICATAS da nota (cobr/dup: nDup · dVenc · vDup, na ordem do XML) e os tPag (pag/detPag) — "à vista" quando
-- não há duplicata. Só leitura do XML que a busca já guardou; a regra (próxima, k/N, cores, filtro) mora na tela (`vencimentoDaNota`).
-- O resto da função fica igual (cfops · tpnf · natop · refs), a mesma guarda (tenant_ok, 42501) e o mesmo teto (2000 chaves).

create or replace function public.fn_notas_atributos_fiscais(p_cliente uuid, p_chaves text[])
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_ret jsonb;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if coalesce(array_length(p_chaves, 1), 0) > 2000 then
    raise exception using errcode = 'P0001', message = 'Chaves demais (até 2000).';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'chave', r.chave,
           'cfops', to_jsonb(array(select distinct m[1] from regexp_matches(r.xml, '<CFOP>(\d{4})</CFOP>', 'g') m order by 1)),
           'tpnf', (regexp_match(r.xml, '<tpNF>(\d)</tpNF>'))[1],
           'natop', (regexp_match(r.xml, '<natOp>([^<]*)</natOp>'))[1],
           -- as notas que ESTA nota cita (NFref/refNFe): a remessa de entrega futura aponta o faturamento, a devolução a original
           'refs', to_jsonb(array(select m[1] from regexp_matches(r.xml, '<refNFe>(\d{44})</refNFe>', 'g') m)),
           -- NOTAS-RECEITA-VENC-01: as duplicatas (n · venc 'AAAA-MM-DD' · valor em reais, ponto decimal) e as formas de pagamento
           'dups', coalesce((select jsonb_agg(jsonb_build_object(
                      'n', (regexp_match(d[1], '<nDup>([^<]*)</nDup>'))[1],
                      'venc', (regexp_match(d[1], '<dVenc>(\d{4}-\d{2}-\d{2})</dVenc>'))[1],
                      'valor', (regexp_match(d[1], '<vDup>([0-9.]+)</vDup>'))[1]))
                    from regexp_matches(coalesce((regexp_match(r.xml, '<cobr>(.*)</cobr>'))[1], ''), '<dup>(.*?)</dup>', 'g') d), '[]'::jsonb),
           'tpags', to_jsonb(array(select distinct m[1] from regexp_matches(coalesce((regexp_match(r.xml, '<pag>(.*)</pag>'))[1], ''), '<tPag>(\d{2})</tPag>', 'g') m order by 1)))), '[]'::jsonb)
    into v_ret
    from public.fiscal_dfe_recebidos r
   where r.cliente_id = p_cliente and r.xml is not null and r.chave = any (p_chaves);
  return v_ret;
end $function$;
revoke all on function public.fn_notas_atributos_fiscais(uuid, text[]) from public, anon;
grant execute on function public.fn_notas_atributos_fiscais(uuid, text[]) to authenticated;
