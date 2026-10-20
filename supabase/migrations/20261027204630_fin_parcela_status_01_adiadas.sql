-- FIN-PARCELA-STATUS-01, adiadas (Gabriel, 20/10/2026) — a parcela ADIADA do consorcio (sem vencimento ate' a contemplacao) nao some do em aberto.
-- Medido no 002122 (Agnaldo): pago 8.410,98 + a vencer 120.717,84 + vencido 2.803,66 = 131.932,48 de 224.293,02; os 92.360,54 que faltam sao as 34
-- adiadas, que nao estao nem em a vencer (vencimento >= hoje) nem em vencido (< hoje). A coluna "A pagar" da aba Consorcios mostrava 131.932,48.
-- `fn_financiamento_situacao` (patch guardado por md5) ganha nos cartoes `adiado` (o que falta das parcelas sem vencimento) e `adiado_qtde`, depois
-- de `vencido`. Nenhuma chave de antes muda; a situacao da parcela adiada segue 'pendente' (a tela a reconhece pelo vencimento vazio).
set local lock_timeout = '2s';
do $mig$
declare v_oid oid := 'public.fn_financiamento_situacao(uuid, date, boolean)'::regprocedure; v_src text; v_new text; v_acl text;
begin
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '4a395ca4fb5128c1f08e4206d50eb67d' then
    if md5(v_src) <> 'e7f274ba17ee4a8ee016b4eb1aa703fb' then raise exception 'situacao: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    if (length(v_new) - length(replace(v_new, $a$      'vencido', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento < v_hoje then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
$a$, ''))) / length($a$      'vencido', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento < v_hoje then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
$a$) <> 1 then raise exception 'ancora A1 nao casa 1x'; end if;
    execute replace(v_new, $a$      'vencido', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento < v_hoje then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
$a$, $a$      'vencido', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento < v_hoje then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
      -- FIN-PARCELA-STATUS-01 (adiadas): parcela sem vencimento (adiada do consorcio, ate' a contemplacao) nao e' vencida nem a vencer; fica
      -- aqui, para o em aberto do contrato nao a perder
      'adiado', round(coalesce(sum(case when s.situacao <> 'paga' and s.data_vencimento is null then greatest(s.vt - s.valor_pago, 0) else 0 end), 0), 2),
      'adiado_qtde', count(*) filter (where s.situacao <> 'paga' and s.data_vencimento is null),
$a$);
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '4a395ca4fb5128c1f08e4206d50eb67d' then raise exception 'situacao: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'situacao: ACL mudou'; end if;
  end if;
end $mig$;
