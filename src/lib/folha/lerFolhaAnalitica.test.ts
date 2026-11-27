/**
 * FOLHA-VERA-PACOTE-01 F1 — o leitor do "Relatório da Folha Analítico" (o espelho da folha).
 * ⚠ Dado INVENTADO no formato do layout (empresa, pessoas, funções e valores fictícios); nenhum documento de cliente entra.
 */
import { describe, it, expect } from 'vitest';
import { lerFolhaAnalitica, FRASE_NAO_E_ANALITICA } from './lerFolhaAnalitica';

const L = (...c: string[]) => c.join(' | ');
const EMPRESA = 'FULANO FICTICIO FAZENDA UM';
const cabecalho = (pag: number, titulo = 'MARÇO 2026', empresa = EMPRESA) => [
  empresa, L('Folha', 'de Pagamento'), L('Relatório da Folha Analítico.', titulo), L('Emissão', '28/03/2026', 'Hr.', '09:00:00', 'Pag.', String(pag)),
  L('Código', 'Nome', 'Admissão', 'Afast.', 'Salário Base', 'Horas', 'Função'), L('P', 'R O V E N T O S', 'D E S C O N T O S'),
  L('Código Descrição', 'Ref.', 'Valor', 'Código Descrição', 'Ref.', 'Valor', 'F.G.T.S.', 'Líquido'),
];
const CENTRO = '*** CENTRO DE CUSTO: 00002-RURAL ***';
/* a pessoa 1: nome em 2 células, código colado na descrição, IRRF e horas extras em linhas só dela */
const UM = [
  L('00011', 'PESSOA', 'UM', '10/03/2015', '/', '/', '2.000,00', '44.0', 'TRABALHADOR RURAL'),
  L('46 SALARIO BASE', '30,0000', '2.000,00', '40 I.N.S.S.', 'EMPREGADO', '7,5000', '150,00', '160,00', '1.880,00'),
  L('42 IMPOSTO', 'DE', 'RENDA', 'NA', 'FONTE', '0,0000', '20,00'),
  L('38 HORAS EXTRAS 100%', '2,0000', '50,00'),
  L('2.050,00', '170,00'),
];
/* a pessoa 2: o código da rubrica em célula própria; o fecho cai na página seguinte (depois do cabeçalho) */
const DOIS_A = [
  L('00012', 'PESSOA DOIS', '05/01/2020', '/', '/', '1.500,00', '44.0', 'COZINHEIRA'),
  L('46', 'SALARIO BASE', '30,0000', '1.500,00', '40', 'I.N.S.S.', 'EMPREGADO', '7,5000', '112,50', '120,00', '1.387,50'),
];
const DOIS_B = [L('1.500,00', '112,50')];
/* a pessoa 3: férias (o INSS sobre férias também é INSS) */
const TRES = [
  L('00013', 'PESSOA', 'TRES', '01/02/2022', '/', '/', '1.200,00', '44.0', 'CAMPEIRO'),
  L('30 FERIAS 1/3', '30,0000', '400,00', '96 I.N.S.S.', 'SOBRE', 'FERIAS', '7,5000', '120,00', '128,00', '1.480,00'),
  L('33 FERIAS NORMAIS', '30,0000', '1.200,00'),
  L('1.600,00', '120,00'),
];
const resumo = (centro: boolean, n = '3', liquido = '4.747,50', fgts = '408,00', prov = '5.150,00', desc = '402,50') => [
  'RESUMO GERAL DA FOLHA DE PAGAMENTO', 'MARÇO 2026', ...(centro ? [CENTRO] : []), L('P R O V E N T O S', 'D E S C O N T O S'),
  L('Código', 'Descrição', 'Valor', 'Código', 'Descrição', 'Valor'), L('46', 'SALARIO', 'BASE', '3.500,00', '40', 'I.N.S.S. EMPREGADO', '262,50'),
  L('TOTAL DE PROVENTOS...', prov, 'TOTAL', 'DE', 'DESCONTOS...', desc), L(n, 'Funcionário(s)', 'TOTAL', 'LÍQUIDO........', liquido),
  L('TOTAL F.G.T.S........', fgts),
];
const PAGINAS: string[][] = [
  [...cabecalho(1), CENTRO, ...UM, ...DOIS_A],
  [...cabecalho(2), ...DOIS_B, ...TRES, ...resumo(true)],
  [...resumo(false)],
];

describe('o leitor do relatório analítico da folha', () => {
  it('empresa, competência, emissão; por pessoa o código, o nome, a admissão, o centro, o líquido, o FGTS, o INSS e o IRRF; confere', () => {
    const r = lerFolhaAnalitica(PAGINAS);
    if (r.ok === false) throw new Error(r.frase);
    const f = r.folha;
    expect(f).toMatchObject({ empresa: EMPRESA, competencia: '2026-03', tipo: 'mensal', emissao: '2026-03-28', confere: true, naoConfere: [] });
    expect(f.pessoas.map((p) => [p.codigo, p.nome, p.admissao, p.centro, p.proventos, p.descontos, p.fgts, p.liquido, p.inss, p.irrf, p.confere, p.pagina])).toEqual([
      ['00011', 'PESSOA UM', '2015-03-10', '00002-RURAL', 2050, 170, 160, 1880, 150, 20, true, 1],
      ['00012', 'PESSOA DOIS', '2020-01-05', '00002-RURAL', 1500, 112.5, 120, 1387.5, 112.5, 0, true, 1],
      ['00013', 'PESSOA TRES', '2022-02-01', '00002-RURAL', 1600, 120, 128, 1480, 120, 0, true, 2],
    ]);
    expect(f.pessoas[0]).toMatchObject({ salarioBase: 2000, funcao: 'TRABALHADOR RURAL' });
    expect(f.pessoas[0].rubricas.map((x) => [x.codigo, x.descricao, x.ref, x.valor])).toEqual([
      ['46', 'SALARIO BASE', '30,0000', 2000], ['40', 'I.N.S.S. EMPREGADO', '7,5000', 150], ['42', 'IMPOSTO DE RENDA NA FONTE', '0,0000', 20], ['38', 'HORAS EXTRAS 100%', '2,0000', 50],
    ]);
    expect(f.soma).toEqual({ funcionarios: 3, proventos: 5150, descontos: 402.5, liquido: 4747.5, fgts: 408, inss: 382.5, irrf: 20 });
    expect(f.resumo).toEqual({ funcionarios: 3, proventos: 5150, descontos: 402.5, liquido: 4747.5, fgts: 408 });
  });

  it('o resumo geral é o sem centro; sem ele, a soma dos resumos por centro', () => {
    const r = lerFolhaAnalitica([PAGINAS[0], PAGINAS[1]]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.folha.resumo).toEqual({ funcionarios: 3, proventos: 5150, descontos: 402.5, liquido: 4747.5, fgts: 408 });
    expect(r.folha.confere).toBe(true);
    /* o geral manda sobre o do centro */
    const g = lerFolhaAnalitica([PAGINAS[0], PAGINAS[1], resumo(false, '4', '5.000,00')]);
    if (g.ok === false) throw new Error(g.frase);
    expect(g.folha.resumo?.funcionarios).toBe(4);
  });

  it('o resumo que não bate com os funcionários (um faltando, o FGTS diferente): confere = false e a frase de cada diferença', () => {
    const r = lerFolhaAnalitica([PAGINAS[0], PAGINAS[1], resumo(false, '4', '5.747,50', '488,00', '6.150,00', '402,50')]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.folha.confere).toBe(false);
    expect(r.folha.naoConfere).toEqual([
      'O resumo geral diz 4 funcionários; li 3.',
      'Proventos: o resumo geral diz 6.150,00; a soma dos funcionários dá 5.150,00.',
      'Líquido: o resumo geral diz 5.747,50; a soma dos funcionários dá 4.747,50.',
      'FGTS: o resumo geral diz 488,00; a soma dos funcionários dá 408,00.',
    ]);
  });

  it('o funcionário que não fecha (o líquido errado) não confere; sem resumo também não', () => {
    const p0 = PAGINAS[0].map((l) => l.replace('160,00 | 1.880,00', '160,00 | 1.881,00'));
    const r = lerFolhaAnalitica([p0, PAGINAS[1], PAGINAS[2]]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.folha.pessoas[0].confere).toBe(false);
    expect(r.folha.naoConfere[0]).toBe('O funcionário 00011 não fecha (proventos − descontos ≠ líquido).');
    /* a rubrica que faltou (a soma das rubricas ≠ proventos + descontos), mesmo com o líquido certo */
    const falta = lerFolhaAnalitica([PAGINAS[0].filter((l) => !l.startsWith('38 HORAS')), PAGINAS[1], PAGINAS[2]]);
    if (falta.ok === false) throw new Error(falta.frase);
    expect(falta.folha.pessoas[0]).toMatchObject({ liquido: 1880, confere: false });
    const sem = lerFolhaAnalitica([PAGINAS[0], PAGINAS[1].filter((l) => !resumo(true).includes(l))]);
    if (sem.ok === false) throw new Error(sem.frase);
    expect(sem.folha).toMatchObject({ resumo: null, confere: false, naoConfere: ['O resumo geral não veio.'] });
  });

  it('a rubrica sem referência entra com ref null (e o valor solto depois dela é o FGTS/líquido)', () => {
    const p0 = PAGINAS[0].map((l) => l.replace('38 HORAS EXTRAS 100% | 2,0000 | 50,00', '38 HORAS EXTRAS 100% | 50,00'));
    const r = lerFolhaAnalitica([p0, PAGINAS[1], PAGINAS[2]]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.folha.pessoas[0].rubricas[3]).toEqual({ codigo: '38', descricao: 'HORAS EXTRAS 100%', ref: null, valor: 50 });
    expect(r.folha.confere).toBe(true);
  });

  it('o IRRF das férias escrito "I.R.R.F." também é IRRF (e o INSS sobre férias, INSS)', () => {
    const p = [...cabecalho(1, 'MARÇO 2026'), CENTRO, L('00011', 'PESSOA UM', '10/03/2015', '/', '/', '2.000,00', '44.0', 'X'),
      L('33 FERIAS NORMAIS', '28,0000', '2.000,00', '76 I.R.R.F.', 'FERIAS', '(', 'RESCISOES )', '28,0000', '50,00', '160,00', '1.800,00'),
      L('96 I.N.S.S.', 'SOBRE', 'FERIAS', '28,0000', '150,00'), L('2.000,00', '200,00'), ...resumo(false, '1', '1.800,00', '160,00', '2.000,00', '200,00')];
    const r = lerFolhaAnalitica([p]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.folha.pessoas[0]).toMatchObject({ irrf: 50, inss: 150, confere: true });
  });

  it('o 13º no MESMO layout: "1 PARCELA 13 SALARIO 2026" = 13º 1ª, novembro; "2 PARCELA …" = 13º 2ª, dezembro; o fecho só com proventos', () => {
    const p13 = [...cabecalho(1, '1 PARCELA 13 SALARIO 2026'), CENTRO,
      L('00011', 'PESSOA', 'UM', '10/03/2015', '/', '/', '2.000,00', '44.0', 'TRABALHADOR RURAL'),
      L('2 13o. SALARIO VARIAVEL', '12,0000', '20,00', '81,60', '1.020,00'), L('7', 'ADIANTAMENTO 50%', '13O.', 'SALARIO', '12,0000', '1.000,00'), '1.020,00',
      ...resumo(false, '1', '1.020,00', '81,60', '1.020,00', '0,00')];
    const r = lerFolhaAnalitica([p13]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.folha).toMatchObject({ competencia: '2026-11', tipo: '13_1', confere: true });
    expect(r.folha.pessoas[0]).toMatchObject({ proventos: 1020, descontos: 0, fgts: 81.6, liquido: 1020, confere: true });
    const s = lerFolhaAnalitica([p13.map((l) => l.replace('1 PARCELA 13 SALARIO 2026', '2 PARCELA 13 SALARIO 2026'))]);
    if (s.ok === false) throw new Error(s.frase);
    expect(s.folha).toMatchObject({ competencia: '2026-12', tipo: '13_2' });
    /* mensal e 13º no mesmo arquivo: não sei */
    expect(lerFolhaAnalitica([[...cabecalho(1, 'NOVEMBRO 2026'), CENTRO, ...UM], [...cabecalho(2, '1 PARCELA 13 SALARIO 2026'), ...TRES]]).ok).toBe(false);
  });

  it('não é o analítico mensal: outro título, sem título, empresas diferentes, nenhuma pessoa → não sei', () => {
    const nao = { ok: false, frase: FRASE_NAO_E_ANALITICA };
    expect(lerFolhaAnalitica([[...cabecalho(1, '13º SALÁRIO 2026'), CENTRO, ...UM]])).toEqual(nao);
    expect(lerFolhaAnalitica([[...cabecalho(1, 'FÉRIAS MARÇO 2026'), CENTRO, ...UM]])).toEqual(nao);
    expect(lerFolhaAnalitica([PAGINAS[0].filter((l) => !l.startsWith('Relatório da Folha'))])).toEqual(nao);
    expect(lerFolhaAnalitica([PAGINAS[0], [...cabecalho(2, 'MARÇO 2026', 'OUTRA EMPRESA'), ...DOIS_B]])).toEqual(nao);
    expect(lerFolhaAnalitica([PAGINAS[0], [...cabecalho(2, 'ABRIL 2026'), ...DOIS_B]])).toEqual(nao);
    expect(lerFolhaAnalitica([cabecalho(1)])).toEqual(nao);
    expect(lerFolhaAnalitica([['Recibo de Pagamento', L('CEI:', '123', 'CC:', '1')]])).toEqual(nao);
  });
});
