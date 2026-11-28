/**
 * CAIXA-FOLHA-RATEIO-01 — o leitor de verdade da Caixa (`lerDaCaixaCom`, pdfjs falso): o DARF sai com o PAGADOR = o contribuinte impresso
 * (é por ele que a guia da outra parte do rateio vira comprovante) e a RELAÇÃO DE TRABALHADORES do FGTS é lida (antes: "Não sei · sem linha
 * digitável nem chave", o leitor existia e a Caixa não o chamava), com o empregador.
 * ⚠ Dado INVENTADO (a arrecadação é a sintética do linhaDigitavelDv.test; CPF 000.000.000-00, "FULANO FICTICIO").
 */
import { describe, it, expect } from 'vitest';
import { lerDaCaixaCom } from './lerDaCaixa';
import type { PdfjsMinimo } from '@/lib/financeiro/nfe/lerNotaPdf';

type Item = { str: string; x: number; y: number };
const pdfjsDeItens = (paginas: Item[][]): PdfjsMinimo => ({
  getDocument: () => ({ promise: Promise.resolve({ numPages: paginas.length, getPage: async (n: number) => ({
    getViewport: () => ({ width: 842, height: 595 }),
    getTextContent: async () => ({ items: paginas[n - 1].map((i) => ({ str: i.str, transform: [10, 0, 0, 10, i.x, i.y], width: 40, height: 9 })) }),
  }) }) }),
});
/* as linhas viram itens: uma célula a cada 130 pt, uma linha a cada 14 pt (o `montarLinhas` junta com " | ") */
const deLinhas = (linhas: string[][]): Item[] => linhas.flatMap((cs, l) => cs.map((str, c) => ({ str, x: 20 + c * 130, y: 800 - l * 14 })));
const ler = (paginas: Item[][]) => lerDaCaixaCom(pdfjsDeItens(paginas))(new TextEncoder().encode('%PDF falso').buffer, 'pdf');

const DARF = deLinhas([
  ['Documento de Arrecadação'], ['de Receitas Federais'], ['CPF', 'Nome'], ['000.000.000-00', 'FULANO FICTICIO'],
  ['Período de Apuração', 'Data de Vencimento', 'Número do Documento'], ['Novembro/2026', '18/12/2026', '07.00.00000.0000000-0'],
  ['Valor Total do Documento'], ['1.013,23'], ['81660000001-1 23450001111-4 22223333444-0 45555666677-0'],
]);

/* a relação deitada: cada coluna é um x (o fixture do lerGuiasDaFolha.test, mínimo) */
const i = (str: string, x: number, y: number): Item => ({ str, x, y });
const valores = (x: number, total: string, fgts: string, base: string) =>
  [i(total, x, 721), i('0,00', x, 672), i('0,00', x, 632), i('0,00', x, 594), i(fgts, x, 548), i(base, x, 500)];
const RELACAO: Item[] = [
  i('Empregador:', 30, 12), i('000.000.000-00', 30, 64), i('Nome Empregador:', 30, 167), i('FULANO FICTICIO', 30, 244),
  i('Gestão de Guias', 44, 679), i('Relação de Trabalhadores', 91, 325), i('Matrícula', 119, 210), i('Valor FGTS', 116, 533),
  ...valores(135, '80,00', '80,00', '1.000,00'), i('Mensal', 135, 414), i('18/12/2026', 135, 379), i('101', 135, 364), i('00006-11', 135, 210), i('11/2026', 135, 15),
  ...valores(191, '80,00', '80,00', '1.000,00'), i('111.222.333/001-44', 191, 410), i('Total do Estabelecimento', 191, 332),
  ...valores(202, '80,00', '80,00', '1.000,00'), i('Total FGTS', 202, 432),
];

describe('a Caixa lê quem paga a guia', () => {
  it('o DARF: boleto de arrecadação, beneficiário Receita Federal e o PAGADOR = o contribuinte impresso', async () => {
    const r = await ler([DARF]);
    expect(r.k).toBe('boletos');
    if (r.k !== 'boletos') return;
    expect(r.beneficiario.nome).toBe('Receita Federal');
    expect(r.pagador).toEqual({ documento: '00000000000', nome: 'FULANO FICTICIO', confira: false });
  });
  it('a relação de trabalhadores do FGTS vira o tipo relacao, com a competência, o total e o empregador', async () => {
    const r = await ler([RELACAO]);
    expect(r.k).toBe('relacao');
    if (r.k !== 'relacao') return;
    expect(r.relacao).toMatchObject({ competencia: '2026-11', totalGuia: 80, empregador: { documento: '00000000000', nome: 'FULANO FICTICIO' } });
  });
});
