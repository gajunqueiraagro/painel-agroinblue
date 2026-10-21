/* UI-SEM-CORTE-02 — dados SINTETICOS da bancada para os tres modais da OC (venda, abate, compra), as pendencias do consultor e o
 * Casar com o banco 1:1. Nenhum nome, valor ou documento de cliente real: o caso do relato (Entrega com "01/09/…" cortado e a
 * Categoria larga demais) e' reproduzido com nomes inventados. */
const nada = async () => {};
const nadaNull = async () => null;

export const CATS = [
  { value: 'bois', label: 'Bois' }, { value: 'desmama_m', label: 'Desmama Machos' }, { value: 'vacas', label: 'Vacas' },
];
export const FAZ = [{ id: 'f1', nome: 'Faz. Exemplo Santa Maria' }];
export const CP = [{ id: 'cp1', nome: 'Comprador Exemplo Sintético Agropecuária Ltda', cpfCnpj: '11.222.333/0001-81' }];

export const LOTES_FORM = [
  { idLocal: 'l1', id: 'lote-1', ordem: 1, categoria: 'bois', quantidade: '36', pesoMedioKg: '461,72', criterioValor: 'kg', valorInformado: '12,80', observacao: '' },
  { idLocal: 'l2', id: 'lote-2', ordem: 2, categoria: 'desmama_m', quantidade: '18', pesoMedioKg: '248,21', criterioValor: 'cab', valorInformado: '2.950,00', observacao: '' },
];

export const lotesApi = () => ({
  lotes: LOTES_FORM, loading: false, saving: false,
  adicionarLote: () => 'novo', editarLote: () => {}, removerLote: () => {}, salvar: async () => null, recarregar: nada,
  totais: { lotes: 2, animais: 54, pesoTotal: 21089.7, valorNegociado: 265867.46 },
});

export const recebimentoApi = () => ({
  lotes: [
    { loteId: 'lote-1', ordem: 1, categoria: 'bois', qtdNegociada: 36, qtdRecebida: 36, diferenca: 0, estado: 'recebido',
      pesoMedioNegociadoKg: 461.72, criterioValor: 'kg', valorInformado: 12.8 },
    { loteId: 'lote-2', ordem: 2, categoria: 'desmama_m', qtdNegociada: 18, qtdRecebida: 12, diferenca: -6, estado: 'parcial',
      pesoMedioNegociadoKg: 248.21, criterioValor: 'cab', valorInformado: 2950 },
  ],
  movimentacoes: [
    { id: 'm1', loteId: 'lote-1', data: '2026-09-01', categoria: 'bois', quantidade: 36, pesoMedio: 461.72, cancelado: false,
      origem: 'registrada', lancamentoId: 'lc1', valorTotal: 212754.6 },
    { id: 'm2', loteId: 'lote-2', data: '2026-09-15', categoria: 'desmama_m', quantidade: 12, pesoMedio: 248.21, cancelado: false,
      origem: 'adotada', lancamentoId: 'lc2', valorTotal: 35400 },
  ],
  loading: false, saving: false,
  concluirNegociacao: async () => true, receberTodos: nada, listarAdotaveis: async () => ({ saidas: [], erro: null }),
  adotar: nadaNull, desvincular: nadaNull, registrar: nada, estornar: nada, encerrar: nada, reabrir: nada,
  estornarTudo: async () => true, recarregar: nada,
});

export const documentosApi = () => ({
  documentos: [], lotes: [{ id: 'lote-1', ordem: 1, categoria: 'bois' }], loading: false, saving: false,
  registrar: nadaNull, anexarArquivo: async () => true, urlAssinada: nadaNull, editar: async () => true, cancelar: async () => true,
  carregarDetalhe: nadaNull,
});

/* OC-DOC-VENDA-01 — a aba Documentos COM documentos (`&docs=1`): o abate (frigorifico + saida) e a venda (operacao + saida), com o
   numero longo do contrato e a nota repetida (rotulo longo) para a faixa. SINTETICO. */
const docOC = (p: Record<string, unknown>) => ({ documentoId: String(p.documentoId), especie: 'outro', numero: null, serie: null,
  dataEmissao: '2026-10-01', situacao: 'ativo', cancelado: false, valorLiquido: 0, totalAcrescimos: 0, totalDescontosComerciais: 0,
  totalRetencoesSemCaixa: 0, totalDespesasDesembolso: 0, qtdComponentes: 1, qtdLotes: 2, documentoOrigemId: null, url: 'x.pdf', emitenteId: null,
  emitenteNome: null, emitenteDocumento: null, cab: null, pesoKg: null, dataAbate: null, vencimento: null, dados: null, liquidoProprio: 0,
  somaNoValor: false, ...p });
export const documentosDaOC = (tipo: string) => (tipo === 'abate' ? [
  docOC({ documentoId: 'n1', especie: 'nf_principal', numero: '000008812', cab: 150, pesoKg: 38250.5, liquidoProprio: 739102.11, valorLiquido: 739102.11, somaNoValor: true }),
  docOC({ documentoId: 'a1', especie: 'acerto', dados: { ordem_compra: '10352' }, cab: 150, pesoKg: 38250.5, liquidoProprio: 739102.11 }),
  docOC({ documentoId: 'r1', especie: 'romaneio', dados: { op: '88123' }, cab: 150, pesoKg: 38250.5, qtdComponentes: 0 }),
  docOC({ documentoId: 'p1', especie: 'nf_produtor', numero: '9444790', cab: 150, totalInformativo: 750000 }),
  docOC({ documentoId: 'g1', especie: 'gta', serie: 'Q', numero: '745856', cab: 150, qtdComponentes: 0 }),
] : [
  docOC({ documentoId: 'c1', especie: 'contrato', numero: 'PEDIDO DE VENDA Nº 2026/000731 · COMPRADOR EXEMPLO AGROPECUÁRIA LTDA', totalInformativo: 750000 }),
  docOC({ documentoId: 'e1', especie: 'nf_entrada', numero: '123456', totalInformativo: 750000 }),
  docOC({ documentoId: 'p1', especie: 'nf_produtor', numero: '9444790', cab: 150, liquidoProprio: 750000, valorLiquido: 750000, somaNoValor: true }),
  docOC({ documentoId: 'g1', especie: 'gta', serie: 'Q', numero: '745856', cab: 150, qtdComponentes: 0 }),
  docOC({ documentoId: 'u1', especie: 'guia', numero: 'Fundersul', dados: { tipo_guia: 'fundersul' }, totalInformativo: 3120.5 }),
  docOC({ documentoId: 'm1', especie: 'declaracao', numero: '12', dados: { tipo_declaracao: 'modelo_b' }, qtdComponentes: 0 }),
]);
export const notaRepetidaLonga = async () => ({ documentoId: 'z', operacaoId: 'op-z', tipoOperacao: 'venda',
  rotulo: 'Venda de 02/04/2026 · Comprador Exemplo Agropecuária e Participações Societárias Ltda' });

export const eventosApi = () => ({
  eventos: [
    { id: 'e1', acao: 'salvar_lotes', detalhes: null, dados_anteriores: null, dados_novos: null, usuario_id: null, origem: 'tela',
      created_at: '2026-09-01T12:00:00Z' },
  ],
  loading: false, temMais: false, carregarMais: () => {},
});

export const liquidacaoApi = (tipo: string) => ({
  resumo: null, obrigacoes: [], liquidacoesPorTitulo: {}, documentos: [], componentes: [], fornecedores: [],
  tipoOperacao: tipo, naturezaFluxo: null, clienteId: 'cli', contraparteId: 'cp1', lotes: [], valorAcordado: 265867.46,
  loading: false, saving: false, gerarObrigacoes: async () => true, cancelarObrigacao: async () => true,
  registrarLiquidacao: async () => true, estornarLiquidacao: async () => true, recarregar: () => {},
});

const masked = (v: string) => ({ displayValue: v, onChange: () => {}, onBlur: () => {}, onFocus: () => {} });
const f = () => {};

/* O caso do relato: o mes de setembro/2026 FECHADO no P1 — a faixa "Reabrir mês" aparece no rodape dos tres modais. */
export const MES_FECHADO = 'Setembro/2026 fechado no Mapa de Pastos (P1) para Faz. Exemplo Santa Maria. Reabra pelo botão ao lado ou em Produção › Fechamento Área.';

export const propsVenda = (aba: string) => ({
  data: '2026-09-01', setData: f, compradorId: 'cp1', setCompradorId: f, contrapartes: CP, clienteId: 'cli', onNovoComprador: f,
  vendaFazendaId: 'f1', setVendaFazendaId: f, fazendasOC: FAZ, propriedadeDestino: 'Faz. Destino Exemplo', setPropriedadeDestino: f,
  vendaTipoVenda: 'gado_magro', setVendaTipoVenda: f, observacao: '', setObservacao: f, ocOperacaoId: 'f74f95e5-0000-4000-8000-000000000000',
  ocVersao: 7, ocStatusComercial: 'fechada', lotesApi: lotesApi(), categoria: '', categoriasDisponiveis: CATS, quantidadeNum: 54,
  pesoKgNum: 21089.7, submitting: false, onSalvarOperacao: async () => true, onSalvarNegociacao: async () => {}, onFechar: f,
  documentosApi: documentosApi(), eventosApi: eventosApi(), liquidacaoApi: liquidacaoApi('venda'), recebimentoApi: recebimentoApi(),
  abaInicial: aba,
});

export const propsAbate = (aba: string) => ({
  data: '2026-09-01', setData: f, frigorificoId: 'cp1', setFrigorificoId: f, contrapartes: CP, clienteId: 'cli', onNovoFrigorifico: f,
  abateFazendaId: 'f1', setAbateFazendaId: f, fazendasOC: FAZ, observacao: '', setObservacao: f, numeroDocumento: null,
  ocOperacaoId: 'ab4be000-0000-4000-8000-000000000000', ocVersao: 5, ocStatusComercial: 'fechada', lotesApi: lotesApi(),
  categoria: '', categoriasDisponiveis: CATS, quantidadeNum: 54, pesoKgNum: 21089.7, submitting: false,
  onSalvarOperacao: async () => true, onSalvarNegociacao: async () => {}, onFechar: f,
  documentosApi: documentosApi(), eventosApi: eventosApi(), liquidacaoApi: liquidacaoApi('abate'), recebimentoApi: recebimentoApi(),
  abaInicial: aba,
});

export const propsCompra = (aba: string) => ({
  statusOp: 'realizado', setStatusOp: f, cenariosPermitidos: ['realizado'], canEditMeta: false, data: '2026-09-01', setData: f,
  qtdInput: masked('54'), pesoInput: masked('390,55'), categoria: 'bois', setCategoria: f, categoriasDisponiveis: CATS,
  observacao: '', setObservacao: f, fazendaOrigem: 'Faz. Origem Exemplo', setFazendaOrigem: f, fazendaAtualNome: 'Faz. Exemplo Santa Maria',
  fazendaAtualId: 'f1', fazendas: FAZ, fazendaDestinoId: 'f1', setFazendaDestinoId: f, compraFornecedorId: 'cp1', setCompraFornecedorId: f,
  fornecedores: CP, clienteId: 'cli', setNovoFornecedorCompraOpen: f, compraDetalhes: null, setCompraDetalhes: f, setNotaFiscal: f,
  compraDialogOpen: false, setCompraDialogOpen: f, quantidadeNum: 54, pesoKgNum: 21089.7, handleRequestRegister: f, handleCancelEdit: f,
  submitting: false, editingId: null, mesFechadoMsg: null, modoOC: true, abaInicial: aba, ocOperacaoId: 'c0b4a000-0000-4000-8000-000000000000',
  lotesApi: lotesApi(), recebimentoApi: recebimentoApi(), documentosApi: documentosApi(), eventosApi: eventosApi(),
  liquidacaoApi: liquidacaoApi('compra'), ocStatusComercial: 'fechada', ocDataOperacao: '2026-09-01', ocEntregaEncerrada: false,
  somenteLeitura: false, aberturaExistente: true, ocTemTitulo: false, ocRascunho: false, ocFazendaValida: true, acaoOcLoading: null,
  ocDadosSujos: false, erroSalvarOC: null, ocVersao: 4, onClose: f,
});

export const PENDENCIAS = [
  { id: 'p1', clienteId: 'cli', prazo: '2026-10-19', cobrarDe: 'Escritório contábil exemplo', oQue: 'Enviar o extrato de setembro da conta de investimento',
    origemTipo: 'conciliacao', origemRef: 'set/26', status: 'aberta', ultimaCobrancaEm: null, ultimaCobrancaCanal: null, resolvidaEm: null },
  { id: 'p2', clienteId: 'cli', prazo: '2026-10-25', cobrarDe: 'Gerente da fazenda', oQue: 'Conferir as GTAs da venda de setembro', origemTipo: 'oc',
    origemRef: 'f74f95e5', status: 'cobrada', ultimaCobrancaEm: '2026-10-18', ultimaCobrancaCanal: 'whatsapp', resolvidaEm: null },
  { id: 'p3', clienteId: 'cli', prazo: '2026-11-02', cobrarDe: 'Campeiro', oQue: 'Mapa de pastos de outubro', origemTipo: 'fechamento', origemRef: 'out/26',
    status: 'aberta', ultimaCobrancaEm: null, ultimaCobrancaCanal: null, resolvidaEm: null },
  { id: 'p4', clienteId: 'cli', prazo: null, cobrarDe: 'Produtor', oQue: 'Nota do frete de agosto', origemTipo: 'outro', origemRef: null,
    status: 'aberta', ultimaCobrancaEm: null, ultimaCobrancaCanal: null, resolvidaEm: null },
  { id: 'p5', clienteId: 'cli', prazo: '2026-09-30', cobrarDe: 'Banco exemplo', oQue: 'Saldo da conta corrente', origemTipo: 'conciliacao', origemRef: 'set/26',
    status: 'resolvida', ultimaCobrancaEm: '2026-09-28', ultimaCobrancaCanal: 'email', resolvidaEm: '2026-10-01T10:00:00Z' },
  { id: 'p6', clienteId: 'cli', prazo: '2026-12-10', cobrarDe: 'Escritório contábil exemplo', oQue: 'Documentos da compra parcelada', origemTipo: 'outro', origemRef: null,
    status: 'aberta', ultimaCobrancaEm: null, ultimaCobrancaCanal: null, resolvidaEm: null },
];

export const fontePendencias = (lista = PENDENCIAS) => ({
  listar: async () => ({ ok: true, lista }), criar: nadaNull, cobrar: nadaNull, resolver: nadaNull,
});
