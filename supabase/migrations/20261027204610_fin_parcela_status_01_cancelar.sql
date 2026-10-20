-- FIN-PARCELA-STATUS-01, passo 2 (Gabriel, 20/10/2026) — CANCELAR O ULTIMO LANCAMENTO VIVO DE UMA PARCELA PAGA A DEIXA EM ABERTO.
-- Achado nos testes depois da 20261027204600: com a coluna seguindo os lancamentos, uma parcela ficava 'pago' pelo lancamento dela; cancelado esse
-- lancamento (e sem outro vivo), a regra "sem lancamento vivo, vale a coluna" mantinha 'pago' — paga sem pagamento nenhum
-- (fin_financ_28_p3fix4_quitacao_test, Q3: o contrato ficava 'quitado'). Agora:
--   `_fn_parcela_status_alinhar(parcela, lancamento_cancelado)` — quando o lancamento que o gatilho acabou de cancelar era desta parcela, ela
--   estava 'pago' e nao sobrou lancamento vivo, a coluna vai a 'pendente' (data de pagamento limpa). Sem o segundo argumento, e em todo outro
--   caso, e' o alinhamento de antes. A versao de um argumento sai (so' o gatilho a chamava).
--   `trg_fn_lancamento_quita_contrato` passa o lancamento quando ele acabou de ser cancelado (patch guardado por md5).
-- As 83 parcelas sem lancamento vivo de hoje NAO sao tocadas: so' o gesto de cancelar, daqui em diante, as alcanca.
set local lock_timeout = '2s';

create or replace function public._fn_parcela_status_alinhar(p_parcela_id uuid, p_lancamento_cancelado uuid)
returns text language plpgsql as $$
declare q public.financiamento_parcelas%rowtype; a record;
begin
  select * into q from public.financiamento_parcelas where id = p_parcela_id;
  if not found or coalesce(q.status, '') = 'cancelado' then return q.status; end if;
  select * into a from public._fn_parcela_status_alvo(q.lancamento_id, q.lancamento_juros_id);
  if a.alvo is null then
    if p_lancamento_cancelado is not null and q.status = 'pago'
       and p_lancamento_cancelado in (q.lancamento_id, q.lancamento_juros_id) then
      update public.financiamento_parcelas set status = 'pendente', data_pagamento = null, updated_at = now() where id = p_parcela_id;
      return 'pendente';
    end if;
    return q.status;
  end if;
  if q.status is distinct from a.alvo
     or (a.alvo = 'pago' and a.pago_em is not null and q.data_pagamento is distinct from a.pago_em) then
    update public.financiamento_parcelas
       set status = a.alvo,
           data_pagamento = case when a.alvo = 'pago' then coalesce(a.pago_em, data_pagamento) end,
           updated_at = now()
     where id = p_parcela_id;
  end if;
  return a.alvo;
end $$;
comment on function public._fn_parcela_status_alinhar(uuid, uuid) is
  'FIN-PARCELA-STATUS-01: leva status (e data de pagamento) da parcela ao que os lancamentos dela dizem; cancelada fica; sem lancamento vivo fica, '
  'salvo quando o lancamento que acabou de ser cancelado era o que a fazia paga (vai a pendente).';
revoke all on function public._fn_parcela_status_alinhar(uuid, uuid) from public, anon, authenticated;
grant execute on function public._fn_parcela_status_alinhar(uuid, uuid) to service_role;

do $mig$
declare v_oid oid := 'public.trg_fn_lancamento_quita_contrato()'::regprocedure; v_src text; v_new text; v_acl text;
begin
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '2c1101cdf6e9afc95b46bd027690429c' then
    if md5(v_src) <> 'b7b24d413ad6ec7f61a849c8e9328b2d' then raise exception 'quita: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    if (length(v_new) - length(replace(v_new, $a$    perform public._fn_parcela_status_alinhar(r.id);
$a$, ''))) / length($a$    perform public._fn_parcela_status_alinhar(r.id);
$a$) <> 1 then raise exception 'ancora Q2 nao casa 1x'; end if;
    execute replace(v_new, $a$    perform public._fn_parcela_status_alinhar(r.id);
$a$, $a$    -- cancelar: passa o lancamento que acabou de ser cancelado (sem lancamento vivo, a parcela paga por ele deixa de estar paga)
    perform public._fn_parcela_status_alinhar(r.id, case when new.cancelado is true and old.cancelado is not true then new.id end);
$a$);
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '2c1101cdf6e9afc95b46bd027690429c' then raise exception 'quita: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'quita: ACL mudou'; end if;
  end if;
end $mig$;

drop function if exists public._fn_parcela_status_alinhar(uuid);
