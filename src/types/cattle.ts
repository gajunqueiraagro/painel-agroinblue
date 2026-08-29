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

/* ── DOIS DOMINIOS QUE MORAVAM NA MESMA VARIAVEL (PR-ZOO-VENDA-DESATAR-TIPO-01) ──
   A tela de venda tinha um estado chamado `tipoPeso` carregando o TIPO DE VENDA, e
   outro (`vendaTipoPreco`) carregando a BASE DE PRECO. Os dois eram `string`, entao
   trocar um pelo outro compilava limpo. O payload fazia a troca certa — por isso o
   banco esta correto —, mas cada leitor precisava saber da inversao.
   Com uniao, trocar um pelo outro vira erro de compilacao. */

/** Como o preco da venda foi informado. Conferido contra o banco em 2026-08-29.
 *  ⚠ 'vivo' NAO ENTRA. Ele aparece em 3 vendas com tipo_venda preenchido, mas nao e'
 *  base de preco — nao se multiplica por "vivo". Deixa-lo fora faz o tipo APONTAR esses
 *  registros em vez de esconde-los; alarga-lo admitiria um valor que nenhum calculo sabe
 *  usar. Frente propria: PR-ZOO-VENDA-VIVO-BASE-PRECO-01. */
export type BasePrecoVenda = 'por_kg' | 'por_cab' | 'por_total';

/** Peso de referencia do abate. Fecha contra o banco: 734 'vivo', 95 'morto', nada fora. */
export type TipoPesoAbate = 'vivo' | 'morto';

/* ⚠ NAO HA `TipoVenda` AQUI, e a ausencia e' deliberada. `lancamentos.tipo_venda` guarda
   'desmama'|'gado_adulto'|'boitel' nas vendas E 'escala' em 89 abates ativos — este
   ultimo e' MODALIDADE COMERCIAL, o mesmo dominio do `modalidade_comercial` da OC.
   Uma uniao que cobrisse os dois juntaria dois dominios num tipo so' para caber.
   O tipo nasce quando a coluna tiver um dominio so' — PR-ZOO-ABATE-MODALIDADE-COLUNA-01. */

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
  rendimentoCarcaca?: number;
  // legado — remover apenas após Z5/Z6 estabilizados.
  // Coexiste com fornecedorId/fornecedorNomeSnapshot durante a transição.
  compradorFornecedor?: string;
  // Z1+: fornecedor mestre soberano do zoo (UUID em financeiro_fornecedores).
  fornecedorId?: string;
  // Z1+: snapshot imutável do nome no momento do save.
  // O sentinel '[nao informado]' do banco é traduzido para undefined no mapper
  // (camada de domínio trata como ausência semântica — nunca renderizar em UI).
  fornecedorNomeSnapshot?: string;
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
  pesoTotal?: number;
  precoUnitario?: number;
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
  abateFrigorifico?: string;
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
  /* ⚠ CAMPO DE MAO DUPLA desde PR-UI-NASCIMENTO-PARIDADE-03. Sempre foi preenchido na
     LEITURA (`fazendaId: l.fazenda_id`); agora tambem e' lido na ESCRITA, onde vence a
     fazenda do contexto — ver `adicionarLancamento`. Quem nao preenche continua
     herdando o contexto, que era o unico comportamento ate aqui.
     ⚠ Nao confundir com `fazendaOrigem`/`fazendaDestino`, que sao TEXTO LIVRE de
     transferencia e venda; este e' o id da coluna `fazenda_id`. */
  fazendaId?: string;
  clienteId?: string;
  origemRegistro?: string;
  loteImportacaoId?: string;
  operacaoId?: string | null;   // vínculo oficial à OC (ponte zoo_operacao_movimentacoes); null = sem OC
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
