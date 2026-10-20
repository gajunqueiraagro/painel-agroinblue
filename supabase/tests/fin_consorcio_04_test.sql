-- FIN-CONSORCIO-04 — o consorcio pelas FAIXAS em R$. Roda depois da 20261027203600; termina em RAISE (nada fica). Admin simulado;
-- sintetico no cliente Teste.
-- F1 o 002122 pelas faixas do termo: 4 faixas, totais 197.607,98 / 25.689,04 / 996,00 / 224.293,02, sem ajuste de centavos, sem aviso;
--    confere: fundo comum ok, taxa ok, 1a parcela 2.803,66 ok, reserva ! (996,00 x 988,04).
-- F2 recusas com a faixa do erro: buraco, sobreposicao, alem do prazo, aquem do prazo, adesao depois de a pagar, adiada antes de a pagar,
--    valor negativo, faixa sem valor.
-- F3 o modo regras nao muda (o T1 do 02) e ganha a conferencia.
-- F4 gravado pelo escritor; trocar UMA faixa regera so' as parcelas em aberto daquela faixa: as identicas nao contam (iguais), a paga fica.
-- F5 o reajuste no modo faixas reescreve as faixas gravadas pelas parcelas: o Regerar seguinte nao muda nada (nao desfaz o reajuste).
set local statement_timeout = '120s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_fx constant jsonb := '[{"de":1,"ate":12,"fundo_comum":2297.19,"taxa_adm":494.02,"fundo_reserva":12.45,"seguro":0,"tipo":"a_pagar"},
    {"de":13,"ate":46,"fundo_comum":2297.19,"taxa_adm":581.20,"fundo_reserva":12.45,"seguro":0,"tipo":"a_pagar"},
    {"de":47,"ate":79,"fundo_comum":2704.04,"taxa_adm":0,"fundo_reserva":12.45,"seguro":0,"tipo":"adiada"},
    {"de":80,"ate":80,"fundo_comum":2703.92,"taxa_adm":0,"fundo_reserva":12.45,"seguro":0,"tipo":"adiada"}]';
  c_base constant jsonb := '{"modo":"faixas","carta":197607.98,"primeira_parcela":"2031-07-16","prazo_grupo":80,"ja_transcorridas":34,
    "transcorridas":"adiadas","taxa_adm":{"total_pct":13},"fundo_reserva":{"total_pct":0.5},"seguro":{"modo":"valor","valor":0},
    "primeira_parcela_termo":2803.66,"reajuste":{"indice":"preco_do_bem"}}';
  c_regras constant jsonb := '{"carta":197607.98,"primeira_parcela":"2031-07-16","prazo_grupo":80,"ja_transcorridas":34,"transcorridas":"adiadas",
    "fundo_comum":{"modo":"pct_parcela","valor":1.1625},"taxa_adm":{"total_pct":13,"forma":"antecipada","pct_parcela":0.25,"primeiras":12},
    "fundo_reserva":{"modo":"pct_parcela","valor":0.0063,"total_pct":0.5},"seguro":{"modo":"valor","valor":0},"reajuste":{"indice":"preco_do_bem"}}';
  r jsonb; v_cred uuid; v_fin uuid; v_ok boolean; v_dados jsonb; v_p13 uuid;

BEGIN
  -- F1
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', c_fx));
  IF r->>'recusa' is not null OR r->>'modo' <> 'faixas' OR (r->>'parcelas')::int <> 80 OR (r->>'a_pagar_agora')::int <> 46 OR (r->>'adiadas')::int <> 34
     OR jsonb_array_length(r->'faixas') <> 4 OR (r->'faixas'->0->>'total')::numeric <> 2803.66 OR (r->'faixas'->1->>'total')::numeric <> 2890.84
     OR (r->'faixas'->3->>'de')::int <> 80 OR (r->'faixas'->3->>'fundo_comum')::numeric <> 2703.92
     OR (r->'totais'->>'fundo_comum')::numeric <> 197607.98 OR (r->'totais'->>'taxa_adm')::numeric <> 25689.04
     OR (r->'totais'->>'fundo_reserva')::numeric <> 996.00 OR (r->'totais'->>'seguro')::numeric <> 0 OR (r->'totais'->>'total')::numeric <> 224293.02
     OR EXISTS (select 1 from jsonb_array_elements(r->'linhas') l where l ? 'ajuste_arredondamento')
     OR jsonb_array_length(r->'avisos') <> 0
     OR r->'linhas'->46->>'vencimento' is not null OR r->'linhas'->45->>'vencimento' <> '2035-04-16' THEN RAISE EXCEPTION 'F1: %', r - 'linhas'; END IF;
  IF (select (c->>'ok')::boolean from jsonb_array_elements(r->'confere') c where c->>'chave' = 'fundo_comum') is distinct from true
     OR (select (c->>'ok')::boolean from jsonb_array_elements(r->'confere') c where c->>'chave' = 'taxa_adm') is distinct from true
     OR (select (c->>'ok')::boolean from jsonb_array_elements(r->'confere') c where c->>'chave' = 'primeira_parcela') is distinct from true
     OR (select (c->>'ok')::boolean from jsonb_array_elements(r->'confere') c where c->>'chave' = 'reserva') is distinct from false
     OR (select c->>'texto' from jsonb_array_elements(r->'confere') c where c->>'chave' = 'reserva') is distinct from 'reserva 996,00 × 0,50% da carta 988,04'
     OR (select c->>'texto' from jsonb_array_elements(r->'confere') c where c->>'chave' = 'primeira_parcela') is distinct from '1ª parcela 2.803,66 = termo' THEN
    RAISE EXCEPTION 'F1 confere: %', r->'confere';
  END IF;
  -- o termo que nao bate: "!" com os dois numeros
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', c_fx, 'primeira_parcela_termo', 2803.56));
  IF (select c->>'texto' from jsonb_array_elements(r->'confere') c where c->>'chave' = 'primeira_parcela') is distinct from '1ª parcela 2.803,66 × termo 2.803,56' THEN
    RAISE EXCEPTION 'F1 termo: %', r->'confere';
  END IF;

  -- as faixas digitadas que nao fecham com a carta por centavos: nenhum ajuste, a conferencia diz a diferenca
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', jsonb_build_array(c_fx->0, c_fx->1, c_fx->2, c_fx->3 || '{"fundo_comum":2703.90}')));
  IF EXISTS (select 1 from jsonb_array_elements(r->'linhas') l where l ? 'ajuste_arredondamento') OR (r->'totais'->>'fundo_comum')::numeric <> 197607.96
     OR (select c->>'texto' from jsonb_array_elements(r->'confere') c where c->>'chave' = 'fundo_comum') is distinct from 'fundo comum 197.607,96 × carta 197.607,98 (−0,02)' THEN
    RAISE EXCEPTION 'F1 centavos: %', r->'confere';
  END IF;

  -- F2
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', jsonb_build_array(c_fx->0, c_fx->1 || '{"de":14}', c_fx->2, c_fx->3)));
  IF r->>'recusa' is distinct from 'Faixas: a parcela 13 não está em nenhuma faixa.' OR (r->>'faixa_erro')::int is distinct from 1 THEN RAISE EXCEPTION 'F2 buraco: %', r; END IF;
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', jsonb_build_array(c_fx->0, c_fx->1 || '{"de":12}', c_fx->2, c_fx->3)));
  IF r->>'recusa' is distinct from 'Faixas: a parcela 12 está em duas faixas.' OR (r->>'faixa_erro')::int is distinct from 1 THEN RAISE EXCEPTION 'F2 sobreposicao: %', r; END IF;
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', jsonb_build_array(c_fx->0, c_fx->1, c_fx->2, c_fx->3 || '{"ate":81}')));
  IF r->>'recusa' not like 'Faixas: a faixa 80 a 81 passa do prazo%' OR (r->>'faixa_erro')::int is distinct from 3 THEN RAISE EXCEPTION 'F2 alem: %', r; END IF;
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', jsonb_build_array(c_fx->0, c_fx->1, c_fx->2)));
  IF r->>'recusa' is distinct from 'Faixas: a parcela 80 não está em nenhuma faixa (o prazo do grupo é 80).' OR (r->>'faixa_erro')::int is distinct from 2 THEN
    RAISE EXCEPTION 'F2 aquem: %', r;
  END IF;
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', jsonb_build_array(c_fx->0, c_fx->1 || '{"tipo":"adesao"}', c_fx->2, c_fx->3)));
  IF r->>'recusa' not like 'Faixas: "na adesão"%' OR (r->>'faixa_erro')::int is distinct from 1 THEN RAISE EXCEPTION 'F2 adesao: %', r; END IF;
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', jsonb_build_array(c_fx->0 || '{"tipo":"adiada"}', c_fx->1, c_fx->2, c_fx->3)));
  IF r->>'recusa' not like 'Faixas: com transcorridas adiadas%' OR (r->>'faixa_erro')::int is distinct from 0 THEN RAISE EXCEPTION 'F2 adiada antes: %', r; END IF;
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', jsonb_build_array(c_fx->0 || '{"taxa_adm":-1}', c_fx->1, c_fx->2, c_fx->3)));
  IF r->>'recusa' not like 'Faixa 1 a 12: nenhum valor negativo.' THEN RAISE EXCEPTION 'F2 negativo: %', r; END IF;
  r := fn_consorcio_cronograma(c_base || jsonb_build_object('faixas', jsonb_build_array(c_fx->0, c_fx->1 || '{"fundo_comum":0,"taxa_adm":0,"fundo_reserva":0}', c_fx->2, c_fx->3)));
  IF r->>'recusa' not like 'Faixa 13 a 46: informe ao menos um valor.' THEN RAISE EXCEPTION 'F2 vazia: %', r; END IF;

  -- F3
  r := fn_consorcio_cronograma(c_regras);
  IF r->>'recusa' is not null OR r->>'modo' <> 'regras' OR (r->'totais'->>'total')::numeric <> 224293.02 OR jsonb_array_length(r->'faixas') <> 4
     OR (r->'faixas'->3->>'ajuste_arredondamento')::numeric <> -0.12
     OR NOT (r->'avisos') @> '["reserva: 996,00 pelo % por parcela x 988,04 pelo % total"]'::jsonb
     OR (select (c->>'ok')::boolean from jsonb_array_elements(r->'confere') c where c->>'chave' = 'fundo_comum') is distinct from true
     OR (select (c->>'ok')::boolean from jsonb_array_elements(r->'confere') c where c->>'chave' = 'reserva') is distinct from false THEN
    RAISE EXCEPTION 'F3: %', r - 'linhas';
  END IF;

  -- F4
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'SINT ADMINISTRADORA CONSORCIO 04', true) returning id into v_cred;
  v_dados := jsonb_build_object('cliente_id', c_cli, 'descricao', 'SINT CONS 04', 'credor_id', v_cred, 'grupo', '004', 'cota', '1',
    'tipo_bem', 'Máquina agrícola', 'atividade', 'pecuaria', 'fazenda_id', c_faz, 'conta_bancaria_id', c_cta, 'data_adesao', '2031-06-19');
  r := fn_consorcio_salvar(null, v_dados || jsonb_build_object('regras', c_base || jsonb_build_object('faixas', c_fx)), false);
  IF r->>'recusa' is not null THEN RAISE EXCEPTION 'F4 recusa: %', r->>'recusa'; END IF;
  v_fin := (r->>'financiamento_id')::uuid;
  IF (select count(*) from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado') <> 80
     OR (select sum(valor_total) from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado') <> 224293.02
     OR (select regras->>'modo' from financiamento_consorcio where financiamento_id = v_fin) <> 'faixas' THEN RAISE EXCEPTION 'F4 gravado'; END IF;
  -- nada mudou: o Regerar recusa (as 80 voltariam identicas)
  v_ok := false;
  BEGIN perform fn_financiamento_parcelas_regerar(v_fin, 'recalcular_todas', false);
  EXCEPTION WHEN others THEN v_ok := sqlerrm like 'Nada muda%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'F4 regerar sem mudanca'; END IF;
  -- a 13 paga; a faixa 13 a 46 passa a 600,00 de taxa
  select id into v_p13 from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 13;
  -- FIN-PARCELA-STATUS-01: a parcela fica paga pelos lancamentos dela (a coluna os segue); 'pago' gravado na coluna com eles em aberto
  -- e' corrigido pelo gatilho
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2032-07-16'
   where id in (select lancamento_id from financiamento_parcelas where id = v_p13 union select lancamento_juros_id from financiamento_parcelas where id = v_p13);
  IF (select status from financiamento_parcelas where id = v_p13) <> 'pago' THEN RAISE EXCEPTION 'F4 a 13 nao ficou paga pelos lancamentos'; END IF;
  r := fn_consorcio_salvar(v_fin, v_dados || jsonb_build_object('regras', c_base || jsonb_build_object('faixas',
         jsonb_build_array(c_fx->0, c_fx->1 || '{"taxa_adm":600}', c_fx->2, c_fx->3))), false);
  r := fn_financiamento_parcelas_regerar(v_fin, 'recalcular_todas', false);
  IF (r->'base'->>'trocadas')::int <> 33 OR (r->'base'->>'iguais')::int <> 46 OR (r->'base'->>'mantidas')::int <> 1
     OR (select valor_taxa_adm from financiamento_parcelas where id = v_p13) <> 581.20
     OR (select valor_taxa_adm from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 14) <> 600
     OR (select valor_taxa_adm from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 12) <> 494.02 THEN
    RAISE EXCEPTION 'F4 regerar: %', r->'base';
  END IF;

  -- F5
  r := fn_consorcio_reajustar(v_fin, 10, '2033-01-01', 'preco_do_bem', false);
  IF (select valor_fundo_comum from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 47) <> 2974.44
     OR (select valor_fundo_comum from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 1) <> 2297.19
     OR (select jsonb_array_length(regras->'faixas') from financiamento_consorcio where financiamento_id = v_fin) < 5
     OR (select regras->'faixas'->-1->>'tipo' from financiamento_consorcio where financiamento_id = v_fin) <> 'adiada' THEN
    RAISE EXCEPTION 'F5 reajuste: %', (select regras->'faixas' from financiamento_consorcio where financiamento_id = v_fin);
  END IF;
  v_ok := false;
  BEGIN perform fn_financiamento_parcelas_regerar(v_fin, 'recalcular_todas', false);
  EXCEPTION WHEN others THEN v_ok := sqlerrm like 'Nada muda%'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'F5 o regerar desfaria o reajuste'; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
