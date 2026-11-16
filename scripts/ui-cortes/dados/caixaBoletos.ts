/**
 * BOLETO-DDA-API-01 · D1c (a) — a bancada da CAIXA DE BOLETOS (dado SINTÉTICO: fornecedores inventados, documentos de exemplo).
 * A API em memória responde como a `fn_boleto_entrar` / `fn_boletos_lista` (as mesmas chaves) e o leitor falso devolve a leitura
 * pelo NOME do arquivo que o gate solta — os casos do mock v3 e um pior caso (nome e beneficiário longos, valor no teto).
 */
import { listaDaCaixa, respostaDeEntrar, type CaixaApi } from '@/lib/financeiro/boleto/caixaApi';
import type { LerArquivoDeBoleto } from '@/hooks/useCaixaDeBoletos';
import { FRASE_SEM_TEXTO, FRASE_SENHA, type LeituraDoBoleto } from '@/lib/financeiro/boleto/lerBoleto';

const lanc = (id: string, descricao: string, valor: number, m: Record<string, unknown> = {}) => ({
  id, descricao, valor, status: 'previsto', cancelado: false, vencimento: '2026-12-10', agendado_para: null, pagamento: null,
  favorecido: 'Fornecedor', favorecido_documento: null, conta: null, conciliado: false, programado_por: null, ...m,
});
interface Caso { linha: string; valor: number; benef: string; doc: string | null; banco: Record<string, unknown> }
const L = (c: string) => c.repeat(47).slice(0, 47);
const CASOS: Record<string, Caso> = {
  'boleto-0031283.pdf': { linha: L('1'), valor: 964.67, benef: 'Fornecedor A Insumos Ltda', doc: '11222333000181',
    banco: { candidatos: [{ tipo: 'exato', soma: 964.67, lancamentos: [lanc('a1', 'NF 31.283 · parcela 1/1', 964.67)] }] } },
  'boleto_dez_G.pdf': { linha: L('2'), valor: 2150, benef: 'Fornecedor G', doc: '22333444000172',
    banco: { candidatos: [{ tipo: 'soma', soma: 2150, lancamentos: [lanc('g1', 'NF 880', 1000), lanc('g2', 'NF 912', 1150)] }] } },
  'boleto-condominio.pdf': { linha: L('3'), valor: 1250, benef: 'Fornecedor C Condomínio Rural', doc: '33444555000163',
    banco: { ja_existe: true, id: 'b-c', frase: 'Este boleto já está no sistema desde 02/12/2026.',
      situacao: { lancamentos: [lanc('c1', 'Condomínio · parcela 3/6', 1250, { status: 'agendado', conta: 'Sicredi CC', agendado_para: '2026-12-05', programado_por: { nome: 'Amanda', em: '2026-12-03T12:00:00Z' } })], avisos: [] } } },
  'boleto_insumos.pdf': { linha: L('4'), valor: 2410, benef: 'Fornecedor D', doc: null,
    banco: { candidatos: [{ tipo: 'por_nome', soma: 2410, lancamentos: [lanc('d1', 'Fornecedor D · insumos', 2410, { vencimento: '2026-12-18' })] }] } },
  'boleto-pago-antes.pdf': { linha: L('5'), valor: 3866.57, benef: 'Fornecedor B Nutrição Animal e Comércio de Rações do Centro-Oeste Ltda', doc: '44555666000154',
    banco: { candidatos: [], situacao: { lancamentos: [], avisos: [{ codigo: 'parece_ja_pago', lancamentos: [lanc('p1', 'Ração · NF 4.410', 3866.57, { status: 'realizado', conta: 'BB CC', pagamento: '2026-12-09' })] }, { codigo: 'pagador_de_fora' }] } } },
  'boleto com nome de arquivo muito comprido que não cabe na coluna 2026-12.pdf': { linha: L('6'), valor: 9999999.99, benef: 'Fornecedor E', doc: '55666777000145',
    banco: { candidatos: [] } },
};
const senhaCerta = '11144';

export const LER_CAIXA_BANCADA: LerArquivoDeBoleto = async (bytes, senha) => {
  const nome = new TextDecoder().decode(new Uint8Array(bytes)).replace(/^%PDF /, '');
  if (nome === 'Boleto_Unimed.pdf') {
    if (senha !== senhaCerta) return { ok: false, motivo: senha ? 'senha_errada' : 'senha', frase: FRASE_SENHA };
    return { ok: true, leitura: leitura(CASOS['boleto-0031283.pdf']) };
  }
  if (nome === 'boleto-escaneado.pdf') return { ok: false, motivo: 'sem_texto', frase: FRASE_SEM_TEXTO };
  const c = CASOS[nome];
  return c ? { ok: true, leitura: leitura(c) } : { ok: true, leitura: { ...leitura(CASOS['boleto-0031283.pdf']), boleto: null } };
};
function leitura(c: Caso): LeituraDoBoleto {
  return {
    boleto: { ok: true, codigo_barras: c.linha.slice(0, 44), linha: c.linha, tipo: 'bancario', banco: '341', valor: c.valor, vencimento: '2026-12-10' },
    beneficiario: { nome: c.benef, documento: c.doc, confira: c.doc === null }, pagador: { nome: 'Cliente Bancada', documento: '11144477735', confira: false },
  };
}
const casoDaLinha = (linha: unknown) => Object.values(CASOS).find((c) => c.linha === linha);

const gravados = [
  { id: 'g-1', codigo_barras: '7'.repeat(44), situacao: 'novo', beneficiario_nome: 'Fornecedor F Serviços Agronômicos', valor: 1840.5, vencimento: '2026-12-20', criado_em: '2026-11-14T13:00:00Z', situacao_atual: { lancamentos: [] } },
  { id: 'g-2', codigo_barras: '8'.repeat(44), situacao: 'sem_par', beneficiario_nome: 'Fornecedor H Energia', valor: 612.3, vencimento: '2026-12-02', criado_em: '2026-11-10T09:00:00Z', situacao_atual: { lancamentos: [], avisos: [{ codigo: 'pagador_de_fora' }] } },
  { id: 'g-3', codigo_barras: '9'.repeat(44), situacao: 'ligado', beneficiario_nome: 'Fornecedor B Nutrição Animal e Comércio de Rações do Centro-Oeste Ltda', valor: 3866.57, vencimento: '2026-12-10', criado_em: '2026-11-08T09:00:00Z',
    situacao_atual: { lancamentos: [lanc('l1', 'Ração · NF 4.410', 3856.57, { status: 'agendado', conta: 'BB CC', agendado_para: '2026-12-10', programado_por: { nome: 'Amanda' } })],
      avisos: [{ codigo: 'soma_diferente', soma: 3856.57, valor: 3866.57, diferenca: 10, explicacao: 'juros de 1 dia' }, { codigo: 'ja_programado', por: { nome: 'Amanda' } }] } },
];

export const API_CAIXA_BANCADA: CaixaApi = {
  lista: async () => ({ ok: true, dados: listaDaCaixa({ contadores: { novo: 1, sem_par: 1, ligado: 1 }, itens: gravados }) }),
  entrar: async (_c, l, simular) => {
    const c = casoDaLinha(l.linha);
    if (!c) return { ok: true, dados: respostaDeEntrar({ ok: false, recusa: { frase: 'A linha digitável não confere (dígito verificador ou tamanho). Confira os números.' } }) };
    return { ok: true, dados: respostaDeEntrar({
      ok: true, simulado: simular, ja_existe: false, id: null, avisos: [], candidatos: [], situacao: { lancamentos: [], avisos: [] },
      boleto: { codigo_barras: c.linha.slice(0, 44), linha_digitavel: c.linha, tipo: 'bancario', valor: c.valor, vencimento: '2026-12-10', beneficiario_nome: c.benef, beneficiario_documento: c.doc, situacao: 'novo' },
      ...c.banco,
    }) };
  },
  subirArquivo: async () => ({ ok: true, dados: true }),
  documentosDosTitulares: async () => ({ ok: true, dados: ['111.444.777-35', '22.333.444/0001-72'] }),
};
/** Os arquivos que o gate solta (o conteúdo é o próprio nome: o leitor da bancada lê por ele). */
export const ARQUIVOS_DA_BANCADA = [...Object.keys(CASOS), 'Boleto_Unimed.pdf', 'boleto-escaneado.pdf'];
