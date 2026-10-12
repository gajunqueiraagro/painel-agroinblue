-- OC-CC-PADRAO-NOVAS-01a (Gabriel, 12/10/2026): VENDA E COMPRA NOVAS NASCEM EM CONTA CORRENTE.
-- Nasce do incidente e8fec78b (NJ, 12/10): a OC-TITULO-PARA-CC-01b migrou as OCs existentes e o caminho de CRIACAO continuou
-- nascendo 'titulo' (o unico INSERT, `oc_salvar_rascunho`, nao citava o modelo: valia o default da coluna).
--   D1  o default da coluna CONTINUA 'titulo' (rede segura); a regra mora em _oc_modelo_ao_nascer e o INSERT grava explicito.
--   D2  (so' o sentido "marcar boitel" neste PR) venda em conta corrente que vira boitel passa a 'titulo' se nao tem entrega,
--       explicacao nem recebimento de conta corrente vivos; se tem, recusa com frase. "Desmarcar" nao existe no banco nem na tela
--       (fila OC-BOITEL-DESMARCAR-01).
--   D3  oc_conta_corrente: sem entrega viva nem recebimento, a situacao e' 'aguardando_saida' (era 'quitado').
-- O GANCHO DA SAIDA (sincronizar entregas ao registrar / estornar / adotar / encerrar / receber / desvincular) NAO esta' aqui:
-- vai no 01b, com a tela lendo a versao devolvida.
-- Quatro corpos por PATCH GUARDADO POR md5 (origem, cada ancora 1x, destino); reexecutar sobre o corpo ja' corrigido nao faz nada.
--   oc_salvar_rascunho  a0962e254afb86702a1c336b6b5d3775 -> 51489be17b046424363d499e55dcd314 (3 ancoras: a coluna, o valor e o evento do nascimento)
--   oc_salvar_boitel    8dae7c1b5d220f6095359214586f22a7 -> 9490eab50bd5b32b8d1e0f5cd896de64    (1 ancora: D2 depois da conferencia de versao)
--   oc_conta_corrente   9e1a80a8c44b12409d5ddcafb01fa74c -> 578c1c664eee6d7f1927b84c1757a028        (2 ancoras: a contagem e a situacao)
--   oc_criar_do_legado  722da4354d04ff44a45c727cd2a7749a -> 0206457bb46a349de358c70fc05f5ff2    (3 ancoras: o UPDATE + evento + versao so' quando o
--                       modelo ainda nao e' conta corrente; a sincronizacao recebe a versao LIDA)
-- NENHUM DADO E' ALTERADO. Nenhuma assinatura muda; ACL, SECURITY e search_path preservados (so' o corpo troca).

CREATE OR REPLACE FUNCTION public._oc_modelo_ao_nascer(p_tipo text, p_boitel boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- O UNICO dono de "em que modelo financeiro esta OC nasce": venda e compra sem boitel em conta corrente; abate e boitel em titulo.
  select case when p_tipo in ('venda', 'compra') and coalesce(p_boitel, false) = false then 'conta_corrente' else 'titulo' end
$function$;
REVOKE ALL ON FUNCTION public._oc_modelo_ao_nascer(text, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp._oc_cc_01a_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO STRICT v_src, v_def FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'OC-CC-PADRAO-NOVAS-01a: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'OC-CC-PADRAO-NOVAS-01a: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'OC-CC-PADRAO-NOVAS-01a: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'OC-CC-PADRAO-NOVAS-01a: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
END $patch$;

-- 1. oc_salvar_rascunho: o INSERT grava o modelo do dono, e o nascimento deixa o evento (de nulo para o valor)
SELECT pg_temp._oc_cc_01a_patch('oc_salvar_rascunho', 'a0962e254afb86702a1c336b6b5d3775', '51489be17b046424363d499e55dcd314', ARRAY[
$a$observacoes, status_comercial, rascunho, status_financeiro, versao, created_by, updated_by)$a$,
$b$observacoes, status_comercial, rascunho, status_financeiro, versao, created_by, updated_by, modelo_financeiro)$b$,
$a$p_payload->>'observacoes', 'programada', true, 'nao_aplicavel', 1, v_actor, v_actor)$a$,
$b$p_payload->>'observacoes', 'programada', true, 'nao_aplicavel', 1, v_actor, v_actor,
      -- OC-CC-PADRAO-NOVAS-01a: o modelo ao nascer tem um dono; o default da coluna ('titulo') e' so' a rede segura
      public._oc_modelo_ao_nascer(p_payload->>'tipo_operacao', false))$b$,
$a$VALUES (p_cliente_id, v_id, 'criar_rascunho', p_payload, v_actor, 'rpc');$a$,
$b$VALUES (p_cliente_id, v_id, 'criar_rascunho', p_payload, v_actor, 'rpc');
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
    VALUES (p_cliente_id, v_id, 'definir_modelo_financeiro', jsonb_build_object('modelo_financeiro', NULL),
            jsonb_build_object('modelo_financeiro', public._oc_modelo_ao_nascer(p_payload->>'tipo_operacao', false)),
            jsonb_build_object('motivo', 'modelo ao nascer', 'tipo_operacao', p_payload->>'tipo_operacao'), v_actor, 'rpc');$b$]);

-- 2. oc_salvar_boitel: marcar boitel numa venda em conta corrente (D2, so' este sentido)
SELECT pg_temp._oc_cc_01a_patch('oc_salvar_boitel', '8dae7c1b5d220f6095359214586f22a7', '9490eab50bd5b32b8d1e0f5cd896de64', ARRAY[
$a$RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;$a$,
$b$RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  -- OC-CC-PADRAO-NOVAS-01a (D2) — BOITEL E' TITULO. A venda nasce em conta corrente sem o banco saber que e' boitel (boitel e' a
  -- existencia da linha que esta funcao grava): ao marcar, o modelo passa ao do dono (`_oc_modelo_ao_nascer(tipo, true)`), se a
  -- conta corrente ainda nao tem nada vivo; se tem, recusa. O +1 da versao e' o desta propria chamada (um so').
  IF v_op.modelo_financeiro IS DISTINCT FROM public._oc_modelo_ao_nascer(v_op.tipo_operacao, true) THEN
    IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
                WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false
                  AND (pt.origem IN ('entrega', 'explicacao') OR pt.componente = 'recebimento')) THEN
      RAISE EXCEPTION 'Esta venda ja tem financeiro em conta corrente; desfaca antes de marcar boitel' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.zoo_operacoes_comerciais
       SET modelo_financeiro = public._oc_modelo_ao_nascer(v_op.tipo_operacao, true), updated_at = now(), updated_by = v_actor
     WHERE id = p_operacao_id;
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
    VALUES (p_cliente_id, p_operacao_id, 'definir_modelo_financeiro', jsonb_build_object('modelo_financeiro', v_op.modelo_financeiro),
            jsonb_build_object('modelo_financeiro', public._oc_modelo_ao_nascer(v_op.tipo_operacao, true)),
            jsonb_build_object('motivo', 'venda marcada como boitel', 'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
            v_actor, 'rpc');
  END IF;$b$]);

-- 3. oc_conta_corrente: sem entrega viva nem recebimento, a situacao e' 'aguardando_saida' (D3)
SELECT pg_temp._oc_cc_01a_patch('oc_conta_corrente', '9e1a80a8c44b12409d5ddcafb01fa74c', '578c1c664eee6d7f1927b84c1757a028', ARRAY[
$a$count(*) FILTER (WHERE tipo = 'recebimento' AND status = 'sem_conta_bancaria') AS sem_conta$a$,
$b$count(*) FILTER (WHERE tipo = 'recebimento' AND status = 'sem_conta_bancaria') AS sem_conta,
           count(*) FILTER (WHERE tipo IN ('entrega', 'recebimento')) AS n_mov$b$,
$a$'situacao', CASE WHEN op.tipo_operacao = 'compra' THEN CASE$a$,
$b$'situacao', CASE WHEN tot.n_mov = 0 THEN 'aguardando_saida'   -- OC-CC-PADRAO-NOVAS-01a (D3): nada saiu e nada foi pago
                     WHEN op.tipo_operacao = 'compra' THEN CASE$b$]);

-- 4. oc_criar_do_legado: a OC ja' nasce em conta corrente — o UPDATE, o evento e o +1 so' quando o modelo ainda nao e' esse
SELECT pg_temp._oc_cc_01a_patch('oc_criar_do_legado', '722da4354d04ff44a45c727cd2a7749a', '0206457bb46a349de358c70fc05f5ff2', ARRAY[
$a$update public.zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente', versao = versao + 1, updated_at = now(),$a$,
$b$-- OC-CC-PADRAO-NOVAS-01a: so' quando a OC ainda nao nasceu em conta corrente (hoje ela nasce; o trecho fica como rede)
    if (select o.modelo_financeiro from public.zoo_operacoes_comerciais o where o.id = v_op) is distinct from 'conta_corrente' then
    update public.zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente', versao = versao + 1, updated_at = now(),$b$,
$a$jsonb_build_object('motivo', v_motivo, 'versao_anterior', v_ver, 'versao_nova', v_ver + 1), v_actor, 'rpc');$a$,
$b$jsonb_build_object('motivo', v_motivo, 'versao_anterior', v_ver, 'versao_nova', v_ver + 1), v_actor, 'rpc');
    end if;$b$,
$a$perform public.oc_sincronizar_entregas(v_op, v_ver + 1, false);$a$,
$b$perform public.oc_sincronizar_entregas(v_op, (select o.versao from public.zoo_operacoes_comerciais o where o.id = v_op), false);$b$]);

DROP FUNCTION pg_temp._oc_cc_01a_patch(text, text, text, text[]);

DO $confere$
begin
  if has_function_privilege('anon', 'public._oc_modelo_ao_nascer(text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._oc_modelo_ao_nascer(text, boolean)', 'EXECUTE') then
    raise exception 'OC-CC-PADRAO-NOVAS-01a: _oc_modelo_ao_nascer nao pode ser executavel pela tela';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and p.proname in ('oc_salvar_rascunho', 'oc_salvar_boitel', 'oc_conta_corrente', 'oc_criar_do_legado')
              and (has_function_privilege('anon', p.oid, 'EXECUTE') or not has_function_privilege('authenticated', p.oid, 'EXECUTE'))) then
    raise exception 'OC-CC-PADRAO-NOVAS-01a: ACL das quatro funcoes mudou';
  end if;
end
$confere$;
