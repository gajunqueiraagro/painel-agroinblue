-- FOLHA-REGUA-01 · limpeza (Gabriel 26/11: "as 20 de uma vez") — lote 118860. DADO DE CLIENTE, com prévia aprovada:
-- folha-20261126-0915-ATUACAO-REPETIDAS-PREVIA.md. Tira as 20 vigências da atuação que REPETEM a anterior do mesmo funcionário (mesmas
-- fazendas, atividades e %): Vera 3 · NJ 17 (11 da carga de 18/11, 9 da tela em 25/11). O rateio de mês nenhum muda — a anterior, igual,
-- continua valendo; desde o 118760 o gravador já recusa criar uma assim.
-- ⚠ NADA SE PERDE: cada linha vai INTEIRA para a folha_trilha antes de sair (acao 'limpar_repetida', antes = a linha, via
--   'code6:FOLHA-REGUA-01'); desfazer = reinserir a partir da trilha. Nenhum lançamento, salário ou documento é tocado.
-- ⚠ GUARDADO: só roda se as 20 linhas (ids fixos) ainda existem E ainda repetem a anterior; senão nada muda e diz qual.
do $limpa$
declare
  ids constant uuid[] := array[
    '048ab254-178a-452e-968a-754b145506e4', '0d839779-e36c-46b3-815f-3826654426c4', '0d8cb350-037c-469c-bcb6-9be196d5b8d8', '2ced1aa4-b092-4a0f-9acb-c609d05cdaeb',
    '3a27179e-6bf1-44fa-a9df-321d9b6f89e3', '3c2f78cf-b8dc-4fe5-9835-dde65110a015', '49ed7077-96ba-4dc3-b1c6-a71a89ae69fb', '5e344268-8018-4ca4-a3dd-15d1b181f0bd',
    '6cff7164-5a85-4087-a35e-19dff8e851ed', '79453761-caf2-49ec-8744-8defee60a8ee', '886b3adb-906c-4808-afc2-3186db54f117', 'a917c18c-1cb2-4739-aaca-f750aa9f5535',
    'aae53f34-0edc-4aba-a759-7acc1aec00a0', 'af452551-55d6-4e72-9a6e-19b90e4a2726', 'b0607a7f-5871-4a6b-b02c-4a9c67e8b500', 'c4a00825-603c-4a51-a237-c020695a74c7',
    'c78f96a2-5114-42fb-bf10-749743bdf2cb', 'c84b452b-73fc-4a7b-a888-1d18e1e4e2d9', 'cbe5db73-ca0a-4e2c-a4df-b9e901db26e9', 'd292aa55-accf-4299-be44-17883f09dd32']::uuid[];
  v_repetidas uuid[]; v_fora uuid[]; r record; v_n int;
begin
  perform set_config('app.via', 'code6:FOLHA-REGUA-01', true);
  -- as linhas que HOJE repetem a vigência anterior (a mesma conta da prévia)
  with s as (select funcionario_id, desde, array_agg(id) ids_v,
                    string_agg(fazenda_id::text || '|' || atividade || '|' || round(pct, 2)::text, ';' order by fazenda_id, atividade, pct) sig
               from public.folha_funcionario_atuacao group by 1, 2),
       o as (select *, lag(sig) over (partition by funcionario_id order by desde) ant from s)
  select coalesce(array_agg(i), '{}') into v_repetidas from o, unnest(o.ids_v) i where o.sig = o.ant;
  select coalesce(array_agg(x), '{}') into v_fora from unnest(ids) x where x <> all (v_repetidas);
  if cardinality(v_fora) > 0 then
    raise exception 'FOLHA-REGUA-01 limpeza: % das 20 não existem mais ou não repetem mais a anterior (%) — reler a prévia', cardinality(v_fora), v_fora;
  end if;
  if cardinality(v_repetidas) <> 20 then
    raise exception 'FOLHA-REGUA-01 limpeza: hoje há % repetidas (a prévia tinha 20) — reler a prévia', cardinality(v_repetidas);
  end if;
  for r in select a.* from public.folha_funcionario_atuacao a where a.id = any (ids) order by a.cliente_id, a.funcionario_id, a.desde loop
    perform public._fn_folha_trilha(r.cliente_id, 'folha_funcionario_atuacao', r.funcionario_id, 'limpar_repetida', to_jsonb(r), null,
      'vigência igual à anterior (mesmas fazendas, atividades e %): FOLHA-REGUA-01, prévia aprovada em 26/11');
  end loop;
  delete from public.folha_funcionario_atuacao where id = any (ids);
  get diagnostics v_n = row_count;
  if v_n <> 20 then raise exception 'FOLHA-REGUA-01 limpeza: tirou % linhas (esperava 20) — nada fica', v_n; end if;
end $limpa$;
