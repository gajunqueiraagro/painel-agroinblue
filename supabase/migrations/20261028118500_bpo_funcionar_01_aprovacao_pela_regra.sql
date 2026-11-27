-- BPO-FUNCIONAR-01 (mock aprovado, Gabriel 24/11 06:58) — a APROVAÇÃO PELA REGRA, sem "Enviar". FASE 0: a fila do NJ estava 0 porque
-- só o `fn_aprovacao_enviar` criava linha em `financeiro_aprovacoes` e ninguém enviou; ligar o BPO não criava nada e o "desde" não
-- governava nada. Agora o ESTADO de cada saída é CALCULADO:
--   · aprovado / recusado = a decisão viva em `financeiro_aprovacoes` (como antes: rodada, foto, quem, quando);
--   · aprovado_regra      = está na regra e o valor é MENOR que o limite opcional do cliente (`aprova_abaixo_de`), sem linha;
--   · aguardando          = está na regra e não tem decisão viva (sem linha: nada a "enviar", nada a migrar, nada fantasma);
--   · fora                = fora da regra (BPO desligado, entrada, cancelado, realizado, sem caixa, vencimento antes do "desde").
-- A REGRA (uma só, `_fn_aprovacao_na_regra`): BPO ligado · '2-Saídas' · não cancelada · Previsto/Programado/Agendado · com caixa ·
-- vencimento ≥ desde. (A linha "aguardando" antiga, de quem enviou, fica ignorada: o estado é o mesmo pela regra.)
-- Muda:
--   1. `financeiro_bpo_config.aprova_abaixo_de` (opcional; nulo = tudo passa pelo aprovador) + `fn_bpo_limite_gravar` (só o admin, prévia).
--   2. `fn_aprovacao_estados(cliente, ids)` — o estado por lançamento para a CPR (a página aberta), com quem lançou, se EU posso decidir,
--      documentos, forma, "pronto para pagar" e o pedido ao banco (as mesmas expressões do `fn_aprovacao_lista`, 114290/114300).
--   3. `fn_aprovacao_decidir` (MESMA assinatura): decide o que está AGUARDANDO PELA REGRA, com ou sem linha; QUEM LANÇOU NÃO APROVA
--      (`created_by`); o admin AGROinBLUE que não é aprovador decide "no lugar" só com motivo (fica na trilha, `observacao`).
--   4. `_fn_aprovacao_conferir_foto`: o RECUSADO também volta a "aguardando" quando o lançamento é corrigido (antes só aguardando/aprovado).
--   5. `_fn_trg_aprovacao_agendar`: agendar exige aprovado OU aprovado pela regra (limite); fora da regra não trava — ENTRA DESLIGADA (ver lá).
-- Fica como está: `fn_aprovacao_enviar` (sem chamador depois da tela nova; não se dropa), `fn_aprovacao_lista`, `fn_aprovacao_alertas`,
-- a foto e o destino (114290), `openfinance_pagamentos`. Sem dado de cliente.
set lock_timeout = '2s';

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financeiro_bpo_config'
              and column_name = 'aprova_abaixo_de') then
    raise exception 'BPO-FUNCIONAR-01: a coluna aprova_abaixo_de já existe: refazer.';
  end if;
  if to_regprocedure('public.fn_aprovacao_estados(uuid, uuid[])') is not null then
    raise exception 'BPO-FUNCIONAR-01: fn_aprovacao_estados já existe: refazer.';
  end if;
  if md5(pg_get_functiondef('public.fn_aprovacao_decidir(uuid, uuid[], boolean, text, boolean)'::regprocedure)) <> 'f4a19681c72359848b81027886805e2f'
     or md5(pg_get_functiondef('public._fn_aprovacao_conferir_foto(uuid)'::regprocedure)) <> '7aa079a4b8defcdd3542b29a48e39d16'
     or md5(pg_get_functiondef('public._fn_trg_aprovacao_agendar()'::regprocedure)) <> '23616bd353a7962f6bb34929510b71e4' then
    raise exception 'BPO-FUNCIONAR-01: o corpo de decidir/conferir_foto/agendar não é o esperado: conferir.';
  end if;
end $$;

alter table public.financeiro_bpo_config add column aprova_abaixo_de numeric(14,2) check (aprova_abaixo_de is null or aprova_abaixo_de > 0);

-- a REGRA: está na fila de aprovação? (uma só; a CPR, o decidir e a trava do agendar usam esta)
create function public._fn_aprovacao_na_regra(p_cliente uuid, p_tipo text, p_cancelado boolean, p_status text, p_venc date, p_sem_caixa boolean)
returns boolean language sql stable set search_path = public as $$
  select coalesce(p_tipo = '2-Saídas' and p_cancelado is not true and p_status in ('previsto', 'programado', 'agendado')
         and p_sem_caixa is not true
         and exists (select 1 from financeiro_bpo_config c where c.cliente_id = p_cliente and c.ativo and p_venc >= c.desde), false)
$$;
revoke all on function public._fn_aprovacao_na_regra(uuid, text, boolean, text, date, boolean) from public, anon;
grant execute on function public._fn_aprovacao_na_regra(uuid, text, boolean, text, date, boolean) to authenticated;

-- o ESTADO de um lançamento: a decisão viva manda; senão, a regra (e o limite por valor)
create function public._fn_aprovacao_estado(p_lancamento uuid)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select a.situacao from financeiro_aprovacoes a where a.lancamento_id = l.id and a.situacao in ('aprovado', 'recusado')),
    case when not public._fn_aprovacao_na_regra(l.cliente_id, l.tipo_operacao, l.cancelado, l.status_transacao, l.data_vencimento, l.sem_movimentacao_caixa)
           then 'fora'
         when exists (select 1 from financeiro_bpo_config c where c.cliente_id = l.cliente_id and c.aprova_abaixo_de is not null
                       and abs(l.valor) < c.aprova_abaixo_de) then 'aprovado_regra'
         else 'aguardando' end)
  from financeiro_lancamentos_v2 l where l.id = p_lancamento
$$;
revoke all on function public._fn_aprovacao_estado(uuid) from public, anon;
grant execute on function public._fn_aprovacao_estado(uuid) to authenticated;

-- a CPR: o estado da página aberta (até 1000 ids numa ida)
create function public.fn_aprovacao_estados(p_cliente uuid, p_ids uuid[])
returns table(lancamento_id uuid, estado text, rodada integer, motivo text, observacao text, decidido_por uuid, decidido_em timestamptz,
              lancado_por uuid, lancado_em timestamptz, posso_decidir boolean, tem_nota boolean, tem_boleto boolean, forma text,
              pronto_pagar text, no_banco text, no_banco_data date, destino_mudou boolean)
language plpgsql stable security definer set search_path = public set plan_cache_mode = force_custom_plan as $$
declare
  u uuid := auth.uid();
  v_aprovador boolean;
  v_admin boolean;
begin
  if p_cliente is null or p_ids is null or cardinality(p_ids) > 1000 then raise exception 'BPO: pedido inválido.' using errcode = '22023'; end if;
  if not public.tenant_ok(p_cliente) then raise exception 'BPO: sem acesso a este cliente.' using errcode = '42501'; end if;
  v_aprovador := public._fn_eh_aprovador(p_cliente, u);
  v_admin := public.is_admin_agroinblue(u);
  return query
  with e as (select l.*, public._fn_aprovacao_estado(l.id) as est from financeiro_lancamentos_v2 l
              where l.id = any(p_ids) and l.cliente_id = p_cliente)
  select e.id, e.est, a.rodada, a.motivo, a.observacao, a.decidido_por, a.decidido_em, e.created_by, e.created_at,
         (e.est = 'aguardando' and (v_aprovador or v_admin) and e.created_by is distinct from u),
         exists (select 1 from financeiro_documento_vinculos dv where dv.lancamento_id = e.id),
         exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = e.id and bl.desligado_em is null),
         public._fn_forma_efetiva_pagamento(e.forma_pagamento, f.tipo_recebimento),
         public._fn_pronto_para_pagar(e.tipo_operacao, e.status_transacao, (e.sem_movimentacao_caixa is true),
           public._fn_forma_efetiva_pagamento(e.forma_pagamento, f.tipo_recebimento), e.dados_pagamento,
           exists (select 1 from boleto_lancamentos bl where bl.lancamento_id = e.id and bl.desligado_em is null),
           f.pix_chave, f.banco, f.agencia, f.conta),
         p.situacao, p.data_agendada,
         (e.est = 'aprovado' and coalesce(case when p.situacao in ('criado', 'aguardando_banco', 'agendado', 'pago') then p.destino_md5 end,
            a.foto->>'destino') is distinct from public._fn_aprovacao_destino(e.forma_pagamento, e.dados_pagamento, e.favorecido_id, e.id))
    from e
    left join financeiro_aprovacoes a on a.lancamento_id = e.id and a.situacao in ('aprovado', 'recusado')
    left join financeiro_fornecedores f on f.id = e.favorecido_id
    left join lateral (select x.situacao, x.data_agendada, x.destino_md5 from openfinance_pagamentos x
                        where x.lancamento_id = e.id order by x.criado_em desc, x.id desc limit 1) p on true;
end $$;
revoke all on function public.fn_aprovacao_estados(uuid, uuid[]) from public, anon;
grant execute on function public.fn_aprovacao_estados(uuid, uuid[]) to authenticated;

-- DECIDIR (mesma assinatura): o que está AGUARDANDO PELA REGRA, com ou sem linha; quem lançou não aprova; admin "no lugar" só com motivo
create or replace function public.fn_aprovacao_decidir(p_cliente uuid, p_ids uuid[], p_aprovar boolean, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  v_aprovador boolean;
  v_admin boolean;
  v_no_lugar boolean;
  l record;
  n int := 0;
  v_soma numeric := 0;
  v_viva financeiro_aprovacoes;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if p_cliente is null or p_ids is null or p_aprovar is null or p_simular is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'BPO: pedido inválido.' using errcode = '22023';
  end if;
  v_aprovador := public._fn_eh_aprovador(p_cliente, u);
  v_admin := public.is_admin_agroinblue(u);
  if not public.tenant_ok(p_cliente) or not (v_aprovador or v_admin) then
    raise exception 'BPO: só quem aprova este cliente decide.' using errcode = '42501';
  end if;
  v_no_lugar := not v_aprovador;   -- o admin AGROinBLUE que não é o aprovador decide NO LUGAR: só com motivo, que fica na trilha
  if (not p_aprovar or v_no_lugar) and length(coalesce(v_motivo, '')) < 3 then
    raise exception 'BPO: escreva o motivo.' using errcode = '22023';
  end if;
  for l in select x.* from financeiro_lancamentos_v2 x where x.id = any(p_ids) order by x.data_vencimento, x.id for update loop
    if l.cliente_id is distinct from p_cliente then raise exception 'BPO: lançamento de outro cliente.' using errcode = '42501'; end if;
    if l.created_by = u then
      raise exception 'BPO: quem lançou não aprova (%).', left(coalesce(l.descricao, ''), 60) using errcode = '42501';
    end if;
    if public._fn_aprovacao_estado(l.id) <> 'aguardando' then
      raise exception 'BPO: algum pagamento não está mais aguardando (foi mudado ou já decidido). Atualize a lista.' using errcode = '40001';
    end if;
    n := n + 1; v_soma := v_soma + abs(l.valor);
  end loop;
  if n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'BPO: algum pagamento não é deste cliente ou não existe mais. Atualize a lista.' using errcode = '40001';
  end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'n', n, 'total', round(v_soma, 2), 'no_lugar', v_no_lugar); end if;
  for l in select x.* from financeiro_lancamentos_v2 x where x.id = any(p_ids) loop
    select * into v_viva from financeiro_aprovacoes a where a.lancamento_id = l.id and a.situacao <> 'substituido';
    if v_viva.id is not null then update financeiro_aprovacoes set situacao = 'substituido' where id = v_viva.id; end if;
    insert into financeiro_aprovacoes (cliente_id, lancamento_id, rodada, situacao, motivo, observacao, foto, pedido_por, pedido_em, decidido_por, decidido_em)
    values (p_cliente, l.id, coalesce((select max(rodada) from financeiro_aprovacoes where lancamento_id = l.id), 0) + 1,
            case when p_aprovar then 'aprovado' else 'recusado' end,
            case when p_aprovar then null else v_motivo end,
            case when v_no_lugar then left('decidido pela AGROinBLUE no lugar do aprovador: ' || v_motivo, 300) end,
            public._fn_aprovacao_foto_atual(l.id), coalesce(l.created_by, u), coalesce(l.created_at, now()), u, now());
  end loop;
  return jsonb_build_object('ok', true, 'simulado', false, 'n', n, 'total', round(v_soma, 2), 'no_lugar', v_no_lugar);
end $$;

-- o RECUSADO também volta a aguardar quando o lançamento é corrigido (antes: só aguardando/aprovado)
create or replace function public._fn_aprovacao_conferir_foto(p_lancamento uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a financeiro_aprovacoes;
  l financeiro_lancamentos_v2;
  v_foto jsonb;
  v_comparar jsonb;
  v_mudou text;
begin
  select * into a from financeiro_aprovacoes where lancamento_id = p_lancamento and situacao in ('aguardando', 'aprovado', 'recusado');
  if a.id is null then return; end if;
  select * into l from financeiro_lancamentos_v2 where id = p_lancamento;
  if l.id is null or l.status_transacao = 'realizado' or l.cancelado is true then return; end if;
  -- já no banco: o agendamento não muda por aqui (a trava recusa no lançamento; o fornecedor aparece como destino_mudou)
  if exists (select 1 from openfinance_pagamentos p where p.lancamento_id = p_lancamento
              and p.situacao in ('aguardando_banco', 'agendado', 'pago')) then return; end if;
  v_foto := public._fn_aprovacao_foto_atual(p_lancamento);
  v_comparar := case when a.foto ? 'destino' then v_foto else v_foto - 'destino' end;  -- rodada de antes do P1
  if v_comparar = a.foto then return; end if;
  select string_agg(k, ', ' order by k) into v_mudou from jsonb_object_keys(v_comparar) k where v_comparar->k is distinct from a.foto->k;
  update financeiro_aprovacoes set situacao = 'substituido' where id = a.id;
  insert into financeiro_aprovacoes (cliente_id, lancamento_id, rodada, situacao, observacao, foto, pedido_por)
  values (a.cliente_id, p_lancamento, a.rodada + 1, 'aguardando', left('mudou: ' || coalesce(v_mudou, '?'), 300), v_foto,
          coalesce(auth.uid(), a.pedido_por));
end $$;

-- AGENDAR: só o aprovado (ou aprovado pela regra do limite); fora da regra não trava.
-- ⚠ TRAVA DESLIGADA nesta entrega (Gabriel 24/11, condição do aprovo do 118500): o BPO do NJ está ligado e a tela "Aprovar pagamentos" de
-- hoje não vê o "aguardando pela regra" (ela lê só as linhas de `financeiro_aprovacoes`) — os pagamentos não podem travar. A primeira
-- linha abaixo devolve sem conferir; ela SAI num lote próprio quando a aprovação dentro da CPR estiver publicada (o resto fica pronto).
create or replace function public._fn_trg_aprovacao_agendar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if true then return new; end if;   -- TRAVA DESLIGADA (BPO-FUNCIONAR-01): sai quando a aprovação na CPR estiver no ar
  if new.status_transacao = 'agendado' and (tg_op = 'INSERT' or old.status_transacao is distinct from 'agendado')
     and public._fn_aprovacao_na_regra(new.cliente_id, new.tipo_operacao, new.cancelado, new.status_transacao, new.data_vencimento,
                                       new.sem_movimentacao_caixa)
     and not exists (select 1 from financeiro_aprovacoes a where a.lancamento_id = new.id and a.situacao = 'aprovado')
     and not exists (select 1 from financeiro_bpo_config c where c.cliente_id = new.cliente_id and c.aprova_abaixo_de is not null
                      and abs(new.valor) < c.aprova_abaixo_de) then
    raise exception 'BPO: este pagamento ainda não foi aprovado; só o aprovado vira Agendado.' using errcode = 'P0001',
      hint = 'bpo:sem_aprovacao';
  end if;
  return new;
end $$;

-- o LIMITE opcional por valor (só o admin AGROinBLUE; a prévia diz quantos da regra passam a "aprovado pela regra")
create function public.fn_bpo_limite_gravar(p_cliente uuid, p_valor numeric, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_antes numeric;
  v_n int;
begin
  if not public.is_admin_agroinblue(auth.uid()) then raise exception 'BPO: só a AGROinBLUE configura a aprovação.' using errcode = '42501'; end if;
  if p_cliente is null or p_simular is null or (p_valor is not null and p_valor <= 0) then raise exception 'BPO: pedido inválido.' using errcode = '22023'; end if;
  select aprova_abaixo_de into v_antes from financeiro_bpo_config where cliente_id = p_cliente;
  if not found then raise exception 'BPO: ligue a aprovação neste cliente antes do limite.' using errcode = '22023'; end if;
  select count(*) into v_n from financeiro_lancamentos_v2 l
   where l.cliente_id = p_cliente and p_valor is not null and abs(l.valor) < p_valor
     and public._fn_aprovacao_na_regra(l.cliente_id, l.tipo_operacao, l.cancelado, l.status_transacao, l.data_vencimento, l.sem_movimentacao_caixa)
     and not exists (select 1 from financeiro_aprovacoes a where a.lancamento_id = l.id and a.situacao in ('aprovado', 'recusado'));
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'antes', v_antes, 'depois', p_valor, 'passam_pela_regra', v_n); end if;
  update financeiro_bpo_config set aprova_abaixo_de = p_valor, atualizado_por = auth.uid(), atualizado_em = now() where cliente_id = p_cliente;
  return jsonb_build_object('ok', true, 'simulado', false, 'antes', v_antes, 'depois', p_valor, 'passam_pela_regra', v_n);
end $$;
revoke all on function public.fn_bpo_limite_gravar(uuid, numeric, boolean) from public, anon;
grant execute on function public.fn_bpo_limite_gravar(uuid, numeric, boolean) to authenticated;
