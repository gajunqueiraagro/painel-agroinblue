-- FIN-LR-SYNC-01a — fn_lr_sync_comparar no cliente Teste, sintetico (abril/2031). Termina em RAISE 'OK'; transacao revertida.
--   C1 as situacoes (sem_mudanca -> acao 'nada', programado e realizado): sem_mudanca, mudou (vencimento), mudou (valor do mes da recorrencia), decidir (centavos), decidir (fatura),
--      pago_no_lr, nova, ignorada, da_oc; e so_no_sistema
--   C1b valor do mes disputado: a linha de valor mais proximo casa; pago_no_lr com valor diferente preenche 'diferencas'
--   C1c linha com Tipo 'Parcela de Financiamento' sem par por 1–3 = decidir / financiamento (nao casa por valor do mes);
--       linha do mesmo banco com Tipo 'Conta a Pagar' segue o caminho normal
--   C2 a chave com 3 pedagios identicos (|valor|n) e unica
--   C3 vinculo + foto: o LR nao mudou -> "fica como esta'" (sem diferenca, mesmo com o sistema diferente); o LR mudou -> mudou
--   C4 lancamento com parte viva de OC nunca casa nem entra em so_no_sistema (vira da_oc)
--   C5 tenant: 42501 para gestor de outro cliente e sem usuario
--   C6 nenhum lancamento escrito (md5 dos lancamentos do cliente antes x depois); a sessao foi gravada
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d'; s_id constant uuid := gen_random_uuid();
  ps record; pe record; v_faz text; fa uuid; fb uuid; fc uuid; fd uuid; fe uuid; ff uuid; fg uuid; fin uuid; rec3 uuid; rec uuid; rec2 uuid; oc uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; l6 uuid; l7 uuid; l8 uuid; l9 uuid; l10 uuid; l11 uuid; l12 uuid; l13 uuid;
  v_linhas jsonb := '[]'; v jsonb; v_md5 text; e text; vx jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id, subcentro into ps from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '2-Saídas' and macro_custo <> 'Dividendos' order by ordem_exibicao limit 1;
  select id, subcentro into pe from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '1-Entradas' and macro_custo <> 'Dividendos' order by ordem_exibicao limit 1;
  select nome into v_faz from fazendas where id = f;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT ALFA COMERCIO MAQUINAS', '11.222.333/0001-81', true) returning id into fa;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT BETA PEREIRA FOLHA', '123.456.789-09', true) returning id into fb;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT GAMA EQUIPAMENTOS', '22.333.444/0001-05', true) returning id into fc;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT DELTA FRIGORIFICO', '33.444.555/0001-06', true) returning id into fd;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT EPSILON SERVICOS', '44.555.666/0001-07', true) returning id into fe;
  insert into financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  values (k, f, 'SINT folha', c, ps.subcentro, 3419.75, 5, '2031-04-01', '2031-04-05', '2031-12-31') returning id into rec;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2031-04-01', '2031-04-10', 1000, '-1', '2-Saídas', 'programado', 'SINT L1', ps.id, ps.subcentro, 'realizado', 'manual', fa) returning id into l1;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2031-04-01', '2031-04-05', 500, '-1', '2-Saídas', 'programado', 'SINT L2', ps.id, ps.subcentro, 'realizado', 'manual', fa) returning id into l2;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id, recorrencia_id)
  values (k, f, c, '2031-04-01', '2031-04-05', 3419.75, '-1', '2-Saídas', 'previsto', 'SINT L3 folha', ps.id, ps.subcentro, 'realizado', 'manual', fb, rec) returning id into l3;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2031-04-01', '2031-04-08', 4618.36, '-1', '2-Saídas', 'programado', 'SINT L4', ps.id, ps.subcentro, 'realizado', 'manual', fc) returning id into l4;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2031-04-01', '2031-04-12', 777, '-1', '2-Saídas', 'programado', 'SINT L5', ps.id, ps.subcentro, 'realizado', 'manual', fa) returning id into l5;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2031-04-01', '2031-04-15', 228400, '1', '1-Entradas', 'previsto', 'SINT L6 abate', pe.id, pe.subcentro, 'realizado', 'manual', fd) returning id into l6;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2031-04-01', '2031-04-25', 900, '-1', '2-Saídas', 'programado', 'SINT L7 so no sistema', ps.id, ps.subcentro, 'realizado', 'manual', fa) returning id into l7;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2031-04-01', '2031-04-18', 350, '-1', '2-Saídas', 'programado', 'SINT L8 arrumado', ps.id, ps.subcentro, 'realizado', 'manual', fe) returning id into l8;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2031-04-01', '2031-04-19', 200, '-1', '2-Saídas', 'programado', 'SINT L9', ps.id, ps.subcentro, 'realizado', 'manual', fe) returning id into l9;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, f, c, '2031-04-01', '2031-04-21', '2031-04-21', 600, '-1', '2-Saídas', 'realizado', 'SINT L10 pago', ps.id, ps.subcentro, 'realizado', 'manual', fa) returning id into l10;
  -- o caso "Rony": duas linhas PAGAS do mesmo fornecedor no mes contra UMA ocorrencia de recorrencia (valor do mes).
  -- A de valor mais proximo (2.414,38; chave Z2) fica com a ocorrencia, mesmo vindo depois na ordem da chave.
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT ZETA SOUZA FOLHA', '987.654.321-00', true) returning id into ff;
  insert into financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  values (k, f, 'SINT folha 2', c, ps.subcentro, 3419.75, 5, '2031-04-01', '2031-04-05', '2031-12-31') returning id into rec2;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id, recorrencia_id)
  values (k, f, c, '2031-04-01', '2031-04-05', 3419.75, '-1', '2-Saídas', 'previsto', 'SINT L11 folha 2', ps.id, ps.subcentro, 'realizado', 'manual', ff, rec2) returning id into l11;
  -- financiamento: parcela de 612.000 no mes; o LR traz 381.455,31 (pago) e uma entrada de 378.203,94 do mesmo credor.
  -- Parcela de financiamento nao casa por valor do mes; credor de financiamento vivo sem par = decidir / financiamento.
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT ETA BANCO DESENVOLVIMENTO', '55.666.777/0001-08', true) returning id into fg;
  insert into financiamentos (cliente_id, natureza, credor_id, status, descricao) values (k, 'financiamento', fg, 'ativo', 'SINT financiamento') returning id into fin;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id, financiamento_id)
  values (k, f, c, '2031-04-01', '2031-04-01', 612000, '-1', '2-Saídas', 'programado', 'SINT L12 juros financiamento', ps.id, ps.subcentro, 'realizado', 'manual', fg, fin) returning id into l12;
  -- uma recorrencia do mesmo credor no mes: a linha 'Parcela de Financiamento' nao casa nela por valor do mes
  insert into financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  values (k, f, 'SINT tarifa pacote', c, ps.subcentro, 400000, 10, '2031-04-01', '2031-04-10', '2031-12-31') returning id into rec3;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id, recorrencia_id)
  values (k, f, c, '2031-04-01', '2031-04-10', 400000, '-1', '2-Saídas', 'previsto', 'SINT L13 recorrencia do banco', ps.id, ps.subcentro, 'realizado', 'manual', fg, rec3) returning id into l13;
  insert into zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao) values (k, 'abate', '2031-04-01') returning id into oc;
  insert into zoo_operacao_partes (cliente_id, operacao_id, natureza, valor, financeiro_lancamento_id) values (k, oc, 'principal', 228400, l6);
  insert into lr_vinculos (cliente_id, chave, lancamento_id, foto) values
    (k, 'p|V1|44555666000107|2031-01-02|2031-04', l8, '{"Valor": 300, "Data Vencimento": "18/04/2031"}'),
    (k, 'p|V2|44555666000107|2031-01-02|2031-04', l9, '{"Valor": 200, "Data Vencimento": "19/04/2031"}');
  insert into lr_vinculos (cliente_id, chave, ignorar) values (k, 'p|IG|11222333000181|2031-01-02|2031-04', true);

  select jsonb_agg(jsonb_build_object('_arquivo', 'sint-pagar.xlsx', '_tipo_arquivo', t.tp, 'Tipo', case t.tp when 'receber' then 'Conta a Receber' else 'Conta a Pagar' end,
           'Número', t.num, 'CPF/CNPJ', t.doc, case t.tp when 'receber' then 'Cliente' else 'Fornecedor' end, t.nome, 'Inscrição Estadual', v_faz,
           'Tipo de Contas', case t.tp when 'receber' then pe.subcentro else ps.subcentro end, 'Valor', t.valor, 'Data Vencimento', t.venc,
           case t.tp when 'receber' then 'Data Recebimento' else 'Data Pagamento' end, t.pag, 'Data Cadastro', '02/01/2031',
           case t.tp when 'receber' then 'Está Recebido?' else 'Está Pago?' end, t.pago) order by t.o) into v_linhas
    from (values (1, 'pagar', 'A1', '11.222.333/0001-81', 'SINT ALFA COMERCIO MAQUINAS', 1000, '10/04/2031', '-', 'Não'),
                 (2, 'pagar', 'A2', '11.222.333/0001-81', 'SINT ALFA COMERCIO MAQUINAS', 500, '20/04/2031', '-', 'Não'),
                 (3, 'pagar', 'B1', '123.456.789-09', 'SINT BETA PEREIRA', 2414.38, '05/04/2031', '-', 'Não'),
                 (4, 'pagar', 'G1', '22.333.444/0001-05', 'SINT GAMA EQUIPAMENTOS', 4618.35, '08/04/2031', '-', 'Não'),
                 (5, 'pagar', 'A3', '11.222.333/0001-81', 'SINT ALFA COMERCIO MAQUINAS', 777, '12/04/2031', '12/04/2031', 'Sim'),
                 (6, 'receber', 'D1', '33.444.555/0001-06', 'SINT DELTA FRIGORIFICO', 228400, '15/04/2031', '-', 'Não'),
                 (7, 'pagar', 'V1', '44.555.666/0001-07', 'SINT EPSILON SERVICOS', 300, '18/04/2031', '-', 'Não'),
                 (8, 'pagar', 'V2', '44.555.666/0001-07', 'SINT EPSILON SERVICOS', 250, '19/04/2031', '-', 'Não'),
                 (9, 'pagar', 'IG', '11.222.333/0001-81', 'SINT ALFA COMERCIO MAQUINAS', 50, '20/04/2031', '-', 'Não'),
                 (10, 'pagar', 'C1', '99999999000000', 'Cartao de Credito Visa', 24086.16, '16/04/2031', '-', 'Não'),
                 (11, 'pagar', 'N1', '11.222.333/0001-81', 'SINT ALFA COMERCIO MAQUINAS', 1234, '22/04/2031', '-', 'Não'),
                 (12, 'pagar', '12 / 1', '99999999000000', 'SINT PEDAGIO VIA', 10.5, '23/04/2031', '-', 'Não'),
                 (13, 'pagar', '12 / 1', '99999999000000', 'SINT PEDAGIO VIA', 10.5, '23/04/2031', '-', 'Não'),
                 (14, 'pagar', '12 / 1', '99999999000000', 'SINT PEDAGIO VIA', 10.5, '23/04/2031', '-', 'Não'),
                 (15, 'pagar', 'A4', '11.222.333/0001-81', 'SINT ALFA COMERCIO MAQUINAS', 600, '21/04/2031', '21/04/2031', 'Sim'),
                 (16, 'pagar', 'Z1', '987.654.321-00', 'SINT ZETA SOUZA', 1381.92, '02/04/2031', '02/04/2031', 'Sim'),
                 (17, 'pagar', 'Z2', '987.654.321-00', 'SINT ZETA SOUZA', 2414.38, '02/04/2031', '02/04/2031', 'Sim'),
                 (18, 'pagar', 'F1', '55.666.777/0001-08', 'SINT ETA BANCO DESENVOLVIMENTO', 381455.31, '01/04/2031', '01/04/2031', 'Sim'),
                 (19, 'receber', 'F2', '55.666.777/0001-08', 'SINT ETA BANCO DESENVOLVIMENTO', 378203.94, '01/04/2031', '01/04/2031', 'Sim'),
                 (20, 'pagar', 'T1', '55.666.777/0001-08', 'SINT ETA BANCO DESENVOLVIMENTO', 3.97, '01/05/2031', '01/05/2031', 'Sim')
         ) t(o, tp, num, doc, nome, valor, venc, pag, pago);

  -- o LR marca as duas do credor como 'Parcela de Financiamento'; a tarifa do mesmo banco (20) e' 'Conta a Pagar'
  v_linhas := jsonb_set(jsonb_set(v_linhas, '{17,Tipo}', '"Parcela de Financiamento"'), '{18,Tipo}', '"Parcela de Financiamento"');
  select md5(string_agg(l::text, '' order by l.id)) into v_md5 from financeiro_lancamentos_v2 l where l.cliente_id = k;
  v := public.fn_lr_sync_comparar(k, s_id, v_linhas);

  -- C1
  if (select string_agg(x ->> 'situacao', ',' order by (x ->> 'ordem')::int) from jsonb_array_elements(v -> 'linhas') x)
     is distinct from 'sem_mudanca,mudou,mudou,decidir,pago_no_lr,da_oc,sem_mudanca,mudou,ignorada,decidir,nova,nova,nova,nova,sem_mudanca,pago_no_lr,pago_no_lr,decidir,decidir,pago_no_lr' then
    raise exception 'C1 situacoes: %', (select string_agg(x ->> 'situacao', ',' order by (x ->> 'ordem')::int) from jsonb_array_elements(v -> 'linhas') x); end if;
  select x into vx from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 3;
  if vx ->> 'lancamento_id' is distinct from l3::text or vx ->> 'motivo' is distinct from 'valor_do_mes'
     or vx #>> '{lancamento,recorrencia_id}' is distinct from rec::text then raise exception 'C1 recorrencia: %', vx; end if;
  select x into vx from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 2;
  if vx ->> 'lancamento_id' is distinct from l2::text or vx ->> 'motivo' is distinct from 'vencimento' then raise exception 'C1 vencimento: %', vx; end if;
  if (select x ->> 'acao_padrao' from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 4) is distinct from 'decidir_centavos'
     or (select x ->> 'acao_padrao' from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 10) is distinct from 'nao_importar_fatura'
     or (select x ->> 'acao_padrao' from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 5) is distinct from 'aguardar_extrato'
     or (select x ->> 'acao_padrao' from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 11) is distinct from 'criar_programada' then
    raise exception 'C1 acoes'; end if;
  -- sem_mudanca -> 'nada' SEMPRE: com lancamento programado (1), com vinculo (7) e com lancamento realizado (15)
  if (select string_agg(x ->> 'acao_padrao', ',' order by (x ->> 'ordem')::int) from jsonb_array_elements(v -> 'linhas') x
       where x ->> 'situacao' = 'sem_mudanca') is distinct from 'nada,nada,nada'
     or (select x #>> '{lancamento,status}' from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 1) is distinct from 'programado'
     or (select x #>> '{lancamento,status}' from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 15) is distinct from 'realizado' then
    raise exception 'C1 sem_mudanca -> nada: %', (select jsonb_agg(jsonb_build_object('o', x -> 'ordem', 'a', x -> 'acao_padrao', 's', x #> '{lancamento,status}'))
      from jsonb_array_elements(v -> 'linhas') x where x ->> 'situacao' = 'sem_mudanca'); end if;
  -- a parcela de financiamento que o LR nao casou (L12) fica a' vista em so_no_sistema, junto da L7
  if (select string_agg(x ->> 'lancamento_id', ',' order by x ->> 'lancamento_id') from jsonb_array_elements(v -> 'so_no_sistema') x)
     is distinct from (select string_agg(i::text, ',' order by i::text) from unnest(array[l7, l12, l13]) i) then
    raise exception 'C1 so_no_sistema: %', v -> 'so_no_sistema'; end if;
  -- C1b valor do mes: a linha mais proxima casa a ocorrencia; pago_no_lr com o valor diferente sai com a diferenca preenchida
  select x into vx from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 17;
  if vx ->> 'lancamento_id' is distinct from l11::text or vx ->> 'acao_padrao' is distinct from 'aguardar_extrato'
     or vx ->> 'motivo' is distinct from 'pago_no_lr_com_valor_diferente' or (vx ->> 'nivel')::int is distinct from 5
     or not (vx -> 'diferencas' @> jsonb_build_array(jsonb_build_object('campo', 'valor', 'sistema', 341975, 'lr', 241438))) then
    raise exception 'C1b mais proxima: %', vx; end if;
  select x into vx from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 16;
  if vx ->> 'lancamento_id' is not null or vx ->> 'motivo' is distinct from 'sem_lancamento' then
    raise exception 'C1b a outra segue o caminho normal: %', vx; end if;
  -- C1c financiamento fora do valor do mes: as duas linhas do credor = decidir / financiamento, sem lancamento
  if (select string_agg(coalesce(x ->> 'lancamento_id', '-') || ':' || (x ->> 'acao_padrao') || ':' || (x ->> 'motivo'), ' ' order by (x ->> 'ordem')::int)
        from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int in (18, 19)) is distinct from '-:decidir:financiamento -:decidir:financiamento' then
    raise exception 'C1c financiamento: %', (select jsonb_agg(x) from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int in (18, 19)); end if;
  -- C1c: ser credor de financiamento NAO decide nada — a tarifa do mesmo banco (Tipo 'Conta a Pagar') segue o caminho normal
  select x into vx from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 20;
  if vx ->> 'situacao' is distinct from 'pago_no_lr' or vx ->> 'motivo' is distinct from 'sem_lancamento' then
    raise exception 'C1c tarifa do credor: %', vx; end if;
  -- C2
  if (select count(DISTINCT x ->> 'chave') from jsonb_array_elements(v -> 'linhas') x) is distinct from 20
     or (select string_agg(x ->> 'chave', ' ' order by (x ->> 'ordem')::int) from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int between 12 and 14)
        is distinct from 'p|12 / 1|99999999000000|2031-01-02|2031-04|1050|1 p|12 / 1|99999999000000|2031-01-02|2031-04|1050|2 p|12 / 1|99999999000000|2031-01-02|2031-04|1050|3' then
    raise exception 'C2 chave dos pedagios'; end if;
  -- C3
  select x into vx from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 7;
  if vx ->> 'lancamento_id' is distinct from l8::text or jsonb_array_length(vx -> 'diferencas') is distinct from 0 then raise exception 'C3 fica como esta: %', vx; end if;
  select x into vx from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 8;
  if vx ->> 'lancamento_id' is distinct from l9::text or vx #>> '{diferencas,0,campo}' is distinct from 'valor' or vx #>> '{diferencas,0,lr}' is distinct from '25000' then
    raise exception 'C3 mudou: %', vx; end if;
  -- C4
  if (select x ->> 'lancamento_id' from jsonb_array_elements(v -> 'linhas') x where (x ->> 'ordem')::int = 6) is not null
     or exists (select 1 from jsonb_array_elements(v -> 'so_no_sistema') s where s ->> 'lancamento_id' = l6::text)
     or (v #>> '{da_oc,qtde}')::int is distinct from 1 then raise exception 'C4 OC'; end if;
  -- C6
  if (select md5(string_agg(l::text, '' order by l.id)) from financeiro_lancamentos_v2 l where l.cliente_id = k) is distinct from v_md5 then
    raise exception 'C6 lancamento escrito'; end if;
  if not exists (select 1 from lr_sync_sessoes where id = s_id and cliente_id = k and status = 'comparada') then raise exception 'C6 sessao'; end if;
  -- C5
  perform set_config('request.jwt.claims', json_build_object('sub', '4b7e4456-113b-45d2-a00a-83b4d1c6380a', 'role', 'authenticated')::text, true);
  begin perform public.fn_lr_sync_comparar(k, gen_random_uuid(), v_linhas); exception when others then e := sqlstate; end;
  if e is distinct from '42501' then raise exception 'C5 outro cliente: %', coalesce(e, 'respondeu'); end if;
  perform set_config('request.jwt.claims', '{}', true); e := null;
  begin perform public.fn_lr_sync_comparar(k, gen_random_uuid(), v_linhas); exception when others then e := sqlstate; end;
  if e is distinct from '42501' then raise exception 'C5 sem usuario: %', coalesce(e, 'respondeu'); end if;

  raise exception 'OK FIN-LR-SYNC-01a: C1-C6 | resumo %', v -> 'resumo';
end $teste$;
ROLLBACK;
