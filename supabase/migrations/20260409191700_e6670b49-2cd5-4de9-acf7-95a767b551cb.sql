
CREATE OR REPLACE FUNCTION public.mark_financeiro_lancamento_v2_editado_manual()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.lote_importacao_id IS NOT NULL
     AND COALESCE(OLD.editado_manual, false) = false
     AND (
       NEW.fazenda_id IS DISTINCT FROM OLD.fazenda_id OR
       NEW.conta_bancaria_id IS DISTINCT FROM OLD.conta_bancaria_id OR
       NEW.ano_mes IS DISTINCT FROM OLD.ano_mes OR
       NEW.data_competencia IS DISTINCT FROM OLD.data_competencia OR
       NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento OR
       NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao OR
       NEW.status_transacao IS DISTINCT FROM OLD.status_transacao OR
       NEW.descricao IS DISTINCT FROM OLD.descricao OR
       NEW.documento IS DISTINCT FROM OLD.documento OR
       NEW.historico IS DISTINCT FROM OLD.historico OR
       NEW.valor IS DISTINCT FROM OLD.valor OR
       NEW.sinal IS DISTINCT FROM OLD.sinal OR
       NEW.macro_custo IS DISTINCT FROM OLD.macro_custo OR
       NEW.centro_custo IS DISTINCT FROM OLD.centro_custo OR
       NEW.subcentro IS DISTINCT FROM OLD.subcentro OR
       NEW.escopo_negocio IS DISTINCT FROM OLD.escopo_negocio OR
       NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id OR
       NEW.favorecido_id IS DISTINCT FROM OLD.favorecido_id OR
       NEW.observacao IS DISTINCT FROM OLD.observacao OR
       NEW.numero_documento IS DISTINCT FROM OLD.numero_documento OR
       NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento OR
       NEW.dados_pagamento IS DISTINCT FROM OLD.dados_pagamento OR
       NEW.contrato_id IS DISTINCT FROM OLD.contrato_id
     ) THEN
    NEW.editado_manual := true;
  END IF;

  RETURN NEW;
END;
$function$;
