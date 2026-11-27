-- FORN-FORMA-PELO-EXTRATO-01 (mock aprovado 24/11 com 2 ajustes de tela) — a forma de pagamento (e, quando dá, a chave PIX) de cada
-- fornecedor pelo HISTÓRICO DO EXTRATO CONCILIADO: prévia por fornecedor → gravar em lote (cadastro + lançamentos em aberto sem forma,
-- com trilha) → desfazer por fornecedor.
-- · A REGRA QUE LÊ O HISTÓRICO é UMA (`_fn_forma_pelo_historico`), a mesma para todos os bancos, medida na FASE 0 (BB, Itaú, Sicredi,
--   Bradesco). Imposto, tributo e pagamento de fatura de cartão NÃO dão forma (não dizem como o fornecedor recebe): sem sugestão.
-- · "Forma clara" = 2 ou mais pagamentos conciliados na janela e 80% ou mais com a mesma forma (`fn_forma_pelo_extrato_previa`).
-- · A CHAVE PIX nunca é inventada: só o CPF/CNPJ que o PRÓPRIO extrato mostra (o Sicredi traz o documento de quem recebeu) e só quando é
--   o MESMO do cadastro do fornecedor; o cadastro que já tem chave não muda de chave.
-- · O CADASTRO muda SÓ pela `fn_fornecedor_atualizar_campos` (NOTA-FORNECEDOR-COMPARAR-01: trilha por campo e desfazer). Este lote a
--   estende — guardado pelo md5 da definição viva — para aceitar `tipo_recebimento`, `pix_tipo_chave` e `pix_chave` e a origem 'extrato'.
-- · OS LANÇAMENTOS: só as saídas ainda a pagar (a mesma `_fn_pronto_para_pagar_se_aplica` do FIN-PRONTO-PAGAR-01) desse fornecedor com a
--   forma EM BRANCO recebem a forma; as que já têm forma não mudam. A linha que o banco recusa (mês fechado, trava) fica de fora e é contada.
-- · DESFAZER (`fn_forma_pelo_extrato_desfazer`): volta o cadastro pelo desfazer da trilha e tira a forma SÓ dos lançamentos que este gesto
--   preencheu e que ainda têm a mesma forma e seguem a pagar; os outros ficam listados ("mantidos"), sem mudar.
-- · Vocabulário: o do cadastro (`FORMAS_PREFERIDAS`: 'PIX', 'Transferência Bancária', 'Boleto'; 'Débito Automático' e 'Débito' entram como
--   valor gravado, que o formulário já mostra) e o do lançamento (`FORMAS_PAGAMENTO_V2`: 'PIX', 'Transferência', 'Boleto', 'Débito
--   Automático', 'Débito').
-- · Nasce fechado (SEG-TENANT-VARREDURA-01C): as internas só postgres/service_role; as 3 públicas checam `tenant_ok` (42501).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1) a regra que lê a forma pelo histórico do banco (pura)
create or replace function public._fn_forma_pelo_historico(p_texto text)
returns text
language sql
immutable
as $fn$
  select case
    when t ~ 'IMPOSTO|TRIBUTO|DARF|GPS|SEFAZ|FGTS|FATURA|PAGTO CART|PAGAMENTO CART|PAG CART' then null
    when t ~ 'PIX' then 'PIX'
    when t ~ 'BOLETO|COBRANCA|COBRANÇA|PAG TIT|PFOR|PAGFOR|PAGAMENTO DE TITULO|PAGAMENTO DE TÍTULO' then 'Boleto'
    when t ~ '(^|[^A-Z])TED([^A-Z]|$)|TRANSFER[EÊ]NCIA ENVIADA|TRANSF ENVIADA' then 'Transferência'
    when t ~ 'COMPRA COM CART|COMPRA DEBITO|COMPRA DÉBITO|COMPRA NO DEBITO|COMPRA NO DÉBITO' then 'Débito'
    when t ~ 'DEBITO CONV|DÉBITO CONV|DEB AUTOM|DÉB AUTOM|DEBITO AUTOM|DÉBITO AUTOM|PAGTO ENERGIA|PAGTO CONTA|PAGTO MENSALIDADE|SEGURO|CONS[OÓ]RCIO'
      then 'Débito Automático'
    else null end
  from (select upper(coalesce(p_texto, '')) t) x
$fn$;

-- a forma do LANÇAMENTO → a do CADASTRO (o cadastro diz "Transferência Bancária")
create or replace function public._fn_forma_no_cadastro(p_forma text)
returns text
language sql
immutable
as $fn$
  select case p_forma when 'Transferência' then 'Transferência Bancária' else p_forma end
$fn$;

-- o CPF/CNPJ que o extrato mostra numa linha de PIX (11 ou 14 algarismos soltos); nulo quando não há
create or replace function public._fn_doc_do_historico_pix(p_texto text)
returns text
language sql
immutable
as $fn$
  select case when upper(coalesce(p_texto, '')) ~ 'PIX'
              then (regexp_match(coalesce(p_texto, ''), '(?:^|[^0-9])([0-9]{14}|[0-9]{11})(?:[^0-9]|$)'))[1] end
$fn$;

revoke all on function public._fn_forma_pelo_historico(text) from public, anon, authenticated;
revoke all on function public._fn_forma_no_cadastro(text) from public, anon, authenticated;
revoke all on function public._fn_doc_do_historico_pix(text) from public, anon, authenticated;

-- 2) o cadastro aceita a forma e a chave pela trilha (patch GUARDADO pelo md5 da definição viva)
do $patch$
declare v_def text; v_novo text;
begin
  v_def := pg_get_functiondef('public.fn_fornecedor_atualizar_campos(uuid,jsonb,text,text,boolean)'::regprocedure);
  if md5(v_def) <> 'ddafd1ac3bd979f29602e0488675cef4' then
    raise exception 'FORN-FORMA: fn_fornecedor_atualizar_campos mudou (md5 %). Nada foi aplicado.', md5(v_def);
  end if;
  v_novo := replace(v_def, $a$'bairro', 'cep', 'municipio', 'uf'];$a$,
                           $a$'bairro', 'cep', 'municipio', 'uf', 'tipo_recebimento', 'pix_tipo_chave', 'pix_chave'];$a$);
  v_novo := replace(v_novo, $a$IF p_origem NOT IN ('nota', 'receita', 'tela') THEN$a$, $a$IF p_origem NOT IN ('nota', 'receita', 'tela', 'extrato') THEN$a$);
  if v_novo = v_def or (length(v_novo) - length(v_def)) <> (length($a$, 'tipo_recebimento', 'pix_tipo_chave', 'pix_chave'$a$) + length($a$, 'extrato'$a$)) then
    raise exception 'FORN-FORMA: as âncoras do patch não casaram. Nada foi aplicado.';
  end if;
  execute v_novo;
end $patch$;

alter table public.fornecedor_campos_alteracoes drop constraint fornecedor_campos_alteracoes_origem_check;
alter table public.fornecedor_campos_alteracoes add constraint fornecedor_campos_alteracoes_origem_check
  check (origem = any (array['nota'::text, 'receita'::text, 'tela'::text, 'extrato'::text]));

-- 3) a trilha do gesto (uma linha por fornecedor gravado)
create table if not exists public.fornecedor_forma_extrato_ops (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  fornecedor_id uuid not null references public.financeiro_fornecedores(id),
  forma text not null,
  chave text,
  pagamentos integer not null,
  iguais_pct numeric(5,1) not null,
  alteracao_id uuid references public.fornecedor_campos_alteracoes(id),
  lancamentos uuid[] not null default '{}',
  recusados integer not null default 0,
  feita_em timestamptz not null default now(),
  feita_por uuid default auth.uid(),
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeita_motivo text,
  mantidos uuid[],
  constraint ffeo_desfeita_coerente check ((desfeita_em is null) = (desfeita_motivo is null))
);
create index if not exists ffeo_cliente_idx on public.fornecedor_forma_extrato_ops (cliente_id, feita_em desc);
alter table public.fornecedor_forma_extrato_ops enable row level security;
drop policy if exists ffeo_ler on public.fornecedor_forma_extrato_ops;
create policy ffeo_ler on public.fornecedor_forma_extrato_ops for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fornecedor_forma_extrato_ops from anon;
revoke insert, update, delete on public.fornecedor_forma_extrato_ops from authenticated;
grant select on public.fornecedor_forma_extrato_ops to authenticated;

-- 4) a prévia por fornecedor (interna: o gravar refaz a MESMA conta; a pública só checa o acesso)
create or replace function public._fn_forma_pelo_extrato_sugestoes(p_cliente uuid, p_meses integer)
returns table(fornecedor_id uuid, nome text, pagamentos integer, iguais_pct numeric, forma text, forma_cadastro text, exemplo text,
              chave_sugerida text, tipo_chave text, abertos_sem_forma integer, hoje_forma text, hoje_chave text)
language sql
stable
set search_path to 'public'
as $fn$
  with pag as (
    select l.favorecido_id f, e.descricao d, public._fn_forma_pelo_historico(e.descricao) forma
      from conciliacao_bancaria_itens i
      join extrato_bancario_v2 e on e.id = i.extrato_id
      join financeiro_lancamentos_v2 l on l.id = i.lancamento_id
     where i.cliente_id = p_cliente and i.desfeito_em is null and e.valor < 0 and e.cancelado_em is null
       and l.cliente_id = p_cliente and l.favorecido_id is not null
       and e.data_movimento >= (current_date - make_interval(months => greatest(coalesce(p_meses, 18), 1)))::date),
  tot as (select f, count(*) n from pag group by f),
  por as (select f, forma, count(*) n,
                 mode() within group (order by trim(regexp_replace(regexp_replace(upper(d), '[0-9/.:\-]+', ' ', 'g'), '\s+', ' ', 'g'))) ex
            from pag where forma is not null group by f, forma),
  melhor as (select distinct on (p.f) p.f, p.forma, p.n, t.n tot, p.ex from por p join tot t on t.f = p.f order by p.f, p.n desc, p.forma),
  doc as (select f, public._fn_doc_do_historico_pix(d) doc, count(*) n from pag
           where forma = 'PIX' and public._fn_doc_do_historico_pix(d) is not null group by 1, 2),
  doc1 as (select distinct on (f) f, doc from doc order by f, n desc)
  select m.f, fo.nome, m.tot::int, round(100.0 * m.n / m.tot, 1), m.forma, public._fn_forma_no_cadastro(m.forma),
         array_to_string((regexp_split_to_array(m.ex, ' '))[1:2], ' '),
         case when m.forma = 'PIX' and nullif(btrim(coalesce(fo.pix_chave, '')), '') is null
                   and d1.doc is not null and d1.doc = regexp_replace(coalesce(fo.cpf_cnpj, ''), '\D', '', 'g') then fo.cpf_cnpj end,
         case when m.forma = 'PIX' and nullif(btrim(coalesce(fo.pix_chave, '')), '') is null
                   and d1.doc is not null and d1.doc = regexp_replace(coalesce(fo.cpf_cnpj, ''), '\D', '', 'g')
              then case when length(d1.doc) = 11 then 'CPF' else 'CNPJ' end end,
         (select count(*)::int from financeiro_lancamentos_v2 l
           where l.cliente_id = p_cliente and l.favorecido_id = m.f and coalesce(l.cancelado, false) = false
             and public._fn_pronto_para_pagar_se_aplica(l.tipo_operacao, l.status_transacao, (l.sem_movimentacao_caixa is true))
             and nullif(btrim(coalesce(l.forma_pagamento, '')), '') is null),
         nullif(btrim(coalesce(fo.tipo_recebimento, '')), ''), nullif(btrim(coalesce(fo.pix_chave, '')), '')
    from melhor m
    join financeiro_fornecedores fo on fo.id = m.f and fo.cliente_id = p_cliente
    left join doc1 d1 on d1.f = m.f
   where m.tot >= 2 and m.n::numeric / m.tot >= 0.8
$fn$;
revoke all on function public._fn_forma_pelo_extrato_sugestoes(uuid, integer) from public, anon, authenticated;

create or replace function public.fn_forma_pelo_extrato_previa(p_cliente uuid, p_meses integer default 18)
returns table(fornecedor_id uuid, nome text, pagamentos integer, iguais_pct numeric, forma text, forma_cadastro text, exemplo text,
              chave_sugerida text, tipo_chave text, abertos_sem_forma integer, hoje_forma text, hoje_chave text)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if p_cliente is null or not public.tenant_ok(p_cliente) then
    raise exception 'Forma pelo extrato: sem acesso a este cliente.' using errcode = '42501';
  end if;
  return query select s.* from public._fn_forma_pelo_extrato_sugestoes(p_cliente, p_meses) s
                order by s.abertos_sem_forma desc, s.nome;
end $fn$;

-- 5) gravar em lote (p_simular = a prévia do que muda; nada fica)
create or replace function public.fn_forma_pelo_extrato_gravar(p_cliente uuid, p_fornecedores uuid[], p_meses integer default 18,
                                                              p_simular boolean default true)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $fn$
declare
  s record; v_campos jsonb; v_alt jsonb; v_alt_id uuid; v_ids uuid[]; v_recusados int; l record; v_out jsonb := '[]'::jsonb;
  v_total int := 0; v_ret jsonb; v_fora uuid[];
begin
  if p_cliente is null or not public.tenant_ok(p_cliente) then
    raise exception 'Forma pelo extrato: sem acesso a este cliente.' using errcode = '42501';
  end if;
  if p_fornecedores is null or cardinality(p_fornecedores) = 0 then
    raise exception 'Marque ao menos um fornecedor. Nada foi gravado.' using errcode = 'P0001';
  end if;
  if cardinality(p_fornecedores) > 1000 then
    raise exception 'No máximo 1.000 fornecedores por vez. Nada foi gravado.' using errcode = '22023';
  end if;
  select array_agg(x) into v_fora from unnest(p_fornecedores) x
   where x not in (select fornecedor_id from public._fn_forma_pelo_extrato_sugestoes(p_cliente, p_meses));
  if v_fora is not null then
    raise exception 'Fornecedor sem forma clara pelo extrato (%). Nada foi gravado.', cardinality(v_fora) using errcode = '22023';
  end if;
  begin
    for s in select * from public._fn_forma_pelo_extrato_sugestoes(p_cliente, p_meses) x where x.fornecedor_id = any(p_fornecedores) order by x.nome loop
      -- o cadastro: a forma; a chave só onde não há chave e o extrato mostrou o documento do cadastro
      v_campos := jsonb_build_object('tipo_recebimento', s.forma_cadastro);
      if s.chave_sugerida is not null then
        v_campos := v_campos || jsonb_build_object('pix_tipo_chave', s.tipo_chave, 'pix_chave', s.chave_sugerida);
      end if;
      v_alt := public.fn_fornecedor_atualizar_campos(s.fornecedor_id, v_campos, 'extrato', 'forma pelo extrato', false);
      v_alt_id := nullif(v_alt->>'alteracao_id', '')::uuid;
      -- os lançamentos a pagar desse fornecedor com a forma em branco
      v_ids := '{}'; v_recusados := 0;
      for l in select x.id from financeiro_lancamentos_v2 x
                where x.cliente_id = p_cliente and x.favorecido_id = s.fornecedor_id and coalesce(x.cancelado, false) = false
                  and public._fn_pronto_para_pagar_se_aplica(x.tipo_operacao, x.status_transacao, (x.sem_movimentacao_caixa is true))
                  and nullif(btrim(coalesce(x.forma_pagamento, '')), '') is null loop
        begin
          update financeiro_lancamentos_v2 set forma_pagamento = s.forma
           where id = l.id and nullif(btrim(coalesce(forma_pagamento, '')), '') is null;
          v_ids := v_ids || l.id;
        exception when others then
          v_recusados := v_recusados + 1;
        end;
      end loop;
      insert into public.fornecedor_forma_extrato_ops (cliente_id, fornecedor_id, forma, chave, pagamentos, iguais_pct, alteracao_id,
                                                       lancamentos, recusados)
      values (p_cliente, s.fornecedor_id, s.forma, s.chave_sugerida, s.pagamentos, s.iguais_pct, v_alt_id, v_ids, v_recusados);
      v_total := v_total + cardinality(v_ids);
      v_out := v_out || jsonb_build_object('fornecedor_id', s.fornecedor_id, 'nome', s.nome, 'forma', s.forma, 'chave', s.chave_sugerida,
                                           'cadastro', coalesce(v_alt->'campos', '{}'::jsonb), 'lancamentos', cardinality(v_ids),
                                           'recusados', v_recusados);
    end loop;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'fornecedores', v_out, 'lancamentos', v_total);
    if p_simular then raise exception using errcode = 'FFSIM', message = v_ret::text; end if;
  exception when sqlstate 'FFSIM' then
    return sqlerrm::jsonb;
  end;
  return v_ret;
end $fn$;

-- 6) desfazer um fornecedor
create or replace function public.fn_forma_pelo_extrato_desfazer(p_op uuid, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $fn$
declare o record; v_cad jsonb := null; v_voltaram uuid[] := '{}'; v_mantidos uuid[] := '{}'; l record; v_ret jsonb;
begin
  select * into o from public.fornecedor_forma_extrato_ops where id = p_op;
  if o.id is null then raise exception 'Gravação não encontrada. Nada foi desfeito.' using errcode = 'P0001'; end if;
  if not public.tenant_ok(o.cliente_id) then raise exception 'Forma pelo extrato: sem acesso a este cliente.' using errcode = '42501'; end if;
  if o.desfeita_em is not null then raise exception 'Esta gravação já foi desfeita. Nada foi desfeito.' using errcode = 'P0001'; end if;
  if not p_simular and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escreva por que desfaz. Nada foi desfeito.' using errcode = 'P0001';
  end if;
  begin
    if o.alteracao_id is not null then
      v_cad := public.fn_fornecedor_atualizar_campos_desfazer(o.alteracao_id, coalesce(nullif(btrim(p_motivo), ''), 'simulação'), false);
    end if;
    for l in select x.id, x.forma_pagamento, x.tipo_operacao, x.status_transacao, x.sem_movimentacao_caixa, x.cancelado
               from financeiro_lancamentos_v2 x where x.id = any(o.lancamentos) loop
      if l.forma_pagamento is not distinct from o.forma and coalesce(l.cancelado, false) = false
         and public._fn_pronto_para_pagar_se_aplica(l.tipo_operacao, l.status_transacao, (l.sem_movimentacao_caixa is true)) then
        begin
          update financeiro_lancamentos_v2 set forma_pagamento = null where id = l.id and forma_pagamento = o.forma;
          v_voltaram := v_voltaram || l.id;
        exception when others then
          v_mantidos := v_mantidos || l.id;
        end;
      else
        v_mantidos := v_mantidos || l.id;
      end if;
    end loop;
    update public.fornecedor_forma_extrato_ops
       set desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = coalesce(nullif(btrim(p_motivo), ''), 'simulação'),
           mantidos = v_mantidos
     where id = p_op;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'cadastro', coalesce(v_cad, '{}'::jsonb),
                                'lancamentos_voltaram', cardinality(v_voltaram), 'mantidos', to_jsonb(v_mantidos));
    if p_simular then raise exception using errcode = 'FFSIM', message = v_ret::text; end if;
  exception when sqlstate 'FFSIM' then
    return sqlerrm::jsonb;
  end;
  return v_ret;
end $fn$;

revoke all on function public.fn_forma_pelo_extrato_previa(uuid, integer) from public, anon;
revoke all on function public.fn_forma_pelo_extrato_gravar(uuid, uuid[], integer, boolean) from public, anon;
revoke all on function public.fn_forma_pelo_extrato_desfazer(uuid, text, boolean) from public, anon;
grant execute on function public.fn_forma_pelo_extrato_previa(uuid, integer) to authenticated, service_role;
grant execute on function public.fn_forma_pelo_extrato_gravar(uuid, uuid[], integer, boolean) to authenticated, service_role;
grant execute on function public.fn_forma_pelo_extrato_desfazer(uuid, text, boolean) to authenticated, service_role;
