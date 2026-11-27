/**
 * FOLHA-VERA-PACOTE-01 F3 (parte pura) — a conferência do pacote da folha e o que vira lançamento por estabelecimento.
 * ⚠ Dado INVENTADO (empresas, estabelecimentos, códigos e valores fictícios); nenhum documento de cliente entra.
 */
import { describe, it, expect } from 'vitest';
import { conferirPacote, ratearPelaBase, type DocumentosDoPacote } from './pacoteDaFolha';
import type { FolhaAnaliticaLida, PessoaDaAnalitica } from './lerFolhaAnalitica';
import type { DarfLido, DctfwebLida, GfdLida, RelacaoFgtsLida } from './lerGuiasDaFolha';

const pessoa = (codigo: string, liquido: number, fgts: number, inss: number, irrf: number): PessoaDaAnalitica => ({
  codigo, nome: `PESSOA ${codigo}`, admissao: null, salarioBase: null, funcao: '', centro: null, rubricas: [], proventos: liquido + inss + irrf,
  descontos: inss + irrf, fgts, liquido, inss, irrf, confere: true, pagina: 1,
});
function analitica(empresa: string, pessoas: PessoaDaAnalitica[]): FolhaAnaliticaLida {
  const s = (f: (p: PessoaDaAnalitica) => number) => Math.round(pessoas.reduce((t, p) => t + f(p) * 100, 0)) / 100;
  const soma = { funcionarios: pessoas.length, proventos: s((p) => p.proventos ?? 0), descontos: s((p) => p.descontos ?? 0), liquido: s((p) => p.liquido ?? 0),
    fgts: s((p) => p.fgts ?? 0), inss: s((p) => p.inss), irrf: s((p) => p.irrf) };
  return { empresa, competencia: '2026-03', emissao: null, pessoas, soma, resumo: null, confere: true, naoConfere: [] };
}
const A = analitica('FULANO FICTICIO FAZENDA UM', [pessoa('00011', 1000, 100, 90, 10), pessoa('00012', 2000, 200, 180, 20)]);
const B = analitica('FULANO FICTICIO FAZENDA DOIS', [pessoa('00031', 1500, 120, 100, 0)]);
const RELACAO: RelacaoFgtsLida = {
  competencia: '2026-03', vencimento: '2026-04-20', totalGuia: 420, confere: true, naoConfere: [],
  estabelecimentos: [
    { caepf: '11122233300144', totalFgts: 300, totalBase: 3750, somaFgts: 300, somaBase: 3750, confere: true, paginas: [1],
      trabalhadores: [{ matricula: '00001-11', codigo: '00011', base: 1250, fgts: 100 }, { matricula: '00001-12', codigo: '00012', base: 2500, fgts: 200 }] },
    { caepf: '11122233300225', totalFgts: 120, totalBase: 1500, somaFgts: 120, somaBase: 1500, confere: true, paginas: [2],
      trabalhadores: [{ matricula: '00002-31', codigo: '00031', base: 1500, fgts: 120 }] },
  ],
};
const GFD: GfdLida = { competencia: '2026-03', vencimento: '2026-04-20', valor: 420, identificador: null, trabalhadores: 3, mensal: 420, rescisorio: 0,
  indenizacao: 0, encargos: 0, total: 420, pix: 'pix', confere: true, naoConfere: [] };
const DARF: DarfLido = { periodo: '2026-03', vencimento: '2026-04-20', numero: null, valor: 500, reciboDeclaracao: null, confere: true, naoConfere: [],
  composicao: [
    { codigo: '1082', denominacao: 'CP SEGURADOS', tipo: 'inss_segurados', principal: 370, total: 370 },
    { codigo: '1170', denominacao: 'CP TERCEIROS - SALÁRIO EDUCAÇÃO', tipo: 'terceiros', principal: 70, total: 70 },
    { codigo: '1176', denominacao: 'CP TERCEIROS - INCRA', tipo: 'terceiros', principal: 30, total: 30 },
    { codigo: '0561', denominacao: 'IRRF', tipo: 'irrf', principal: 30, total: 30 },
  ] };
const DCTF: DctfwebLida = { periodo: '2026-03', total: 500, confere: true, naoConfere: [], tributos: [] };
const TUDO: DocumentosDoPacote = { analiticas: [A, B], relacao: RELACAO, gfd: GFD, darf: DARF, dctfweb: DCTF };

describe('a conferência do pacote da folha', () => {
  it('tudo confere: o pacote limpo; por estabelecimento (pelos códigos) o FGTS da relação, o INSS e o IRRF das pessoas, os terceiros pela base', () => {
    const r = conferirPacote(TUDO);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.pacote.limpo).toBe(true);
    expect(r.pacote.pendencias).toEqual([]);
    expect(r.pacote.conferencias.every((c) => c.situacao === 'confere')).toBe(true);
    /* terceiros 100 pela base 3.750 × 1.500 → 71,43 + 28,57 */
    expect(r.pacote.estabelecimentos).toEqual([
      { caepf: '11122233300144', empresa: 'FULANO FICTICIO FAZENDA UM', funcionarios: 2, liquido: 3000, fgts: 300, baseFgts: 3750, inssSegurados: 270, terceiros: 71.43, irrf: 30 },
      { caepf: '11122233300225', empresa: 'FULANO FICTICIO FAZENDA DOIS', funcionarios: 1, liquido: 1500, fgts: 120, baseFgts: 1500, inssSegurados: 100, terceiros: 28.57, irrf: 0 },
    ]);
  });

  it('a folha de um trabalhador faltando (está na guia do FGTS): pendência "falta a folha" e o INSS/IRRF do DARF diferem das folhas', () => {
    const r = conferirPacote({ ...TUDO, analiticas: [analitica(A.empresa, [A.pessoas[0]]), B] });
    if (r.ok === false) throw new Error(r.frase);
    expect(r.pacote.limpo).toBe(false);
    expect(r.pacote.pendencias).toEqual([{ tipo: 'falta_folha', frase: 'Falta a folha da matrícula 00001-12 (está na guia do FGTS: base 2.500,00, FGTS 200,00).' }]);
    const por = Object.fromEntries(r.pacote.conferencias.map((c) => [c.chave, c]));
    expect(por['inss:folha']).toMatchObject({ situacao: 'difere', frase: 'o DARF 370,00 × as folhas 190,00 (diferença 180,00).' });
    expect(por['irrf:folha'].situacao).toBe('difere');
    /* o FGTS do estabelecimento continua o da guia (o que se paga) */
    expect(r.pacote.estabelecimentos[0]).toMatchObject({ fgts: 300, inssSegurados: 90, funcionarios: 1 });
  });

  it('D3: documento que não veio = pendência "falta …"; o que veio ainda confere', () => {
    const r = conferirPacote({ ...TUDO, gfd: null, dctfweb: null });
    if (r.ok === false) throw new Error(r.frase);
    expect(r.pacote.pendencias.map((p) => p.frase)).toEqual(['Falta a guia do FGTS (GFD) de 03/2026.', 'Falta o recibo da DCTFWeb de 03/2026.']);
    const por = Object.fromEntries(r.pacote.conferencias.map((c) => [c.chave, c.situacao]));
    expect(por).toMatchObject({ 'fgts:guia': 'falta', 'darf:dctfweb': 'falta', 'inss:folha': 'confere' });
  });

  it('a GFD com outro total, outra contagem de trabalhadores; o DARF ≠ DCTFWeb: difere', () => {
    const r = conferirPacote({ ...TUDO, gfd: { ...GFD, valor: 421, trabalhadores: 4 }, dctfweb: { ...DCTF, total: 499 } });
    if (r.ok === false) throw new Error(r.frase);
    const por = Object.fromEntries(r.pacote.conferencias.map((c) => [c.chave, c]));
    expect(por['fgts:guia'].frase).toBe('a GFD 421,00 × a relação 420,00 (diferença 1,00).');
    expect(por['fgts:trabalhadores'].frase).toBe('A GFD diz 4 trabalhadores; a relação traz 3.');
    expect(por['darf:dctfweb'].situacao).toBe('difere');
  });

  it('a folha que não casa com estabelecimento nenhum; o funcionário da folha que não está na guia', () => {
    const C = analitica('OUTRA', [pessoa('00099', 10, 1, 1, 0)]);
    const r = conferirPacote({ ...TUDO, analiticas: [A, B, C] });
    if (r.ok === false) throw new Error(r.frase);
    expect(r.pacote.pendencias.map((p) => p.tipo)).toEqual(['sem_estabelecimento', 'falta_folha']);
    expect(r.pacote.pendencias[1].frase).toBe('O funcionário 00099 da folha OUTRA não está na guia do FGTS.');
  });

  it('só pendência (tudo o mais confere): o pacote NÃO está limpo', () => {
    const semValor = analitica('OUTRA', [pessoa('00099', 0, 0, 0, 0)]);
    const r = conferirPacote({ ...TUDO, analiticas: [A, B, semValor] });
    if (r.ok === false) throw new Error(r.frase);
    expect(r.pacote.conferencias.every((c) => c.situacao === 'confere')).toBe(true);
    expect(r.pacote.pendencias.map((p) => p.tipo)).toEqual(['sem_estabelecimento']);
    expect(r.pacote.limpo).toBe(false);
  });

  it('o documento que não confere consigo mesmo entra na conferência', () => {
    const r = conferirPacote({ ...TUDO, darf: { ...DARF, confere: false, naoConfere: ['A composição soma 1,00; o DARF diz 2,00.'] } });
    if (r.ok === false) throw new Error(r.frase);
    expect(r.pacote.conferencias.find((c) => c.chave === 'darf:proprio')).toMatchObject({ situacao: 'difere', frase: 'A composição soma 1,00; o DARF diz 2,00.' });
  });

  it('competências diferentes ou pacote vazio: não é um pacote', () => {
    expect(conferirPacote({ ...TUDO, darf: { ...DARF, periodo: '2026-04' } })).toEqual({ ok: false, frase: 'Os documentos são de competências diferentes (03/2026, 04/2026).' });
    expect(conferirPacote({ analiticas: [], relacao: null, gfd: null, darf: null, dctfweb: null })).toEqual({ ok: false, frase: 'O pacote está vazio.' });
  });
});

describe('o rateio dos terceiros pela base do FGTS (D2)', () => {
  it('proporcional à base; o último leva os centavos e a soma fecha', () => {
    expect(ratearPelaBase(500, [1200, 2400])).toEqual([166.67, 333.33]);
    expect(ratearPelaBase(100, [1, 1, 1])).toEqual([33.33, 33.33, 33.34]);
    expect(ratearPelaBase(10, [0, 0])).toEqual([0, 10]);
  });
});
