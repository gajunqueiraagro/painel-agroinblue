-- CONC-LIGAR-FUTURO-01a — ligar o extrato ao lancamento de vencimento futuro. Sintetico no cliente Teste, admin simulado; termina em
-- RAISE 'OK' (desfaz tudo); `set constraints all immediate` dispara o gatilho adiado da baixa como o COMMIT faria.
--   F1 o caso Vivo: conta de OUTUBRO (recorrencia a confirmar) a partir do extrato de SETEMBRO — fora de `sistema_candidatos`, dentro de
--      `sistema_candidatos_adiantados` (adiantado), achada pela busca livre com o valor igual primeiro; ligada, vira realizado em 01/09
--   F2 a busca: por fornecedor (a busca unica), por valor com e sem pontuacao, por documento; so' o mesmo sinal; so' a mesma conta
--      ou sem conta; a ordem (valor igual > nome > vencimento mais perto)
--   F3 valor diferente: o 1:1 cru recusa o maior com frase; a confirmar aceita o valor do extrato; o valor certo pergunta (sem
--      gravar) — CONC-VALOR-CERTO-ACEITA-01; extrato menor divide
--   F4 guarda de cliente (42501) e anon sem EXECUTE
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.ext(p_valor numeric, p_data date) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  values (v, '43f32d07-dba8-4670-900c-bf645440c04a', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_data, p_valor,
          case when p_valor < 0 then 'debito' else 'credito' end, 'SINT-CLF01-' || v, 'SINT CLF01');
  return v;
end $f$;
-- lancamento sintetico: saida (p_valor > 0) na conta do teste, ou entrada; p_conta 'outra' = conta de outro banco do Teste; 'sem' = sem conta
create function pg_temp.lanc(p_valor numeric, p_venc date, p_desc text, p_forn uuid default null, p_doc text default null,
                             p_tipo text default '2-Saídas', p_conta text default 'teste') returns uuid language plpgsql as $f$
declare v uuid; c uuid := case p_conta when 'teste' then '131b8501-caf7-4964-b1b1-3f552ad2b75d'::uuid when 'sem' then null
  else (select b.id from public.financeiro_contas_bancarias b where b.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a'
          and b.nome_conta = 'SINT CLF01 outro banco' limit 1) end;
begin
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento,
    status_transacao, conta_bancaria_id, conta_destino_id, descricao, cenario, origem_lancamento, favorecido_id, numero_documento)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', p_tipo, p_valor,
          case when p_tipo like '1-%' then '1' else '-1' end, date_trunc('month', p_venc)::date, p_venc, 'programado',
          case when p_tipo like '1-%' then null else c end, case when p_tipo like '1-%' then c end,
          p_desc, 'realizado', 'manual', p_forn, p_doc)
  returning id into v;
  return v;
end $f$;
create function pg_temp.ids(p jsonb) returns uuid[] language sql as $f$
  select coalesce(array_agg((x->>'lancamento_id')::uuid order by o), '{}') from jsonb_array_elements(p->'itens') with ordinality t(x, o) $f$;

DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  rec uuid; rec_certa uuid; fo uuid; e uuid; l uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; l6 uuid; r jsonb; msg text; ok boolean; x record;
BEGIN
  -- F1 o caso Vivo
  insert into public.financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento,
    data_inicio, primeiro_vencimento, data_fim, ativo, tipo_valor)
  values (k, fz, 'SINT CLF01 vivo', cta, 'SINT', 473.66, 1, date '2026-09-01', date '2026-10-01', date '2027-08-31', true, 'estimado') returning id into rec;
  l := pg_temp.lanc(473.66, date '2026-10-01', 'SINT CLF01 Vivo Casa');
  update public.financeiro_lancamentos_v2 set recorrencia_id = rec, origem_lancamento = 'recorrencia' where id = l;
  e := pg_temp.ext(-473.66, date '2026-09-01');
  r := public.fn_extratos_espelhados(k, cta, '2026-09');
  if exists (select 1 from jsonb_array_elements(r->'sistema_candidatos') c where (c->>'lancamento_id')::uuid = l) then raise exception 'F1 o adiantado entrou no mes'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'sistema_candidatos_adiantados') c
                  where (c->>'lancamento_id')::uuid = l and (c->>'adiantado')::boolean) then raise exception 'F1 adiantado ausente'; end if;
  if r->>'versao' <> 'espelhados-06-adiantados' then raise exception 'F1 versao: %', r->>'versao'; end if;
  r := public.fn_conc_buscar_para_ligar(e, NULL, 200);
  if (pg_temp.ids(r))[1] is distinct from l then raise exception 'F1 o de valor igual nao veio primeiro: %', r->'itens'->0; end if;
  if (r->'itens'->0->>'origem') <> 'recorrencia' or (r->'itens'->0->>'a_confirmar')::boolean is not true or (r->'itens'->0->>'diferenca')::numeric <> 0
     or (r->'itens'->0->>'competencia') <> '2026-10-01' or (r->'itens'->0->>'dias_do_extrato')::int <> 30 then raise exception 'F1 campos: %', r->'itens'->0; end if;
  perform public.fn_vincular_extrato_lancamento(e, l, 473.66, false);
  set constraints all immediate; set constraints all deferred;
  select * into x from public.financeiro_lancamentos_v2 where id = l;
  if x.status_transacao <> 'realizado' or x.data_pagamento is distinct from date '2026-09-01' or x.data_competencia <> date '2026-10-01'
    then raise exception 'F1 ligado: % % %', x.status_transacao, x.data_pagamento, x.data_competencia; end if;

  -- F2 a busca (o Teste tem uma conta so': a segunda nasce aqui)
  insert into public.financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
  values (k, 'SINT CLF01 outro banco', 'SINT CLF01 outro banco', 'cc', true);
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT CLF01 Zebedeu Prestador', true) returning id into fo;
  l2 := pg_temp.lanc(1234.56, date '2027-02-10', 'SINT CLF01 servico', fo, '98.765-0');   -- futuro distante, fornecedor, documento com pontuacao (so' os digitos casam)
  l3 := pg_temp.lanc(1234.56, date '2026-09-20', 'SINT CLF01 outro', NULL, NULL, '2-Saídas', 'sem');  -- sem conta: entra
  l4 := pg_temp.lanc(1234.56, date '2026-09-20', 'SINT CLF01 outro banco', NULL, NULL, '2-Saídas', 'outra'); -- outra conta: fora
  l5 := pg_temp.lanc(1234.56, date '2026-09-20', 'SINT CLF01 entrada', NULL, NULL, '1-Entradas');    -- outro sinal: fora
  e := pg_temp.ext(-1234.56, date '2026-09-18');
  r := public.fn_conc_buscar_para_ligar(e, 'zebedeu', 50);
  if not (l2 = any (pg_temp.ids(r))) or (select (it->>'nome_casa')::boolean from jsonb_array_elements(r->'itens') it where (it->>'lancamento_id')::uuid = l2) is not true
    then raise exception 'F2 por fornecedor: %', r; end if;
  r := public.fn_conc_buscar_para_ligar(e, '1.234,56', 50);
  if not (l2 = any (pg_temp.ids(r)) and l3 = any (pg_temp.ids(r))) or l4 = any (pg_temp.ids(r)) or l5 = any (pg_temp.ids(r)) then raise exception 'F2 por valor 1.234,56: %', pg_temp.ids(r); end if;
  -- ordem: os dois tem o valor igual e nenhum casa nome; o vencimento mais perto (20/09, 2 dias) vem antes do de 10/02/2027
  if (pg_temp.ids(r))[1] is distinct from l3 then raise exception 'F2 ordem por vencimento: %', pg_temp.ids(r); end if;
  r := public.fn_conc_buscar_para_ligar(e, '1234.56', 50);
  if not (l2 = any (pg_temp.ids(r))) then raise exception 'F2 por valor 1234.56'; end if;
  r := public.fn_conc_buscar_para_ligar(e, 'R$ 1.234,56', 50);
  if not (l2 = any (pg_temp.ids(r))) then raise exception 'F2 por valor R$'; end if;
  r := public.fn_conc_buscar_para_ligar(e, '987650', 50);
  if not (l2 = any (pg_temp.ids(r))) or (select (it->>'documento_casa')::boolean from jsonb_array_elements(r->'itens') it where (it->>'lancamento_id')::uuid = l2) is not true
    then raise exception 'F2 por documento: %', r; end if;
  -- ordem: nome casando passa a frente do vencimento mais perto quando o valor nao e' igual
  l6 := pg_temp.lanc(999, date '2026-09-18', 'SINT CLF01 Zebedeu na descricao');
  e := pg_temp.ext(-50, date '2026-09-18');   -- antes, num comando proprio: a busca e' STABLE e nao ve o que nasce no mesmo comando
  r := public.fn_conc_buscar_para_ligar(e, 'zebedeu', 50);
  if (pg_temp.ids(r))[1] is distinct from l6 and (pg_temp.ids(r))[1] is distinct from l2 then raise exception 'F2 nome antes: %', pg_temp.ids(r); end if;

  -- F3 valor diferente
  msg := null;
  e := pg_temp.ext(-1500, date '2026-09-19');
  begin perform public.fn_vincular_extrato_lancamento(e, l6, 1500, false);
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'O extrato de R$ 1.500,00 é maior que o lançamento (R$ 999,00 em aberto). Para ligar, confirme o valor do extrato deste mês. Nada foi gravado.'
    then raise exception 'F3 maior certo: %', msg; end if;
  insert into public.financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento,
    data_inicio, primeiro_vencimento, data_fim, ativo, tipo_valor)
  values (k, fz, 'SINT CLF01 luz', cta, 'SINT', 200, 5, date '2026-09-01', date '2026-10-05', date '2027-08-31', true, 'estimado') returning id into rec;
  l := pg_temp.lanc(200, date '2026-10-05', 'SINT CLF01 luz');
  update public.financeiro_lancamentos_v2 set recorrencia_id = rec where id = l;
  e := pg_temp.ext(-231.40, date '2026-09-28');
  msg := null;
  begin perform public.fn_vincular_extrato_lancamento(e, l, 231.40, false); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'O extrato de R$ 231,40 é maior que o lançamento (R$ 200,00 em aberto). A recorrência é a confirmar: ligue aceitando o valor do extrato. Nada foi gravado.'
    then raise exception 'F3 maior a confirmar: %', msg; end if;
  perform public.fn_conc_ligar_com_valor_real(e, l, 'teste');
  set constraints all immediate; set constraints all deferred;
  if (select round(valor, 2) || '|' || status_transacao from public.financeiro_lancamentos_v2 where id = l) <> '231.40|realizado' then raise exception 'F3 a confirmar ligou'; end if;
  insert into public.financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento,
    data_inicio, primeiro_vencimento, data_fim, ativo, tipo_valor)
  values (k, fz, 'SINT CLF01 aluguel', cta, 'SINT', 300, 5, date '2026-09-01', date '2026-10-05', date '2027-08-31', true, 'exato') returning id into rec_certa;
  l := pg_temp.lanc(300, date '2026-10-05', 'SINT CLF01 aluguel');
  update public.financeiro_lancamentos_v2 set recorrencia_id = rec_certa where id = l;
  msg := null;
  e := pg_temp.ext(-320, date '2026-09-29');
  -- CONC-VALOR-CERTO-ACEITA-01: o valor certo com extrato maior nao recusa mais — pergunta (sem gravar) e so' grava com a confirmacao
  r := public.fn_conc_ligar_com_valor_real(e, l, 'teste');
  if (r->>'precisa_confirmar')::boolean is not true or (select round(abs(valor), 2) from public.financeiro_lancamentos_v2 where id = l) <> 300
    then raise exception 'F3 certo sem confirmacao: %', r; end if;
  e := pg_temp.ext(-250, date '2026-09-29');
  perform public.fn_vincular_extrato_lancamento(e, l, 250, false);
  set constraints all immediate; set constraints all deferred;
  if (select round(valor, 2) from public.financeiro_lancamentos_v2 where id = l) <> 250
     or (select round(valor, 2) from public.financeiro_lancamentos_v2 where saldo_de_id = l) <> 50 then raise exception 'F3 menor nao dividiu'; end if;

  -- F4 guarda e ACL
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  -- SEM texto: com texto a busca de fornecedor ja' recusaria por conta propria e a guarda desta funcao nao seria provada
  ok := false; begin perform public.fn_conc_buscar_para_ligar(e, NULL, 5); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'F4 busca sem tenant'; end if;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if has_function_privilege('anon', 'public.fn_conc_buscar_para_ligar(uuid, text, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_conc_ligar_com_valor_real(uuid, uuid, text, boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_conc_buscar_para_ligar(uuid, text, integer)', 'EXECUTE') then raise exception 'F4 ACL'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
