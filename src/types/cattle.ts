export type Categoria =
  | 'mamotes_m'
  | 'desmama_m'
  | 'garrotes'
  | 'bois'
  | 'touros'
  | 'mamotes_f'
  | 'desmama_f'
  | 'novilhas'
  | 'vacas';

export const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'mamotes_m', label: 'Mamotes M' },
  { value: 'desmama_m', label: 'Desmama M' },
  { value: 'garrotes', label: 'Garrotes' },
  { value: 'bois', label: 'Bois' },
  { value: 'touros', label: 'Touros' },
  { value: 'mamotes_f', label: 'Mamotes F' },
  { value: 'desmama_f', label: 'Desmama F' },
  { value: 'novilhas', label: 'Novilhas' },
  { value: 'vacas', label: 'Vacas' },
];

export type TipoEntrada = 'nascimento' | 'compra' | 'transferencia_entrada';
export type TipoSaida = 'abate' | 'venda' | 'transferencia_saida' | 'consumo' | 'morte';
export type TipoMovimentacao = TipoEntrada | TipoSaida | 'reclassificacao';

export const TIPOS_ENTRADA: { value: TipoEntrada; label: string; icon: string }[] = [
  { value: 'nascimento', label: 'Nascimento', icon: '🐄' },
  { value: 'compra', label: 'Compra', icon: '🛒' },
];

export const TIPOS_SAIDA: { value: TipoSaida; label: string; icon: string }[] = [
  { value: 'abate', label: 'Abate', icon: '🔪' },
  { value: 'venda', label: 'Venda em Pé', icon: '💰' },
  { value: 'transferencia_saida', label: 'Transferência (saída)', icon: '📤' },
  { value: 'consumo', label: 'Consumo', icon: '🍖' },
  { value: 'morte', label: 'Morte', icon: '💀' },
];

export const TODOS_TIPOS = [
  ...TIPOS_ENTRADA,
  { value: 'transferencia_entrada' as const, label: 'Transferência (entrada)', icon: '📥' },
  ...TIPOS_SAIDA,
  { value: 'reclassificacao' as const, label: 'Reclassificação', icon: '🔄' },
];

export interface Lancamento {
  id: string;
  data: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  categoria: Categoria;
  categoriaDestino?: Categoria; // for reclassificacao
  fazendaOrigem?: string;
  fazendaDestino?: string;
  pesoMedioKg?: number;
  pesoMedioArrobas?: number;
  precoMedioCabeca?: number;
  observacao?: string;
  motivo?: string;
  rendimento?: number;
  compradorFornecedor?: string;
  // Financial fields
  precoArroba?: number;
  pesoCarcacaKg?: number;
  bonusPrecoce?: number;
  bonusQualidade?: number;
  bonusListaTrace?: number;
  descontoQualidade?: number;
  descontoFunrural?: number;
  outrosDescontos?: number;
  acrescimos?: number;
  deducoes?: number;
  valorTotal?: number;
  notaFiscal?: string;
  tipoPeso?: string;
  cenario?: 'meta' | 'realizado';
  statusOperacional?: 'previsto' | 'programado' | 'agendado' | 'realizado' | null;
  // Abate workflow fields
  dataVenda?: string;
  dataEmbarque?: string;
  dataAbate?: string;
  tipoVenda?: string;
  // Abate realizado — identification fields
  frigorifico?: string;
  pedido?: string;
  instrucao?: string;
  docAcerto?: string;
  // Structured snapshot of financial screen
  detalhesSnapshot?: Record<string, any>;
  // Anexos de abate
  anexoNfUrl?: string;
  anexoAcertoUrl?: string;
  // Audit fields
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  createdByNome?: string;
  updatedByNome?: string;
  fazendaId?: string;
  origemRegistro?: string;
  loteImportacaoId?: string;
}

export interface SaldoInicial {
  ano: number;
  mes: number;
  categoria: Categoria;
  quantidade: number;
  pesoMedioKg?: number;
  precoKg?: number;
  fazendaId?: string;
}

export function isEntrada(tipo: TipoMovimentacao): tipo is TipoEntrada {
  return ['nascimento', 'compra', 'transferencia_entrada'].includes(tipo);
}

export function isReclassificacao(tipo: TipoMovimentacao): boolean {
  return tipo === 'reclassificacao';
}

export function kgToArrobas(kg: number): number {
  return Number((kg / 30).toFixed(2));
}

export function arrobasToKg(arrobas: number): number {
  return Number((arrobas * 30).toFixed(2));
}
