-- PR-Banco-DefaultFornecedorSnapshot
-- Defesa em profundidade: blinda writers futuros que omitam fornecedor_nome_snapshot.
-- NOT NULL preservado. Dados historicos intocados. Sem ALTER DROP NOT NULL.
--
-- Contexto: PR1 (commit b07f0d1c) corrigiu 6 callers do front. Este PR2 garante
-- que mesmo writers fora do front (triggers, RPCs futuros, SQL direto) nao
-- consigam inserir NULL na coluna. Tambem corrige trigger
-- auto_create_transferencia_entrada que omitia a coluna no INSERT do par-entrada.

-- 1) DEFAULT a nivel de coluna
ALTER TABLE public.lancamentos
  ALTER COLUMN fornecedor_nome_snapshot SET DEFAULT '[nao informado]';

-- 2) Trigger auto_create_transferencia_entrada propaga snapshot do saida.
--    Mudanca cirurgica: +1 coluna no INSERT, +1 valor com COALESCE.
--    Nada mais muda na funcao. Demais colunas omitidas seguem omitidas
--    (decisao de design existente, fora de escopo).
CREATE OR REPLACE FUNCTION public.auto_create_transferencia_entrada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  dest_fazenda_id uuid;
  dest_cliente_id uuid;
  entrada_id uuid;
BEGIN
  IF NEW.tipo != 'transferencia_saida' THEN RETURN NEW; END IF;
  IF NEW.transferencia_par_id IS NOT NULL THEN RETURN NEW; END IF;

  dest_fazenda_id := public.resolve_transfer_destination_fazenda(
                       NEW.fazenda_id, NEW.fazenda_destino);
  IF dest_fazenda_id IS NULL THEN RETURN NEW; END IF;

  SELECT cliente_id INTO dest_cliente_id
    FROM public.fazendas WHERE id = dest_fazenda_id;

  INSERT INTO public.lancamentos (
    fazenda_id, cliente_id, data, tipo, quantidade, categoria, categoria_destino,
    fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
    preco_medio_cabeca, observacao, transferencia_par_id, status_operacional, cenario,
    fornecedor_nome_snapshot
  ) VALUES (
    dest_fazenda_id, COALESCE(dest_cliente_id, NEW.cliente_id), NEW.data, 'transferencia_entrada',
    NEW.quantidade, NEW.categoria, NEW.categoria_destino,
    NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
    NEW.preco_medio_cabeca, NEW.observacao, NEW.id, NEW.status_operacional, NEW.cenario,
    COALESCE(NEW.fornecedor_nome_snapshot, '[nao informado]')
  )
  RETURNING id INTO entrada_id;

  UPDATE public.lancamentos SET transferencia_par_id = entrada_id WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;
