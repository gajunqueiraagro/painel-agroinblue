-- FIN-FINANC-28 · EDITAR = CADASTRO NOVO v2 (Gabriel 18/10/2026, GO das cinco pecas da FASE 0). Financiamento, emprestimo e consorcio;
-- compra parcelada fica com os escritores dela (fn_parcelamento_*).
--
--   a. `financiamento_parcelas.ajustada` (boolean, default false): a parcela que o operador mexeu a' mao.
--   b. fn_financiamento_salvar_cabecalho(id, dados, simular): grava o CABECALHO (o que nao e' cronograma muda direto) e sincroniza a
--      CAPTACAO no banco (substitui o `saveEdit` da tela). Devolve `cronograma_mudou` + os campos: e' a tela que acende "Regerar".
--      NAO desloca parcela nenhuma (o deslocamento de dias do `saveEdit` sai: mudar o 1º vencimento acende o Regerar).
--   c. fn_financiamento_parcelas_editar(id, mudancas, simular): vencimento / principal / juros de parcela EM ABERTO, acrescentar e
--      retirar; parcela paga, com pagamento registrado, vinculada ou casada com o extrato RECUSA, com o motivo. Marca `ajustada`.
--   d. fn_financiamento_parcelas_regerar(id, modo, simular): regera as parcelas em aberto por `fn_financiamento_cronograma` a partir do
--      saldo da fonte unica (`fn_financiamento_saldo`). Pagas, travadas e — com 'manter_ajustes' — as ajustadas ficam intactas.
--   e. `financiamento_parcelas_operacoes` (antes x depois de cada operacao) + fn_financiamento_parcelas_desfazer(operacao, motivo, simular):
--      so' a ULTIMA operacao viva do contrato; recusa se uma parcela tocada ficou travada depois.
--
-- REGRAS COMUNS: guarda pelo cliente do contrato (`_fn_contrato_do_usuario`: tenant_ok + 42501, sem usuario tambem); contrato vigente
-- (ativo ou prorrogado); SIMULACAO = GRAVACAO (o mesmo caminho, desfeito por SQLSTATE 'FCSIM'; a recusa volta em `recusa`); depois de
-- c/d/e o numero das parcelas vivas segue a ordem do vencimento, o contrato ganha total_parcelas e vencimento_final, e o MOTOR
-- (`fn_reconciliar_parcela_financiamento`) roda em toda parcela viva NAO travada — e' ele quem cria, atualiza ou cancela os lancamentos.
-- A parcela retirada vai a 'cancelado' e os lancamentos em aberto dela saem pelo dono (`fn_cancelar_lancamento_auditoria`).
set local lock_timeout = '2s';

-- a ------------------------------------------------------------------------------------------------------------------------------
alter table public.financiamento_parcelas add column if not exists ajustada boolean not null default false;

-- e (tabela) ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.financiamento_parcelas_operacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  financiamento_id uuid not null references public.financiamentos(id) on delete restrict,
  tipo text not null check (tipo in ('editar', 'regerar')),
  modo text check (modo is null or modo in ('manter_ajustes', 'recalcular_todas')),
  antes jsonb not null,
  depois jsonb not null,
  feita_em timestamptz not null default clock_timestamp(),  -- clock: duas operacoes na mesma transacao se ordenam
  feita_por uuid,
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeito_motivo text,
  constraint fin_parcelas_operacoes_desfeita_chk check ((desfeita_em is null) = (desfeito_motivo is null))
);
create index if not exists idx_fin_parcelas_operacoes_contrato on public.financiamento_parcelas_operacoes (financiamento_id, feita_em desc);
alter table public.financiamento_parcelas_operacoes enable row level security;
drop policy if exists fin_parcelas_operacoes_select on public.financiamento_parcelas_operacoes;
create policy fin_parcelas_operacoes_select on public.financiamento_parcelas_operacoes for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financiamento_parcelas_operacoes from public, anon, authenticated;
grant select on public.financiamento_parcelas_operacoes to authenticated;
grant all on public.financiamento_parcelas_operacoes to service_role;

-- internas -------------------------------------------------------------------------------------------------------------------------
/* o motivo de a parcela NAO poder mudar (nulo = pode): paga, pagamento registrado, vinculo vivo, lancamento casado com o extrato */
create or replace function public._fn_parcela_credito_trava(p_parcela_id uuid)
returns text language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare q public.financiamento_parcelas%rowtype;
begin
  select * into q from public.financiamento_parcelas where id = p_parcela_id;
  if not found then return 'Parcela não encontrada.'; end if;
  if public._fn_parcela_esta_paga(q.id) then return format('A parcela %s já está paga.', q.numero_parcela); end if;
  if exists (select 1 from public.financiamento_parcela_vinculos v where v.parcela_id = q.id and v.desfeito_em is null) then
    return format('A parcela %s tem pagamento vinculado: desvincule antes.', q.numero_parcela);
  end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id in (q.lancamento_id, q.lancamento_juros_id)
               and not coalesce(l.cancelado, false) and l.status_transacao in ('realizado', 'conciliado')) then
    return format('A parcela %s já tem pagamento registrado.', q.numero_parcela);
  end if;
  if (q.lancamento_id is not null and public._fin_lancamento_casado_com_extrato(q.lancamento_id))
     or (q.lancamento_juros_id is not null and public._fin_lancamento_casado_com_extrato(q.lancamento_juros_id)) then
    return format('A parcela %s tem lançamento casado com o extrato: desfaça a conciliação antes.', q.numero_parcela);
  end if;
  return null;
end $$;

/* a foto de todas as parcelas do contrato (canceladas inclusive), para a trilha e o desfazer */
create or replace function public._fn_parcelas_foto(p_fin uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'numero_parcela', q.numero_parcela, 'data_vencimento', q.data_vencimento,
           'valor_principal', q.valor_principal, 'valor_juros', q.valor_juros, 'valor_total', q.valor_total, 'status', q.status,
           'ajustada', q.ajustada, 'tipo', q.tipo) order by q.numero_parcela, q.data_vencimento, q.id), '[]'::jsonb)
  from public.financiamento_parcelas q where q.financiamento_id = p_fin
$$;

/* o contrato tem de ser de credito e vigente; devolve a linha */
create or replace function public._fn_contrato_credito_vigente(p_fin uuid)
returns public.financiamentos language plpgsql security definer set search_path = pg_catalog, public
as $$
declare f public.financiamentos%rowtype;
begin
  f := public._fn_contrato_do_usuario(p_fin);
  if f.natureza = 'parcelamento' then
    raise exception using errcode = 'P0001', message = 'Compra parcelada se edita pela grade de parcelas dela.';
  end if;
  if coalesce(f.status, '') not in ('ativo', 'prorrogado') then
    raise exception using errcode = 'P0001', message = format('Contrato %s: as parcelas não mudam mais.', f.status);
  end if;
  return f;
end $$;

/* retira a parcela: os lancamentos em aberto saem pelo dono do cancelamento; a parcela vai a 'cancelado' */
create or replace function public._fn_parcela_credito_retirar(p_parcela_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare q public.financiamento_parcelas%rowtype; v_l uuid;
begin
  select * into q from public.financiamento_parcelas where id = p_parcela_id for update;
  foreach v_l in array array_remove(array[q.lancamento_id, q.lancamento_juros_id], null) loop
    if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = v_l and not coalesce(l.cancelado, false)) then
      perform public.fn_cancelar_lancamento_auditoria(v_l, p_motivo);
    end if;
  end loop;
  update public.financiamento_parcelas set status = 'cancelado', lancamento_id = null, lancamento_juros_id = null, updated_at = now()
   where id = p_parcela_id;
end $$;

/* depois de mexer: numero na ordem do vencimento, total e vencimento final no contrato, e o motor nas vivas nao travadas */
create or replace function public._fn_parcelas_credito_fechar(p_fin uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare q record; v_n int := 0; v_motor int := 0;
begin
  for q in select id from public.financiamento_parcelas where financiamento_id = p_fin and coalesce(status, '') <> 'cancelado'
            order by data_vencimento, numero_parcela, created_at, id loop
    v_n := v_n + 1;
    update public.financiamento_parcelas set numero_parcela = v_n where id = q.id and numero_parcela is distinct from v_n;
  end loop;
  update public.financiamentos f set total_parcelas = v_n,
         vencimento_final = (select max(x.data_vencimento) from public.financiamento_parcelas x where x.financiamento_id = p_fin and coalesce(x.status, '') <> 'cancelado'),
         updated_at = now()
   where f.id = p_fin;
  for q in select id from public.financiamento_parcelas where financiamento_id = p_fin and coalesce(status, '') <> 'cancelado' order by numero_parcela loop
    if public._fn_parcela_credito_trava(q.id) is null then
      perform public.fn_reconciliar_parcela_financiamento(q.id, false, true, null);
      v_motor := v_motor + 1;
    end if;
  end loop;
  return jsonb_build_object('parcelas', v_n, 'motor', v_motor);
end $$;

create or replace function public._fn_parcelas_operacao_registrar(p_fin uuid, p_tipo text, p_modo text, p_antes jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  insert into public.financiamento_parcelas_operacoes (cliente_id, financiamento_id, tipo, modo, antes, depois, feita_por)
  select f.cliente_id, f.id, p_tipo, p_modo, p_antes, public._fn_parcelas_foto(f.id), auth.uid() from public.financiamentos f where f.id = p_fin
  returning id into v_id;
  return v_id;
end $$;

-- b ------------------------------------------------------------------------------------------------------------------------------
create or replace function public._fn_financiamento_salvar_cabecalho_exec(p_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  f public.financiamentos%rowtype; n public.financiamentos%rowtype; d jsonb := coalesce(p_dados, '{}'::jsonb);
  c_campos constant text[] := array['descricao','numero_contrato','tipo_financiamento','credor_id','conta_bancaria_id','fazenda_id','valor_total',
    'data_contrato','data_primeira_parcela','total_parcelas','taxa_aa','sistema_amortizacao','carencia_ate','periodicidade','tipo_taxa',
    'plano_conta_parcela_id','plano_principal_id','plano_juros_id','garantias','finalidade','observacao','gerar_lancamento_captacao','plano_conta_captacao_id'];
  k text; v_cron text[] := '{}'; v_cap text := 'nada'; v_lanc uuid; v_aa numeric;
begin
  f := public._fn_contrato_do_usuario(p_id);
  if f.natureza = 'parcelamento' then raise exception using errcode = 'P0001', message = 'Compra parcelada se edita pelo diálogo dela.'; end if;
  for k in select jsonb_object_keys(d) loop
    if not k = any(c_campos) then raise exception using errcode = 'P0001', message = format('Campo %s não se edita aqui.', k); end if;
  end loop;
  if d ? 'descricao' and nullif(btrim(coalesce(d->>'descricao', '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Informe a descrição do contrato.'; end if;
  if d ? 'valor_total' and coalesce((d->>'valor_total')::numeric, 0) <= 0 then
    raise exception using errcode = 'P0001', message = 'Informe o valor contratado.'; end if;

  n := f;
  if d ? 'descricao' then n.descricao := btrim(d->>'descricao'); end if;
  if d ? 'numero_contrato' then n.numero_contrato := nullif(btrim(coalesce(d->>'numero_contrato', '')), ''); end if;
  if d ? 'tipo_financiamento' then n.tipo_financiamento := nullif(d->>'tipo_financiamento', ''); end if;
  if d ? 'credor_id' then n.credor_id := nullif(d->>'credor_id', '')::uuid; end if;
  if d ? 'conta_bancaria_id' then n.conta_bancaria_id := nullif(d->>'conta_bancaria_id', '')::uuid; end if;
  if d ? 'fazenda_id' then n.fazenda_id := nullif(d->>'fazenda_id', '')::uuid; end if;
  if d ? 'valor_total' then n.valor_total := round((d->>'valor_total')::numeric, 2); end if;
  if d ? 'data_contrato' then n.data_contrato := nullif(d->>'data_contrato', '')::date; end if;
  if d ? 'data_primeira_parcela' then n.data_primeira_parcela := nullif(d->>'data_primeira_parcela', '')::date; end if;
  if d ? 'total_parcelas' then n.total_parcelas := nullif(d->>'total_parcelas', '')::int; end if;
  if d ? 'taxa_aa' then
    v_aa := coalesce(nullif(d->>'taxa_aa', '')::numeric, 0);
    n.taxa_juros := v_aa; n.taxa_juros_mensal := round((power(1 + v_aa / 100, 1 / 12.0) - 1) * 100, 6);
  end if;
  if d ? 'sistema_amortizacao' then n.sistema_amortizacao := nullif(d->>'sistema_amortizacao', ''); end if;
  if d ? 'carencia_ate' then n.carencia_ate := nullif(d->>'carencia_ate', '')::date; end if;
  if d ? 'periodicidade' then n.periodicidade := nullif(d->>'periodicidade', ''); end if;
  if d ? 'tipo_taxa' then n.tipo_taxa := nullif(d->>'tipo_taxa', ''); end if;
  if d ? 'plano_conta_parcela_id' then n.plano_conta_parcela_id := nullif(d->>'plano_conta_parcela_id', '')::uuid; end if;
  if d ? 'plano_principal_id' then n.plano_principal_id := nullif(d->>'plano_principal_id', '')::uuid; end if;
  if d ? 'plano_juros_id' then n.plano_juros_id := nullif(d->>'plano_juros_id', '')::uuid; end if;
  if d ? 'garantias' then n.garantias := nullif(btrim(coalesce(d->>'garantias', '')), ''); end if;
  if d ? 'finalidade' then n.finalidade := nullif(d->>'finalidade', ''); end if;
  if d ? 'observacao' then n.observacao := nullif(btrim(coalesce(d->>'observacao', '')), ''); end if;
  if d ? 'gerar_lancamento_captacao' then n.gerar_lancamento_captacao := coalesce((d->>'gerar_lancamento_captacao')::boolean, false); end if;
  if d ? 'plano_conta_captacao_id' then n.plano_conta_captacao_id := nullif(d->>'plano_conta_captacao_id', '')::uuid; end if;

  /* o que muda o CRONOGRAMA (a tela acende "Regerar parcelas em aberto"); o resto e' so' cabecalho */
  if n.sistema_amortizacao is distinct from f.sistema_amortizacao then v_cron := array_append(v_cron, 'sistema'); end if;
  if coalesce(n.taxa_juros_mensal, 0) is distinct from coalesce(f.taxa_juros_mensal, 0) and d ? 'taxa_aa'
     and round(coalesce(n.taxa_juros, 0), 4) is distinct from round(coalesce(f.taxa_juros, 0), 4) then v_cron := array_append(v_cron, 'taxa'); end if;
  if n.total_parcelas is distinct from f.total_parcelas then v_cron := array_append(v_cron, 'prazo'); end if;
  if n.carencia_ate is distinct from f.carencia_ate then v_cron := array_append(v_cron, 'carencia'); end if;
  if n.valor_total is distinct from f.valor_total then v_cron := array_append(v_cron, 'valor'); end if;
  if coalesce(n.periodicidade, 'mensal') is distinct from coalesce(f.periodicidade, 'mensal') then v_cron := array_append(v_cron, 'periodicidade'); end if;
  if n.data_primeira_parcela is distinct from f.data_primeira_parcela then v_cron := array_append(v_cron, 'primeiro_vencimento'); end if;

  update public.financiamentos set descricao = n.descricao, numero_contrato = n.numero_contrato, tipo_financiamento = n.tipo_financiamento,
    credor_id = n.credor_id, conta_bancaria_id = n.conta_bancaria_id, fazenda_id = n.fazenda_id, valor_total = n.valor_total,
    data_contrato = n.data_contrato, data_primeira_parcela = n.data_primeira_parcela, total_parcelas = n.total_parcelas,
    taxa_juros = n.taxa_juros, taxa_juros_mensal = n.taxa_juros_mensal, sistema_amortizacao = n.sistema_amortizacao,
    carencia_ate = n.carencia_ate, periodicidade = n.periodicidade, tipo_taxa = n.tipo_taxa, plano_conta_parcela_id = n.plano_conta_parcela_id,
    plano_principal_id = n.plano_principal_id, plano_juros_id = n.plano_juros_id, garantias = n.garantias, finalidade = n.finalidade,
    observacao = n.observacao, gerar_lancamento_captacao = n.gerar_lancamento_captacao, plano_conta_captacao_id = n.plano_conta_captacao_id,
    updated_at = now()
   where id = p_id;

  /* a CAPTACAO, no banco (era o `saveEdit` da tela): ligada com plano -> atualiza a que existe ou cria; desligada -> cancela pelo dono */
  v_lanc := f.lancamento_captacao_id;
  if coalesce(n.gerar_lancamento_captacao, false) and n.plano_conta_captacao_id is not null then
    if v_lanc is not null and exists (select 1 from public.financeiro_lancamentos_v2 where id = v_lanc) then
      begin
        update public.financeiro_lancamentos_v2 set valor = n.valor_total, data_competencia = n.data_contrato, data_pagamento = n.data_contrato,
          conta_destino_id = n.conta_bancaria_id, conta_bancaria_id = null, favorecido_id = n.credor_id, plano_conta_id = n.plano_conta_captacao_id,
          ano_mes = to_char(n.data_contrato, 'YYYY-MM'), cancelado = false, cancelado_em = null, cancelado_por = null,
          sem_movimentacao_caixa = false, updated_at = now()
         where id = v_lanc;
      exception when sqlstate 'P0001' then
        raise exception using errcode = 'P0001', message = 'A captação está casada com o extrato: desfaça a conciliação no Espelho para mudar valor, data ou conta.';
      end;
      v_cap := 'atualizada';
    else
      insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, financiamento_id, conta_destino_id, conta_bancaria_id, favorecido_id,
        tipo_operacao, sinal, valor, data_competencia, data_pagamento, ano_mes, origem_lancamento, origem_tipo, plano_conta_id, descricao,
        status_transacao, sem_movimentacao_caixa, cancelado)
      values (n.cliente_id, n.fazenda_id, n.id, n.conta_bancaria_id, null, n.credor_id, '1-Entradas', 1, n.valor_total, n.data_contrato,
        n.data_contrato, to_char(n.data_contrato, 'YYYY-MM'), 'financiamento', 'financiamento_captacao', n.plano_conta_captacao_id,
        n.descricao, 'realizado', false, false)
      returning id into v_lanc;
      update public.financiamentos set lancamento_captacao_id = v_lanc where id = p_id;
      v_cap := 'criada';
    end if;
  elsif not coalesce(n.gerar_lancamento_captacao, false) and v_lanc is not null
        and exists (select 1 from public.financeiro_lancamentos_v2 where id = v_lanc and not coalesce(cancelado, false)) then
    perform public.fn_cancelar_lancamento_auditoria(v_lanc, 'captação desligada no contrato');
    v_cap := 'cancelada';
  end if;

  return jsonb_build_object('financiamento_id', p_id, 'cronograma_mudou', cardinality(v_cron) > 0, 'campos_do_cronograma', to_jsonb(v_cron),
    'captacao', v_cap, 'lancamento_captacao_id', v_lanc);
end $$;

create or replace function public.fn_financiamento_salvar_cabecalho(p_id uuid, p_dados jsonb, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  perform public._fn_contrato_do_usuario(p_id);
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_salvar_cabecalho_exec(p_id, p_dados);
      raise exception using errcode = 'FCSIM', message = r::text;
    exception
      when sqlstate 'FCSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  begin
    return public._fn_financiamento_salvar_cabecalho_exec(p_id, p_dados) || jsonb_build_object('simulado', false);
  exception when sqlstate 'P0001' then
    raise exception using errcode = 'P0001', message = sqlerrm || ' Nada foi gravado.';
  end;
end $$;

-- c ------------------------------------------------------------------------------------------------------------------------------
/* mudancas = {"alterar":[{"id", "data_vencimento"?, "valor_principal"?, "valor_juros"?}], "acrescentar":[{"data_vencimento","valor_principal","valor_juros"}],
               "retirar":["id", ...]} */
create or replace function public._fn_financiamento_parcelas_editar_exec(p_id uuid, p_mudancas jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  f public.financiamentos%rowtype; m jsonb := coalesce(p_mudancas, '{}'::jsonb); x jsonb; q public.financiamento_parcelas%rowtype;
  v_antes jsonb; v_trava text; v_d date; v_p numeric; v_j numeric; v_ret uuid; v_fecho jsonb; v_op uuid; v_alt int := 0; v_acr int := 0; v_rem int := 0;
begin
  f := public._fn_contrato_credito_vigente(p_id);
  perform 1 from public.financiamentos where id = p_id for update;
  v_antes := public._fn_parcelas_foto(p_id);
  if coalesce(jsonb_array_length(m->'alterar'), 0) + coalesce(jsonb_array_length(m->'acrescentar'), 0) + coalesce(jsonb_array_length(m->'retirar'), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'Nenhuma mudança nas parcelas.';
  end if;

  for x in select * from jsonb_array_elements(coalesce(m->'alterar', '[]'::jsonb)) loop
    select * into q from public.financiamento_parcelas where id = (x->>'id')::uuid and financiamento_id = p_id and coalesce(status, '') <> 'cancelado';
    if not found then raise exception using errcode = 'P0001', message = 'Parcela não pertence a este contrato.'; end if;
    v_trava := public._fn_parcela_credito_trava(q.id);
    if v_trava is not null then raise exception using errcode = 'P0001', message = v_trava; end if;
    v_d := coalesce(nullif(x->>'data_vencimento', '')::date, q.data_vencimento);
    v_p := round(coalesce(nullif(x->>'valor_principal', '')::numeric, q.valor_principal, 0), 2);
    v_j := round(coalesce(nullif(x->>'valor_juros', '')::numeric, q.valor_juros, 0), 2);
    if v_d is null or v_p < 0 or v_j < 0 or (v_p = 0 and v_j = 0) then
      raise exception using errcode = 'P0001', message = format('Parcela %s: informe o vencimento e o principal ou os juros.', q.numero_parcela);
    end if;
    update public.financiamento_parcelas set data_vencimento = v_d, valor_principal = v_p, valor_juros = v_j, valor_total = v_p + v_j,
           ajustada = true, updated_at = now() where id = q.id;
    v_alt := v_alt + 1;
  end loop;

  for v_ret in select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(m->'retirar', '[]'::jsonb)) e loop
    select * into q from public.financiamento_parcelas where id = v_ret and financiamento_id = p_id and coalesce(status, '') <> 'cancelado';
    if not found then raise exception using errcode = 'P0001', message = 'Parcela não pertence a este contrato.'; end if;
    v_trava := public._fn_parcela_credito_trava(q.id);
    if v_trava is not null then raise exception using errcode = 'P0001', message = v_trava; end if;
    perform public._fn_parcela_credito_retirar(q.id, 'parcela retirada no contrato');
    v_rem := v_rem + 1;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(m->'acrescentar', '[]'::jsonb)) loop
    v_d := nullif(x->>'data_vencimento', '')::date;
    v_p := round(coalesce(nullif(x->>'valor_principal', '')::numeric, 0), 2); v_j := round(coalesce(nullif(x->>'valor_juros', '')::numeric, 0), 2);
    if v_d is null or v_p < 0 or v_j < 0 or (v_p = 0 and v_j = 0) then
      raise exception using errcode = 'P0001', message = 'Parcela nova: informe o vencimento e o principal ou os juros.';
    end if;
    insert into public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status, ajustada)
    values (p_id, f.cliente_id, 9999, v_d, v_p, v_j, v_p + v_j, 'pendente', true);
    v_acr := v_acr + 1;
  end loop;

  if not exists (select 1 from public.financiamento_parcelas where financiamento_id = p_id and coalesce(status, '') <> 'cancelado') then
    raise exception using errcode = 'P0001', message = 'O contrato ficaria sem parcelas: para encerrar, use Dar baixa.';
  end if;
  v_fecho := public._fn_parcelas_credito_fechar(p_id);
  v_op := public._fn_parcelas_operacao_registrar(p_id, 'editar', null, v_antes);
  return jsonb_build_object('operacao_id', v_op, 'alteradas', v_alt, 'acrescentadas', v_acr, 'retiradas', v_rem, 'fecho', v_fecho,
    'antes', v_antes, 'depois', public._fn_parcelas_foto(p_id), 'diferenca_do_saldo', public._fn_parcelas_diferenca_do_saldo(p_id));
end $$;

/* o principal das parcelas em aberto contra o saldo devedor da fonte unica (nulo sem liberacao): a tela mostra em laranja, nunca forca */
create or replace function public._fn_parcelas_diferenca_do_saldo(p_fin uuid)
returns numeric language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_saldo numeric; v_aberto numeric;
begin
  v_saldo := (public._fn_financiamento_saldo(p_fin, current_date) ->> 'saldo')::numeric;
  if v_saldo is null then return null; end if;
  select coalesce(sum(q.valor_principal), 0) into v_aberto from public.financiamento_parcelas q
   where q.financiamento_id = p_fin and coalesce(q.status, '') <> 'cancelado' and not public._fn_parcela_esta_paga(q.id);
  return round(v_aberto - v_saldo, 2);
end $$;

-- d ------------------------------------------------------------------------------------------------------------------------------
create or replace function public._fn_financiamento_parcelas_regerar_exec(p_id uuid, p_modo text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  f public.financiamentos%rowtype; v_antes jsonb; v_saldo numeric; v_guardado numeric := 0; v_P numeric; v_n int; v_mantidas int := 0;
  v_d1 date; v_aa numeric; v_cron jsonb; x jsonb; v_ids uuid[]; v_i int := 0; v_op uuid; v_fecho jsonb; q record;
begin
  if p_modo is null or p_modo not in ('manter_ajustes', 'recalcular_todas') then
    raise exception using errcode = 'P0001', message = 'Escolha "Manter ajustes" ou "Recalcular todas".';
  end if;
  f := public._fn_contrato_credito_vigente(p_id);
  perform 1 from public.financiamentos where id = p_id for update;
  if f.natureza = 'consorcio' then raise exception using errcode = 'P0001', message = 'Consórcio: o cronograma vem da carta e do prazo; edite as parcelas.'; end if;
  if f.sistema_amortizacao is null then raise exception using errcode = 'P0001', message = 'Sistema de amortização não cadastrado: preencha no contrato antes de regerar.'; end if;
  v_saldo := (public._fn_financiamento_saldo(p_id, current_date) ->> 'saldo')::numeric;
  if v_saldo is null then raise exception using errcode = 'P0001', message = 'Sem liberação gravada: o saldo devedor não é conhecido, nada a regerar.'; end if;
  v_antes := public._fn_parcelas_foto(p_id);

  /* quem FICA: paga ou travada (sempre) e, com 'manter_ajustes', a ajustada. O principal em aberto das que ficam sai da base. */
  for q in select x2.* from public.financiamento_parcelas x2 where x2.financiamento_id = p_id and coalesce(x2.status, '') <> 'cancelado' loop
    if public._fn_parcela_credito_trava(q.id) is not null or (p_modo = 'manter_ajustes' and q.ajustada) then
      v_mantidas := v_mantidas + 1;
      if not public._fn_parcela_esta_paga(q.id) then v_guardado := v_guardado + coalesce(q.valor_principal, 0); end if;
    else
      v_ids := v_ids || q.id;
    end if;
  end loop;
  if coalesce(cardinality(v_ids), 0) = 0 then raise exception using errcode = 'P0001', message = 'Nenhuma parcela em aberto para regerar.'; end if;
  v_P := round(v_saldo - v_guardado, 2);
  if v_P <= 0 then raise exception using errcode = 'P0001', message = 'O saldo devedor já está coberto pelas parcelas que ficam: nada a regerar.'; end if;
  v_n := greatest(coalesce(f.total_parcelas, 0) - v_mantidas, 1);
  v_d1 := case when v_mantidas = 0 and f.data_primeira_parcela is not null then f.data_primeira_parcela
               else (select min(x3.data_vencimento) from public.financiamento_parcelas x3 where x3.id = any(v_ids)) end;
  v_aa := case when coalesce(f.taxa_juros, 0) > 0 then f.taxa_juros
               else round(((power(1 + coalesce(f.taxa_juros_mensal, 0) / 100.0, 12) - 1) * 100)::numeric, 4) end;
  v_cron := public.fn_financiamento_cronograma(jsonb_build_object('sistema', f.sistema_amortizacao, 'principal', v_P, 'taxa_aa', v_aa,
    'periodicidade', coalesce(f.periodicidade, 'mensal'), 'primeiro_vencimento', v_d1, 'n', v_n, 'carencia_ate', f.carencia_ate));
  if v_cron->>'recusa' is not null then raise exception using errcode = 'P0001', message = v_cron->>'recusa'; end if;

  /* as linhas do cronograma ocupam as parcelas substituidas, na ordem; sobra -> retirada; falta -> parcela nova */
  for x in select * from jsonb_array_elements(v_cron->'linhas') loop
    v_i := v_i + 1;
    if v_i <= cardinality(v_ids) then
      update public.financiamento_parcelas set data_vencimento = (x->>'vencimento')::date, valor_principal = (x->>'principal')::numeric,
             valor_juros = (x->>'juros')::numeric, valor_total = (x->>'total')::numeric, ajustada = false, updated_at = now()
       where id = v_ids[v_i];
    else
      insert into public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status, ajustada)
      values (p_id, f.cliente_id, 9999, (x->>'vencimento')::date, (x->>'principal')::numeric, (x->>'juros')::numeric, (x->>'total')::numeric, 'pendente', false);
    end if;
  end loop;
  while v_i < cardinality(v_ids) loop
    v_i := v_i + 1;
    perform public._fn_parcela_credito_retirar(v_ids[v_i], 'parcela retirada ao regerar o cronograma');
  end loop;

  v_fecho := public._fn_parcelas_credito_fechar(p_id);
  v_op := public._fn_parcelas_operacao_registrar(p_id, 'regerar', p_modo, v_antes);
  return jsonb_build_object('operacao_id', v_op, 'modo', p_modo, 'base', jsonb_build_object('saldo', v_saldo, 'guardado', v_guardado, 'principal', v_P,
      'parcelas', v_n, 'primeiro_vencimento', v_d1, 'taxa_aa', v_aa, 'sistema', f.sistema_amortizacao, 'mantidas', v_mantidas),
    'cronograma', v_cron - 'linhas', 'fecho', v_fecho, 'antes', v_antes, 'depois', public._fn_parcelas_foto(p_id),
    'diferenca_do_saldo', public._fn_parcelas_diferenca_do_saldo(p_id));
end $$;

-- e (desfazer) -------------------------------------------------------------------------------------------------------------------
create or replace function public._fn_financiamento_parcelas_desfazer_exec(p_operacao_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare o public.financiamento_parcelas_operacoes%rowtype; x jsonb; v_trava text; v_ultima uuid; q public.financiamento_parcelas%rowtype; v_fecho jsonb; v_antes jsonb;
begin
  select * into o from public.financiamento_parcelas_operacoes where id = p_operacao_id for update;
  if not found then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  perform public._fn_contrato_credito_vigente(o.financiamento_id);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo para desfazer.'; end if;
  if o.desfeita_em is not null then raise exception using errcode = 'P0001', message = 'Esta operação já foi desfeita.'; end if;
  select id into v_ultima from public.financiamento_parcelas_operacoes where financiamento_id = o.financiamento_id and desfeita_em is null
   order by feita_em desc, id desc limit 1;
  if v_ultima is distinct from o.id then raise exception using errcode = 'P0001', message = 'Só a última alteração das parcelas se desfaz: desfaça a mais nova antes.'; end if;
  v_antes := public._fn_parcelas_foto(o.financiamento_id);

  /* toda parcela que a operacao tocou tem de seguir em aberto e destravada */
  for x in select * from jsonb_array_elements(o.depois) loop
    if coalesce(x->>'status', '') <> 'cancelado' then
      v_trava := public._fn_parcela_credito_trava((x->>'id')::uuid);
      /* travada que a operacao nao mexeu (so' o numero acompanha a ordem) nao impede; travada que ela mexeu, impede */
      if v_trava is not null and not exists (select 1 from jsonb_array_elements(o.antes) a where (a - 'numero_parcela') = (x - 'numero_parcela')) then
        raise exception using errcode = 'P0001', message = v_trava || ' Ela mudou depois da alteração: o desfazer não a toca.';
      end if;
    end if;
  end loop;

  /* volta cada parcela ao antes; a que nasceu na operacao sai */
  for x in select * from jsonb_array_elements(o.antes) loop
    select * into q from public.financiamento_parcelas where id = (x->>'id')::uuid;
    if found and public._fn_parcela_credito_trava(q.id) is not null then
      update public.financiamento_parcelas set numero_parcela = (x->>'numero_parcela')::int where id = q.id;
    elsif found and (x is distinct from (select e from jsonb_array_elements(o.depois) e where e->>'id' = x->>'id')) then
      update public.financiamento_parcelas set numero_parcela = (x->>'numero_parcela')::int, data_vencimento = (x->>'data_vencimento')::date,
             valor_principal = (x->>'valor_principal')::numeric, valor_juros = (x->>'valor_juros')::numeric, valor_total = (x->>'valor_total')::numeric,
             status = x->>'status', ajustada = (x->>'ajustada')::boolean, updated_at = now()
       where id = q.id;
    end if;
  end loop;
  for x in select * from jsonb_array_elements(o.depois) e where not exists (select 1 from jsonb_array_elements(o.antes) a where a->>'id' = e->>'id') loop
    if coalesce(x->>'status', '') <> 'cancelado' then perform public._fn_parcela_credito_retirar((x->>'id')::uuid, 'desfazer: ' || btrim(p_motivo)); end if;
  end loop;

  v_fecho := public._fn_parcelas_credito_fechar(o.financiamento_id);
  update public.financiamento_parcelas_operacoes set desfeita_em = now(), desfeita_por = auth.uid(), desfeito_motivo = btrim(p_motivo) where id = o.id;
  return jsonb_build_object('operacao_id', o.id, 'fecho', v_fecho, 'antes', v_antes, 'depois', public._fn_parcelas_foto(o.financiamento_id));
end $$;

-- publicas de c/d/e: a mesma casca (guarda, simulacao, recusa) -----------------------------------------------------------------------
create or replace function public.fn_financiamento_parcelas_editar(p_id uuid, p_mudancas jsonb, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  perform public._fn_contrato_do_usuario(p_id);
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_parcelas_editar_exec(p_id, p_mudancas);
      raise exception using errcode = 'FCSIM', message = r::text;
    exception
      when sqlstate 'FCSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  begin
    return public._fn_financiamento_parcelas_editar_exec(p_id, p_mudancas) || jsonb_build_object('simulado', false);
  exception when sqlstate 'P0001' then raise exception using errcode = 'P0001', message = sqlerrm || ' Nada foi gravado.';
  end;
end $$;

create or replace function public.fn_financiamento_parcelas_regerar(p_id uuid, p_modo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  perform public._fn_contrato_do_usuario(p_id);
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_parcelas_regerar_exec(p_id, p_modo);
      raise exception using errcode = 'FCSIM', message = r::text;
    exception
      when sqlstate 'FCSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  begin
    return public._fn_financiamento_parcelas_regerar_exec(p_id, p_modo) || jsonb_build_object('simulado', false);
  exception when sqlstate 'P0001' then raise exception using errcode = 'P0001', message = sqlerrm || ' Nada foi gravado.';
  end;
end $$;

create or replace function public.fn_financiamento_parcelas_desfazer(p_operacao_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb; v_fin uuid;
begin
  select financiamento_id into v_fin from public.financiamento_parcelas_operacoes where id = p_operacao_id;
  if v_fin is null then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  perform public._fn_contrato_do_usuario(v_fin);
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_parcelas_desfazer_exec(p_operacao_id, coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'simulação'));
      raise exception using errcode = 'FCSIM', message = r::text;
    exception
      when sqlstate 'FCSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', sqlerrm));
    end;
  end if;
  begin
    return public._fn_financiamento_parcelas_desfazer_exec(p_operacao_id, p_motivo) || jsonb_build_object('simulado', false);
  exception when sqlstate 'P0001' then raise exception using errcode = 'P0001', message = sqlerrm || ' Nada foi gravado.';
  end;
end $$;

-- ACL: internas fechadas; publicas so' authenticated e service_role -------------------------------------------------------------------
do $acl$
declare s text;
begin
  foreach s in array array[
    'public._fn_parcela_credito_trava(uuid)', 'public._fn_parcelas_foto(uuid)', 'public._fn_contrato_credito_vigente(uuid)',
    'public._fn_parcela_credito_retirar(uuid, text)', 'public._fn_parcelas_credito_fechar(uuid)', 'public._fn_parcelas_operacao_registrar(uuid, text, text, jsonb)',
    'public._fn_financiamento_salvar_cabecalho_exec(uuid, jsonb)', 'public._fn_financiamento_parcelas_editar_exec(uuid, jsonb)',
    'public._fn_parcelas_diferenca_do_saldo(uuid)', 'public._fn_financiamento_parcelas_regerar_exec(uuid, text)',
    'public._fn_financiamento_parcelas_desfazer_exec(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', s);
    execute format('grant execute on function %s to service_role', s);
  end loop;
  foreach s in array array[
    'public.fn_financiamento_salvar_cabecalho(uuid, jsonb, boolean)', 'public.fn_financiamento_parcelas_editar(uuid, jsonb, boolean)',
    'public.fn_financiamento_parcelas_regerar(uuid, text, boolean)', 'public.fn_financiamento_parcelas_desfazer(uuid, text, boolean)'] loop
    execute format('revoke all on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated, service_role', s);
  end loop;
end $acl$;
