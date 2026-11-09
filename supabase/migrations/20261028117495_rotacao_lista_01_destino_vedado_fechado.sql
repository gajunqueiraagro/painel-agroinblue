-- ROTACAO-LISTA-01 (Gabriel 08/11/2026: R1 · R2) — "Também esteve em" mostra todos os pastos vigentes do mês; o pasto ESCOLHIDO que está
--   · VEDADO naquele mês deixa de ser vedado e passa à atividade do pasto de origem (R1), com trilha (`audit_log`, ação 'vedado_recebe_lote');
--   · FECHADO reabre na MESMA transação do salvar (R2), pelo `fn_fechamento_pasto_reabrir` (a linha em `fechamento_reaberturas_log`; a regra do
--     Valor do Rebanho do REABRIR-AUTOMATICO-01 mora nesse gesto e vale aqui também).
-- Só o destino NOVO (que ainda não estava na rotação gravada do card) muda; o que já estava e foi fechado/vedado depois segue recusado como
-- antes. As travas de `fn_fechamento_alocacoes_salvar` e `fn_fechamento_pasto_salvar` não mudam (o card vedado de origem segue sem levar o
-- lote a outros pastos; vedar um pasto que recebe segue recusado). O corpo vivo é conferido por md5 antes.

do $g$
begin
  if md5(pg_get_functiondef('public.fn_fechamento_pasto_salvar_com_alocacao(uuid,jsonb,jsonb,uuid[])'::regprocedure)) <> '74f3e12183b19e24cd9641de94f024a7' then
    raise exception 'ROTACAO-LISTA-01: o corpo vivo de fn_fechamento_pasto_salvar_com_alocacao mudou (md5). Nada foi gravado.';
  end if;
end $g$;

CREATE OR REPLACE FUNCTION public.fn_fechamento_pasto_salvar_com_alocacao(p_fechamento_id uuid, p_campos jsonb, p_itens jsonb, p_pasto_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_card     jsonb;
  v_aloc     jsonb;
  v_tipo     text;
  v_fp       public.fechamento_pastos%ROWTYPE;
  v_origem   text;
  v_atividade text;
  o          record;
  v_mudados  jsonb := '[]'::jsonb;
BEGIN
  /* 0) a guarda pelo cliente do card (SEG-AGRI-TENANT-01), antes de qualquer coisa */
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(
    SELECT f.cliente_id FROM public.fechamento_pastos fp JOIN public.fazendas f ON f.id = fp.fazenda_id WHERE fp.id = p_fechamento_id)]);
  /* 1) o card (campos do mês + itens), com as travas dele (tenant, card fechado, P2, vedar quem recebe) */
  v_card := public.fn_fechamento_pasto_salvar(p_fechamento_id, p_campos, p_itens);
  IF p_pasto_ids IS NULL THEN
    RETURN v_card || jsonb_build_object('alocacao', NULL);
  END IF;
  /* 2) onde o lote do card esteve (lote '' = o card inteiro), com as travas do escritor da alocação */
  SELECT tipo_uso_mes INTO v_tipo FROM public.fechamento_pastos WHERE id = p_fechamento_id;
  IF v_tipo = 'vedado' AND cardinality(ARRAY(SELECT DISTINCT x FROM unnest(p_pasto_ids) x WHERE x IS NOT NULL)) > 1 THEN
    RAISE EXCEPTION 'O pasto está vedado neste mês: o lote dele não pode estar em outros pastos. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  /* ROTACAO-LISTA-01 — o destino NOVO fechado reabre (R2) e o vedado passa à atividade do pasto de origem (R1), antes da alocação */
  SELECT * INTO v_fp FROM public.fechamento_pastos WHERE id = p_fechamento_id;
  SELECT p.nome, coalesce(v_fp.tipo_uso_mes, p.tipo_uso) INTO v_origem, v_atividade FROM public.pastos p WHERE p.id = v_fp.pasto_id;
  FOR o IN
    SELECT c.id, c.status, c.tipo_uso_mes, p.nome AS pasto_nome
      FROM unnest(p_pasto_ids) x
      JOIN public.fechamento_pastos c ON c.pasto_id = x AND c.fazenda_id = v_fp.fazenda_id AND c.ano_mes = v_fp.ano_mes
      JOIN public.pastos p ON p.id = x
     WHERE x <> v_fp.pasto_id AND (c.status = 'fechado' OR c.tipo_uso_mes = 'vedado')
       AND NOT EXISTS (SELECT 1 FROM public.fechamento_alocacoes a WHERE a.fechamento_id = p_fechamento_id AND a.pasto_id = x)
     ORDER BY p.nome
  LOOP
    IF o.status = 'fechado' THEN
      PERFORM public.fn_fechamento_pasto_reabrir(o.id, format('reaberto para receber o lote do %s', v_origem));
      v_mudados := v_mudados || jsonb_build_object('pasto', o.pasto_nome, 'reaberto', true);
    END IF;
    IF o.tipo_uso_mes = 'vedado' THEN
      UPDATE public.fechamento_pastos SET tipo_uso_mes = v_atividade WHERE id = o.id;
      INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
      VALUES (v_fp.cliente_id, v_fp.fazenda_id, auth.uid(), 'fechamento', 'vedado_recebe_lote', 'fechamento_pastos', o.id,
              format('%s deixa de ser vedado em %s e passa a %s: recebe o lote do %s', o.pasto_nome, v_fp.ano_mes, v_atividade, v_origem),
              jsonb_build_object('tipo_uso_mes', 'vedado'),
              jsonb_build_object('tipo_uso_mes', v_atividade, 'card_de_origem', p_fechamento_id));
      v_mudados := v_mudados || jsonb_build_object('pasto', o.pasto_nome, 'de', 'vedado', 'para', v_atividade);
    END IF;
  END LOOP;
  v_aloc := public.fn_fechamento_alocacoes_salvar(p_fechamento_id, '', p_pasto_ids);
  RETURN v_card || jsonb_build_object('alocacao', v_aloc, 'destinos_mudados', v_mudados);
END $function$;
