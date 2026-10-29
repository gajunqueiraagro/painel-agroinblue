-- P167 — as três regras da migration 20261028113060. Fixture SINTETICA no cliente Teste, no molde do NJ: DUAS compras do mesmo fornecedor
-- (compra A e compra B, 3 × 100,00 cada, mesma descrição); a NF 5550 é da compra B e já está anexada à B1 SEM chave (o PDF antigo).
-- Roda como `authenticated` (admin) e TERMINA EM RAISE.
-- T1 `fn_nota_ja_lancada`: a B1 "tem esta nota" pelo emitente + nº (sem chave) e devolve o documento; a A1 não
-- T2 `fn_nota_completar` com A1 + B1 (duas compras): a prévia recusa com a frase; gravar levanta 22023
-- T3 `fin_documento_registrar` da mesma NF, PDF de novo, na B2 (mesma compra): 23505 com o id da que existe
-- T4 a mesma NF em XML (o par PDF + XML): registra · T5 sem o tipo do arquivo (quem não manda): registra como sempre
-- Mutação: desfazer cada patch derruba o teste dele (T1, T2, T3).
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; pl uuid; cb uuid; fo uuid; fa uuid; fb uuid; ids uuid[] := '{}'; doc uuid; i int; x uuid;
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  select id into cb from public.financeiro_contas_bancarias where cliente_id = c_cli order by id limit 1;
  if faz is null or pl is null or cb is null then raise exception 'fixture: o Teste precisa de fazenda, conta do plano e conta bancária'; end if;
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Suplementos Sinteticos de Teste Ltda', '40.000.000/0001-07', true) returning id into fo;
  insert into public.financiamentos (cliente_id, valor_total, total_parcelas) values (c_cli, 300, 3) returning id into fa;
  insert into public.financiamentos (cliente_id, valor_total, total_parcelas) values (c_cli, 300, 3) returning id into fb;
  for i in 1..6 loop
    insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
        status_transacao, cenario, cancelado, plano_conta_id, favorecido_id, numero_documento, conta_bancaria_id, financiamento_id)
    values (c_cli, faz, '-1', '2-Saídas', 100, 'Adensado sintetico', case when i <= 3 then '2031-08-19'::date else '2031-09-03'::date end,
            case when i <= 3 then ('2031-09-18'::date + ((i - 1) * 30)) else ('2031-10-10'::date + ((i - 4) * 30)) end,
            'programado', 'realizado', false, pl, fo, case when i <= 3 then '4440' else '5550' end, cb, case when i <= 3 then fa else fb end)
    returning id into x;
    ids := ids || x;
  end loop;
  insert into public.financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, tipo, especie, numero, emitente_id, valor_documento)
  values (c_cli, ids[4], 'nf 5550', 'application/pdf', 'nf', '5550', fo, 300) returning id into doc;
  perform set_config('teste.ids', array_to_string(ids, ','), true);
  perform set_config('teste.doc', doc::text, true);
  perform set_config('teste.fo', fo::text, true);
end $fx$;

set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  doc uuid := current_setting('teste.doc')::uuid; fo uuid := current_setting('teste.fo')::uuid;
  r jsonb; ea jsonb; eb jsonb; t text; det text;
begin
  -- T1 a busca: a B1 tem a nota (sem chave: pelo emitente + nº) e o id do documento; a A1 não
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2031-10-10","valor_cent":10000},{"n":2,"vencimento":"2031-11-09","valor_cent":10000},{"n":3,"vencimento":"2031-12-09","valor_cent":10000}]'::jsonb,
    '5550', null, '40000000000107', array['Suplementos Sinteticos de Teste Ltda'], null);
  select e into eb from jsonb_array_elements(r) e where (e->>'id')::uuid = ids[4];
  select e into ea from jsonb_array_elements(r) e where (e->>'id')::uuid = ids[1];
  if eb is null then raise exception 'fixture: a busca não achou a B1 (%)', jsonb_array_length(r); end if;
  if (eb->>'tem_esta_nota')::boolean is not true or (eb->>'nota_documento_id')::uuid is distinct from doc then raise exception 'T1 B1: %', eb; end if;
  if ea is not null and ((ea->>'tem_esta_nota')::boolean or (ea->>'nota_documento_id') is not null) then raise exception 'T1 A1: %', ea; end if;
  -- T2 duas compras no mesmo pedido: recusa
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', ids[1], 'numero_documento', '000.005.550'),
    jsonb_build_object('id', ids[4], 'numero_documento', '000.005.550')), false, null, true);
  if (r->>'ok')::boolean or not exists (select 1 from jsonb_array_elements(r->'recusas') x where x->>'frase' like '%compras diferentes%') then raise exception 'T2 simular: %', r; end if;
  begin
    r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', ids[1], 'numero_documento', '000.005.550'),
      jsonb_build_object('id', ids[4], 'numero_documento', '000.005.550')), false, null, false); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '22023' then raise exception 'T2 gravar: %', t; end if;
  -- T3 a mesma NF, PDF de novo, na B2 (mesma compra): recusa com o id da que existe
  begin
    r := public.fin_documento_registrar(ids[5], c_cli, jsonb_build_object('especie', 'nf', 'numero', '000.005.550', 'emitente_id', fo, 'tipo_arquivo', 'application/pdf'));
    t := 'PASSOU';
  exception when others then
    t := sqlstate; get stacked diagnostics det = pg_exception_detail;
  end;
  if t <> '23505' or det is distinct from doc::text then raise exception 'T3: % %', t, det; end if;
  -- T4 o XML da mesma nota (o par PDF + XML): registra
  r := public.fin_documento_registrar(ids[5], c_cli, jsonb_build_object('especie', 'nf', 'numero', '000.005.550', 'emitente_id', fo, 'tipo_arquivo', 'application/xml'));
  if not (r->>'ok')::boolean then raise exception 'T4: %', r; end if;
  -- T5 sem o tipo do arquivo (quem não manda): registra como sempre
  r := public.fin_documento_registrar(ids[6], c_cli, jsonb_build_object('especie', 'nf', 'numero', '000.005.550', 'emitente_id', fo));
  if not (r->>'ok')::boolean then raise exception 'T5: %', r; end if;
  raise exception 'OK p167_nota_uma_compra (T1–T5)';
end $teste$;
rollback;
