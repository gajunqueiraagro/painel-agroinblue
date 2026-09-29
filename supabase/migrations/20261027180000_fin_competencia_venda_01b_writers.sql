-- FIN-COMPETENCIA-VENDA-01b (1/2) — writers: o GERADOR do titulo segue a saida, e a volta enxerga o evento do lote.
--
-- POR QUE (medicao, docs/investigacao/fin-competencia-venda-01b-medicao.md): os 13 recebimentos por titulo com competencia
-- errada nasceram em `oc_materializar_programacao`, que grava `data_competencia = v_op.data_operacao` e a safra dessa data.
-- A 01a so' cobriu quem LIGA; corrigir o lote sem o gerador faria o proximo abate nascer com a data da OC de novo (Gabriel,
-- 29/09/2026: "corrigir oc_materializar_programacao no mesmo PR").
--
-- O QUE MUDA:
--   oc_materializar_programacao (438f614e -> 9478957c) — titulo do recebimento de venda/abate (principal de entrada no
--     `_oc_vinculo_mapa`, boitel fora — o mesmo criterio da 01a) nasce com competencia e safra de `_oc_competencia_pela_saida`.
--     Sem saida na hora de gerar, e todo outro titulo (despesa, obrigacao, compra): `data_operacao`, como antes. O vencimento
--     (`v_data_venc`, que tambem le' `data_operacao` na falta de outro) NAO muda — a terceira leitura de `data_operacao` do corpo
--     fica de proposito.
--   oc_desvincular_lancamento (e33e8e92 -> 6cbc7e2a) — a busca do evento para a volta passa a aceitar tambem a acao
--     'corrigir_competencia_pela_saida' (o evento do lote, 2/2). Sem isso, desligar um recebimento corrigido pelo lote acharia o
--     vinculo antigo ("sem snapshot") e a volta nao existiria — o briefing pede o evento "para a volta existir".
--
-- METODO: patch guardado por md5 (guarda de origem, cada ancora exatamente 1x, guarda de destino calculada NO BANCO com a
-- mesma cadeia de replace). Conceito contado: `v_op.data_operacao` aparece 3x no gerador (vencimento, competencia, safra);
-- so' as duas ultimas sao trocadas.
--   oc_materializar_programacao  md5 ANTES 438f614eba4cc8ff8e1e094aa700bbe2 (7.558)  DEPOIS 9478957cd385c005ce4c66d45c43c031
--   oc_desvincular_lancamento    md5 ANTES e33e8e922fbbd6c118dc55d051598513 (14.297) DEPOIS 6cbc7e2a1c3b9a3e2563d87085184d74
-- ACL refeita igual a' medida: {postgres, service_role, authenticated} nas duas; ambas SECURITY DEFINER.
--

do $mig$
declare v_antes text; v_novo text; v_depois text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_materializar_programacao' and n.nspname = 'public';
  if md5(v_antes) <> '438f614eba4cc8ff8e1e094aa700bbe2' then
    raise exception 'oc_materializar_programacao nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  if (length(v_antes) - length(replace(v_antes, $a$  v_nova_versao integer;
BEGIN$a$, ''))) / length($a$  v_nova_versao integer;
BEGIN$a$) <> 1 then
    raise exception 'oc_materializar_programacao: a ancora 1 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$  ELSE v_tipo_op := '2-Saídas'; v_sinal := '-1'; END IF;
$a$, ''))) / length($a$  ELSE v_tipo_op := '2-Saídas'; v_sinal := '-1'; END IF;
$a$) <> 1 then
    raise exception 'oc_materializar_programacao: a ancora 2 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$    v_op.data_operacao, NULL::date, v_data_venc, to_char(v_data_venc,'YYYY-MM'),$a$, ''))) / length($a$    v_op.data_operacao, NULL::date, v_data_venc, to_char(v_data_venc,'YYYY-MM'),$a$) <> 1 then
    raise exception 'oc_materializar_programacao: a ancora 3 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$    public.fn_safra_sugerida(v_cli, v_op.data_operacao, (SELECT pc.escopo_negocio FROM public.financeiro_plano_contas pc WHERE pc.id = v_comp.plano_conta_id))
$a$, ''))) / length($a$    public.fn_safra_sugerida(v_cli, v_op.data_operacao, (SELECT pc.escopo_negocio FROM public.financeiro_plano_contas pc WHERE pc.id = v_comp.plano_conta_id))
$a$) <> 1 then
    raise exception 'oc_materializar_programacao: a ancora 4 nao casa exatamente 1x. Migration abortada.'; end if;
  v_novo := replace(replace(replace(replace(v_antes, $a$  v_nova_versao integer;
BEGIN$a$, $a$  v_nova_versao integer;
  v_comp_data date; v_comp_safra uuid; v_cps_data date; v_cps_safra uuid;
BEGIN$a$), $a$  ELSE v_tipo_op := '2-Saídas'; v_sinal := '-1'; END IF;
$a$, $a$  ELSE v_tipo_op := '2-Saídas'; v_sinal := '-1'; END IF;

  -- FIN-COMPETENCIA-VENDA-01b: o titulo do recebimento de venda/abate (principal de entrada no mapa, boitel fora) nasce com
  -- competencia e safra da PRIMEIRA saida do gado da OC — a regra do vinculo (01a, `_oc_competencia_pela_saida`). Sem saida na
  -- hora de gerar, ou qualquer outro titulo: data da OC, como antes. O vencimento (`v_data_venc`) nao muda.
  v_comp_data := v_op.data_operacao;
  v_comp_safra := public.fn_safra_sugerida(v_cli, v_op.data_operacao,
    (SELECT pc.escopo_negocio FROM public.financeiro_plano_contas pc WHERE pc.id = v_comp.plano_conta_id));
  IF v_tipo_op = '1-Entradas' AND EXISTS (SELECT 1 FROM public._oc_vinculo_mapa() m
       WHERE m.subcentro = v_comp.subcentro AND m.natureza = 'principal' AND m.tipo_operacao = '1-Entradas'
         AND v_op.tipo_operacao = ANY (m.tipos_oc) AND m.subcentro <> 'Venda em Boitel') THEN
    SELECT c.data_competencia, c.safra_id INTO v_cps_data, v_cps_safra FROM public._oc_competencia_pela_saida(p_operacao_id) c;
    IF v_cps_data IS NOT NULL THEN
      v_comp_data := v_cps_data; v_comp_safra := v_cps_safra;
    END IF;
  END IF;
$a$), $a$    v_op.data_operacao, NULL::date, v_data_venc, to_char(v_data_venc,'YYYY-MM'),$a$, $a$    v_comp_data, NULL::date, v_data_venc, to_char(v_data_venc,'YYYY-MM'),$a$), $a$    public.fn_safra_sugerida(v_cli, v_op.data_operacao, (SELECT pc.escopo_negocio FROM public.financeiro_plano_contas pc WHERE pc.id = v_comp.plano_conta_id))
$a$, $a$    v_comp_safra  -- FIN-COMPETENCIA-VENDA-01b: calculada acima (saida do gado no recebimento de venda/abate; senao a data da OC)
$a$);
  execute 'CREATE OR REPLACE FUNCTION public.oc_materializar_programacao(p_operacao_id uuid, p_versao_esperada integer, p_programacao_id uuid, p_parcela_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_materializar_programacao' and n.nspname = 'public';
  if md5(v_depois) <> '9478957cd385c005ce4c66d45c43c031' then
    raise exception 'oc_materializar_programacao: corpo resultante inesperado (md5 %). Esperado 9478957cd385c005ce4c66d45c43c031.', md5(v_depois); end if;
end $mig$;
REVOKE ALL ON FUNCTION public.oc_materializar_programacao(p_operacao_id uuid, p_versao_esperada integer, p_programacao_id uuid, p_parcela_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_materializar_programacao(p_operacao_id uuid, p_versao_esperada integer, p_programacao_id uuid, p_parcela_id uuid) TO authenticated, service_role;

do $mig$
declare v_antes text; v_novo text; v_depois text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_desvincular_lancamento' and n.nspname = 'public';
  if md5(v_antes) <> 'e33e8e922fbbd6c118dc55d051598513' then
    raise exception 'oc_desvincular_lancamento nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  if (length(v_antes) - length(replace(v_antes, $a$   WHERE e.operacao_id = p_operacao_id AND e.acao IN ('vincular_lancamento', 'vincular_recebimento')
$a$, ''))) / length($a$   WHERE e.operacao_id = p_operacao_id AND e.acao IN ('vincular_lancamento', 'vincular_recebimento')
$a$) <> 1 then
    raise exception 'oc_desvincular_lancamento: a ancora 1 nao casa exatamente 1x. Migration abortada.'; end if;
  v_novo := replace(v_antes, $a$   WHERE e.operacao_id = p_operacao_id AND e.acao IN ('vincular_lancamento', 'vincular_recebimento')
$a$, $a$   WHERE e.operacao_id = p_operacao_id AND e.acao IN ('vincular_lancamento', 'vincular_recebimento', 'corrigir_competencia_pela_saida')
$a$);
  execute 'CREATE OR REPLACE FUNCTION public.oc_desvincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_motivo text, p_plano_conta_id uuid DEFAULT NULL::uuid, p_simular boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'oc_desvincular_lancamento' and n.nspname = 'public';
  if md5(v_depois) <> '6cbc7e2a1c3b9a3e2563d87085184d74' then
    raise exception 'oc_desvincular_lancamento: corpo resultante inesperado (md5 %). Esperado 6cbc7e2a1c3b9a3e2563d87085184d74.', md5(v_depois); end if;
end $mig$;
REVOKE ALL ON FUNCTION public.oc_desvincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_motivo text, p_plano_conta_id uuid, p_simular boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oc_desvincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_motivo text, p_plano_conta_id uuid, p_simular boolean) TO authenticated, service_role;
