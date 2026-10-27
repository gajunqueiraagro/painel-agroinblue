-- P134 — GERADO por `node scripts/gerar-teste-busca-sem-acento.mjs` a partir de `src/lib/texto/busca.casos.json`
-- (a lista UNICA de casos; a mesma roda contra a funcao da tela no vitest). NAO EDITAR A MAO: mude o arquivo de casos e gere de novo.
-- Sintetico no cliente Teste; roda como `authenticated` (claims de um usuario real); termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '60s';
set local lock_timeout = '3s';
-- P136: um lancamento cuja descricao tem so os 2 primeiros itens, e a nota dele com 5 itens (o 5o com acento).
DO $p$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_chave constant text := '35310112345678000199550010000001341000001349';
  v_faz uuid; v_plano uuid; v_lanc uuid; v_nota uuid;
BEGIN
  select id into v_faz from fazendas where cliente_id = k order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'
     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id)
    values (k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-03-10', date '2031-03-10', 'realizado',
            'SINT P136 Arame liso, Grampo · 5 itens', v_plano) returning id into v_lanc;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id)
    values (k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-03-11', date '2031-03-11', 'realizado',
            'SINT P134 Manutenção Máquinas Pecuária', v_plano);
  insert into nota_fiscal (cliente_id, chave_acesso, origem, totais, soma_cent, nota_cent) values (k, v_chave, 'xml', '{}'::jsonb, 500, 500)
    returning id into v_nota;
  insert into nota_fiscal_itens (nota_id, cliente_id, n_item, descricao, produto_cent, liquido_cent) values
    (v_nota, k, 1, 'Arame liso', 100, 100), (v_nota, k, 2, 'Grampo', 100, 100), (v_nota, k, 3, 'Prego', 100, 100),
    (v_nota, k, 4, 'Dobradiça', 100, 100), (v_nota, k, 5, 'Mangueira Atóxica Reforçada', 100, 100);
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, chave_acesso)
    values (k, v_lanc, 'SINT P136.xml', 'nf', v_chave);
  perform set_config('p134.lanc', v_lanc::text, true);
END $p$;
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  b constant jsonb := '{"dimensao":"financeira","modo_sem_caixa":"mostrar","anos":[2031],"meses":[3]}';
  r jsonb; n int;
BEGIN
  -- NORMALIZACAO (a mesma regra dos dois lados)
  if coalesce(public._fn_normalizar_texto('Máquinas'), '') is distinct from 'maquinas' then raise exception 'N1 normalizacao de %: %', 'Máquinas', public._fn_normalizar_texto('Máquinas'); end if;
  if coalesce(public._fn_normalizar_texto('MANUTENÇÃO  Máquinas   Pecuária '), '') is distinct from 'manutencao maquinas pecuaria' then raise exception 'N2 normalizacao de %: %', 'MANUTENÇÃO  Máquinas   Pecuária ', public._fn_normalizar_texto('MANUTENÇÃO  Máquinas   Pecuária '); end if;
  if coalesce(public._fn_normalizar_texto('Açúcar'), '') is distinct from 'acucar' then raise exception 'N3 normalizacao de %: %', 'Açúcar', public._fn_normalizar_texto('Açúcar'); end if;
  if coalesce(public._fn_normalizar_texto('JOÃO'), '') is distinct from 'joao' then raise exception 'N4 normalizacao de %: %', 'JOÃO', public._fn_normalizar_texto('JOÃO'); end if;
  if coalesce(public._fn_normalizar_texto('Ação Ñandu Ü Ç'), '') is distinct from 'acao nandu u c' then raise exception 'N5 normalizacao de %: %', 'Ação Ñandu Ü Ç', public._fn_normalizar_texto('Ação Ñandu Ü Ç'); end if;
  if coalesce(public._fn_normalizar_texto(''), '') is distinct from '' then raise exception 'N6 normalizacao de %: %', '', public._fn_normalizar_texto(''); end if;
  if coalesce(public._fn_normalizar_texto('   '), '') is distinct from '' then raise exception 'N7 normalizacao de %: %', '   ', public._fn_normalizar_texto('   '); end if;
  -- CASA (o termo dentro do texto, os dois normalizados; % e _ nunca sao curinga)
  if public.fn_texto_casa('Máquinas', 'maq') is distinct from true then raise exception 'C1 % em %: esperado true', 'maq', 'Máquinas'; end if;
  if public.fn_texto_casa('Manutenção Máquinas Pecuária', 'maq') is distinct from true then raise exception 'C2 % em %: esperado true', 'maq', 'Manutenção Máquinas Pecuária'; end if;
  if public.fn_texto_casa('Manutenção', 'manutencao') is distinct from true then raise exception 'C3 % em %: esperado true', 'manutencao', 'Manutenção'; end if;
  if public.fn_texto_casa('Açúcar Cristal', 'acucar') is distinct from true then raise exception 'C4 % em %: esperado true', 'acucar', 'Açúcar Cristal'; end if;
  if public.fn_texto_casa('João da Silva', 'JOAO') is distinct from true then raise exception 'C5 % em %: esperado true', 'JOAO', 'João da Silva'; end if;
  if public.fn_texto_casa('joao da silva', 'João') is distinct from true then raise exception 'C6 % em %: esperado true', 'João', 'joao da silva'; end if;
  if public.fn_texto_casa('Café com Leite', 'CAFÉ') is distinct from true then raise exception 'C7 % em %: esperado true', 'CAFÉ', 'Café com Leite'; end if;
  if public.fn_texto_casa('Manutenção Máquinas Pecuária', 'maquinas pec') is distinct from true then raise exception 'C8 % em %: esperado true', 'maquinas pec', 'Manutenção Máquinas Pecuária'; end if;
  if public.fn_texto_casa('Manutenção Máquinas Pecuária', 'maq manut') is distinct from false then raise exception 'C9 % em %: esperado false', 'maq manut', 'Manutenção Máquinas Pecuária'; end if;
  if public.fn_texto_casa('Máquinas', 'maquinário') is distinct from false then raise exception 'C10 % em %: esperado false', 'maquinário', 'Máquinas'; end if;
  if public.fn_texto_casa('Desconto 50% à vista', '50%') is distinct from true then raise exception 'C11 % em %: esperado true', '50%', 'Desconto 50% à vista'; end if;
  if public.fn_texto_casa('Desconto à vista', '%') is distinct from false then raise exception 'C12 % em %: esperado false', '%', 'Desconto à vista'; end if;
  if public.fn_texto_casa('Parafuso_sextavado', 'o_s') is distinct from true then raise exception 'C13 % em %: esperado true', 'o_s', 'Parafuso_sextavado'; end if;
  if public.fn_texto_casa('Parafuso sextavado', 'o_s') is distinct from false then raise exception 'C14 % em %: esperado false', 'o_s', 'Parafuso sextavado'; end if;
  if public.fn_texto_casa('Qualquer texto', '') is distinct from true then raise exception 'C15 % em %: esperado true', '', 'Qualquer texto'; end if;
  if public.fn_texto_casa('', 'a') is distinct from false then raise exception 'C16 % em %: esperado false', 'a', ''; end if;
  -- P136: o filtro Produto da lista acha o lancamento pelo 5o item da nota (sem acento: "mangueira atoxica")
  r := public.fn_fin_v2_lista_pagina(k, b || '{"produto":"mangueira atoxica"}'::jsonb, '{}'::jsonb, 0, 100);
  if (r->>'total_linhas')::int <> 1 or (r->'linhas'->0->>'id') is distinct from current_setting('p134.lanc') then
    raise exception 'P136 o 5o item da nota nao achou o lancamento: total %', r->>'total_linhas'; end if;
  -- P134: a descricao sem acento (o termo digitado sem acento acha "Manutenção Máquinas"; com acento tambem)
  r := public.fn_fin_v2_lista_pagina(k, b || '{"produto":"manutencao maq"}'::jsonb, '{}'::jsonb, 0, 100);
  if (r->>'total_linhas')::int <> 1 then raise exception 'P134 manutencao maq: total %', r->>'total_linhas'; end if;
  r := public.fn_fin_v2_lista_pagina(k, b || '{"produto":"MÁQUINAS PECUÁRIA"}'::jsonb, '{}'::jsonb, 0, 100);
  if (r->>'total_linhas')::int <> 1 then raise exception 'P134 MAQUINAS PECUARIA com acento: total %', r->>'total_linhas'; end if;
  -- as sugestoes do campo Produto do lancamento (ProdutoAutocomplete)
  select count(*) into n from public.fn_lancamento_descricoes_buscar(k, 'maquinas pecuaria', 30) x where x like 'SINT P134 %';
  if n <> 1 then raise exception 'P134 sugestoes do Produto: %', n; end if;
  RAISE EXCEPTION 'OK';
END $t$;
