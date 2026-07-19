import type { OcEnvelope } from '@/hooks/useOperacaoComercial';
import type { usePlanoContasOC } from '@/hooks/usePlanoContasOC';
import type { useComponentesFinanceiros } from '@/hooks/useComponentesFinanceiros';

export type TipoOperacaoOC = 'compra' | 'venda' | 'abate';
export type NaturezaParte = 'principal' | 'deducao' | 'acrescimo';

export const TIPO_OC_LABEL: Record<TipoOperacaoOC, string> = {
  compra: 'Compra',
  venda: 'Venda em Pé',
  abate: 'Abate',
};

export interface ParcelaDraft {
  key: string;
  descricao: string;
  natureza: NaturezaParte;
  componente: string; // codigo do catálogo (zoo_componentes_financeiros) — identidade estável
  valor: number;
  incluso_no_total: boolean;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  plano_conta_id: string | null;
}

export interface MovOption {
  id: string;
  data: string;
  categoria: string;
  quantidade: number;
  pesoMedioKg: number | null;
  pesoTotalKg: number | null;
  fazendaId: string | null;
  fazendaNome: string | null;
}

export interface DraftOC {
  tipo_operacao: TipoOperacaoOC;
  data_operacao: string;
  responsavel: string;
  contraparte_id: string | null;
  contraparte_nome: string | null;
  observacoes: string;
  numero_nf: string;
  fazendaScopeId: string | null; // contexto de UI; NÃO persistido (E1)
  movimentacoes: string[]; // Lote 1 — ids de lancamentos
  // negociação
  tipo_precificacao: string;
  preco_unitario: string;
  condicao_pagamento: string;
  data_pagamento_prevista: string;
  negociacao_obs: string;
  // financeiro — FONTE ÚNICA da composição financeira. descontos/acréscimos NÃO vivem
  // aqui como estado independente: derivam SEMPRE das parcelas (natureza deducao/acrescimo).
  parcelas: ParcelaDraft[];
}

// Contexto único passado às abas (o orquestrador é dono de todo o estado e das RPCs).
export interface ModalOCCtx {
  clienteId: string;
  draft: DraftOC;
  patch: (p: Partial<DraftOC>) => void;
  op: OcEnvelope | null;
  saving: boolean;
  movsReadonly: boolean; // após a criação, o vínculo de movimentações é read-only
  movs: MovOption[];
  eventos: Record<string, unknown>[];
  plano: ReturnType<typeof usePlanoContasOC>;
  componentes: ReturnType<typeof useComponentesFinanceiros>;
  // derivados
  fazendaLabel: string;
  fazendasDoLote: string[];
  valorBruto: number;
  totalDescontos: number;
  totalAcrescimos: number;
  totalLiquido: number;
  documentosDisponivel: boolean; // false nesta etapa (backend inexistente)
}
