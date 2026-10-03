-- PR-CONC-ENRIQ-IMPORT-ATOMICA-01 — testes e provas, numa transacao que TERMINA EM RAISE (nada fica gravado).
--
-- Roda DEPOIS da migration 20261027191400 (ou colado logo depois dela, na mesma transacao, para a prova de antes de
-- aplicar): `supabase db query --linked -f supabase/tests/conc_enriq_import_atomica_01_test.sql`.
-- ⚠ SO' SESSOES SINTETICAS (uuid novo, dentro da transacao). As do Gabriel so' sao LIDAS — a fonte das 470 linhas e' a
--   e6849efd (os excel_* dela viram o payload) — e as exclusoes da prova sao SIMULADAS (p_simular) ou desfeitas pelo RAISE.
--
-- S1 abrir e' idempotente (nao duplica nem zera) e recusa arquivo com outro numero de linhas.
-- S2 concluir com N < M fica 'incompleta' ("N de M"); com N = M fica 'completa'.
-- S3 REENVIO DE LOTE (prova obrigatoria): md5 do staging da sessao antes x depois de reenviar um lote que ja' entrou, com
--    uma linha EDITADA pelo operador (pela RPC de verdade), uma em BLOCO conferido e uma GRAVADA no lote. Tem de ser igual.
-- S4 excluir: 'ja_aplicado' herdado (aplicado = false) passa; gravacao ou bloco da sessao recusa com o motivo escrito; os
--    casamentos manuais sao contados (`resolvidos`) e nao impedem.
-- S5 backfill: uma linha por sessao do staging; as quatro do NJ incompletas com 470; o resto 'completa' com o carimbo
--    antigo (max(created_at)).
-- S6 a regra dos 10 minutos: 'importando' parada ha' 11 min le' 'incompleta'; com linha nova le' 'importando'.
-- P1 470 linhas com FALHA no lote 5: incompleta 400 de 470; retomar (abrir de novo + o lote 5); completa; staging final
--    identico (md5, sem ids) ao de uma importacao sem falha.
-- P2 excluir (simulado) 53ff65d5, 05f22626, eae81dda passa; 6d08260f recusa com "3 blocos e 1 gravação …".
set local lock_timeout = '3s';
set local statement_timeout = '180s';

do $t$
declare
  c_nj    constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_fonte constant uuid := 'e6849efd-0c50-4491-9953-526f9865e1c7';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_payload jsonb; v_s uuid; v_t uuid; v_r jsonb; v_n int; v_md5_a text; v_md5_b text; v_id1 uuid; v_id2 uuid; v_id3 uuid;
  v_out text := '';
begin
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- o payload: as 470 linhas da e6849efd, nas chaves que o populate le'
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'linha', s.excel_linha_origem, 'subcentro', s.excel_subcentro, 'fornecedor', s.excel_fornecedor,
           'produto', s.excel_produto, 'conta_origem', s.excel_conta_origem, 'conta_destino', s.excel_conta_destino,
           'ano_mes', s.excel_ano_mes, 'data', s.excel_data, 'valor', s.excel_valor, 'tipo_operacao', s.excel_tipo_operacao,
           'fazenda_codigo', s.excel_fazenda_codigo, 'observacao', s.excel_observacao, 'documento', s.excel_documento,
           'data_pagamento', s.excel_data_pagamento, 'data_vencimento', s.excel_data_vencimento, 'safra', s.excel_safra,
           'tipo_documento', s.excel_tipo_documento, 'forma_pagamento', s.excel_forma_pagamento, 'status', s.excel_status,
           'conta_origem_id', s.conta_origem_id, 'conta_destino_id', s.conta_destino_id)) order by s.excel_linha_origem)
    into v_payload
    from financeiro_classificacao_staging s where s.sessao_id = c_fonte;
  if jsonb_array_length(v_payload) <> 470 then raise exception 'fonte: % linhas, esperadas 470', jsonb_array_length(v_payload); end if;

  -- ─── S1 ───
  v_s := gen_random_uuid();
  v_r := fn_classificacao_sessao_abrir(v_s, c_nj, 470, 'teste.xlsx');
  v_r := fn_classificacao_sessao_abrir(v_s, c_nj, 470, 'teste.xlsx');
  select count(*) into v_n from classificacao_sessoes where id = v_s;
  if v_n <> 1 or (v_r->>'status') <> 'importando' or (v_r->>'linhas_esperadas')::int <> 470 then raise exception 'S1 falhou: %', v_r; end if;
  v_r := fn_classificacao_sessao_abrir(v_s, c_nj, 469, 'outro.xlsx');
  if (v_r->>'ok')::boolean or (v_r->>'motivo') <> 'arquivo_diferente' then raise exception 'S1 (arquivo diferente) falhou: %', v_r; end if;
  if (select linhas_esperadas from classificacao_sessoes where id = v_s) <> 470 then raise exception 'S1: abrir de novo mexeu no esperado'; end if;
  v_out := v_out || 'S1 ok; ';

  -- ─── P1 (e S2): a sem falha (T) e a com falha no lote 5 (S, a mesma sessao do S1) ───
  v_t := gen_random_uuid();
  perform fn_classificacao_sessao_abrir(v_t, c_nj, 470, 'teste.xlsx');
  for i in 0..4 loop
    perform fn_classificacao_populate_staging(v_t, c_nj,
      (select jsonb_agg(e order by o) from jsonb_array_elements(v_payload) with ordinality x(e, o) where o > i*100 and o <= (i+1)*100));
  end loop;
  v_r := fn_classificacao_sessao_concluir(v_t);
  if (v_r->>'status') <> 'completa' then raise exception 'P1: a sem falha nao ficou completa: %', v_r; end if;

  for i in 0..3 loop   -- o lote 5 "falha": nao e' enviado
    perform fn_classificacao_populate_staging(v_s, c_nj,
      (select jsonb_agg(e order by o) from jsonb_array_elements(v_payload) with ordinality x(e, o) where o > i*100 and o <= (i+1)*100));
  end loop;
  v_r := fn_classificacao_sessao_concluir(v_s);
  if (v_r->>'status') <> 'incompleta' or (v_r->>'linhas_recebidas')::int <> 400 or (v_r->>'mensagem') <> '400 de 470 linhas chegaram.' then
    raise exception 'S2/P1: concluir com 400 de 470 devolveu %', v_r;
  end if;
  if (select status from vw_classificacao_sessoes where sessao_id = v_s) <> 'incompleta' then raise exception 'P1: a view nao diz incompleta'; end if;
  v_out := v_out || 'S2 incompleta "400 de 470"; ';
  -- retomar: abrir de novo (a mesma sessao, o mesmo arquivo) e mandar SO' o lote que falhou
  v_r := fn_classificacao_sessao_abrir(v_s, c_nj, 470, 'teste.xlsx');
  if (v_r->>'status') <> 'importando' or (v_r->>'linhas_recebidas')::int <> 400 then raise exception 'P1: retomar devolveu %', v_r; end if;
  perform fn_classificacao_populate_staging(v_s, c_nj,
    (select jsonb_agg(e order by o) from jsonb_array_elements(v_payload) with ordinality x(e, o) where o > 400));
  v_r := fn_classificacao_sessao_concluir(v_s);
  if (v_r->>'status') <> 'completa' then raise exception 'P1: depois de retomar nao ficou completa: %', v_r; end if;
  select md5(string_agg((to_jsonb(x) - 'staging_id' - 'sessao_id')::text, '|' order by x.excel_linha_origem)) into v_md5_a
    from financeiro_classificacao_staging x where x.sessao_id = v_t;
  select md5(string_agg((to_jsonb(x) - 'staging_id' - 'sessao_id')::text, '|' order by x.excel_linha_origem)) into v_md5_b
    from financeiro_classificacao_staging x where x.sessao_id = v_s;
  if v_md5_a <> v_md5_b then raise exception 'P1 FALHOU: o staging retomado difere do sem falha (% x %)', v_md5_a, v_md5_b; end if;
  v_out := v_out || format('P1 retomada = sem falha (470 linhas, md5 %s); S2 completa; ', left(v_md5_a, 8));

  -- ─── S3: reenviar um lote que ja' entrou, com trabalho feito nele ───
  -- o lote 1 (linhas 1..100) da sessao S: uma EDITADA (pela RPC), uma em BLOCO, uma GRAVADA
  select staging_id into v_id1 from financeiro_classificacao_staging where sessao_id = v_s and match_status not in ('ja_aplicado')
   order by excel_linha_origem limit 1;
  select staging_id into v_id2 from financeiro_classificacao_staging where sessao_id = v_s and staging_id <> v_id1
     and excel_linha_origem <= 100 order by excel_linha_origem limit 1;
  select staging_id into v_id3 from financeiro_classificacao_staging where sessao_id = v_s and staging_id not in (v_id1, v_id2)
     and excel_linha_origem <= 100 order by excel_linha_origem limit 1;
  if (select excel_linha_origem from financeiro_classificacao_staging where staging_id = v_id1) > 100 then
    raise exception 'S3: a linha editada nao esta no lote 1';
  end if;
  v_r := fn_classificacao_editar_proposto(v_id1, jsonb_build_object('descricao', 'EDITADA PELO OPERADOR (S3)'));
  update financeiro_classificacao_staging set match_status = 'conferido_bloco', match_lancamento_id = null, match_lancamento_ids = array[gen_random_uuid()]
   where staging_id = v_id2;
  update financeiro_classificacao_staging set aplicado = true, aplicado_em = now(), aplicado_por = c_admin, match_status = 'ja_aplicado'
   where staging_id = v_id3;
  select md5(string_agg(to_jsonb(x)::text, '|' order by x.excel_linha_origem)) into v_md5_a
    from financeiro_classificacao_staging x where x.sessao_id = v_s;
  perform fn_classificacao_populate_staging(v_s, c_nj,
    (select jsonb_agg(e order by o) from jsonb_array_elements(v_payload) with ordinality x(e, o) where o <= 100));
  select md5(string_agg(to_jsonb(x)::text, '|' order by x.excel_linha_origem)) into v_md5_b
    from financeiro_classificacao_staging x where x.sessao_id = v_s;
  if v_md5_a <> v_md5_b then
    raise exception 'S3 FALHOU (PARE): reenviar o lote mudou o staging. Linhas diferentes: %',
      (select string_agg(excel_linha_origem::text, ',') from financeiro_classificacao_staging x where x.sessao_id = v_s);
  end if;
  select count(*) into v_n from financeiro_classificacao_staging where sessao_id = v_s;
  if v_n <> 470 then raise exception 'S3: o reenvio duplicou linhas (%)', v_n; end if;
  -- a busca prova que sabe achar: um toque numa linha so' TEM de mudar o md5 (depois volta)
  update financeiro_classificacao_staging set revisado_em = now() where staging_id = v_id1;
  if (select md5(string_agg(to_jsonb(x)::text, '|' order by x.excel_linha_origem)) from financeiro_classificacao_staging x
       where x.sessao_id = v_s) = v_md5_a then raise exception 'S3: o md5 nao viu uma mudanca de uma linha (prova invalida)'; end if;
  update financeiro_classificacao_staging set revisado_em = null where staging_id = v_id1;
  v_out := v_out || format('S3 reenvio do lote 1 com editada/bloco/gravada: staging identico (470 linhas, md5 %s); ', left(v_md5_a, 8));

  -- ─── S4: excluir ───
  update financeiro_classificacao_staging set match_status = 'ja_aplicado', aplicado = false   -- herdado, como o PASSO 0 deixa
   where sessao_id = v_t and excel_linha_origem <= 50;
  update financeiro_classificacao_staging set match_status = 'resolvido_manual'
   where sessao_id = v_t and excel_linha_origem between 51 and 52;
  v_r := fn_classificacao_excluir_sessao(v_t, true);
  if not (v_r->>'ok')::boolean or (v_r->>'resolvidos')::int <> 2 then raise exception 'S4 (herdado) falhou: %', v_r; end if;
  v_r := fn_classificacao_excluir_sessao(v_s, true);   -- a S tem 1 gravada e 1 linha em bloco (sem registro de bloco)
  if (v_r->>'ok')::boolean or (v_r->>'mensagem') <> '1 linha em bloco e 1 gravação feitos nesta importação — ela não pode ser excluída.' then
    raise exception 'S4 (gravada + bloco) falhou: %', v_r;
  end if;
  v_r := fn_classificacao_excluir_sessao(v_t, false);
  if not (v_r->>'ok')::boolean or (v_r->>'apagadas')::int <> 470
     or exists (select 1 from classificacao_sessoes where id = v_t) then raise exception 'S4 (excluir de verdade) falhou: %', v_r; end if;
  v_out := v_out || 'S4 herdado passa (2 casamentos contados), gravada+bloco recusa com o motivo, a sessao sai da tabela; ';

  -- ─── S5: backfill ───
  if (select count(*) from classificacao_sessoes where id not in (v_s)) <> (select count(distinct sessao_id) from financeiro_classificacao_staging where sessao_id <> v_s) then
    raise exception 'S5: sessoes na tabela <> sessoes no staging';
  end if;
  if (select count(*) from classificacao_sessoes where status = 'incompleta' and linhas_esperadas = 470 and cliente_id = c_nj) <> 4 then
    raise exception 'S5: as quatro incompletas do NJ nao estao';
  end if;
  if exists (select 1 from classificacao_sessoes c
              where c.id <> v_s and c.criado_em <> (select max(created_at) from financeiro_classificacao_staging x where x.sessao_id = c.id)) then
    raise exception 'S5: criado_em do legado difere do carimbo antigo';
  end if;
  v_out := v_out || format('S5 %s sessoes, 4 incompletas do NJ, carimbo antigo; ', (select count(*) from classificacao_sessoes) - 1);

  -- ─── S6: 10 minutos ───
  v_t := gen_random_uuid();
  insert into classificacao_sessoes (id, cliente_id, criado_em, linhas_esperadas, status) values (v_t, c_nj, now() - interval '11 minutes', 10, 'importando');
  if (select status from vw_classificacao_sessoes where sessao_id = v_t) <> 'incompleta' then raise exception 'S6: parada ha 11 min nao le incompleta'; end if;
  insert into financeiro_classificacao_staging (sessao_id, cliente_id, excel_linha_origem, match_status) values (v_t, c_nj, 1, 'sem_match');
  if (select status from vw_classificacao_sessoes where sessao_id = v_t) <> 'importando' then raise exception 'S6: com linha nova nao le importando'; end if;
  v_out := v_out || 'S6 10 minutos ok; ';

  -- ─── P2: as quatro do NJ (SIMULADO) ───
  for v_r in select fn_classificacao_excluir_sessao(id, true) || jsonb_build_object('id', left(id::text, 8))
               from unnest(array['53ff65d5-ac1c-4363-bd5f-01d6ff8533bc', '05f22626-46c4-473a-b0ce-2d3545081120',
                                 'eae81dda-5746-47bb-9e86-b4ec9cc36dc4', '6d08260f-d881-4019-a9ed-d9170f484007']::uuid[]) id loop
    v_out := v_out || format('P2 %s: %s; ', v_r->>'id', case when (v_r->>'ok')::boolean then 'passa (' || (v_r->>'linhas') || ' linhas, ' || (v_r->>'resolvidos') || ' casamentos)' else v_r->>'mensagem' end);
  end loop;

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
