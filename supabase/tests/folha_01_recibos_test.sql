-- FOLHA-01 · teste da regra do recibo (118380). Roda como postgres; termina em RAISE 'OK…'; nada fica no banco.
-- Fixture no cliente Teste (43f32d07) com nomes e valores INVENTADOS. Usuário = um admin real (as claims da transação).
do $t$
declare
  T uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; ADM uuid; L uuid; mold public.financeiro_lancamentos_v2;
  fa uuid; fb uuid; fc uuid; la uuid; lb uuid; lc uuid; r jsonb; ok boolean; doc jsonb; itens jsonb; MD5 constant text := repeat('b', 32);
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select m.user_id into L from cliente_membros m where m.ativo and m.perfil <> 'admin_agroinblue' and m.cliente_id <> T
     and not exists (select 1 from cliente_membros a where a.user_id = m.user_id and (a.perfil = 'admin_agroinblue' or a.cliente_id = T)) order by m.user_id limit 1;
  select * into mold from financeiro_lancamentos_v2 where cliente_id = T and not coalesce(cancelado, false) and tipo_operacao = '2-Saídas'
     and conta_bancaria_id is not null and plano_conta_id is not null order by data_competencia desc limit 1;
  if ADM is null or L is null or mold.id is null then raise exception 'sem fixture'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Fulano Teste da Silva', true) returning id into fa;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Beltrano Teste', true) returning id into fb;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Cicrano Teste Sem Recibo', true) returning id into fc;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
         status_transacao, data_competencia, data_vencimento, cenario, origem_lancamento)
  select T, mold.fazenda_id, mold.conta_bancaria_id, mold.plano_conta_id, x.f, '13º Salário 1ª Parcela 2026', x.v, mold.sinal, mold.tipo_operacao,
         'previsto', '2026-11-01', '2026-11-30', 'realizado', 'manual'
    from (values (fa, 1000.00), (fb, 500.00), (fc, 300.00)) x(f, v);
  select id into la from financeiro_lancamentos_v2 where favorecido_id = fa;
  select id into lb from financeiro_lancamentos_v2 where favorecido_id = fb;
  select id into lc from financeiro_lancamentos_v2 where favorecido_id = fc;

  doc := jsonb_build_object('md5', MD5, 'nome', 'Recibo Teste.pdf', 'tipo', '13_1', 'competencia', '2026-11', 'total', 1940.17, 'empregador', 'Empregador Teste');
  itens := jsonb_build_array(
    jsonb_build_object('nome', 'FULANO TESTE DA SILVA', 'cei', '1', 'paginas', '[1]'::jsonb, 'valor', 1200.10, 'arquivo', jsonb_build_object('url', T || '/x/p1.pdf', 'nome', 'p1.pdf', 'tamanho', 10)),
    jsonb_build_object('nome', 'TESTE BELTRANO', 'cei', '1', 'paginas', '[2]'::jsonb, 'valor', 500.00, 'arquivo', jsonb_build_object('url', T || '/x/p2.pdf', 'nome', 'p2.pdf', 'tamanho', 10)),
    jsonb_build_object('nome', 'NOVATO TESTE INVENTADO', 'cei', '1', 'paginas', '[3]'::jsonb, 'valor', 240.07, 'arquivo', jsonb_build_object('url', T || '/x/p3.pdf', 'nome', 'p3.pdf', 'tamanho', 10)));

  -- R1 o nome casa sem acento/caixa/ordem; parcial com prefixo; nada solto
  if _fn_folha_nome_casa('Antônio PERES Neto', 'Antonio Neto Peres') <> 'exato' then raise exception 'R1a'; end if;
  if _fn_folha_nome_casa('Jadson Teodorio Gabriel', 'Jadson Teodori Gabriel') <> 'parcial' then raise exception 'R1b'; end if;
  if _fn_folha_nome_casa('Amilton Aparecido Correia', 'Amilton Aparecido') <> 'parcial' then raise exception 'R1c'; end if;
  if _fn_folha_nome_casa('Lucas Santos Silva', 'Renan Fernandes da Silva') is not null then raise exception 'R1d'; end if;

  -- R2 sem acesso recusa (membro de outro cliente)
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_recibos_aplicar(T, null, doc, itens, true); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'R2 (sem acesso simulou)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  -- R3 soma que não fecha recusa
  ok := false; begin perform fn_folha_recibos_aplicar(T, null, doc || '{"total": 1940.18}', itens, true); exception when sqlstate 'P0001' then ok := position('somam' in sqlerrm) > 0; end;
  if not ok then raise exception 'R3 (soma errada passou)'; end if;

  -- R4 prévia: 2 automáticos, o novato pendente (sem "criar"), Cicrano sem recibo; nada gravado
  r := fn_folha_recibos_aplicar(T, null, doc, itens, true);
  if jsonb_array_length(r->'automaticos') <> 2 or jsonb_array_length(r->'pendencias') <> 1 or jsonb_array_length(r->'sem_recibo') <> 1
     or (select valor from financeiro_lancamentos_v2 where id = la) <> 1000 then raise exception 'R4 %', r; end if;

  -- R5 aplicar com "criar" no novato: valor substituído, status igual, 3 anexos, 1 criado no molde; Cicrano intocado
  itens := jsonb_set(itens, '{2,criar}', 'true');
  r := fn_folha_recibos_aplicar(T, null, doc, itens, false);
  if (select valor from financeiro_lancamentos_v2 where id = la) <> 1200.10 or (select status_transacao from financeiro_lancamentos_v2 where id = la) <> 'previsto'
     or (select valor from financeiro_lancamentos_v2 where id = lc) <> 300 then raise exception 'R5a %', r; end if;
  -- PR C (118430): o arquivo vai para folha_documentos e exige funcionário; aqui ninguém está no cadastro: nada em anexo do lançamento, 3 avisados
  if exists (select 1 from financeiro_lancamento_documentos where cliente_id = T and observacao like 'folha-recibo:' || MD5 || '%')
     or jsonb_array_length(r->'documentos_sem_funcionario') <> 3 or jsonb_array_length(r->'documentos') <> 0 then raise exception 'R5b %', r; end if;
  if (select count(*) from financeiro_lancamentos_v2 l join financeiro_fornecedores f on f.id = l.favorecido_id
       where l.cliente_id = T and l.descricao = '13º Salário 1ª Parcela 2026' and l.valor = 240.07 and l.plano_conta_id = mold.plano_conta_id) <> 1 then raise exception 'R5c (criado fora do molde)'; end if;
  if not exists (select 1 from audit_log where registro_id = la and via = 'folha-recibo:' || MD5) then raise exception 'R5d (sem trilha)'; end if;

  -- R6 o mesmo documento de novo recusa
  ok := false; begin perform fn_folha_recibos_aplicar(T, null, doc, itens, false); exception when sqlstate 'P0001' then ok := position('já foi aplicado' in sqlerrm) > 0; end;
  if not ok then raise exception 'R6 (aplicou 2×)'; end if;

  -- R7 desfazer: prévia não muda; desfaz valores, anexos e o criado
  r := fn_folha_recibos_desfazer(T, MD5, 'teste', true);
  if (r->>'valores')::int <> 1 or (r->>'criados')::int <> 1 or (r->>'documentos')::int <> 0 or (select valor from financeiro_lancamentos_v2 where id = la) <> 1200.10 then raise exception 'R7a %', r; end if;
  perform fn_folha_recibos_desfazer(T, MD5, 'teste', false);
  if (select valor from financeiro_lancamentos_v2 where id = la) <> 1000 then raise exception 'R7b'; end if;
  if exists (select 1 from financeiro_lancamento_documentos where cliente_id = T and observacao like 'folha-recibo:' || MD5 || '%' and not cancelado) then raise exception 'R7c'; end if;
  if exists (select 1 from financeiro_lancamentos_v2 where cliente_id = T and valor = 240.07 and descricao = '13º Salário 1ª Parcela 2026' and not coalesce(cancelado, false)) then raise exception 'R7d'; end if;

  -- R8 fechadas: anon não executa; as auxiliares não abrem para authenticated
  if has_function_privilege('anon', 'public.fn_folha_recibos_aplicar(uuid,uuid,jsonb,jsonb,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_folha_recibos_desfazer(uuid,text,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_folha_nome_casa(text,text)', 'execute') then raise exception 'R8'; end if;
  raise exception 'OK FOLHA-01 recibos: R1–R8 (nada gravado)';
end $t$;
