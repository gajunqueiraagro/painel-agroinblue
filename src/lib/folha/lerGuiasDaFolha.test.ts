/**
 * FOLHA-VERA-PACOTE-01 F2 — os leitores das guias do pacote da folha: DARF, GFD, Relação de Trabalhadores do FGTS e recibo da DCTFWeb.
 * ⚠ Dado INVENTADO no formato do layout (contribuinte, estabelecimentos, matrículas e valores fictícios); nenhum documento de cliente entra.
 * O PIX é o exemplo do Manual do BR Code (BCB), com o CRC 1D3D publicado.
 */
import { describe, it, expect } from 'vitest';
import type { ItemDoDanfe } from '@/lib/financeiro/nfe/danfe';
import {
  lerDarf, lerGfd, lerRelacaoFgts, lerDctfweb, tipoNoDarf, crcDoPix, pixConfere,
  FRASE_NAO_E_DARF, FRASE_NAO_E_GFD, FRASE_NAO_E_RELACAO_FGTS, FRASE_NAO_E_DCTFWEB,
} from './lerGuiasDaFolha';

const L = (...c: string[]) => c.join(' | ');
const PIX_BCB = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';

describe('o PIX copia e cola', () => {
  it('o CRC16 do BR Code: o exemplo do manual do BCB confere; um caractere trocado não', () => {
    expect(crcDoPix(PIX_BCB.slice(0, -4))).toBe('1D3D');
    expect(pixConfere(PIX_BCB)).toBe(true);
    expect(pixConfere(PIX_BCB.replace('Fulano', 'Fulana'))).toBe(false);
    expect(pixConfere('qualquer coisa')).toBe(false);
  });
});

/* ═══ DARF ═══ */
const DARF = [
  'Documento de Arrecadação', 'de Receitas Federais', L('CPF', 'Nome'), L('000.000.000-00', 'FULANO FICTICIO'),
  L('Período de Apuração', 'Data de Vencimento', 'Número do Documento'), 'Pagar este documento até', L('Março/2026', '20/04/2026', '07.00.00000.0000000-0'),
  '20/04/2026', 'Observações', 'Nº Recibo Declaração: 12345678901234', 'Valor Total do Documento', '1.230,00',
  'Composição do Documento de Arrecadação', L('Código', 'Denominação', 'Principal', 'Multa', 'Juros', 'Total'),
  L('1082', 'CONTR', 'PREV', 'DESCONTA SEGURADO-EMPREGADO/AVULSO'), L('800,00', '800,00'), L('01', 'CP', 'SEGURADOS - EMPREGADOS/AVULSO'), L('PA:03/2026', 'Vencimento:20/04/2026'),
  L('1170', 'CP', 'TERCEIROS - SALÁRIO EDUCAÇÃO'), L('200,00', '200,00'),
  L('1176', 'CP', 'TERCEIROS - INCRA'), L('16,00', '16,00'),
  L('0561', 'IRRF', '-', 'RENDIMENTO DO TRABALHO ASSALARIADO'), L('200,00', '10,00', '4,00', '214,00'),
  'Totais', L('1.230,00', '1.230,00'),
];
describe('o DARF', () => {
  it('período, vencimento, número, valor, o recibo da declaração e a composição por tipo; confere', () => {
    const r = lerDarf([DARF]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.darf).toMatchObject({ periodo: '2026-03', vencimento: '2026-04-20', numero: '07.00.00000.0000000-0', valor: 1230, reciboDeclaracao: '12345678901234', confere: true });
    expect(r.darf.composicao.map((c) => [c.codigo, c.tipo, c.principal, c.total])).toEqual([
      ['1082', 'inss_segurados', 800, 800], ['1170', 'terceiros', 200, 200], ['1176', 'terceiros', 16, 16], ['0561', 'irrf', 200, 214],
    ]);
  });
  it('a composição que não soma o valor: confere = false e a frase; sem composição também', () => {
    const r = lerDarf([DARF.map((l) => (l === L('16,00', '16,00') ? L('15,00', '15,00') : l))]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.darf.naoConfere).toEqual(['A composição soma 1.229,00; o DARF diz 1.230,00.']);
    const sem = lerDarf([DARF.slice(0, 12)]);
    if (sem.ok === false) throw new Error(sem.frase);
    expect(sem.darf.naoConfere).toEqual(['A composição do DARF não veio.']);
  });
  it('a data que não existe não vira vencimento (null, nunca chutada)', () => {
    const r = lerDarf([DARF.map((l) => l.replace('| 20/04/2026 |', '| 31/02/2026 |'))]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.darf.vencimento).toBeNull();
  });
  it('o tipo pela denominação da Receita', () => {
    expect(['CP PATRONAL - EMPREGADOS', 'CP SEGURADOS - CONTRIBUINTE INDIVIDUAL', 'CP TERCEIROS - SENAR', 'IRRF - ALUGUÉIS', 'COFINS']
      .map(tipoNoDarf)).toEqual(['inss_patronal', 'inss_segurados', 'terceiros', 'irrf', 'outro']);
  });
  it('não é DARF: sem o título, sem o cabeçalho do período ou sem o valor total', () => {
    const nao = { ok: false, frase: FRASE_NAO_E_DARF };
    expect(lerDarf([DARF.slice(2)])).toEqual(nao);
    /* o DAS também é "Documento de Arrecadação", mas do Simples Nacional */
    expect(lerDarf([DARF.map((l) => (l === 'de Receitas Federais' ? 'do Simples Nacional' : l))])).toEqual(nao);
    expect(lerDarf([DARF.filter((l) => !l.startsWith('Período de Apuração'))])).toEqual(nao);
    expect(lerDarf([DARF.filter((l) => l !== 'Valor Total do Documento')])).toEqual(nao);
  });
});

/* ═══ GFD ═══ */
/* o montarLinhas parte o PIX nos espaços do nome do recebedor */
const GFD = [
  'GFD - Guia do FGTS Digital', 'Pagar este documento até', L('CPF/CNPJ do Empregador', 'Nome/Razão Social do Empregador'), '20/04/2026',
  L('000.000.000-00', 'FULANO FICTICIO'), 'às 21:59:59 (Brasília)', 'Valor a recolher', L('Núm. de Pág.', 'Identificador', 'Tag'), '400,00',
  L('1', '0000000000000000-0', '00000000000 03/2026 MENSAL'), 'Composição do Documento',
  L('Competência', 'Trabalhadores', 'FGTS Mensal', 'FGTS Rescisório', 'Compensatória', 'Encargos FGTS', 'Total'),
  L('03/2026', '3', '400,00', '0,00', '0,00', '0,00', '400,00'), L('Total Geral:', '400,00', '0,00', '0,00', '0,00', '400,00'),
  'PIX Copia e Cola:', PIX_BCB.replace('Fulano de Tal', 'Fulano | de | Tal'), 'Payload Location:',
];
describe('a GFD', () => {
  it('competência, vencimento, valor, identificador, trabalhadores, composição e o PIX (as células juntas, CRC certo); confere', () => {
    const r = lerGfd([GFD]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.gfd).toMatchObject({ competencia: '2026-03', vencimento: '2026-04-20', valor: 400, identificador: '0000000000000000-0', trabalhadores: 3,
      mensal: 400, rescisorio: 0, total: 400, pix: PIX_BCB, confere: true, naoConfere: [] });
  });
  it('o PIX com o CRC errado não vale (null + a frase); o total ≠ o valor a recolher também não confere', () => {
    const r = lerGfd([GFD.map((l) => l.replace('BRASILIA', 'BRASILIO'))]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.gfd).toMatchObject({ pix: null, confere: false, naoConfere: ['O PIX copia e cola da GFD não confere (CRC).'] });
    const v = lerGfd([GFD.map((l) => (l === '400,00' ? '401,00' : l))]);
    if (v.ok === false) throw new Error(v.frase);
    expect(v.gfd.naoConfere).toEqual(['A composição da GFD dá 400,00; o valor a recolher é 401,00.']);
    const semPix = lerGfd([GFD.filter((l) => l !== 'PIX Copia e Cola:')]);
    if (semPix.ok === false) throw new Error(semPix.frase);
    expect(semPix.gfd.naoConfere).toEqual(['O PIX copia e cola da GFD não veio.']);
  });
  it('não é GFD', () => {
    expect(lerGfd([GFD.slice(1)])).toEqual({ ok: false, frase: FRASE_NAO_E_GFD });
    expect(lerGfd([GFD.filter((l) => !l.startsWith('03/2026'))])).toEqual({ ok: false, frase: FRASE_NAO_E_GFD });
  });
});

/* ═══ a Relação de Trabalhadores do FGTS (página deitada: cada coluna, um x) ═══ */
const it_ = (str: string, x: number, y: number): ItemDoDanfe => ({ str, x, y, w: 10, h: 9 });
/* os valores da coluna de cima para baixo: total, multa, atualização, juros, FGTS e a base */
const valores = (x: number, total: string, fgts: string, base: string, acrescimo = '0,00') =>
  [it_(total, x, 721), it_(acrescimo, x, 672), it_('0,00', x, 632), it_('0,00', x, 594), it_(fgts, x, 548), it_(base, x, 500)];
const trabalhador = (x: number, matricula: string, fgts: string, base: string, total = fgts, acrescimo = '0,00') => [
  ...valores(x, total, fgts, base, acrescimo), it_('Mensal', x, 414), it_('20/04/2026', x, 379), it_('101', x, 364), it_(matricula, x, 210), it_('03/2026', x, 15),
];
const pagina = (caepf: string, trabalhadores: ItemDoDanfe[], estab: [string, string], tomador: [string, string], guia: [string, string]) => [
  it_('Gestão de Guias', 44, 679), it_('Relação de Trabalhadores', 91, 325), it_('Matrícula', 119, 210), it_('Valor FGTS', 116, 533),
  ...trabalhadores,
  ...valores(180, tomador[0], tomador[0], tomador[1]), it_('Total do Tomador', 180, 354),
  ...valores(191, estab[0], estab[0], estab[1]), it_(caepf, 191, 410), it_('Total do Estabelecimento', 191, 332),
  ...valores(202, guia[0], guia[0], guia[1]), it_('Total FGTS', 202, 432),
];
const P1 = pagina('111.222.333/001-44', [...trabalhador(135, '00006-11', '80,00', '1.000,00'), ...trabalhador(146, '00006-12', '120,00', '1.500,00')],
  ['200,00', '2.500,00'], ['999,00', '9.999,00'], ['300,00', '3.750,00']);
const P2 = pagina('111.222.333/002-25', [...trabalhador(135, '00002-7', '100,00', '1.250,00')], ['100,00', '1.250,00'], ['100,00', '1.250,00'], ['300,00', '3.750,00']);
const RESUMO = [it_('Gestão de Guias', 44, 679), it_('Relação de Estabelecimentos', 91, 325), it_('300,00', 121, 721)];

describe('a Relação de Trabalhadores do FGTS', () => {
  it('por estabelecimento (CAEPF da coluna "Total do Estabelecimento", nunca a do tomador): matrícula, código, FGTS e base; o total da guia; confere', () => {
    const r = lerRelacaoFgts([P1, P2, RESUMO]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.relacao).toMatchObject({ competencia: '2026-03', vencimento: '2026-04-20', totalGuia: 300, confere: true, naoConfere: [] });
    const [a, b] = r.relacao.estabelecimentos;
    expect(a).toMatchObject({ caepf: '11122233300144', totalFgts: 200, totalBase: 2500, somaFgts: 200, somaBase: 2500, confere: true, paginas: [1] });
    expect(a.trabalhadores).toEqual([{ matricula: '00006-11', codigo: '00011', base: 1000, fgts: 80 }, { matricula: '00006-12', codigo: '00012', base: 1500, fgts: 120 }]);
    expect(b).toMatchObject({ caepf: '11122233300225', totalFgts: 100, confere: true, trabalhadores: [{ matricula: '00002-7', codigo: '00007', base: 1250, fgts: 100 }] });
  });
  it('o FGTS com acréscimo (multa): o FGTS é o da linha dele, o total da coluna é o FGTS mais os acréscimos', () => {
    const p = pagina('111.222.333/002-25', trabalhador(135, '00002-7', '100,00', '1.250,00', '105,00', '5,00'), ['100,00', '1.250,00'], ['100,00', '1.250,00'], ['100,00', '1.250,00']);
    const r = lerRelacaoFgts([p]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.relacao.estabelecimentos[0].trabalhadores[0]).toMatchObject({ fgts: 100, base: 1250 });
    expect(r.relacao.confere).toBe(true);
    const errado = pagina('111.222.333/002-25', trabalhador(135, '00002-7', '100,00', '1.250,00', '106,00', '5,00'), ['100,00', '1.250,00'], ['100,00', '1.250,00'], ['100,00', '1.250,00']);
    const e = lerRelacaoFgts([errado]);
    if (e.ok === false) throw new Error(e.frase);
    expect(e.relacao.naoConfere).toEqual(['A matrícula 00002-7: o total da coluna não é o FGTS mais os acréscimos.']);
  });
  it('não confere: os trabalhadores ≠ o total do estabelecimento; os estabelecimentos ≠ a guia', () => {
    const p1 = pagina('111.222.333/001-44', trabalhador(135, '00006-11', '80,00', '1.000,00'), ['200,00', '2.500,00'], ['200,00', '2.500,00'], ['300,00', '3.750,00']);
    const r = lerRelacaoFgts([p1, P2]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.relacao.confere).toBe(false);
    expect(r.relacao.naoConfere).toEqual(['O estabelecimento 11122233300144: os trabalhadores somam 80,00; o total diz 200,00.']);
    const g = lerRelacaoFgts([P1]);
    if (g.ok === false) throw new Error(g.frase);
    expect(g.relacao.naoConfere).toEqual(['Os estabelecimentos somam 200,00; a guia diz 300,00.']);
  });
  it('não é a relação: sem "Gestão de Guias"/"Relação de Trabalhadores", sem o estabelecimento, sem matrícula, competências diferentes', () => {
    const nao = { ok: false, frase: FRASE_NAO_E_RELACAO_FGTS };
    expect(lerRelacaoFgts([P1.filter((i) => i.str !== 'Gestão de Guias')])).toEqual(nao);
    expect(lerRelacaoFgts([RESUMO])).toEqual(nao);
    expect(lerRelacaoFgts([P1.filter((i) => i.str !== 'Total do Estabelecimento')])).toEqual(nao);
    expect(lerRelacaoFgts([P1.filter((i) => !/^\d{5}-\d+$/.test(i.str))])).toEqual(nao);
    expect(lerRelacaoFgts([P1, P2.map((i) => (i.str === '03/2026' ? { ...i, str: '04/2026' } : i))])).toEqual(nao);
  });
});

/* ═══ DCTFWeb ═══ */
const DCTF = [
  'Recibo de Entrega da Declaração de Débitos e Créditos Tributários Federais - DCTFWeb', L('CNPJ/CPF', '000.000.000-00'), L('Nome', 'FULANO FICTICIO'),
  L('Período de apuração', '03/2026'), L('Tributos', 'Débitos Apurados', 'Saldo a Pagar'),
  L('Contribuição Previdenciária Segurados', 'R$ 800,00', 'R$ 800,00'), L('Contribuição Previdenciária Patronal', 'R$ 0,00', 'R$ 0,00'),
  L('Contribuição para Outras Entidades e Fundos', 'R$ 216,00', 'R$ 216,00'), L('IRRF', 'R$ 214,00', 'R$ 214,00'), L('TOTAL', 'R$ 1.230,00', 'R$ 1.230,00'),
];
describe('o recibo da DCTFWeb', () => {
  it('o período, os tributos diferentes de zero e o total; confere', () => {
    const r = lerDctfweb([DCTF]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.dctfweb).toEqual({
      periodo: '2026-03', total: 1230, confere: true, naoConfere: [],
      tributos: [
        { tributo: 'Contribuição Previdenciária Segurados', apurado: 800, aPagar: 800 },
        { tributo: 'Contribuição para Outras Entidades e Fundos', apurado: 216, aPagar: 216 },
        { tributo: 'IRRF', apurado: 214, aPagar: 214 },
      ],
    });
  });
  it('os tributos que não somam o total: confere = false; sem título ou sem total = não sei', () => {
    const r = lerDctfweb([DCTF.map((l) => l.replace('R$ 214,00 | R$ 214,00', 'R$ 214,00 | R$ 213,00'))]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.dctfweb.naoConfere).toEqual(['Os tributos somam 1.229,00; o total da DCTFWeb é 1.230,00.']);
    expect(lerDctfweb([DCTF.slice(1)])).toEqual({ ok: false, frase: FRASE_NAO_E_DCTFWEB });
    expect(lerDctfweb([DCTF.slice(0, -1)])).toEqual({ ok: false, frase: FRASE_NAO_E_DCTFWEB });
  });
});
