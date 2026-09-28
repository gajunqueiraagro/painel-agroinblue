-- 20261027171000_oc_criar_do_legado_01.sql
-- OC-CRIAR-DO-LEGADO-01 — CRIAR OC DE VENDA A PARTIR DE UM LANCAMENTO LEGADO (decisoes do Gabriel, 28/09/2026; mock
-- `docs/mocks/oc_criar_do_legado_mock_v1.html`, md5 70d4c89a). So' venda; abate e compra depois, com a mesma tela.
--
-- PRINCIPIO: desenrolar rapido e sem erro primario. Preenche sozinho o derivavel, pergunta so' o que nao tem de onde tirar,
-- bloqueia so' o erro primario. Tudo continua editavel na OC depois (permuta, desconto, preco: 01c).
--
-- PECAS (nenhuma funcao existente muda; a cadeia so' LIGA o que ja existe):
--   1. `_oc_legado_motivo_recebimento(lancamento)` — NULL = pode ser recebimento da OC nova. A MESMA regra na lista de sugestoes
--      e na gravacao: entrada, com caixa, fora do modal antigo (`origem_lancamento` 'movimentacao_rebanho'), conta de venda de gado
--      1110-1140 (1150 boitel fora, D3), nao cancelado, sem parte viva de OC.
--   2. `oc_criar_do_legado_sugestoes(recebimentos[])` (INVOKER, so' leitura, RLS de quem chama): os recebimentos escolhidos, as
--      parcelas irmas para "Somar outro recebimento" (mesmo cliente, fazenda e favorecido, elegiveis) e as saidas de gado
--      candidatas — mesma fazenda, venda, realizada, ativa, sem OC, sem financeiro PROGRAMADO do modal antigo, de 60 dias ANTES a
--      120 dias DEPOIS do primeiro pagamento (D4). O pre-marcado (combinacao unica que fecha as cabecas da descricao) e' do front.
--   3. `oc_criar_do_legado(cliente, dados, criterio, valor_outro, recebimentos[], saidas, simular)` (SECDEF), UMA transacao, na
--      ordem que as guardas das funcoes existentes impoem:
--        oc_salvar_rascunho (cria, venda, programada) -> oc_salvar_lotes (um lote por saida, criterio 'total'; sai do rascunho)
--        -> oc_adotar_movimentacao (cada saida) -> modelo 'conta_corrente' + evento definir_modelo_financeiro (D2, o mesmo UPDATE
--        da migration de dado do 01b) -> oc_sincronizar_entregas (receita no mes de cada saida, "Venda NNN SIGLA")
--        -> oc_vincular_lancamento, ramo recebimento (Adiantamento de Clientes, hash preservado) -> oc_confirmar (fechada)
--        -> oc_encerrar_entrega (quantidade negociada = adotada, D5) -> evento criar_do_legado.
--      ERROS PRIMARIOS TODOS DE UMA VEZ (nenhum grava): sem comprador, sem fazenda, nenhuma saida, nenhum recebimento, saida de
--      outra fazenda, cabecas zeradas, recebimento que nao pode entrar (motivo da regra 1), recebimentos de fazendas ou
--      favorecidos diferentes entre si, criterio 'outro' sem valor, total da venda zero.
--      VALOR (1.3): 'recebimentos' (padrao, a OC nasce com saldo zero) = soma dos recebimentos; 'saidas' = o valor de cada saida
--      do zootecnico (a diferenca vira saldo da OC); 'outro' = total digitado. Rateio proporcional ao valor de cada saida (pelas
--      cabecas quando nenhuma tem valor), EM CENTAVOS, com o resto no ULTIMO lote. Lote por criterio 'total'; R$/kg derivado.
--      PESO (D1): vem da saida; a guarda do `oc_salvar_lotes` (lote sem peso nao salva) fica — 0 de 281 saidas legadas sem peso.
--      SIMULACAO (`p_simular`): percorre a cadeia inteira e a desfaz (SQLSTATE 'OCSIM', subtransacao do bloco), devolvendo a previa
--      em conta corrente (`oc_conta_corrente`) e os lotes; uma recusa de funcao chamada vira pendencia, sem gravar nada.
--   EXECUTE so' authenticated e service_role (a interna tambem, porque as sugestoes a chamam com a RLS de quem pede).

create or replace function public._oc_legado_motivo_recebimento(p_lancamento_id uuid)
returns text
language sql
stable
set search_path = public
as $fn$
  select case
    when l.id is null or l.cancelado is true then 'Lancamento cancelado ou inexistente'
    when l.tipo_operacao is distinct from '1-Entradas' then 'Recebimento tem de ser uma entrada'
    when coalesce(l.sem_movimentacao_caixa, false) then 'Lancamento sem caixa nao e recebimento'
    when l.origem_lancamento = 'movimentacao_rebanho' then 'Lancamento do modal antigo (gerado pelo zootecnico)'
    when pc.id is null or pc.ordem_exibicao not between 1110 and 1140 or pc.tipo_operacao <> '1-Entradas'
      then 'Conta fora das vendas de gado (1110 a 1140); boitel fica de fora'
    when exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and p.cancelada = false)
      then 'Lancamento ja esta ligado a uma operacao'
  end
  from (select p_lancamento_id as id) x
  left join public.financeiro_lancamentos_v2 l on l.id = x.id
  left join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
$fn$;
revoke all on function public._oc_legado_motivo_recebimento(uuid) from public, anon;
grant execute on function public._oc_legado_motivo_recebimento(uuid) to authenticated, service_role;

create or replace function public.oc_criar_do_legado_sugestoes(p_recebimentos uuid[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $fn$
declare
  v_primeiro record; v_dt date; v_rec jsonb; v_irmas jsonb; v_saidas jsonb;
begin
  select l.*, coalesce(l.data_pagamento, l.data_competencia) dt into v_primeiro
    from public.financeiro_lancamentos_v2 l where l.id = p_recebimentos[1];
  if v_primeiro.id is null then return jsonb_build_object('recebimentos', '[]'::jsonb, 'irmas', '[]'::jsonb, 'saidas', '[]'::jsonb); end if;
  select min(coalesce(l.data_pagamento, l.data_competencia)) into v_dt from public.financeiro_lancamentos_v2 l where l.id = any (p_recebimentos);

  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'data', coalesce(l.data_pagamento, l.data_competencia), 'valor', l.valor,
           'descricao', l.descricao, 'favorecido_id', l.favorecido_id, 'favorecido', f.nome, 'fazenda_id', l.fazenda_id,
           'fazenda', fz.nome, 'conta', l.subcentro, 'motivo', public._oc_legado_motivo_recebimento(l.id))
           order by coalesce(l.data_pagamento, l.data_competencia), l.id), '[]'::jsonb)
    into v_rec
    from public.financeiro_lancamentos_v2 l
    left join public.financeiro_fornecedores f on f.id = l.favorecido_id
    left join public.fazendas fz on fz.id = l.fazenda_id
   where l.id = any (p_recebimentos);

  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'data', coalesce(l.data_pagamento, l.data_competencia), 'valor', l.valor,
           'descricao', l.descricao, 'conta', l.subcentro)
           order by coalesce(l.data_pagamento, l.data_competencia), l.id), '[]'::jsonb)
    into v_irmas
    from public.financeiro_lancamentos_v2 l
   where l.cliente_id = v_primeiro.cliente_id and l.fazenda_id is not distinct from v_primeiro.fazenda_id
     and l.favorecido_id is not distinct from v_primeiro.favorecido_id and l.id <> all (p_recebimentos)
     and coalesce(l.data_pagamento, l.data_competencia) between v_primeiro.dt - 365 and v_primeiro.dt + 365
     and public._oc_legado_motivo_recebimento(l.id) is null;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'data', s.data, 'categoria', s.categoria, 'quantidade', s.quantidade,
           'peso_medio_kg', s.peso_medio_kg, 'valor', s.valor_total, 'origem_registro', s.origem_registro,
           'fornecedor_id', s.fornecedor_id) order by s.data, s.id), '[]'::jsonb)
    into v_saidas
    from public.lancamentos s
   where s.cliente_id = v_primeiro.cliente_id and s.fazenda_id is not distinct from v_primeiro.fazenda_id
     and s.tipo = 'venda' and s.cancelado is not true and s.cenario = 'realizado' and s.status_operacional = 'realizado'
     and s.data between v_dt - 60 and v_dt + 120
     and not exists (select 1 from public.zoo_operacao_movimentacoes m where m.movimentacao_id = s.id)
     and not exists (select 1 from public.financeiro_lancamentos_v2 f
                      where f.movimentacao_rebanho_id = s.id and f.origem_lancamento = 'movimentacao_rebanho'
                        and coalesce(f.cancelado, false) = false and f.status_transacao is distinct from 'realizado');

  return jsonb_build_object('recebimentos', v_rec, 'irmas', v_irmas, 'saidas', v_saidas,
    'janela', jsonb_build_object('de', v_dt - 60, 'ate', v_dt + 120));
end;
$fn$;
revoke all on function public.oc_criar_do_legado_sugestoes(uuid[]) from public, anon;
grant execute on function public.oc_criar_do_legado_sugestoes(uuid[]) to authenticated, service_role;

create or replace function public.oc_criar_do_legado(
  p_cliente_id uuid, p_dados jsonb, p_criterio_valor text, p_valor_outro numeric,
  p_recebimentos uuid[], p_saidas jsonb, p_simular boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_criterio text := coalesce(nullif(p_criterio_valor, ''), 'recebimentos');
  v_fazenda uuid := nullif(p_dados->>'fazenda_id', '')::uuid;
  v_contraparte uuid := nullif(p_dados->>'contraparte_id', '')::uuid;
  v_pend text[] := '{}'; v_ids uuid[]; v_n int; v_total numeric; v_soma_w numeric; v_acum numeric := 0;
  v_lotes jsonb := '[]'::jsonb; v_op uuid; v_ver int; v_x jsonb; r record; v_i int := 0; v_valor numeric;
  v_data date; v_motivo text := 'Criada a partir de lancamento legado (OC-CRIAR-DO-LEGADO-01)'; v_ret jsonb; v_lote uuid;
  v_rec uuid;
begin
  if not (public.is_admin_agroinblue(v_actor) or p_cliente_id in (select public.get_user_cliente_ids(v_actor))) then
    raise exception 'Acesso negado ao cliente %', p_cliente_id using errcode = '42501'; end if;

  -- ── erros primarios, todos de uma vez ──
  if v_contraparte is null then v_pend := v_pend || 'Informe o comprador'::text; end if;
  if v_fazenda is null then v_pend := v_pend || 'Informe a fazenda'::text; end if;
  if coalesce(array_length(p_recebimentos, 1), 0) = 0 then v_pend := v_pend || 'Escolha ao menos um recebimento'::text; end if;
  if coalesce(jsonb_array_length(p_saidas), 0) = 0 then v_pend := v_pend || 'Marque ao menos uma saida de gado'::text; end if;
  if v_contraparte is not null and not exists (select 1 from public.financeiro_fornecedores
                                                 where id = v_contraparte and cliente_id = p_cliente_id) then
    v_pend := v_pend || 'Comprador fora do cadastro deste cliente'::text; end if;
  if v_criterio not in ('recebimentos', 'saidas', 'outro') then v_pend := v_pend || format('Criterio de valor invalido: %s', v_criterio); end if;
  if v_criterio = 'outro' and coalesce(p_valor_outro, 0) <= 0 then v_pend := v_pend || 'Informe o total da venda'::text; end if;

  select array_agg(distinct x) into v_ids from unnest(coalesce(p_recebimentos, '{}')) x;
  if coalesce(array_length(v_ids, 1), 0) <> coalesce(array_length(p_recebimentos, 1), 0) then
    v_pend := v_pend || 'Recebimento repetido'::text; end if;
  for r in select l.id, l.cliente_id, l.fazenda_id, l.favorecido_id, public._oc_legado_motivo_recebimento(l.id) motivo, x.id pedido
             from unnest(coalesce(p_recebimentos, '{}')) x(id) left join public.financeiro_lancamentos_v2 l on l.id = x.id loop
    if r.id is null or r.cliente_id <> p_cliente_id then v_pend := v_pend || format('Recebimento %s nao encontrado neste cliente', left(r.pedido::text, 8));
    elsif r.motivo is not null then v_pend := v_pend || format('Recebimento %s: %s', left(r.id::text, 8), r.motivo);
    elsif v_fazenda is not null and r.fazenda_id is distinct from v_fazenda then
      v_pend := v_pend || format('Recebimento %s e de outra fazenda', left(r.id::text, 8)); end if;
  end loop;
  if (select count(distinct favorecido_id) from public.financeiro_lancamentos_v2 where id = any (p_recebimentos)) > 1 then
    v_pend := v_pend || 'Os recebimentos tem favorecidos diferentes; uma OC por comprador'::text; end if;

  if (select count(*) from (select distinct value->>'lancamento_id' from jsonb_array_elements(coalesce(p_saidas, '[]'::jsonb))) d)
     <> coalesce(jsonb_array_length(p_saidas), 0) then v_pend := v_pend || 'Saida repetida'::text; end if;
  for r in select s.id, s.cliente_id, s.fazenda_id, s.quantidade, s.cancelado, x.value->>'lancamento_id' pedido
             from jsonb_array_elements(coalesce(p_saidas, '[]'::jsonb)) x
             left join public.lancamentos s on s.id = nullif(x.value->>'lancamento_id', '')::uuid loop
    if r.id is null or r.cliente_id <> p_cliente_id or r.cancelado is true then
      v_pend := v_pend || format('Saida %s nao encontrada neste cliente', left(coalesce(r.pedido, '?'), 8));
    else
      if v_fazenda is not null and r.fazenda_id is distinct from v_fazenda then
        v_pend := v_pend || format('Saida %s e de outra fazenda', left(r.id::text, 8)); end if;
      if coalesce(r.quantidade, 0) <= 0 then v_pend := v_pend || format('Saida %s sem cabecas', left(r.id::text, 8)); end if;
    end if;
  end loop;

  -- ── valor de cada lote (1.3): centavos, resto no ultimo ──
  if coalesce(array_length(v_pend, 1), 0) = 0 then
    select count(*), sum(coalesce(s.valor_total, 0)), min(s.data) into v_n, v_soma_w, v_data
      from jsonb_array_elements(p_saidas) x join public.lancamentos s on s.id = (x.value->>'lancamento_id')::uuid;
    v_total := case v_criterio
      when 'recebimentos' then (select sum(valor) from public.financeiro_lancamentos_v2 where id = any (p_recebimentos))
      when 'outro' then round(p_valor_outro, 2)
      else (select sum(round(coalesce(s.valor_total, 0), 2)) from jsonb_array_elements(p_saidas) x
              join public.lancamentos s on s.id = (x.value->>'lancamento_id')::uuid) end;
    if coalesce(v_total, 0) <= 0 then v_pend := v_pend || 'O total da venda deu zero'::text; end if;
  end if;
  if coalesce(array_length(v_pend, 1), 0) > 0 then
    return jsonb_build_object('ok', false, 'simulado', coalesce(p_simular, false), 'pendencias', to_jsonb(v_pend));
  end if;

  for r in select s.*, nullif(x.value->>'peso_medio_kg', '')::numeric peso_informado
             from jsonb_array_elements(p_saidas) x join public.lancamentos s on s.id = (x.value->>'lancamento_id')::uuid
            order by s.data, s.id loop
    v_i := v_i + 1;
    v_valor := case
      when v_criterio = 'saidas' then round(coalesce(r.valor_total, 0), 2)
      when v_i = v_n then v_total - v_acum
      when coalesce(v_soma_w, 0) > 0 then round(v_total * coalesce(r.valor_total, 0) / v_soma_w, 2)
      else round(v_total * r.quantidade / (select sum(s2.quantidade) from jsonb_array_elements(p_saidas) x2
                                             join public.lancamentos s2 on s2.id = (x2.value->>'lancamento_id')::uuid), 2) end;
    v_acum := v_acum + v_valor;
    v_lotes := v_lotes || jsonb_build_object('ordem', v_i, 'categoria_negociada', r.categoria, 'qtd_negociada', r.quantidade,
      'peso_medio_negociado_kg', coalesce(r.peso_informado, r.peso_medio_kg), 'criterio_valor', 'total', 'valor_informado', v_valor,
      'lancamento_id', r.id, 'data', r.data);
  end loop;

  begin
    -- ── 1. a OC (rascunho de venda) ──
    v_x := public.oc_salvar_rascunho(null, p_cliente_id, null, jsonb_build_object(
      'tipo_operacao', 'venda', 'fazenda_id', v_fazenda, 'contraparte_id', v_contraparte,
      'data_operacao', coalesce(nullif(p_dados->>'data_operacao', '')::date, v_data),
      'observacoes', coalesce(nullif(p_dados->>'observacoes', ''), 'Criada a partir de lancamento legado')));
    v_op := (v_x->>'operacao_id')::uuid;
    -- ── 2. lotes (criterio 'total'; sai do rascunho) ──
    select versao into v_ver from public.zoo_operacoes_comerciais where id = v_op;
    perform public.oc_salvar_lotes(v_op, p_cliente_id, v_ver,
      (select jsonb_agg(l - 'lancamento_id' - 'data') from jsonb_array_elements(v_lotes) l));
    -- ── 3. adotar cada saida no seu lote ──
    for r in select (l->>'ordem')::int ordem, (l->>'lancamento_id')::uuid lanc from jsonb_array_elements(v_lotes) l loop
      select id into v_lote from public.zoo_operacao_lotes where operacao_id = v_op and ordem = r.ordem;
      select versao into v_ver from public.zoo_operacoes_comerciais where id = v_op;
      perform public.oc_adotar_movimentacao(v_op, p_cliente_id, v_lote, r.lanc, v_ver);
    end loop;
    -- ── 4. modelo conta corrente (D2) ──
    select versao into v_ver from public.zoo_operacoes_comerciais where id = v_op;
    update public.zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente', versao = versao + 1, updated_at = now(),
           updated_by = v_actor where id = v_op;
    insert into public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
    values (p_cliente_id, v_op, 'definir_modelo_financeiro', jsonb_build_object('modelo_financeiro', 'titulo'),
            jsonb_build_object('modelo_financeiro', 'conta_corrente'),
            jsonb_build_object('motivo', v_motivo, 'versao_anterior', v_ver, 'versao_nova', v_ver + 1), v_actor, 'rpc');
    -- ── 5. entregas (receita no mes de cada saida) ──
    perform public.oc_sincronizar_entregas(v_op, v_ver + 1, false);
    -- ── 6. recebimentos (Adiantamento de Clientes, hash preservado) ──
    foreach v_rec in array p_recebimentos loop
      select versao into v_ver from public.zoo_operacoes_comerciais where id = v_op;
      v_x := public.oc_vincular_lancamento(v_op, v_ver, v_rec, null, v_motivo);
      if (v_x->>'ok')::boolean is not true then
        raise exception 'Recebimento %: %', left(v_rec::text, 8), coalesce(v_x->>'erro', v_x->>'mensagem', v_x::text) using errcode = 'P0001'; end if;
    end loop;
    -- ── 7. negociacao concluida e entrega encerrada (D5) ──
    select versao into v_ver from public.zoo_operacoes_comerciais where id = v_op;
    perform public.oc_confirmar(v_op, p_cliente_id, v_ver);
    select versao into v_ver from public.zoo_operacoes_comerciais where id = v_op;
    perform public.oc_encerrar_entrega(v_op, p_cliente_id, v_ver, null);
    -- ── 8. trilha ──
    insert into public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
    values (p_cliente_id, v_op, 'criar_do_legado',
            jsonb_build_object('criterio_valor', v_criterio, 'total', v_total, 'recebimentos', to_jsonb(p_recebimentos),
                               'saidas', p_saidas, 'lotes', v_lotes, 'dados', p_dados), v_actor, 'rpc');

    v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false), 'operacao_id', v_op,
      'versao', (select versao from public.zoo_operacoes_comerciais where id = v_op),
      'criterio_valor', v_criterio, 'total', v_total, 'lotes', v_lotes,
      'conta_corrente', public.oc_conta_corrente(v_op), 'pendencias', '[]'::jsonb);
    if p_simular then raise exception 'simulacao de criar do legado (desfeita)' using errcode = 'OCSIM'; end if;
  exception
    when sqlstate 'OCSIM' then return v_ret;
    when others then
      if p_simular then
        return jsonb_build_object('ok', false, 'simulado', true, 'pendencias', to_jsonb(array[sqlerrm]));
      end if;
      raise;
  end;
  return v_ret;
end;
$fn$;
revoke all on function public.oc_criar_do_legado(uuid, jsonb, text, numeric, uuid[], jsonb, boolean) from public, anon;
grant execute on function public.oc_criar_do_legado(uuid, jsonb, text, numeric, uuid[], jsonb, boolean) to authenticated, service_role;

do $g$
begin
  if has_function_privilege('anon', 'public.oc_criar_do_legado(uuid, jsonb, text, numeric, uuid[], jsonb, boolean)', 'execute')
     or has_function_privilege('anon', 'public.oc_criar_do_legado_sugestoes(uuid[])', 'execute')
     or has_function_privilege('anon', 'public._oc_legado_motivo_recebimento(uuid)', 'execute') then
    raise exception 'OC-CRIAR-DO-LEGADO-01: ACL aberta'; end if;
end $g$;
