/**
 * FOLHA-RESUMO-CONTADOR-01 — o leitor do "Extrato Mensal" (resumo do contador) e a regra da Caixa (pedido · resposta · linhas).
 * ⚠ Dado INVENTADO no formato do layout (empresas, CAEPF, pessoas e valores fictícios); nenhum documento de cliente entra.
 */
import { describe, it, expect } from 'vitest';
import { lerResumoDoContador, FRASE_NAO_E_RESUMO, type ResumoLido } from './lerResumoDoContador';
import { linhasDoResumo, motivoDoPrever, pedidoDoResumo, respostaDoResumo } from './resumoNaCaixa';

const L = (...c: string[]) => c.join(' | ');
const cabecalho = (cod: string, empresa: string, caepf: string, pag: string, calculo = '13o Adiantamento', comp = '11/2026') => [
  L('Empresa:', `${cod} - ${empresa}`, 'Página:', pag), L('CAEPF:', caepf, 'Emissão:', '17/11/2026'), L('Cálculo:', calculo, 'Horas:', '10:00:00'),
  L('Competência:', comp), 'EXTRATO MENSAL',
];
const pessoa = (cod: string, nome: string, liquido: string, fgts: string) => [
  L('Empr.:', `${cod} ${nome}`, 'Situação:', 'Trabalhando', 'CPF:', '000.000.000-00', 'Adm:', '01/01/2020'),
  L('Vínculo:', 'Trabalhador rural', 'CC:', '1'), L('Cargo:', '1 TRABALHADOR RURAL', 'Salário:', '3.000,00'),
  L('13 13 SALARIO ADIANTADO', '12,00', liquido, 'P'),
  L('ND:', '0', 'Proventos:', liquido, 'Descontos:', '0,00', 'Informativa:', fgts, 'Líquido:', liquido),
  L('NF:', '0', 'Base INSS:', '0,00', 'Base FGTS:', liquido, 'Valor FGTS:', fgts, 'Base IRRF:', '0,00'),
];
const totais = (base: string, fgts: string) => [
  L('INSS', 'FGTS, PIS e ISS'), L('Salário contribuição empregados:', '0,00', 'Base do FGTS:', base), L('Salário contribuição contribuintes:', '0,00', 'Valor do FGTS:', fgts),
  L('Base total:', '0,00', 'Valor do FGTS Aprendiz:', '0,00'),
];
/* empresa A em 2 páginas (os totais na 2ª), empresa B numa página só */
const PAGINAS: string[][] = [
  [...cabecalho('10', 'FULANO FICTICIO FAZ BOA VISTA', '111.222.333/001-44', '1/2'), ...pessoa('1', 'PESSOA UM', '1.000,00', '80,00'), ...pessoa('2', 'PESSOA DOIS', '500,00', '40,00')],
  [...cabecalho('10', 'FULANO FICTICIO FAZ BOA VISTA', '111.222.333/001-44', '2/2'), ...pessoa('3', 'PESSOA TRES', '250,00', '20,00'), ...totais('1.750,00', '140,00')],
  [...cabecalho('11', 'FULANO FICTICIO FAZ SERRA', '111.222.333/002-25', '1/1'), ...pessoa('4', 'PESSOA QUATRO', '625,00', '50,00'), ...totais('625,00', '50,00')],
];

describe('o leitor do resumo do contador', () => {
  it('por empresa (CAEPF): empregados, o FGTS de cada um, o total do contador, as páginas; confere ao centavo; tipo e competência', () => {
    const r = lerResumoDoContador(PAGINAS);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.resumo.tipo).toBe('13_1');
    expect(r.resumo.competencia).toBe('2026-11');
    expect(r.resumo.totalFgts).toBe(190);
    const [a, b] = r.resumo.empresas;
    expect(a).toMatchObject({ codigo: '10', empresa: 'FULANO FICTICIO FAZ BOA VISTA', cei: '11122233300144', fgts: 140, baseFgts: 1750, somaDosEmpregados: 140, confere: true, paginas: [1, 2] });
    expect(a.empregados.map((e) => [e.codigo, e.nome, e.liquido, e.fgts])).toEqual([['1', 'PESSOA UM', 1000, 80], ['2', 'PESSOA DOIS', 500, 40], ['3', 'PESSOA TRES', 250, 20]]);
    expect(b).toMatchObject({ cei: '11122233300225', fgts: 50, confere: true, paginas: [3] });
  });
  it('a soma dos empregados que não fecha com o total: confere = false (o total do contador fica)', () => {
    const p = PAGINAS.map((x) => x.map((l) => l.replace('Valor do FGTS: | 140,00', 'Valor do FGTS: | 141,00')));
    const r = lerResumoDoContador(p);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.resumo.empresas[0]).toMatchObject({ fgts: 141, somaDosEmpregados: 140, confere: false });
    expect(r.resumo.totalFgts).toBe(191);
  });
  it('não é resumo: sem "EXTRATO MENSAL", cálculo desconhecido, competências diferentes ou sem quadro de totais → não sei', () => {
    expect(lerResumoDoContador(PAGINAS.map((x) => x.filter((l) => l !== 'EXTRATO MENSAL')))).toEqual({ ok: false, frase: FRASE_NAO_E_RESUMO });
    expect(lerResumoDoContador([cabecalho('1', 'X', '1', '1/1', 'Férias'), ...PAGINAS.slice(1)]).ok).toBe(false);
    expect(lerResumoDoContador([PAGINAS[0], [...cabecalho('10', 'FULANO FICTICIO FAZ BOA VISTA', '111.222.333/001-44', '2/2', '13o Adiantamento', '12/2026'), ...totais('1,00', '1,00')]]).ok).toBe(false);
    expect(lerResumoDoContador([PAGINAS[0]]).ok).toBe(false);
  });
});

describe('a regra da Caixa', () => {
  const r = lerResumoDoContador(PAGINAS);
  if (r.ok === false) throw new Error(r.frase);
  const resumo: ResumoLido = r.resumo;
  it('o pedido: um item por empresa com FGTS; a fazenda pelo CAEPF (sem o CAEPF no cadastro, sem fazenda_id)', () => {
    const p = pedidoDoResumo(resumo, 'Extrato Mensal ficticio.pdf', 'a'.repeat(32), new Map([['11122233300144', 'faz-a']]));
    expect(p.documento).toEqual({ md5: 'a'.repeat(32), competencia: '2026-11', tipo: '13_1', nome: 'Extrato Mensal ficticio.pdf' });
    expect(p.itens).toEqual([
      { empresa: 'FULANO FICTICIO FAZ BOA VISTA', cei: '11122233300144', fgts: 140, fazenda_id: 'faz-a' },
      { empresa: 'FULANO FICTICIO FAZ SERRA', cei: '11122233300225', fgts: 50 },
    ]);
  });
  it('a resposta → as linhas: prevê / sem fazenda; o Prever apaga com o motivo; já aplicado', () => {
    const resp = respostaDoResumo({ ok: true, simulado: true, soma: 140,
      previsoes: [{ cei: '11122233300144', fazenda: 'Faz. Boa Vista', descricao: 'FGTS 13º 1ª parcela 2026', valor: 140, vencimento: '2026-12-18', lancamento_id: null }],
      pendencias: [{ item: 2, cei: '11122233300225', fgts: 50, pendencia: 'sem_fazenda' }] });
    const linhas = linhasDoResumo(resumo, resp);
    expect(linhas.map((l) => [l.acontece, l.fazenda, l.vencimento])).toEqual([['preve', 'Faz. Boa Vista', '2026-12-18'], ['sem_fazenda', null, null]]);
    expect(motivoDoPrever(linhas, resp)).toMatch(/^1 empresa sem fazenda ou sem molde/);
    const tudo = respostaDoResumo({ ok: true, soma: 190, pendencias: [], previsoes: [
      { cei: '11122233300144', fazenda: 'A', valor: 140, vencimento: '2026-12-18' }, { cei: '11122233300225', fazenda: 'B', valor: 50, vencimento: '2026-12-18' }] });
    expect(motivoDoPrever(linhasDoResumo(resumo, tudo), tudo)).toBeNull();
    const ja = respostaDoResumo({ ok: true, simulado: true, ja_aplicado: true });
    expect(ja?.jaAplicado).toBe(true);
    expect(motivoDoPrever(linhasDoResumo(resumo, ja), ja)).toBe('Este resumo já foi aplicado.');
    expect(respostaDoResumo({ erro: 1 })).toBeNull();
  });
});
