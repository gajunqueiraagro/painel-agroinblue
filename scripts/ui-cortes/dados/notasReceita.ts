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
];
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
  lista: montarLista(linhas, new Map([['t1', 'Produtora Exemplo'], ['t2', 'Titular B Exemplo com Nome Comprido']]), new Set([chave(1198, '12345678000190')]), CANDIDATOS),
  titulares: [{ id: 't1', nome: 'Produtora Exemplo' }, { id: 't2', nome: 'Titular B Exemplo com Nome Comprido' }],
  ultimaBusca: '2026-11-16T22:46:13Z', proximaBusca: '2026-11-16T23:46:13Z',
};
