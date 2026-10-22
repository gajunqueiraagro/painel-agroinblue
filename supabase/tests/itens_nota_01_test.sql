-- ITENS-NOTA-01 — `fn_nota_fiscal_gravar` / `fn_nota_fiscal_operacao_abrir` / `fn_nota_fiscal_desfazer` (migrations 20261028110700 e 20261028110710). Roda como
-- `authenticated` com as claims de um admin, no cliente Teste, e TERMINA EM RAISE: nada fica no banco. Nota SINTETICA de 2 itens:
-- 100,00 - 10,00 + 5,00 + IPI 4,50 = 99,50 e 200,00 + seguro 2,00 + outras 3,00 + ST 12,00 = 217,00 -> nota 316,50.
-- T0 o catalogo (SECDEF; authenticated executa, anon nao; RLS ligada) · T1 simular nao grava · T2 grava: cabecalho, 2 itens, soma confere
-- T3 liquido que nao fecha: recusa com a frase · T4 a mesma chave pelo PDF NAO troca a do XML ('mantida_xml')
-- T5 a do PDF e' trocada pela do XML ('substituida') · T6 o backfill: a operacao abre, grava, e o desfazer tira so' as notas dela
-- Mutacao: tirar a conferencia do liquido derruba T3; tirar o "XML manda" derruba T4.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ch1 constant text := '50260911222333000424550010000999991000000010';
  ch2 constant text := '50260911222333000424550010000999981000000011';
  nota jsonb; itens jsonb; r jsonb; t text; op uuid; n int;
begin
  -- T0
  if not (select prosecdef from pg_proc where proname = 'fn_nota_fiscal_gravar') then raise exception 'T0 INVOKER'; end if;
  if has_function_privilege('anon', 'public.fn_nota_fiscal_gravar(uuid,jsonb,jsonb,boolean,uuid)', 'EXECUTE') then raise exception 'T0 anon executa'; end if;
  if not (select relrowsecurity from pg_class where relname = 'nota_fiscal_itens') then raise exception 'T0 sem RLS'; end if;

  nota := jsonb_build_object('chave_acesso', ch1, 'origem', 'xml', 'numero', '99999', 'serie', '1', 'emissao', '2026-09-29', 'natureza', 'VENDA SINTETICA',
    'regime', '3', 'emitente_documento', '11222333000424', 'emitente_nome', 'EMITENTE SINTETICO', 'xml_original', '<nfeProc/>',
    'totais', jsonb_build_object('produtos_cent', 30000, 'desconto_cent', 1000, 'frete_cent', 500, 'seguro_cent', 200, 'outras_cent', 300, 'ipi_cent', 450,
      'st_cent', 1200, 'nota_cent', 31650));
  itens := '[{"n_item":1,"descricao":"ITEM SINTETICO UM","ncm":"85381000","cfop":"5102","cst":"00","quantidade":"2.0000","unitario":"50.00","produto_cent":10000,
              "desconto_cent":1000,"frete_cent":500,"ipi":{"valorCent":450},"rastro":[{"lote":"L1"}],"liquido_cent":9950},
             {"n_item":2,"descricao":"ITEM SINTETICO DOIS","produto_cent":20000,"seguro_cent":200,"outras_cent":300,"icms_st":{"valorCent":1200},"liquido_cent":21700}]';

  -- T1
  r := public.fn_nota_fiscal_gravar(c_cli, nota, itens, true);
  if (r->>'acao') <> 'criada' or (r->>'nota_id') is not null or (r->>'confere')::boolean is not true then raise exception 'T1: %', r; end if;
  if exists (select 1 from nota_fiscal where cliente_id = c_cli and chave_acesso = ch1) then raise exception 'T1 simular gravou'; end if;

  -- T2
  r := public.fn_nota_fiscal_gravar(c_cli, nota, itens, false);
  select count(*) into n from nota_fiscal_itens where nota_id = (r->>'nota_id')::uuid;
  if n <> 2 or (select soma_confere from nota_fiscal where id = (r->>'nota_id')::uuid) is not true
     or (select xml_original from nota_fiscal where id = (r->>'nota_id')::uuid) <> '<nfeProc/>' then raise exception 'T2: % itens, %', n, r; end if;
  if (select liquido_cent from nota_fiscal_itens where nota_id = (r->>'nota_id')::uuid and n_item = 2) <> 21700 then raise exception 'T2 liquido'; end if;

  -- T3
  begin
    r := public.fn_nota_fiscal_gravar(c_cli, jsonb_set(nota, '{chave_acesso}', to_jsonb(ch2)), jsonb_set(itens, '{0,liquido_cent}', '9999'), false);
    t := 'PASSOU';
  exception when others then t := sqlstate || ' ' || sqlerrm; end;
  if t not like '22023 1 item(ns) com o líquido que não fecha%Nada foi gravado.' then raise exception 'T3: %', t; end if;

  -- T4
  r := public.fn_nota_fiscal_gravar(c_cli, jsonb_set(nota, '{origem}', '"pdf"'), itens, false);
  if (r->>'acao') <> 'mantida_xml' or (select origem from nota_fiscal where cliente_id = c_cli and chave_acesso = ch1) <> 'xml' then raise exception 'T4: %', r; end if;

  -- T5
  r := public.fn_nota_fiscal_gravar(c_cli, jsonb_set(jsonb_set(nota, '{chave_acesso}', to_jsonb(ch2)), '{origem}', '"pdf"'), itens, false);
  r := public.fn_nota_fiscal_gravar(c_cli, jsonb_set(nota, '{chave_acesso}', to_jsonb(ch2)), itens, false);
  if (r->>'acao') <> 'substituida' or (select origem from nota_fiscal where cliente_id = c_cli and chave_acesso = ch2) <> 'xml' then raise exception 'T5: %', r; end if;

  -- T6
  op := public.fn_nota_fiscal_operacao_abrir(c_cli, 'backfill', '{"notas":1}');
  r := public.fn_nota_fiscal_gravar(c_cli, jsonb_set(nota, '{chave_acesso}', '"50260911222333000424550010000999971000000012"'), itens, false, op);
  r := public.fn_nota_fiscal_desfazer(op, 'teste', false);
  if (r->>'notas')::int <> 1 or exists (select 1 from nota_fiscal where operacao_id = op)
     or not exists (select 1 from nota_fiscal where cliente_id = c_cli and chave_acesso = ch1) then raise exception 'T6: %', r; end if;

  raise exception 'OK itens_nota_01 (T0–T6)';
end $teste$;
rollback;
