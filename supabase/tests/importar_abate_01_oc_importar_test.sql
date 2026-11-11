-- IMPORTAR-ABATE-01 · F1 — oc_importar_abate (migration 20261028117510; depende da 117500).
-- Sintetico no cliente Teste com os NUMEROS do lote 6 (gabarito 5d255b74) e chaves sinteticas; o G1 so' LE^ a OC real (a D1 nao cria).
-- Numa transacao revertida; termina em RAISE 'OK …'.
--   I1 previa: o resumo da OC = o do pacote, nasce fechada, e nada fica (nenhuma OC nova no cliente)
--   I2 grava: o mesmo resumo; entregas pelo bruto (171.094,49); SENAR 342,19 em 2 deducoes; recebimento 170.752,30; 5 documentos; trilha;
--      e e' A MESMA OC do gabarito (resumo igual ao da 5d255b74, retencao somada, fora a data)
--   I3 D1: o mesmo pacote de novo -> ja_existe, nada_muda, nenhuma OC nova
--   I4 D1 com o preco do lote 2 diferente -> nada_muda falso, a diferenca diz "lote 2 · preco_arroba"
--   I5 recusas: liquidos <> recebimento; sem acesso ao cliente (42501)
--   G1 o lote 6 real (NJ): a D1 acha a 5d255b74; antes da reclassificacao do SENAR a unica diferenca e' SENAR x Funrural dos 2 lotes
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_forn uuid; p jsonb; p2 jsonb; x jsonb; n0 int; t text; v_op uuid; g jsonb; v_gab uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  create function pg_temp.pacote(cli_faz uuid, cli_forn uuid, d date, chave text, chave_nfp text) returns jsonb language sql as $$
    select jsonb_build_object('fazenda_id', cli_faz, 'contraparte_id', cli_forn, 'data_abate', d, 'categoria', 'vacas', 'peso_vivo_medio_kg', 518.59,
      'observacoes', 'lote 6 · OP 47597 · importado do frigorifico', 'chave_nf', chave,
      'lotes', jsonb_build_array(
        jsonb_build_object('ordem', 1, 'cab', 26, 'peso_carcaca_kg', 7051.50, 'preco_arroba', 351.4464, 'valor_liquido', 164884.52, 'senar', 330.43, 'observacao', '10537'),
        jsonb_build_object('ordem', 2, 'cab', 1, 'peso_carcaca_kg', 234.50, 'preco_arroba', 376.09, 'valor_liquido', 5867.78, 'senar', 11.76, 'observacao', '10537 · 4 dentes')),
      'recebimento', jsonb_build_object('valor', 170752.30, 'vencimento', '2026-10-27', 'documento', '9019', 'observacao', 'NPR 9019/A · venc. 27/10/2026'),
      'documentos', jsonb_build_array(
        jsonb_build_object('especie', 'nf_principal', 'numero', '9019', 'serie', '2', 'chave_acesso', chave, 'data_emissao', d,
          'emitente_id', cli_forn, 'emitente_nome', 'Fortunceres S.A. - Minerva', 'emitente_documento', '52.168.923/0002-31',
          'cab', 27, 'peso_kg', 7286, 'data_abate', d,
          'dados', jsonb_build_object('nfs_produtor', jsonb_build_array(jsonb_build_object('numero', '9475371', 'data', d - 2, 'valor', 108783.54)), 'nfs_produtor_valor', 108783.54),
          'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 171094.49, 'ordem', 1),
                                           jsonb_build_object('tipo', 'senar', 'natureza', 'retencao_sem_caixa', 'valor', 342.19, 'ordem', 2))),
        jsonb_build_object('especie', 'nf_produtor', 'numero', '9475371', 'serie', '890', 'chave_acesso', chave_nfp, 'data_emissao', d - 2,
          'emitente_nome', 'PRODUTOR TESTE', 'emitente_documento', '000.000.001-91', 'cab', 27,
          'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'informativo', 'valor', 108783.54, 'ordem', 1))),
        jsonb_build_object('especie', 'npr', 'numero', '9019 / A', 'vencimento', '2026-10-27',
          'dados', jsonb_build_object('nf_referida', jsonb_build_object('numero', '9019')),
          'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 170752.30, 'ordem', 1))),
        jsonb_build_object('especie', 'acerto', 'data_abate', d, 'cab', 27, 'peso_kg', 7286, 'vencimento', '2026-10-27',
          'dados', jsonb_build_object('ordem_compra', '10537', 'lote_frigorifico', '6'),
          'componentes', jsonb_build_array(jsonb_build_object('tipo', 'valor_bruto', 'natureza', 'acrescimo', 'valor', 171094.49, 'ordem', 1),
                                           jsonb_build_object('tipo', 'retencao_acerto', 'natureza', 'retencao_sem_caixa', 'valor', 342.19, 'ordem', 2))),
        jsonb_build_object('especie', 'romaneio', 'data_abate', d, 'cab', 27, 'peso_kg', 7286,
          'dados', jsonb_build_object('op', '47597', 'ordem_compra', '10537', 'lote_frigorifico', '6'))))
  $$;
  -- a retencao somada (SENAR + Funrural) por lote, sem a data: para comparar com o gabarito antes da reclassificacao
  create function pg_temp.sem_ret(j jsonb) returns jsonb language sql as $$
    select (j - 'data') || jsonb_build_object('lotes', (select jsonb_agg((l - 'senar' - 'funrural')
             || jsonb_build_object('retencao', (l->>'senar')::numeric + (l->>'funrural')::numeric) order by (l->>'ordem')::int)
             from jsonb_array_elements(j->'lotes') l))
  $$;
  p := pg_temp.pacote(f, v_forn, '2031-05-10', '50261052168923000231550020000090191123456789', '50261002935843000105558900094753711123456783');

  -- I1 previa
  select count(*) into n0 from zoo_operacoes_comerciais where cliente_id = k;
  x := public.oc_importar_abate(k, p, true);
  if (x->>'simulado')::boolean is not true or (x->>'ja_existe')::boolean or x->'resumo' is distinct from x->'pacote' or x->>'status_comercial' <> 'fechada' then
    raise exception 'I1 previa: %', x; end if;
  if (select count(*) from zoo_operacoes_comerciais where cliente_id = k) <> n0 then raise exception 'I1 a previa deixou OC'; end if;

  -- I2 grava
  x := public.oc_importar_abate(k, p, false);
  v_op := (x->>'operacao_id')::uuid;
  if v_op is null or x->'resumo' is distinct from x->'pacote' or x->>'status_comercial' <> 'fechada' then raise exception 'I2: %', x; end if;
  if (select sum(valor) from zoo_operacao_partes where operacao_id = v_op and not cancelada and componente = 'entrega') is distinct from 171094.49
     or (select sum(valor) from zoo_operacao_partes where operacao_id = v_op and not cancelada and componente = 'senar') is distinct from 342.19
     or (select count(*) from zoo_operacao_partes where operacao_id = v_op and not cancelada and componente = 'senar') <> 2
     or exists (select 1 from zoo_operacao_partes where operacao_id = v_op and not cancelada and componente = 'funrural')
     or (select sum(valor) from zoo_operacao_partes where operacao_id = v_op and not cancelada and componente = 'recebimento') is distinct from 170752.30
     or (select count(*) from zoo_operacao_documentos where operacao_id = v_op and not cancelado) <> 5
     or not exists (select 1 from zoo_operacao_eventos where operacao_id = v_op and acao = 'importar_abate') then
    raise exception 'I2 partes/documentos/trilha'; end if;
  select id into v_gab from zoo_operacoes_comerciais where id::text like '5d255b74%';
  if pg_temp.sem_ret(x->'resumo') is distinct from pg_temp.sem_ret(public._oc_importar_resumo_da_oc(v_gab)) then
    raise exception 'I2 nao e'' a OC do gabarito: % x %', pg_temp.sem_ret(x->'resumo'), pg_temp.sem_ret(public._oc_importar_resumo_da_oc(v_gab)); end if;

  -- I3 D1: o mesmo pacote
  select count(*) into n0 from zoo_operacoes_comerciais where cliente_id = k;
  x := public.oc_importar_abate(k, p, false);
  if not (x->>'ja_existe')::boolean or not (x->>'nada_muda')::boolean or (x->>'operacao_id')::uuid <> v_op then raise exception 'I3 D1: %', x; end if;
  if (select count(*) from zoo_operacoes_comerciais where cliente_id = k) <> n0 then raise exception 'I3 a D1 criou OC'; end if;

  -- I4 D1 com diferenca
  p2 := jsonb_set(p, '{lotes,1,preco_arroba}', '380');
  x := public.oc_importar_abate(k, p2, true);
  if (x->>'nada_muda')::boolean or not exists (select 1 from jsonb_array_elements(x->'diferencas') e where e->>'campo' = 'lote 2 · preco_arroba') then
    raise exception 'I4 D1 com diferenca: %', x; end if;

  -- I5 recusas
  t := null; begin x := public.oc_importar_abate(k, jsonb_set(p, '{recebimento,valor}', '170752.31'), true); exception when others then t := sqlerrm; end;
  if t is null or t not like '%nao e'' o recebimento%' then raise exception 'I5a: %', t; end if;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  t := null; begin x := public.oc_importar_abate(k, p, true); exception when others then t := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if t is null or t not like '42501 Importar o abate: sem acesso%' then raise exception 'I5b: %', t; end if;

  -- G1 o lote 6 real: so' leitura (a D1 devolve antes de criar)
  g := public.oc_importar_abate((select cliente_id from zoo_operacoes_comerciais where id = v_gab),
         pg_temp.pacote((select fazenda_id from zoo_operacoes_comerciais where id = v_gab), (select contraparte_id from zoo_operacoes_comerciais where id = v_gab),
                        '2026-10-23', '50261052168923000231550020000090191000440612', '50261002935843000105558900094753711451300674'), true);
  if not (g->>'ja_existe')::boolean or (g->>'operacao_id')::uuid <> v_gab then raise exception 'G1 a D1 nao achou a 5d255b74: %', g; end if;
  if (g->>'nada_muda')::boolean then
    null;  -- depois da reclassificacao do SENAR: nada muda
  elsif (select array_agg(e->>'campo' order by e->>'campo') from jsonb_array_elements(g->'diferencas') e)
        is distinct from array['lote 1 · funrural', 'lote 1 · senar', 'lote 2 · funrural', 'lote 2 · senar'] then
    raise exception 'G1 diferencas alem do SENAR x Funrural: %', g->'diferencas'; end if;

  raise exception 'OK IMPORTAR-ABATE-01 F1 · I1–I5 + G1 (G1 nada_muda=%)', g->>'nada_muda';
end $teste$;
ROLLBACK;
