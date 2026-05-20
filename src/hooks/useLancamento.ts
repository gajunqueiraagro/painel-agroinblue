/**
 * useLancamento — fetch isolado de UM lançamento zootécnico por id.
 *
 * F2 (zoo-edit): hook puro de leitura, sem efeitos colaterais. Vai alimentar
 * o futuro Modal Oficial de Edição Zootécnica (F4), que precisa abrir a partir
 * de qualquer tela conhecendo apenas o `lancamentoId`.
 *
 * Retorna 2 representações:
 *  - `lancamento` (camelCase): tipo client `Lancamento` compatível com os
 *    Edit*Sheets existentes (Nascimento/Morte/Consumo/Transferencia/Reclass).
 *  - `raw` (snake_case): linha bruta da tabela `lancamentos` — necessária para
 *    `useEditPermissions` checar `cancelado`, `fazenda_id`, `cenario` (campos
 *    que `mapRowToLancamento` não expõe).
 *
 * Não importa contexto de UI (FazendaContext, isGlobal etc.). O lançamento é
 * carregado por id absoluto — fazenda real do registro prevalece sobre filtro
 * da tela onde o modal é aberto. Regra soberana: o mesmo `id` deve produzir
 * o mesmo resultado independente da tela de origem.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import type { Categoria, Lancamento, TipoMovimentacao } from '@/types/cattle';

export type LancamentoRow = Tables<'lancamentos'>;

/** Espelho local de `mapRowToLancamento` em `useLancamentos.ts`. Não importado
 *  para evitar dependência cíclica e para manter este hook leve (sem profileMap
 *  — `compradorFornecedor` fica vazio quando o id de profile não pode ser
 *  resolvido no caller). */
function mapRowToLancamento(l: LancamentoRow): Lancamento {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = l as any;
  return {
    id: l.id,
    data: l.data,
    tipo: l.tipo as TipoMovimentacao,
    quantidade: l.quantidade,
    categoria: l.categoria as Categoria,
    categoriaDestino: r.categoria_destino as Categoria | undefined,
    fazendaOrigem: l.fazenda_origem ?? undefined,
    fazendaDestino: l.fazenda_destino ?? undefined,
    // Z4.1: identidade multi-tenant — necessária para queries dependentes
    // (FornecedorSelect, useEditPermissions). Banco tem como UUID NULLABLE.
    fazendaId: l.fazenda_id ?? undefined,
    clienteId: l.cliente_id ?? undefined,
    pesoMedioKg: r.peso_medio_kg ?? undefined,
    pesoMedioArrobas: r.peso_medio_arrobas ?? undefined,
    precoMedioCabeca: r.preco_medio_cabeca ?? undefined,
    observacao: r.observacao ?? undefined,
    motivo: r.motivo ?? undefined,
    rendimento: r.rendimento ?? undefined,
    compradorFornecedor: r.comprador_fornecedor ?? undefined,
    fornecedorId: (r as { fornecedor_id?: string | null }).fornecedor_id ?? undefined,
    // Sentinel '[nao informado]' → undefined (ausência semântica na UI).
    fornecedorNomeSnapshot: (() => {
      const snap = (r as { fornecedor_nome_snapshot?: string | null }).fornecedor_nome_snapshot;
      return snap && snap !== '[nao informado]' ? snap : undefined;
    })(),
    precoArroba: r.preco_arroba ?? undefined,
    pesoCarcacaKg: r.peso_carcaca_kg ?? undefined,
    bonusPrecoce: r.bonus_precoce ?? undefined,
    bonusQualidade: r.bonus_qualidade ?? undefined,
    bonusListaTrace: r.bonus_lista_trace ?? undefined,
    descontoQualidade: r.desconto_qualidade ?? undefined,
    descontoFunrural: r.desconto_funrural ?? undefined,
    outrosDescontos: r.outros_descontos ?? undefined,
    acrescimos: r.acrescimos ?? undefined,
    deducoes: r.deducoes ?? undefined,
    valorTotal: r.valor_total ?? undefined,
    notaFiscal: r.numero_documento ?? undefined,
    tipoPeso: r.tipo_peso ?? 'vivo',
    cenario: (l.cenario as 'meta' | 'realizado') ?? 'realizado',
    statusOperacional: r.status_operacional ?? (l.cenario === 'meta' ? null : 'realizado'),
    dataVenda: r.data_venda ?? undefined,
    dataEmbarque: r.data_embarque ?? undefined,
    dataAbate: r.data_abate ?? undefined,
    tipoVenda: r.tipo_venda ?? undefined,
    frigorifico: r.frigorifico ?? undefined,
    pedido: r.pedido ?? undefined,
    instrucao: r.instrucao ?? undefined,
  };
}

export interface UseLancamentoResult {
  /** Lançamento camelCase compatível com Edit*Sheets. */
  lancamento: Lancamento | null;
  /** Row bruta da tabela `lancamentos` (snake_case) — usar para campos não
   *  expostos pelo mapper (cancelado, fazenda_id, etc.). */
  raw: LancamentoRow | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useLancamento(id: string | null | undefined): UseLancamentoResult {
  const query = useQuery({
    queryKey: ['lancamento', id] as const,
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<LancamentoRow | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return (data as LancamentoRow) ?? null;
    },
  });

  const raw = query.data ?? null;
  const lancamento = raw ? mapRowToLancamento(raw) : null;

  return {
    lancamento,
    raw,
    loading: query.isLoading || query.isFetching,
    error: (query.error as Error | null) ?? null,
    refetch: () => { void query.refetch(); },
  };
}
