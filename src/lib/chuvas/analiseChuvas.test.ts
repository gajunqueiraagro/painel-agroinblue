/**
 * CHUVAS-ANALISE-01 F1 — as contas da análise de chuva, com leituras SINTÉTICAS de uma fazenda.
 */
import { describe, expect, it } from 'vitest';
import {
  acumulado, chuvaPorMes, degrau, diaADia, diferencaNoDiaDoAno, fraseDiaDoAno, diasComChuva, inicioDasChuvas, intervalosEntreChuvas, maiorSecaSemChuva,
  mediaAteAMesmaData, mediaPorMes, mesesDoPeriodo, mesesExtremos, mesmaJanelaAntes, periodosDeHistorico, rotuloPeriodo,
  situacao, ultimaChuva, veranicos, type Leitura,
} from './analiseChuvas';

/* 3 anos completos (2023–2025: 100 mm em jan de cada) + 2026 até 15/03 */
const L: Leitura[] = [
  { data: '2023-01-10', mm: 100 }, { data: '2024-01-10', mm: 100 }, { data: '2025-01-10', mm: 100 },
  { data: '2025-02-10', mm: 60 },
  { data: '2026-01-05', mm: 40 }, { data: '2026-01-20', mm: 80 }, { data: '2026-02-01', mm: 0 }, { data: '2026-03-15', mm: 25 },
];

describe('período (P1)', () => {
  it('ano civil = jan–dez; ano-safra = jul–jun', () => {
    expect(mesesDoPeriodo({ modo: 'civil', ano: 2026 })[0]).toBe('2026-01');
    const s = mesesDoPeriodo({ modo: 'safra', ano: 2025 });
    expect([s[0], s[5], s[6], s[11]]).toEqual(['2025-07', '2025-12', '2026-01', '2026-06']);
    expect(rotuloPeriodo({ modo: 'safra', ano: 2025 })).toBe('safra 25/26');
  });
});

describe('média histórica (P6): só os períodos completos anteriores da fazenda', () => {
  it('lança desde jan/2023 → 2023, 2024, 2025; na safra 25/26 só a 23/24 e a 24/25', () => {
    expect(periodosDeHistorico(L, { modo: 'civil', ano: 2026 }).map(p => p.ano)).toEqual([2023, 2024, 2025]);
    expect(periodosDeHistorico(L, { modo: 'safra', ano: 2025 }).map(p => p.ano)).toEqual([2023, 2024]);
  });
  it('fazenda que começou no ano de hoje: sem histórico → média e situação null (nunca 0)', () => {
    const novo = [{ data: '2026-03-09', mm: 30 }];
    const h = periodosDeHistorico(novo, { modo: 'civil', ano: 2026 });
    expect(h).toEqual([]);
    expect(mediaPorMes(novo, h)[0]).toBeNull();
    expect(mediaAteAMesmaData(novo, { modo: 'civil', ano: 2026 }, h, '2026-03-31')).toBeNull();
    expect(situacao(null)).toBeNull();
  });
  it('média do mês e do acumulado até a mesma data', () => {
    const p = { modo: 'civil' as const, ano: 2026 };
    const h = periodosDeHistorico(L, p);
    expect(mediaPorMes(L, h).slice(0, 2)).toEqual([100, 20]);
    expect(mediaAteAMesmaData(L, p, h, '2026-01-31')).toBe(100);
    expect(mediaAteAMesmaData(L, p, h, '2026-02-28')).toBe(120);
  });
});

describe('dia sem lançamento ≠ zero', () => {
  it('depois do último lançamento o mês é null; antes, soma (0 se o mês foi lançado sem chuva)', () => {
    const m = chuvaPorMes(L, { modo: 'civil', ano: 2026 }, '2026-03-15');
    expect(m.slice(0, 5)).toEqual([120, 0, 25, null, null]);
    expect(acumulado(m).slice(0, 4)).toEqual([120, 120, 145, null]);
  });
  it('dia a dia: chuva · lançado sem chuva (0 mm) · sem lançamento', () => {
    const d = diaADia(L, '2026-02-02', 3);
    expect(d.map(x => x.estado)).toEqual(['sem', 'zero', 'sem']);
    expect(diaADia(L, '2026-01-20', 1)[0]).toMatchObject({ estado: 'chuva', mm: 80 });
  });
  it('última chuva ignora o 0 mm; dias com chuva só conta mm > 0', () => {
    expect(ultimaChuva(L, '2026-02-28')?.data).toBe('2026-01-20');
    expect(diasComChuva(L, '2026-01-01', '2026-03-31')).toBe(3);
  });
});

describe('intervalos entre chuvas lançadas (P4)', () => {
  it('conta os dias de fora das duas pontas; 0 mm não é chuva', () => {
    const i = intervalosEntreChuvas(L, '2026-01-01', '2026-03-31');
    expect(i.map(x => x.dias)).toEqual([14, 53]);
    expect(i[1]).toMatchObject({ de: '2026-01-21', ate: '2026-03-14' });
  });
  it('veranico = 10 dias ou mais começando entre out e mar; a seca fica de fora', () => {
    expect(veranicos(L, '2026-01-01', '2026-03-31').map(v => v.dias)).toEqual([14, 53]);
    const seca: Leitura[] = [{ data: '2026-05-01', mm: 5 }, { data: '2026-06-20', mm: 5 }, { data: '2026-10-01', mm: 9 }, { data: '2026-10-08', mm: 9 }];
    expect(veranicos(seca, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(maiorSecaSemChuva(seca, '2026-01-01', '2026-12-31')?.dias).toBe(102);
  });
});

describe('faixas fixas (P3) e mapa de calor', () => {
  it('85 e 115 ficam dentro; 84,9 abaixo; 115,1 acima', () => {
    expect([84.9, 85, 115, 115.1].map(situacao)).toEqual(['abaixo', 'dentro', 'dentro', 'acima']);
    expect([59, 60, 100, 141].map(degrau)).toEqual(['muito-abaixo', 'abaixo', 'dentro', 'muito-acima']);
  });
});

describe('leitura da estação', () => {
  it('início das chuvas = 1ª de 20 mm ou mais desde 1º/09', () => {
    const e: Leitura[] = [{ data: '2025-08-30', mm: 40 }, { data: '2025-09-10', mm: 8 }, { data: '2025-09-22', mm: 31 }];
    expect(inicioDasChuvas(e, 2025, '2025-12-31')?.data).toBe('2025-09-22');
  });
  it('início × o do ano anterior pelo dia do ano (02/10 × 02/10 = mesmo dia, nunca 365)', () => {
    expect(fraseDiaDoAno(diferencaNoDiaDoAno('2026-10-02', '2025-10-02'))).toBe('mesmo dia');
    expect(fraseDiaDoAno(diferencaNoDiaDoAno('2026-10-12', '2025-10-02'))).toBe('10 dias mais tarde');
    expect(fraseDiaDoAno(diferencaNoDiaDoAno('2026-09-30', '2025-10-01'))).toBe('1 dia mais cedo');
    expect(diferencaNoDiaDoAno('2025-03-01', '2024-02-29')).toBe(1);
  });
  it('mês mais chuvoso e mais seco entre os lançados', () => {
    const p = { modo: 'civil' as const, ano: 2026 };
    expect(mesesExtremos(chuvaPorMes(L, p, '2026-03-15'), p)).toEqual({ chuvoso: '2026-01', seco: '2026-02' });
  });
  it('a mesma janela no ano anterior; 29/02 vira 28/02', () => {
    expect(mesmaJanelaAntes({ modo: 'civil', ano: 2028 }, '2028-02-29')).toEqual({ de: '2027-01-01', ate: '2027-02-28' });
  });
});
