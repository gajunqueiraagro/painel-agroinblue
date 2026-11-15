-- FIN-SEGUROS S1 (NJ-SEGUROS-01; direção B aprovada pelo Chat 12/11 17:05; mock ui-validar/seguros-aba.html aprovado pelo Gabriel 22:17).
-- O SEGURO é um registro próprio, LIGADO (opcionalmente) à COMPRA PARCELADA que já existe — a mesma natureza 'parcelamento', a mesma
-- tela, as mesmas parcelas, o mesmo pagar pelo extrato. Nenhuma das ~25 funções que decidem pela natureza muda.
--   · forma 'compra_parcelada' = o seguro aponta para a compra (1:1); prêmio, parcelas e pagamentos são os dela.
--   · forma 'fora_do_sistema'  = paga por conta ou cartão que o sistema não monitora (Gabriel 18:05): guarda vigência, bens e documento;
--     NÃO gera parcela a pagar; o prêmio é informativo.
-- Rótulos genéricos (todo cliente). Sem dado de cliente (a criação das 14 apólices do NJ é pela tela, com prévia de cada uma).
--   1. seguros · 2. seguro_bens (N:N com o Patrimônio, importância segurada por bem) · 3. seguro_documentos (apólice/endosso do
--      SEGURO — vale também para o "fora do sistema"; arquivo no bucket fin-documentos em <cliente>/seguros/<seguro>/) ·
--   4. seguro_trilha · 5. RPCs: fn_seguro_salvar / fn_seguro_encerrar (prévia = p_simular, padrão true) · fn_seguro_documento_registrar /
--      fn_seguro_documento_remover · leitura: fn_seguros_lista (P1), fn_seguro_ficha (P2), fn_patrimonio_bem_seguros (ficha do bem).
--   Pendências calculadas, nunca gravadas: sem apólice anexada · vence em 30 dias · vencida · parcela vencida ainda prevista/programada.
-- Fica para a 118071: "Renovar" (apólice nova copiando bens e classificação + encerra a antiga, numa transação, com prévia).
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.seguros') is not null or to_regclass('public.seguro_bens') is not null then
    raise exception 'FIN-SEGUROS-S1: as tabelas já existem: refazer.';
  end if;
end $$;

-- ═══ 1. o seguro ═══
create table public.seguros (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references public.clientes(id),
  financiamento_id      uuid references public.financiamentos(id),
  forma_pagamento       text not null check (forma_pagamento in ('compra_parcelada', 'fora_do_sistema')),
  seguradora_id         uuid not null references public.financeiro_fornecedores(id),
  corretor_id           uuid references public.financeiro_fornecedores(id),
  apolice               text,
  endosso               text,
  ramo                  text not null check (ramo in ('maquinas_equipamentos', 'rural_benfeitorias', 'veiculo', 'vida', 'vida_grupo', 'empresarial', 'residencial', 'embarcacao', 'outro')),
  pessoal               boolean not null default false,
  vigencia_inicio       date,
  vigencia_fim          date,
  segurado              text,
  importancia_segurada  numeric check (importancia_segurada is null or importancia_segurada >= 0),
  premio                numeric check (premio is null or premio >= 0),
  plano_conta_id        uuid references public.financeiro_plano_contas(id),
  situacao              text not null default 'vigente' check (situacao in ('vigente', 'encerrado')),
  encerrado_em          timestamptz,
  encerrado_por         uuid,
  encerrado_motivo      text,
  criado_em             timestamptz not null default now(),
  criado_por            uuid,
  alterado_em           timestamptz not null default now(),
  constraint seguros_forma_chk check ((forma_pagamento = 'compra_parcelada') = (financiamento_id is not null)),
  constraint seguros_vigencia_chk check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio)
);
create unique index uq_seguros_compra on public.seguros (financiamento_id) where financiamento_id is not null and situacao = 'vigente';
create unique index uq_seguros_apolice on public.seguros (cliente_id, seguradora_id, lower(btrim(apolice)), coalesce(lower(btrim(endosso)), ''))
  where apolice is not null and situacao = 'vigente';
create index idx_seguros_cliente_fim on public.seguros (cliente_id, vigencia_fim);

-- ═══ 2. seguro × bens ═══
create table public.seguro_bens (
  seguro_id            uuid not null references public.seguros(id),
  bem_id               uuid not null references public.patrimonio_bens(id),
  cliente_id           uuid not null references public.clientes(id),
  importancia_segurada numeric check (importancia_segurada is null or importancia_segurada >= 0),
  primary key (seguro_id, bem_id)
);
create index idx_seguro_bens_bem on public.seguro_bens (bem_id);

-- ═══ 3. documentos do seguro ═══
create table public.seguro_documentos (
  id               uuid primary key,
  cliente_id       uuid not null references public.clientes(id),
  seguro_id        uuid not null references public.seguros(id),
  especie          text not null check (especie in ('apolice', 'endosso', 'outro')),
  nome             text not null,
  storage_path     text not null,
  tipo             text,
  tamanho_bytes    bigint,
  enviado_por      uuid,
  criado_em        timestamptz not null default now(),
  cancelado_em     timestamptz,
  cancelado_por    uuid,
  cancelado_motivo text
);
create index idx_seguro_documentos_seguro on public.seguro_documentos (seguro_id);

-- ═══ 4. trilha ═══
create table public.seguro_trilha (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  seguro_id  uuid not null references public.seguros(id),
  acao       text not null check (acao in ('criado', 'editado', 'encerrado', 'documento')),
  antes      jsonb,
  depois     jsonb,
  motivo     text,
  por        uuid,
  em         timestamptz not null default now()
);
create index idx_seguro_trilha on public.seguro_trilha (seguro_id, em);

-- RLS: leitura por tenant; escrita só pelas RPCs
alter table public.seguros enable row level security;
alter table public.seguro_bens enable row level security;
alter table public.seguro_documentos enable row level security;
alter table public.seguro_trilha enable row level security;
create policy seguros_select on public.seguros for select to authenticated using (public.tenant_ok(cliente_id));
create policy seguro_bens_select on public.seguro_bens for select to authenticated using (public.tenant_ok(cliente_id));
create policy seguro_documentos_select on public.seguro_documentos for select to authenticated using (public.tenant_ok(cliente_id));
create policy seguro_trilha_select on public.seguro_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.seguros, public.seguro_bens, public.seguro_documentos, public.seguro_trilha from public, anon, authenticated;
grant select on public.seguros, public.seguro_bens, public.seguro_documentos, public.seguro_trilha to authenticated;
grant all on public.seguros, public.seguro_bens, public.seguro_documentos, public.seguro_trilha to service_role;

-- ═══ 5a. o seguro como jsonb (uma regra só para prévia e trilha) ═══
create or replace function public._fn_seguro_json(p_s public.seguros, p_bens jsonb) returns jsonb
language sql stable set search_path = public as $f$
  select jsonb_build_object('financiamento_id', p_s.financiamento_id, 'forma_pagamento', p_s.forma_pagamento, 'seguradora_id', p_s.seguradora_id,
    'corretor_id', p_s.corretor_id, 'apolice', p_s.apolice, 'endosso', p_s.endosso, 'ramo', p_s.ramo, 'pessoal', p_s.pessoal,
    'vigencia_inicio', p_s.vigencia_inicio, 'vigencia_fim', p_s.vigencia_fim, 'segurado', p_s.segurado,
    'importancia_segurada', p_s.importancia_segurada, 'premio', p_s.premio, 'plano_conta_id', p_s.plano_conta_id, 'bens', coalesce(p_bens, '[]'::jsonb))
$f$;
revoke all on function public._fn_seguro_json(public.seguros, jsonb) from public, anon, authenticated;

create or replace function public._fn_seguro_bens_json(p_seguro uuid) returns jsonb
language sql stable set search_path = public as $f$
  select coalesce(jsonb_agg(jsonb_build_object('bem_id', b.bem_id, 'importancia_segurada', b.importancia_segurada) order by b.bem_id), '[]'::jsonb)
    from public.seguro_bens b where b.seguro_id = p_seguro
$f$;
revoke all on function public._fn_seguro_bens_json(uuid) from public, anon, authenticated;

-- ═══ 5b. pendências e números de um seguro (a lista, a ficha e o bem usam a MESMA conta) ═══
create or replace function public._fn_seguro_numeros(p_s public.seguros, p_hoje date) returns jsonb
language plpgsql stable set search_path = public as $f$
declare v jsonb; v_pend text[] := '{}'; v_tem_apolice boolean;
begin
  if p_s.forma_pagamento = 'compra_parcelada' then
    select jsonb_build_object(
      'premio', (select f.valor_total from public.financiamentos f where f.id = p_s.financiamento_id),
      'parcelas', count(*), 'pagas', count(*) filter (where x.status_transacao in ('realizado', 'conciliado')),
      'pago', coalesce(sum(coalesce(q.valor_total, q.valor_principal)) filter (where x.status_transacao in ('realizado', 'conciliado')), 0),
      'a_pagar', coalesce(sum(coalesce(q.valor_total, q.valor_principal)) filter (where coalesce(x.status_transacao, '') not in ('realizado', 'conciliado')), 0),
      'vencido', coalesce(sum(coalesce(q.valor_total, q.valor_principal)) filter (where coalesce(x.status_transacao, '') not in ('realizado', 'conciliado') and q.data_vencimento < p_hoje), 0),
      'vencidas_previstas', count(*) filter (where coalesce(x.status_transacao, '') in ('previsto', 'programado', 'agendado') and q.data_vencimento < p_hoje),
      'proximo_vencimento', min(q.data_vencimento) filter (where coalesce(x.status_transacao, '') not in ('realizado', 'conciliado') and q.data_vencimento >= p_hoje),
      'conta', (select cb.nome_exibicao from public.financiamento_parcelas q2 join public.financeiro_lancamentos_v2 x2 on x2.id = q2.lancamento_id
                  join public.financeiro_contas_bancarias cb on cb.id = x2.conta_efetiva_id
                 where q2.financiamento_id = p_s.financiamento_id and coalesce(q2.status, '') <> 'cancelado' order by q2.numero_parcela desc limit 1))
      into v
      from public.financiamento_parcelas q left join public.financeiro_lancamentos_v2 x on x.id = q.lancamento_id and not coalesce(x.cancelado, false)
     where q.financiamento_id = p_s.financiamento_id and coalesce(q.status, '') <> 'cancelado';
  else
    v := jsonb_build_object('premio', p_s.premio, 'parcelas', 0, 'pagas', 0, 'pago', null, 'a_pagar', null, 'vencido', null,
                            'vencidas_previstas', 0, 'proximo_vencimento', null, 'conta', null);
  end if;
  v_tem_apolice := exists (select 1 from public.seguro_documentos d where d.seguro_id = p_s.id and d.especie = 'apolice' and d.cancelado_em is null);
  if not v_tem_apolice then v_pend := array_append(v_pend, 'sem_apolice'); end if;
  if p_s.situacao = 'vigente' and p_s.vigencia_fim is not null then
    if p_s.vigencia_fim < p_hoje then v_pend := array_append(v_pend, 'vencida');
    elsif p_s.vigencia_fim <= p_hoje + 30 then v_pend := array_append(v_pend, 'vence_em_30');
    end if;
  end if;
  if coalesce((v->>'vencidas_previstas')::int, 0) > 0 then v_pend := array_append(v_pend, 'parcela_vencida_prevista'); end if;
  return v || jsonb_build_object('pendencias', to_jsonb(v_pend));
end $f$;
revoke all on function public._fn_seguro_numeros(public.seguros, date) from public, anon, authenticated;

-- ═══ 5c. salvar (criar/editar) ═══
-- p_dados: {financiamento_id, forma_pagamento, seguradora_id, corretor_id, apolice, endosso, ramo, pessoal, vigencia_inicio, vigencia_fim,
--           segurado, importancia_segurada, premio, plano_conta_id}; p_bens: [{bem_id, importancia_segurada}] (null = não mexe; [] = tira todos).
create or replace function public.fn_seguro_salvar(p_cliente_id uuid, p_id uuid, p_dados jsonb, p_bens jsonb default null,
  p_motivo text default null, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  c_campos constant text[] := array['financiamento_id', 'forma_pagamento', 'seguradora_id', 'corretor_id', 'apolice', 'endosso', 'ramo', 'pessoal',
    'vigencia_inicio', 'vigencia_fim', 'segurado', 'importancia_segurada', 'premio', 'plano_conta_id'];
  a public.seguros; n public.seguros; k text; f public.financiamentos%rowtype;
  v_bens_antes jsonb; v_bens_depois jsonb; v_antes jsonb; v_depois jsonb; v_recusa jsonb; v_avisos jsonb := '[]'::jsonb;
  v_id uuid; v_sim boolean := coalesce(p_simular, true); v_soma_is numeric; b jsonb;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  for k in select jsonb_object_keys(d) loop
    if not k = any(c_campos) then raise exception using errcode = 'P0001', message = format('Campo %s não se edita aqui.', k); end if;
  end loop;
  if p_bens is not null and jsonb_typeof(p_bens) <> 'array' then
    raise exception using errcode = 'P0001', message = 'A lista de bens tem de ser uma lista.';
  end if;
  if p_id is not null then
    select * into a from public.seguros where id = p_id;
    if not found or a.cliente_id <> p_cliente_id then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
    if a.situacao <> 'vigente' then
      return jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', 'encerrado', 'frase', 'Este seguro está encerrado.'));
    end if;
    n := a;
    v_bens_antes := public._fn_seguro_bens_json(p_id);
  else
    n.cliente_id := p_cliente_id; n.situacao := 'vigente'; n.pessoal := false;
    v_bens_antes := '[]'::jsonb;
  end if;
  if d ? 'financiamento_id' then n.financiamento_id := nullif(d->>'financiamento_id', '')::uuid; end if;
  if d ? 'forma_pagamento' then n.forma_pagamento := nullif(d->>'forma_pagamento', ''); end if;
  if d ? 'seguradora_id' then n.seguradora_id := nullif(d->>'seguradora_id', '')::uuid; end if;
  if d ? 'corretor_id' then n.corretor_id := nullif(d->>'corretor_id', '')::uuid; end if;
  if d ? 'apolice' then n.apolice := nullif(btrim(coalesce(d->>'apolice', '')), ''); end if;
  if d ? 'endosso' then n.endosso := nullif(btrim(coalesce(d->>'endosso', '')), ''); end if;
  if d ? 'ramo' then n.ramo := nullif(d->>'ramo', ''); end if;
  if d ? 'pessoal' then n.pessoal := coalesce((d->>'pessoal')::boolean, false); end if;
  if d ? 'vigencia_inicio' then n.vigencia_inicio := nullif(d->>'vigencia_inicio', '')::date; end if;
  if d ? 'vigencia_fim' then n.vigencia_fim := nullif(d->>'vigencia_fim', '')::date; end if;
  if d ? 'segurado' then n.segurado := nullif(btrim(coalesce(d->>'segurado', '')), ''); end if;
  if d ? 'importancia_segurada' then n.importancia_segurada := round(nullif(d->>'importancia_segurada', '')::numeric, 2); end if;
  if d ? 'premio' then n.premio := round(nullif(d->>'premio', '')::numeric, 2); end if;
  if d ? 'plano_conta_id' then n.plano_conta_id := nullif(d->>'plano_conta_id', '')::uuid; end if;
  if n.forma_pagamento is null then n.forma_pagamento := case when n.financiamento_id is null then 'fora_do_sistema' else 'compra_parcelada' end; end if;
  v_bens_depois := case when p_bens is null then v_bens_antes else
    coalesce((select jsonb_agg(jsonb_build_object('bem_id', (e->>'bem_id')::uuid, 'importancia_segurada', round(nullif(e->>'importancia_segurada', '')::numeric, 2))
                               order by (e->>'bem_id')::uuid) from jsonb_array_elements(p_bens) e), '[]'::jsonb) end;

  -- acesso (42501): tudo o que se aponta é do MESMO cliente
  if n.seguradora_id is not null and not exists (select 1 from public.financeiro_fornecedores x where x.id = n.seguradora_id and x.cliente_id = p_cliente_id)
     or n.corretor_id is not null and not exists (select 1 from public.financeiro_fornecedores x where x.id = n.corretor_id and x.cliente_id = p_cliente_id)
     or n.plano_conta_id is not null and not exists (select 1 from public.financeiro_plano_contas x where x.id = n.plano_conta_id and (x.cliente_id is null or x.cliente_id = p_cliente_id))
     or n.financiamento_id is not null and not exists (select 1 from public.financiamentos x where x.id = n.financiamento_id and x.cliente_id = p_cliente_id)
     or exists (select 1 from jsonb_array_elements(v_bens_depois) e where not exists (select 1 from public.patrimonio_bens x where x.id = (e->>'bem_id')::uuid and x.cliente_id = p_cliente_id)) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if n.financiamento_id is not null then select * into f from public.financiamentos where id = n.financiamento_id; end if;

  if n.seguradora_id is null then
    v_recusa := jsonb_build_object('motivo', 'sem_seguradora', 'frase', 'Escolha a seguradora.');
  elsif n.ramo is null or n.ramo not in ('maquinas_equipamentos', 'rural_benfeitorias', 'veiculo', 'vida', 'vida_grupo', 'empresarial', 'residencial', 'embarcacao', 'outro') then
    v_recusa := jsonb_build_object('motivo', 'ramo', 'frase', 'Escolha o ramo do seguro.');
  elsif n.forma_pagamento not in ('compra_parcelada', 'fora_do_sistema') then
    v_recusa := jsonb_build_object('motivo', 'forma', 'frase', 'Forma de pagamento inválida.');
  elsif n.forma_pagamento = 'compra_parcelada' and n.financiamento_id is null then
    v_recusa := jsonb_build_object('motivo', 'sem_compra', 'frase', 'Escolha a compra parcelada do seguro (ou marque "fora do sistema").');
  elsif n.forma_pagamento = 'fora_do_sistema' and n.financiamento_id is not null then
    v_recusa := jsonb_build_object('motivo', 'fora_com_compra', 'frase', 'Seguro "fora do sistema" não tem compra parcelada.');
  elsif n.financiamento_id is not null and f.natureza is distinct from 'parcelamento' then
    v_recusa := jsonb_build_object('motivo', 'nao_e_compra', 'frase', 'Só compra parcelada vira seguro.');
  elsif n.financiamento_id is not null and f.status = 'cancelado' then
    v_recusa := jsonb_build_object('motivo', 'compra_cancelada', 'frase', 'Esta compra parcelada está cancelada.');
  elsif n.financiamento_id is not null and exists (select 1 from public.seguros o where o.financiamento_id = n.financiamento_id and o.situacao = 'vigente' and o.id is distinct from p_id) then
    v_recusa := jsonb_build_object('motivo', 'compra_ja_e_seguro', 'frase', 'Esta compra parcelada já é de outro seguro.');
  elsif n.vigencia_inicio is not null and n.vigencia_fim is not null and n.vigencia_fim < n.vigencia_inicio then
    v_recusa := jsonb_build_object('motivo', 'vigencia_invertida', 'frase', 'O fim da vigência é antes do início.');
  elsif n.apolice is not null and exists (select 1 from public.seguros o where o.cliente_id = p_cliente_id and o.seguradora_id = n.seguradora_id
          and lower(btrim(o.apolice)) = lower(n.apolice) and coalesce(lower(btrim(o.endosso)), '') = coalesce(lower(n.endosso), '')
          and o.situacao = 'vigente' and o.id is distinct from p_id) then
    v_recusa := jsonb_build_object('motivo', 'apolice_repetida', 'frase', format('Já existe um seguro desta seguradora com a apólice %s.', n.apolice));
  elsif (select count(*) <> count(distinct e->>'bem_id') from jsonb_array_elements(v_bens_depois) e) then
    v_recusa := jsonb_build_object('motivo', 'bem_repetido', 'frase', 'O mesmo bem aparece duas vezes.');
  elsif exists (select 1 from jsonb_array_elements(v_bens_depois) e join public.patrimonio_bens x on x.id = (e->>'bem_id')::uuid where x.baixado_em is not null) then
    v_recusa := jsonb_build_object('motivo', 'bem_baixado', 'frase', 'Um dos bens já foi baixado do patrimônio.');
  end if;

  v_antes := case when p_id is null then null else public._fn_seguro_json(a, v_bens_antes) end;
  v_depois := public._fn_seguro_json(n, v_bens_depois);
  if v_recusa is not null then
    if not v_sim then raise exception using errcode = 'P0001', message = (v_recusa->>'frase') || ' Nada foi gravado.'; end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', v_recusa, 'antes', v_antes, 'depois', v_depois);
  end if;
  if p_id is not null and v_antes = v_depois then
    return jsonb_build_object('ok', true, 'simulado', v_sim, 'sem_mudanca', true, 'id', p_id, 'antes', v_antes, 'depois', v_depois, 'avisos', '[]'::jsonb);
  end if;

  -- avisos: explicam, não recusam
  if n.apolice is null then v_avisos := v_avisos || jsonb_build_object('codigo', 'sem_numero_apolice'); end if;
  if n.vigencia_fim is not null and n.vigencia_fim < current_date then v_avisos := v_avisos || jsonb_build_object('codigo', 'vigencia_encerrada'); end if;
  if n.financiamento_id is not null then
    if f.credor_id is distinct from n.seguradora_id then v_avisos := v_avisos || jsonb_build_object('codigo', 'credor_da_compra_diferente'); end if;
    if n.vigencia_inicio is not null and n.vigencia_fim is not null and exists (select 1 from public.financiamento_parcelas q
         where q.financiamento_id = n.financiamento_id and coalesce(q.status, '') <> 'cancelado'
           and (q.data_vencimento < n.vigencia_inicio - 31 or q.data_vencimento > n.vigencia_fim + 31)) then
      v_avisos := v_avisos || jsonb_build_object('codigo', 'parcelas_fora_da_vigencia');
    end if;
  end if;
  select sum((e->>'importancia_segurada')::numeric) into v_soma_is from jsonb_array_elements(v_bens_depois) e where e->>'importancia_segurada' is not null;
  if v_soma_is is not null and n.importancia_segurada is not null and abs(v_soma_is - n.importancia_segurada) > 0.005 then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'soma_dos_bens_diferente', 'soma_bens', v_soma_is, 'importancia', n.importancia_segurada);
  end if;
  if exists (select 1 from jsonb_array_elements(v_bens_depois) e join public.seguro_bens sb on sb.bem_id = (e->>'bem_id')::uuid
              join public.seguros o on o.id = sb.seguro_id where o.situacao = 'vigente' and o.id is distinct from p_id and o.ramo = n.ramo) then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'bem_em_outro_seguro_vigente');
  end if;

  if v_sim then
    return jsonb_build_object('ok', true, 'simulado', true, 'sem_mudanca', false, 'id', p_id, 'antes', v_antes, 'depois', v_depois, 'avisos', v_avisos);
  end if;
  if p_id is null then
    insert into public.seguros (cliente_id, financiamento_id, forma_pagamento, seguradora_id, corretor_id, apolice, endosso, ramo, pessoal,
      vigencia_inicio, vigencia_fim, segurado, importancia_segurada, premio, plano_conta_id, criado_por)
    values (p_cliente_id, n.financiamento_id, n.forma_pagamento, n.seguradora_id, n.corretor_id, n.apolice, n.endosso, n.ramo, n.pessoal,
      n.vigencia_inicio, n.vigencia_fim, n.segurado, n.importancia_segurada, n.premio, n.plano_conta_id, auth.uid())
    returning id into v_id;
  else
    update public.seguros set financiamento_id = n.financiamento_id, forma_pagamento = n.forma_pagamento, seguradora_id = n.seguradora_id,
      corretor_id = n.corretor_id, apolice = n.apolice, endosso = n.endosso, ramo = n.ramo, pessoal = n.pessoal, vigencia_inicio = n.vigencia_inicio,
      vigencia_fim = n.vigencia_fim, segurado = n.segurado, importancia_segurada = n.importancia_segurada, premio = n.premio,
      plano_conta_id = n.plano_conta_id, alterado_em = now()
     where id = p_id and situacao = 'vigente'
    returning id into v_id;
    if v_id is null then raise exception using errcode = 'P0001', message = 'Este seguro acabou de ser encerrado. Nada foi gravado.'; end if;
  end if;
  if p_bens is not null then
    delete from public.seguro_bens where seguro_id = v_id;
    for b in select e from jsonb_array_elements(v_bens_depois) e loop
      insert into public.seguro_bens (seguro_id, bem_id, cliente_id, importancia_segurada)
      values (v_id, (b->>'bem_id')::uuid, p_cliente_id, nullif(b->>'importancia_segurada', '')::numeric);
    end loop;
  end if;
  insert into public.seguro_trilha (cliente_id, seguro_id, acao, antes, depois, motivo, por)
  values (p_cliente_id, v_id, case when p_id is null then 'criado' else 'editado' end, v_antes, v_depois, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'sem_mudanca', false, 'id', v_id, 'antes', v_antes, 'depois', v_depois, 'avisos', v_avisos);
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'Esta apólice ou esta compra acabou de ser cadastrada em outro seguro. Nada foi gravado.';
end $f$;

-- ═══ 5d. encerrar (nada se apaga; a compra parcelada e as parcelas ficam como estão) ═══
create or replace function public.fn_seguro_encerrar(p_id uuid, p_motivo text, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare a public.seguros; v_sim boolean := coalesce(p_simular, true); v_abertas int;
begin
  select * into a from public.seguros where id = p_id;
  if not found or not coalesce(public.tenant_ok(a.cliente_id), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if a.situacao <> 'vigente' then
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', 'ja_encerrado', 'frase', 'Este seguro já está encerrado.'));
  end if;
  select count(*) into v_abertas from public.financiamento_parcelas q left join public.financeiro_lancamentos_v2 x on x.id = q.lancamento_id
   where q.financiamento_id = a.financiamento_id and coalesce(q.status, '') <> 'cancelado' and coalesce(x.status_transacao, '') not in ('realizado', 'conciliado');
  if v_sim then
    return jsonb_build_object('ok', true, 'simulado', true, 'id', p_id, 'parcelas_em_aberto', v_abertas,
      'avisos', case when v_abertas > 0 then jsonb_build_array(jsonb_build_object('codigo', 'parcelas_em_aberto', 'qtde', v_abertas)) else '[]'::jsonb end);
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo para encerrar o seguro. Nada foi gravado.';
  end if;
  update public.seguros set situacao = 'encerrado', encerrado_em = now(), encerrado_por = auth.uid(), encerrado_motivo = btrim(p_motivo), alterado_em = now()
   where id = p_id and situacao = 'vigente';
  insert into public.seguro_trilha (cliente_id, seguro_id, acao, antes, depois, motivo, por)
  values (a.cliente_id, p_id, 'encerrado', jsonb_build_object('situacao', 'vigente'), jsonb_build_object('situacao', 'encerrado'), btrim(p_motivo), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', p_id, 'parcelas_em_aberto', v_abertas);
end $f$;

-- ═══ 5e. documentos do seguro (registrar primeiro, subir depois: o caminho vem do banco) ═══
create or replace function public.fn_seguro_documento_registrar(p_seguro_id uuid, p_especie text, p_nome text, p_extensao text,
  p_tipo text default null, p_tamanho bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare a public.seguros; v_id uuid := gen_random_uuid(); v_ext text; v_path text;
begin
  select * into a from public.seguros where id = p_seguro_id;
  if not found or not coalesce(public.tenant_ok(a.cliente_id), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if p_especie is null or p_especie not in ('apolice', 'endosso', 'outro') then
    raise exception using errcode = 'P0001', message = 'Escolha a espécie do documento: apólice, endosso ou outro.';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null then raise exception using errcode = 'P0001', message = 'Documento sem nome.'; end if;
  v_ext := lower(regexp_replace(coalesce(p_extensao, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_ext = '' then v_ext := 'bin'; end if;
  v_path := a.cliente_id::text || '/seguros/' || a.id::text || '/' || v_id::text || '.' || v_ext;
  insert into public.seguro_documentos (id, cliente_id, seguro_id, especie, nome, storage_path, tipo, tamanho_bytes, enviado_por)
  values (v_id, a.cliente_id, a.id, p_especie, btrim(p_nome), v_path, p_tipo, p_tamanho, auth.uid());
  insert into public.seguro_trilha (cliente_id, seguro_id, acao, depois, por)
  values (a.cliente_id, a.id, 'documento', jsonb_build_object('documento_id', v_id, 'especie', p_especie, 'nome', btrim(p_nome)), auth.uid());
  return jsonb_build_object('id', v_id, 'storage_path', v_path);
end $f$;

create or replace function public.fn_seguro_documento_remover(p_id uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare d public.seguro_documentos;
begin
  select * into d from public.seguro_documentos where id = p_id;
  if not found or not coalesce(public.tenant_ok(d.cliente_id), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo.'; end if;
  update public.seguro_documentos set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
   where id = p_id and cancelado_em is null;
  if not found then raise exception using errcode = 'P0001', message = 'Este documento já foi removido.'; end if;
  insert into public.seguro_trilha (cliente_id, seguro_id, acao, antes, motivo, por)
  values (d.cliente_id, d.seguro_id, 'documento', jsonb_build_object('documento_id', d.id, 'especie', d.especie, 'nome', d.nome), btrim(p_motivo), auth.uid());
  return jsonb_build_object('id', p_id, 'removido', true);
end $f$;

-- ═══ 5f. leitura: a aba (P1), a ficha (P2), o bem ═══
create or replace function public.fn_seguros_lista(p_cliente_id uuid, p_hoje date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare v_hoje date := coalesce(p_hoje, current_date);
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'situacao', s.situacao, 'ramo', s.ramo, 'pessoal', s.pessoal, 'forma_pagamento', s.forma_pagamento,
      'seguradora', (select x.nome from public.financeiro_fornecedores x where x.id = s.seguradora_id), 'seguradora_id', s.seguradora_id,
      'apolice', s.apolice, 'endosso', s.endosso, 'vigencia_inicio', s.vigencia_inicio, 'vigencia_fim', s.vigencia_fim,
      'segurado', s.segurado, 'importancia_segurada', s.importancia_segurada, 'financiamento_id', s.financiamento_id,
      'bens', (select coalesce(jsonb_agg(jsonb_build_object('bem_id', b.id, 'codigo', b.codigo, 'descricao', b.descricao) order by b.codigo), '[]'::jsonb)
                 from public.seguro_bens sb join public.patrimonio_bens b on b.id = sb.bem_id where sb.seguro_id = s.id))
      || public._fn_seguro_numeros(s, v_hoje)
      order by s.situacao desc, s.ramo, s.vigencia_fim nulls last, s.id)
      from public.seguros s where s.cliente_id = p_cliente_id), '[]'::jsonb);
end $f$;

create or replace function public.fn_seguro_ficha(p_id uuid, p_hoje date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare s public.seguros; v_hoje date := coalesce(p_hoje, current_date);
begin
  select * into s from public.seguros where id = p_id;
  if not found or not coalesce(public.tenant_ok(s.cliente_id), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  return public._fn_seguro_json(s, public._fn_seguro_bens_json(s.id))
    || public._fn_seguro_numeros(s, v_hoje)  -- antes da lista: a chave 'parcelas' da ficha é a LISTA (a contagem está em 'total')
    || jsonb_build_object('id', s.id, 'situacao', s.situacao, 'encerrado_em', s.encerrado_em, 'encerrado_motivo', s.encerrado_motivo,
      'seguradora', (select x.nome from public.financeiro_fornecedores x where x.id = s.seguradora_id),
      'corretor', (select x.nome from public.financeiro_fornecedores x where x.id = s.corretor_id),
      'classificacao', coalesce((select pc.subcentro from public.financeiro_plano_contas pc where pc.id = s.plano_conta_id),
                                (select pc.subcentro from public.financiamento_parcelas q join public.financeiro_lancamentos_v2 x on x.id = q.lancamento_id
                                   join public.financeiro_plano_contas pc on pc.id = x.plano_conta_id
                                  where q.financiamento_id = s.financiamento_id and coalesce(q.status, '') <> 'cancelado' order by q.numero_parcela limit 1)),
      'bens_detalhe', (select coalesce(jsonb_agg(jsonb_build_object('bem_id', b.id, 'codigo', b.codigo, 'descricao', b.descricao, 'fazenda_id', b.fazenda_id,
                         'chassi', b.chassi, 'numero_serie', b.numero_serie, 'placa', b.placa, 'importancia_segurada', sb.importancia_segurada) order by b.codigo), '[]'::jsonb)
                         from public.seguro_bens sb join public.patrimonio_bens b on b.id = sb.bem_id where sb.seguro_id = s.id),
      'documentos', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'especie', d.especie, 'nome', d.nome, 'storage_path', d.storage_path,
                         'criado_em', d.criado_em, 'enviado_por', d.enviado_por) order by d.criado_em), '[]'::jsonb)
                       from public.seguro_documentos d where d.seguro_id = s.id and d.cancelado_em is null),
      'parcelas', (select coalesce(jsonb_agg(jsonb_build_object('numero', q.numero_parcela, 'total', (select count(*) from public.financiamento_parcelas q3 where q3.financiamento_id = s.financiamento_id and coalesce(q3.status, '') <> 'cancelado'), 'vencimento', q.data_vencimento,
                         'pagamento', x.data_pagamento, 'valor', coalesce(q.valor_total, q.valor_principal),
                         'pago', case when x.status_transacao in ('realizado', 'conciliado') then abs(x.valor) end,
                         'conta', cb.nome_exibicao, 'lancamento_id', x.id,
                         'situacao', case when x.status_transacao in ('realizado', 'conciliado') then 'paga'
                                          when q.data_vencimento < v_hoje then 'vencida' else coalesce(x.status_transacao, 'a pagar') end,
                         'conciliado', exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = x.id and c.desfeito_em is null))
                         order by q.numero_parcela), '[]'::jsonb)
                     from public.financiamento_parcelas q left join public.financeiro_lancamentos_v2 x on x.id = q.lancamento_id
                     left join public.financeiro_contas_bancarias cb on cb.id = x.conta_efetiva_id
                    where q.financiamento_id = s.financiamento_id and coalesce(q.status, '') <> 'cancelado'));
end $f$;

create or replace function public.fn_patrimonio_bem_seguros(p_bem_id uuid, p_hoje date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare v_cli uuid; v_hoje date := coalesce(p_hoje, current_date);
begin
  select cliente_id into v_cli from public.patrimonio_bens where id = p_bem_id;
  if v_cli is null or not coalesce(public.tenant_ok(v_cli), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('seguro_id', s.id, 'seguradora', (select x.nome from public.financeiro_fornecedores x where x.id = s.seguradora_id),
      'apolice', s.apolice, 'ramo', s.ramo, 'vigencia_inicio', s.vigencia_inicio, 'vigencia_fim', s.vigencia_fim, 'situacao', s.situacao,
      'importancia_segurada', sb.importancia_segurada,
      'vigente_hoje', s.situacao = 'vigente' and (s.vigencia_inicio is null or s.vigencia_inicio <= v_hoje) and (s.vigencia_fim is null or s.vigencia_fim >= v_hoje),
      'vence_em_30', s.situacao = 'vigente' and s.vigencia_fim between v_hoje and v_hoje + 30)
      order by (s.situacao = 'vigente') desc, s.vigencia_fim desc nulls last)
    from public.seguro_bens sb join public.seguros s on s.id = sb.seguro_id where sb.bem_id = p_bem_id), '[]'::jsonb);
end $f$;

-- ═══ ACL ═══
revoke all on function public._fn_seguro_numeros(public.seguros, date) from public, anon, authenticated;
revoke all on function public.fn_seguro_salvar(uuid, uuid, jsonb, jsonb, text, boolean) from public, anon;
revoke all on function public.fn_seguro_encerrar(uuid, text, boolean) from public, anon;
revoke all on function public.fn_seguro_documento_registrar(uuid, text, text, text, text, bigint) from public, anon;
revoke all on function public.fn_seguro_documento_remover(uuid, text) from public, anon;
revoke all on function public.fn_seguros_lista(uuid, date) from public, anon;
revoke all on function public.fn_seguro_ficha(uuid, date) from public, anon;
revoke all on function public.fn_patrimonio_bem_seguros(uuid, date) from public, anon;
grant execute on function public.fn_seguro_salvar(uuid, uuid, jsonb, jsonb, text, boolean) to authenticated, service_role;
grant execute on function public.fn_seguro_encerrar(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.fn_seguro_documento_registrar(uuid, text, text, text, text, bigint) to authenticated, service_role;
grant execute on function public.fn_seguro_documento_remover(uuid, text) to authenticated, service_role;
grant execute on function public.fn_seguros_lista(uuid, date) to authenticated, service_role;
grant execute on function public.fn_seguro_ficha(uuid, date) to authenticated, service_role;
grant execute on function public.fn_patrimonio_bem_seguros(uuid, date) to authenticated, service_role;
