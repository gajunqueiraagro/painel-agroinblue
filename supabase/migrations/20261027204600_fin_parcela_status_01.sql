-- FIN-PARCELA-STATUS-01 (Gabriel, 20/10/2026) — a coluna `financiamento_parcelas.status` SEGUE OS LANCAMENTOS DA PARCELA.
-- Nasce da FASE 0 de 20/10: 140 parcelas vivas com a coluna diferente do que os lancamentos dizem (138 "pendente" com tudo pago); o motor do
-- credito (`fn_reconciliar_parcela_financiamento`) le' a coluna e devolveria lancamentos pagos a previsto.
--
-- A REGRA E' UMA (`_fn_parcela_pelos_lancamentos`, pura): recebe o status do lancamento VIVO do principal e o do juros (nulo = nao ha' lancamento
-- vivo naquele papel) e devolve 'paga' (todos os vivos realizados ou conciliados), 'parcial' (algum), 'aberta' (nenhum) ou NULO (nenhum lancamento
-- vivo: quem decide e' a coluna). `fn_financiamento_situacao` passa a chama'-la (patch guardado por md5; o retorno nao muda).
-- A COLUNA: 'paga' -> 'pago'; 'parcial' ou 'aberta' -> 'pendente' (a coluna nao tem 'parcial'); NULO -> fica como esta'. 'cancelado' e' decisao dos
-- donos (retirar, excluir, juntar, baixa) e nao se deriva.
--   · `trg_fn_lancamento_quita_contrato` (o gatilho de financeiro_lancamentos_v2 que ja' recalculava o contrato quando o status ou o cancelado do
--     lancamento muda) agora alinha antes a coluna de cada parcela que aponta para ele (`_fn_parcela_status_alinhar`). Nenhum DDL na tabela de
--     lancamentos: so' a funcao do gatilho muda.
--   · `trg_aa_parcela_status_pelos_lancamentos` (BEFORE INSERT OR UPDATE OF status, lancamento_id, lancamento_juros_id em financiamento_parcelas):
--     quando a parcela troca de lancamento, nasce, ou volta de 'cancelado', o status passa a ser o dos lancamentos; quando o FRONT (papel
--     authenticated/anon) grava um status que os lancamentos contradizem, RECUSA (P0001). Dentro das funcoes do banco (os donos, SECURITY
--     DEFINER) a gravacao que contradiz e' corrigida para o que os lancamentos dizem — as fotos dos desfazer passam e a coluna segue os lancamentos.
--     Parcela sem lancamento vivo, e a passagem de ou para 'cancelado', nao sao julgadas.
--   · 'pago' guarda a data de pagamento do lancamento (a maior entre principal e juros pagos); voltar a 'pendente' a limpa.
--   · `fn_financiamento_pagar_pelo_extrato` deixa de gravar 'pago' na parcela: o motor cria os lancamentos, eles ficam realizados na data do
--     extrato e a coluna segue pelo gatilho (patch guardado por md5).
--   · o MOTOR do credito (`fn_reconciliar_parcela_financiamento`) segue lendo a coluna, mas lancamento JA' PAGO manda no proprio status e na
--     propria data: com a parcela 'pago' ele nao rebaixa 'conciliado' a 'realizado' nem troca a data de pagamento do lancamento pela da
--     parcela (patch guardado por md5, 4 ancoras; o resto do motor nao muda).
-- NADA E' ALTERADO EM DADO por esta migration (o backfill das 138 e' a migration seguinte, com o OK do Gabriel).

set local lock_timeout = '2s';

create or replace function pg_temp._troca(t text, a text, b text, rotulo text) returns text language plpgsql as $f$
begin
  if (length(t) - length(replace(t, a, ''))) / length(a) <> 1 then raise exception 'ancora % nao casa 1x', rotulo; end if;
  return replace(t, a, b);
end $f$;

-- 1. a regra
create or replace function public._fn_parcela_pelos_lancamentos(p_status_principal text, p_status_juros text)
returns text language sql immutable as $$
  select case
           when p_status_principal is null and p_status_juros is null then null
           when (p_status_principal is null or p_status_principal in ('realizado', 'conciliado'))
            and (p_status_juros is null or p_status_juros in ('realizado', 'conciliado')) then 'paga'
           when p_status_principal in ('realizado', 'conciliado') or p_status_juros in ('realizado', 'conciliado') then 'parcial'
           else 'aberta'
         end
$$;
comment on function public._fn_parcela_pelos_lancamentos(text, text) is
  'FIN-PARCELA-STATUS-01: a situacao da parcela pelos lancamentos vivos dela (status do principal, status do juros; nulo = sem lancamento vivo '
  'naquele papel) -> paga | parcial | aberta | NULO (sem lancamento vivo: vale a coluna). Usada por fn_financiamento_situacao e pelo gatilho da coluna.';
revoke all on function public._fn_parcela_pelos_lancamentos(text, text) from public, anon;
grant execute on function public._fn_parcela_pelos_lancamentos(text, text) to authenticated, service_role;

-- 2. o que a coluna deve dizer, para um par de lancamentos (SECURITY INVOKER: le' os lancamentos com os olhos de quem grava)
create or replace function public._fn_parcela_status_alvo(p_lancamento_id uuid, p_lancamento_juros_id uuid)
returns table (situacao text, alvo text, pago_em date) language sql stable as $$
  with l as (
    select (select coalesce(lp.status_transacao, '') from public.financeiro_lancamentos_v2 lp
             where lp.id = p_lancamento_id and not coalesce(lp.cancelado, false)) as sp,
           (select lp.data_pagamento from public.financeiro_lancamentos_v2 lp
             where lp.id = p_lancamento_id and not coalesce(lp.cancelado, false)) as pp,
           (select coalesce(lj.status_transacao, '') from public.financeiro_lancamentos_v2 lj
             where lj.id = p_lancamento_juros_id and p_lancamento_juros_id is distinct from p_lancamento_id
               and not coalesce(lj.cancelado, false)) as sj,
           (select lj.data_pagamento from public.financeiro_lancamentos_v2 lj
             where lj.id = p_lancamento_juros_id and p_lancamento_juros_id is distinct from p_lancamento_id
               and not coalesce(lj.cancelado, false)) as pj
  ), s as (
    select l.*, public._fn_parcela_pelos_lancamentos(l.sp, l.sj) as sit from l
  )
  select s.sit,
         case s.sit when 'paga' then 'pago' when 'parcial' then 'pendente' when 'aberta' then 'pendente' end,
         case when s.sit = 'paga' then greatest(case when s.sp in ('realizado', 'conciliado') then s.pp end,
                                                case when s.sj in ('realizado', 'conciliado') then s.pj end) end
    from s
$$;
comment on function public._fn_parcela_status_alvo(uuid, uuid) is
  'FIN-PARCELA-STATUS-01: para os lancamentos de uma parcela, a situacao (a regra de _fn_parcela_pelos_lancamentos), o status que a coluna deve ter '
  '(pago | pendente | NULO sem lancamento vivo) e, quando paga, a data de pagamento (a maior dos lancamentos pagos).';
revoke all on function public._fn_parcela_status_alvo(uuid, uuid) from public, anon;
grant execute on function public._fn_parcela_status_alvo(uuid, uuid) to authenticated, service_role;

-- 3. o escritor (chamado pelo gatilho dos lancamentos)
create or replace function public._fn_parcela_status_alinhar(p_parcela_id uuid)
returns text language plpgsql as $$
declare q public.financiamento_parcelas%rowtype; a record;
begin
  select * into q from public.financiamento_parcelas where id = p_parcela_id;
  if not found or coalesce(q.status, '') = 'cancelado' then return q.status; end if;
  select * into a from public._fn_parcela_status_alvo(q.lancamento_id, q.lancamento_juros_id);
  if a.alvo is null then return q.status; end if;
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
comment on function public._fn_parcela_status_alinhar(uuid) is
  'FIN-PARCELA-STATUS-01: leva status (e data de pagamento) da parcela ao que os lancamentos dela dizem; cancelada e sem lancamento vivo ficam.';
revoke all on function public._fn_parcela_status_alinhar(uuid) from public, anon, authenticated;
grant execute on function public._fn_parcela_status_alinhar(uuid) to service_role;

-- 4. a trava e o alinhamento do lado da parcela
create or replace function public.trg_fn_parcela_status_pelos_lancamentos()
returns trigger language plpgsql as $$
declare a record;
begin
  if coalesce(new.status, '') = 'cancelado' then return new; end if;            -- decisao dos donos; nao se deriva
  select * into a from public._fn_parcela_status_alvo(new.lancamento_id, new.lancamento_juros_id);
  if a.alvo is null then return new; end if;                                      -- sem lancamento vivo: vale a coluna
  if new.status is not distinct from a.alvo then
    if a.alvo = 'pago' and a.pago_em is not null then new.data_pagamento := a.pago_em; end if;
    return new;
  end if;
  -- o status gravado contradiz os lancamentos
  if tg_op = 'UPDATE' and new.status is distinct from old.status and coalesce(old.status, '') <> 'cancelado'
     and current_user in ('authenticated', 'anon') then
    raise exception using errcode = 'P0001',
      message = format('A situação da parcela %s segue os lançamentos dela, que estão %s: pague ou desfaça o pagamento pelo lançamento no '
                       'Financeiro. Nada foi gravado.', new.numero_parcela, case when a.alvo = 'pago' then 'pagos' else 'em aberto' end);
  end if;
  new.status := a.alvo;
  new.data_pagamento := case when a.alvo = 'pago' then coalesce(a.pago_em, new.data_pagamento) end;
  return new;
end $$;
comment on function public.trg_fn_parcela_status_pelos_lancamentos() is
  'FIN-PARCELA-STATUS-01: o status da parcela com lancamento vivo e'' o dos lancamentos. Front (authenticated/anon) gravando o contrario: recusa. '
  'Funcoes do banco (donos, fotos de desfazer): corrigido para o dos lancamentos. Sem lancamento vivo e cancelado: nao julga.';
revoke all on function public.trg_fn_parcela_status_pelos_lancamentos() from public, anon, authenticated;

drop trigger if exists trg_aa_parcela_status_pelos_lancamentos on public.financiamento_parcelas;
create trigger trg_aa_parcela_status_pelos_lancamentos
  before insert or update of status, lancamento_id, lancamento_juros_id on public.financiamento_parcelas
  for each row execute function public.trg_fn_parcela_status_pelos_lancamentos();

do $mig$
declare v_oid oid; v_src text; v_new text; v_acl text;
begin
  v_oid := 'public.fn_financiamento_situacao(uuid, date, boolean)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> 'e7f274ba17ee4a8ee016b4eb1aa703fb' then
    if md5(v_src) <> 'b9f3b1afb49c8e97654a596a81b586d9' then raise exception 'situacao: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    v_new := pg_temp._troca(v_new,
      $a$case when b.n_vivos = 0 then 'parcela' else 'lancamento' end as fonte$a$,
      $a$case when public._fn_parcela_pelos_lancamentos(case when b.lp_id is not null then coalesce(b.lp_status, '') end, case when b.lj_id is not null then coalesce(b.lj_status, '') end) is null then 'parcela' else 'lancamento' end as fonte$a$, 'S1');
    v_new := pg_temp._troca(v_new,
      $a$             when d.n_real = d.n_vivos then 'paga'
             when d.n_real > 0 then 'parcial'
$a$,
      $a$             -- FIN-PARCELA-STATUS-01: a regra e' a de _fn_parcela_pelos_lancamentos (uma so', a mesma do gatilho da coluna)
             when public._fn_parcela_pelos_lancamentos(case when d.lp_id is not null then coalesce(d.lp_status, '') end, case when d.lj_id is not null then coalesce(d.lj_status, '') end) = 'paga' then 'paga'
             when public._fn_parcela_pelos_lancamentos(case when d.lp_id is not null then coalesce(d.lp_status, '') end, case when d.lj_id is not null then coalesce(d.lj_status, '') end) = 'parcial' then 'parcial'
$a$, 'S2');
    v_new := pg_temp._troca(v_new,
      $a$             when d.n_real > 0 then greatest($a$,
      $a$             when public._fn_parcela_pelos_lancamentos(case when d.lp_id is not null then coalesce(d.lp_status, '') end, case when d.lj_id is not null then coalesce(d.lj_status, '') end) in ('paga', 'parcial') then greatest($a$, 'S3');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> 'e7f274ba17ee4a8ee016b4eb1aa703fb' then raise exception 'situacao: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'situacao: ACL mudou'; end if;
  end if;
end $mig$;

do $mig$
declare v_oid oid; v_src text; v_new text; v_acl text;
begin
  v_oid := 'public.fn_financiamento_pagar_pelo_extrato(uuid, uuid, boolean)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '466fa3289159767fa9723695d055f4fa' then
    if md5(v_src) <> '34d5a1e89cbe9c25faab8213b85f8f45' then raise exception 'pagar_pelo_extrato: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    v_new := pg_temp._troca(v_new,
      $a$  UPDATE financiamento_parcelas SET status = 'pago', data_pagamento = cru.data_pagamento, valor_juros = v_juros, valor_total = cru.valor, updated_at = now(),
$a$,
      $a$  -- FIN-PARCELA-STATUS-01: a parcela nao recebe mais status nem data de pagamento aqui; quem paga sao os lancamentos (logo abaixo, depois do
  -- motor) e a coluna segue os lancamentos pelo gatilho da parcela.
  UPDATE financiamento_parcelas SET valor_juros = v_juros, valor_total = cru.valor, updated_at = now(),
$a$, 'P1');
    v_new := pg_temp._troca(v_new,
      $a$  SELECT lancamento_id, lancamento_juros_id INTO v_lp, v_lj FROM financiamento_parcelas WHERE id = p.id;
  IF v_lp IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='motor nao criou o lancamento do principal: '||left(v_rec::text,300); END IF;
$a$,
      $a$  SELECT lancamento_id, lancamento_juros_id INTO v_lp, v_lj FROM financiamento_parcelas WHERE id = p.id;
  IF v_lp IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='motor nao criou o lancamento do principal: '||left(v_rec::text,300); END IF;
  -- FIN-PARCELA-STATUS-01: os lancamentos da parcela ficam pagos na data do extrato; a parcela fica 'pago' pelo gatilho (nao por esta funcao).
  UPDATE financeiro_lancamentos_v2 SET status_transacao = 'realizado', data_pagamento = cru.data_pagamento, updated_by = v_uid, updated_at = now()
   WHERE id IN (v_lp, v_lj) AND NOT coalesce(cancelado, false);
$a$, 'P2');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '466fa3289159767fa9723695d055f4fa' then raise exception 'pagar_pelo_extrato: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'pagar_pelo_extrato: ACL mudou'; end if;
  end if;
end $mig$;

do $mig$
declare v_oid oid; v_src text; v_new text; v_acl text;
begin
  v_oid := 'public.trg_fn_lancamento_quita_contrato()'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> 'b7b24d413ad6ec7f61a849c8e9328b2d' then
    if md5(v_src) <> 'e5158c2a0a43d721bf12ebd35e39e416' then raise exception 'quita: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    v_new := pg_temp._troca(v_new,
      $a$begin
  for r in
$a$,
      $a$begin
  -- FIN-PARCELA-STATUS-01: antes do contrato, a coluna de cada parcela que aponta para este lancamento segue os lancamentos dela
  for r in select q.id from public.financiamento_parcelas q where q.lancamento_id = new.id or q.lancamento_juros_id = new.id loop
    perform public._fn_parcela_status_alinhar(r.id);
  end loop;
  for r in
$a$, 'Q1');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> 'b7b24d413ad6ec7f61a849c8e9328b2d' then raise exception 'quita: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'quita: ACL mudou'; end if;
  end if;
end $mig$;

do $mig$
declare v_oid oid; v_src text; v_new text; v_acl text;
begin
  v_oid := 'public.fn_reconciliar_parcela_financiamento(uuid, boolean, boolean, uuid)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '004f499ab983be6147135acfe2143154' then
    if md5(v_src) <> '1df9f3c17c98fd40b065724b450cd42a' then raise exception 'motor: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    v_new := pg_temp._troca(v_new,
      $a$      IF v_lanc_p.status_transacao IS DISTINCT FROM v_status THEN
$a$,
      $a$      -- FIN-PARCELA-STATUS-01: lancamento ja' pago manda no proprio status (conciliado nao volta a realizado) e na propria data de pagamento
      IF v_lanc_p.status_transacao IS DISTINCT FROM v_status AND NOT (v_status = 'realizado' AND v_lanc_p.status_transacao IN ('realizado', 'conciliado')) THEN
$a$, 'Mp1');
    v_new := pg_temp._troca(v_new,
      $a$      IF v_lanc_p.data_pagamento IS DISTINCT FROM v_data_pag THEN
$a$,
      $a$      IF v_lanc_p.data_pagamento IS DISTINCT FROM v_data_pag AND NOT (v_status = 'realizado' AND v_lanc_p.status_transacao IN ('realizado', 'conciliado')) THEN
$a$, 'Mp2');
    v_new := pg_temp._troca(v_new,
      $a$      IF v_lanc_j.status_transacao IS DISTINCT FROM v_status THEN
$a$,
      $a$      -- FIN-PARCELA-STATUS-01: lancamento ja' pago manda no proprio status (conciliado nao volta a realizado) e na propria data de pagamento
      IF v_lanc_j.status_transacao IS DISTINCT FROM v_status AND NOT (v_status = 'realizado' AND v_lanc_j.status_transacao IN ('realizado', 'conciliado')) THEN
$a$, 'Mj1');
    v_new := pg_temp._troca(v_new,
      $a$      IF v_lanc_j.data_pagamento IS DISTINCT FROM v_data_pag THEN
$a$,
      $a$      IF v_lanc_j.data_pagamento IS DISTINCT FROM v_data_pag AND NOT (v_status = 'realizado' AND v_lanc_j.status_transacao IN ('realizado', 'conciliado')) THEN
$a$, 'Mj2');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '004f499ab983be6147135acfe2143154' then raise exception 'motor: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'motor: ACL mudou'; end if;
  end if;
end $mig$;

-- 5. conferencia
do $c$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_aa_parcela_status_pelos_lancamentos' and tgrelid = 'public.financiamento_parcelas'::regclass)
    then raise exception 'gatilho da parcela ausente'; end if;
  if exists (select 1 from pg_proc p where p.oid in ('public._fn_parcela_pelos_lancamentos(text,text)'::regprocedure,
                                                    'public._fn_parcela_status_alvo(uuid,uuid)'::regprocedure,
                                                    'public._fn_parcela_status_alinhar(uuid)'::regprocedure)
               and has_function_privilege('anon', p.oid, 'execute')) then raise exception 'anon executa funcao nova'; end if;
end $c$;
