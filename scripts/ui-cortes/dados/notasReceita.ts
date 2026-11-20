/* NOTAS-RECEITA-A1-01 F3.4 — dados SINTÉTICOS da lista "Notas da Receita" na bancada (nenhuma nota real): todas as situações, o pior
   texto (emitente comprido, valor de 9 dígitos, nº de 9 dígitos, CPF de emitente pessoa física) e eventos. */
import { montarLista, type CandidatoDaNota, type LinhaRecebida } from '@/lib/fiscal/notasDaReceita';
import type { DadosDaReceita } from '@/hooks/useNotasDaReceita';

const chave = (n: number, cnpj: string) => `502611${cnpj.padStart(14, '0')}55001${String(n).padStart(9, '0')}1123456780`;
const L = (n: number, emit: string, doc: string, dia: number, cent: number, situacao: LinhaRecebida['situacao'], o: Partial<LinhaRecebida> = {}): LinhaRecebida => ({
  id: `b-${n}`, titularId: n % 3 === 0 ? 't2' : 't1', chave: chave(n, doc), situacao, emitenteDocumento: doc, emitenteNome: emit,
  emissao: `2026-11-${String(dia).padStart(2, '0')}`, valorCent: cent, notaId: null, recebidoEm: null, eventos: [], temXml: false, ...o,
});
const linhas: LinhaRecebida[] = [
  L(1234, 'Casa Agro Exemplo Ltda', '12345678000190', 14, 1834050, 'xml'),
  L(88120, 'Posto Rodovia Exemplo', '23456789000101', 14, 94315, 'resumo'),
  L(45002, 'Cooperativa Exemplo de Insumos Agropecuários do Centro-Oeste Brasileiro Ltda', '34567890000112', 13, 2560000, 'manifestado'),
  L(310554, 'Frigorífico Exemplo S.A.', '45678901000123', 12, 999999999, 'xml'),
  L(2201, 'Mecânica Exemplo', '56789012000134', 11, 412000, 'xml'),
  L(1198, 'Casa Agro Exemplo Ltda', '12345678000190', 10, 755020, 'xml'),
  L(9871, 'Veterinária Exemplo', '67890123000145', 9, 128900, 'importado'),
  L(5540, 'Transportadora Exemplo', '78901234000156', 8, 360000, 'cancelado_na_sefaz', { eventos: [{ tpEvento: '110111', descricao: 'Cancelamento' }] }),
  L(999999999, 'Produtor Vizinho Exemplo', '52998224725', 7, 23450, 'xml', { eventos: [{ tpEvento: '110110', descricao: 'Carta de Correção' }] }),
  L(14002, 'Distribuidora de Sal Exemplo', '90123456000178', 6, 1597000, 'resumo'),
  L(44871, 'Cooperativa Exemplo de Insumos', '34567890000112', 5, 3120075, 'xml'),
  L(3456, 'Auto Peças Exemplo', '01234567000189', 3, 87600, 'resumo'),
  /* NOTAS-RECEITA-SEM-LANCAMENTO-01 — uma de cada classe (sintético; os atributos fiscais abaixo): comodato, entrega futura (cita o faturamento),
     devolução, garantia, bonificação, conserto, venda do titular (entrada do frigorífico) e a substituta da cancelada 5.540 (mesmo emitente/valor) */
  L(117573, 'Distribuidora de Combustível Exemplo de Nome Comprido Ltda', '00858886000109', 2, 700000, 'xml'),
  L(9336394, 'Revenda de Máquinas Exemplo', '01357922000101', 2, 4082000, 'xml'),
  L(7001, 'Rações Exemplo', '11222333000144', 2, 196656, 'xml'),
  L(7002, 'Peças Exemplo em Garantia', '22333444000155', 1, 725681, 'xml'),
  L(7003, 'Rações Exemplo', '11222333000144', 1, 146710, 'xml'),
  L(7004, 'Oficina Exemplo', '33444555000166', 1, 99999999, 'xml'),
  L(7005, 'Frigorífico Exemplo S.A.', '45678901000123', 1, 2024996, 'xml'),
  L(5541, 'Transportadora Exemplo', '78901234000156', 8, 360000, 'xml'),
  /* NOTA-DEMONSTRACAO-01 — a demonstração comprada depois (7.891 → compra 8.001 da filial, o mesmo item), a devolvida (7.878 → a entrada 2913
     do fornecedor, que cita a demonstração) e a que ainda está com o cliente (7.900: "Registrar bem") */
  L(7891, 'Máquinas Exemplo para Demonstração Ltda', '01762373000150', 4, 1000000, 'xml'),
  L(8001, 'Máquinas Exemplo para Demonstração Ltda', '01762373000231', 12, 1000000, 'xml'),
  L(7878, 'Máquinas Exemplo para Demonstração Ltda', '01762373000150', 3, 850000, 'xml'),
  L(7880, 'Máquinas Exemplo para Demonstração Ltda', '01762373000150', 10, 850000, 'xml'),
  L(7900, 'Implementos Exemplo', '61222333000144', 9, 420000, 'xml'),
];
type Dup = { numero: string; vencimento: string; valorCent: number };
const at = (cfops: string[], natOp: string, tpNF = '1', refs: string[] = [], dups: Dup[] = [], tpags: string[] = []) => ({ cfops, tpNF, natOp, refs, dups, tpags });
/* NOTAS-RECEITA-VENC-01 — duplicatas SINTÉTICAS com "hoje" = 16/11/2026: a 1.234 em 3 (1 vencida, a próxima em 4 dias = âmbar), a 310.554
   vencida há 14 dias (vermelho), a 2.201 em 1 (normal), a 44.871 em 12 (o "12/12" no teto) e a 999.999.999 à vista (PIX) */
const D = (n: number, venc: string, cent: number): Dup => ({ numero: String(n).padStart(3, '0'), vencimento: venc, valorCent: cent });
const VENDA = (dups: Dup[], tpags: string[] = ['15']) => at(['5102'], 'VENDA', '1', [], dups, tpags);
const ATRIBUTOS = new Map([
  [chave(1234, '12345678000190'), VENDA([D(1, '2026-10-30', 611350), D(2, '2026-11-20', 611350), D(3, '2026-12-20', 611350)])],
  [chave(310554, '45678901000123'), VENDA([D(1, '2026-11-02', 999999999)])],
  [chave(2201, '56789012000134'), VENDA([D(1, '2026-12-10', 412000)])],
  [chave(44871, '34567890000112'), VENDA(Array.from({ length: 12 }, (_, i) => {
    const m = 9 + i; /* outubro/2026 em diante, todo dia 25: a 1ª já venceu, a próxima é a 2/12 */
    return D(i + 1, `${2026 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-25`, 260006);
  }))],
  [chave(999999999, '52998224725'), VENDA([], ['17'])],
  [chave(7891, '01762373000150'), at(['6912'], 'DEMONSTACAO FORA DO ESTADO')],
  [chave(8001, '01762373000231'), VENDA([D(1, '2026-12-12', 1000000)])],
  [chave(7878, '01762373000150'), at(['6912'], 'REMESSA PARA DEMONSTRACAO')],
  [chave(7880, '01762373000150'), at(['2913'], 'RETORNO DE DEMONSTRACAO', '0', [chave(7878, '01762373000150')])],
  [chave(7900, '61222333000144'), at(['5912'], 'REMESSA PARA DEMONSTRACAO')],
  [chave(117573, '00858886000109'), at(['5908'], 'REMESSA BEM P/CONTA CONTR COMODATO')],
  [chave(9336394, '01357922000101'), at(['5116'], 'REMESSA ENTREGA FUTURA', '1', [chave(8568045, '01357922000101')])],
  [chave(7001, '11222333000144'), at(['1202'], 'DEV VDA MERC ADQ OU REC TERC', '0')],
  [chave(7002, '22333444000155'), at(['5949'], 'SUBSTITUICAO DE MERCADORIA EM GARANTIA')],
  [chave(7003, '11222333000144'), at(['6910'], 'REMESSA DE BONIFICACAO')],
  [chave(7004, '33444555000166'), at(['5915'], 'REMESSA PARA CONSERTO')],
  [chave(7005, '45678901000123'), at(['2101'], 'COMPRA PARA INDUSTRIALIZACAO', '0')],
]);
/* NOTA-RECEITA-CASAR-01 — candidatos SINTÉTICOS: 1 do mesmo CNPJ (pré-marcado) na 2.201; 3 na 44.871 (sem fornecedor com nome no teto,
   outro fornecedor, mesmo CNPJ) — o pior texto da tabela do quadro */
const C = (id: string, classe: CandidatoDaNota['classe'], o: Partial<CandidatoDaNota> = {}): CandidatoDaNota => ({
  id, classe, competencia: '2026-11-11', vencimento: '2026-12-10', pagamento: '2026-12-10', descricao: 'Peças oficina', status: 'realizado',
  conciliado: false, valorCent: 412000, conta: 'Cartão BB - Ourocard Visa', fornecedorNome: 'Mecânica Exemplo', ...o,
});
const CANDIDATOS = new Map<string, CandidatoDaNota[]>([
  [chave(2201, '56789012000134'), [C('c1', 'mesmo_cnpj')]],
  [chave(44871, '34567890000112'), [
    C('c2', 'sem_fornecedor', { valorCent: 3120075, descricao: 'Mercadolivre*Loja Exemplo de Insumos com Descrição Muito Comprida', fornecedorNome: null,
      conta: 'Sicredi Lavoura', competencia: '2026-11-20', pagamento: null, vencimento: '2026-12-20', status: 'programado' }),
    C('c3', 'outro_fornecedor', { valorCent: 3120075, descricao: 'Insumos', fornecedorNome: 'Outra Cooperativa Exemplo de Nome Comprido Ltda',
      conta: 'Banco do Brasil', competencia: '2026-11-06', pagamento: '2026-11-06', conciliado: true }),
    C('c4', 'mesmo_cnpj', { valorCent: 3120075, descricao: 'Adubo', fornecedorNome: 'Cooperativa Exemplo de Insumos', conta: 'Banco do Brasil',
      competencia: '2026-11-05', pagamento: '2026-11-30', status: 'realizado' }),
  ]],
]);
export const DADOS_RECEITA_BANCADA: DadosDaReceita = {
  lista: montarLista(linhas, new Map([['t1', 'Produtora Exemplo'], ['t2', 'Titular B Exemplo com Nome Comprido']]), new Set([chave(1198, '12345678000190')]), CANDIDATOS, ATRIBUTOS, '2026-11-16', [
    { demo: chave(7891, '01762373000150'), nota: chave(8001, '01762373000231'), tipo: 'compra', por: 'item' },
    { demo: chave(7878, '01762373000150'), nota: chave(7880, '01762373000150'), tipo: 'retorno', por: 'cita' },
  ]),
  titulares: [{ id: 't1', nome: 'Produtora Exemplo' }, { id: 't2', nome: 'Titular B Exemplo com Nome Comprido' }],
  ultimaBusca: '2026-11-16T22:46:13Z', proximaBusca: '2026-11-16T23:46:13Z',
};

/* UI-LARGURA-FIXA-01 (Gabriel 19/11 08:35) — o SEGUNDO cliente da prova: poucas notas, nomes CURTOS, um produtor (o perfil da Vera). A divisão
   das colunas tem de ser a MESMA da lista longa (a do NJ) — `v=curta` na bancada. SINTÉTICO. */
const curtas: LinhaRecebida[] = [
  L(78728, 'Agro Sul', '00196816000110', 15, 25990, 'resumo'),
  L(1226616, 'Pet Vet', '11222333000144', 12, 9850, 'xml'),
  L(4512, 'Casa Rural', '22333444000155', 8, 120000, 'xml'),
];
export const DADOS_RECEITA_CURTA: DadosDaReceita = {
  lista: montarLista(curtas, new Map([['t1', 'Vera'], ['t2', 'Vera']]), new Set([chave(4512, '22333444000155')]), new Map(),
    new Map([[chave(1226616, '11222333000144'), VENDA([D(1, '2026-12-01', 9850)])]]), '2026-11-16'),
  titulares: [{ id: 't1', nome: 'Vera' }],
  ultimaBusca: '2026-11-16T22:46:13Z', proximaBusca: '2026-11-16T23:46:13Z',
};
