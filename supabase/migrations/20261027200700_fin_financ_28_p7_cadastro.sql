-- FIN-FINANC-28 · PASSO 7 — O CADASTRO NOVO DO CONTRATO (mock `docs/mocks/mock-cadastro-contrato-v2.html`, md5 d24fe2c4c493b5b14e72800404e2afff;
-- Gabriel, 17/10/2026): financiamento / emprestimo com o cronograma gerado NO BANCO (SAC · Price · parcela unica · personalizado) e o
-- CONSORCIO como natureza propria.
--
-- FASE 0 (medido em 17/10/2026):
--   · O cadastro de hoje monta o cronograma NA TELA (`montarCronograma`, juros compostos por periodo, principal igual) e o motor
--     (`fn_reconciliar_parcela_financiamento`) cria os lancamentos com o plano FIXO pela atividade (16020/7010 pecuaria, 16010/12010
--     agricultura). Nao ha' carencia, Price, nem plano de juros escolhido.
--   · `chk_financiamentos_natureza` = financiamento / parcelamento / emprestimo. O consorcio de hoje (c518161d, Agnaldo) e' um
--     'financiamento' — NAO E' TOCADO (nenhum UPDATE em contrato existente nesta migration).
--   · O plano padrao nao tem "Consorcio a contemplar": nasce aqui, no VAO 16040 do grupo Amortizacoes (PLANO-ORDEM-01: subcentro novo
--     entra no vao, nunca renumera), fora do DRE (a parcela do consorcio vira credito na carta, nao e' despesa).
--
-- O QUE NASCE:
--   · natureza 'consorcio' no CHECK; colunas NULAS em `financiamentos`: plano_principal_id, plano_juros_id (o plano escolhido no
--     cadastro novo; NULO nos contratos de antes — o motor so' os le^ quando preenchidos), periodicidade, tipo_taxa, garantias.
--   · `financiamento_consorcio` (1:1): grupo, cota, taxas, seguro, reajuste e a contemplacao (so' registro; o gesto de contemplar
--     — a carta pagando o bem — e' frente propria).
--   · `fn_financiamento_cronograma(p jsonb)` — O GERADOR (IMMUTABLE, so' calculo; a previa da tela e a gravacao usam a MESMA funcao).
--   · `fn_financiamento_criar(p_dados jsonb, p_simular)` — cria contrato + parcelas (do gerador) + consorcio numa transacao e chama o
--     motor de sempre (`fn_reconciliar_financiamento`) para os lancamentos. Guarda `tenant_ok` do cliente; simulacao = a gravacao
--     desfeita ('FCSIM').
--   · motor (patch guardado por md5, 3 ancoras): usa plano_principal_id / plano_juros_id quando preenchidos; descricao propria do
--     consorcio ("Parcela n/N Consorcio …" e "Taxa adm. e seguro …").
--   · saldo (patch guardado por md5, 1 ancora): consorcio nao tem liberacao — sai do "liberado − amortizado" como a compra parcelada.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. Natureza, colunas e a tabela do consorcio ------------------------------------------------------------------------------------
alter table public.financiamentos drop constraint if exists chk_financiamentos_natureza;
alter table public.financiamentos add constraint chk_financiamentos_natureza
  check (natureza = any (array['financiamento'::text, 'parcelamento'::text, 'emprestimo'::text, 'consorcio'::text]));
alter table public.financiamentos
  add column if not exists plano_principal_id uuid references public.financeiro_plano_contas(id),
  add column if not exists plano_juros_id uuid references public.financeiro_plano_contas(id),
  add column if not exists periodicidade text check (periodicidade in ('mensal', 'trimestral', 'semestral', 'anual')),
  add column if not exists tipo_taxa text check (tipo_taxa in ('pre', 'pos')),
  add column if not exists garantias text;

create table if not exists public.financiamento_consorcio (
  financiamento_id uuid primary key references public.financiamentos(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id),
  grupo text, cota text,
  taxa_adm_pct numeric not null default 0 check (taxa_adm_pct >= 0),
  fundo_reserva_pct numeric not null default 0 check (fundo_reserva_pct >= 0),
  seguro_pct_mes numeric not null default 0 check (seguro_pct_mes >= 0),
  reajuste text,
  contemplado boolean not null default false,
  data_contemplacao date,
  forma_contemplacao text check (forma_contemplacao in ('sorteio', 'lance')),
  lance_valor numeric check (lance_valor >= 0),
  created_at timestamptz not null default now()
);
alter table public.financiamento_consorcio enable row level security;
drop policy if exists fin_consorcio_select on public.financiamento_consorcio;
create policy fin_consorcio_select on public.financiamento_consorcio for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.financiamento_consorcio from public, anon;
grant select on public.financiamento_consorcio to authenticated;
grant all on public.financiamento_consorcio to service_role;

-- 2. "Consorcio a contemplar" no plano padrao (o vao 16040; fora do DRE) ------------------------------------------------------------
insert into public.financeiro_plano_contas (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio,
  compoe_dre, ativo, ordem_exibicao)
select null, '2-Saídas', 'Saída Financeira', 'Amortizações', 'Consórcio', 'Consórcio a contemplar', 'administrativo', false, true, 16040
 where not exists (select 1 from public.financeiro_plano_contas where cliente_id is null and subcentro = 'Consórcio a contemplar' and ativo);

-- 3. O gerador do cronograma (so' calculo) -----------------------------------------------------------------------------------------
create or replace function public.fn_financiamento_cronograma(p jsonb)
returns jsonb
language plpgsql immutable set search_path = pg_catalog, public
as $$
declare
  v_modo text := coalesce(p->>'modo', 'financiamento');
  v_sis text := coalesce(nullif(p->>'sistema', ''), 'sac');
  v_P numeric := round(coalesce(nullif(p->>'principal', '')::numeric, 0), 2);
  v_aa numeric := coalesce(nullif(p->>'taxa_aa', '')::numeric, 0);
  v_meses int := case coalesce(p->>'periodicidade', 'mensal') when 'anual' then 12 when 'semestral' then 6 when 'trimestral' then 3 else 1 end;
  v_d1 date := nullif(p->>'primeiro_vencimento', '')::date;
  v_n int := coalesce(nullif(p->>'n', '')::int, 0);
  v_car date := nullif(p->>'carencia_ate', '')::date;
  v_i numeric; v_saldo numeric; v_k int := 0; v_d date; v_am numeric; v_ju numeric; v_pmt numeric; v_lin jsonb := '[]'::jsonb;
  v_tp numeric := 0; v_tj numeric := 0; v_so_juros int := 0; x jsonb;
  v_carta numeric; v_prazo int; v_taxa numeric;
begin
  if v_modo = 'consorcio' then
    v_carta := round(coalesce(nullif(p->>'carta', '')::numeric, 0), 2); v_prazo := coalesce(nullif(p->>'prazo', '')::int, 0);
    if v_carta <= 0 or v_prazo < 1 or v_prazo > 600 or v_d1 is null then
      return jsonb_build_object('recusa', 'Informe a carta de crédito, o prazo (1 a 600 meses) e a 1ª parcela.', 'linhas', '[]'::jsonb);
    end if;
    -- taxa mensal = (adm + fundo de reserva) sobre a carta, dividida pelo prazo, + o seguro do mes sobre a carta
    v_taxa := round((coalesce(nullif(p->>'taxa_adm_pct', '')::numeric, 0) + coalesce(nullif(p->>'fundo_reserva_pct', '')::numeric, 0)) / 100 * v_carta / v_prazo, 2)
            + round(coalesce(nullif(p->>'seguro_pct_mes', '')::numeric, 0) / 100 * v_carta, 2);
    v_saldo := v_carta;
    for v_k in 1..v_prazo loop
      v_am := case when v_k = v_prazo then v_saldo else round(v_carta / v_prazo, 2) end;
      v_saldo := v_saldo - v_am;
      v_lin := v_lin || jsonb_build_object('numero', v_k, 'vencimento', (v_d1 + make_interval(months => v_k - 1))::date,
        'principal', v_am, 'juros', v_taxa, 'total', v_am + v_taxa, 'saldo_apos', v_saldo);
      v_tp := v_tp + v_am; v_tj := v_tj + v_taxa;
    end loop;
    return jsonb_build_object('linhas', v_lin, 'principal_total', v_tp, 'juros_total', v_tj, 'total', v_tp + v_tj,
      'parcelas', v_prazo, 'parcelas_so_juros', 0, 'vencimento_final', (v_d1 + make_interval(months => v_prazo - 1))::date, 'recusa', null);
  end if;

  if v_sis = 'livre' then
    if jsonb_typeof(p->'parcelas') is distinct from 'array' or jsonb_array_length(p->'parcelas') = 0 then
      return jsonb_build_object('recusa', 'Personalizado: digite as parcelas (vencimento, principal e juros).', 'linhas', '[]'::jsonb);
    end if;
    v_saldo := v_P;
    for x in select * from jsonb_array_elements(p->'parcelas') loop
      v_k := v_k + 1; v_d := nullif(x->>'vencimento', '')::date;
      v_am := round(coalesce(nullif(x->>'principal', '')::numeric, 0), 2); v_ju := round(coalesce(nullif(x->>'juros', '')::numeric, 0), 2);
      if v_d is null or v_am < 0 or v_ju < 0 or (v_am = 0 and v_ju = 0) then
        return jsonb_build_object('recusa', format('Parcela %s: informe o vencimento e o principal ou os juros.', v_k), 'linhas', '[]'::jsonb);
      end if;
      v_saldo := v_saldo - v_am; if v_am = 0 then v_so_juros := v_so_juros + 1; end if;
      v_lin := v_lin || jsonb_build_object('numero', v_k, 'vencimento', v_d, 'principal', v_am, 'juros', v_ju, 'total', v_am + v_ju, 'saldo_apos', v_saldo);
      v_tp := v_tp + v_am; v_tj := v_tj + v_ju;
    end loop;
    return jsonb_build_object('linhas', v_lin, 'principal_total', v_tp, 'juros_total', v_tj, 'total', v_tp + v_tj, 'parcelas', v_k,
      'parcelas_so_juros', v_so_juros, 'vencimento_final', (select max((e->>'vencimento')::date) from jsonb_array_elements(v_lin) e),
      'recusa', case when v_tp <> v_P then format('A soma do principal das parcelas (%s) não fecha com o valor contratado (%s).',
        translate(to_char(v_tp, 'FM999,999,999,990.00'), ',.', '.,'), translate(to_char(v_P, 'FM999,999,999,990.00'), ',.', '.,')) end);
  end if;

  if v_P <= 0 or v_d1 is null or v_aa < 0 or (v_sis <> 'bullet' and (v_n < 1 or v_n > 600)) then
    return jsonb_build_object('recusa', 'Informe o valor contratado, a taxa, o 1º vencimento e o nº de parcelas de principal.', 'linhas', '[]'::jsonb);
  end if;
  if v_sis = 'bullet' then v_n := 1; end if;
  v_i := power(1 + v_aa / 100, v_meses / 12.0) - 1;
  v_saldo := v_P;
  -- carencia: parcelas so' de juros enquanto o vencimento nao passa da carencia
  v_d := v_d1;
  while v_car is not null and v_d <= v_car loop
    v_k := v_k + 1; v_ju := round(v_saldo * v_i, 2); v_so_juros := v_so_juros + 1;
    v_lin := v_lin || jsonb_build_object('numero', v_k, 'vencimento', v_d, 'principal', 0, 'juros', v_ju, 'total', v_ju, 'saldo_apos', v_saldo);
    v_tj := v_tj + v_ju;
    v_d := (v_d1 + make_interval(months => v_meses * v_k))::date;
    exit when v_k > 600;
  end loop;
  if v_sis = 'price' then
    v_pmt := case when v_i = 0 then v_P / v_n else v_P * v_i / (1 - power(1 + v_i, -v_n)) end;
  end if;
  for v_n_iter in 1..v_n loop
    v_k := v_k + 1; v_ju := round(v_saldo * v_i, 2);
    v_am := case
      when v_n_iter = v_n then v_saldo
      when v_sis = 'price' then round(v_pmt - v_ju, 2)
      when v_sis = 'bullet' then v_saldo
      else round(v_P / v_n, 2) end;
    v_saldo := v_saldo - v_am;
    v_lin := v_lin || jsonb_build_object('numero', v_k, 'vencimento', v_d, 'principal', v_am, 'juros', v_ju, 'total', v_am + v_ju, 'saldo_apos', v_saldo);
    v_tp := v_tp + v_am; v_tj := v_tj + v_ju;
    v_d := (v_d1 + make_interval(months => v_meses * v_k))::date;
  end loop;
  return jsonb_build_object('linhas', v_lin, 'principal_total', v_tp, 'juros_total', v_tj, 'total', v_tp + v_tj, 'parcelas', v_k,
    'parcelas_so_juros', v_so_juros, 'vencimento_final', (v_lin->(jsonb_array_length(v_lin) - 1))->>'vencimento', 'recusa', null);
end $$;
revoke all on function public.fn_financiamento_cronograma(jsonb) from public, anon;
grant execute on function public.fn_financiamento_cronograma(jsonb) to authenticated, service_role;

-- 4. Criar o contrato (contrato + parcelas + consorcio, e o motor para os lancamentos) ---------------------------------------------
create or replace function public._fn_financiamento_criar_exec(p jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_cli uuid := nullif(p->>'cliente_id', '')::uuid;
  v_nat text := coalesce(p->>'natureza', 'financiamento');
  v_ativ text := coalesce(nullif(p->>'atividade', ''), 'pecuaria');
  c jsonb; v_fin uuid; x jsonb; v_falta text[] := '{}'; v_plano_p uuid; v_plano_j uuid; v_rec jsonb;
begin
  if v_cli is null or not coalesce(public.tenant_ok(v_cli), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if v_nat not in ('financiamento', 'emprestimo', 'consorcio') then
    raise exception using errcode = 'P0001', message = 'O cadastro novo cria financiamento, empréstimo ou consórcio (a compra parcelada tem o formulário dela).';
  end if;
  if v_ativ not in ('pecuaria', 'agricultura') then raise exception using errcode = 'P0001', message = 'Escolha a atividade: pecuária ou agricultura.'; end if;
  if nullif(btrim(coalesce(p->>'descricao', '')), '') is null then v_falta := array_append(v_falta, ('descrição')::text); end if;
  if nullif(p->>'credor_id', '') is null then v_falta := array_append(v_falta, (case when v_nat = 'consorcio' then 'administradora' else 'credor' end)::text); end if;
  if nullif(p->>'conta_bancaria_id', '') is null then v_falta := array_append(v_falta, (case when v_nat = 'consorcio' then 'conta de pagamento' else 'conta de captação' end)::text); end if;
  if v_nat <> 'consorcio' and nullif(btrim(coalesce(p->>'numero_contrato', '')), '') is null then v_falta := array_append(v_falta, ('nº do contrato')::text); end if;
  if v_nat <> 'consorcio' and nullif(p->>'data_contrato', '') is null then v_falta := array_append(v_falta, ('data do contrato')::text); end if;
  if nullif(p->>'fazenda_id', '') is null then v_falta := array_append(v_falta, ('fazenda')::text); end if;
  if coalesce(array_length(v_falta, 1), 0) > 0 then
    raise exception using errcode = 'P0001', message = 'Falta: ' || array_to_string(v_falta, ', ') || '.';
  end if;
  -- os cadastros pedidos sao do cliente (nada de outro cliente entra no contrato)
  if not exists (select 1 from public.financeiro_fornecedores f where f.id = (p->>'credor_id')::uuid and f.cliente_id = v_cli)
     or not exists (select 1 from public.financeiro_contas_bancarias b where b.id = (p->>'conta_bancaria_id')::uuid and b.cliente_id = v_cli)
     or not exists (select 1 from public.fazendas z where z.id = (p->>'fazenda_id')::uuid and z.cliente_id = v_cli) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  v_plano_p := nullif(p->>'plano_principal_id', '')::uuid; v_plano_j := nullif(p->>'plano_juros_id', '')::uuid;
  if v_nat = 'consorcio' and v_plano_p is null then
    select id into v_plano_p from public.financeiro_plano_contas where cliente_id is null and subcentro = 'Consórcio a contemplar' and ativo;
  end if;
  if (v_plano_p is not null and not exists (select 1 from public.financeiro_plano_contas w where w.id = v_plano_p and w.ativo and (w.cliente_id is null or w.cliente_id = v_cli)))
     or (v_plano_j is not null and not exists (select 1 from public.financeiro_plano_contas w where w.id = v_plano_j and w.ativo and (w.cliente_id is null or w.cliente_id = v_cli))) then
    raise exception using errcode = 'P0001', message = 'Plano de contas escolhido não é deste cliente.';
  end if;

  c := public.fn_financiamento_cronograma(case when v_nat = 'consorcio'
         then jsonb_build_object('modo', 'consorcio', 'carta', p->'valor_total', 'prazo', p->'prazo', 'taxa_adm_pct', p->'taxa_adm_pct',
                'fundo_reserva_pct', p->'fundo_reserva_pct', 'seguro_pct_mes', p->'seguro_pct_mes', 'primeiro_vencimento', p->'primeiro_vencimento')
         else p || jsonb_build_object('principal', p->'valor_total') end);
  if c->>'recusa' is not null then raise exception using errcode = 'P0001', message = c->>'recusa'; end if;

  insert into public.financiamentos (cliente_id, natureza, status, descricao, credor_id, numero_contrato, linha_credito_id, finalidade,
    data_contrato, data_inicio, valor_total, fazenda_id, conta_bancaria_id, garantias, plano_principal_id, plano_juros_id, observacao,
    sistema_amortizacao, taxa_juros, taxa_juros_mensal, periodicidade, tipo_taxa, carencia_ate, vencimento_final, total_parcelas,
    data_primeira_parcela, tipo_financiamento, created_by)
  values (v_cli, v_nat, 'ativo', btrim(p->>'descricao'), (p->>'credor_id')::uuid,
    coalesce(nullif(btrim(coalesce(p->>'numero_contrato', '')), ''), nullif(concat_ws(' / ', nullif(p->>'grupo', ''), nullif(p->>'cota', '')), '')),
    nullif(p->>'linha_credito_id', '')::uuid, nullif(p->>'finalidade', ''),
    coalesce(nullif(p->>'data_contrato', '')::date, nullif(p->>'primeiro_vencimento', '')::date),
    coalesce(nullif(p->>'data_contrato', '')::date, nullif(p->>'primeiro_vencimento', '')::date),
    round((p->>'valor_total')::numeric, 2), (p->>'fazenda_id')::uuid, (p->>'conta_bancaria_id')::uuid, nullif(btrim(coalesce(p->>'garantias', '')), ''),
    v_plano_p, v_plano_j, nullif(btrim(coalesce(p->>'observacao', '')), ''),
    case when v_nat = 'consorcio' then null else coalesce(nullif(p->>'sistema', ''), 'sac') end,
    coalesce(nullif(p->>'taxa_aa', '')::numeric, 0),
    round((power(1 + coalesce(nullif(p->>'taxa_aa', '')::numeric, 0) / 100, 1 / 12.0) - 1) * 100, 6),
    case when v_nat = 'consorcio' then 'mensal' else coalesce(nullif(p->>'periodicidade', ''), 'mensal') end,
    nullif(p->>'tipo_taxa', ''), nullif(p->>'carencia_ate', '')::date, (c->>'vencimento_final')::date, (c->>'parcelas')::int,
    nullif(p->>'primeiro_vencimento', '')::date, v_ativ, auth.uid())
  returning id into v_fin;

  for x in select * from jsonb_array_elements(c->'linhas') loop
    insert into public.financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status, tipo)
    values (v_cli, v_fin, (x->>'numero')::int, (x->>'vencimento')::date, (x->>'principal')::numeric, (x->>'juros')::numeric, (x->>'total')::numeric,
      'pendente', case when (x->>'principal')::numeric = 0 then 'juros_carencia' when (x->>'juros')::numeric = 0 then 'amortizacao' else 'mista' end);
  end loop;
  if v_nat = 'consorcio' then
    insert into public.financiamento_consorcio (financiamento_id, cliente_id, grupo, cota, taxa_adm_pct, fundo_reserva_pct, seguro_pct_mes, reajuste,
      contemplado, data_contemplacao, forma_contemplacao, lance_valor)
    values (v_fin, v_cli, nullif(p->>'grupo', ''), nullif(p->>'cota', ''), coalesce(nullif(p->>'taxa_adm_pct', '')::numeric, 0),
      coalesce(nullif(p->>'fundo_reserva_pct', '')::numeric, 0), coalesce(nullif(p->>'seguro_pct_mes', '')::numeric, 0), nullif(p->>'reajuste', ''),
      coalesce((p->>'contemplado')::boolean, false), nullif(p->>'data_contemplacao', '')::date, nullif(p->>'forma_contemplacao', ''),
      nullif(p->>'lance_valor', '')::numeric);
  end if;
  -- os lancamentos: o motor de sempre (o mesmo do cadastro antigo e do lapis da parcela)
  v_rec := public.fn_reconciliar_financiamento(v_fin, false, true);
  return jsonb_build_object('financiamento_id', v_fin, 'cronograma', c,
    'lancamentos', (select count(*) from public.financeiro_lancamentos_v2 l where l.financiamento_id = v_fin and not l.cancelado));
end $$;
revoke all on function public._fn_financiamento_criar_exec(jsonb) from public, anon, authenticated;
grant execute on function public._fn_financiamento_criar_exec(jsonb) to service_role;

create or replace function public.fn_financiamento_criar(p_dados jsonb, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb;
begin
  if not coalesce(public.tenant_ok(nullif(p_dados->>'cliente_id', '')::uuid), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if coalesce(p_simular, true) then
    begin
      r := public._fn_financiamento_criar_exec(p_dados);
      raise exception using errcode = 'FCSIM', message = r::text;
    exception
      when sqlstate 'FCSIM' then return (sqlerrm::jsonb - 'financiamento_id') || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', sqlerrm);
    end;
  end if;
  return public._fn_financiamento_criar_exec(p_dados) || jsonb_build_object('simulado', false, 'recusa', null);
end $$;

-- 5. O motor usa o plano escolhido no cadastro novo e descreve o consorcio: patch guardado por md5, 3 ancoras ---------------------
do $$
declare
  v_src text; v_def text;
  c_antes constant text := '0ffca819a051703365987d9db8c9a3c6';
  c_depois constant text := 'cf810a2c63d64912bafbb7bf57342698';
  c_a1 constant text := E'\n  -- Le tipo_operacao oficial dos planos';
  c_n1 constant text := E'\n  -- FIN-FINANC-28 passo 7: o plano escolhido no cadastro novo (NULO nos contratos de antes: nada muda neles)\n'
    || E'  IF v_contrato.plano_principal_id IS NOT NULL THEN v_plano_p_id := v_contrato.plano_principal_id; END IF;\n'
    || E'  IF v_contrato.plano_juros_id IS NOT NULL THEN v_plano_j_id := v_contrato.plano_juros_id; END IF;\n'
    || E'\n  -- Le tipo_operacao oficial dos planos';
  c_a2 constant text := E'v_desc_p := CASE WHEN v_contrato.natureza = ''parcelamento''';
  c_n2 constant text := E'v_desc_p := CASE WHEN v_contrato.natureza = ''consorcio''\n'
    || E'    THEN ''Parcela '' || v_parcela.numero_parcela::text || ''/'' || COALESCE(v_contrato.total_parcelas::text,''?'') || '' Cons'' || chr(243) || ''rcio '' || COALESCE(v_contrato.descricao,'''')\n'
    || E'    WHEN v_contrato.natureza = ''parcelamento''';
  c_a3 constant text := E'v_desc_j := ''Juros '' || COALESCE(v_contrato.descricao,'''')';
  c_n3 constant text := E'v_desc_j := CASE WHEN v_contrato.natureza = ''consorcio'' THEN ''Taxa adm. e seguro '' ELSE ''Juros '' END || COALESCE(v_contrato.descricao,'''')';
begin
  select prosrc into v_src from pg_proc where oid = 'public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid)'::regprocedure;
  if md5(v_src) <> c_antes then raise exception 'motor: corpo nao e o esperado (%)', md5(v_src); end if;
  if (length(v_src) - length(replace(v_src, c_a1, ''))) / length(c_a1) <> 1 or (length(v_src) - length(replace(v_src, c_a2, ''))) / length(c_a2) <> 1
     or (length(v_src) - length(replace(v_src, c_a3, ''))) / length(c_a3) <> 1 then raise exception 'motor: ancora nao casa 1x'; end if;
  v_def := pg_get_functiondef('public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid)'::regprocedure);
  execute replace(replace(replace(v_def, c_a1, c_n1), c_a2, c_n2), c_a3, c_n3);
  select prosrc into v_src from pg_proc where oid = 'public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid)'::regprocedure;
  if md5(v_src) <> c_depois then raise exception 'motor: destino divergente (%)', md5(v_src); end if;
end $$;

-- 6. Consorcio sem liberacao: fora do "liberado − amortizado" (como a compra parcelada): patch guardado por md5, 1 ancora ---------
do $$
declare
  v_src text; v_def text;
  c_antes constant text := '13ce95832cbf88342b1853ea5e6a2c8a';
  c_depois constant text := '1065bc8243cd41afbfe6ae54a11b95be';
  c_a constant text := E'  if f.natureza = ''parcelamento'' then\n';
  c_n constant text := E'  if f.natureza in (''parcelamento'', ''consorcio'') then  -- FIN-FINANC-28 passo 7: o consorcio nao tem liberacao\n';
begin
  select prosrc into v_src from pg_proc where oid = 'public._fn_financiamento_saldo(uuid,date)'::regprocedure;
  if md5(v_src) <> c_antes then raise exception 'saldo: corpo nao e o esperado (%)', md5(v_src); end if;
  if (length(v_src) - length(replace(v_src, c_a, ''))) / length(c_a) <> 1 then raise exception 'saldo: ancora nao casa 1x'; end if;
  v_def := pg_get_functiondef('public._fn_financiamento_saldo(uuid,date)'::regprocedure);
  execute replace(v_def, c_a, c_n);
  select prosrc into v_src from pg_proc where oid = 'public._fn_financiamento_saldo(uuid,date)'::regprocedure;
  if md5(v_src) <> c_depois then raise exception 'saldo: destino divergente (%)', md5(v_src); end if;
end $$;

-- 7. ACL ------------------------------------------------------------------------------------------------------------------------------
do $$
begin
  revoke all on function public.fn_financiamento_criar(jsonb, boolean) from public, anon;
  grant execute on function public.fn_financiamento_criar(jsonb, boolean) to authenticated, service_role;
  if has_function_privilege('anon', 'public.fn_financiamento_criar(jsonb,boolean)'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_financiamento_cronograma(jsonb)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_financiamento_criar_exec(jsonb)'::regprocedure, 'EXECUTE') then
    raise exception 'ACL do passo 7';
  end if;
end $$;
