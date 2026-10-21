-- OC-ABRIR-LENTO-01 — a contagem docs_financeiro do resumo (oc_conta_corrente_lote) e' a MESMA da formula antiga (o OR),
-- em toda OC de todo cliente. Prova com o tamanho do conjunto: reprova se nenhuma OC tiver documento no financeiro.
-- So' leitura; termina em RAISE (nada fica gravado).
begin;
set local statement_timeout = '60s';
do $t$
declare r record; q record; v_lote jsonb; v_antigo bigint; v_ocs int := 0; v_com int := 0; v_dif int := 0;
begin
  if md5((select prosrc from pg_proc where oid = 'public.oc_conta_corrente_lote(uuid,uuid[])'::regprocedure))
     <> 'a650089f384466d24759db29b991deb3' then
    raise exception 'T0 corpo inesperado';
  end if;
  for r in select distinct cliente_id from public.zoo_operacoes_comerciais loop
    perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
    v_lote := public.oc_conta_corrente_lote(r.cliente_id,
                array(select id from public.zoo_operacoes_comerciais where cliente_id = r.cliente_id));
    for q in select o.id, (v_lote -> o.id::text ->> 'docs_financeiro')::bigint novo
               from public.zoo_operacoes_comerciais o where o.cliente_id = r.cliente_id loop
      select count(DISTINCT doc.id) into v_antigo
        from public.zoo_operacao_partes p
        join public.financeiro_lancamento_documentos doc
          on doc.cancelado is not true
         and (doc.lancamento_id = p.financeiro_lancamento_id
              or doc.id in (select v.documento_id from public.financeiro_documento_vinculos v
                             where v.lancamento_id = p.financeiro_lancamento_id))
       where p.operacao_id = q.id and p.cancelada is not true and p.financeiro_lancamento_id is not null;
      v_ocs := v_ocs + 1;
      if v_antigo > 0 then v_com := v_com + 1; end if;
      if q.novo is distinct from v_antigo then v_dif := v_dif + 1; end if;
    end loop;
  end loop;
  if v_ocs = 0 or v_com = 0 then raise exception 'T1 conjunto vazio (ocs %, com documento %)', v_ocs, v_com; end if;
  if v_dif > 0 then raise exception 'T1 % de % OCs com docs_financeiro diferente', v_dif, v_ocs; end if;
  raise exception 'OK: % OCs, % com documento no financeiro, 0 diferencas', v_ocs, v_com;
end $t$;
rollback;
