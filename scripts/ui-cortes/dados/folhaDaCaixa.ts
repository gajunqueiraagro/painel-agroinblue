/**
 * FOLHA-NA-CAIXA-01 — a bancada do recibo do contador na Caixa (dado SINTÉTICO: empregador, pessoas e valores inventados; holerite real
 * NUNCA entra aqui). O PIOR CASO da prévia: nome no teto, a 1ª pessoa que DIVIDE (o 13º inteiro vira 2ª parcela), uma que casa com
 * descrição/vencimento novos, uma sem lançamento (o "Criar"), valores no teto; `caso=folha_aplicada` = o documento já aplicado (Desfazer).
 */
import type { FolhaLida } from '@/lib/folha/lerFolha';
import type { FolhaCaixaApi } from '@/lib/folha/folhaCaixaApi';
import type { Automatico, RespostaDaFolha } from '@/lib/folha/folhaNaCaixa';
import type { Divisao } from '@/lib/pdf/dividirPdf';

export const NOME_DA_FOLHA_DA_BANCADA = 'recibos-13-1a-parcela-ficticio.pdf';
export const FOLHA_DA_BANCADA: FolhaLida = {
  layout: 'sci', tipo: '13_1', competencia: '2026-11', empregadores: ['11122233344'], total: 1000003.5,
  pessoas: [
    { codigo: '12', nome: 'FUNCIONÁRIA FICTÍCIA COM O NOME COMPLETO BEM COMPRIDO DE EXEMPLO', cei: '11122233344', paginas: [1], valor: 730 },
    { codigo: '15', nome: 'FUNCIONÁRIO EXEMPLO DOIS', cei: '11122233344', paginas: [2, 3], valor: 999999.99 },
    { codigo: '20', nome: 'PESSOA NOVA SEM LANÇAMENTO', cei: '11122233344', paginas: [4], valor: 2.01 },
    { codigo: '21', nome: 'OUTRA PESSOA EXEMPLO', cei: '11122233344', paginas: [5], valor: 1.5 },
  ],
};
const auto = (k: number, m: Partial<Automatico>): Automatico => ({
  paginas: FOLHA_DA_BANCADA.pessoas[k].paginas, nome: FOLHA_DA_BANCADA.pessoas[k].nome, lancamentoId: `l${k}`, antes: 3192, depois: FOLHA_DA_BANCADA.pessoas[k].valor,
  nomeConfere: 'exato', casouPor: 'funcionario', acao: 'casar', descricaoAntes: 'Folha Pagamento - 13', descricao: 'Folha Pagamento - 13',
  vencimentoAntes: '2026-12-05', vencimento: '2026-12-05', status: 'previsto', segunda: null, recibo: null, valorConfere: null, statusDepois: null, ...m,
});
const PREVIA: RespostaDaFolha = {
  jaAplicado: false, completar: false, soma: FOLHA_DA_BANCADA.total, documentos: [], semFuncionario: [{ paginas: [4], nome: 'PESSOA NOVA SEM LANÇAMENTO' }],
  automaticos: [
    auto(0, { acao: 'dividir', descricao: '13º Salário 1ª Parcela 2026', vencimento: '2026-11-30',
      segunda: { descricao: '13º Salário 2ª Parcela 2026', valor: 730, vencimento: '2026-12-18' } }),   // Gabriel 24/11: a 2ª = o valor da 1ª
    /* o 'casar' só acontece com quem JÁ é '13º Salário 1ª Parcela' (regra 118570): muda só o valor */
    /* decisão B (Gabriel 24/11): o casar MANTÉM o vencimento do lançamento; depois de 30/11 = o aviso "vence depois do prazo legal" */
    auto(1, { antes: 9999999.99, descricaoAntes: '13º Salário 1ª Parcela 2026', descricao: '13º Salário 1ª Parcela 2026', vencimentoAntes: '2026-12-05',
      vencimento: '2026-12-05', nomeConfere: 'parcial', casouPor: 'favorecido' }),
    auto(3, { antes: 1100, acao: 'dividir', descricao: '13º Salário 1ª Parcela 2026', vencimento: '2026-11-30',
      segunda: { descricao: '13º Salário 2ª Parcela 2026', valor: 1.5, vencimento: '2026-12-18' } }),
  ],
  criar: [], pendencias: [{ paginas: [4], nome: 'PESSOA NOVA SEM LANÇAMENTO', valor: 2.01, pendencia: 'sem_lancamento' }],
  semRecibo: [{ lancamentoId: 'l9', nome: 'PESSOA DO OUTRO EMPREGADOR (RATEIO)', valor: 1167.65 }, { lancamentoId: 'l10', nome: 'MAIS UMA PESSOA DO RATEIO', valor: 888.49 }],
};
const docDe = (p: FolhaLida['pessoas'][number], i: number) => ({ documentoId: `d${i}`, storagePath: `cli/ficticio-p${p.paginas[0]}.pdf`, nome: p.nome, paginas: p.paginas, lancamentoId: `l${i}` });
const docsComCriado = FOLHA_DA_BANCADA.pessoas.map(docDe);
const docs = FOLHA_DA_BANCADA.pessoas.filter((_, k) => k !== 2).map((p, i) => ({ documentoId: `d${i}`, storagePath: `cli/ficticio-p${p.paginas[0]}.pdf`, nome: p.nome, paginas: p.paginas, lancamentoId: `l${i}` }));

/* 118620 (Code 6): o COMPLETAR — o documento aplicado antes SEM as páginas: todos "liga a página", um com o valor de hoje ≠ recibo */
const COMPLETAR: RespostaDaFolha = {
  ...PREVIA, completar: true, pendencias: [], semFuncionario: [], criar: [],
  automaticos: FOLHA_DA_BANCADA.pessoas.map((p, k) => auto(k, { acao: 'anexar', antes: k === 1 ? 999999 : p.valor, recibo: p.valor, valorConfere: k !== 1,
    statusDepois: 'programado', descricaoAntes: '13º Salário 1ª Parcela 2026', descricao: '13º Salário 1ª Parcela 2026', vencimentoAntes: '2026-11-30', vencimento: '2026-11-30' })),
};
export function apiDaFolhaDaBancada(jaAplicada: boolean, completar = false): FolhaCaixaApi {
  let aplicada = jaAplicada;
  let completando = completar;
  return {
    aplicar: async (_c, _e, _d, itens, simular) => {
      if (completando) { if (!simular) completando = false; return { ok: true, dados: simular ? COMPLETAR : { ...COMPLETAR, documentos: docsComCriado } }; }
      if (aplicada) return { ok: true, dados: { ...PREVIA, jaAplicado: true, completar: false, soma: null, automaticos: [], pendencias: [], semRecibo: [], semFuncionario: [] } };
      const criar = itens.some((i) => i.criar);
      /* Gabriel 24/11 13:18: quem é CRIADO pelo recibo também guarda a página (o funcionário nasce/liga no criar — pedido ao Code 6, 118570) */
      const r: RespostaDaFolha = criar
        ? { ...PREVIA, pendencias: [], semFuncionario: [], criar: [{ nome: 'PESSOA NOVA SEM LANÇAMENTO', valor: 2.01, descricao: '13º Salário 1ª Parcela 2026', vencimento: '2026-11-30', funcionarioNovo: true }] }
        : PREVIA;
      if (!simular) aplicada = true;
      return { ok: true, dados: simular ? r : { ...r, documentos: criar ? docsComCriado : docs } };
    },
    desfazer: async () => ({ ok: true, dados: { valores: 3, criados: 1, documentos: 3 } }),
    /* o 2º sobe "não subiu" na 1ª vez: a cena mostra o "de novo" */
    subir: (() => { let n = 0; return async (path: string) => (path.endsWith('-p2.pdf') && n++ === 0 ? { ok: false, erro: 'O PDF não subiu.' } : { ok: true, dados: true }); })(),
  };
}
export const DIVIDIR_DA_BANCADA = async (_b: Uint8Array, grupos: number[][]): Promise<Divisao> => ({ ok: true, arquivos: grupos.map((g) => new Uint8Array(g)) });
