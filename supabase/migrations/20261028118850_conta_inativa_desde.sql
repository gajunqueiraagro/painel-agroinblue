-- CONTA-INATIVAR-DATA-01 — lote 118850 (Code 4; a aprovar). Gabriel 26/11: "a conta aparece em todo mês em que tem saldo ≠ 0, lançamento ou
-- extrato, ATIVA OU NÃO; a inativação só tira dos seletores de lançamento novo depois de 'Inativa desde'. Uma regra só (um helper)."
-- Prova (FASE 0, financeiro-20261126-0623-…): NJ · Conciliação · nov/2022 · "Todas as contas" deixava R$ 4.346.302,93 de fora (78 meses).
--   (1) a coluna `inativa_desde` (date, dia 1º; só em conta inativa);
--   (2) A REGRA: `_fn_conta_no_periodo(conta, de, até)` / `_fn_conta_no_mes(conta, 'AAAA-MM')` = mes_inicio ≤ o mês E (a conta ABERTA no
--       período — ativa sem data, ou com data depois do início — OU saldo final ≠ 0 num mês do período OU lançamento vivo OU extrato vivo nele);
--   (3) os leitores do banco que escondiam a inativa em TODO mês passam a ler a regra (patch guardado por md5, ACL e config iguais):
--       a Conciliação (`_fn_conciliacao_resumo`, `fn_conciliacao_status_ano`, `fn_conta_bancaria_efeito_conciliacao`), a Visão geral
--       (`fn_vg_saldos`, `fn_vg_partes`, `fn_vg_gaveta_ordenada`) e as faturas do cartão (`fn_faturas_cartao`);
--   (4) o lançamento NOVO (ou trocado para a conta) com data ≥ "Inativa desde" é recusado no banco (gatilho `trg_00_conta_inativa`);
--   (5) inativar pelo escritor da tela (`fn_conta_bancaria_salvar`) exige a data e CONFERE: saldo zero no fim do mês anterior, nenhum
--       lançamento nem extrato a partir da data (mostra, não esconde: `fn_conta_inativar_previa`); reativar limpa a data (a trilha é a do
--       gatilho de auditoria de sempre).
-- NENHUMA conta muda aqui. Os seletores do front (`.eq('ativa', true)`) e as datas das 4 do NJ entram depois (tela; dados com prévia e OK).
set local lock_timeout = '2s';

-- ═══ (1) a coluna ═══
alter table public.financeiro_contas_bancarias add column inativa_desde date;
alter table public.financeiro_contas_bancarias add constraint chk_conta_inativa_desde_dia_1
  check (inativa_desde is null or extract(day from inativa_desde) = 1);
alter table public.financeiro_contas_bancarias add constraint chk_conta_inativa_desde_so_inativa
  check (inativa_desde is null or ativa is false);
comment on column public.financeiro_contas_bancarias.inativa_desde is
  'CONTA-INATIVAR-DATA-01: a partir deste dia (1º do mês) a conta não recebe lançamento novo e sai dos seletores; antes dele, tudo igual. Só em conta inativa.';

-- ═══ (2) a regra ═══
create or replace function public._fn_conta_no_periodo(p_conta uuid, p_de date, p_ate date)
returns boolean language sql stable security invoker set search_path = public as $f$
  /* CONTA-INATIVAR-DATA-01 — A REGRA ÚNICA de "a conta aparece neste período": mes_inicio ≤ o mês final E (aberta no período OU com
     saldo final ≠ 0 num mês dele OU lançamento vivo nele OU extrato vivo nele). Ativa ou não. */
  select exists (
    select 1 from public.financeiro_contas_bancarias b
     where b.id = p_conta
       and (b.mes_inicio is null or b.mes_inicio <= to_char(p_ate, 'YYYY-MM'))
       and ( (b.inativa_desde is null and b.ativa)
          or (b.inativa_desde is not null and p_de < b.inativa_desde)
          or exists (select 1 from public.financeiro_saldos_bancarios_v2 s
                      where s.conta_bancaria_id = b.id and s.ano_mes between to_char(p_de, 'YYYY-MM') and to_char(p_ate, 'YYYY-MM')
                        and round(coalesce(s.saldo_final, 0), 2) <> 0)
          or exists (select 1 from public.financeiro_lancamentos_v2 l
                      where l.cliente_id = b.cliente_id and l.conta_bancaria_id = b.id and l.cancelado is not true
                        and coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) between p_de and p_ate)
          or exists (select 1 from public.financeiro_lancamentos_v2 l
                      where l.cliente_id = b.cliente_id and l.conta_destino_id = b.id and l.cancelado is not true
                        and coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) between p_de and p_ate)
          or exists (select 1 from public.extrato_bancario_v2 e
                      where e.conta_bancaria_id = b.id and e.cancelado_em is null and e.status <> 'ignorado'
                        and e.data_movimento between p_de and p_ate) ))
$f$;

create or replace function public._fn_conta_no_mes(p_conta uuid, p_ano_mes text)
returns boolean language sql stable security invoker set search_path = public as $f$
  /* CONTA-INATIVAR-DATA-01 — a regra no mês ('AAAA-MM'); mês ilegível = falso */
  select case when p_ano_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'
    then public._fn_conta_no_periodo(p_conta, to_date(p_ano_mes || '-01', 'YYYY-MM-DD'),
                                     (to_date(p_ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date)
    else false end
$f$;

revoke all on function public._fn_conta_no_periodo(uuid, date, date) from public, anon;
revoke all on function public._fn_conta_no_mes(uuid, text) from public, anon;
grant execute on function public._fn_conta_no_periodo(uuid, date, date) to authenticated;
grant execute on function public._fn_conta_no_mes(uuid, text) to authenticated;

-- ═══ (3) os leitores do banco trocam o `ativa` pela regra (patch guardado por md5; o trecho casa o número de vezes esperado) ═══
do $patch$
declare
  r record; v_def text; v_md5 text; v_n int; v_acl text; v_cfg text; v_oid regprocedure;
begin
  for r in select * from (values
    ('public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)', 'eb5f162e679599ffbdce0a478d6c78cb',
       $$b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= p_ano_mes)$$, $$public._fn_conta_no_mes(b.id, p_ano_mes)$$, 2),
    ('public.fn_conciliacao_status_ano(uuid, integer)', 'a7c3ee430a203d02e5ce5515b9481b95',
       $$b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= v_mes)$$, $$public._fn_conta_no_mes(b.id, v_mes)$$, 3),
    ('public.fn_conta_bancaria_efeito_conciliacao(uuid)', '1fa48d3fd6f96f15e06c6493349deaab',
       $$x.ativa AND (x.mes_inicio IS NULL OR x.mes_inicio <= v_mes)$$, $$public._fn_conta_no_mes(x.id, v_mes)$$, 1),
    ('public.fn_vg_saldos(uuid, date, date, uuid[], date, text[], boolean)', 'fc3a3a1bedadbb18b95d3a044b4f75ef',
       $$CASE WHEN v_todas THEN c.ativa AND (lower($$, $$CASE WHEN v_todas THEN public._fn_conta_no_periodo(c.id, p_de, p_ate) AND (lower($$, 1),
    ('public.fn_vg_partes(uuid, date, date, uuid[], uuid[], uuid, text, date, text[], boolean, boolean)', '90171de8978e54bcb82f62fee7672000',
       $$CASE WHEN v_todas THEN c.ativa AND (lower($$, $$CASE WHEN v_todas THEN public._fn_conta_no_periodo(c.id, p_de, p_ate) AND (lower($$, 1),
    ('public.fn_vg_gaveta_ordenada(uuid, date, date, text, text, text[], text, uuid[], uuid[], text, date, text[], boolean, integer, integer, text, text)', 'e405de1a79e07785179cecad620e4816',
       $$CASE WHEN v_todas THEN c.ativa AND (lower($$, $$CASE WHEN v_todas THEN public._fn_conta_no_periodo(c.id, p_de, p_ate) AND (lower($$, 1),
    ('public.fn_faturas_cartao(uuid, text)', '051c2700ef027e8af1a7d0677b69b73d',
       $$c.ativa IS NOT FALSE AND (c.tipo_conta ILIKE$$, $$public._fn_conta_no_mes(c.id, p_ano_mes) AND (c.tipo_conta ILIKE$$, 1)
  ) as t(fn, md5, de, para, vezes) loop
    v_oid := r.fn::regprocedure;
    select md5(prosrc), pg_get_functiondef(oid), proacl::text, proconfig::text into v_md5, v_def, v_acl, v_cfg from pg_proc where oid = v_oid;
    if v_md5 is distinct from r.md5 then
      raise exception 'CONTA-INATIVAR-DATA-01: % mudou desde a conferência (md5 %, esperava %)', r.fn, v_md5, r.md5; end if;
    v_n := (length(v_def) - length(replace(v_def, r.de, ''))) / length(r.de);
    if v_n <> r.vezes then raise exception 'CONTA-INATIVAR-DATA-01: em % o trecho casa % vez(es), esperava %', r.fn, v_n, r.vezes; end if;
    execute replace(v_def, r.de, r.para);
    if (select md5(prosrc) from pg_proc where oid = v_oid) = r.md5 then raise exception 'CONTA-INATIVAR-DATA-01: % não mudou', r.fn; end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl or (select proconfig::text from pg_proc where oid = v_oid) is distinct from v_cfg then
      raise exception 'CONTA-INATIVAR-DATA-01: a ACL ou a configuração de % mudou', r.fn; end if;
  end loop;
end $patch$;

-- ═══ (5a) a conferência de inativar (interna) e a prévia que a tela mostra ═══
create or replace function public._fn_conta_inativar_conferencia(p_conta uuid, p_desde date)
returns jsonb language plpgsql stable security definer set search_path = public as $f$
/* CONTA-INATIVAR-DATA-01 — inativar desde `p_desde` (dia 1º) pede: saldo ZERO no fim do mês anterior (o `saldo_final` do sistema),
   nenhum lançamento vivo (aberto OU realizado) e nenhum extrato vivo a partir da data. Mostra os números; não esconde nada. */
declare
  v_cli uuid; v_mes_ant text := to_char(p_desde - 1, 'YYYY-MM'); v_saldo numeric; v_tem_saldo boolean;
  v_abertos int; v_realizados int; v_extrato int; v_frase text := null;
begin
  select cliente_id into v_cli from public.financeiro_contas_bancarias where id = p_conta;
  select s.saldo_final, true into v_saldo, v_tem_saldo from public.financeiro_saldos_bancarios_v2 s
   where s.conta_bancaria_id = p_conta and s.ano_mes = v_mes_ant limit 1;
  select count(*) filter (where coalesce(l.status_transacao, '') not in ('realizado', 'conciliado')),
         count(*) filter (where l.status_transacao in ('realizado', 'conciliado'))
    into v_abertos, v_realizados
    from public.financeiro_lancamentos_v2 l
   where l.cliente_id = v_cli and p_conta in (l.conta_bancaria_id, l.conta_destino_id) and l.cancelado is not true
     and coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) >= p_desde;
  select count(*) into v_extrato from public.extrato_bancario_v2 e
   where e.conta_bancaria_id = p_conta and e.cancelado_em is null and e.status <> 'ignorado' and e.data_movimento >= p_desde;
  if v_tem_saldo is null then
    v_frase := format('Não há o saldo de %s no sistema para conferir. Nada foi gravado.', to_char(p_desde - 1, 'MM/YYYY'));
  elsif round(coalesce(v_saldo, 0), 2) <> 0 then
    v_frase := format('A conta tem saldo de R$ %s no fim de %s: zere antes de inativar. Nada foi gravado.',
      translate(to_char(v_saldo, 'FM999,999,999,990.00'), ',.', '.,'), to_char(p_desde - 1, 'MM/YYYY'));
  elsif v_abertos + v_realizados > 0 then
    v_frase := format('A conta tem %s lançamento(s) a partir de %s (%s em aberto, %s realizado(s)): mova-os antes de inativar. Nada foi gravado.',
      v_abertos + v_realizados, to_char(p_desde, 'DD/MM/YYYY'), v_abertos, v_realizados);
  elsif v_extrato > 0 then
    v_frase := format('A conta tem %s linha(s) de extrato a partir de %s. Nada foi gravado.', v_extrato, to_char(p_desde, 'DD/MM/YYYY'));
  end if;
  return jsonb_build_object('desde', p_desde, 'mes_do_saldo', v_mes_ant, 'saldo', v_saldo, 'tem_saldo', coalesce(v_tem_saldo, false),
    'abertos', v_abertos, 'realizados', v_realizados, 'extrato', v_extrato, 'pode', v_frase is null, 'frase', v_frase);
end $f$;
revoke all on function public._fn_conta_inativar_conferencia(uuid, date) from public, anon, authenticated;

create or replace function public.fn_conta_inativar_previa(p_cliente_id uuid, p_conta_id uuid, p_desde date)
returns jsonb language plpgsql stable security definer set search_path = public as $f$
/* CONTA-INATIVAR-DATA-01 — a prévia do "Inativa desde" na aba Dados da conta: a conferência + os lançamentos a partir da data (até 50,
   o mais perto primeiro). Só lê. */
declare v jsonb; v_cli uuid;
begin
  select cliente_id into v_cli from public.financeiro_contas_bancarias where id = p_conta_id;
  if v_cli is null or v_cli is distinct from p_cliente_id or not public.tenant_ok(v_cli) then
    raise exception 'Sem acesso a esta conta.' using errcode = '42501'; end if;
  if p_desde is null or extract(day from p_desde) <> 1 then
    raise exception 'A conta fica inativa a partir do dia 1º de um mês.' using errcode = '22023'; end if;
  v := public._fn_conta_inativar_conferencia(p_conta_id, p_desde);
  return v || jsonb_build_object('lancamentos', coalesce((
    select jsonb_agg(x order by x.dia, x.id) from (
      select l.id, coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) dia, l.valor, l.status_transacao status, l.descricao
        from public.financeiro_lancamentos_v2 l
       where l.cliente_id = v_cli and p_conta_id in (l.conta_bancaria_id, l.conta_destino_id) and l.cancelado is not true
         and coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) >= p_desde
       order by 2, 1 limit 50) x), '[]'::jsonb));
end $f$;
revoke all on function public.fn_conta_inativar_previa(uuid, uuid, date) from public, anon;
grant execute on function public.fn_conta_inativar_previa(uuid, uuid, date) to authenticated;

-- ═══ (5b) o escritor da tela: "inativa_desde" entra; inativar exige a data e a conferência; reativar limpa a data ═══
do $patch$
declare
  c_fn constant regprocedure := 'public.fn_conta_bancaria_salvar(uuid, uuid, jsonb)'::regprocedure;
  c_md5 constant text := '89fb35b749799b14f29192b5e17178f6';
  v_def text; v_md5 text; v_acl text; v_cfg text; v_novo text; i int;
  trechos constant text[][] := array[
    array[$$'partida_vencimento','partida_total','fonte_fatura'];$$,
          $$'partida_vencimento','partida_total','fonte_fatura','inativa_desde'];$$],
    array[$$  v_tipo text; v_tipo_atual text; v_partida text := NULL; v_hist_n int := 0; v_hist_min date; v_mes_partida text;$$,
          $$  v_tipo text; v_tipo_atual text; v_partida text := NULL; v_hist_n int := 0; v_hist_min date; v_mes_partida text;
  v_ativa_nova boolean; v_desde date; v_conf jsonb;$$],
    array[$$    v_new.sem_extrato_bancario := coalesce(v_new.sem_extrato_bancario, false);
    INSERT INTO$$,
          $$    v_new.sem_extrato_bancario := coalesce(v_new.sem_extrato_bancario, false);
    -- CONTA-INATIVAR-DATA-01: a conta nasce ativa e sem data de inativação
    v_new.ativa := true; v_new.inativa_desde := NULL;
    INSERT INTO$$],
    array[$$  IF v_old.id IS NOT NULL THEN
  UPDATE public.financeiro_contas_bancarias c SET$$,
          $$  -- CONTA-INATIVAR-DATA-01: inativar exige a data (dia 1º) e a conferência (saldo zero no mês anterior, nada a partir da data);
  -- reativar limpa a data. A trilha é a do gatilho de auditoria de sempre.
  IF v_old.id IS NOT NULL THEN
    v_ativa_nova := CASE WHEN d ? 'ativa' THEN coalesce((d->>'ativa')::boolean, v_old.ativa) ELSE v_old.ativa END;
    IF v_ativa_nova THEN
      v_desde := NULL;
    ELSE
      v_desde := CASE WHEN d ? 'inativa_desde' THEN nullif(d->>'inativa_desde', '')::date ELSE v_old.inativa_desde END;
      IF v_desde IS NULL THEN
        RAISE EXCEPTION 'Informe desde quando a conta está inativa (Inativa desde).' USING ERRCODE = '22023';
      END IF;
      IF extract(day from v_desde) <> 1 THEN
        RAISE EXCEPTION 'A conta fica inativa a partir do dia 1º de um mês.' USING ERRCODE = '22023';
      END IF;
      IF v_old.ativa OR v_desde IS DISTINCT FROM v_old.inativa_desde THEN
        v_conf := public._fn_conta_inativar_conferencia(p_conta_id, v_desde);
        IF NOT (v_conf->>'pode')::boolean THEN RAISE EXCEPTION '%', v_conf->>'frase' USING ERRCODE = '22023'; END IF;
      END IF;
    END IF;
  ELSIF d ? 'inativa_desde' AND nullif(d->>'inativa_desde', '') IS NOT NULL THEN
    RAISE EXCEPTION 'Conta nova nasce ativa: a data de inativação entra depois.' USING ERRCODE = '22023';
  END IF;

  IF v_old.id IS NOT NULL THEN
  UPDATE public.financeiro_contas_bancarias c SET$$],
    array[$$    ativa = CASE WHEN d ? 'ativa' THEN coalesce((d->>'ativa')::boolean, c.ativa) ELSE c.ativa END,$$,
          $$    ativa = CASE WHEN d ? 'ativa' THEN coalesce((d->>'ativa')::boolean, c.ativa) ELSE c.ativa END,
    inativa_desde = v_desde,$$]
  ];
begin
  select md5(prosrc), pg_get_functiondef(oid), proacl::text, proconfig::text into v_md5, v_def, v_acl, v_cfg from pg_proc where oid = c_fn;
  if v_md5 is distinct from c_md5 then
    raise exception 'CONTA-INATIVAR-DATA-01: fn_conta_bancaria_salvar mudou desde a conferência (md5 %, esperava %)', v_md5, c_md5; end if;
  v_novo := v_def;
  for i in 1 .. array_length(trechos, 1) loop
    if (length(v_novo) - length(replace(v_novo, trechos[i][1], ''))) / length(trechos[i][1]) <> 1 then
      raise exception 'CONTA-INATIVAR-DATA-01: o trecho % do salvar não casa exatamente 1 vez', i; end if;
    v_novo := replace(v_novo, trechos[i][1], trechos[i][2]);
  end loop;
  execute v_novo;
  if (select md5(prosrc) from pg_proc where oid = c_fn) = c_md5 then raise exception 'CONTA-INATIVAR-DATA-01: o salvar não mudou'; end if;
  if (select proacl::text from pg_proc where oid = c_fn) is distinct from v_acl or (select proconfig::text from pg_proc where oid = c_fn) is distinct from v_cfg then
    raise exception 'CONTA-INATIVAR-DATA-01: a ACL ou a configuração do salvar mudou'; end if;
end $patch$;

-- ═══ (4) o lançamento novo (ou trocado para a conta) com data ≥ "Inativa desde" é recusado ═══
create or replace function public._fn_lancamento_conta_inativa()
returns trigger language plpgsql security definer set search_path = public as $f$
/* CONTA-INATIVAR-DATA-01 — a conta inativa desde D não recebe lançamento NOVO com data (pagamento, senão vencimento, senão competência)
   em D ou depois; nem lançamento TROCADO para ela nessas datas. O que já está nela não é tocado (editar, cancelar e conciliar seguem). */
declare v_d date := coalesce(NEW.data_pagamento, NEW.data_vencimento, NEW.data_competencia); v_desde date; v_nome text;
begin
  if NEW.cancelado is true or v_d is null then return NEW; end if;
  select b.inativa_desde, coalesce(nullif(btrim(b.nome_exibicao), ''), b.nome_conta) into v_desde, v_nome
    from public.financeiro_contas_bancarias b
   where b.inativa_desde is not null and b.inativa_desde <= v_d
     and ( (b.id = NEW.conta_bancaria_id and (TG_OP = 'INSERT' or NEW.conta_bancaria_id is distinct from OLD.conta_bancaria_id))
        or (b.id = NEW.conta_destino_id and (TG_OP = 'INSERT' or NEW.conta_destino_id is distinct from OLD.conta_destino_id)) )
   order by b.inativa_desde limit 1;
  if v_desde is not null then
    raise exception 'A conta % está inativa desde %: lançamento novo nela só com data antes disso.', v_nome, to_char(v_desde, 'DD/MM/YYYY')
      using errcode = '23514';
  end if;
  return NEW;
end $f$;
revoke all on function public._fn_lancamento_conta_inativa() from public, anon, authenticated;
create trigger trg_00_conta_inativa before insert or update of conta_bancaria_id, conta_destino_id
  on public.financeiro_lancamentos_v2 for each row execute function public._fn_lancamento_conta_inativa();
