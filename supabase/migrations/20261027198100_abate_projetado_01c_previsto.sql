-- ABATE-PROJETADO-01c (Gabriel, 14/10/2026) — O RECEBIMENTO DO ABATE PROJETADO NASCE PREVISTO, E A SAIDA O PROMOVE A PROGRAMADO.
--   O abate em cenario Projetado e' previsao de caixa: a OC e' aberta antes de embarcar e o recebimento esperado tem de aparecer no
--   caixa do mes como PREVISTO (nunca Programado). Quando o gado sai (ou o realizado e' salvo), o MESMO lancamento vira programado —
--   mesmo valor; a diferenca para o realizado aparece no saldo do conta corrente, como ja' acontece. Sem duplicar, sem orfao.
--   SO' CONTA CORRENTE (decisao do Gabriel): o modelo titulo segue 'programado' (la' o titulo compoe o DRE, e o DRE nao filtra status).
--   SO' O PRINCIPAL (o recebimento): as despesas da OC lancadas pelo modal seguem 'programado' (o gancho so' promove recebimento).
-- A REGRA TEM UM DONO: `_oc_cc_recebimento_previsto(op)` = abate, conta corrente, com linha projetada, SEM linha realizada e SEM saida
--   viva. Le^ dela o lancar (para nascer previsto) e o gancho (para promover quando ela deixa de valer).
-- PATCH GUARDADO POR md5 (origem, cada ancora 1x, destino); reexecutar sobre o corpo ja' corrigido nao faz nada.
--   oc_lancar_pelo_modal   26cdf425a87e9d5cc1cbec36e2b7e708 -> 1cb63f21235778680d1873ebd84d1e60
--   _oc_cc_gancho_entregas 54a60bc98f83e0a0b625560a64da7749 -> c780657e58dd81516cbd23f2e8595256
--   oc_salvar_abate        d8052ef60309c278e86d18e1125d22b6 -> 82d87c697a37734e2df09f3543053448
--   oc_conta_corrente      6cae1d831171a7b8a9507d011f11f837 -> 41692a133d12f9bc35bc10d6f8ab822f
--   (o extrato devolve o status 'previsto' do recebimento; antes ele caia no ELSE e saia 'realizado' — a tela le^ o que o banco diz)
--   oc_conta_corrente_lote 87e896f4f753b2cd171979b66c09b8e6 -> b431d3de3340e4b0e1a3fc2a3d0ad924
--   (os `programados` da Central — o "Falta receber" do Resumo/PDF — contam tambem o recebimento previsto)
-- O ACORDADO DO ABATE SO' PROJETADO (Gabriel, 14/10): SO' EM CONTA CORRENTE, enquanto a OC nao tiver linha realizada, salvar o projetado grava o
--   valor_acordado = soma do projetado e recalcula o rascunho (a OC sai do rascunho e o modal pode lancar); com realizado, vale o
--   realizado, como sempre. Mesmo dono (oc_salvar_abate), sem calculo paralelo. Carcaca e rendimento do cabecalho seguem so' do
--   realizado; o espelho no lancamento zootecnico (_oc_sync_abate_lancamento, que le^ o realizado) tambem.
-- So' o corpo das cinco troca (ACL, SECURITY DEFINER e search_path preservados) e nasce a interna da regra (fechada: so' service_role).
-- Nenhum DDL em tabela, nenhum dado.

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._oc_cc_recebimento_previsto(p_operacao_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.zoo_operacoes_comerciais o
     WHERE o.id = p_operacao_id AND o.tipo_operacao = 'abate' AND o.modelo_financeiro = 'conta_corrente'
       AND EXISTS (SELECT 1 FROM public.zoo_operacao_abate a WHERE a.operacao_id = o.id AND a.cenario = 'projetado')
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_abate a WHERE a.operacao_id = o.id AND a.cenario = 'realizado')
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos z ON z.id = m.movimentacao_id
                        WHERE m.operacao_id = o.id AND z.cancelado IS NOT TRUE));
$fn$;
REVOKE ALL ON FUNCTION public._oc_cc_recebimento_previsto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._oc_cc_recebimento_previsto(uuid) TO service_role;

CREATE OR REPLACE FUNCTION pg_temp._abate_projetado_01c_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int; v_acl text; v_sec boolean; v_cfg text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proacl::text, p.prosecdef, p.proconfig::text
    INTO STRICT v_src, v_def, v_acl, v_sec, v_cfg FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'ABATE-PROJETADO-01c: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'ABATE-PROJETADO-01c: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'ABATE-PROJETADO-01c: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'ABATE-PROJETADO-01c: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM p_destino
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_acl
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_sec
     OR (SELECT p.proconfig::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION 'ABATE-PROJETADO-01c: %: destino, ACL, SECURITY ou search_path nao conferem depois da troca', p_nome; END IF;
END $patch$;

SELECT pg_temp._abate_projetado_01c_patch('oc_lancar_pelo_modal', '26cdf425a87e9d5cc1cbec36e2b7e708', '1cb63f21235778680d1873ebd84d1e60', ARRAY[
$a$  v_base numeric; v_cc jsonb; v_excesso numeric; v_avisos jsonb := '[]'::jsonb; v_ret jsonb;$a$,
$b$  v_base numeric; v_cc jsonb; v_excesso numeric; v_avisos jsonb := '[]'::jsonb; v_ret jsonb;
  v_status text := 'programado';   -- ABATE-PROJETADO-01c: o status que os titulos receberam$b$,
$a$   WHERE f.id = ANY (v_titulos);$a$,
$b$   WHERE f.id = ANY (v_titulos);

  -- ABATE-PROJETADO-01c: o recebimento do abate SO' PROJETADO (sem realizado, sem saida) nasce PREVISTO — o dono da regra decide.
  IF p_natureza = 'principal' AND public._oc_cc_recebimento_previsto(p_operacao_id) THEN
    UPDATE public.financeiro_lancamentos_v2 f SET status_transacao = 'previsto'
     WHERE f.id = ANY (v_titulos) AND f.status_transacao = 'programado';
    v_status := 'previsto';
  END IF;$b$,
$a$    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_ver END);$a$,
$b$    'operacao_id', p_operacao_id, 'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_ver END,
    'status_transacao', v_status);$b$]);

SELECT pg_temp._abate_projetado_01c_patch('_oc_cc_gancho_entregas', '54a60bc98f83e0a0b625560a64da7749', 'c780657e58dd81516cbd23f2e8595256', ARRAY[
$a$  v_x jsonb; v_avisos jsonb := '[]'::jsonb; v_sinc boolean := false; v_mes text;$a$,
$b$  v_x jsonb; v_avisos jsonb := '[]'::jsonb; v_sinc boolean := false; v_mes text;
  v_prom int := 0;   -- ABATE-PROJETADO-01c: recebimentos previstos promovidos a programado$b$,
$a$  END IF;
  RETURN jsonb_build_object($a$,
$b$  END IF;
  -- ABATE-PROJETADO-01c: com saida (ou realizado) o abate deixa de ser so' projetado — o recebimento PREVISTO vira PROGRAMADO, o mesmo
  -- lancamento e o mesmo valor. Em conta corrente, so' o principal (o recebimento) da OC, por parte viva.
  IF v_op.modelo_financeiro = 'conta_corrente' AND v_op.tipo_operacao = 'abate'
     AND NOT public._oc_cc_recebimento_previsto(p_operacao_id) THEN
    UPDATE public.financeiro_lancamentos_v2 f SET status_transacao = 'programado', updated_at = now(), updated_by = auth.uid()
     WHERE f.status_transacao = 'previsto' AND f.cancelado IS NOT TRUE
       AND f.id IN (SELECT pa.financeiro_lancamento_id FROM public.zoo_operacao_partes pa
                     WHERE pa.operacao_id = p_operacao_id AND pa.cancelada IS NOT TRUE
                       AND pa.natureza = 'principal' AND pa.componente = 'recebimento');
    GET DIAGNOSTICS v_prom = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object($b$,
$a$    'canceladas', coalesce(jsonb_array_length(v_x->'canceladas'), 0));$a$,
$b$    'canceladas', coalesce(jsonb_array_length(v_x->'canceladas'), 0),
    'promovidos', v_prom);$b$]);

SELECT pg_temp._abate_projetado_01c_patch('oc_salvar_abate', 'd8052ef60309c278e86d18e1125d22b6', '82d87c697a37734e2df09f3543053448', ARRAY[
$a$  v_n int := 0;
BEGIN$a$,
$b$  v_n int := 0;
  v_cen text;   -- ABATE-PROJETADO-01c: o cenario que manda no cabecalho (realizado, se houver; senao projetado)
BEGIN$b$,
$a$  IF p_cenario = 'realizado' THEN
    UPDATE public.zoo_operacoes_comerciais o SET
      valor_acordado$a$,
$b$  -- ABATE-PROJETADO-01c: em CONTA CORRENTE e sem linha realizada, o acordado e' a soma do PROJETADO (e o rascunho e' recalculado
  --   abaixo); com realizado, vale o realizado. Salvar o projetado de uma OC que ja' tem realizado nao toca o cabecalho (como antes).
  --   No modelo TITULO o projetado fica como sempre (nao preenche acordado, nao tira do rascunho): la' o compromisso gerado iria ao
  --   DRE como receita (o DRE nao filtra status) — receita projetada no realizado.
  v_cen := CASE WHEN v_op.modelo_financeiro IS DISTINCT FROM 'conta_corrente'
                  OR EXISTS (SELECT 1 FROM public.zoo_operacao_abate a WHERE a.operacao_id = p_operacao_id AND a.cenario = 'realizado')
                THEN 'realizado' ELSE 'projetado' END;
  IF p_cenario = v_cen THEN
    IF v_cen = 'projetado' THEN
      UPDATE public.zoo_operacoes_comerciais o SET
        valor_acordado = (SELECT sum(a.valor_liquido) FROM public.zoo_operacao_abate a WHERE a.operacao_id = p_operacao_id AND a.cenario = 'projetado')
      WHERE o.id = p_operacao_id;
    ELSE
    UPDATE public.zoo_operacoes_comerciais o SET
      valor_acordado$b$,
$a$          FROM public.zoo_operacao_abate a WHERE a.operacao_id = p_operacao_id AND a.cenario = 'realizado')
    WHERE o.id = p_operacao_id;$a$,
$b$          FROM public.zoo_operacao_abate a WHERE a.operacao_id = p_operacao_id AND a.cenario = 'realizado')
    WHERE o.id = p_operacao_id;
    END IF;$b$,
$a$    PERFORM public._oc_sync_abate_lancamento(p_operacao_id);$a$,
$b$    IF v_cen = 'realizado' THEN   -- ABATE-PROJETADO-01c: o lancamento zootecnico so' guarda o realizado
      PERFORM public._oc_sync_abate_lancamento(p_operacao_id);
    END IF;$b$]);

SELECT pg_temp._abate_projetado_01c_patch('oc_conta_corrente', '6cae1d831171a7b8a9507d011f11f837', '41692a133d12f9bc35bc10d6f8ab822f', ARRAY[
$a$                WHEN v.f_status IN ('programado', 'agendado') THEN 'programado'$a$,
$b$                WHEN v.f_status = 'previsto' THEN 'previsto'   -- ABATE-PROJETADO-01c: o recebimento do abate so' projetado
                WHEN v.f_status IN ('programado', 'agendado') THEN 'programado'$b$]);

SELECT pg_temp._abate_projetado_01c_patch('oc_conta_corrente_lote', '87e896f4f753b2cd171979b66c09b8e6', 'b431d3de3340e4b0e1a3fc2a3d0ad924', ARRAY[
$a$       WHERE e ->> 'tipo' = 'recebimento' AND e ->> 'status' = 'programado';$a$,
$b$       WHERE e ->> 'tipo' = 'recebimento' AND e ->> 'status' IN ('programado', 'previsto');   -- ABATE-PROJETADO-01c: o previsto tambem falta receber$b$]);
