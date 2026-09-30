-- OC-CC-VOLTA-01b — prova do ajuste de preco em todos os lotes (rateio por kg), nos dois sentidos, com volta pelo snapshot;
-- do desconto rateado pelas entregas; das entregas por kg; do salvar lotes que ressincroniza (migration 20261027183000).
-- Roda em ROLLBACK: termina em RAISE 'OK ...' e nada fica gravado. Qualquer outra mensagem e' falha.
-- Cobre, com dado real do proto:
--   A. NJ af334f9c (3 lotes de novilhas, 132.010/56.330/29.670 kg, 1.015.000,00; recebido 2.550.000,00):
--      A1 simulacao -> previa 1.544.082,84 / 658.875,74 / 347.041,42 e nada gravado;
--      A2 "todos" sobe 1.535.000 -> lotes e entregas na tabela, cada entrega na sua data, saldo e falta zero, recebimentos intactos;
--      A3 desfazer -> lotes, criterio, lancamentos do rebanho e entregas de volta (1.015.000,00);
--      A4 lote 2 editado depois do ajuste -> desfazer RECUSA dizendo "lote 2" e o valor;
--      A5 um lote so', BAIXA 10.990,20 -> lote 1 em 600.000,00; desfazer volta a 610.990,20.
--   B. desconto de 1.000,00 na af334f9c -> 3 titulos, um por entrega, por kg (605,53 / 258,38 / 136,09 — o de maior peso leva o centavo), cada um na data da
--      saida; uma explicacao so' no dialogo; desfazer cancela o grupo.
--   C. Santa Rita 858acb08 (1 lote, 160.000,00, saida de 32 cab x 400 kg em 16/06/2026, safra 25/26). Nenhuma OC real tem um lote
--      com duas saidas, e todo mes de saida candidato esta' com o P1 fechado — a saida de junho nao se edita. Montado NA TRANSACAO:
--      o lote passa a 44 cab e ganha uma SEGUNDA saida de 12 cab x 420 kg em 10/07/2026 (P1 pendente, safra 26/27) ->
--      114.798,21 + 45.201,79 por kg (12.800 e 5.040 kg); ajuste de +1.000,00 dividido pelas duas entregas (115.515,70 +
--      45.484,30), cada uma na sua data e safra; desconto de 100,00 rateado pelas duas (71,75 + 28,25).
--   D. b74cfd38: salvar os lotes como estao ressincroniza a entrega para 66.500,00.
do $do$
declare
  c_af uuid := 'af334f9c-491d-4701-b3d8-27d9ccf57ce2';
  c_sr uuid := '858acb08-0e5b-42c0-b15f-1fc86e12c048'; c_sr_saida uuid := '9fcd9237-9e7f-4966-a3c9-1a4703afa887';
  c_b7 uuid := 'b74cfd38-749a-4778-b6c2-02ca48fb361d';
  r jsonb; cc jsonb; ev jsonb; ver int; parte uuid; msg text; receb_antes jsonb; receb_depois jsonb; lotes text; entregas text;
  nova uuid; n int; v numeric; cli uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e','role','authenticated')::text, true);

  -- os recebimentos da af334f9c, para provar que nada os toca
  select jsonb_agg(to_jsonb(f) - 'updated_at' - 'updated_by' order by f.id) into receb_antes
    from zoo_operacao_partes pt join financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id
   where pt.operacao_id = c_af and pt.componente = 'recebimento' and pt.cancelada = false;
  if jsonb_array_length(receb_antes) <> 4 then raise exception 'P0 af334f9c devia ter 4 recebimentos (%)', jsonb_array_length(receb_antes); end if;

  -- A1) simulacao: a previa sai da propria RPC e nada fica gravado
  select versao into ver from zoo_operacoes_comerciais where id = c_af;
  r := oc_explicar_saldo(c_af, ver, 'ajuste_preco', -1535000, null, null, 'teste 01b', null, true);
  select string_agg(e->>'total', ' / ' order by (e->>'ordem')::int) into lotes from jsonb_array_elements(r->'previa'->'lotes_depois') e;
  if lotes <> '1544082.84 / 658875.74 / 347041.42' then raise exception 'A1 previa dos lotes: %', lotes; end if;
  if (r->'previa'->>'total_novo')::numeric <> 2550000 or r->'previa'->>'criterio' <> 'todos_por_kg' then raise exception 'A1 previa: %', r->'previa'; end if;
  select string_agg(e->>'valor', ' / ' order by e->>'data') into entregas from jsonb_array_elements(r->'previa'->'entregas_depois') e;
  if entregas <> '1544082.84 / 658875.74 / 347041.42' then raise exception 'A1 previa das entregas: %', entregas; end if;
  if (select sum((_oc_valor_do_lote(id)->>'total')::numeric) from zoo_operacao_lotes where operacao_id = c_af) <> 1015000
     or (select versao from zoo_operacoes_comerciais where id = c_af) <> ver then raise exception 'A1 a simulacao gravou'; end if;

  -- A2) "todos", sobe 1.535.000
  r := oc_explicar_saldo(c_af, ver, 'ajuste_preco', -1535000, null, null, 'teste 01b', null, false);
  parte := (r->>'parte_id')::uuid;
  select string_agg((_oc_valor_do_lote(id)->>'total'), ' / ' order by ordem) into lotes from zoo_operacao_lotes where operacao_id = c_af;
  if lotes <> '1544082.84 / 658875.74 / 347041.42' then raise exception 'A2 lotes: %', lotes; end if;
  select string_agg(format('%s=%s', e->>'data', e->>'valor'), ' / ' order by e->>'data') into entregas from jsonb_array_elements(_oc_entregas_snapshot(c_af)) e;
  if entregas <> '2021-04-06=1544082.84 / 2021-04-21=658875.74 / 2021-06-02=347041.42' then raise exception 'A2 entregas: %', entregas; end if;
  cc := oc_conta_corrente(c_af);
  if (cc->>'saldo')::numeric <> 0 or (cc->>'falta_explicar')::numeric <> 0 or (cc->>'entregue')::numeric <> 2550000 then
    raise exception 'A2 conta corrente: saldo %, falta %, entregue %', cc->>'saldo', cc->>'falta_explicar', cc->>'entregue'; end if;
  if round(2550000 / 218010.0, 2) <> 11.70 then raise exception 'A2 R$/kg'; end if;
  select detalhes into ev from zoo_operacao_eventos where operacao_id = c_af and acao = 'explicar_saldo' and detalhes->>'parte_id' = parte::text;
  if jsonb_array_length(ev->'snapshot_antes'->'lotes') <> 3 or ev->>'criterio' <> 'todos_por_kg'
     or jsonb_array_length(ev->'snapshot_antes'->'entregas') <> 3 then raise exception 'A2 evento sem snapshot: %', ev; end if;
  select jsonb_agg(to_jsonb(f) - 'updated_at' - 'updated_by' order by f.id) into receb_depois
    from zoo_operacao_partes pt join financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id
   where pt.operacao_id = c_af and pt.componente = 'recebimento' and pt.cancelada = false;
  if receb_depois is distinct from receb_antes then raise exception 'A2 recebimentos mudaram'; end if;

  -- A3) desfazer restaura o snapshot
  select versao into ver from zoo_operacoes_comerciais where id = c_af;
  r := oc_desfazer_explicacao(c_af, ver, parte, 'teste 01b', false);
  select string_agg(format('%s:%s:%s', criterio_valor, valor_informado, _oc_valor_do_lote(id)->>'total'), ' / ' order by ordem) into lotes
    from zoo_operacao_lotes where operacao_id = c_af;
  if lotes <> 'total:610990.20:610990.20 / total:260715.69:260715.69 / total:143294.11:143294.11' then raise exception 'A3 lotes: %', lotes; end if;
  select string_agg(format('%s=%s', e->>'data', e->>'valor'), ' / ' order by e->>'data') into entregas from jsonb_array_elements(_oc_entregas_snapshot(c_af)) e;
  if entregas <> '2021-04-06=610990.20 / 2021-04-21=260715.69 / 2021-06-02=143294.11' then raise exception 'A3 entregas: %', entregas; end if;
  select detalhes into ev from zoo_operacao_eventos where operacao_id = c_af and acao = 'desfazer_explicacao' and detalhes->>'parte_id' = parte::text;
  if (ev->>'restaurou_snapshot')::boolean is not true then raise exception 'A3 evento: %', ev; end if;
  -- os lancamentos do rebanho voltam ao valor exato de antes
  select detalhes into ev from zoo_operacao_eventos where operacao_id = c_af and acao = 'explicar_saldo' and detalhes->>'parte_id' = parte::text;
  if exists (select 1 from jsonb_array_elements(ev->'snapshot_antes'->'lancamentos') s join lancamentos l on l.id = (s->>'id')::uuid
              where l.valor_total is distinct from (s->>'valor_total')::numeric) then raise exception 'A3 lancamentos do rebanho'; end if;

  -- A4) lote 2 mudado depois do ajuste: desfazer recusa dizendo qual e o que mudou
  select versao into ver from zoo_operacoes_comerciais where id = c_af;
  r := oc_explicar_saldo(c_af, ver, 'ajuste_preco', -1535000, null, null, 'teste 01b', null, false);
  parte := (r->>'parte_id')::uuid;
  update zoo_operacao_lotes set valor_informado = 700000 where operacao_id = c_af and ordem = 2;
  select versao into ver from zoo_operacoes_comerciais where id = c_af;
  begin
    r := oc_desfazer_explicacao(c_af, ver, parte, 'teste 01b', false);
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  if msg is null or msg not like '%lote 2 (valor 658.875,74 → 700.000,00)%' then raise exception 'A4 recusa: %', coalesce(msg, 'desfez'); end if;
  if msg like '%lote 1%' or msg like '%lote 3%' then raise exception 'A4 recusa citou lote que nao mudou: %', msg; end if;
  update zoo_operacao_lotes set valor_informado = 658875.74 where operacao_id = c_af and ordem = 2;
  select versao into ver from zoo_operacoes_comerciais where id = c_af;
  r := oc_desfazer_explicacao(c_af, ver, parte, 'teste 01b', false);

  -- A5) um lote so', BAIXA
  select versao into ver from zoo_operacoes_comerciais where id = c_af;
  r := oc_explicar_saldo(c_af, ver, 'ajuste_preco', 10990.20, (select id from zoo_operacao_lotes where operacao_id = c_af and ordem = 1),
                         null, 'teste 01b', null, false);
  parte := (r->>'parte_id')::uuid;
  if (select (_oc_valor_do_lote(id)->>'total')::numeric from zoo_operacao_lotes where operacao_id = c_af and ordem = 1) <> 600000
     or (select natureza from zoo_operacao_partes where id = parte) <> 'deducao' then raise exception 'A5 baixa'; end if;
  select versao into ver from zoo_operacoes_comerciais where id = c_af;
  r := oc_desfazer_explicacao(c_af, ver, parte, 'teste 01b', false);
  if (select (_oc_valor_do_lote(id)->>'total')::numeric from zoo_operacao_lotes where operacao_id = c_af and ordem = 1) <> 610990.20 then
    raise exception 'A5 desfazer'; end if;

  -- B) desconto de 1.000,00: um titulo por entrega, por kg, na data da saida
  select versao into ver from zoo_operacoes_comerciais where id = c_af;
  r := oc_explicar_saldo(c_af, ver, 'desconto_comercial', 1000, null, null, 'teste 01b', null, false);
  parte := (r->>'parte_id')::uuid;
  select string_agg(format('%s=%s', f.data_competencia, f.valor), ' / ' order by f.data_competencia) into entregas
    from zoo_operacao_partes pt join financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id
   where pt.operacao_id = c_af and pt.componente = 'desconto_comercial' and pt.cancelada = false;
  if entregas <> '2021-04-06=605.53 / 2021-04-21=258.38 / 2021-06-02=136.09' then raise exception 'B desconto: %', entregas; end if;
  cc := oc_conta_corrente(c_af);
  if (select count(*) from jsonb_array_elements(cc->'explicacoes') e where e->>'tipo' = 'desconto_comercial') <> 1
     or (select (e->>'valor')::numeric from jsonb_array_elements(cc->'explicacoes') e where e->>'tipo' = 'desconto_comercial') <> 1000
     or (select count(*) from jsonb_array_elements(cc->'linhas') e where e->>'subtipo' = 'desconto_comercial') <> 3 then
    raise exception 'B conta corrente: %', cc->'explicacoes'; end if;
  select versao into ver from zoo_operacoes_comerciais where id = c_af;
  r := oc_desfazer_explicacao(c_af, ver, parte, 'teste 01b', false);
  if exists (select 1 from zoo_operacao_partes pt where pt.operacao_id = c_af and pt.componente = 'desconto_comercial' and pt.cancelada = false)
     or exists (select 1 from zoo_operacao_partes pt join financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id
                 where pt.operacao_id = c_af and pt.componente = 'desconto_comercial' and f.cancelado is not true) then
    raise exception 'B desfazer deixou parte do grupo viva'; end if;
  select jsonb_agg(to_jsonb(f) - 'updated_at' - 'updated_by' order by f.id) into receb_depois
    from zoo_operacao_partes pt join financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id
   where pt.operacao_id = c_af and pt.componente = 'recebimento' and pt.cancelada = false;
  if receb_depois is distinct from receb_antes then raise exception 'B recebimentos mudaram'; end if;

  -- C) um lote, duas saidas em safras diferentes (montado na transacao: a saida de junho fica como esta', P1 fechado)
  select cliente_id into cli from zoo_operacoes_comerciais where id = c_sr;
  update zoo_operacao_lotes set qtd_negociada = 44, criterio_valor = 'total', valor_informado = 160000 where operacao_id = c_sr;
  nova := gen_random_uuid();
  insert into lancamentos select * from jsonb_populate_record(null::lancamentos,
    (select to_jsonb(l) from lancamentos l where l.id = c_sr_saida)
      || jsonb_build_object('id', nova, 'data', '2026-07-10', 'quantidade', 12, 'peso_medio_kg', 420));
  insert into zoo_operacao_movimentacoes (cliente_id, operacao_id, movimentacao_id, operacao_lote_id, origem)
  select cliente_id, operacao_id, nova, operacao_lote_id, origem from zoo_operacao_movimentacoes where movimentacao_id = c_sr_saida;
  select versao into ver from zoo_operacoes_comerciais where id = c_sr;
  r := oc_sincronizar_entregas(c_sr, ver, false);
  select string_agg(format('%s=%s', e->>'data', e->>'valor'), ' / ' order by e->>'data') into entregas from jsonb_array_elements(_oc_entregas_snapshot(c_sr)) e;
  if entregas <> '2026-06-16=114798.21 / 2026-07-10=45201.79' then raise exception 'C entregas por kg: %', entregas; end if;
  select count(distinct f.safra_id) into n from zoo_operacao_partes pt join financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id
   where pt.operacao_id = c_sr and pt.origem = 'entrega' and pt.cancelada = false;
  if n <> 2 then raise exception 'C as duas entregas deviam cair em safras diferentes (%)', n; end if;
  -- ajuste de +1.000,00 no lote: dividido pelas duas entregas por kg, cada uma na sua data
  select versao into ver from zoo_operacoes_comerciais where id = c_sr;
  r := oc_explicar_saldo(c_sr, ver, 'ajuste_preco', -1000, (select id from zoo_operacao_lotes where operacao_id = c_sr), null, 'teste 01b', null, false);
  select string_agg(format('%s=%s', e->>'data', e->>'valor'), ' / ' order by e->>'data') into entregas from jsonb_array_elements(_oc_entregas_snapshot(c_sr)) e;
  if entregas <> '2026-06-16=115515.70 / 2026-07-10=45484.30' then raise exception 'C ajuste por entrega: %', entregas; end if;
  if exists (select 1 from zoo_operacao_partes pt join financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id
              where pt.operacao_id = c_sr and pt.origem = 'entrega' and pt.cancelada = false
                and f.safra_id is distinct from fn_safra_sugerida(cli, f.data_competencia, 'pecuaria')) then
    raise exception 'C entrega fora da safra da sua data'; end if;
  -- desconto de 100,00 rateado pelas duas entregas
  select versao into ver from zoo_operacoes_comerciais where id = c_sr;
  r := oc_explicar_saldo(c_sr, ver, 'desconto_comercial', 100, null, null, 'teste 01b', null, false);
  select string_agg(format('%s=%s', f.data_competencia, f.valor), ' / ' order by f.data_competencia) into entregas
    from zoo_operacao_partes pt join financeiro_lancamentos_v2 f on f.id = pt.financeiro_lancamento_id
   where pt.operacao_id = c_sr and pt.componente = 'desconto_comercial' and pt.cancelada = false;
  if entregas <> '2026-06-16=71.75 / 2026-07-10=28.25' then raise exception 'C desconto: %', entregas; end if;

  -- D) b74cfd38: salvar os lotes como estao ressincroniza a entrega
  select versao, cliente_id into ver, cli from zoo_operacoes_comerciais where id = c_b7;
  r := oc_salvar_lotes(c_b7, cli, ver, (select jsonb_agg(jsonb_build_object('ordem', ordem, 'categoria_negociada', categoria_negociada,
         'qtd_negociada', qtd_negociada, 'peso_medio_negociado_kg', peso_medio_negociado_kg, 'criterio_valor', criterio_valor,
         'valor_informado', valor_informado, 'observacao', observacao) order by ordem) from zoo_operacao_lotes where operacao_id = c_b7));
  if (select pt.valor from zoo_operacao_partes pt where pt.operacao_id = c_b7 and pt.origem = 'entrega' and pt.cancelada = false) <> 66500 then
    raise exception 'D entrega de b74cfd38 nao ressincronizou'; end if;
  if (r->>'versao')::int <> (select versao from zoo_operacoes_comerciais where id = c_b7) then raise exception 'D versao devolvida nao e a final'; end if;

  raise exception 'OK 01b: todos 1.544.082,84/658.875,74/347.041,42 com saldo 0 e volta; recusa no lote 2; baixa de um lote; desconto por entrega 605,53/258,38/136,09; 858acb08 114.798,21+45.201,79 em duas safras, ajuste 115.515,70+45.484,30, desconto 71,75+28,25; b74cfd38 66.500,00';
end $do$;
