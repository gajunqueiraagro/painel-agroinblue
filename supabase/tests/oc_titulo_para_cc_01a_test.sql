-- OC-TITULO-PARA-CC-01a — migrar uma OC do modelo titulo para conta corrente (M1–M8).
-- Roda como `postgres`, DEPOIS da migration 20261027196600, e TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Tudo sintetico no cliente Teste (43f32d07); a operacao, o lote e a saida do gado sao
-- copiados de uma compra real SO' NA ESTRUTURA (cliente e fazenda sao os do Teste; sem contraparte). Comparacoes com IS DISTINCT FROM.
-- M1 abate sem saida: recusa (abate SINTETICO pelas RPCs, sem molde real — OC-CC-ABATE-01 PR 3).   M2 operacao ja' em conta corrente: recusa.   M3 compra fechada SEM saida de gado: recusa (D3).
-- M4 sem usuario: 42501.
-- M5 SIMULACAO nao grava: partes, liquidacoes, parcelas, eventos e as linhas dos lancamentos identicos antes x depois; o relatorio
--    vem no MESSAGE (compra de 2 parcelas pagas de 45.500 e lote de 91.000: dre_bate, saldo 0, quitado).
-- M6 GRAVACAO da mesma compra: os 2 lancamentos identicos coluna a coluna (fora updated_at, updated_by e compoe_dre, que sai pelo
--    gatilho da parte); 2 recebimentos, 1 entrega; casca fechada (parte, parcela, programacao, compromisso); a liquidacao automatica
--    volta ativa pela ponte; a segunda chamada recusa (ja' esta em conta corrente).
-- M7 DIFERENCA (pago 93.000, lote 91.000, titulo em fev e saida em mar): migra, dre_bate falso, os dois avisos, saldo −2.000 (o leitor da compra escreve o adiantado ao fornecedor com sinal negativo), situacao 'adiantado'.
-- M8 ACL.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
-- p_parcelas: os titulos pagos do principal; p_lote: o valor do lote; p_saida: registra a saida do gado; p_comp: competencia dos titulos
create function pg_temp.oc(p_tipo text, p_parcelas numeric[], p_lote numeric, p_saida boolean, p_comp date default '2031-03-01')
returns uuid language plpgsql as $f$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  v_src uuid; v_op uuid := gen_random_uuid(); v_lote uuid := gen_random_uuid(); v_mov uuid := gen_random_uuid();
  v_cat text; v_pc public.financeiro_plano_contas; v_comp uuid; v_prog uuid; v_parc uuid; v_l uuid; i int;
begin
  select o.id into v_src from zoo_operacoes_comerciais o
   where o.tipo_operacao = p_tipo and o.modelo_financeiro = 'titulo' and o.status_comercial = 'fechada' and o.rascunho is not true
     and (select count(*) from zoo_operacao_lotes z where z.operacao_id = o.id) = 1
     and (select count(*) from zoo_operacao_movimentacoes m join lancamentos l on l.id = m.movimentacao_id and l.cancelado is not true
           where m.operacao_id = o.id and m.operacao_lote_id is not null) = 1
   order by o.created_at limit 1;
  if v_src is null then raise exception 'sem operacao % de molde', p_tipo; end if;
  insert into zoo_operacoes_comerciais select (jsonb_populate_record(null::zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object(
      'id', v_op, 'cliente_id', c_cli, 'fazenda_id', c_faz, 'contraparte_id', null, 'versao', 1, 'is_teste', false, 'rascunho', false,
      'status_comercial', 'fechada', 'modelo_financeiro', 'titulo', 'valor_acordado', p_lote, 'data_operacao', '2031-03-10'))).*
    from zoo_operacoes_comerciais o where o.id = v_src;
  insert into zoo_operacao_lotes select (jsonb_populate_record(null::zoo_operacao_lotes, to_jsonb(z) || jsonb_build_object(
      'id', v_lote, 'cliente_id', c_cli, 'operacao_id', v_op, 'criterio_valor', 'total', 'valor_informado', p_lote))).*
    from zoo_operacao_lotes z where z.operacao_id = v_src;
  select categoria_negociada into v_cat from zoo_operacao_lotes where id = v_lote;
  if p_saida then
    insert into lancamentos select (jsonb_populate_record(null::lancamentos, to_jsonb(l) || jsonb_build_object(
        'id', v_mov, 'cliente_id', c_cli, 'fazenda_id', c_faz, 'data', '2031-03-10', 'cancelado', false))).*
      from lancamentos l join zoo_operacao_movimentacoes m on m.movimentacao_id = l.id
     where m.operacao_id = v_src and m.operacao_lote_id is not null and l.cancelado is not true;
    update lancamentos set quantidade = (select qtd_negociada from zoo_operacao_lotes where id = v_lote) where id = v_mov;
    insert into zoo_operacao_movimentacoes (cliente_id, operacao_id, movimentacao_id, operacao_lote_id) values (c_cli, v_op, v_mov, v_lote);
  end if;
  if p_tipo not in ('venda', 'compra') or coalesce(array_length(p_parcelas, 1), 0) = 0 then return v_op; end if;
  select pc.* into v_pc from financeiro_plano_contas pc
   where pc.cliente_id is null and pc.ativo and pc.tipo_operacao = _oc_cc_direcao(p_tipo) and pc.subcentro = _oc_cc_conta_entrega(p_tipo, v_cat);
  insert into zoo_operacao_compromissos (cliente_id, operacao_id, natureza, componente, plano_conta_id, subcentro, valor_total, descricao, status)
  values (c_cli, v_op, 'principal', 'principal', v_pc.id, v_pc.subcentro, (select sum(x) from unnest(p_parcelas) x), 'SINT principal', 'programado')
  returning id into v_comp;
  insert into zoo_operacao_programacoes (cliente_id, compromisso_id, status) values (c_cli, v_comp, 'ativa') returning id into v_prog;
  for i in 1 .. array_length(p_parcelas, 1) loop
    insert into zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, status)
    values (c_cli, v_prog, i, p_parcelas[i], '2031-03-15', 'materializada') returning id into v_parc;
    insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento,
        data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento)
    values (c_cli, c_faz, case when p_tipo = 'compra' then c_cta end, case when p_tipo = 'venda' then c_cta end, p_comp, '2031-03-15',
        '2031-03-15', p_parcelas[i], case when p_tipo = 'compra' then '-1' else '1' end, _oc_cc_direcao(p_tipo), 'realizado',
        'SINT titulo ' || i, v_pc.id, v_pc.subcentro, 'realizado', 'operacao_comercial') returning id into v_l;
    insert into zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
        data_vencimento, descricao, plano_conta_id, subcentro, financeiro_lancamento_id, programacao_parcela_id)
    values (c_cli, v_op, 'programacao', 'principal', 'principal', i, array_length(p_parcelas, 1), p_parcelas[i], '2031-03-15',
        'SINT principal ' || i, v_pc.id, v_pc.subcentro, v_l, v_parc);
  end loop;
  return v_op;
end $f$;
create function pg_temp.rec(p_sql text) returns text language plpgsql as $f$
declare v text;
begin execute p_sql into v; return 'PASSOU ' || coalesce(v, '');
exception when others then return sqlstate || ' ' || sqlerrm; end $f$;
-- a foto do que a simulacao nao pode mudar
create function pg_temp.foto(p_op uuid) returns text language sql as $f$
  select md5(concat_ws('|',
    (select o.modelo_financeiro || o.versao from zoo_operacoes_comerciais o where o.id = p_op),
    (select string_agg(md5(pt::text), ',' order by pt.id) from zoo_operacao_partes pt where pt.operacao_id = p_op),
    (select string_agg(md5(q::text), ',' order by q.id) from zoo_operacao_liquidacoes q where q.operacao_id = p_op),
    (select string_agg(md5(pp::text) || md5(pg::text) || md5(c::text), ',' order by pp.id) from zoo_operacao_compromissos c
       join zoo_operacao_programacoes pg on pg.compromisso_id = c.id join zoo_operacao_parcelas_programacao pp on pp.programacao_id = pg.id
      where c.operacao_id = p_op),
    (select count(*) from zoo_operacao_eventos e where e.operacao_id = p_op),
    (select string_agg(md5(f::text), ',' order by f.id) from financeiro_lancamentos_v2 f
      where f.id in (select pt.financeiro_lancamento_id from zoo_operacao_partes pt where pt.operacao_id = p_op)),
    (select count(*) from financeiro_lancamentos_v2 f where f.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a'))) $f$;

do $teste$
declare
  a uuid; b uuid; c uuid; d uuid; v_t text; v_f text; r jsonb; v_ok text := ''; v_l uuid[]; v_antes jsonb; v_depois jsonb; x jsonb;
  c_fora constant text[] := array['updated_at', 'updated_by', 'compoe_dre'];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  -- §M1 a M3: as guardas
  -- M1: o abate nasce pelas RPCs (desde o PR 3 ele nasce em conta corrente; o UPDATE o leva a titulo SO' AQUI), com lote e sem saida.
  -- Nao copia OC real: depois da migracao dos abates (PR 3, passo 2) pode nao sobrar abate em titulo para servir de molde.
  x := public.oc_salvar_rascunho(null, '43f32d07-dba8-4670-900c-bf645440c04a', null, jsonb_build_object('tipo_operacao', 'abate',
         'fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'data_operacao', '2031-03-10',
         'contraparte_id', (select id from financeiro_fornecedores where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a' and ativo order by created_at limit 1)));
  a := (x->>'operacao_id')::uuid;
  update zoo_operacoes_comerciais set modelo_financeiro = 'titulo' where id = a;
  x := public.oc_salvar_lotes(a, '43f32d07-dba8-4670-900c-bf645440c04a', (select versao from zoo_operacoes_comerciais where id = a),
         '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 10, "peso_medio_negociado_kg": 450, "criterio_valor": "total", "valor_informado": 1000}]');
  if (select modelo_financeiro from zoo_operacoes_comerciais where id = a) is distinct from 'titulo'
     or (select rascunho from zoo_operacoes_comerciais where id = a) is distinct from false
     or not exists (select 1 from zoo_operacao_lotes z where z.operacao_id = a) then
    raise exception 'M1 preparo: o abate sintetico deveria estar em titulo, fora de rascunho e com lote'; end if;
  v_t := pg_temp.rec(format('select oc_migrar_para_conta_corrente(%L, true)::text', a));
  if v_t is distinct from 'P0001 Registre a saida dos animais antes de migrar' then raise exception 'M1 abate: %', v_t; end if;
  b := pg_temp.oc('compra', array[500], 500, true);
  update zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente' where id = b;
  v_t := pg_temp.rec(format('select oc_migrar_para_conta_corrente(%L, true)::text', b));
  if v_t is distinct from 'P0001 Operacao ja esta em conta corrente' then raise exception 'M2: %', v_t; end if;
  c := pg_temp.oc('compra', array[500], 500, false);
  v_t := pg_temp.rec(format('select oc_migrar_para_conta_corrente(%L, true)::text', c));
  if v_t is distinct from 'P0001 Registre a saida dos animais antes de migrar' then raise exception 'M3 sem saida: %', v_t; end if;
  v_ok := v_ok || 'M1 ok; M2 ok; M3 ok; ';

  -- §M5 a simulacao nao grava e traz o relatorio
  d := pg_temp.oc('compra', array[45500, 45500], 91000, true);
  -- §M4 sem usuario
  perform set_config('request.jwt.claims', '', true);
  v_t := pg_temp.rec(format('select oc_migrar_para_conta_corrente(%L, true)::text', d));
  if v_t is distinct from '42501 sem acesso a este registro' then raise exception 'M4 sem usuario: %', v_t; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  v_ok := v_ok || 'M4 ok; ';
  if (select count(*) from zoo_operacao_liquidacoes q where q.operacao_id = d and q.estornado = false and q.origem = 'financeiro') is distinct from 2 then
    raise exception 'M5 preparo: a ponte nao liquidou os 2 titulos'; end if;
  v_f := pg_temp.foto(d);
  v_t := pg_temp.rec(format('select oc_migrar_para_conta_corrente(%L)::text', d));   -- o padrao e' simular
  if left(v_t, 7) is distinct from 'P0001 {' then raise exception 'M5: a simulacao nao devolveu o relatorio: %', v_t; end if;
  if pg_temp.foto(d) is distinct from v_f then raise exception 'M5: a simulacao GRAVOU'; end if;
  r := substr(v_t, 7)::jsonb;
  if (r->>'simulado')::boolean is distinct from true or (r->>'dre_bate')::boolean is distinct from true
     or (r->'antes'->>'dre')::numeric is distinct from -91000 or (r->'depois'->>'dre')::numeric is distinct from -91000
     or (r->'antes'->>'principal')::numeric is distinct from 91000 or (r->'antes'->>'liquidado')::numeric is distinct from 91000
     or (r->'depois'->>'entregas')::numeric is distinct from 91000 or (r->'depois'->>'recebimentos')::numeric is distinct from 91000
     or (r->'depois'->>'saldo')::numeric is distinct from 0 or r->'depois'->>'situacao' is distinct from 'quitado'
     or (r->>'dre_diferenca')::numeric is distinct from 0 or jsonb_array_length(r->'avisos') is distinct from 0
     or (r->'casca'->>'partes')::int is distinct from 2 or (r->'casca'->>'liquidacoes_estornadas')::int is distinct from 2
     or (r->'casca'->>'parcelas_marcadas')::int is distinct from 2 or (r->'casca'->>'programacoes_fechadas')::int is distinct from 1 then
    raise exception 'M5 relatorio: %', r; end if;
  v_ok := v_ok || 'M5 ok; ';

  -- §M6 a gravacao
  select array_agg(pt.financeiro_lancamento_id order by pt.sequencia_parcela) into v_l from zoo_operacao_partes pt where pt.operacao_id = d;
  select jsonb_agg(to_jsonb(f) - c_fora order by f.id) into v_antes from financeiro_lancamentos_v2 f where f.id = any (v_l);
  if (select bool_and(f.compoe_dre) from financeiro_lancamentos_v2 f where f.id = any (v_l)) is distinct from true then
    raise exception 'M6 preparo: os titulos nao compunham o DRE'; end if;
  r := oc_migrar_para_conta_corrente(d, false);
  select jsonb_agg(to_jsonb(f) - c_fora order by f.id) into v_depois from financeiro_lancamentos_v2 f where f.id = any (v_l);
  if v_depois is distinct from v_antes then raise exception 'M6: o lancamento do titulo MUDOU: % -> %', v_antes, v_depois; end if;
  if (select bool_or(f.compoe_dre) from financeiro_lancamentos_v2 f where f.id = any (v_l)) is distinct from false then
    raise exception 'M6: o pagamento continuou no DRE'; end if;
  select concat_ws('|',
      (select o.modelo_financeiro from zoo_operacoes_comerciais o where o.id = d),
      (select count(*) from zoo_operacao_partes pt where pt.operacao_id = d and pt.cancelada and pt.componente = 'principal'
          and pt.cancelada_motivo = 'migracao titulo -> conta corrente (OC-TITULO-PARA-CC-01a)'),
      (select count(*) from zoo_operacao_partes pt where pt.operacao_id = d and not pt.cancelada and pt.componente = 'recebimento'
          and pt.origem = 'manual' and pt.financeiro_lancamento_id = any (v_l)),
      (select count(*) || ':' || sum(f.valor)::numeric(14,2) || ':' || bool_and(f.compoe_dre) || ':' || bool_and(f.sem_movimentacao_caixa)
         from zoo_operacao_partes pt join financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id
        where pt.operacao_id = d and not pt.cancelada and pt.origem = 'entrega'),
      (select string_agg(distinct pp.status, ',') from zoo_operacao_compromissos c join zoo_operacao_programacoes pg on pg.compromisso_id = c.id
         join zoo_operacao_parcelas_programacao pp on pp.programacao_id = pg.id where c.operacao_id = d),
      (select string_agg(distinct pg.status, ',') from zoo_operacao_compromissos c join zoo_operacao_programacoes pg on pg.compromisso_id = c.id where c.operacao_id = d),
      (select string_agg(distinct c.status, ',') from zoo_operacao_compromissos c where c.operacao_id = d and c.natureza = 'principal'),
      (select count(*) filter (where not q.estornado) || '/' || count(*) from zoo_operacao_liquidacoes q where q.operacao_id = d),
      (select count(*) from zoo_operacao_eventos e where e.operacao_id = d
          and e.acao in ('fechar_casca_titulo', 'definir_modelo_financeiro', 'migrar_para_conta_corrente')
          and coalesce(e.detalhes->>'estorno_id', '') = r->>'estorno_id'))
    into v_t;
  if v_t is distinct from 'conta_corrente|2|2|1:91000.00:true:true|cancelada|cancelada|cancelado|2/2|3' then raise exception 'M6 estado: %', v_t; end if;
  if (r->>'simulado')::boolean is distinct from false or (r->>'dre_bate')::boolean is distinct from true
     or (r->'depois'->>'saldo')::numeric is distinct from 0 then raise exception 'M6 relatorio: %', r; end if;
  if (oc_conta_corrente(d)->>'situacao') is distinct from 'quitado' or jsonb_array_length(oc_conta_corrente(d)->'despesas') is distinct from 0 then
    raise exception 'M6 leitor: %', oc_conta_corrente(d); end if;
  v_t := pg_temp.rec(format('select oc_migrar_para_conta_corrente(%L, false)::text', d));
  if v_t is distinct from 'P0001 Operacao ja esta em conta corrente' then raise exception 'M6 segunda vez: %', v_t; end if;
  v_ok := v_ok || 'M6 ok; ';

  -- §M7 a diferenca e' aviso, nunca recusa (D2)
  a := pg_temp.oc('compra', array[93000], 91000, true, '2031-02-01');
  r := oc_migrar_para_conta_corrente(a, false);
  if (r->>'dre_bate')::boolean is distinct from false or (r->>'dre_diferenca')::numeric is distinct from 2000
     or (r->'antes'->>'dre')::numeric is distinct from -93000 or (r->'depois'->>'dre')::numeric is distinct from -91000
     or (r->'depois'->>'saldo')::numeric is distinct from -2000 or r->'depois'->>'situacao' is distinct from 'adiantado'
     or r->'avisos' is distinct from '["DRE muda em R$ 2.000,00", "mes do DRE muda de 2031-02 para 2031-03"]'::jsonb then
    raise exception 'M7: %', r; end if;
  v_ok := v_ok || 'M7 ok; ';

  -- §M8 ACL
  if has_function_privilege('anon', 'public.oc_migrar_para_conta_corrente(uuid, boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.oc_migrar_para_conta_corrente(uuid, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._oc_fechar_casca_titulo(uuid, uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public._oc_fechar_casca_titulo(uuid, uuid, text)', 'EXECUTE') then
    raise exception 'M8 ACL'; end if;
  v_ok := v_ok || 'M8 ok';
  raise exception 'OK — %', v_ok;
end $teste$;
rollback;
