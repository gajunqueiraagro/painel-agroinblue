-- BOLETO-DDA-API-01 · D1a — a CAIXA DE ENTRADA DE BOLETOS (proposta OK do Chat 13/11; escolhas: CNPJ inteiro · 2º boleto vivo no mesmo
-- lançamento = recusa + "Substituir" · boleto composto com soma diferente = AVISA, nunca bloqueia, e deixa explicar).
-- Cada boleto entra UMA vez por cliente (a chave é o título: a linha digitável convertida no código de barras de 44 dígitos, DV
-- conferido — a mesma linha lida pelo PDF, digitada, pelo DDA ou pelo e-mail cai no item que já existe) e mostra a SITUAÇÃO À VISTA lida
-- das fontes de hoje (status, conta, datas, conciliação, quem programou), nunca copiada. O DDA (D2) entra só como leitura por esta porta.
--   1. boletos · 2. boleto_lancamentos (1 boleto → N lançamentos; um boleto VIVO por lançamento) · 3. boleto_trilha
--   4. internas: DV/normalização, quem programou, o lançamento como jsonb, situação, candidatos
--   5. RPCs: fn_boleto_entrar (prévia = p_simular, padrão true) · fn_boleto_situacao · fn_boleto_ligar · fn_boleto_desligar ·
--      fn_boleto_substituir · fn_boleto_marcar (sem par / descartar / reabrir) · fn_boletos_lista
-- NADA AQUI ESCREVE EM financeiro_lancamentos_v2: ligar não muda status, valor nem vencimento ("Ajustar" é o Editar lançamento de hoje).
-- O vencimento pelo fator segue a regra de src/lib/financeiro/linhaDigitavel.ts (fator 1000 = 22/02/2025). Sem dado de cliente.
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.boletos') is not null or to_regclass('public.boleto_lancamentos') is not null then
    raise exception 'BOLETO-D1: as tabelas já existem: refazer.';
  end if;
end $$;

-- ═══ 1. o boleto (o título) ═══
create table public.boletos (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid not null references public.clientes(id),
  codigo_barras          text not null check (codigo_barras ~ '^[0-9]{44}$'),
  linha_digitavel        text not null check (linha_digitavel ~ '^[0-9]{47,48}$'),
  tipo                   text not null check (tipo in ('bancario', 'arrecadacao')),
  banco_emissor          text,
  valor                  numeric check (valor is null or valor >= 0),
  vencimento             date,
  beneficiario_nome      text,
  beneficiario_documento text,
  pagador_nome           text,
  pagador_documento      text,
  origem                 text not null check (origem in ('pdf', 'digitado', 'dda', 'email', 'whatsapp')),
  origem_ref             text,
  dados_lidos            jsonb,
  storage_path           text,
  arquivo_nome           text,
  situacao               text not null default 'novo' check (situacao in ('novo', 'ligado', 'sem_par', 'descartado', 'substituido')),
  substituido_por        uuid references public.boletos(id),
  descartado_motivo      text,
  criado_em              timestamptz not null default now(),
  criado_por             uuid,
  alterado_em            timestamptz not null default now()
);
-- G1: o título entra uma vez por cliente — inclusive o descartado (descartar não libera reentrar sem ver)
create unique index uq_boletos_titulo on public.boletos (cliente_id, codigo_barras);
create index idx_boletos_cliente_situacao on public.boletos (cliente_id, situacao, vencimento);

-- ═══ 2. boleto × lançamentos ═══
create table public.boleto_lancamentos (
  id               uuid primary key default gen_random_uuid(),
  boleto_id        uuid not null references public.boletos(id),
  lancamento_id    uuid not null references public.financeiro_lancamentos_v2(id),
  cliente_id       uuid not null references public.clientes(id),
  vivo             boolean not null default true,
  ligado_em        timestamptz not null default now(),
  ligado_por       uuid,
  desligado_em     timestamptz,
  desligado_por    uuid,
  desligado_motivo text
);
-- G2: um boleto VIVO por lançamento (o reemitido entra pelo Substituir)
create unique index uq_boleto_lancamento_vivo on public.boleto_lancamentos (lancamento_id) where vivo;
create index idx_boleto_lancamentos_boleto on public.boleto_lancamentos (boleto_id);

-- ═══ 3. trilha ═══
create table public.boleto_trilha (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  boleto_id  uuid not null references public.boletos(id),
  acao       text not null check (acao in ('entrou', 'entrou_de_novo', 'ligado', 'desligado', 'substituido', 'sem_par', 'descartado', 'reaberto')),
  origem     text,
  antes      jsonb,
  depois     jsonb,
  motivo     text,
  por        uuid,
  em         timestamptz not null default now()
);
create index idx_boleto_trilha on public.boleto_trilha (boleto_id, em);

-- RLS: leitura por tenant; escrita só pelas RPCs
alter table public.boletos enable row level security;
alter table public.boleto_lancamentos enable row level security;
alter table public.boleto_trilha enable row level security;
create policy boletos_select on public.boletos for select to authenticated using (public.tenant_ok(cliente_id));
create policy boleto_lancamentos_select on public.boleto_lancamentos for select to authenticated using (public.tenant_ok(cliente_id));
create policy boleto_trilha_select on public.boleto_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.boletos, public.boleto_lancamentos, public.boleto_trilha from public, anon, authenticated;
grant select on public.boletos, public.boleto_lancamentos, public.boleto_trilha to authenticated;
grant all on public.boletos, public.boleto_lancamentos, public.boleto_trilha to service_role;
-- usuário só de leitura não grava (a mesma guarda das outras 148 tabelas; as RPCs são SECURITY DEFINER e passariam por cima sem ela)
create trigger trg_leitura_nao_grava before insert or delete or update on public.boletos for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.boleto_lancamentos for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.boleto_trilha for each statement execute function public._fn_leitura_nao_grava();

-- ═══ 4a. dígitos verificadores (FEBRABAN) ═══
create or replace function public._fn_boleto_mod10(p text) returns int
language plpgsql immutable set search_path = public as $f$
declare t int := 0; w int := 2; p2 int; i int;
begin
  for i in reverse length(p)..1 loop
    p2 := substr(p, i, 1)::int * w;
    t := t + p2 / 10 + p2 % 10;
    w := case when w = 2 then 1 else 2 end;
  end loop;
  return (10 - t % 10) % 10;
end $f$;

-- p_arrecadacao = false: módulo 11 do código de barras bancário (resto 0/10/11 → 1); true: o da arrecadação (resto 0/1 → 0)
create or replace function public._fn_boleto_mod11(p text, p_arrecadacao boolean) returns int
language plpgsql immutable set search_path = public as $f$
declare t int := 0; w int := 2; i int; d int;
begin
  for i in reverse length(p)..1 loop
    t := t + substr(p, i, 1)::int * w;
    w := case when w = 9 then 2 else w + 1 end;
  end loop;
  if p_arrecadacao then
    return case when t % 11 <= 1 then 0 else 11 - t % 11 end;
  end if;
  d := 11 - t % 11;
  return case when d in (0, 10, 11) then 1 else d end;
end $f$;

-- Linha de 47 (bancário) ou 48 (arrecadação) ou o código de barras de 44 → {ok, codigo_barras, linha, tipo, banco, valor, vencimento}
-- ou {ok:false, motivo}. Nunca adivinha: dígito verificador errado = não confere.
create or replace function public._fn_boleto_normalizar(p text) returns jsonb
language plpgsql immutable set search_path = public as $f$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'); bc text; ln text; v_arr boolean; v_mod11 boolean; b text; i int;
  v_fator int; v_valor numeric; v_venc date;
begin
  if length(d) = 47 then
    if public._fn_boleto_mod10(substr(d, 1, 9)) <> substr(d, 10, 1)::int or public._fn_boleto_mod10(substr(d, 11, 10)) <> substr(d, 21, 1)::int
       or public._fn_boleto_mod10(substr(d, 22, 10)) <> substr(d, 32, 1)::int then
      return jsonb_build_object('ok', false, 'motivo', 'dv_campo');
    end if;
    bc := substr(d, 1, 4) || substr(d, 33, 1) || substr(d, 34, 14) || substr(d, 5, 5) || substr(d, 11, 10) || substr(d, 22, 10);
    ln := d; v_arr := false;
  elsif length(d) = 48 then
    if substr(d, 1, 1) <> '8' then return jsonb_build_object('ok', false, 'motivo', 'arrecadacao_sem_8'); end if;
    v_mod11 := substr(d, 3, 1) in ('8', '9');
    bc := '';
    for i in 0..3 loop
      b := substr(d, i * 12 + 1, 11);
      if (case when v_mod11 then public._fn_boleto_mod11(b, true) else public._fn_boleto_mod10(b) end) <> substr(d, i * 12 + 12, 1)::int then
        return jsonb_build_object('ok', false, 'motivo', 'dv_bloco');
      end if;
      bc := bc || b;
    end loop;
    ln := d; v_arr := true;
  elsif length(d) = 44 then
    bc := d; v_arr := substr(d, 1, 1) = '8';
  else
    return jsonb_build_object('ok', false, 'motivo', 'tamanho');
  end if;

  if v_arr then
    v_mod11 := substr(bc, 3, 1) in ('8', '9');
    if (case when v_mod11 then public._fn_boleto_mod11(substr(bc, 1, 3) || substr(bc, 5), true)
             else public._fn_boleto_mod10(substr(bc, 1, 3) || substr(bc, 5)) end) <> substr(bc, 4, 1)::int then
      return jsonb_build_object('ok', false, 'motivo', 'dv_geral');
    end if;
    if ln is null then
      ln := '';
      for i in 0..3 loop
        b := substr(bc, i * 11 + 1, 11);
        ln := ln || b || (case when v_mod11 then public._fn_boleto_mod11(b, true) else public._fn_boleto_mod10(b) end)::text;
      end loop;
    end if;
    v_valor := case when substr(bc, 3, 1) in ('6', '8') then nullif(substr(bc, 5, 11)::numeric / 100, 0) end;
    return jsonb_build_object('ok', true, 'codigo_barras', bc, 'linha', ln, 'tipo', 'arrecadacao', 'banco', null, 'valor', v_valor, 'vencimento', null);
  end if;

  if public._fn_boleto_mod11(substr(bc, 1, 4) || substr(bc, 6), false) <> substr(bc, 5, 1)::int then
    return jsonb_build_object('ok', false, 'motivo', 'dv_geral');
  end if;
  if ln is null then
    ln := substr(bc, 1, 4) || substr(bc, 20, 5) || public._fn_boleto_mod10(substr(bc, 1, 4) || substr(bc, 20, 5))::text
       || substr(bc, 25, 10) || public._fn_boleto_mod10(substr(bc, 25, 10))::text
       || substr(bc, 35, 10) || public._fn_boleto_mod10(substr(bc, 35, 10))::text
       || substr(bc, 5, 1) || substr(bc, 6, 14);
  end if;
  v_fator := substr(bc, 6, 4)::int;
  v_venc := case when v_fator > 0 then date '2025-02-22' + (v_fator - 1000) end;
  v_valor := nullif(substr(bc, 10, 10)::numeric / 100, 0);
  return jsonb_build_object('ok', true, 'codigo_barras', bc, 'linha', ln, 'tipo', 'bancario', 'banco', substr(bc, 1, 3), 'valor', v_valor, 'vencimento', v_venc);
end $f$;

-- ═══ 4b. quem programou (a última passagem a programado/agendado, lida do audit_log; nunca copiada) ═══
create or replace function public._fn_lancamento_programado_por(p_lancamento uuid) returns jsonb
language sql stable set search_path = public as $f$
  select jsonb_build_object('usuario_id', a.usuario_id, 'nome', (select p.nome from public.profiles p where p.user_id = a.usuario_id), 'em', a.created_at)
    from public.audit_log a
   where a.tabela_origem = 'financeiro_lancamentos_v2' and a.registro_id = p_lancamento
     and a.dados_novos->>'status_transacao' in ('programado', 'agendado')
     and (a.dados_anteriores is null or coalesce(a.dados_anteriores->>'status_transacao', '') not in ('programado', 'agendado'))
   order by a.created_at desc limit 1
$f$;

-- ═══ 4c. o lançamento como a caixa o mostra (a situação à vista) ═══
create or replace function public._fn_boleto_lancamento_json(p_id uuid) returns jsonb
language sql stable set search_path = public as $f$
  select jsonb_build_object('id', l.id, 'descricao', l.descricao, 'valor', abs(l.valor), 'status', l.status_transacao, 'cancelado', coalesce(l.cancelado, false),
      'vencimento', l.data_vencimento, 'agendado_para', l.data_agendada, 'pagamento', l.data_pagamento,
      'favorecido_id', l.favorecido_id, 'favorecido', f.nome, 'favorecido_documento', f.cpf_cnpj,
      'conta', (select cb.nome_exibicao from public.financeiro_contas_bancarias cb where cb.id = l.conta_efetiva_id),
      'conciliado', (l.status_transacao = 'conciliado' or l.conciliado_em is not null
                     or exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = l.id and c.desfeito_em is null)),
      'conciliado_em', l.conciliado_em,
      'programado_por', case when l.status_transacao in ('programado', 'agendado') then public._fn_lancamento_programado_por(l.id) end)
    from public.financeiro_lancamentos_v2 l left join public.financeiro_fornecedores f on f.id = l.favorecido_id
   where l.id = p_id
$f$;

-- ═══ 4d. o boleto como jsonb ═══
create or replace function public._fn_boleto_json(b public.boletos) returns jsonb
language sql stable set search_path = public as $f$
  select jsonb_build_object('id', b.id, 'codigo_barras', b.codigo_barras, 'linha_digitavel', b.linha_digitavel, 'tipo', b.tipo, 'banco_emissor', b.banco_emissor,
    'valor', b.valor, 'vencimento', b.vencimento, 'beneficiario_nome', b.beneficiario_nome, 'beneficiario_documento', b.beneficiario_documento,
    'pagador_nome', b.pagador_nome, 'pagador_documento', b.pagador_documento, 'origem', b.origem, 'situacao', b.situacao,
    'substituido_por', b.substituido_por, 'descartado_motivo', b.descartado_motivo, 'storage_path', b.storage_path, 'arquivo_nome', b.arquivo_nome,
    'criado_em', b.criado_em)
$f$;

-- ═══ 4e. candidatos: parcela em aberto do MESMO CNPJ (inteiro) + mesmo valor (meio centavo) + vencimento ±5 → soma de 2–3 → por nome ═══
-- o "pool": saídas em aberto do cliente, no vencimento ±5, sem boleto vivo (a chave do fornecedor vai junto)
create or replace function public._fn_boleto_pool(b public.boletos)
returns table (id uuid, valor numeric, venc date, chave text)
language sql stable set search_path = public as $f$
  select l.id, abs(l.valor), l.data_vencimento, public._fn_fornecedor_chave_documento(f.cpf_cnpj)
    from public.financeiro_lancamentos_v2 l left join public.financeiro_fornecedores f on f.id = l.favorecido_id
   where l.cliente_id = b.cliente_id and not coalesce(l.cancelado, false) and l.tipo_operacao = '2-Saídas'
     and l.status_transacao in ('previsto', 'programado', 'agendado')
     and (b.vencimento is null or l.data_vencimento between b.vencimento - 5 and b.vencimento + 5)
     and not exists (select 1 from public.boleto_lancamentos bl where bl.lancamento_id = l.id and bl.vivo)
$f$;

create or replace function public._fn_boleto_candidatos(b public.boletos) returns jsonb
language plpgsql stable set search_path = public as $f$
declare k text := public._fn_fornecedor_chave_documento(b.beneficiario_documento); v jsonb := '[]'::jsonb;
begin
  if b.valor is null then return v; end if;
  if k is not null then
    -- exato pelo CNPJ inteiro
    select coalesce(jsonb_agg(jsonb_build_object('tipo', 'exato', 'soma', p.valor,
             'lancamentos', jsonb_build_array(public._fn_boleto_lancamento_json(p.id))) order by abs(p.venc - coalesce(b.vencimento, p.venc)), p.id), '[]'::jsonb)
      into v
      from public._fn_boleto_pool(b) p where p.chave = k and abs(p.valor - b.valor) <= 0.005;
    if jsonb_array_length(v) > 0 then return v; end if;
    -- soma de 2 ou 3 parcelas do mesmo fornecedor (o boleto que paga mais de uma nota)
    with q as (select p.* from public._fn_boleto_pool(b) p where p.chave = k order by p.venc, p.id limit 20),
         c as (select array[a.id, b2.id] ids, a.valor + b2.valor s from q a join q b2 on a.id < b2.id
               union all
               select array[a.id, b2.id, c3.id], a.valor + b2.valor + c3.valor from q a join q b2 on a.id < b2.id join q c3 on b2.id < c3.id)
    select coalesce(jsonb_agg(jsonb_build_object('tipo', 'soma', 'soma', c.s,
             'lancamentos', (select jsonb_agg(public._fn_boleto_lancamento_json(x) order by x) from unnest(c.ids) x))), '[]'::jsonb)
      into v
      from (select * from c where abs(c.s - b.valor) <= 0.005 limit 5) c;
    if jsonb_array_length(v) > 0 then return v; end if;
  end if;
  -- por nome · confira (fornecedor SEM documento cujo nome casa com o beneficiário)
  if nullif(btrim(coalesce(b.beneficiario_nome, '')), '') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('tipo', 'por_nome', 'soma', p.valor,
             'lancamentos', jsonb_build_array(public._fn_boleto_lancamento_json(p.id))) order by p.venc, p.id), '[]'::jsonb)
      into v
      from public._fn_boleto_pool(b) p join public.financeiro_lancamentos_v2 l on l.id = p.id join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where p.chave is null and abs(p.valor - b.valor) <= 0.005
       and (public._fn_normalizar_texto(f.nome) = public._fn_normalizar_texto(b.beneficiario_nome)
            or public.fn_texto_casa(b.beneficiario_nome, f.nome) or public.fn_texto_casa(f.nome, b.beneficiario_nome));
  end if;
  return v;
end $f$;

-- ═══ 4f. a situação à vista + os avisos (G3 já pago · G4 já programado · G5 pagador de fora · soma diferente) — só avisam ═══
create or replace function public._fn_boleto_situacao(b public.boletos) returns jsonb
language plpgsql stable set search_path = public as $f$
declare v_lancs jsonb; v_avisos jsonb := '[]'::jsonb; v_soma numeric; k text := public._fn_fornecedor_chave_documento(b.beneficiario_documento);
  v_parecidos jsonb; v_kp text := public._fn_fornecedor_chave_documento(b.pagador_documento); v_motivo text;
begin
  select coalesce(jsonb_agg(public._fn_boleto_lancamento_json(bl.lancamento_id) order by bl.ligado_em, bl.lancamento_id), '[]'::jsonb),
         sum(abs(l.valor))
    into v_lancs, v_soma
    from public.boleto_lancamentos bl join public.financeiro_lancamentos_v2 l on l.id = bl.lancamento_id
   where bl.boleto_id = b.id and bl.vivo;
  if exists (select 1 from jsonb_array_elements(v_lancs) x where x->>'status' in ('realizado', 'conciliado')) then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'ja_pago');
  end if;
  if exists (select 1 from jsonb_array_elements(v_lancs) x where x->>'status' in ('programado', 'agendado')) then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'ja_programado',
      'por', (select x->'programado_por' from jsonb_array_elements(v_lancs) x where x->>'status' in ('programado', 'agendado') limit 1));
  end if;
  if v_soma is not null and b.valor is not null and abs(v_soma - b.valor) > 0.005 then
    select t.motivo into v_motivo from public.boleto_trilha t where t.boleto_id = b.id and t.acao in ('ligado', 'substituido') order by t.em desc limit 1;
    v_avisos := v_avisos || jsonb_build_object('codigo', 'soma_diferente', 'soma', v_soma, 'valor', b.valor, 'diferenca', round(b.valor - v_soma, 2), 'explicacao', v_motivo);
  end if;
  -- outro lançamento JÁ PAGO que parece este título (mesmo CNPJ + valor + vencimento ±5), fora dos ligados
  if k is not null and b.valor is not null then
    select jsonb_agg(public._fn_boleto_lancamento_json(l.id) order by l.data_pagamento desc nulls last, l.id)
      into v_parecidos
      from public.financeiro_lancamentos_v2 l join public.financeiro_fornecedores f on f.id = l.favorecido_id
     where l.cliente_id = b.cliente_id and not coalesce(l.cancelado, false) and l.status_transacao in ('realizado', 'conciliado')
       and public._fn_fornecedor_chave_documento(f.cpf_cnpj) = k and abs(abs(l.valor) - b.valor) <= 0.005
       and (b.vencimento is null or l.data_vencimento between b.vencimento - 5 and b.vencimento + 5)
       and not exists (select 1 from public.boleto_lancamentos bl where bl.boleto_id = b.id and bl.vivo and bl.lancamento_id = l.id);
    if v_parecidos is not null then
      v_avisos := v_avisos || jsonb_build_object('codigo', 'parece_ja_pago', 'lancamentos', v_parecidos);
    end if;
  end if;
  -- pagador que não é titular do cliente (só quando o cliente tem titulares cadastrados)
  if v_kp is not null and exists (select 1 from public.fiscal_titulares t where t.cliente_id = b.cliente_id and t.ativo)
     and not exists (select 1 from public.fiscal_titulares t where t.cliente_id = b.cliente_id and t.ativo
                      and v_kp in (public._fn_fornecedor_chave_documento(t.documento), public._fn_fornecedor_chave_documento(t.cnpj_produtor))) then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'pagador_de_fora');
  end if;
  return jsonb_build_object('lancamentos', v_lancs, 'soma_ligada', v_soma, 'avisos', v_avisos);
end $f$;

revoke all on function public._fn_boleto_mod10(text) from public, anon, authenticated;
revoke all on function public._fn_boleto_mod11(text, boolean) from public, anon, authenticated;
revoke all on function public._fn_boleto_normalizar(text) from public, anon, authenticated;
revoke all on function public._fn_lancamento_programado_por(uuid) from public, anon, authenticated;
revoke all on function public._fn_boleto_lancamento_json(uuid) from public, anon, authenticated;
revoke all on function public._fn_boleto_json(public.boletos) from public, anon, authenticated;
revoke all on function public._fn_boleto_pool(public.boletos) from public, anon, authenticated;
revoke all on function public._fn_boleto_candidatos(public.boletos) from public, anon, authenticated;
revoke all on function public._fn_boleto_situacao(public.boletos) from public, anon, authenticated;

-- ═══ 5a. entrar (qualquer porta) ═══
-- p_leitura: {linha (47/48/44, com ou sem separador), origem, origem_ref, beneficiario_nome, beneficiario_documento, pagador_nome,
--             pagador_documento, valor, vencimento, arquivo_nome, arquivo_extensao, dados}
create or replace function public.fn_boleto_entrar(p_cliente_id uuid, p_leitura jsonb, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare
  d jsonb := coalesce(p_leitura, '{}'::jsonb); k text; n jsonb; e public.boletos; nb public.boletos; v_sim boolean := coalesce(p_simular, true);
  c_campos constant text[] := array['linha', 'origem', 'origem_ref', 'beneficiario_nome', 'beneficiario_documento', 'pagador_nome', 'pagador_documento',
    'valor', 'vencimento', 'arquivo_nome', 'arquivo_extensao', 'dados'];
  v_avisos jsonb := '[]'::jsonb; v_recusa jsonb; v_ext text; v_preenche jsonb := '{}'::jsonb; v_lido numeric;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  for k in select jsonb_object_keys(d) loop
    if not k = any(c_campos) then raise exception using errcode = 'P0001', message = format('Campo %s não entra aqui.', k); end if;
  end loop;
  n := public._fn_boleto_normalizar(d->>'linha');
  if not (n->>'ok')::boolean then
    v_recusa := jsonb_build_object('motivo', 'linha_nao_confere', 'detalhe', n->>'motivo',
      'frase', 'A linha digitável não confere (dígito verificador ou tamanho). Confira os números.');
  elsif coalesce(d->>'origem', '') not in ('pdf', 'digitado', 'dda', 'email', 'whatsapp') then
    v_recusa := jsonb_build_object('motivo', 'origem', 'frase', 'Porta de entrada inválida.');
  end if;
  if v_recusa is not null then
    if not v_sim then raise exception using errcode = 'P0001', message = (v_recusa->>'frase') || ' Nada foi gravado.'; end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', v_recusa);
  end if;

  -- G1: o título já está na caixa → abre o que existe (nunca um segundo)
  select * into e from public.boletos where cliente_id = p_cliente_id and codigo_barras = n->>'codigo_barras';
  if found then
    -- o vazio preenche; o diferente fica como estava (só a trilha guarda o que veio)
    if e.beneficiario_documento is null and nullif(d->>'beneficiario_documento', '') is not null then v_preenche := v_preenche || jsonb_build_object('beneficiario_documento', d->>'beneficiario_documento'); end if;
    if e.beneficiario_nome is null and nullif(d->>'beneficiario_nome', '') is not null then v_preenche := v_preenche || jsonb_build_object('beneficiario_nome', d->>'beneficiario_nome'); end if;
    if e.pagador_documento is null and nullif(d->>'pagador_documento', '') is not null then v_preenche := v_preenche || jsonb_build_object('pagador_documento', d->>'pagador_documento'); end if;
    if e.pagador_nome is null and nullif(d->>'pagador_nome', '') is not null then v_preenche := v_preenche || jsonb_build_object('pagador_nome', d->>'pagador_nome'); end if;
    if not v_sim then
      update public.boletos set beneficiario_documento = coalesce(beneficiario_documento, v_preenche->>'beneficiario_documento'),
             beneficiario_nome = coalesce(beneficiario_nome, v_preenche->>'beneficiario_nome'),
             pagador_documento = coalesce(pagador_documento, v_preenche->>'pagador_documento'),
             pagador_nome = coalesce(pagador_nome, v_preenche->>'pagador_nome'),
             alterado_em = case when v_preenche = '{}'::jsonb then alterado_em else now() end
       where id = e.id
      returning * into e;
      insert into public.boleto_trilha (cliente_id, boleto_id, acao, origem, depois, por)
      values (p_cliente_id, e.id, 'entrou_de_novo', d->>'origem', d - 'dados', auth.uid());
    end if;
    return jsonb_build_object('ok', true, 'simulado', v_sim, 'ja_existe', true, 'id', e.id, 'preenche', v_preenche,
      'frase', format('Este boleto já está no sistema desde %s.', to_char(e.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')),
      'boleto', public._fn_boleto_json(e), 'situacao', public._fn_boleto_situacao(e),
      'candidatos', case when e.situacao in ('novo', 'sem_par') then public._fn_boleto_candidatos(e) else '[]'::jsonb end);
  end if;

  nb.id := gen_random_uuid(); nb.cliente_id := p_cliente_id; nb.codigo_barras := n->>'codigo_barras'; nb.linha_digitavel := n->>'linha';
  nb.tipo := n->>'tipo'; nb.banco_emissor := n->>'banco';
  v_lido := round(nullif(d->>'valor', '')::numeric, 2);
  nb.valor := coalesce((n->>'valor')::numeric, v_lido);
  nb.vencimento := coalesce((n->>'vencimento')::date, nullif(d->>'vencimento', '')::date);
  if v_lido is not null and (n->>'valor') is not null and abs(v_lido - (n->>'valor')::numeric) > 0.005 then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'valor_lido_diferente', 'lido', v_lido, 'do_codigo', (n->>'valor')::numeric);
  end if;
  nb.beneficiario_nome := nullif(btrim(coalesce(d->>'beneficiario_nome', '')), '');
  nb.beneficiario_documento := nullif(btrim(coalesce(d->>'beneficiario_documento', '')), '');
  nb.pagador_nome := nullif(btrim(coalesce(d->>'pagador_nome', '')), '');
  nb.pagador_documento := nullif(btrim(coalesce(d->>'pagador_documento', '')), '');
  nb.origem := d->>'origem'; nb.origem_ref := nullif(d->>'origem_ref', ''); nb.dados_lidos := d->'dados';
  nb.arquivo_nome := nullif(btrim(coalesce(d->>'arquivo_nome', '')), '');
  if d ? 'arquivo_extensao' then
    v_ext := lower(regexp_replace(coalesce(d->>'arquivo_extensao', ''), '[^A-Za-z0-9]', '', 'g'));
    nb.storage_path := p_cliente_id::text || '/boletos/' || nb.id::text || '.' || coalesce(nullif(v_ext, ''), 'bin');
  end if;
  nb.situacao := 'novo'; nb.criado_em := now(); nb.criado_por := auth.uid(); nb.alterado_em := now();
  if nb.vencimento is null then v_avisos := v_avisos || jsonb_build_object('codigo', 'sem_vencimento'); end if;
  if nb.valor is null then v_avisos := v_avisos || jsonb_build_object('codigo', 'sem_valor'); end if;

  if not v_sim then
    insert into public.boletos select nb.*;
    insert into public.boleto_trilha (cliente_id, boleto_id, acao, origem, depois, por)
    values (p_cliente_id, nb.id, 'entrou', nb.origem, public._fn_boleto_json(nb), auth.uid());
  end if;
  return jsonb_build_object('ok', true, 'simulado', v_sim, 'ja_existe', false, 'id', case when v_sim then null else nb.id end,
    'storage_path', case when v_sim then null else nb.storage_path end, 'avisos', v_avisos,
    'boleto', public._fn_boleto_json(nb), 'situacao', public._fn_boleto_situacao(nb), 'candidatos', public._fn_boleto_candidatos(nb));
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'Este boleto acabou de entrar por outra porta. Abra a caixa de novo. Nada foi gravado.';
end $f$;

-- ═══ 5b. a situação de um boleto (só lê) ═══
create or replace function public.fn_boleto_situacao(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare b public.boletos;
begin
  select * into b from public.boletos where id = p_id;
  if not found or not coalesce(public.tenant_ok(b.cliente_id), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  return jsonb_build_object('boleto', public._fn_boleto_json(b), 'situacao', public._fn_boleto_situacao(b),
    'candidatos', case when b.situacao in ('novo', 'sem_par') then public._fn_boleto_candidatos(b) else '[]'::jsonb end,
    'trilha', (select coalesce(jsonb_agg(jsonb_build_object('acao', t.acao, 'origem', t.origem, 'motivo', t.motivo, 'em', t.em,
                 'por', (select p.nome from public.profiles p where p.user_id = t.por)) order by t.em, t.id), '[]'::jsonb)
                 from public.boleto_trilha t where t.boleto_id = b.id));
end $f$;

-- ═══ 5c. ligar (G2: um boleto vivo por lançamento; nunca toca o lançamento) ═══
create or replace function public.fn_boleto_ligar(p_id uuid, p_lancamentos uuid[], p_motivo text default null, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare b public.boletos; v_sim boolean := coalesce(p_simular, true); v_recusa jsonb; v_avisos jsonb := '[]'::jsonb; v_soma numeric; x uuid;
  v_outro record; k text; v_n int := coalesce(cardinality(p_lancamentos), 0);
begin
  select * into b from public.boletos where id = p_id;
  if not found or not coalesce(public.tenant_ok(b.cliente_id), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if exists (select 1 from unnest(coalesce(p_lancamentos, '{}')) u left join public.financeiro_lancamentos_v2 l on l.id = u where l.id is null or l.cliente_id <> b.cliente_id) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  k := public._fn_fornecedor_chave_documento(b.beneficiario_documento);
  select sum(abs(l.valor)) into v_soma from public.financeiro_lancamentos_v2 l where l.id = any (p_lancamentos);
  select bl.lancamento_id, o.id outro, o.vencimento, o.valor into v_outro
    from public.boleto_lancamentos bl join public.boletos o on o.id = bl.boleto_id
   where bl.lancamento_id = any (p_lancamentos) and bl.vivo and bl.boleto_id <> b.id limit 1;

  if b.situacao not in ('novo', 'sem_par') then
    v_recusa := jsonb_build_object('motivo', 'situacao', 'frase', case b.situacao when 'ligado' then 'Este boleto já está ligado. Desligue antes de ligar a outro lançamento.'
      when 'descartado' then 'Este boleto foi descartado. Reabra antes de ligar.' else 'Este boleto foi substituído por outro.' end);
  elsif v_n = 0 or v_n > 10 then
    v_recusa := jsonb_build_object('motivo', 'quantidade', 'frase', 'Escolha de 1 a 10 lançamentos.');
  elsif (select count(distinct u) from unnest(p_lancamentos) u) <> v_n then
    v_recusa := jsonb_build_object('motivo', 'repetido', 'frase', 'O mesmo lançamento aparece duas vezes.');
  elsif exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = any (p_lancamentos) and coalesce(l.cancelado, false)) then
    v_recusa := jsonb_build_object('motivo', 'cancelado', 'frase', 'Um dos lançamentos está cancelado.');
  elsif v_outro.lancamento_id is not null then
    v_recusa := jsonb_build_object('motivo', 'lancamento_ja_tem_boleto', 'lancamento_id', v_outro.lancamento_id, 'outro_boleto_id', v_outro.outro,
      'frase', format('Este lançamento já tem o boleto de %s (venc. %s). Para trocar, use Substituir.',
                      coalesce('R$ ' || replace(to_char(v_outro.valor, 'FM999999990.00'), '.', ','), 'valor livre'), coalesce(to_char(v_outro.vencimento, 'DD/MM/YYYY'), 'sem vencimento')));
  end if;
  if v_recusa is not null then
    if not v_sim then raise exception using errcode = 'P0001', message = (v_recusa->>'frase') || ' Nada foi gravado.'; end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', v_recusa);
  end if;

  -- avisos: explicam, nunca bloqueiam (regra do Gabriel)
  if b.valor is not null and abs(v_soma - b.valor) > 0.005 then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'soma_diferente', 'soma', v_soma, 'valor', b.valor, 'diferenca', round(b.valor - v_soma, 2),
      'frase', 'O boleto e os lançamentos não somam igual: desconto, juros ou multa? Explique no motivo.');
  end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = any (p_lancamentos) and l.status_transacao in ('realizado', 'conciliado')) then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'ja_pago');
  end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = any (p_lancamentos) and l.status_transacao in ('programado', 'agendado')) then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'ja_programado');
  end if;
  if k is not null and exists (select 1 from public.financeiro_lancamentos_v2 l left join public.financeiro_fornecedores f on f.id = l.favorecido_id
                                where l.id = any (p_lancamentos) and public._fn_fornecedor_chave_documento(f.cpf_cnpj) is distinct from k) then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'beneficiario_diferente', 'frase', 'O CNPJ do beneficiário do boleto não é o do fornecedor do lançamento: confira antes de pagar.');
  end if;
  if b.vencimento is not null and exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = any (p_lancamentos) and abs(l.data_vencimento - b.vencimento) > 5) then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'vencimento_diferente');
  end if;
  if v_sim then
    return jsonb_build_object('ok', true, 'simulado', true, 'id', b.id, 'soma', v_soma, 'avisos', v_avisos,
      'lancamentos', (select jsonb_agg(public._fn_boleto_lancamento_json(u) order by u) from unnest(p_lancamentos) u));
  end if;
  foreach x in array p_lancamentos loop
    insert into public.boleto_lancamentos (boleto_id, lancamento_id, cliente_id, ligado_por) values (b.id, x, b.cliente_id, auth.uid());
  end loop;
  update public.boletos set situacao = 'ligado', alterado_em = now() where id = b.id;
  insert into public.boleto_trilha (cliente_id, boleto_id, acao, depois, motivo, por)
  values (b.cliente_id, b.id, 'ligado', jsonb_build_object('lancamentos', to_jsonb(p_lancamentos), 'soma', v_soma, 'avisos', v_avisos),
          nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', b.id, 'soma', v_soma, 'avisos', v_avisos);
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'Este lançamento acabou de receber outro boleto. Nada foi gravado.';
end $f$;

-- ═══ 5d. desligar (um lançamento ou todos; motivo; o boleto volta a "novo" quando não sobra nenhum) ═══
create or replace function public.fn_boleto_desligar(p_id uuid, p_lancamento uuid, p_motivo text, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare b public.boletos; v_sim boolean := coalesce(p_simular, true); v_n int;
begin
  select * into b from public.boletos where id = p_id;
  if not found or not coalesce(public.tenant_ok(b.cliente_id), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  select count(*) into v_n from public.boleto_lancamentos where boleto_id = b.id and vivo and (p_lancamento is null or lancamento_id = p_lancamento);
  if v_n = 0 then
    if not v_sim then raise exception using errcode = 'P0001', message = 'Não há ligação para desligar. Nada foi gravado.'; end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', 'nada_ligado', 'frase', 'Não há ligação para desligar.'));
  end if;
  if v_sim then return jsonb_build_object('ok', true, 'simulado', true, 'id', b.id, 'desliga', v_n); end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo para desligar. Nada foi gravado.';
  end if;
  update public.boleto_lancamentos set vivo = false, desligado_em = now(), desligado_por = auth.uid(), desligado_motivo = btrim(p_motivo)
   where boleto_id = b.id and vivo and (p_lancamento is null or lancamento_id = p_lancamento);
  update public.boletos set situacao = 'novo', alterado_em = now()
   where id = b.id and not exists (select 1 from public.boleto_lancamentos bl where bl.boleto_id = b.id and bl.vivo);
  insert into public.boleto_trilha (cliente_id, boleto_id, acao, antes, motivo, por)
  values (b.cliente_id, b.id, 'desligado', jsonb_build_object('lancamento_id', p_lancamento, 'qtde', v_n), btrim(p_motivo), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', b.id, 'desliga', v_n);
end $f$;

-- ═══ 5e. substituir (o boleto reemitido assume os lançamentos do antigo; o antigo fica 'substituido') ═══
create or replace function public.fn_boleto_substituir(p_antigo uuid, p_novo uuid, p_motivo text, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare a public.boletos; n public.boletos; v_sim boolean := coalesce(p_simular, true); v_recusa jsonb; v_lancs uuid[]; v_soma numeric; v_avisos jsonb := '[]'::jsonb; x uuid;
begin
  select * into a from public.boletos where id = p_antigo;
  select * into n from public.boletos where id = p_novo;
  if a.id is null or n.id is null or not coalesce(public.tenant_ok(a.cliente_id), false) or n.cliente_id <> a.cliente_id then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select array_agg(bl.lancamento_id order by bl.lancamento_id) into v_lancs from public.boleto_lancamentos bl where bl.boleto_id = a.id and bl.vivo;
  if a.id = n.id then
    v_recusa := jsonb_build_object('motivo', 'mesmo', 'frase', 'Escolha um boleto diferente.');
  elsif a.situacao <> 'ligado' or v_lancs is null then
    v_recusa := jsonb_build_object('motivo', 'antigo_nao_ligado', 'frase', 'O boleto a substituir não está ligado a nenhum lançamento.');
  elsif n.situacao not in ('novo', 'sem_par') then
    v_recusa := jsonb_build_object('motivo', 'novo_indisponivel', 'frase', 'O boleto novo já está ligado, descartado ou substituído.');
  end if;
  if v_recusa is not null then
    if not v_sim then raise exception using errcode = 'P0001', message = (v_recusa->>'frase') || ' Nada foi gravado.'; end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', v_recusa);
  end if;
  select sum(abs(l.valor)) into v_soma from public.financeiro_lancamentos_v2 l where l.id = any (v_lancs);
  if n.valor is not null and abs(v_soma - n.valor) > 0.005 then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'soma_diferente', 'soma', v_soma, 'valor', n.valor, 'diferenca', round(n.valor - v_soma, 2));
  end if;
  if v_sim then return jsonb_build_object('ok', true, 'simulado', true, 'lancamentos', to_jsonb(v_lancs), 'avisos', v_avisos); end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo da substituição. Nada foi gravado.';
  end if;
  update public.boleto_lancamentos set vivo = false, desligado_em = now(), desligado_por = auth.uid(), desligado_motivo = 'substituído: ' || btrim(p_motivo)
   where boleto_id = a.id and vivo;
  foreach x in array v_lancs loop
    insert into public.boleto_lancamentos (boleto_id, lancamento_id, cliente_id, ligado_por) values (n.id, x, n.cliente_id, auth.uid());
  end loop;
  update public.boletos set situacao = 'substituido', substituido_por = n.id, alterado_em = now() where id = a.id;
  update public.boletos set situacao = 'ligado', alterado_em = now() where id = n.id;
  insert into public.boleto_trilha (cliente_id, boleto_id, acao, depois, motivo, por)
  values (a.cliente_id, a.id, 'substituido', jsonb_build_object('por', n.id), btrim(p_motivo), auth.uid()),
         (n.cliente_id, n.id, 'ligado', jsonb_build_object('lancamentos', to_jsonb(v_lancs), 'soma', v_soma, 'no_lugar_de', a.id, 'avisos', v_avisos), btrim(p_motivo), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'lancamentos', to_jsonb(v_lancs), 'avisos', v_avisos);
end $f$;

-- ═══ 5f. marcar: sem par · descartar (motivo) · reabrir ═══
create or replace function public.fn_boleto_marcar(p_id uuid, p_situacao text, p_motivo text default null, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare b public.boletos; v_sim boolean := coalesce(p_simular, true); v_recusa jsonb;
begin
  select * into b from public.boletos where id = p_id;
  if not found or not coalesce(public.tenant_ok(b.cliente_id), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if p_situacao is null or p_situacao not in ('sem_par', 'descartado', 'novo') then
    v_recusa := jsonb_build_object('motivo', 'situacao_invalida', 'frase', 'Situação inválida.');
  elsif p_situacao in ('sem_par', 'descartado') and b.situacao not in ('novo', 'sem_par') then
    v_recusa := jsonb_build_object('motivo', 'situacao', 'frase', 'Só o boleto novo ou sem par muda para isso (o ligado se desliga antes).');
  elsif p_situacao = 'novo' and b.situacao not in ('sem_par', 'descartado') then
    v_recusa := jsonb_build_object('motivo', 'situacao', 'frase', 'Só o boleto sem par ou descartado se reabre.');
  elsif p_situacao = b.situacao then
    v_recusa := jsonb_build_object('motivo', 'sem_mudanca', 'frase', 'O boleto já está assim.');
  end if;
  if v_recusa is not null then
    if not v_sim then raise exception using errcode = 'P0001', message = (v_recusa->>'frase') || ' Nada foi gravado.'; end if;
    return jsonb_build_object('ok', false, 'simulado', true, 'recusa', v_recusa);
  end if;
  if v_sim then return jsonb_build_object('ok', true, 'simulado', true, 'id', b.id, 'de', b.situacao, 'para', p_situacao); end if;
  if p_situacao = 'descartado' and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo do descarte. Nada foi gravado.';
  end if;
  update public.boletos set situacao = p_situacao, alterado_em = now(),
         descartado_motivo = case when p_situacao = 'descartado' then btrim(p_motivo) else descartado_motivo end
   where id = b.id;
  insert into public.boleto_trilha (cliente_id, boleto_id, acao, antes, depois, motivo, por)
  values (b.cliente_id, b.id, case p_situacao when 'novo' then 'reaberto' else p_situacao end,
          jsonb_build_object('situacao', b.situacao), jsonb_build_object('situacao', p_situacao), nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', b.id, 'de', b.situacao, 'para', p_situacao);
end $f$;

-- ═══ 5g. a caixa (lista + contadores) ═══
create or replace function public.fn_boletos_lista(p_cliente_id uuid, p_situacoes text[] default null) returns jsonb
language plpgsql security definer set search_path = public as $f$
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return jsonb_build_object(
    'contadores', (select jsonb_build_object('novo', count(*) filter (where b.situacao = 'novo'), 'sem_par', count(*) filter (where b.situacao = 'sem_par'),
                     'ligado', count(*) filter (where b.situacao = 'ligado'), 'descartado', count(*) filter (where b.situacao = 'descartado'),
                     'substituido', count(*) filter (where b.situacao = 'substituido'))
                     from public.boletos b where b.cliente_id = p_cliente_id),
    'itens', (select coalesce(jsonb_agg(public._fn_boleto_json(b) || jsonb_build_object('situacao_atual', public._fn_boleto_situacao(b))
                 order by b.vencimento nulls last, b.criado_em, b.id), '[]'::jsonb)
                from public.boletos b where b.cliente_id = p_cliente_id and (p_situacoes is null or b.situacao = any (p_situacoes))));
end $f$;

-- ═══ ACL ═══
revoke all on function public.fn_boleto_entrar(uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_boleto_situacao(uuid) from public, anon;
revoke all on function public.fn_boleto_ligar(uuid, uuid[], text, boolean) from public, anon;
revoke all on function public.fn_boleto_desligar(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.fn_boleto_substituir(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.fn_boleto_marcar(uuid, text, text, boolean) from public, anon;
revoke all on function public.fn_boletos_lista(uuid, text[]) from public, anon;
grant execute on function public.fn_boleto_entrar(uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_boleto_situacao(uuid) to authenticated, service_role;
grant execute on function public.fn_boleto_ligar(uuid, uuid[], text, boolean) to authenticated, service_role;
grant execute on function public.fn_boleto_desligar(uuid, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.fn_boleto_substituir(uuid, uuid, text, boolean) to authenticated, service_role;
grant execute on function public.fn_boleto_marcar(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.fn_boletos_lista(uuid, text[]) to authenticated, service_role;
