-- PLANO-SUGESTAO-01 B1 (118460) — teste. Roda como postgres DEPOIS da migration; termina em RAISE 'OK…'; nada fica no banco.
-- Fixture SINTÉTICA: notas/itens/lançamentos no cliente Teste (43f32d07) com emitentes fictícios; para o degrau b, 2 clientes sintéticos
-- criados aqui (somem no RAISE). Os 3 casos reais (T12) só são LIDOS.
-- T1 a0 vence a · T2 a: 2 notas iguais = alta; conta divergente = média · T3 a nota não é fonte de si · T4 a′ (80% sim, 75% não) ·
-- T5 b só conta padrão, só com 2 outros clientes; nada do outro cliente na saída · T6 c: prefixo mais longo vence; IE não achada = baixa ·
-- T7 nunca cruza tipo · T8 conta inativa fora · T9 gravar (prévia não grava) / desfazer com trilha; o lançado não muda · T10 o resolver dos
-- importadores ignora a regra de item · T11 authenticated de outro cliente = 42501 · T12 os 3 casos reais.
-- Mutações (a função volta conferida por md5): M1 sem "a nota não é fonte de si" → T3 · M2 sem o filtro de tipo → T7 ·
-- M3 b com 1 cliente → T5 · M4 resolver sem o D6 → T10.

do $fx$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cb constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  e constant text := '11444777000161';   -- emitente fictício
  e2 constant text := '11222333000181';  -- o "próprio cliente" (produtor sintético) — nota de venda
  x uuid := '955b666f-d101-4389-a942-1da3a96af358';  -- Alimentação e Cantina Agricultura
  z uuid := 'b4eaa2b6-3356-4ba4-9fdc-aa4de0736c69';  -- Manutenção Máquinas Agricultura
  w uuid := '017b19a5-5ed2-4868-b569-ce1c799499ad';  -- Fertilizantes Agricultura
  inat uuid; c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); f1 uuid; f2 uuid; v_seq int := 0;
  nt uuid; na uuid; nb uuid; nsem uuid; nvenda uuid;
begin
  -- a fazenda do Teste ganha uma IE sintética (o destinatário das notas-alvo)
  update public.fazenda_cadastros set ie = '999000111' where fazenda_id = fz;
  insert into public.financeiro_plano_contas (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo)
  values (k, '2-Saídas', 'Custeio Produção', 'Custo Fixo Agricultura', 'Manutenção Fazenda', 'SINT PS01 inativa', 'agricultura', false) returning id into inat;
  insert into public.fiscal_titulares (cliente_id, nome, documento, papel) values (k, 'SINT PS01 PRODUTOR', e2, 'produtor');
  insert into public.clientes (id, nome) values (c1, 'SINT PS01 C1'), (c2, 'SINT PS01 C2');
  insert into public.fazendas (cliente_id, nome, codigo, owner_id) values (c1, 'SINT F1', 'SPS1', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') returning id into f1;
  insert into public.fazendas (cliente_id, nome, codigo, owner_id) values (c2, 'SINT F2', 'SPS2', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') returning id into f2;

  create temp table _ps_ids (nome text primary key, id uuid) on commit drop;

  -- histórico: cria nota (+ itens) ligada a um lançamento de UMA conta
  create or replace function pg_temp.hist(p_cli uuid, p_faz uuid, p_conta uuid, p_emit text, p_itens text[][], p_plano uuid) returns uuid
  language plpgsql as $h$
  declare v_n uuid; v_l uuid; v_ch text := '8' || lpad((floor(random() * 1e15))::bigint::text || (floor(random() * 1e12))::bigint::text, 43, '0'); i int;
  begin
    insert into public.nota_fiscal (cliente_id, chave_acesso, origem, numero, emissao, emitente_documento, emitente_nome, totais, soma_cent, nota_cent, dest_ie)
    values (p_cli, left(v_ch, 44), 'xml', 'SPS', date '2026-10-01', p_emit, 'SINT EMITENTE', '{}', 100, 100, '999000111') returning id into v_n;
    for i in 1 .. array_length(p_itens, 1) loop
      insert into public.nota_fiscal_itens (nota_id, cliente_id, n_item, codigo, descricao, ncm, produto_cent, liquido_cent)
      values (v_n, p_cli, i, nullif(p_itens[i][1], ''), p_itens[i][2], nullif(p_itens[i][3], ''), 100, 100);
    end loop;
    if p_plano is not null then
      insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento,
        status_transacao, conta_bancaria_id, descricao, cenario, origem_lancamento, plano_conta_id)
      values (p_cli, p_faz, '2-Saídas', 1, '-1', date '2026-10-01', date '2026-10-10', 'programado', p_conta, 'SINT PS01', 'realizado', 'manual', p_plano)
      returning id into v_l;
      insert into public.financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, chave_acesso)
      values (p_cli, v_l, 'sint.xml', 'nf', 'SPS', left(v_ch, 44));
    end if;
    return v_n;
  end $h$;

  -- (a) P1 em 2 notas → X (alta); P2 em 1 nota → X e em outra → Z (média); Q1..Q4 → X; R1..R3 → X e R4 → Z; P8 → conta inativa
  perform pg_temp.hist(k, fz, cb, e, array[['P1', 'PRODUTO UM', ''], ['P2', 'PRODUTO DOIS', ''], ['Q1', 'Q UM', ''], ['Q2', 'Q DOIS', '']], x);
  perform pg_temp.hist(k, fz, cb, e, array[['P1', 'PRODUTO UM', ''], ['Q3', 'Q TRES', ''], ['Q4', 'Q QUATRO', ''], ['R1', 'R UM', '']], x);
  perform pg_temp.hist(k, fz, cb, e, array[['P2', 'PRODUTO DOIS', ''], ['R4', 'R QUATRO', '']], z);
  perform pg_temp.hist(k, fz, cb, e, array[['R2', 'R DOIS', ''], ['R3', 'R TRES', '']], x);
  perform pg_temp.hist(k, fz, cb, e, array[['P8', 'PRODUTO OITO', '']], inat);
  -- (b) PB em C1 e C2 → W (padrão); PB1 só em C1
  perform pg_temp.hist(c1, f1, null, e, array[['PB', 'PRODUTO B', ''], ['PB1', 'PRODUTO B UM', '']], w);
  perform pg_temp.hist(c2, f2, null, e, array[['PB', 'PRODUTO B', '']], w);

  -- notas-alvo
  nt := pg_temp.hist(k, fz, cb, e, array[['P1', 'PRODUTO UM', ''], ['P2', 'PRODUTO DOIS', ''], ['P3', 'PRODUTO TRES', '00000000'],
                                         ['PB', 'PRODUTO B', ''], ['PB1', 'PRODUTO B UM', ''], ['C6', 'DEFENSIVO SINT', '38089199'],
                                         ['P8', 'PRODUTO OITO', ''], ['R4', 'R QUATRO', '']], z);   -- ligada a um lançamento Z: P3 NÃO pode aprender dela mesma
  na := pg_temp.hist(k, fz, cb, e, array[['Q1', 'Q UM', ''], ['Q2', 'Q DOIS', ''], ['Q3', 'Q TRES', ''], ['Q4', 'Q QUATRO', ''], ['Q5', 'Q CINCO', '']], null);
  nb := pg_temp.hist(k, fz, cb, e, array[['R1', 'R UM', ''], ['R2', 'R DOIS', ''], ['R3', 'R TRES', ''], ['R4', 'R QUATRO', ''], ['R5', 'R CINCO', '']], null);
  nsem := pg_temp.hist(k, fz, cb, e, array[['C7', 'DEFENSIVO SINT 2', '38089199']], null);
  update public.nota_fiscal set dest_ie = '888777666' where id = nsem;   -- IE válida que não é de fazenda nenhuma
  nvenda := pg_temp.hist(k, fz, cb, e2, array[['P1', 'PRODUTO UM', ''], ['C8', 'DEFENSIVO SINT 3', '38089199']], null);

  insert into _ps_ids values ('nt', nt), ('na', na), ('nb', nb), ('nsem', nsem), ('nvenda', nvenda), ('c1', c1), ('c2', c2), ('x', x), ('z', z),
    ('w', w), ('inat', inat);
end $fx$;

-- as checagens que só leem (as mutações repetem esta)
create or replace function pg_temp.checa() returns text[] language plpgsql as $c$
declare
  f text[] := '{}'; j jsonb; it jsonb; v_x uuid; v_z uuid; v_w uuid; v_esc text; v_fc uuid;
  fn_item constant text := 'select e from jsonb_array_elements($1->''itens'') e where e->>''n_item'' = $2';
begin
  select id into v_x from _ps_ids where nome = 'x'; select id into v_z from _ps_ids where nome = 'z'; select id into v_w from _ps_ids where nome = 'w';
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  j := public.fn_nota_itens_sugerir_conta((select id from _ps_ids where nome = 'nt'));
  -- item 1 P1: a alta X (sem regra) ou a0 (com regra) — T1 confere à parte
  execute fn_item using j, '1' into it;
  if not exists (select 1 from public.financeiro_classificacao_regras where origem = 'item_da_nota' and ativo and cond_produto = 'P1')
     and (it->>'fonte' <> 'a' or it->>'confianca' <> 'alta' or (it->>'plano_conta_id')::uuid <> v_x) then f := f || ('T2 P1 ' || it::text); end if;
  execute fn_item using j, '2' into it;
  if it->>'fonte' <> 'a' or it->>'confianca' <> 'media' then f := f || ('T2 P2 ' || it::text); end if;
  execute fn_item using j, '3' into it;
  if it->>'fonte' <> 'sem_sugestao' or (it->>'pede_ia')::boolean is not true then f := f || ('T3 P3 ' || it::text); end if;
  execute fn_item using j, '4' into it;
  if it->>'fonte' <> 'b' or (it->>'plano_conta_id')::uuid <> v_w or it->>'confianca' <> 'media' then f := f || ('T5 PB ' || it::text); end if;
  execute fn_item using j, '5' into it;
  if it->>'fonte' = 'b' then f := f || ('T5 PB1 com 1 cliente ' || it::text); end if;
  if position((select id::text from _ps_ids where nome = 'c1') in j::text) > 0 or position((select id::text from _ps_ids where nome = 'c2') in j::text) > 0 then
    f := f || 'T5 a saída cita o outro cliente'::text;
  end if;
  v_esc := j->>'escopo';
  select plano_conta_id into v_fc from public.produto_familia_conta where familia = 'defensivo' and escopo_negocio = v_esc;
  execute fn_item using j, '6' into it;
  if j->>'escopo_fonte' <> 'fazenda' or it->>'fonte' <> 'c' or (it->>'plano_conta_id')::uuid is distinct from v_fc then f := f || ('T6 C6 ' || it::text); end if;
  execute fn_item using j, '7' into it;
  if it->>'fonte' <> 'sem_sugestao' then f := f || ('T8 P8 conta inativa ' || it::text); end if;

  -- T4 a′: 4 de 4 em X → Q5 segue; 3 de 4 (75%) → R5 não segue
  j := public.fn_nota_itens_sugerir_conta((select id from _ps_ids where nome = 'na'));
  execute fn_item using j, '5' into it;
  if it->>'fonte' <> 'a_nota' or (it->>'plano_conta_id')::uuid <> v_x then f := f || ('T4 Q5 ' || it::text); end if;
  j := public.fn_nota_itens_sugerir_conta((select id from _ps_ids where nome = 'nb'));
  execute fn_item using j, '5' into it;
  if it->>'fonte' <> 'sem_sugestao' then f := f || ('T4 R5 com 75% ' || it::text); end if;

  -- T6 IE não achada: atividade do cliente, baixa
  j := public.fn_nota_itens_sugerir_conta((select id from _ps_ids where nome = 'nsem'));
  execute fn_item using j, '1' into it;
  if j->>'escopo_fonte' <> 'cliente' or j->>'fazenda_id' is not null or (it->>'fonte' = 'c' and it->>'confianca' <> 'baixa') then
    f := f || ('T6 sem fazenda ' || j::text);
  end if;

  -- T7 nota emitida pelo próprio cliente = venda: nenhuma conta de saída serve
  j := public.fn_nota_itens_sugerir_conta((select id from _ps_ids where nome = 'nvenda'));
  if j->>'tipo_operacao' <> '1-Entradas' or exists (select 1 from jsonb_array_elements(j->'itens') e where e->>'fonte' <> 'sem_sugestao') then
    f := f || ('T7 ' || j::text);
  end if;

  -- T10 o resolver dos importadores não pega a regra de item (a regra 'P10' é criada no bloco de escrita)
  if exists (select 1 from public.financeiro_classificacao_regras where origem = 'item_da_nota' and ativo and cond_produto = 'P10') then
    j := public.fn_classificacao_resolver_contexto('43f32d07-dba8-4670-900c-bf645440c04a',
           jsonb_build_object('fornecedor', '11444777000161', 'produto', 'P10'), true);
    if j->>'tier' = 'regra' then f := f || ('T10 ' || j::text); end if;
  else
    f := f || 'T10 sem a regra P10'::text;
  end if;

  -- T12 os 3 casos reais (só leitura)
  j := public.fn_nota_itens_sugerir_conta('ea607372-327d-48cf-a9af-d18ac8ea0f52');
  if exists (select 1 from jsonb_array_elements(j->'itens') e where e->>'subcentro' is distinct from 'Defensivos Agrícolas Agricultura') then f := f || ('T12 210.486 ' || j::text); end if;
  j := public.fn_nota_itens_sugerir_conta('c5ef0962-ef89-442a-854c-44d9c9dc8b08');
  if exists (select 1 from jsonb_array_elements(j->'itens') e where e->>'subcentro' is distinct from 'Investimento em Implementos Agricultura') then f := f || ('T12 210.789 ' || j::text); end if;
  j := public.fn_nota_itens_sugerir_conta('391da438-1056-4993-84be-92bcf1bc056a');
  if jsonb_array_length(j->'itens') <> 49 or exists (select 1 from jsonb_array_elements(j->'itens') e where e->>'subcentro' is distinct from 'Alimentação e Cantina Pecuária') then
    f := f || ('T12 348.174 ' || left(j::text, 400)); end if;
  return f;
end $c$;

do $t$
declare
  f text[]; j jsonb; v_item uuid; v_regra uuid; v_n int; v_plano_antes uuid; v_def text; v_md5 text; v_estado text; v_fora uuid; v_nt uuid; m record; v_ok text := '';
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  -- a regra P10 para o T10 (gravada pela função, com motivo)
  perform pg_temp.hist('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
    '11444777000161', array[['P10', 'PRODUTO DEZ', '']], null);
  select i.id into v_item from public.nota_fiscal_itens i join public.nota_fiscal n on n.id = i.nota_id
   where n.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a' and i.codigo = 'P10' limit 1;
  perform public.fn_item_regra_gravar(v_item, (select id from _ps_ids where nome = 'z'), 'teste T10', false);

  f := pg_temp.checa();
  if cardinality(f) > 0 then raise exception 'FALHAS antes das escritas: %', f; end if;
  v_ok := 'T2–T8 T10 T12 ok; ';

  -- T9 + T1: prévia não grava; grava cria regra + trilha; a0 vence a; o lançado não muda; desfazer volta ao a
  select i.id into v_item from public.nota_fiscal_itens i where i.nota_id = (select id from _ps_ids where nome = 'nt') and i.n_item = 1;
  select l.plano_conta_id into v_plano_antes from public.financeiro_lancamentos_v2 l
    join public.financeiro_lancamento_documentos d on d.lancamento_id = l.id
    join public.nota_fiscal n on n.chave_acesso = d.chave_acesso where n.id = (select id from _ps_ids where nome = 'nt');
  select count(*) into v_n from public.financeiro_classificacao_regras where origem = 'item_da_nota';
  j := public.fn_item_regra_gravar(v_item, (select id from _ps_ids where nome = 'z'), 'teste T9');
  if j->>'acao' <> 'criar' or (select count(*) from public.financeiro_classificacao_regras where origem = 'item_da_nota') <> v_n then
    raise exception 'T9 a prévia gravou ou errou: %', j;
  end if;
  j := public.fn_item_regra_gravar(v_item, (select id from _ps_ids where nome = 'z'), 'teste T9', false);
  v_regra := (j->>'regra_id')::uuid;
  if not exists (select 1 from public.produto_classificacao_trilha where objeto = 'regra_item' and chave = v_regra::text and acao = 'criar') then
    raise exception 'T9 sem trilha';
  end if;
  j := public.fn_nota_itens_sugerir_conta((select id from _ps_ids where nome = 'nt'));
  if (select e->>'fonte' from jsonb_array_elements(j->'itens') e where e->>'n_item' = '1') <> 'a0'
     or (select (e->>'plano_conta_id')::uuid from jsonb_array_elements(j->'itens') e where e->>'n_item' = '1') <> (select id from _ps_ids where nome = 'z') then
    raise exception 'T1 a0 não venceu: %', j;
  end if;
  if (select l.plano_conta_id from public.financeiro_lancamentos_v2 l join public.financeiro_lancamento_documentos d on d.lancamento_id = l.id
       join public.nota_fiscal n on n.chave_acesso = d.chave_acesso where n.id = (select id from _ps_ids where nome = 'nt')) is distinct from v_plano_antes then
    raise exception 'T9 a regra mexeu no lançado';
  end if;
  begin perform public.fn_item_regra_gravar(v_item, (select id from _ps_ids where nome = 'inat'), 'teste', false); v_estado := 'gravou';
  exception when others then v_estado := sqlstate; end;
  if v_estado <> '22023' then raise exception 'T8 conta inativa aceita na regra: %', v_estado; end if;
  perform public.fn_item_regra_desfazer(v_regra, 'teste T9', false);
  if (select ativo from public.financeiro_classificacao_regras where id = v_regra)
     or not exists (select 1 from public.produto_classificacao_trilha where chave = v_regra::text and acao = 'desativar') then
    raise exception 'T9 desfazer';
  end if;
  begin update public.produto_classificacao_trilha set motivo = 'x' where chave = v_regra::text; v_estado := 'alterou';
  exception when others then v_estado := sqlstate; end;
  if v_estado <> '42501' then raise exception 'T9 a trilha se altera: %', v_estado; end if;
  f := pg_temp.checa();
  if cardinality(f) > 0 then raise exception 'FALHAS depois de desfazer: %', f; end if;
  v_ok := v_ok || 'T1 T9 ok; ';

  -- T11 authenticated de outro cliente = 42501 (e o admin global só pelo admin)
  select m2.user_id into v_fora from public.cliente_membros m2 where m2.ativo and m2.perfil <> 'admin_agroinblue'
     and m2.user_id not in (select user_id from public.cliente_membros where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a' or perfil = 'admin_agroinblue') limit 1;
  select id into v_nt from _ps_ids where nome = 'nt';
  perform set_config('request.jwt.claims', json_build_object('sub', v_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.fn_nota_itens_sugerir_conta(v_nt); v_estado := 'leu';
  exception when others then v_estado := sqlstate; end;
  if v_estado = '42501' then
    begin perform public.fn_produto_ncm_familia_gravar('9999', 'teste', true, 'teste', false); v_estado := 'gravou';
    exception when others then v_estado := 'g' || sqlstate; end;
  end if;
  execute 'reset role';
  if v_estado <> 'g42501' then raise exception 'T11 %', v_estado; end if;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  -- T6 prefixo mais longo vence (pelo gravador do admin)
  perform public.fn_produto_ncm_familia_gravar('380891', 'alimento', true, 'teste T6', false);
  j := public.fn_nota_itens_sugerir_conta((select id from _ps_ids where nome = 'nt'));
  if (select e->>'subcentro' from jsonb_array_elements(j->'itens') e where e->>'n_item' = '6') not like 'Alimentação e Cantina%' then
    raise exception 'T6 prefixo longo não venceu: %', j;
  end if;
  perform public.fn_produto_ncm_familia_gravar('380891', 'alimento', false, 'teste T6', false);
  v_ok := v_ok || 'T6b T11 ok; ';

  -- mutações: cada uma derruba o seu teste; a função volta conferida por md5
  for m in select * from (values
    ('M1', 'public.fn_nota_itens_sugerir_conta(uuid)', '     where hn.id <> n.id', '     where true', 'T3'),
    ('M2', 'public.fn_nota_itens_sugerir_conta(uuid)', 'pc.ativo and pc.tipo_operacao = v_tipo and', 'pc.ativo and', 'T7'),
    ('M3', 'public.fn_nota_itens_sugerir_conta(uuid)', 'having count(distinct h.cliente_id) >= 2', 'having count(distinct h.cliente_id) >= 1', 'T5'),
    ('M4', 'public.fn_classificacao_resolver_contexto(uuid,jsonb,boolean)', E'    AND r.origem IS DISTINCT FROM \'item_da_nota\'', E'    AND true', 'T10')
  ) x(nome, fn, de, para, alvo) loop
    v_def := pg_get_functiondef(m.fn::regprocedure); v_md5 := md5(v_def);
    if position(m.de in v_def) = 0 then raise exception '% âncora não achada', m.nome; end if;
    execute replace(v_def, m.de, m.para);
    f := pg_temp.checa();
    execute v_def;
    if md5(pg_get_functiondef(m.fn::regprocedure)) <> v_md5 then raise exception '% a função não voltou', m.nome; end if;
    if not exists (select 1 from unnest(f) u where u like m.alvo || ' %') then raise exception '% NÃO derrubou %: %', m.nome, m.alvo, f; end if;
    v_ok := v_ok || m.nome || '→' || m.alvo || ' ';
  end loop;

  raise exception 'OK PLANO-SUGESTAO-01: % (nada gravado)', v_ok;
end $t$;
