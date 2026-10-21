-- CONC-LIGAR-FUTURO-01a (Gabriel, 21/10/2026) — ligar o extrato ao lancamento de vencimento futuro. So' BANCO; a tela vem com mock.
-- Base (CONC-BAIXA-NO-VINCULO-01): `fn_extratos_espelhados` so' trazia candidato com data_vencimento <= fim do mes do extrato; a funcao
-- de vinculo aceita futuro. O Vivo de 01/09 (conta de outubro paga adiantada) nao aparecia.
--
-- (1) `fn_conc_buscar_para_ligar(extrato, texto, limite)` — busca LIVRE para ligar um extrato: lancamento em aberto (previsto,
--     programado, agendado; recorrencia, parcela, OC, saldo, avulso), da mesma conta OU sem conta, do MESMO SINAL do extrato, SEM
--     limite de data. Casa por fornecedor (a busca unica da casa, `fn_fornecedor_buscar`: nome, fantasia, apelidos, documento),
--     descricao, valor (com ou sem pontuacao: 506,51 / 506.51 / R$ 1.234,56 / 1234,56) e numero do documento. Ordem: valor igual ao
--     do extrato > nome casando > vencimento mais perto da data do extrato. Devolve vencimento, competencia, status, origem, valor,
--     o que ja' foi aplicado, o livre e a diferenca para o extrato.
-- (2) `fn_extratos_espelhados`: os candidatos automaticos alcancam tambem o MES SEGUINTE (conta paga adiantada), numa chave NOVA,
--     `sistema_candidatos_adiantados` (cada um com `adiantado: true`), depois dos do proprio mes. Chave nova, e nao dentro de
--     `sistema_candidatos`, porque a Mesa do dia (`mesaDoDia.ts`) abre um DIA por vencimento de candidato: misturar mudaria a tela
--     antes do mock. `sistema_candidatos` fica como estava; versao 'espelhados-06-adiantados'.
-- (3) Valor diferente: so' a recorrencia A CONFIRMAR (`financeiro_recorrencias.tipo_valor = 'estimado'`, o "A confirmar" da tela)
--     aceita o valor do extrato — `fn_conc_ligar_com_valor_real`, a mesma de antes (sem segunda forma), agora so' para ela. Valor
--     certo com extrato MAIOR: o 1:1 recusa com frase pronta (antes, `sobre_aplicacao: ...` cru); MENOR: divide
--     (CONC-BAIXA-NO-VINCULO-01).
-- Trocas guardadas pelo md5 de ORIGEM; cada trecho tem de aparecer UMA vez.

SET LOCAL lock_timeout = '3s';

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'CONC-LIGAR-FUTURO-01a: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'CONC-LIGAR-FUTURO-01a: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

-- ═══════════════════ 2. CANDIDATOS DO ESPELHO: O MES SEGUINTE, A PARTE ═══════════════════
SELECT pg_temp._trocar('public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure, 'a3da29058dd5f6c329c4ff51868aeb1d', ARRAY[
  $a$AND l.data_vencimento <= pp.d2 AND l.cancelado = false$a$,
  $a$AND l.data_vencimento <= (pp.d1 + INTERVAL '2 month' - INTERVAL '1 day')::date AND l.cancelado = false$a$,
  $b$(l.data_vencimento < pp.d1) AS vencido,$b$,
  $b$(l.data_vencimento < pp.d1) AS vencido, (l.data_vencimento > pp.d2) AS adiantado,$b$,
  $c$'sem_conta',sem_conta) ORDER BY data_vencimento, id),'[]'::jsonb) FROM cand),$c$,
  $c$'sem_conta',sem_conta) ORDER BY data_vencimento, id),'[]'::jsonb) FROM cand WHERE NOT adiantado),
'sistema_candidatos_adiantados',(SELECT COALESCE(jsonb_agg(jsonb_build_object('lancamento_id',id,'data_vencimento',data_vencimento,'competencia',data_competencia,'valor',valor,'valor_assinado',v,'sinal',sinal,'descricao',descricao,'centro',centro_custo,'subcentro',subcentro,'status_transacao',status_transacao,'cenario',cenario,'cultura',cultura,'numero_documento',numero_documento,'tipo_documento',tipo_documento,'favorecido_id',favorecido_id,'fornecedor',fornecedor,'safra_codigo',safra_codigo,'safra_descricao',safra_descricao,'vencido',false,'adiantado',true,'ja_conciliado',ja_conciliado,'sem_conta',sem_conta) ORDER BY data_vencimento, id),'[]'::jsonb) FROM cand WHERE adiantado),$c$,
  $d$'versao','espelhados-05-caixa'$d$,
  $d$'versao','espelhados-06-adiantados'$d$
]);

-- ═══════════════════ 3a. O 1:1 COM EXTRATO MAIOR QUE O LANCAMENTO: FRASE PRONTA ═══════════════════
SELECT pg_temp._trocar('public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure, 'b090d0cd3bc5d7512526152994ceae85', ARRAY[
  $e$RAISE EXCEPTION 'sobre_aplicacao: valor (%) excede o saldo livre do lancamento', v_valor;$e$,
  $e$-- CONC-LIGAR-FUTURO-01a: frase pronta. A recorrencia A CONFIRMAR aceita o valor do extrato por `fn_conc_ligar_com_valor_real`.
    RAISE EXCEPTION '%', CASE WHEN EXISTS (SELECT 1 FROM public.financeiro_recorrencias rr WHERE rr.id = v_lan.recorrencia_id AND rr.tipo_valor = 'estimado')
        THEN format('O extrato de %s é maior que o lançamento (%s em aberto). A recorrência é a confirmar: ligue aceitando o valor do extrato. Nada foi gravado.',
                    public._fn_oc_brl(v_valor), public._fn_oc_brl(abs(v_lan.valor) - public._fn_lancamento_aplicado_vivo(p_lancamento_id)))
        ELSE format('O extrato de %s é maior que o lançamento (%s em aberto). Corrija o valor do lançamento antes de ligar. Nada foi gravado.',
                    public._fn_oc_brl(v_valor), public._fn_oc_brl(abs(v_lan.valor) - public._fn_lancamento_aplicado_vivo(p_lancamento_id))) END
      USING ERRCODE = 'P0001', DETAIL = p_lancamento_id::text;$e$
]);

-- ═══════════════════ 3b. VALOR DO EXTRATO: SO' A RECORRENCIA A CONFIRMAR ═══════════════════
SELECT pg_temp._trocar('public.fn_conc_ligar_com_valor_real(uuid, uuid, text)'::regprocedure, '1d8e38226312f96a0a8c9701767ec1e7', ARRAY[
  $g$IF l.recorrencia_id IS NULL OR l.status_transacao NOT IN ('previsto', 'programado', 'agendado') OR l.cancelado IS TRUE THEN
    RAISE EXCEPTION 'Só a recorrência ainda em aberto aceita o valor do extrato. Nada foi gravado.' USING ERRCODE = 'P0001';$g$,
  $g$-- CONC-LIGAR-FUTURO-01a: so' a recorrencia A CONFIRMAR (tipo_valor 'estimado'); o valor certo com diferenca recusa (maior) ou divide (menor)
  IF l.recorrencia_id IS NULL OR l.status_transacao NOT IN ('previsto', 'programado', 'agendado') OR l.cancelado IS TRUE
     OR NOT EXISTS (SELECT 1 FROM public.financeiro_recorrencias rr WHERE rr.id = l.recorrencia_id AND rr.tipo_valor = 'estimado') THEN
    RAISE EXCEPTION 'Só a recorrência a confirmar, ainda em aberto, aceita o valor do extrato. Nada foi gravado.' USING ERRCODE = 'P0001';$g$
]);
REVOKE ALL ON FUNCTION public.fn_conc_ligar_com_valor_real(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conc_ligar_com_valor_real(uuid, uuid, text) TO authenticated, service_role;

-- ═══════════════════ 1. A BUSCA LIVRE PARA LIGAR UM EXTRATO ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_conc_buscar_para_ligar(p_extrato_id uuid, p_texto text DEFAULT NULL, p_limite integer DEFAULT 30)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE
  e public.extrato_bancario_v2; v_q text := coalesce(public._fn_normalizar_texto(p_texto), '');
  v_d text := public._fn_fornecedor_busca_digitos(p_texto); v_t text; v_num numeric; v_forn uuid[] := '{}'; v_lim int; v_ret jsonb;
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(SELECT x.cliente_id FROM public.extrato_bancario_v2 x WHERE x.id = p_extrato_id)]);
  SELECT * INTO e FROM public.extrato_bancario_v2 WHERE id = p_extrato_id;
  v_lim := least(greatest(coalesce(p_limite, 30), 1), 200);
  -- o VALOR digitado, com ou sem pontuacao (506,51 · 506.51 · R$ 1.234,56 · 1234,56 · 1.234)
  v_t := regexp_replace(coalesce(p_texto, ''), '(R\$|\s)', '', 'gi');
  IF v_t <> '' AND translate(v_t, '0123456789.,', '') = '' AND v_t ~ '[0-9]' THEN
    v_t := CASE WHEN position(',' IN v_t) > 0 THEN replace(replace(v_t, '.', ''), ',', '.')
                WHEN length(v_t) - length(replace(v_t, '.', '')) > 1 THEN replace(v_t, '.', '')
                WHEN position('.' IN v_t) > 0 AND length(split_part(v_t, '.', 2)) = 3 THEN replace(v_t, '.', '')
                ELSE v_t END;
    BEGIN v_num := round(v_t::numeric, 2); EXCEPTION WHEN others THEN v_num := NULL; END;
  END IF;
  -- o FORNECEDOR pela busca unica da casa
  IF v_q <> '' THEN
    SELECT coalesce(array_agg((x->>'id')::uuid), '{}') INTO v_forn
      FROM jsonb_array_elements(public.fn_fornecedor_buscar(e.cliente_id, p_texto, 'todos', NULL, 0)->'itens') x;
  END IF;

  WITH base AS (
    SELECT l.*, public._fn_lancamento_aplicado_vivo(l.id) AS aplicado,
           (SELECT f.nome FROM public.financeiro_fornecedores f WHERE f.id = l.favorecido_id) AS fornecedor
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = e.cliente_id AND l.cancelado IS NOT TRUE AND coalesce(l.sem_movimentacao_caixa, false) = false
       AND coalesce(l.cenario, 'realizado') <> 'meta' AND l.status_transacao IN ('previsto', 'programado', 'agendado')
       -- mesmo sinal do extrato, na mesma conta ou sem conta
       AND CASE WHEN e.valor < 0 THEN
             (l.tipo_operacao LIKE '2-%' AND (l.conta_bancaria_id = e.conta_bancaria_id OR (l.conta_bancaria_id IS NULL AND l.conta_destino_id IS NULL)))
             OR (l.tipo_operacao LIKE '3-%' AND l.conta_bancaria_id = e.conta_bancaria_id)
           ELSE
             (l.tipo_operacao LIKE '1-%' AND (l.conta_destino_id = e.conta_bancaria_id OR l.conta_bancaria_id = e.conta_bancaria_id
                                             OR (l.conta_bancaria_id IS NULL AND l.conta_destino_id IS NULL)))
             OR (l.tipo_operacao LIKE '3-%' AND l.conta_destino_id = e.conta_bancaria_id)
           END
  ), c AS (
    SELECT b.*, round(abs(b.valor) - b.aplicado, 2) AS livre,
           (v_q <> '' AND (b.favorecido_id = ANY (v_forn) OR strpos(coalesce(public._fn_normalizar_texto(coalesce(b.descricao, b.historico)), ''), v_q) > 0)) AS nome_casa,
           (v_q <> '' AND (strpos(coalesce(public._fn_normalizar_texto(b.numero_documento), ''), v_q) > 0
                           OR (v_d IS NOT NULL AND strpos(public._fn_fornecedor_busca_doc(b.numero_documento), v_d) > 0))) AS doc_casa,
           (v_num IS NOT NULL AND (round(abs(b.valor), 2) = v_num OR round(abs(b.valor) - b.aplicado, 2) = v_num)) AS valor_casa
      FROM base b
     WHERE b.aplicado < abs(b.valor) - 0.005
  ), f AS (
    SELECT c.*, (c.livre = round(abs(e.valor), 2)) AS valor_igual,
           abs(c.data_vencimento - e.data_movimento) AS dias,
           CASE WHEN EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = c.id AND pt.cancelada IS NOT TRUE) THEN 'oc'
                WHEN c.recorrencia_id IS NOT NULL THEN 'recorrencia'
                WHEN c.financiamento_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.financiamento_parcelas fp WHERE c.id IN (fp.lancamento_id, fp.lancamento_juros_id)) THEN 'parcela'
                WHEN c.saldo_de_id IS NOT NULL THEN 'saldo'
                ELSE 'avulso' END AS origem,
           EXISTS (SELECT 1 FROM public.financeiro_recorrencias rr WHERE rr.id = c.recorrencia_id AND rr.tipo_valor = 'estimado') AS a_confirmar
      FROM c
     WHERE v_q = '' OR c.nome_casa OR c.doc_casa OR c.valor_casa
  ), o AS (
    SELECT f.*, row_number() OVER (ORDER BY f.valor_igual DESC, f.nome_casa DESC, f.dias, f.data_vencimento, f.id) AS ord, count(*) OVER () AS total FROM f
  )
  SELECT jsonb_build_object(
      'extrato', jsonb_build_object('extrato_id', e.id, 'data', e.data_movimento, 'valor', e.valor, 'conta_id', e.conta_bancaria_id),
      'total', coalesce(max(o.total), 0),
      'itens', coalesce(jsonb_agg(jsonb_build_object(
          'lancamento_id', o.id, 'descricao', coalesce(o.descricao, o.historico), 'fornecedor', o.fornecedor, 'favorecido_id', o.favorecido_id,
          'data_vencimento', o.data_vencimento, 'competencia', o.data_competencia, 'status_transacao', o.status_transacao,
          'origem', o.origem, 'origem_lancamento', o.origem_lancamento, 'a_confirmar', o.a_confirmar,
          'numero_documento', o.numero_documento, 'sem_conta', (o.conta_bancaria_id IS NULL AND o.conta_destino_id IS NULL),
          'valor', round(abs(o.valor), 2), 'ja_aplicado', round(o.aplicado, 2), 'livre', o.livre,
          'diferenca', round(abs(e.valor), 2) - o.livre, 'dias_do_extrato', o.data_vencimento - e.data_movimento,
          'valor_igual', o.valor_igual, 'nome_casa', o.nome_casa, 'documento_casa', o.doc_casa, 'valor_casa', o.valor_casa)
        ORDER BY o.ord) FILTER (WHERE o.ord <= v_lim), '[]'::jsonb))
    INTO v_ret FROM o;
  RETURN v_ret;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_conc_buscar_para_ligar(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conc_buscar_para_ligar(uuid, text, integer) TO authenticated, service_role;

DO $confere$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure) NOT LIKE '%sistema_candidatos_adiantados%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure) LIKE '%excede o saldo livre do lancamento%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_conc_ligar_com_valor_real(uuid, uuid, text)'::regprocedure) NOT LIKE '%tipo_valor = ''estimado''%' THEN
    RAISE EXCEPTION 'CONC-LIGAR-FUTURO-01a: troca nao entrou'; END IF;
  IF has_function_privilege('anon', 'public.fn_conc_buscar_para_ligar(uuid, text, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_conc_ligar_com_valor_real(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_extratos_espelhados(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONC-LIGAR-FUTURO-01a: executavel por anon'; END IF;
END $confere$;
