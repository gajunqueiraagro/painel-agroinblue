-- RECLASS-PESO-01 (parte 2) — a guarda que impede a reclassificacao sem peso de voltar
--
-- POR QUE NO BANCO E NAO SO' NA TELA
-- O RECLASS-PESO-BACKFILL-01 corrigiu 516 lancamentos gravados sem `peso_medio_kg`, e eles
-- entraram por DOIS caminhos: 370 pela tela e 146 por UMA importacao em lote (23/04/2026). O
-- commit ef033317 fechou os dois no front, mas front nao e' trava: qualquer via nova — outra
-- importacao, um script, a API direta — recria o defeito, e nenhum gate do repo ve' isso.
--
-- O QUE MUDA: uma condicao no ramo 'reclassificacao' de `validate_lancamento_campos_por_tipo`,
-- que ja' valida quantidade, categoria_destino e origem<>destino. Corpo INTEGRAL abaixo.
--   md5(prosrc) ANTES: be162b713ea3d7d079a05eed0826a803  (3.345 chars)
--   md5(prosrc) DEPOIS: 1d5018ca8f7fe6e96acdd0ea23e90c9d (3.571 chars)
--   PROVA DE CORPO (rollback, 24/09/2026): md5(replace(prosrc_original, ancora, ancora||bloco))
--   = md5(prosrc_aplicado). O corpo e' o original MAIS as tres linhas novas, e nada alem disso.
--   A ancora `Reclassificação: categoria de origem e destino não podem ser iguais.` casa
--   EXATAMENTE 1 vez no corpo vigente — conferido com regexp_matches(...,'g').
--
-- PROVAS FUNCIONAIS (mesmo rollback):
--   A. INSERT de reclassificacao SEM peso  -> BLOQUEADO com a mensagem nova
--   B. INSERT COM peso (312,44)            -> passou
--   C. UPDATE de um lancamento existente   -> passou
--
-- ⚠ VALE EM INSERT **E** UPDATE, e isso e' decisao consciente (Gabriel, 24/09/2026): editar um
--   lancamento antigo apagando o peso recriaria exatamente o buraco que o backfill fechou. Medido
--   antes de aplicar: as 1.184 reclassificacoes existentes TODAS tem peso, entao nenhuma edicao
--   legitima passa a falhar.
--
-- ⚠ CANCELAR CONTINUA PASSANDO: a funcao comeca com
--     IF TG_OP = 'UPDATE' AND NEW.cancelado = true THEN RETURN NEW; END IF;
--   entao cancelar um lancamento nunca esbarra nesta guarda. E' o comportamento certo — cancelar
--   nao e' corrigir.
--
-- ⚠ E A GUARDA NAO ALCANCA O CENARIO META, porque a funcao inteira desiste antes:
--     IF NEW.cenario = 'meta' THEN RETURN NEW; END IF;
--   As CTEs `rcl_*_meta` de `fn_zoot_categoria_mensal` tem o MESMO `COALESCE(peso_medio_kg, 0)`,
--   entao o furo existe igual no planejamento — so' nao afeta numero realizado. Fica registrado
--   como frente META-VALIDACAO-01, nao corrigido aqui: mexer no `RETURN NEW` do meta muda a
--   validacao de TODOS os tipos.
--
-- SEM REVOKE/GRANT: e' funcao de TRIGGER e NAO e' SECURITY DEFINER (`prosecdef = false`), entao
-- nao ha' superficie de execucao direta a fechar.

CREATE OR REPLACE FUNCTION public.validate_lancamento_campos_por_tipo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip validation for cancellations
  IF TG_OP = 'UPDATE' AND NEW.cancelado = true THEN
    RETURN NEW;
  END IF;

  -- Skip validation for meta scenario (less strict)
  IF NEW.cenario = 'meta' THEN
    RETURN NEW;
  END IF;

  -- Universal: fazenda_id, data, categoria, quantidade are already NOT NULL in schema

  -- Block manual insertion of transferencia_entrada (auto-created by pair trigger)
  IF NEW.tipo = 'transferencia_entrada' AND NEW.transferencia_par_id IS NULL THEN
    RAISE EXCEPTION 'Transferência de entrada não pode ser criada manualmente. Use transferência de saída para gerar o par automaticamente.';
  END IF;

  -- Type-specific validation
  CASE NEW.tipo
    WHEN 'saldo_inicial' THEN
      -- Minimal: just fazenda, data, categoria, quantidade (all NOT NULL already)
      -- saldo_inicial must not have financial fields
      NULL;

    WHEN 'nascimento' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Nascimento deve ter quantidade > 0.';
      END IF;

    WHEN 'compra' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Compra deve ter quantidade > 0.';
      END IF;

    WHEN 'venda', 'venda_pe' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Venda deve ter quantidade > 0.';
      END IF;

    WHEN 'abate' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Abate deve ter quantidade > 0.';
      END IF;

    WHEN 'morte' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Morte deve ter quantidade > 0.';
      END IF;

    WHEN 'consumo' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Consumo deve ter quantidade > 0.';
      END IF;

    WHEN 'transferencia_saida' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Transferência deve ter quantidade > 0.';
      END IF;
      IF NEW.fazenda_destino IS NULL THEN
        RAISE EXCEPTION 'Transferência de saída deve informar fazenda de destino.';
      END IF;

    WHEN 'transferencia_entrada' THEN
      -- Auto-created, minimal validation
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Transferência de entrada deve ter quantidade > 0.';
      END IF;

    WHEN 'reclassificacao' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Reclassificação deve ter quantidade > 0.';
      END IF;
      IF NEW.categoria_destino IS NULL THEN
        RAISE EXCEPTION 'Reclassificação deve informar categoria de destino.';
      END IF;
      IF NEW.categoria = NEW.categoria_destino THEN
        RAISE EXCEPTION 'Reclassificação: categoria de origem e destino não podem ser iguais.';
      END IF;
      IF coalesce(NEW.peso_medio_kg, 0) <= 0 THEN
        RAISE EXCEPTION 'Reclassificação deve informar o peso médio dos animais. Sem ele o motor do rebanho move a cabeça e não o peso, e o peso vira produção.';
      END IF;

    ELSE
      -- Unknown type: allow but log warning via NOTICE
      RAISE NOTICE 'Tipo de lançamento desconhecido: %', NEW.tipo;
  END CASE;

  -- Auto-derive peso_vivo_total if not provided
  IF NEW.peso_vivo_total IS NULL AND NEW.peso_medio_kg IS NOT NULL AND NEW.quantidade > 0 THEN
    NEW.peso_vivo_total := NEW.quantidade::numeric * NEW.peso_medio_kg;
  END IF;

  -- Auto-derive rendimento_carcaca if both weights available
  IF NEW.rendimento_carcaca IS NULL 
     AND NEW.peso_medio_kg IS NOT NULL AND NEW.peso_medio_kg > 0
     AND NEW.peso_carcaca_kg IS NOT NULL AND NEW.peso_carcaca_kg > 0 THEN
    NEW.rendimento_carcaca := round((NEW.peso_carcaca_kg / NEW.peso_medio_kg) * 100, 2);
  END IF;

  RETURN NEW;
END;
$function$;
