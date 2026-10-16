-- OC-DESVINCULAR-COMPETENCIA-01 (Gabriel, 16/10/2026) — desvincular um lancamento de OC devolve o que o vinculo trocou.
--
-- O DEFEITO (FASE 0 de 15/10): todo vinculo grava o lancamento inteiro de ANTES (`dados_anteriores.lancamento`) e de DEPOIS
--   (`dados_novos.lancamento`) no evento, mas `_oc_restaurar_competencia` so' agia quando a competencia tinha sido trocada pela
--   regra da saida (`competencia_pela_saida = true`); no resto dizia "sem snapshot". E nunca devolvia o `movimentacao_rebanho_id`
--   que o vinculo solta. 12 desvinculos no proto, 0 restaurados; 2 da Vera quebrados hoje (bb30fcce, 323d5bc8).
--
-- (a) DAQUI PRA FRENTE — tres funcoes:
--   1. `_oc_restaurar_competencia` (dcc05aa9… -> destino abaixo; interna, INVOKER, fechada como era): le' o ANTES no PRIMEIRO evento
--      de vinculo da parte (`vincular_lancamento` / `vincular_recebimento`) e o DEPOIS no evento que o chamador passa (o ultimo:
--      vinculo ou `corrigir_competencia_pela_saida` — este guarda como "anterior" a competencia de DEPOIS do vinculo, por isso o
--      antes nao vem dele). Devolve competencia, safra e `movimentacao_rebanho_id` (so' se a movimentacao existe e esta' viva).
--      Travas de sempre: editado depois do vinculo nao restaura; valor, pagamento, contas, plano e hash nunca mudam. Quando nao
--      restaura, diz o motivo: 'sem evento de vinculo', 'sem registro do estado anterior', 'editado depois do vinculo',
--      'nada a restaurar'. Vale para titulo e conta corrente, com ou sem a marca da saida (decisao do Gabriel, 16/10).
--   2. `oc_desvincular_lancamento` (f568e7cb… -> destino): ganha a guarda `tenant_ok` (molde vigente; o caminho `service_role`
--      fica como era). O restaurador ja' era chamado aqui.
--   3. `_oc_cancelar_conta_corrente` (5f585988… -> destino; interna, fechada): guarda `tenant_ok` (fora do `service_role`) e chama
--      o MESMO restaurador para cada recebimento que fica (volta a' conta original ou fica manual); o retorno ganha `restauros`.
--   ⚠ A porta de desvincular da conta corrente (OC-CC-ACOES-LINHA-02 PR 3, na fila) usa este restaurador.
-- (b) PASSADO — so' os 2 da Vera com fonte confiavel (o evento do vinculo, conferido pelo `audit_log`): o restaurador novo, com o
--   evento do vinculo, sob as condicoes "estado de hoje = o gravado pelo vinculo" e "nenhuma parte viva"; senao aborta.
--   `ano_mes` acompanha a competencia pelo gatilho `trg_00_ano_mes_from_competencia`. Trilha: `audit_log` 'restaurar_competencia'.
-- So' funcoes e dado: nenhum DDL em tabela. Patch guardado por md5 (origem, cada ancora 1x, destino); reexecutar nao muda nada.

SET LOCAL lock_timeout = '2s';

-- ── 1. o restaurador ─────────────────────────────────────────────────────────────────────────────────────────────────────
DO $g$
DECLARE v text;
BEGIN
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public._oc_restaurar_competencia(uuid, uuid)'::regprocedure;
  IF v NOT IN ('dcc05aa95e0169c79c71d7ccea1076f3', 'bfab7fb49c6210083a2dda61394e0080') THEN
    RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: _oc_restaurar_competencia com md5 inesperado (%). Abortado.', v; END IF;
END $g$;

CREATE OR REPLACE FUNCTION public._oc_restaurar_competencia(p_lancamento_id uuid, p_evento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ultimo public.zoo_operacao_eventos;
  v_origem public.zoo_operacao_eventos;
  v_l public.financeiro_lancamentos_v2;
  v_d public.financeiro_lancamentos_v2;
  v_ant jsonb; v_nov jsonb;
  v_comp_ant date; v_safra_ant uuid; v_mov_ant uuid; v_comp_nova date; v_safra_nova uuid;
  v_mov_para uuid; v_nota text;
BEGIN
  -- OC-DESVINCULAR-COMPETENCIA-01: o ANTES vem do PRIMEIRO vinculo da parte; o DEPOIS, do evento passado (o ultimo da parte).
  SELECT * INTO v_ultimo FROM public.zoo_operacao_eventos WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('restaurado', false, 'motivo', 'sem evento de vinculo', 'evento_id', p_evento_id);
  END IF;
  IF (v_ultimo.detalhes->>'lancamento_id') IS DISTINCT FROM p_lancamento_id::text THEN
    RAISE EXCEPTION 'Evento % nao e do lancamento %', p_evento_id, p_lancamento_id USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_origem FROM public.zoo_operacao_eventos e
   WHERE e.operacao_id = v_ultimo.operacao_id AND e.acao IN ('vincular_lancamento', 'vincular_recebimento')
     AND e.detalhes->>'parte_id' = v_ultimo.detalhes->>'parte_id'
   ORDER BY e.created_at, e.id LIMIT 1;
  IF NOT FOUND OR NOT (coalesce(v_origem.dados_anteriores, '{}'::jsonb) ? 'lancamento')
     OR NOT (coalesce(v_ultimo.dados_novos, '{}'::jsonb) ? 'lancamento') THEN
    RETURN jsonb_build_object('restaurado', false, 'motivo', 'sem registro do estado anterior', 'evento_id', p_evento_id);
  END IF;
  v_ant := v_origem.dados_anteriores->'lancamento';
  v_nov := v_ultimo.dados_novos->'lancamento';
  v_comp_ant  := nullif(v_ant->>'data_competencia', '')::date;
  v_safra_ant := nullif(v_ant->>'safra_id', '')::uuid;
  v_mov_ant   := nullif(v_ant->>'movimentacao_rebanho_id', '')::uuid;
  v_comp_nova := nullif(v_nov->>'data_competencia', '')::date;
  v_safra_nova := nullif(v_nov->>'safra_id', '')::uuid;

  SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lancamento % nao encontrado', p_lancamento_id USING ERRCODE = 'P0001'; END IF;
  IF v_l.data_competencia IS DISTINCT FROM v_comp_nova OR v_l.safra_id IS DISTINCT FROM v_safra_nova
     OR (v_l.movimentacao_rebanho_id IS NOT NULL AND v_l.movimentacao_rebanho_id IS DISTINCT FROM v_mov_ant) THEN
    RETURN jsonb_build_object('restaurado', false, 'motivo', 'editado depois do vinculo', 'evento_id', p_evento_id,
      'competencia_atual', v_l.data_competencia, 'safra_atual', v_l.safra_id,
      'competencia_anterior', v_comp_ant, 'safra_anterior', v_safra_ant);
  END IF;

  -- a movimentacao de origem so' volta se ainda existe e esta' viva
  v_mov_para := v_l.movimentacao_rebanho_id;
  IF v_mov_ant IS NOT NULL AND v_l.movimentacao_rebanho_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.lancamentos m WHERE m.id = v_mov_ant AND m.cancelado IS NOT TRUE) THEN
      v_mov_para := v_mov_ant;
    ELSE
      v_nota := 'movimentacao de origem cancelada ou ausente: nao foi religada';
    END IF;
  END IF;

  IF v_l.data_competencia IS NOT DISTINCT FROM v_comp_ant AND v_l.safra_id IS NOT DISTINCT FROM v_safra_ant
     AND v_l.movimentacao_rebanho_id IS NOT DISTINCT FROM v_mov_para THEN
    RETURN jsonb_build_object('restaurado', false, 'motivo', 'nada a restaurar', 'evento_id', p_evento_id, 'nota', v_nota);
  END IF;

  UPDATE public.financeiro_lancamentos_v2
     SET data_competencia = v_comp_ant, safra_id = v_safra_ant, movimentacao_rebanho_id = v_mov_para,
         updated_at = now(), updated_by = auth.uid()
   WHERE id = p_lancamento_id;
  -- mesmo cuidado do VINCULAR-FIX-01 (D3): `data_competencia` recalcula o hash; regrava o original
  UPDATE public.financeiro_lancamentos_v2 SET hash_importacao = v_l.hash_importacao
   WHERE id = p_lancamento_id AND hash_importacao IS DISTINCT FROM v_l.hash_importacao;
  SELECT * INTO v_d FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF v_d.hash_importacao IS DISTINCT FROM v_l.hash_importacao OR v_d.valor IS DISTINCT FROM v_l.valor
     OR v_d.data_pagamento IS DISTINCT FROM v_l.data_pagamento
     OR v_d.conta_bancaria_id IS DISTINCT FROM v_l.conta_bancaria_id
     OR v_d.conta_destino_id IS DISTINCT FROM v_l.conta_destino_id
     OR v_d.plano_conta_id IS DISTINCT FROM v_l.plano_conta_id
     OR v_d.data_competencia IS DISTINCT FROM v_comp_ant OR v_d.safra_id IS DISTINCT FROM v_safra_ant
     OR v_d.movimentacao_rebanho_id IS DISTINCT FROM v_mov_para THEN
    RAISE EXCEPTION 'Restaurar a competencia mudaria valor, pagamento, conta ou hash do lancamento %; abortado', p_lancamento_id
      USING ERRCODE = 'P0001'; END IF;

  RETURN jsonb_build_object('restaurado', true, 'evento_id', p_evento_id, 'evento_origem_id', v_origem.id,
    'competencia_de', v_l.data_competencia, 'competencia_para', v_comp_ant,
    'safra_de', v_l.safra_id, 'safra_para', v_safra_ant,
    'movimentacao_de', v_l.movimentacao_rebanho_id, 'movimentacao_para', v_mov_para, 'nota', v_nota);
END;
$function$;

REVOKE ALL ON FUNCTION public._oc_restaurar_competencia(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._oc_restaurar_competencia(uuid, uuid) TO service_role;

-- ── 2 e 3. patch guardado por md5 ────────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.patch(p_assin text, p_origem text, p_destino text, p_trocas text[][]) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE v_oid oid := p_assin::regprocedure; v_md5 text; v_def text; i int; n int;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = v_oid;
  IF v_md5 = p_destino THEN RAISE NOTICE '% ja'' no destino', p_assin; RETURN; END IF;
  IF v_md5 IS DISTINCT FROM p_origem THEN
    RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: % com md5 inesperado (%). Abortado.', p_assin, v_md5; END IF;
  v_def := pg_get_functiondef(v_oid);
  FOR i IN 1 .. array_length(p_trocas, 1) LOOP
    n := (length(v_def) - length(replace(v_def, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    IF n <> 1 THEN RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: % ancora % casou % vezes. Abortado.', p_assin, i, n; END IF;
    v_def := replace(v_def, p_trocas[i][1], p_trocas[i][2]);
  END LOOP;
  EXECUTE v_def;
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = v_oid;
  IF v_md5 IS DISTINCT FROM p_destino THEN
    RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: % ficou com md5 % (esperado %). Abortado.', p_assin, v_md5, p_destino; END IF;
END $p$;

SELECT pg_temp.patch('public.oc_desvincular_lancamento(uuid, integer, uuid, text, uuid, boolean)',
  'f568e7cbd3e876a0180cf6386d13ccf2', '7d7e8d36bb06107064000ff0f4a96fa0', ARRAY[
  ARRAY[E'  v_cli := v_op.cliente_id;\n',
        E'  v_cli := v_op.cliente_id;\n'
     || E'  -- OC-DESVINCULAR-COMPETENCIA-01: guarda de tenant no molde vigente (o caminho service_role fica como era)\n'
     || E'  IF NOT v_is_service AND NOT coalesce(public.tenant_ok(v_cli), false) THEN\n'
     || E'    RAISE EXCEPTION ''sem acesso a este registro'' USING ERRCODE = ''42501''; END IF;\n']]);

SELECT pg_temp.patch('public._oc_cancelar_conta_corrente(uuid, text, boolean)',
  '5f585988500b26e1fb84f73914aa2b32', 'ce1df3214bc973d23df784bba32ce70a', ARRAY[
  ARRAY[E'  r record; v_plano_orig uuid; v_mov_orig uuid; v_l public.financeiro_lancamentos_v2; v_l2 public.financeiro_lancamentos_v2;\n',
        E'  r record; v_plano_orig uuid; v_mov_orig uuid; v_l public.financeiro_lancamentos_v2; v_l2 public.financeiro_lancamentos_v2;\n'
     || E'  v_ev_vinculo uuid; v_restauros jsonb := ''[]''::jsonb;  -- OC-DESVINCULAR-COMPETENCIA-01\n'],
  ARRAY[E'  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;\n',
        E'  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;\n'
     || E'  -- OC-DESVINCULAR-COMPETENCIA-01: guarda de tenant no molde vigente (o caminho service_role fica)\n'
     || E'  IF coalesce(auth.role(), '''') <> ''service_role'' AND NOT coalesce(public.tenant_ok(v_op.cliente_id), false) THEN\n'
     || E'    RAISE EXCEPTION ''sem acesso a este registro'' USING ERRCODE = ''42501''; END IF;\n'],
  ARRAY[E'      END IF;\n      -- o hash de importacao nao muda (mesmo cuidado do vincular)\n',
        E'      END IF;\n'
     || E'      -- OC-DESVINCULAR-COMPETENCIA-01: o recebimento que fica volta a'' competencia, safra e movimentacao de antes do vinculo\n'
     || E'      IF r.acao IN (''volta_para_conta_original'', ''fica_manual'') THEN\n'
     || E'        SELECT e.id INTO v_ev_vinculo FROM public.zoo_operacao_eventos e\n'
     || E'         WHERE e.operacao_id = p_operacao_id\n'
     || E'           AND e.acao IN (''vincular_lancamento'', ''vincular_recebimento'', ''corrigir_competencia_pela_saida'')\n'
     || E'           AND e.detalhes->>''parte_id'' = r.parte_id::text\n'
     || E'         ORDER BY e.created_at DESC LIMIT 1;\n'
     || E'        v_restauros := v_restauros || jsonb_build_array(jsonb_build_object(''titulo_id'', r.titulo_id,\n'
     || E'          ''restauro'', public._oc_restaurar_competencia(r.titulo_id, v_ev_vinculo)));\n'
     || E'      END IF;\n'
     || E'      -- o hash de importacao nao muda (mesmo cuidado do vincular)\n'],
  ARRAY[E'''bloqueios'', v_bloq);',
        E'''bloqueios'', v_bloq, ''restauros'', v_restauros);']]);

DO $g$
DECLARE v_acl text;
BEGIN
  SELECT proacl::text INTO v_acl FROM pg_proc WHERE oid = 'public.oc_desvincular_lancamento(uuid, integer, uuid, text, uuid, boolean)'::regprocedure;
  IF v_acl IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN
    RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: ACL de oc_desvincular_lancamento mudou (%). Abortado.', v_acl; END IF;
  SELECT proacl::text INTO v_acl FROM pg_proc WHERE oid = 'public._oc_cancelar_conta_corrente(uuid, text, boolean)'::regprocedure;
  IF v_acl IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: ACL de _oc_cancelar_conta_corrente mudou (%). Abortado.', v_acl; END IF;
  SELECT proacl::text INTO v_acl FROM pg_proc WHERE oid = 'public._oc_restaurar_competencia(uuid, uuid)'::regprocedure;
  IF v_acl IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: ACL de _oc_restaurar_competencia mudou (%). Abortado.', v_acl; END IF;
  SELECT md5(prosrc) INTO v_acl FROM pg_proc WHERE oid = 'public._oc_restaurar_competencia(uuid, uuid)'::regprocedure;
  IF v_acl IS DISTINCT FROM 'bfab7fb49c6210083a2dda61394e0080' THEN
    RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: _oc_restaurar_competencia ficou com md5 %. Abortado.', v_acl; END IF;
END $g$;

-- ── (b) o passado: os 2 da Vera ──────────────────────────────────────────────────────────────────────────────────────────
DO $dado$
DECLARE
  c_cli constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  c_casos constant jsonb := '[
    {"lanc": "bb30fcce-bfb4-4a57-8fb4-58dd8c7a1222", "evento": "29a65a55-cec3-49a0-95a6-8c065e9d022c", "de": "2026-09-02", "para": "2026-08-06"},
    {"lanc": "323d5bc8-0f14-400b-84d7-d9e41d778047", "evento": "ea6e5a39-53af-4504-9612-f03e35b234aa", "de": "2025-01-22", "para": "2025-01-20"}]';
  c_motivo constant text := 'OC-DESVINCULAR-COMPETENCIA-01: desvinculado sem restaurar (restaurador antigo); competencia de antes do vinculo, pelo evento do vinculo e conferida pelo audit_log';
  k jsonb; l public.financeiro_lancamentos_v2; d public.financeiro_lancamentos_v2; r jsonb;
BEGIN
  FOR k IN SELECT * FROM jsonb_array_elements(c_casos) LOOP
    SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = (k->>'lanc')::uuid;
    IF NOT FOUND OR l.cliente_id IS DISTINCT FROM c_cli THEN
      RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: % ausente ou de outro cliente. Abortado.', k->>'lanc'; END IF;
    IF l.data_competencia = (k->>'para')::date
       AND EXISTS (SELECT 1 FROM public.audit_log a WHERE a.registro_id = l.id AND a.acao = 'restaurar_competencia') THEN
      RAISE NOTICE 'OC-DESVINCULAR-COMPETENCIA-01: % ja'' restaurado.', k->>'lanc'; CONTINUE; END IF;
    IF l.data_competencia IS DISTINCT FROM (k->>'de')::date OR l.cancelado IS TRUE THEN
      RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: % nao esta'' no estado medido (competencia %). Abortado.', k->>'lanc', l.data_competencia; END IF;
    IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes p WHERE p.financeiro_lancamento_id = l.id AND NOT p.cancelada) THEN
      RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: % tem parte viva de OC. Abortado.', k->>'lanc'; END IF;
    -- a fonte e' conferida pelo audit_log: a troca de 'para' -> 'de' feita no vinculo
    IF NOT EXISTS (SELECT 1 FROM public.audit_log a WHERE a.tabela_origem = 'financeiro_lancamentos_v2' AND a.registro_id = l.id
                     AND a.dados_anteriores->>'data_competencia' = k->>'para' AND a.dados_novos->>'data_competencia' = k->>'de') THEN
      RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: audit_log de % nao confirma % -> %. Abortado.', k->>'lanc', k->>'para', k->>'de'; END IF;
    r := public._oc_restaurar_competencia(l.id, (k->>'evento')::uuid);
    IF (r->>'restaurado')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: % nao restaurou: %. Abortado.', k->>'lanc', r; END IF;
    SELECT * INTO d FROM public.financeiro_lancamentos_v2 WHERE id = l.id;
    IF d.data_competencia IS DISTINCT FROM (k->>'para')::date OR d.ano_mes IS DISTINCT FROM to_char((k->>'para')::date, 'YYYY-MM')
       OR d.valor IS DISTINCT FROM l.valor OR d.data_pagamento IS DISTINCT FROM l.data_pagamento
       OR d.hash_importacao IS DISTINCT FROM l.hash_importacao OR d.plano_conta_id IS DISTINCT FROM l.plano_conta_id THEN
      RAISE EXCEPTION 'OC-DESVINCULAR-COMPETENCIA-01: % ficou errado depois do restauro. Abortado.', k->>'lanc'; END IF;
    INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    VALUES (l.cliente_id, l.fazenda_id, NULL, 'financeiro', 'restaurar_competencia', 'financeiro_lancamentos_v2', l.id, c_motivo,
      jsonb_build_object('data_competencia', l.data_competencia, 'ano_mes', l.ano_mes, 'safra_id', l.safra_id),
      jsonb_build_object('data_competencia', d.data_competencia, 'ano_mes', d.ano_mes, 'safra_id', d.safra_id, 'restauro', r));
  END LOOP;
END $dado$;
