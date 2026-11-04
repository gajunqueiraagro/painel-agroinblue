import { describe, expect, it } from 'vitest';
import {
  anosDaGrade, atalhosDoPeriodo, cliqueNoDia, fimDoMes, gradeDoMes, rotuloDaSafra, rotuloDoIntervalo, safraAnteriorA, safraQueContem,
  type SafraDoCadastro,
} from './intervaloDeDatas';
import { lerSafras } from '@/hooks/useSafrasDoCliente';

/* UI-PERIODO-01 — as regras do componente único de período (mock aprovado 04/11 09:33). */
const HOJE = '2026-11-04';
const safra = (id: string, codigo: string, atividade: SafraDoCadastro['atividade'], de: string, ate: string): SafraDoCadastro => ({ id, codigo, atividade, de, ate });
const SAFRAS: SafraDoCadastro[] = [
  safra('p27', '26/27-Pec', 'pecuaria', '2026-07-01', '2027-06-30'), safra('p26', '25/26-Pec', 'pecuaria', '2025-07-01', '2026-06-30'),
  safra('p25', '24/25-Pec', 'pecuaria', '2024-07-01', '2025-06-30'),
  /* uma safra de lavoura de setembro a agosto: a data vem do cadastro, nunca do código */
  safra('l27', '26/27-Lav', 'agricultura', '2026-09-01', '2027-08-31'), safra('l26', '25/26-Lav', 'agricultura', '2025-09-01', '2026-08-31'),
];

describe('datas e rótulos', () => {
  it('fim do mês certo (fevereiro bissexto, dezembro → virada de ano)', () => {
    expect(fimDoMes(2028, 1)).toBe('2028-02-29');
    expect(fimDoMes(2026, 1)).toBe('2026-02-28');
    expect(fimDoMes(2026, 11)).toBe('2026-12-31');
    expect(fimDoMes(2026, -1)).toBe('2025-12-31');
  });
  it('o gatilho: mês inteiro "out/2026", ano inteiro "2026", datas livres "01/09/2026 – 15/10/2026", o nome do atalho quando há', () => {
    expect(rotuloDoIntervalo({ de: '2026-10-01', ate: '2026-10-31' })).toBe('out/2026');
    expect(rotuloDoIntervalo({ de: '2026-01-01', ate: '2026-12-31' })).toBe('2026');
    expect(rotuloDoIntervalo({ de: '2026-09-01', ate: '2026-10-15' })).toBe('01/09/2026 – 15/10/2026');
    expect(rotuloDoIntervalo({ de: '2026-07-01', ate: '2027-06-30', nome: 'Safra 26/27 · jul/26–jun/27' })).toBe('Safra 26/27 · jul/26–jun/27');
    expect(rotuloDoIntervalo(null)).toBe('Escolher período');
  });
  it('a safra com as datas reais do cadastro, sem o sufixo da atividade', () => {
    expect(rotuloDaSafra(SAFRAS[0])).toBe('Safra 26/27 · jul/26–jun/27');
    expect(rotuloDaSafra(SAFRAS[3], true)).toBe('Safra 26/27 · set/26–ago/27 · Lavoura');
  });
});

describe('atalhos', () => {
  it('modo datas, uma atividade: a ordem do pedido, com as datas certas', () => {
    const a = atalhosDoPeriodo({ hoje: HOJE, modo: 'datas', safras: SAFRAS, atividades: ['pecuaria'] });
    expect(a.map((x) => x.rotulo)).toEqual(['Este mês', 'Mês passado', 'Este ano', 'Último ano', 'Esta safra', 'Última safra', 'Últimos 12 meses']);
    const por = Object.fromEntries(a.map((x) => [x.id, [x.intervalo.de, x.intervalo.ate]]));
    expect(por['este-mes']).toEqual(['2026-11-01', '2026-11-30']);
    expect(por['mes-passado']).toEqual(['2026-10-01', '2026-10-31']);
    expect(por['este-ano']).toEqual(['2026-01-01', '2026-12-31']);
    expect(por['ultimo-ano']).toEqual(['2025-01-01', '2025-12-31']);
    expect(por['esta-safra-pecuaria']).toEqual(['2026-07-01', '2027-06-30']);
    expect(por['ultima-safra-pecuaria']).toEqual(['2025-07-01', '2026-06-30']);
    expect(por['ultimos-12']).toEqual(['2025-12-01', '2026-11-30']);
  });
  it('duas atividades: um par de atalhos de safra por atividade, cada um com as SUAS datas', () => {
    const a = atalhosDoPeriodo({ hoje: HOJE, modo: 'datas', safras: SAFRAS, atividades: ['pecuaria', 'agricultura'] });
    const lav = a.find((x) => x.id === 'esta-safra-agricultura');
    expect(lav?.rotulo).toBe('Esta safra · Lavoura');
    expect([lav?.intervalo.de, lav?.intervalo.ate]).toEqual(['2026-09-01', '2027-08-31']);
    expect(a.find((x) => x.id === 'esta-safra-pecuaria')?.intervalo.de).toBe('2026-07-01');
  });
  it('sem safra no cadastro, sem atalho de safra; modo mês só os de mês; modo ano só os de ano', () => {
    expect(atalhosDoPeriodo({ hoje: HOJE, modo: 'datas', safras: [], atividades: ['pecuaria'] }).some((x) => x.id.includes('safra'))).toBe(false);
    expect(atalhosDoPeriodo({ hoje: HOJE, modo: 'mes', safras: SAFRAS, atividades: ['pecuaria'] }).map((x) => x.id)).toEqual(['este-mes', 'mes-passado']);
    expect(atalhosDoPeriodo({ hoje: HOJE, modo: 'ano', safras: SAFRAS, atividades: ['pecuaria'] }).map((x) => x.id)).toEqual(['este-ano', 'ultimo-ano']);
  });
  it('mês passado em janeiro é dezembro do ano anterior', () => {
    const a = atalhosDoPeriodo({ hoje: '2027-01-10', modo: 'mes', safras: [], atividades: [] });
    expect([a[1].intervalo.de, a[1].intervalo.ate]).toEqual(['2026-12-01', '2026-12-31']);
  });
  it('a safra que contém o dia e a anterior, pela atividade', () => {
    expect(safraQueContem(SAFRAS, 'agricultura', '2026-08-15')?.id).toBe('l26');
    expect(safraQueContem(SAFRAS, 'pecuaria', '2026-08-15')?.id).toBe('p27');
    expect(safraAnteriorA(SAFRAS, SAFRAS[0])?.id).toBe('p26');
    expect(safraAnteriorA(SAFRAS, SAFRAS[2])).toBeNull();
  });
});

describe('calendário e clique', () => {
  it('42 casas começando na segunda; o 1º de novembro/2026 (domingo) cai na 7ª casa', () => {
    const g = gradeDoMes(2026, 10);
    expect(g).toHaveLength(42);
    expect(g[0].data).toBe('2026-10-26');
    expect(g[6]).toEqual({ data: '2026-11-01', doMes: true, dia: 1 });
    expect(g.filter((c) => c.doMes)).toHaveLength(30);
  });
  it('1º clique = início; 2º = fim; clicar antes do início recomeça por ele; um 3º clique recomeça', () => {
    let r = cliqueNoDia({ de: null, ate: null, nome: null }, '2026-09-10');
    expect(r).toEqual({ de: '2026-09-10', ate: null, nome: null });
    r = cliqueNoDia(r, '2026-10-05');
    expect(r).toEqual({ de: '2026-09-10', ate: '2026-10-05', nome: null });
    expect(cliqueNoDia({ de: '2026-09-10', ate: null, nome: null }, '2026-09-01')).toEqual({ de: '2026-09-01', ate: null, nome: null });
    expect(cliqueNoDia(r, '2026-12-01')).toEqual({ de: '2026-12-01', ate: null, nome: null });
  });
  it('a grade de anos vai do mais antigo com dado até o ano que vem; sem dado, os 5 anteriores', () => {
    expect(anosDaGrade(HOJE, 2020)).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
    expect(anosDaGrade(HOJE, null)).toEqual([2022, 2023, 2024, 2025, 2026, 2027]);
  });
});

describe('a leitura das safras do cadastro', () => {
  it('entra só a safra com as duas datas e de uma atividade conhecida; a data é cortada no dia', () => {
    expect(lerSafras([
      { id: 'a', codigo: '26/27-Pec', escopo_negocio: 'pecuaria', data_inicio: '2026-07-01', data_fim: '2027-06-30' },
      { id: 'b', codigo: 'x', escopo_negocio: 'administrativo', data_inicio: '2026-01-01', data_fim: '2026-12-31' },
      { id: 'c', codigo: 'y', escopo_negocio: 'agricultura', data_inicio: null, data_fim: '2027-06-30' },
      { id: 'd', nome: '25/26 Lavoura', escopo_negocio: 'agricultura', data_inicio: '2025-09-01T00:00:00', data_fim: '2026-08-31' },
    ])).toEqual([
      { id: 'a', codigo: '26/27-Pec', atividade: 'pecuaria', de: '2026-07-01', ate: '2027-06-30' },
      { id: 'd', codigo: '25/26 Lavoura', atividade: 'agricultura', de: '2025-09-01', ate: '2026-08-31' },
    ]);
    expect(lerSafras(null)).toEqual([]);
  });
});
