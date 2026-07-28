// PR-FIN-MODAL-02B — Fonte ÚNICA de validação por aba do LancamentoV2Dialog.
//
// Espelha EXATAMENTE as fórmulas de validação hoje inline no modal
// (LancamentoV2Dialog: contaOrigemValid/contaDestinoValid/contaSimpleValid,
//  parceladaValid, recorrenteValid, canSave). NÃO cria regra nova nem diverge
// das oficiais — o modal passa a consumir `computeValidacaoModal(...).canSave`
// no mesmo lugar, de modo que canSave e o mapeamento por aba tenham UMA origem.
//
// Puro e testável. Não toca banco, writer nem contrato LancamentoV2Form.

export type AbaFinanceira = 'geral' | 'classificacao' | 'pagamento' | 'documentos';

/** Ordem canônica das abas — usada para escolher a PRIMEIRA aba inválida. */
export const ABAS_FINANCEIRAS: readonly AbaFinanceira[] = [
  'geral',
  'classificacao',
  'pagamento',
  'documentos',
] as const;

export const ABA_LABEL: Record<AbaFinanceira, string> = {
  geral: 'Geral',
  classificacao: 'Classificação',
  pagamento: 'Pagamento',
  documentos: 'Documentos',
};

/** Valores brutos do formulário necessários à validação (mesmos usados hoje). */
export interface ValidacaoModalInput {
  // GERAL
  fazendaId: string;
  dataCompetencia: string;
  dataPagamento: string;
  descricao: string;
  tipoOperacao: string;        // '1-Entradas' | '2-Saídas' | '3-Transferências'
  statusTransacao: string;
  valorNum: number;
  contaOrigemId: string;       // '' ou '__none__' = não selecionada
  contaDestinoId: string;
  // CLASSIFICAÇÃO
  subcentro: string;
  // PAGAMENTO
  formaPagamentoParc: 'avista' | 'parcelada';
  numParcelas: number;
  parcelaRowsLength: number;
  frequencia: 'pontual' | 'recorrente';
  recorrenciaRowsLength: number;
}

export interface ValidacaoModalResult {
  /** GERAL: fazenda, datas, descrição, valor>0, tipo, status e conta(s) aplicáveis. */
  geralValida: boolean;
  /** CLASSIFICAÇÃO: subcentro obrigatório. */
  classificacaoValida: boolean;
  /** PAGAMENTO: parcelamento e recorrência coerentes (só restringem quando ativos). */
  pagamentoValido: boolean;
  /** DOCUMENTOS: hoje SEM campo obrigatório real → sempre válida. */
  documentosValida: boolean;
  /** Idêntico ao canSave atual do modal. */
  canSave: boolean;
  /** Abas com pendência, em ordem canônica. DOCUMENTOS nunca entra. */
  abasInvalidas: AbaFinanceira[];
  /** Primeira aba com pendência (ordem canônica) ou null se tudo válido. */
  primeiraAbaInvalida: AbaFinanceira | null;
}

function contaSelecionada(id: string): boolean {
  return !!id && id !== '__none__';
}

/**
 * Reproduz a validação de contas do modal por tipo de operação:
 *  - Transferência: exige origem E destino;
 *  - Entrada: exige apenas destino;
 *  - Saída: exige apenas origem.
 * Campo condicional inaplicável NÃO gera pendência.
 */
export function contaSimpleValid(
  tipoOperacao: string,
  contaOrigemId: string,
  contaDestinoId: string,
): boolean {
  const isTransferencia = tipoOperacao === '3-Transferências';
  const isEntrada = tipoOperacao === '1-Entradas';
  const contaOrigemValid = isTransferencia || !isEntrada ? contaSelecionada(contaOrigemId) : true;
  const contaDestinoValid = isTransferencia || isEntrada ? contaSelecionada(contaDestinoId) : true;
  return !isTransferencia
    ? (isEntrada ? contaDestinoValid : contaOrigemValid)
    : (contaOrigemValid && contaDestinoValid);
}

export function computeValidacaoModal(v: ValidacaoModalInput): ValidacaoModalResult {
  const contaOk = contaSimpleValid(v.tipoOperacao, v.contaOrigemId, v.contaDestinoId);

  // Espelha parceladaValid/recorrenteValid do modal (só restringem quando ativos).
  const parceladaValid =
    v.formaPagamentoParc === 'avista' ||
    (v.numParcelas >= 2 && v.numParcelas <= 24 && v.parcelaRowsLength === v.numParcelas);
  const recorrenteValid = v.frequencia === 'pontual' || v.recorrenciaRowsLength > 0;

  const geralValida =
    !!v.fazendaId &&
    !!v.dataCompetencia &&
    !!v.dataPagamento &&
    !!v.descricao &&
    !!v.tipoOperacao &&
    !!v.statusTransacao &&
    v.valorNum > 0 &&
    contaOk;

  const classificacaoValida = !!v.subcentro;
  const pagamentoValido = parceladaValid && recorrenteValid;
  const documentosValida = true; // sem obrigatório real hoje

  // canSave IDÊNTICO ao inline atual (documentosValida é no-op).
  const canSave = geralValida && classificacaoValida && pagamentoValido && documentosValida;

  const validaPorAba: Record<AbaFinanceira, boolean> = {
    geral: geralValida,
    classificacao: classificacaoValida,
    pagamento: pagamentoValido,
    documentos: documentosValida,
  };

  const abasInvalidas = ABAS_FINANCEIRAS.filter((aba) => !validaPorAba[aba]);
  const primeiraAbaInvalida = abasInvalidas.length > 0 ? abasInvalidas[0] : null;

  return {
    geralValida,
    classificacaoValida,
    pagamentoValido,
    documentosValida,
    canSave,
    abasInvalidas,
    primeiraAbaInvalida,
  };
}
