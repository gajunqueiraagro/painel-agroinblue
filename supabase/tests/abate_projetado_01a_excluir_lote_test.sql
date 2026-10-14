-- ABATE-PROJETADO-01a — `oc_excluir_lote`: a simulacao e a gravacao dao o MESMO resultado; as partes (vivas e canceladas) e os
-- compromissos ja' cancelados do lote ficam com `lote_id` nulo e o evento guarda de qual lote vieram; o rol sai em pt-BR.
-- Sintetico no cliente Teste (OC e lote pelas RPCs reais; partes e compromissos do lote inseridos na propria transacao), numa
-- transacao revertida; termina em RAISE 'OK …'. Compara com `is distinct from`, nunca `<>`.
--   E1 lote com parte CANCELADA, parte viva e compromisso CANCELADO apontando para ele: a simulacao diz ok e a gravacao tambem
--      (era 23503); o rol da gravacao = o da simulacao; o lote some; partes e compromissos com `lote_id` nulo; o evento guarda
--      `lote_id`, `partes_soltas` (as duas, com `cancelada`) e `compromissos_soltos`
--   E2 o valor do rol em pt-BR: compromisso de 228.400,00 -> "R$ 228.400,00" (nunca "228,400.00"), na simulacao e na gravacao
--   E3 as guardas continuam: motivo vazio (P0001), versao velha (40001), lote com saida ativa (bloqueio na simulacao, P0001 na
--      gravacao), gestor de outro cliente (42501) — e nada gravado em nenhuma
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_admin constant text := '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}';
  c_gestor_nj constant text := '{"sub":"9200e0d0-095f-4ab8-a31a-3052a0faaf56","role":"authenticated"}';
  c_lote constant text := '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 36, "peso_medio_negociado_kg": 500,
                            "criterio_valor": "kg", "valor_informado": 10}]';
  v_forn uuid; fp jsonb; x jsonb; sim jsonb; v_ver int; v_ok text := ''; e jsonb; n int;
  o1 uuid; l1 uuid; pc uuid; pv uuid; cc uuid; cv uuid; o3 uuid; l3 uuid;
begin
  perform set_config('request.jwt.claims', c_admin, true);
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  fp := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10', 'tipo_operacao', 'venda');

  -- E1/E2 preparo: OC + lote; uma parte cancelada e uma viva, um compromisso cancelado e um aberto (228.400) no lote
  x := public.oc_salvar_rascunho(null, k, null, fp); o1 := (x->>'operacao_id')::uuid;
  select versao into v_ver from zoo_operacoes_comerciais where id = o1;
  x := public.oc_salvar_lotes(o1, k, v_ver, c_lote::jsonb);
  select id into l1 from zoo_operacao_lotes where operacao_id = o1;
  insert into zoo_operacao_partes (cliente_id, operacao_id, lote_id, natureza, componente, origem, valor, cancelada, cancelada_motivo)
  values (k, o1, l1, 'principal', 'principal', 'manual', 100, true, 'SINT cancelada') returning id into pc;
  insert into zoo_operacao_partes (cliente_id, operacao_id, lote_id, natureza, componente, origem, valor)
  values (k, o1, l1, 'obrigacao', 'frete', 'manual', 50) returning id into pv;
  insert into zoo_operacao_compromissos (cliente_id, operacao_id, lote_id, natureza, componente, valor_total, status, descricao)
  values (k, o1, l1, 'obrigacao', 'frete', 10, 'cancelado', 'SINT cancelado') returning id into cc;
  insert into zoo_operacao_compromissos (cliente_id, operacao_id, lote_id, natureza, componente, valor_total, status, descricao)
  values (k, o1, l1, 'principal', 'principal', 228400, 'aberto', 'SINT Abate 036 N') returning id into cv;

  -- E1 simulacao e gravacao
  sim := public.oc_excluir_lote(o1, k, 0, l1, '', true);
  if (sim->>'ok')::boolean is distinct from true then raise exception 'E1 simulacao: %', sim; end if;
  select versao into v_ver from zoo_operacoes_comerciais where id = o1;
  x := public.oc_excluir_lote(o1, k, v_ver, l1, 'SINT motivo', false);
  if (x->>'ok')::boolean is distinct from true then raise exception 'E1 gravacao: %', x; end if;
  if (x->'rol') is distinct from (sim->'rol') then raise exception 'E1 rol: simulacao % x gravacao %', sim->'rol', x->'rol'; end if;
  if exists (select 1 from zoo_operacao_lotes where id = l1) then raise exception 'E1 o lote ficou'; end if;
  if exists (select 1 from zoo_operacao_partes where id in (pc, pv) and lote_id is not null)
     or (select count(*) from zoo_operacao_partes where id in (pc, pv)) is distinct from 2::bigint then
    raise exception 'E1 partes: lote_id nao foi solto (ou a parte sumiu)'; end if;
  if exists (select 1 from zoo_operacao_compromissos where id in (cc, cv) and lote_id is not null) then
    raise exception 'E1 compromissos: lote_id nao foi solto'; end if;
  if (select cancelada from zoo_operacao_partes where id = pv) is distinct from false then
    raise exception 'E1 a parte viva mudou de estado'; end if;
  select ev.detalhes into e from zoo_operacao_eventos ev where ev.operacao_id = o1 and ev.acao = 'excluir_lote';
  if e is null or (e->>'lote_id')::uuid is distinct from l1
     or jsonb_array_length(e->'partes_soltas') is distinct from 2
     or not (e->'partes_soltas' @> jsonb_build_array(jsonb_build_object('parte_id', pc, 'cancelada', true)))
     or not (e->'partes_soltas' @> jsonb_build_array(jsonb_build_object('parte_id', pv, 'cancelada', false)))
     or (e->'compromissos_soltos') is distinct from jsonb_build_array(cc) then
    raise exception 'E1 evento: %', e; end if;
  v_ok := v_ok || 'E1 ok; ';

  -- E2 o rol em pt-BR
  select count(*) into n from jsonb_array_elements(x->'rol') r where r->>'descricao' like '%R$ 228.400,00%';
  if n is distinct from 1::bigint then raise exception 'E2 rol sem "R$ 228.400,00": %', x->'rol'; end if;
  if (x->'rol')::text like '%228,400.00%' then raise exception 'E2 rol ainda em en: %', x->'rol'; end if;
  v_ok := v_ok || 'E2 ok; ';

  -- E3 guardas: motivo vazio, versao velha, saida ativa, gestor de outro cliente
  x := public.oc_salvar_rascunho(null, k, null, fp); o3 := (x->>'operacao_id')::uuid;
  select versao into v_ver from zoo_operacoes_comerciais where id = o3;
  x := public.oc_salvar_lotes(o3, k, v_ver, c_lote::jsonb);
  select id into l3 from zoo_operacao_lotes where operacao_id = o3;
  select versao into v_ver from zoo_operacoes_comerciais where id = o3;
  begin
    perform public.oc_excluir_lote(o3, k, v_ver, l3, '  ', false);
    raise exception 'E3 motivo vazio nao foi recusado';
  exception when sqlstate 'P0001' then
    if sqlerrm is distinct from 'Excluir lote exige motivo' then raise; end if;
  end;
  begin
    perform public.oc_excluir_lote(o3, k, v_ver - 1, l3, 'SINT', false);
    raise exception 'E3 versao velha nao foi recusada';
  exception when sqlstate '40001' then null;
  end;
  perform public.oc_registrar_movimentacao(o3, k, l3, '2031-04-11', 'vacas', 36, 500, null, 'SINT E3');
  sim := public.oc_excluir_lote(o3, k, 0, l3, '', true);
  if (sim->>'ok')::boolean is distinct from false
     or not exists (select 1 from jsonb_array_elements(sim->'bloqueios') b where b->>'tipo' = 'saida_ativa') then
    raise exception 'E3 simulacao com saida ativa: %', sim; end if;
  select versao into v_ver from zoo_operacoes_comerciais where id = o3;
  begin
    perform public.oc_excluir_lote(o3, k, v_ver, l3, 'SINT', false);
    raise exception 'E3 saida ativa nao foi recusada na gravacao';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%tem saida ativa%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', c_gestor_nj, true);
  begin
    perform public.oc_excluir_lote(o3, k, v_ver, l3, 'SINT', true);
    raise exception 'E3 gestor de outro cliente nao foi recusado';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', c_admin, true);
  if not exists (select 1 from zoo_operacao_lotes where id = l3)
     or exists (select 1 from zoo_operacao_eventos ev where ev.operacao_id = o3 and ev.acao = 'excluir_lote') then
    raise exception 'E3 alguma recusa gravou'; end if;
  v_ok := v_ok || 'E3 ok; ';

  raise exception 'OK abate_projetado_01a_excluir_lote (%)', v_ok;
end $teste$;
ROLLBACK;
