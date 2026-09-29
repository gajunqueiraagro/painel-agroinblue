-- 20261027173100_oc_cc_classificacao_01_dados.sql
-- OC-CC-CLASSIFICACAO-01, DADO. Os 7 recebimentos/pagamentos das OCs em conta corrente voltam ao subcentro da operacao, que o
-- evento `vincular_recebimento` guardou em `dados_anteriores.lancamento.plano_conta_id`:
--   232c05aa (SR, venda desmama)  4 recebimentos  3015 Adiantamento de Clientes    -> 1120 Venda de Desmama Machos
--   e1ea7f4b (SR, venda 315 cab)  2 recebimentos  3015 Adiantamento de Clientes    -> 1120 Venda de Desmama Machos
--   1337bb2d (Agnaldo, compra)    1 pagamento     5005 Adiantamento a Fornecedores -> 15020 Investimento Compra Bovinos Machos
-- `compoe_dre` fica false pelo gatilho (a parte viva da OC — migration 20261027173000). Valor, datas, conta bancaria, descricao e
-- conciliacao nao mudam; o HASH e' regravado com o original (idioma do VINCULAR-FIX-01).
-- ⚠ `editado_manual` VOLTA AO RETRATO DE ANTES DO VINCULAR: nos 4 importados da 232c05aa ele era nulo e o vincular o pos em true
--   (a troca de conta conta como edicao para o gatilho). A volta liga `app.propagando_plano` so' neste UPDATE, como a propagacao
--   do plano (DRE-CLASSIF-COPIA-01), e reescreve o valor do retrato. As tres restantes ja' estavam em true antes e ficam.
-- ⚠ AS DESCRICOES DA e1ea7f4b FORAM EDITADAS DEPOIS DO VINCULAR e ficam como estao.
-- As copias da conta nas 7 partes acompanham. Um evento por OC ('recebimento_na_conta_da_operacao', versao + 1).
-- Depois: 3015, 5005 e 5006 DESATIVADAS (nao apagadas, nao renumeradas), com zero lancamento, parte ou compromisso vivos nelas.
-- GUARDAS: partida exatamente a medida; chegada com DRE (SR 2025, SR 2026, Agnaldo 2026), caixa (SR e Agnaldo) e rebanho (SR e
-- Agnaldo) com md5 identico ao de antes, os 7 com compoe_dre false e na conta original, e saldo da conta corrente das 3 OCs igual.

do $mig$
declare
  c_sr constant uuid := (select cliente_id from public.zoo_operacoes_comerciais where id = '232c05aa-e531-4f91-a4ba-a61e791d4d56');
  c_ag constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  c_ator constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_lancs constant uuid[] := array['568e80e6-16e0-4f3d-a11f-d05cba1beafe', '693fc917-34f7-404b-915a-149c2b09c1b4',
    'aee255bc-0777-4e90-af04-413e11e34ce4', 'e57e3e60-290e-4449-9ee8-2b47db37ad2c', '4df4ea15-4f67-4a30-aa85-f0c979b7fda6',
    '692f1957-1e69-4a0a-b1ca-56ffc939e3a5', 'f110eb68-3511-400b-a27f-071a306b3b17']::uuid[];
  r record; v_l public.financeiro_lancamentos_v2; v_l2 public.financeiro_lancamentos_v2; v_orig uuid; v_em boolean;
  v_dre0 text; v_dre1 text; v_cx0 text; v_cx1 text; v_rb0 text; v_rb1 text; v_cc0 text; v_cc1 text; v_ver int; v_n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  -- ── partida ──
  select count(*) into v_n
    from public.financeiro_lancamentos_v2 l
    join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
    join public.zoo_operacao_partes pt on pt.financeiro_lancamento_id = l.id and pt.cancelada = false and pt.componente = 'recebimento'
   where l.id = any (c_lancs) and l.cancelado is not true and pc.ordem_exibicao in (3015, 5005) and l.compoe_dre = false;
  if v_n <> 7 then raise exception 'partida: esperados 7 recebimentos/pagamentos em 3015/5005, achados %', v_n; end if;
  if (select count(*) from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
       where pc.cliente_id is null and pc.ordem_exibicao in (3015, 5005, 5006)) <> 7 then
    raise exception 'partida: 3015/5005/5006 tem lancamento alem dos 7'; end if;

  select md5(string_agg(x, ';' order by x)) into v_dre0 from (
    select (public.fn_dre_pecuaria(c_sr, '2025-01', '2025-12', 'realizado') - 'gerado_em')::text x
    union all select (public.fn_dre_pecuaria(c_sr, '2026-01', '2026-12', 'realizado') - 'gerado_em')::text
    union all select (public.fn_dre_pecuaria(c_ag, '2026-01', '2026-12', 'realizado') - 'gerado_em')::text) q;
  select md5(string_agg(x, ';' order by x)) into v_cx0 from (
    select cliente_id || '|' || to_char(data_pagamento, 'YYYY-MM') || '|' || tipo_operacao || '|'
           || coalesce(conta_bancaria_id::text, '-') || '|' || coalesce(conta_destino_id::text, '-') || '|' || sum(valor) as x
      from public.financeiro_lancamentos_v2
     where cliente_id in (c_sr, c_ag) and cancelado is not true and coalesce(sem_movimentacao_caixa, false) = false
       and status_transacao in ('realizado', 'conciliado')
     group by cliente_id, tipo_operacao, conta_bancaria_id, conta_destino_id, to_char(data_pagamento, 'YYYY-MM')) q;
  select md5(string_agg(id || '|' || quantidade || '|' || coalesce(peso_medio_kg, 0) || '|' || data || '|' || tipo || '|'
             || coalesce(cancelado, false) || '|' || coalesce(valor_total, 0), ';' order by id))
    into v_rb0 from public.lancamentos where cliente_id in (c_sr, c_ag);
  select md5(string_agg(o.id || '|' || (cc->>'entregue') || '|' || (cc->>'recebido') || '|' || (cc->>'saldo') || '|' || (cc->>'situacao'),
             ';' order by o.id))
    into v_cc0 from public.zoo_operacoes_comerciais o, lateral (select public.oc_conta_corrente(o.id) cc) q
   where o.modelo_financeiro = 'conta_corrente';

  -- ── os 7 voltam a' conta da operacao ──
  for r in select l.id, pt.id parte_id, pt.operacao_id,
                  (e.dados_anteriores->'lancamento'->>'plano_conta_id')::uuid plano_orig,
                  (e.dados_anteriores->'lancamento'->>'editado_manual')::boolean em_orig
             from public.financeiro_lancamentos_v2 l
             join public.zoo_operacao_partes pt on pt.financeiro_lancamento_id = l.id and pt.cancelada = false and pt.componente = 'recebimento'
             join lateral (select e.* from public.zoo_operacao_eventos e
                            where e.operacao_id = pt.operacao_id and e.acao = 'vincular_recebimento' and e.detalhes->>'lancamento_id' = l.id::text
                            order by e.created_at desc limit 1) e on true
            where l.id = any (c_lancs) loop
    if r.plano_orig is null or not exists (select 1 from public.financeiro_plano_contas pc where pc.id = r.plano_orig and pc.ativo
                                              and pc.ordem_exibicao in (1120, 15020)) then
      raise exception 'conta original do lancamento % fora do esperado (%)', r.id, r.plano_orig; end if;
    select * into v_l from public.financeiro_lancamentos_v2 where id = r.id for update;
    perform set_config('app.propagando_plano', 'on', true);
    update public.financeiro_lancamentos_v2
       set plano_conta_id = r.plano_orig, editado_manual = r.em_orig, updated_at = now(), updated_by = c_ator
     where id = r.id;
    perform set_config('app.propagando_plano', 'off', true);
    update public.financeiro_lancamentos_v2 set hash_importacao = v_l.hash_importacao
     where id = r.id and hash_importacao is distinct from v_l.hash_importacao;
    select * into v_l2 from public.financeiro_lancamentos_v2 where id = r.id;
    if v_l2.hash_importacao is distinct from v_l.hash_importacao or v_l2.valor is distinct from v_l.valor
       or v_l2.data_competencia is distinct from v_l.data_competencia or v_l2.data_pagamento is distinct from v_l.data_pagamento
       or v_l2.conta_bancaria_id is distinct from v_l.conta_bancaria_id or v_l2.conta_destino_id is distinct from v_l.conta_destino_id
       or v_l2.descricao is distinct from v_l.descricao or v_l2.status_transacao is distinct from v_l.status_transacao
       or v_l2.conciliado_em is distinct from v_l.conciliado_em or v_l2.plano_conta_id is distinct from r.plano_orig
       or v_l2.compoe_dre is not false then
      raise exception 'lancamento %: so a conta deveria mudar (e compoe_dre ficar false)', r.id; end if;
    update public.zoo_operacao_partes
       set plano_conta_id = v_l2.plano_conta_id, macro_custo = v_l2.macro_custo, grupo_custo = v_l2.grupo_custo,
           centro_custo = v_l2.centro_custo, subcentro = v_l2.subcentro, updated_at = now()
     where id = r.parte_id;
  end loop;

  for r in select distinct pt.operacao_id, o.cliente_id from public.zoo_operacao_partes pt
             join public.zoo_operacoes_comerciais o on o.id = pt.operacao_id where pt.financeiro_lancamento_id = any (c_lancs) loop
    select versao into v_ver from public.zoo_operacoes_comerciais where id = r.operacao_id;
    insert into public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
    values (r.cliente_id, r.operacao_id, 'recebimento_na_conta_da_operacao',
      jsonb_build_object('motivo', 'OC-CC-CLASSIFICACAO-01: recebimento/pagamento no subcentro da operacao, fora do DRE pela parte',
        'lancamentos', (select jsonb_agg(jsonb_build_object('id', l.id, 'conta', l.subcentro) order by l.id)
                          from public.financeiro_lancamentos_v2 l join public.zoo_operacao_partes pt on pt.financeiro_lancamento_id = l.id
                         where pt.operacao_id = r.operacao_id and pt.cancelada = false and pt.componente = 'recebimento'),
        'versao_anterior', v_ver, 'versao_nova', v_ver + 1),
      c_ator, 'migration');
    update public.zoo_operacoes_comerciais set versao = versao + 1, updated_at = now(), updated_by = c_ator where id = r.operacao_id;
  end loop;

  -- ── 3015, 5005 e 5006 desativadas ──
  if exists (select 1 from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
              where pc.cliente_id is null and pc.ordem_exibicao in (3015, 5005, 5006))
     or exists (select 1 from public.zoo_operacao_partes pt join public.financeiro_plano_contas pc on pc.id = pt.plano_conta_id
              where pc.cliente_id is null and pc.ordem_exibicao in (3015, 5005, 5006) and pt.cancelada = false)
     or exists (select 1 from public.zoo_operacao_compromissos c join public.financeiro_plano_contas pc on pc.id = c.plano_conta_id
              where pc.cliente_id is null and pc.ordem_exibicao in (3015, 5005, 5006) and c.status <> 'cancelado') then
    raise exception 'ainda ha lancamento, parte ou compromisso vivo em 3015/5005/5006'; end if;
  update public.financeiro_plano_contas set ativo = false, updated_at = now()
   where cliente_id is null and ordem_exibicao in (3015, 5005, 5006)
     and subcentro in ('Adiantamento de Clientes', 'Adiantamento a Fornecedores', 'Devolução de Adiantamento de Clientes');
  get diagnostics v_n = row_count;
  if v_n <> 3 then raise exception 'desativar: esperadas 3 contas, % atualizadas', v_n; end if;

  -- ── chegada ──
  if (select count(*) from public.financeiro_lancamentos_v2 l join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
       where l.id = any (c_lancs) and l.compoe_dre = false and pc.ordem_exibicao in (1120, 15020)) <> 7 then
    raise exception 'chegada: os 7 nao estao na conta da operacao com compoe_dre false'; end if;
  select md5(string_agg(x, ';' order by x)) into v_dre1 from (
    select (public.fn_dre_pecuaria(c_sr, '2025-01', '2025-12', 'realizado') - 'gerado_em')::text x
    union all select (public.fn_dre_pecuaria(c_sr, '2026-01', '2026-12', 'realizado') - 'gerado_em')::text
    union all select (public.fn_dre_pecuaria(c_ag, '2026-01', '2026-12', 'realizado') - 'gerado_em')::text) q;
  select md5(string_agg(x, ';' order by x)) into v_cx1 from (
    select cliente_id || '|' || to_char(data_pagamento, 'YYYY-MM') || '|' || tipo_operacao || '|'
           || coalesce(conta_bancaria_id::text, '-') || '|' || coalesce(conta_destino_id::text, '-') || '|' || sum(valor) as x
      from public.financeiro_lancamentos_v2
     where cliente_id in (c_sr, c_ag) and cancelado is not true and coalesce(sem_movimentacao_caixa, false) = false
       and status_transacao in ('realizado', 'conciliado')
     group by cliente_id, tipo_operacao, conta_bancaria_id, conta_destino_id, to_char(data_pagamento, 'YYYY-MM')) q;
  select md5(string_agg(id || '|' || quantidade || '|' || coalesce(peso_medio_kg, 0) || '|' || data || '|' || tipo || '|'
             || coalesce(cancelado, false) || '|' || coalesce(valor_total, 0), ';' order by id))
    into v_rb1 from public.lancamentos where cliente_id in (c_sr, c_ag);
  select md5(string_agg(o.id || '|' || (cc->>'entregue') || '|' || (cc->>'recebido') || '|' || (cc->>'saldo') || '|' || (cc->>'situacao'),
             ';' order by o.id))
    into v_cc1 from public.zoo_operacoes_comerciais o, lateral (select public.oc_conta_corrente(o.id) cc) q
   where o.modelo_financeiro = 'conta_corrente';
  if v_dre1 <> v_dre0 then raise exception 'o DRE (SR 2025/2026, Agnaldo 2026) mudou'; end if;
  if v_cx1 <> v_cx0 then raise exception 'o caixa (SR e Agnaldo) mudou'; end if;
  if v_rb1 <> v_rb0 then raise exception 'o rebanho (SR e Agnaldo) mudou'; end if;
  if v_cc1 <> v_cc0 then raise exception 'o saldo da conta corrente mudou'; end if;
end $mig$;
