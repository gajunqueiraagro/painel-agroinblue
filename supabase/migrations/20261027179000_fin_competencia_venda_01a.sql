-- FIN-COMPETENCIA-VENDA-01a — ligar recebimento de venda/abate a' OC grava competencia e safra pela SAIDA do gado; desligar devolve.
--
-- REGRA (Gabriel, 29/09/2026): recebimento de venda/abate tem competencia e safra = data da saida do gado; o pagamento e' so' caixa.
-- Ao ligar a' OC (criar do legado, buscar recebimento, vincular pelo Financeiro V2) elas vem da saida, automaticamente. OC com
-- varias saidas: a PRIMEIRA. Se `data_operacao` diverge da primeira saida, manda a saida. Desligar devolve as anteriores.
-- Antes da primeira safra cadastrada do cliente, a safra fica nula, sem aviso.
--
-- POR QUE (FASE 0, docs/investigacao/fin-competencia-venda-01.md): `_oc_vincular_recebimento` nao tocava competencia nem safra
-- (o Paulo Soriano da fb64d4d6 seguia com competencia = pagamento: 22/06, 06/07, 28/08/2020, saida em 17/06/2020), e
-- `oc_vincular_lancamento` gravava `data_operacao` — a data da OC, nao a da saida (nos 8 abates divergentes, 1 dia depois).
-- A entrega (`oc_sincronizar_entregas`) ja' seguia a regra: o recebimento estava fora dela por omissao.
--
-- O QUE MUDA:
--   _oc_competencia_pela_saida(oc) NOVA — um lugar so' calcula: primeira saida realizada e viva (venda ou abate) da OC e
--     `fn_safra_sugerida(cliente, data, 'pecuaria')`. OC sem saida: nenhuma linha (quem chama nao grava nada).
--   _oc_restaurar_competencia(lancamento, evento) NOVA — a volta, lendo o evento de vinculo. Restaura so' quando o evento tem o
--     registro do vinculo pela saida E o lancamento ainda esta' com o que o vinculo gravou; senao mantem e diz por que
--     ("sem snapshot" | "editado depois do vinculo" | "nada a restaurar").
--   _oc_vincular_recebimento (bddec0fd -> 3dc56197) — conta corrente: recebimento de venda (principal de entrada no mapa) ganha
--     competencia e safra da saida; guarda de valor/pagamento/banco/conta/hash repetida depois da escrita; o evento guarda
--     competencia_anterior/safra_anterior (so' quando aplicou). Pagamento de compra: intocado.
--   oc_vincular_lancamento (970a219a -> 7b866232) — modelo por titulo: o mesmo, no lugar de `data_operacao`, so' para o principal
--     de entrada com caixa; despesa e o resto seguem a data da OC com a safra intocada, como antes. O aviso
--     `safra_diverge_da_competencia` nao sai quando a safra veio da saida. O evento ganha safra_anterior/safra_nova e a marca
--     `competencia_pela_saida`.
--   oc_desvincular_lancamento (1b667a26 -> e33e8e92) — no ramo que existe (titulo), acha o evento de vinculo da parte e chama
--     `_oc_restaurar_competencia`; o resultado vai para o evento e para o retorno (`competencia_restauro`). O ramo conta corrente
--     do desvincular e' o VOLTA-01a, que chama a mesma funcao.
--   O que NAO muda: valor, banco, data de pagamento, conciliacao, despesa, transferencia, recebimento que nao e' venda/abate, DRE
--     da conta corrente (a receita vem da entrega). Nenhuma tela.
--
-- ⚠ "VENDA EM BOITEL" FICA FORA (Gabriel, 29/09/2026): e' principal de entrada no `_oc_vinculo_mapa`, mas o recebimento de boitel
--   mantem o comportamento de antes — competencia = data da OC, safra intocada, sem a marca. Uma condicao em cada writer.
--
-- METODO: patch guardado por md5 (CLAUDE.md, DRE-DESTAQUE-LAVOURA-01): guarda de origem, cada ancora exatamente 1x, guarda de
-- destino. O md5 de destino foi calculado NO BANCO com a mesma cadeia de replace. O CONCEITO foi contado, nao so' a string:
-- `competencia_anterior` aparece 2x em oc_vincular_lancamento (evento e retorno) e os dois sao patcheados; das 2 `UPDATE
-- public.financeiro_lancamentos_v2` dele, so' a da competencia e' tocada (a outra cancela o titulo substituido).
--   _oc_vincular_recebimento   md5 ANTES bddec0fd4a19949513d4060621cdcfd6 (6.027)  DEPOIS 3dc561975c337a2e446aff7256da782e
--   oc_vincular_lancamento     md5 ANTES 970a219af3bfdbded1c9063e4e1da7c6 (28.283) DEPOIS 7b8662324d4d96c736e260889c1ce9f5
--   oc_desvincular_lancamento  md5 ANTES 1b667a265ce78ad5ce0b3409d75ec4e0 (13.433) DEPOIS e33e8e922fbbd6c118dc55d051598513
--
-- ACL refeita no fim de cada CREATE OR REPLACE, igual ao estado medido antes:
--   _oc_vincular_recebimento {postgres, service_role} (so' e' chamada por RPC SECURITY DEFINER);
--   oc_vincular_lancamento e oc_desvincular_lancamento {postgres, service_role, authenticated}.
--   As duas novas sao SECURITY INVOKER e internas: {postgres, service_role}.
--

-- ── 1. _oc_competencia_pela_saida: um lugar so' calcula a competencia e a safra do recebimento de venda/abate ──
-- Primeira saida REALIZADA e viva da OC (venda ou abate) e a safra de pecuaria da temporada dela (`fn_safra_sugerida`, a unica
-- funcao de safra — a mesma que a entrega usa). OC sem saida: nenhuma linha. Antes da primeira safra cadastrada: safra nula.
CREATE OR REPLACE FUNCTION public._oc_competencia_pela_saida(p_operacao_id uuid)
RETURNS TABLE (data_competencia date, safra_id uuid)
LANGUAGE sql STABLE SET search_path TO 'public' AS $fn$
  SELECT s.data, public.fn_safra_sugerida(o.cliente_id, s.data, 'pecuaria')
    FROM public.zoo_operacoes_comerciais o
    CROSS JOIN LATERAL (
      SELECT min(z.data) AS data
        FROM public.zoo_operacao_movimentacoes m
        JOIN public.lancamentos z ON z.id = m.movimentacao_id
       WHERE m.operacao_id = o.id AND z.tipo IN ('venda', 'abate')
         AND z.cancelado IS NOT TRUE AND coalesce(z.cenario, 'realizado') = 'realizado') s
   WHERE o.id = p_operacao_id AND s.data IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public._oc_competencia_pela_saida(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._oc_competencia_pela_saida(uuid) TO service_role;

-- ── 2. _oc_restaurar_competencia: a volta, chamada pelo desvincular (e pelo ramo conta corrente do VOLTA-01a) ──
-- Le' o evento de vinculo e devolve competencia e safra anteriores. So' restaura quando:
--   (a) o evento tem o registro do vinculo pela saida (`competencia_pela_saida` = true) — senao, "sem snapshot" e nada muda;
--   (b) o lancamento ainda esta' com o que o vinculo gravou — se alguem editou depois, a edicao vence e o motivo volta.
-- Valor, pagamento, banco, conta do plano e hash de importacao nao mudam (guarda depois da escrita).
CREATE OR REPLACE FUNCTION public._oc_restaurar_competencia(p_lancamento_id uuid, p_evento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
DECLARE
  v_ev public.zoo_operacao_eventos;
  v_l public.financeiro_lancamentos_v2;
  v_d public.financeiro_lancamentos_v2;
  v_comp_ant date; v_safra_ant uuid; v_comp_nova date; v_safra_nova uuid;
BEGIN
  SELECT * INTO v_ev FROM public.zoo_operacao_eventos WHERE id = p_evento_id;
  IF NOT FOUND OR coalesce(v_ev.detalhes->>'competencia_pela_saida', 'false') <> 'true' THEN
    RETURN jsonb_build_object('restaurado', false, 'motivo', 'sem snapshot', 'evento_id', p_evento_id);
  END IF;
  IF (v_ev.detalhes->>'lancamento_id') IS DISTINCT FROM p_lancamento_id::text THEN
    RAISE EXCEPTION 'Evento % nao e do lancamento %', p_evento_id, p_lancamento_id USING ERRCODE = 'P0001'; END IF;
  v_comp_ant  := nullif(v_ev.detalhes->>'competencia_anterior', '')::date;
  v_safra_ant := nullif(v_ev.detalhes->>'safra_anterior', '')::uuid;
  v_comp_nova := nullif(v_ev.detalhes->>'competencia_nova', '')::date;
  v_safra_nova := nullif(v_ev.detalhes->>'safra_nova', '')::uuid;

  SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  IF v_l.data_competencia IS DISTINCT FROM v_comp_nova OR v_l.safra_id IS DISTINCT FROM v_safra_nova THEN
    RETURN jsonb_build_object('restaurado', false, 'motivo', 'editado depois do vinculo', 'evento_id', p_evento_id,
      'competencia_atual', v_l.data_competencia, 'safra_atual', v_l.safra_id,
      'competencia_anterior', v_comp_ant, 'safra_anterior', v_safra_ant);
  END IF;
  IF v_l.data_competencia IS NOT DISTINCT FROM v_comp_ant AND v_l.safra_id IS NOT DISTINCT FROM v_safra_ant THEN
    RETURN jsonb_build_object('restaurado', false, 'motivo', 'nada a restaurar', 'evento_id', p_evento_id);
  END IF;

  UPDATE public.financeiro_lancamentos_v2
     SET data_competencia = v_comp_ant, safra_id = v_safra_ant, updated_at = now(), updated_by = auth.uid()
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
     OR v_d.data_competencia IS DISTINCT FROM v_comp_ant OR v_d.safra_id IS DISTINCT FROM v_safra_ant THEN
    RAISE EXCEPTION 'Restaurar a competencia mudaria valor, pagamento, conta ou hash do lancamento %; abortado', p_lancamento_id
      USING ERRCODE = 'P0001'; END IF;

  RETURN jsonb_build_object('restaurado', true, 'evento_id', p_evento_id,
    'competencia_de', v_l.data_competencia, 'competencia_para', v_comp_ant,
    'safra_de', v_l.safra_id, 'safra_para', v_safra_ant);
END;
$fn$;
REVOKE ALL ON FUNCTION public._oc_restaurar_competencia(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._oc_restaurar_competencia(uuid, uuid) TO service_role;

do $mig$
declare v_antes text; v_novo text; v_depois text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = '_oc_vincular_recebimento' and n.nspname = 'public';
  if md5(v_antes) <> 'bddec0fd4a19949513d4060621cdcfd6' then
    raise exception '_oc_vincular_recebimento nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  if (length(v_antes) - length(replace(v_antes, $a$  v_ret jsonb;
BEGIN$a$, ''))) / length($a$  v_ret jsonb;
BEGIN$a$) <> 1 then
    raise exception '_oc_vincular_recebimento: a ancora 1 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$  -- OC-CC-CLASSIFICACAO-01: a conta FICA (subcentro da operacao) e a competencia tambem; o DRE sai pela parte (gatilho).
$a$, ''))) / length($a$  -- OC-CC-CLASSIFICACAO-01: a conta FICA (subcentro da operacao) e a competencia tambem; o DRE sai pela parte (gatilho).
$a$) <> 1 then
    raise exception '_oc_vincular_recebimento: a ancora 2 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$    RAISE EXCEPTION 'Vincular recebimento nao muda o lancamento; valor, datas, conta do plano ou conta bancaria mudariam' USING ERRCODE = 'P0001'; END IF;
$a$, ''))) / length($a$    RAISE EXCEPTION 'Vincular recebimento nao muda o lancamento; valor, datas, conta do plano ou conta bancaria mudariam' USING ERRCODE = 'P0001'; END IF;
$a$) <> 1 then
    raise exception '_oc_vincular_recebimento: a ancora 3 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
    v_actor, 'rpc');$a$, ''))) / length($a$      'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
    v_actor, 'rpc');$a$) <> 1 then
    raise exception '_oc_vincular_recebimento: a ancora 4 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$                    'competencia', v_l.data_competencia,
$a$, ''))) / length($a$                    'competencia', v_l.data_competencia,
$a$) <> 1 then
    raise exception '_oc_vincular_recebimento: a ancora 5 nao casa exatamente 1x. Migration abortada.'; end if;
  v_novo := replace(replace(replace(replace(replace(v_antes, $a$  v_ret jsonb;
BEGIN$a$, $a$  v_ret jsonb;
  v_comp_ant date; v_safra_ant uuid; v_pela_saida boolean := false; v_cps_data date; v_cps_safra uuid;
BEGIN$a$), $a$  -- OC-CC-CLASSIFICACAO-01: a conta FICA (subcentro da operacao) e a competencia tambem; o DRE sai pela parte (gatilho).
$a$, $a$  -- OC-CC-CLASSIFICACAO-01: a conta FICA (subcentro da operacao); o DRE sai pela parte (gatilho). A competencia e a safra do
  -- recebimento de venda passam a ser as da saida do gado (FIN-COMPETENCIA-VENDA-01a, logo abaixo da guarda).
$a$), $a$    RAISE EXCEPTION 'Vincular recebimento nao muda o lancamento; valor, datas, conta do plano ou conta bancaria mudariam' USING ERRCODE = 'P0001'; END IF;
$a$, $a$    RAISE EXCEPTION 'Vincular recebimento nao muda o lancamento; valor, datas, conta do plano ou conta bancaria mudariam' USING ERRCODE = 'P0001'; END IF;

  -- FIN-COMPETENCIA-VENDA-01a: recebimento de venda/abate (principal de entrada no mapa) ganha competencia e safra da PRIMEIRA
  -- saida do gado da OC — a regra da entrega (`oc_sincronizar_entregas`). OC sem saida: nada muda. Valor, pagamento, banco e
  -- conta do plano ficam; a guarda repete-se depois da escrita. O anterior vai para o evento (a volta: `_oc_restaurar_competencia`).
  v_comp_ant := v_l.data_competencia; v_safra_ant := v_l.safra_id;
  IF EXISTS (SELECT 1 FROM public._oc_vinculo_mapa() m
              WHERE m.subcentro = v_l.subcentro AND m.natureza = 'principal' AND m.tipo_operacao = '1-Entradas'
                AND v_op.tipo_operacao = ANY (m.tipos_oc) AND m.subcentro <> 'Venda em Boitel') THEN  -- boitel: fora (Gabriel, 29/09)
    SELECT c.data_competencia, c.safra_id INTO v_cps_data, v_cps_safra FROM public._oc_competencia_pela_saida(p_operacao_id) c;
    IF v_cps_data IS NOT NULL THEN
      v_pela_saida := true;
      IF v_l_depois.data_competencia IS DISTINCT FROM v_cps_data OR v_l_depois.safra_id IS DISTINCT FROM v_cps_safra THEN
        UPDATE public.financeiro_lancamentos_v2
           SET data_competencia = v_cps_data, safra_id = v_cps_safra, updated_at = now(), updated_by = v_actor
         WHERE id = v_l.id;
        UPDATE public.financeiro_lancamentos_v2 SET hash_importacao = v_l.hash_importacao
         WHERE id = v_l.id AND hash_importacao IS DISTINCT FROM v_l.hash_importacao;
        SELECT * INTO v_l_depois FROM public.financeiro_lancamentos_v2 WHERE id = v_l.id;
        IF v_l_depois.hash_importacao IS DISTINCT FROM v_l.hash_importacao OR v_l_depois.valor IS DISTINCT FROM v_l.valor
           OR v_l_depois.data_pagamento IS DISTINCT FROM v_l.data_pagamento
           OR v_l_depois.conta_bancaria_id IS DISTINCT FROM v_l.conta_bancaria_id
           OR v_l_depois.conta_destino_id IS DISTINCT FROM v_l.conta_destino_id
           OR v_l_depois.plano_conta_id IS DISTINCT FROM v_l.plano_conta_id
           OR v_l_depois.data_competencia IS DISTINCT FROM v_cps_data OR v_l_depois.safra_id IS DISTINCT FROM v_cps_safra THEN
          RAISE EXCEPTION 'Competencia pela saida mudaria valor, pagamento, conta ou hash do lancamento %; abortado', v_l.id
            USING ERRCODE = 'P0001'; END IF;
      END IF;
    END IF;
  END IF;
$a$), $a$      'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
    v_actor, 'rpc');$a$, $a$      'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1)
      || CASE WHEN v_pela_saida THEN jsonb_build_object('competencia_pela_saida', true,
           'competencia_anterior', v_comp_ant, 'competencia_nova', v_l_depois.data_competencia,
           'safra_anterior', v_safra_ant, 'safra_nova', v_l_depois.safra_id) ELSE '{}'::jsonb END,
    v_actor, 'rpc');$a$), $a$                    'competencia', v_l.data_competencia,
$a$, $a$                    'competencia', v_l.data_competencia,
                    'competencia_nova', v_l_depois.data_competencia, 'safra_nova', v_l_depois.safra_id,
                    'competencia_pela_saida', v_pela_saida,
$a$);
  execute 'CREATE OR REPLACE FUNCTION public._oc_vincular_recebimento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_motivo text, p_simular boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = '_oc_vincular_recebimento' and n.nspname = 'public';
  if md5(v_depois) <> '3dc561975c337a2e446aff7256da782e' then
    raise exception '_oc_vincular_recebimento: corpo resultante inesperado (md5 %). Esperado 3dc561975c337a2e446aff7256da782e.', md5(v_depois); end if;
end $mig$;
REVOKE ALL ON FUNCTION public._oc_vincular_recebimento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_motivo text, p_simular boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._oc_vincular_recebimento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_motivo text, p_simular boolean) TO service_role;

do $mig$
declare v_antes text; v_novo text; v_depois text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_vincular_lancamento' and n.nspname = 'public';
  if md5(v_antes) <> '970a219af3bfdbded1c9063e4e1da7c6' then
    raise exception 'oc_vincular_lancamento nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  if (length(v_antes) - length(replace(v_antes, $a$  v_comp_nova date; v_mov_antigo uuid; v_movs_oc jsonb;
$a$, ''))) / length($a$  v_comp_nova date; v_mov_antigo uuid; v_movs_oc jsonb;
$a$) <> 1 then
    raise exception 'oc_vincular_lancamento: a ancora 1 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$  v_comp_nova := v_op.data_operacao;
  v_mov_antigo := v_l.movimentacao_rebanho_id;
  IF v_l.data_competencia IS DISTINCT FROM v_comp_nova OR v_mov_antigo IS NOT NULL THEN
    UPDATE public.financeiro_lancamentos_v2
       SET data_competencia = v_comp_nova, movimentacao_rebanho_id = NULL,
           updated_at = now(), updated_by = v_actor$a$, ''))) / length($a$  v_comp_nova := v_op.data_operacao;
  v_mov_antigo := v_l.movimentacao_rebanho_id;
  IF v_l.data_competencia IS DISTINCT FROM v_comp_nova OR v_mov_antigo IS NOT NULL THEN
    UPDATE public.financeiro_lancamentos_v2
       SET data_competencia = v_comp_nova, movimentacao_rebanho_id = NULL,
           updated_at = now(), updated_by = v_actor$a$) <> 1 then
    raise exception 'oc_vincular_lancamento: a ancora 2 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$  IF v_l.safra_id IS DISTINCT FROM public.fn_safra_sugerida(v_cli, v_comp_nova,$a$, ''))) / length($a$  IF v_l.safra_id IS DISTINCT FROM public.fn_safra_sugerida(v_cli, v_comp_nova,$a$) <> 1 then
    raise exception 'oc_vincular_lancamento: a ancora 3 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
      'movimentacao_rebanho_id_anterior', v_mov_antigo,$a$, ''))) / length($a$      'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
      'movimentacao_rebanho_id_anterior', v_mov_antigo,$a$) <> 1 then
    raise exception 'oc_vincular_lancamento: a ancora 4 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$                     'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
                     'hash_preservado'$a$, ''))) / length($a$                     'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
                     'hash_preservado'$a$) <> 1 then
    raise exception 'oc_vincular_lancamento: a ancora 5 nao casa exatamente 1x. Migration abortada.'; end if;
  v_novo := replace(replace(replace(replace(replace(v_antes, $a$  v_comp_nova date; v_mov_antigo uuid; v_movs_oc jsonb;
$a$, $a$  v_comp_nova date; v_mov_antigo uuid; v_movs_oc jsonb;
  v_safra_nova uuid; v_pela_saida boolean := false; v_cps_data date; v_cps_safra uuid;
$a$), $a$  v_comp_nova := v_op.data_operacao;
  v_mov_antigo := v_l.movimentacao_rebanho_id;
  IF v_l.data_competencia IS DISTINCT FROM v_comp_nova OR v_mov_antigo IS NOT NULL THEN
    UPDATE public.financeiro_lancamentos_v2
       SET data_competencia = v_comp_nova, movimentacao_rebanho_id = NULL,
           updated_at = now(), updated_by = v_actor$a$, $a$  v_comp_nova := v_op.data_operacao;
  v_safra_nova := v_l.safra_id;
  -- FIN-COMPETENCIA-VENDA-01a: recebimento de venda/abate (principal de entrada no mapa, com caixa) tem competencia e safra da
  -- PRIMEIRA saida do gado da OC — a regra da entrega. Se a data da OC diverge da saida, manda a saida. OC sem saida: segue a
  -- data da OC, safra intocada (como antes). Despesa e o resto: data da OC, safra intocada (como antes).
  IF v_regra.natureza = 'principal' AND v_regra.tipo_operacao = '1-Entradas' AND NOT coalesce(v_l.sem_movimentacao_caixa, false)
     AND v_l.subcentro <> 'Venda em Boitel' THEN  -- boitel: fora da regra, segue a data da OC (Gabriel, 29/09/2026)
    SELECT c.data_competencia, c.safra_id INTO v_cps_data, v_cps_safra FROM public._oc_competencia_pela_saida(p_operacao_id) c;
    IF v_cps_data IS NOT NULL THEN
      v_pela_saida := true; v_comp_nova := v_cps_data; v_safra_nova := v_cps_safra;
    END IF;
  END IF;
  v_mov_antigo := v_l.movimentacao_rebanho_id;
  IF v_l.data_competencia IS DISTINCT FROM v_comp_nova OR v_mov_antigo IS NOT NULL OR v_l.safra_id IS DISTINCT FROM v_safra_nova THEN
    UPDATE public.financeiro_lancamentos_v2
       SET data_competencia = v_comp_nova, movimentacao_rebanho_id = NULL, safra_id = v_safra_nova,
           updated_at = now(), updated_by = v_actor$a$), $a$  IF v_l.safra_id IS DISTINCT FROM public.fn_safra_sugerida(v_cli, v_comp_nova,$a$, $a$  IF NOT v_pela_saida AND v_l.safra_id IS DISTINCT FROM public.fn_safra_sugerida(v_cli, v_comp_nova,$a$), $a$      'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
      'movimentacao_rebanho_id_anterior', v_mov_antigo,$a$, $a$      'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
      'safra_anterior', v_l.safra_id, 'safra_nova', v_safra_nova, 'competencia_pela_saida', v_pela_saida,
      'movimentacao_rebanho_id_anterior', v_mov_antigo,$a$), $a$                     'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
                     'hash_preservado'$a$, $a$                     'competencia_anterior', v_l.data_competencia, 'competencia_nova', v_comp_nova,
                     'safra_anterior', v_l.safra_id, 'safra_nova', v_safra_nova, 'competencia_pela_saida', v_pela_saida,
                     'hash_preservado'$a$);
  execute 'CREATE OR REPLACE FUNCTION public.oc_vincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_componente text, p_motivo text, p_compromisso_id uuid DEFAULT NULL::uuid, p_parcela_id uuid DEFAULT NULL::uuid, p_criar_novo boolean DEFAULT false, p_simular boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_vincular_lancamento' and n.nspname = 'public';
  if md5(v_depois) <> '7b8662324d4d96c736e260889c1ce9f5' then
    raise exception 'oc_vincular_lancamento: corpo resultante inesperado (md5 %). Esperado 7b8662324d4d96c736e260889c1ce9f5.', md5(v_depois); end if;
end $mig$;
REVOKE ALL ON FUNCTION public.oc_vincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_componente text, p_motivo text, p_compromisso_id uuid, p_parcela_id uuid, p_criar_novo boolean, p_simular boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_vincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_componente text, p_motivo text, p_compromisso_id uuid, p_parcela_id uuid, p_criar_novo boolean, p_simular boolean) TO authenticated, service_role;

do $mig$
declare v_antes text; v_novo text; v_depois text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_desvincular_lancamento' and n.nspname = 'public';
  if md5(v_antes) <> '1b667a265ce78ad5ce0b3409d75ec4e0' then
    raise exception 'oc_desvincular_lancamento nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  if (length(v_antes) - length(replace(v_antes, $a$  v_nova int;
  v_ret jsonb;
BEGIN$a$, ''))) / length($a$  v_nova int;
  v_ret jsonb;
BEGIN$a$) <> 1 then
    raise exception 'oc_desvincular_lancamento: a ancora 1 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$   RETURNING * INTO v_l_depois;
$a$, ''))) / length($a$   RETURNING * INTO v_l_depois;
$a$) <> 1 then
    raise exception 'oc_desvincular_lancamento: a ancora 2 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      'classificacao_de', v_classif_de,
$a$, ''))) / length($a$      'classificacao_de', v_classif_de,
$a$) <> 1 then
    raise exception 'oc_desvincular_lancamento: a ancora 3 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$    'conciliacao', jsonb_build_object('vinculos_antes', v_cbi_antes, 'vinculos_depois', v_cbi_depois),$a$, ''))) / length($a$    'conciliacao', jsonb_build_object('vinculos_antes', v_cbi_antes, 'vinculos_depois', v_cbi_depois),$a$) <> 1 then
    raise exception 'oc_desvincular_lancamento: a ancora 4 nao casa exatamente 1x. Migration abortada.'; end if;
  v_novo := replace(replace(replace(replace(v_antes, $a$  v_nova int;
  v_ret jsonb;
BEGIN$a$, $a$  v_nova int;
  v_ret jsonb;
  v_evento_vinculo uuid; v_restauro jsonb;
BEGIN$a$), $a$   RETURNING * INTO v_l_depois;
$a$, $a$   RETURNING * INTO v_l_depois;

  -- FIN-COMPETENCIA-VENDA-01a: devolve competencia e safra que o vinculo pela saida trocou (o evento de vinculo da parte guarda o
  -- anterior). Vinculo sem esse registro — antigo, despesa — fica como esta' e o motivo vai para o evento.
  SELECT e.id INTO v_evento_vinculo FROM public.zoo_operacao_eventos e
   WHERE e.operacao_id = p_operacao_id AND e.acao IN ('vincular_lancamento', 'vincular_recebimento')
     AND e.detalhes->>'parte_id' = v_parte.id::text
   ORDER BY e.created_at DESC LIMIT 1;
  v_restauro := public._oc_restaurar_competencia(v_l.id, v_evento_vinculo);
  IF coalesce((v_restauro->>'restaurado')::boolean, false) THEN
    SELECT * INTO v_l_depois FROM public.financeiro_lancamentos_v2 WHERE id = v_l.id;
  END IF;
$a$), $a$      'classificacao_de', v_classif_de,
$a$, $a$      'classificacao_de', v_classif_de,
      'competencia_restauro', v_restauro,
$a$), $a$    'conciliacao', jsonb_build_object('vinculos_antes', v_cbi_antes, 'vinculos_depois', v_cbi_depois),$a$, $a$    'competencia_restauro', v_restauro,
    'conciliacao', jsonb_build_object('vinculos_antes', v_cbi_antes, 'vinculos_depois', v_cbi_depois),$a$);
  execute 'CREATE OR REPLACE FUNCTION public.oc_desvincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_motivo text, p_plano_conta_id uuid DEFAULT NULL::uuid, p_simular boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_desvincular_lancamento' and n.nspname = 'public';
  if md5(v_depois) <> 'e33e8e922fbbd6c118dc55d051598513' then
    raise exception 'oc_desvincular_lancamento: corpo resultante inesperado (md5 %). Esperado e33e8e922fbbd6c118dc55d051598513.', md5(v_depois); end if;
end $mig$;
REVOKE ALL ON FUNCTION public.oc_desvincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_motivo text, p_plano_conta_id uuid, p_simular boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_desvincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_motivo text, p_plano_conta_id uuid, p_simular boolean) TO authenticated, service_role;
