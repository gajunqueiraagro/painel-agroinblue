-- CAD-CONTAS-BANCARIAS-01 — o escritor e a Auditoria da conta bancaria. Roda numa transacao que termina em RAISE (nada fica):
-- 'CAD01 OK ...' ou 'CAD01 FALHOU: ...'. Clientes do proto: Vera (6 contas) e NJ.
--   C1 salvar TODAS as contas dos dois clientes com os mesmos valores: Conciliacao (_fn_conciliacao_resumo, 7 meses), saldos_v2 e as
--      contas iguais; nenhuma semente tocada; nenhuma linha na Auditoria
--   C2 mudar o saldo inicial (0 -> 1000): a semente e' regravada, o mes seguinte parte de 1000 (tabela e Conciliacao) e a Auditoria diz
--      "saldo inicial 0 → 1000"
--   C3 marcar "Sem extrato" na conta que falta numa transferencia: o "falta o ..." some
--   C4 criar: uma linha "criou" na Auditoria, a semente do mes, codigo gerado, texto vazio vira nulo
--   C5 campo fora da lista (senha) recusado; C6 outro cliente recusado (salvar e painel)
SELECT set_config('request.jwt.claims','{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}',true);
DO $t$
DECLARE
  cli uuid[] := ARRAY['a1b2c3d4-e5f6-7890-abcd-ef1234567890','f2d67cd4-24d0-456f-a079-a3281dcce7fd']::uuid[];
  meses text[] := ARRAY['2024-02','2025-06','2026-01','2026-04','2026-07','2026-08','2026-09'];
  ct uuid := '1afe76df-b61e-49f4-b637-f5ce020c778b';
  fp0 text; fp1 text; sv0 text; sv1 text; ct0 text; ct1 text; r record; res jsonb; sem text[] := '{}'; n int := 0;
  i1 numeric; rs1 numeric; aud text; lt uuid; fa text; fd text; falta uuid; p jsonb; novo jsonb; na int; ns int; t text;
  falhas text[] := '{}';
BEGIN
  SELECT md5(string_agg(concat_ws('|',k,m,x.conta_id,x.saldo_inicial,x.saldo_sistema,x.saldo_extrato,x.diferenca,x.status), ',' ORDER BY k,m,x.conta_id)) INTO fp0
    FROM unnest(cli) k, unnest(meses) m, LATERAL _fn_conciliacao_resumo(k, m, NULL, false, false) x;
  SELECT md5(string_agg(concat_ws('|',id,saldo_inicial,saldo_final,origem_saldo_inicial,updated_at),',' ORDER BY id)) INTO sv0
    FROM financeiro_saldos_bancarios_v2 WHERE cliente_id = ANY(cli);
  SELECT md5(string_agg((to_jsonb(c) - 'updated_at' - 'updated_by')::text, ',' ORDER BY id)) INTO ct0 FROM financeiro_contas_bancarias c WHERE cliente_id = ANY(cli);
  FOR r IN SELECT * FROM financeiro_contas_bancarias WHERE cliente_id = ANY(cli) LOOP
    res := fn_conta_bancaria_salvar(r.cliente_id, r.id, jsonb_build_object('mes_inicio', r.mes_inicio, 'saldo_inicial_oficial', r.saldo_inicial_oficial,
      'tipo_conta', r.tipo_conta, 'sem_extrato_bancario', r.sem_extrato_bancario, 'aliases', r.aliases,
      'consolida_em_conta_id', r.consolida_em_conta_id, 'ativa', r.ativa));
    n := n + 1; IF res->>'semente' IS NOT NULL THEN sem := sem || (res->>'semente'); END IF;
  END LOOP;
  SELECT md5(string_agg(concat_ws('|',k,m,x.conta_id,x.saldo_inicial,x.saldo_sistema,x.saldo_extrato,x.diferenca,x.status), ',' ORDER BY k,m,x.conta_id)) INTO fp1
    FROM unnest(cli) k, unnest(meses) m, LATERAL _fn_conciliacao_resumo(k, m, NULL, false, false) x;
  SELECT md5(string_agg(concat_ws('|',id,saldo_inicial,saldo_final,origem_saldo_inicial,updated_at),',' ORDER BY id)) INTO sv1
    FROM financeiro_saldos_bancarios_v2 WHERE cliente_id = ANY(cli);
  SELECT md5(string_agg((to_jsonb(c) - 'updated_at' - 'updated_by')::text, ',' ORDER BY id)) INTO ct1 FROM financeiro_contas_bancarias c WHERE cliente_id = ANY(cli);
  SELECT count(*) INTO na FROM audit_log WHERE tabela_origem = 'financeiro_contas_bancarias' AND created_at = now();
  IF n < 20 OR fp0 IS DISTINCT FROM fp1 OR sv0 IS DISTINCT FROM sv1 OR ct0 IS DISTINCT FROM ct1 OR cardinality(sem) > 0 OR na > 0 THEN
    falhas := falhas || format('C1 n=%s concil=%s saldos=%s contas=%s sementes=%s aud=%s', n, fp0 = fp1, sv0 = sv1, ct0 = ct1, sem, na);
  END IF;

  res := fn_conta_bancaria_salvar(cli[1], ct, '{"saldo_inicial_oficial": 1000}');
  SELECT saldo_inicial INTO i1 FROM financeiro_saldos_bancarios_v2 WHERE conta_bancaria_id = ct AND ano_mes = '2024-02';
  SELECT x.saldo_inicial INTO rs1 FROM _fn_conciliacao_resumo(cli[1], '2024-02', ARRAY[ct], false, false) x;
  SELECT resumo INTO aud FROM audit_log WHERE registro_id = ct ORDER BY created_at DESC LIMIT 1;
  IF res->>'semente' IS DISTINCT FROM 'atualizada' OR i1 IS DISTINCT FROM 1000 OR rs1 IS DISTINCT FROM 1000 OR aud NOT LIKE '%saldo inicial 0 → 1000%' THEN
    falhas := falhas || format('C2 semente=%s fev=%s resumo=%s aud=%s', res->>'semente', i1, rs1, aud);
  END IF;

  SELECT l.id INTO lt FROM financeiro_lancamentos_v2 l WHERE l.cliente_id = ANY(cli) AND l.conta_destino_id IS NOT NULL AND NOT l.cancelado
     AND l.data_pagamento >= '2026-01-01' AND _fn_conc_transf_pontas(l.id)->>'frase' LIKE '%· falta o%' LIMIT 1;
  IF lt IS NULL THEN
    falhas := falhas || 'C3 nenhuma transferencia com uma ponta faltando para provar'::text;
  ELSE
    p := _fn_conc_transf_pontas(lt); fa := p->>'frase';
    SELECT CASE WHEN (p->>'origem')::boolean THEN l.conta_destino_id ELSE l.conta_bancaria_id END INTO falta FROM financeiro_lancamentos_v2 l WHERE l.id = lt;
    res := fn_conta_bancaria_salvar((SELECT cliente_id FROM financeiro_contas_bancarias WHERE id = falta), falta, '{"sem_extrato_bancario": true}');
    fd := _fn_conc_transf_pontas(lt)->>'frase';
    IF fd LIKE '%falta o%' THEN falhas := falhas || 'C3 o "falta o" continua'::text; END IF;
  END IF;

  novo := fn_conta_bancaria_salvar(cli[1], NULL, jsonb_build_object('nome_conta', 'Conta ensaio', 'tipo_conta', 'cc',
     'fazenda_id', (SELECT fazenda_id FROM financeiro_contas_bancarias WHERE id = ct), 'mes_inicio', '2026-01', 'saldo_inicial_oficial', 50,
     'gerente_nome', 'Ger', 'banco', '', 'aliases', '[]'::jsonb));
  SELECT count(*) INTO na FROM audit_log WHERE registro_id = (novo->>'id')::uuid AND acao = 'criou';
  SELECT count(*) INTO ns FROM financeiro_saldos_bancarios_v2 WHERE conta_bancaria_id = (novo->>'id')::uuid AND ano_mes = '2026-01' AND saldo_final = 50;
  IF na <> 1 OR (SELECT count(*) FROM audit_log WHERE registro_id = (novo->>'id')::uuid) <> 1 OR ns <> 1 OR novo->>'codigo_conta' IS NULL
     OR NOT (SELECT banco IS NULL AND aliases IS NULL AND gerente_nome = 'Ger' FROM financeiro_contas_bancarias WHERE id = (novo->>'id')::uuid) THEN
    falhas := falhas || format('C4 criou=%s semente=%s codigo=%s', na, ns, novo->>'codigo_conta');
  END IF;

  BEGIN res := fn_conta_bancaria_salvar(cli[1], ct, '{"senha":"x"}'); t := 'aceitou'; EXCEPTION WHEN others THEN t := SQLERRM; END;
  IF t NOT LIKE 'Campo desconhecido%' THEN falhas := falhas || ('C5 ' || t); END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  BEGIN res := fn_conta_bancaria_salvar(cli[1], ct, '{"gerente_nome":"x"}'); t := 'aceitou'; EXCEPTION WHEN others THEN t := SQLERRM; END;
  IF t <> 'Sem acesso a este cliente.' OR fn_conta_bancaria_painel(ct) IS NOT NULL THEN falhas := falhas || ('C6 ' || t); END IF;

  IF cardinality(falhas) > 0 THEN RAISE EXCEPTION 'CAD01 FALHOU: %', array_to_string(falhas, ' || '); END IF;
  RAISE EXCEPTION 'CAD01 OK (C1 % contas iguais; C2 semente e mes seguinte 1000; C3 falta antes=% depois=%; C4; C5; C6)', n,
    fa LIKE '%falta o%', fd LIKE '%falta o%';
END $t$;
