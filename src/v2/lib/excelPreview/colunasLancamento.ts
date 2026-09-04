/**
 * colunasLancamento — o VOCABULÁRIO dos cabeçalhos aceitos, sem dependência nenhuma.
 *
 * ⚠ ESTE ARQUIVO EXISTE PARA QUEBRAR UM CICLO. As constantes moravam em
 * `parserLancamentos`, que importa `parseDataRef`/`parseValorBR` de
 * `parserClassificacao`. Quando o parser legado passou a precisar do mesmo
 * vocabulário, o import de volta fechou o laço — e as constantes chegavam
 * `undefined` na inicialização (`COL_COMPETENCIA is not iterable`, seis arquivos
 * de teste sem coletar). O build passava: o ciclo só morde na ordem de execução
 * dos módulos, que o bundler não denuncia.
 *
 * ⚠ NADA É IMPORTADO AQUI, e é essa a regra do arquivo: um módulo de vocabulário
 * sem arestas de saída não pode participar de ciclo nenhum. `parserLancamentos`
 * segue reexportando estes nomes, então quem já os importava de lá não muda.
 *
 * ⚠ CONTEÚDO MOVIDO VERBATIM de `parserLancamentos.ts:85-114`.
 */
export const COL_COMPETENCIA = ['Data de competência', 'Data de competencia', 'Competência', 'Competencia', 'Data_Competencia', 'Data'];
export const COL_VENCIMENTO = ['Data de vencimento', 'Vencimento', 'Data_Vencimento'];
export const COL_PAGAMENTO = ['Data de pagamento', 'Pagamento', 'Data_Pagamento'];
export const COL_VALOR = ['Valor', 'VALOR', 'Vl', 'Valor R$'];
export const COL_TIPO = ['Tipo de operação', 'Tipo de operacao', 'Tipo', 'Tipo_Operacao'];
export const COL_CONTA_PLANO = ['Conta (plano do cliente)', 'Plano de contas', 'Categoria', 'Classificação', 'Classificacao'];
export const COL_FAZENDA = ['Fazenda', 'FAZENDA', 'Unidade'];
export const COL_FORNECEDOR = ['Fornecedor', 'Favorecido', 'Beneficiário', 'Beneficiario'];
export const COL_CONTA_BANCARIA = ['Conta bancária', 'Conta bancaria', 'Banco', 'Cartão', 'Cartao', 'Conta_Bancaria'];
export const COL_DESCRICAO = ['Descrição', 'Descricao', 'Histórico', 'Historico', 'Produto'];
export const COL_DOCUMENTO = ['Documento', 'Nº Documento', 'Numero Documento', 'Número Documento', 'NF'];
export const COL_TIPO_DOCUMENTO = ['Tipo de documento', 'Tipo_Documento', 'Tipo Doc'];
export const COL_FORMA_PAGAMENTO = ['Forma de pagamento', 'Forma_Pagamento', 'Forma'];
export const COL_OBSERVACAO = ['Observação', 'Observacao', 'Obs', 'OBS', 'Observações', 'Observacoes'];
export const COL_STATUS = ['Status', 'STATUS', 'Situação', 'Situacao'];
export const COL_SAFRA = ['Safra', 'SAFRA'];
export const COL_ID_LANCAMENTO = ['ID (não mexer)', 'ID (nao mexer)', 'ID'];
