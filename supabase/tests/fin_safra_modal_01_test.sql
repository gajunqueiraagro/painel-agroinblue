-- PR-FIN-SAFRA-MODAL-01 — T5 e T6, numa transacao que TERMINA EM RAISE (nada fica gravado).
--
-- Roda DEPOIS da migration 20261027191300 (ou colado logo depois dela, na mesma transacao, para a prova de antes de
-- aplicar). Pelo canal: `supabase db query --linked -f supabase/tests/fin_safra_modal_01_test.sql`.
--
-- T5  completar com a VENDA numa safra diferente da CARGA cria o lancamento na safra da CARGA (a da area).
--     Cenario: a NF 9320690 do NJ; dentro da transacao a venda vai para 26/27-Lav e a retencao ('funrural') da NF e'
--     desligada, para o completar poder acrescenta-la de novo. Corpo antigo: o lancamento novo nasce em 26/27 (falha).
-- T6  o backfill mudou SO' `safra_id`: em cada uma das 27 linhas, a linha 'editou' do audit_log que a migration gerou
--     (OLD e NEW inteiros) difere apenas em safra_id e updated_at; e a tabela de backfill desfaz: aplicado o gesto
--     contrario de cada linha, a safra volta a' anterior e o resto da linha (sem safra_id e updated_*) fica identico.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $t$
declare
  c_nj    constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_2526  constant uuid := '55d99920-add0-4091-b1a7-0b0ce3faaedb';
  c_2627  constant uuid := '5c9e3439-564d-4116-9787-fbae474dd4c1';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_carga uuid; v_venda uuid; v_area_safra uuid; v_r jsonb; v_novo record; v_g record; v_codigo text;
  v_n int; v_audit int; v_ruins int; v_md5_antes text; v_md5_depois text; v_volta int;
begin
  -- ─── T5 ───
  select c.id, cl.lancamento_id, a.safra_id into v_carga, v_venda, v_area_safra
    from agri_colheita c join agri_safra_area a on a.id = c.safra_area_id
    join agri_colheita_lancamentos cl on cl.colheita_id = c.id and cl.papel = 'venda' and cl.ativo
   where c.cliente_id = c_nj and c.nf_produtor = '9320690' and c.ativo
   order by c.data_colheita, c.id limit 1;
  if v_carga is null then raise exception 'T5: carga da NF 9320690 nao encontrada'; end if;
  if v_area_safra <> c_2526 then raise exception 'T5: a area da carga nao e'' a 25/26-Lav (%)', v_area_safra; end if;

  update financeiro_lancamentos_v2 set safra_id = c_2627 where id = v_venda;          -- a venda diverge da carga
  update agri_colheita_lancamentos cl set ativo = false                               -- a retencao sai da NF
    from agri_colheita c
   where c.id = cl.colheita_id and cl.papel = 'funrural' and cl.ativo
     and c.cliente_id = c_nj and c.nf_produtor = '9320690';
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  v_r := public.agri_carga_mandioca_completar(v_carga, 'funrural', 12.34, null, 'T5 retencao', null);
  if coalesce((v_r->>'ok')::boolean, false) is not true then raise exception 'T5: completar recusou: %', v_r; end if;
  select l.safra_id, (select s.codigo from financeiro_safras s where s.id = l.safra_id) codigo into v_novo
    from financeiro_lancamentos_v2 l where l.id = (v_r->>'lancamento_id')::uuid;
  v_codigo := v_novo.codigo;
  if v_novo.safra_id is distinct from v_area_safra then
    raise exception 'T5 FALHOU: o lancamento novo nasceu em % (a venda esta'' em 26/27-Lav; a carga e'' 25/26-Lav)', v_novo.codigo;
  end if;

  -- ─── T6 (a): so' safra_id mudou, pelo audit_log da migration ───
  select count(*) into v_n from public.fin_safra_modal_01_backfill;
  if v_n <> 27 then raise exception 'T6: a tabela de backfill tem % linhas, esperadas 27', v_n; end if;
  if (select count(*) from public.fin_safra_modal_01_backfill where evidencia = 'carga') <> 22
     or (select count(*) from public.fin_safra_modal_01_backfill where evidencia = 'audit_log') <> 5 then
    raise exception 'T6: evidencias fora de 22 carga + 5 audit_log';
  end if;
  -- a linha do audit_log de cada lancamento que leva safra_anterior -> 25/26 (a mais recente)
  with ult as (
    select distinct on (b.lancamento_id) b.lancamento_id, al.dados_anteriores o, al.dados_novos n
      from public.fin_safra_modal_01_backfill b
      join audit_log al on al.registro_id = b.lancamento_id
     where al.dados_anteriores->>'safra_id' = b.safra_anterior::text and al.dados_novos->>'safra_id' = c_2526::text
     order by b.lancamento_id, al.created_at desc)
  select count(*),
         count(*) filter (where (o - 'safra_id' - 'updated_at' - 'updated_by') <> (n - 'safra_id' - 'updated_at' - 'updated_by'))
    into v_audit, v_ruins from ult;
  if v_audit <> 27 then raise exception 'T6: % linhas de audit_log da migration, esperadas 27', v_audit; end if;
  if v_ruins <> 0 then raise exception 'T6 FALHOU: % linhas mudaram alem de safra_id/updated_*', v_ruins; end if;

  -- ─── T6 (b): a tabela desfaz ───
  select md5(string_agg((to_jsonb(l) - 'safra_id' - 'updated_at' - 'updated_by')::text, '|' order by l.id)) into v_md5_antes
    from financeiro_lancamentos_v2 l join public.fin_safra_modal_01_backfill b on b.lancamento_id = l.id
   where l.id <> v_venda;                                     -- a venda foi mexida pelo T5 acima
  for v_g in select gesto_contrario from public.fin_safra_modal_01_backfill loop
    execute v_g.gesto_contrario;
  end loop;
  select md5(string_agg((to_jsonb(l) - 'safra_id' - 'updated_at' - 'updated_by')::text, '|' order by l.id)) into v_md5_depois
    from financeiro_lancamentos_v2 l join public.fin_safra_modal_01_backfill b on b.lancamento_id = l.id
   where l.id <> v_venda;
  select count(*) into v_volta from financeiro_lancamentos_v2 l join public.fin_safra_modal_01_backfill b on b.lancamento_id = l.id
   where l.safra_id = b.safra_anterior;
  if v_volta <> 27 then raise exception 'T6 FALHOU: so'' % de 27 voltaram a'' safra anterior', v_volta; end if;
  if v_md5_antes <> v_md5_depois then raise exception 'T6 FALHOU: desfazer mexeu em outra coluna'; end if;

  raise exception 'OK T5 (novo lancamento na %, a venda em 26/27-Lav) · T6 (27 linhas: 22 carga + 5 audit_log; audit so'' safra_id/updated_* em %/%; desfazer volta % de 27, resto identico md5 %)',
    v_codigo, v_audit - v_ruins, v_audit, v_volta, left(v_md5_depois, 8)
    using errcode = 'P0001';
end $t$;
