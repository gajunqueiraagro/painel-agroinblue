-- FOLHA-01 · a REGRA DO RECIBO (Gabriel 18/11/2026 15:14 e 15:36): o documento da folha que chega na Caixa é processado sozinho.
-- Uma chamada por documento (o PDF do contador), tudo ou nada:
--   casa cada recibo com o lançamento do mês/tipo pelo NOME (o layout do NJ não traz CPF; tokens sem acento/caixa, em qualquer ordem
--   = 'exato'; parcial = 'confira o nome', só com candidato ÚNICO); o VALOR DO RECIBO SUBSTITUI o previsto (o status não muda); a página
--   do funcionário (PDF já dividido e enviado pela Caixa) vira documento do lançamento; trilha = audit_log com via 'folha-recibo:<md5>'.
--   SÓ O QUE NÃO CONFERE vira pendência (devolvida, nada trava o resto): recibo sem lançamento (criar só com "criar": true, decidido
--   pelo operador), nome ambíguo, lançamento do mês sem recibo. A SOMA dos recibos tem de ser o total do documento.
-- RECUSA (nada grava): sem acesso à folha; soma ≠ total; o mesmo md5 já aplicado; lançamento pago/conciliado/cancelado/mês fechado.
-- DESFAZER: fn_folha_recibos_desfazer(cliente, md5, motivo, simular) — volta os valores de antes (da audit_log daquela via), cancela os
--   anexos e os lançamentos criados; recusa se algum foi pago ou conciliado depois. O fornecedor criado fica (cadastro não se apaga).
-- NÃO cria tabela. Depende da 118370 (folha_ok). Chamada pela tela: todo UPDATE com WHERE (pg_safeupdate).

set local lock_timeout = '2s';

do $pre$ begin
  if to_regprocedure('public.folha_ok(uuid)') is null then raise exception 'FOLHA-01 recibos: aplique a 118370 antes.'; end if;
  if to_regprocedure('public.fn_folha_recibos_aplicar(uuid,uuid,jsonb,jsonb,boolean)') is not null then raise exception 'FOLHA-01 recibos: já aplicado.'; end if;
end $pre$;

-- os tokens de um nome: sem acento, sem caixa, sem "da/de/do/dos/das/e", ordenados
create function public._fn_folha_tokens(p_nome text) returns text[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(t order by t), '{}') from unnest(string_to_array(regexp_replace(coalesce(public._fn_normalizar_texto(p_nome), ''), '[^a-z0-9 ]', '', 'g'), ' ')) t
   where t <> '' and t not in ('da', 'de', 'do', 'dos', 'das', 'e')
$$;

-- 'exato' (mesmos tokens) · 'parcial' (um contém o outro com 2+ em comum, ou só 1 token diferente com 5 letras iniciais iguais) · null
create function public._fn_folha_nome_casa(p_a text, p_b text) returns text
language plpgsql stable set search_path = public as $$
declare a text[] := _fn_folha_tokens(p_a); b text[] := _fn_folha_tokens(p_b); so_a text[]; so_b text[]; comuns int;
begin
  if cardinality(a) = 0 or cardinality(b) = 0 then return null; end if;
  if a = b then return 'exato'; end if;
  comuns := (select count(*) from unnest(a) x where x = any (b));
  so_a := array(select x from unnest(a) x where not x = any (b));
  so_b := array(select x from unnest(b) x where not x = any (a));
  if comuns >= 2 and (cardinality(so_a) = 0 or cardinality(so_b) = 0) then return 'parcial'; end if;
  if comuns >= 1 and cardinality(so_a) = 1 and cardinality(so_b) = 1 and length(so_a[1]) >= 5 and length(so_b[1]) >= 5
     and left(so_a[1], 5) = left(so_b[1], 5) then return 'parcial'; end if;
  return null;
end $$;

revoke all on function public._fn_folha_tokens(text) from public, anon, authenticated;
revoke all on function public._fn_folha_nome_casa(text, text) from public, anon, authenticated;

-- p_documento: {md5, nome, tipo ('13_1'|'13_2'), competencia 'AAAA-MM', total, empregador}
-- p_itens: [{nome, codigo, cei, paginas:[n], valor, arquivo:{url, nome, tamanho}, criar: bool}]
create function public.fn_folha_recibos_aplicar(p_cliente uuid, p_entrada uuid, p_documento jsonb, p_itens jsonb, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_md5 text := lower(p_documento->>'md5'); v_tipo text := p_documento->>'tipo'; v_comp text := p_documento->>'competencia';
  v_total numeric := round((p_documento->>'total')::numeric, 2); v_padrao text; v_ini date; v_soma numeric;
  i jsonb; v_k int := 0; v_cand uuid; v_n int; v_modo text; l public.financeiro_lancamentos_v2; m public.financeiro_lancamentos_v2;
  v_forn uuid; v_novo uuid; v_via text;
  v_auto jsonb := '[]'; v_pend jsonb := '[]'; v_casados uuid[] := '{}'; v_sem_recibo jsonb;
begin
  if p_cliente is null or not folha_ok(p_cliente) then raise exception 'Sem acesso à folha deste cliente.' using errcode = '42501'; end if;
  if p_simular is null or v_md5 !~ '^[0-9a-f]{32}$' or v_tipo not in ('13_1', '13_2') or coalesce(v_comp, '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     or v_total is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Recibos: pedido inválido.' using errcode = '22023';
  end if;
  if p_entrada is not null and not exists (select 1 from entrada_arquivos where id = p_entrada and cliente_id = p_cliente) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  v_via := 'folha-recibo:' || v_md5;
  if exists (select 1 from financeiro_lancamento_documentos d where d.cliente_id = p_cliente and not d.cancelado and d.observacao like v_via || '%') then
    raise exception 'Este documento do contador já foi aplicado (desfaça antes de aplicar de novo).' using errcode = 'P0001';
  end if;
  select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma from jsonb_array_elements(p_itens) x;
  if v_soma <> v_total then
    raise exception 'Os recibos somam % e o documento diz %: nada foi gravado.', v_soma, v_total using errcode = 'P0001';
  end if;
  v_ini := (v_comp || '-01')::date;
  v_padrao := case v_tipo when '13_1' then '13º Salário 1ª Parcela%' else '13º Salário 2ª Parcela%' end;

  -- 1. casar cada recibo (tudo lido antes de gravar)
  create temp table if not exists _rec (k int, item jsonb, lanc uuid, modo text, acao text) on commit drop;
  delete from _rec where true;
  for i in select * from jsonb_array_elements(p_itens) loop
    v_k := v_k + 1;
    select count(*), (array_agg(c.id))[1], min(c.modo) into v_n, v_cand, v_modo from (
      select l2.id, _fn_folha_nome_casa(i->>'nome', f.nome) modo
        from financeiro_lancamentos_v2 l2 join financeiro_fornecedores f on f.id = l2.favorecido_id
       where l2.cliente_id = p_cliente and not coalesce(l2.cancelado, false) and l2.descricao like v_padrao
         and l2.data_competencia >= v_ini and l2.data_competencia < (v_ini + interval '1 month')) c
     where c.modo is not null;
    if v_n = 1 then
      insert into _rec values (v_k, i, v_cand, v_modo, 'casar');
    elsif v_n > 1 then
      insert into _rec values (v_k, i, null, null, 'ambiguo');
    elsif coalesce((i->>'criar')::boolean, false) then
      insert into _rec values (v_k, i, null, null, 'criar');
    else
      insert into _rec values (v_k, i, null, null, 'sem_lancamento');
    end if;
  end loop;
  if exists (select lanc from _rec where lanc is not null group by lanc having count(*) > 1) then
    raise exception 'Dois recibos casaram com o mesmo lançamento: confira os nomes.' using errcode = 'P0001';
  end if;
  v_casados := array(select lanc from _rec where lanc is not null);

  -- 2. conferir os casados (estado do lançamento)
  for i in select to_jsonb(r) from _rec r where r.acao = 'casar' loop
    select * into l from financeiro_lancamentos_v2 where id = (i->>'lanc')::uuid for update;
    if l.status_transacao not in ('previsto', 'programado', 'agendado') and l.valor <> round((i->'item'->>'valor')::numeric, 2) then
      raise exception '%: o lançamento já está % com outro valor (% × recibo %): nada foi gravado.', i->'item'->>'nome', l.status_transacao, l.valor, i->'item'->>'valor' using errcode = 'P0001';
    end if;
    if _fin_lancamento_casado_com_extrato(l.id) and l.valor <> round((i->'item'->>'valor')::numeric, 2) then
      raise exception '%: o lançamento está conciliado com outro valor: nada foi gravado.', i->'item'->>'nome' using errcode = 'P0001';
    end if;
    if exists (select 1 from financeiro_fechamentos ff where ff.cliente_id = p_cliente and ff.status_fechamento = 'fechado' and ff.ano_mes = to_char(l.data_competencia, 'YYYY-MM')) then
      raise exception 'O mês % está fechado: nada foi gravado.', to_char(l.data_competencia, 'MM/YYYY') using errcode = 'P0001';
    end if;
    v_auto := v_auto || jsonb_build_object('pagina', i->'item'->'paginas', 'nome', i->'item'->>'nome', 'lancamento_id', l.id, 'antes', l.valor,
      'depois', round((i->'item'->>'valor')::numeric, 2), 'nome_confere', i->>'modo');
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('pagina', r.item->'paginas', 'nome', r.item->>'nome', 'valor', r.item->>'valor', 'pendencia', r.acao) order by r.k), '[]')
    into v_pend from _rec r where r.acao in ('ambiguo', 'sem_lancamento');
  select coalesce(jsonb_agg(jsonb_build_object('lancamento_id', l2.id, 'nome', f.nome, 'valor', l2.valor, 'pendencia', 'sem_recibo') order by f.nome), '[]')
    into v_sem_recibo
    from financeiro_lancamentos_v2 l2 join financeiro_fornecedores f on f.id = l2.favorecido_id
   where l2.cliente_id = p_cliente and not coalesce(l2.cancelado, false) and l2.descricao like v_padrao
     and l2.data_competencia >= v_ini and l2.data_competencia < (v_ini + interval '1 month') and not l2.id = any (v_casados);

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'automaticos', v_auto,
      'criar', (select coalesce(jsonb_agg(jsonb_build_object('nome', r.item->>'nome', 'valor', r.item->>'valor') order by r.k), '[]') from _rec r where r.acao = 'criar'),
      'pendencias', v_pend, 'sem_recibo', v_sem_recibo, 'soma', v_soma);
  end if;

  -- 3. gravar
  perform set_config('app.via', v_via, true);
  perform set_config('app.motivo', 'atualizado pelo recibo do contador · ' || coalesce(p_documento->>'nome', '') || ' · ' || to_char(now(), 'DD/MM/YYYY'), true);
  for i in select to_jsonb(r) from _rec r where r.acao in ('casar', 'criar') order by r.k loop
    if i->>'acao' = 'criar' then
      -- o molde: o casado mais comum do MESMO empregador (cei) neste documento; sem ele, o mais comum do documento
      m := null; v_forn := null;
      select l2.* into m from _rec r join financeiro_lancamentos_v2 l2 on l2.id = r.lanc
       where r.acao = 'casar'
       order by (r.item->>'cei' is not distinct from i->'item'->>'cei') desc,
                count(*) over (partition by l2.plano_conta_id, l2.fazenda_id, l2.conta_bancaria_id) desc, r.k
       limit 1;
      if m.id is null then raise exception 'Sem lançamento-molde para criar %.', i->'item'->>'nome' using errcode = 'P0001'; end if;
      select f.id into v_forn from financeiro_fornecedores f
       where f.cliente_id = p_cliente and f.ativo and _fn_folha_nome_casa(i->'item'->>'nome', f.nome) = 'exato' order by f.created_at limit 1;
      if v_forn is null then
        insert into financeiro_fornecedores (cliente_id, nome, ativo, tipo_pessoa) values (p_cliente, btrim(i->'item'->>'nome'), true, 'PF') returning id into v_forn;
      end if;
      insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
             status_transacao, data_competencia, data_vencimento, forma_pagamento, cenario, origem_lancamento, observacao, created_by, updated_by)
      values (p_cliente, m.fazenda_id, m.conta_bancaria_id, m.plano_conta_id, v_forn, m.descricao, round((i->'item'->>'valor')::numeric, 2), m.sinal, m.tipo_operacao,
             'previsto', m.data_competencia, m.data_vencimento, m.forma_pagamento, m.cenario, 'manual',
             'criado pelo recibo do contador (' || coalesce(p_documento->>'nome', '') || ')', auth.uid(), auth.uid())
      returning id into v_novo;
      update _rec set lanc = v_novo where k = (i->>'k')::int;
      i := jsonb_set(i, '{lanc}', to_jsonb(v_novo));
    else
      update financeiro_lancamentos_v2 set valor = round((i->'item'->>'valor')::numeric, 2), updated_by = auth.uid()
       where id = (i->>'lanc')::uuid and valor <> round((i->'item'->>'valor')::numeric, 2);
    end if;
    if nullif(i->'item'->'arquivo'->>'url', '') is not null then
      insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, tipo, url, tamanho_bytes, uploaded_por, especie, valor_documento,
             emitente_nome, observacao, participacao_pct)
      values (p_cliente, (i->>'lanc')::uuid, coalesce(nullif(i->'item'->'arquivo'->>'nome', ''), 'recibo.pdf'), 'application/pdf', i->'item'->'arquivo'->>'url',
             nullif(i->'item'->'arquivo'->>'tamanho', '')::bigint, auth.uid(), 'recibo', round((i->'item'->>'valor')::numeric, 2),
             nullif(p_documento->>'empregador', ''), v_via || ' · pág. ' || coalesce(i->'item'->>'paginas', '?'), 100);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'simulado', false, 'automaticos', v_auto,
    'criados', (select coalesce(jsonb_agg(jsonb_build_object('nome', r.item->>'nome', 'lancamento_id', r.lanc)), '[]') from _rec r where r.acao = 'criar'),
    'pendencias', v_pend, 'sem_recibo', v_sem_recibo, 'soma', v_soma);
end $$;

create function public.fn_folha_recibos_desfazer(p_cliente uuid, p_md5 text, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_via text := 'folha-recibo:' || lower(coalesce(p_md5, '')); r record; v_valores int := 0; v_criados int := 0; v_docs int := 0;
begin
  if p_cliente is null or not folha_ok(p_cliente) then raise exception 'Sem acesso à folha deste cliente.' using errcode = '42501'; end if;
  if p_simular is null or nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.' using errcode = 'P0001'; end if;
  if not exists (select 1 from audit_log a where a.cliente_id = p_cliente and a.via = v_via)
     and not exists (select 1 from financeiro_lancamento_documentos d where d.cliente_id = p_cliente and not d.cancelado and d.observacao like v_via || '%') then
    raise exception 'Nada aplicado por este documento.' using errcode = 'P0001';
  end if;
  -- os tocados: não podem ter sido pagos/conciliados depois
  for r in select distinct l.id, l.status_transacao from audit_log a join financeiro_lancamentos_v2 l on l.id = a.registro_id
            where a.cliente_id = p_cliente and a.via = v_via and a.tabela_origem = 'financeiro_lancamentos_v2' loop
    if r.status_transacao not in ('previsto', 'programado', 'agendado') or _fin_lancamento_casado_com_extrato(r.id) then
      raise exception 'Um lançamento deste documento já foi pago ou conciliado: desfaça isso antes.' using errcode = 'P0001';
    end if;
  end loop;
  select count(*) filter (where a.acao <> 'criou'), count(*) filter (where a.acao = 'criou') into v_valores, v_criados
    from (select distinct on (a.registro_id) a.registro_id, a.acao from audit_log a
           where a.cliente_id = p_cliente and a.via = v_via and a.tabela_origem = 'financeiro_lancamentos_v2' order by a.registro_id, a.created_at) a;
  select count(*) into v_docs from financeiro_lancamento_documentos d where d.cliente_id = p_cliente and not d.cancelado and d.observacao like v_via || '%';
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'valores', v_valores, 'criados', v_criados, 'documentos', v_docs); end if;

  perform set_config('app.via', v_via || ':desfazer', true);
  perform set_config('app.motivo', btrim(p_motivo), true);
  update financeiro_lancamento_documentos set cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
   where cliente_id = p_cliente and not cancelado and observacao like v_via || '%';
  -- o valor de ANTES = o dados_anteriores da 1ª edição desta via
  for r in select distinct on (a.registro_id) a.registro_id, a.acao, (a.dados_anteriores->>'valor')::numeric valor_antes from audit_log a
            where a.cliente_id = p_cliente and a.via = v_via and a.tabela_origem = 'financeiro_lancamentos_v2' order by a.registro_id, a.created_at loop
    if r.acao = 'criou' then
      update financeiro_lancamentos_v2 set cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
       where id = r.registro_id and not coalesce(cancelado, false);
    elsif r.valor_antes is not null then
      update financeiro_lancamentos_v2 set valor = r.valor_antes, updated_by = auth.uid() where id = r.registro_id;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'simulado', false, 'valores', v_valores, 'criados', v_criados, 'documentos', v_docs);
end $$;

revoke all on function public.fn_folha_recibos_aplicar(uuid, uuid, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.fn_folha_recibos_desfazer(uuid, text, text, boolean) from public, anon;
grant execute on function public.fn_folha_recibos_aplicar(uuid, uuid, jsonb, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_folha_recibos_desfazer(uuid, text, text, boolean) to authenticated, service_role;
