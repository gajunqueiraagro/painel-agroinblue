/**
 * SM-ARRENDAMENTO-ENCERRAR-01 — a área dos leitores que somavam o cadastro de hoje é a do MÊS (pastos ativos e vigentes).
 * Dado SINTÉTICO no formato do caso da Sta. Maria: um arrendamento de 600 ha vigente até 31/07/2024, um pasto que só começa em
 * 01/01/2024, um inativo e uma reserva.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { anoMesDe, areaDosPastosNoMes, areaPecuariaMediaDoAno, areaPorMes } from './areaDoMes';

const pastos = [
  { ativo: true, area_produtiva_ha: 500, tipo_uso: 'recria', data_inicio: null, data_fim: null },
  { ativo: true, area_produtiva_ha: 600, tipo_uso: 'recria', data_inicio: '2020-01-01', data_fim: '2024-07-31' }, // o arrendamento
  { ativo: true, area_produtiva_ha: 100, tipo_uso: 'recria', data_inicio: '2024-01-01', data_fim: null },
  { ativo: false, area_produtiva_ha: 800, tipo_uso: 'recria', data_inicio: null, data_fim: null }, // inativo sem data
  { ativo: true, area_produtiva_ha: 50, tipo_uso: 'reserva', data_inicio: null, data_fim: null },
];

describe('areaDosPastosNoMes — ativo + vigência do mês', () => {
  it('o arrendamento conta até o mês do fim e sai no seguinte; o pasto novo entra no mês do início; o inativo nunca', () => {
    expect(areaDosPastosNoMes(pastos, '2023-12')).toBe(500 + 600 + 50);
    expect(areaDosPastosNoMes(pastos, '2024-07')).toBe(500 + 600 + 100 + 50);
    expect(areaDosPastosNoMes(pastos, '2024-08')).toBe(500 + 100 + 50);
  });
  it('areaPorMes devolve a área de cada mês, na ordem', () => {
    expect(areaPorMes(pastos, ['2024-06', '2024-07', '2024-08'])).toEqual([1250, 1250, 650]);
  });
  it('anoMesDe preenche o mês com dois dígitos', () => {
    expect(anoMesDe(2024, 7)).toBe('2024-07');
    expect(anoMesDe(2024, 12)).toBe('2024-12');
  });
});

describe('areaPecuariaMediaDoAno — o divisor do PC-100 Meta (P1: a média dos 12 meses, não dezembro)', () => {
  it('2024: 7 meses com o arrendamento e 5 sem; a reserva e o inativo não entram', () => {
    expect(areaPecuariaMediaDoAno(pastos, 2024)).toBeCloseTo((7 * 1200 + 5 * 600) / 12, 10);
    expect(areaPecuariaMediaDoAno(pastos, 2024)).not.toBeCloseTo(600, 3); // não é dezembro
  });
  it('2025: só o que está vigente o ano todo', () => {
    expect(areaPecuariaMediaDoAno(pastos, 2025)).toBe(600);
  });
  it('2023: o pasto que começa em 2024 ainda não conta', () => {
    expect(areaPecuariaMediaDoAno(pastos, 2023)).toBe(1100);
  });
});

describe('trava: os 4 leitores usam a área do mês', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');
  it('lotação global (useRebanhoOficial) soma por mês', () => {
    const s = src('hooks/useRebanhoOficial.ts');
    expect(s).toContain("areaDosPastosNoMes(daFazendaComRebanho, r.ano_mes)");
    expect(s).not.toMatch(/const areaTotal = pastos/);
  });
  it('PC-100 Meta usa a área média do ano e não o cadastro de hoje', () => {
    const s = src('pages/PainelConsultorTab.tsx');
    expect(s).toContain('areaPecuariaMediaDoAno(pastos, anoNum)');
    expect(s).not.toMatch(/=>\s*calcAreaProdutivaPecuaria\(pastos\)/); // o comentário de :2172 ainda cita o nome antigo
  });
  it('Resumo soma os pastos vigentes no mês escolhido', () => {
    expect(src('pages/ResumoTab.tsx')).toContain('areaDosPastosNoMes(pastos || [], anoMesDe(ano, mes))');
  });
  it('Análise Trimestral: lotação com a área de cada mês; a área mostrada é a do último', () => {
    const s = src('hooks/useAnaliseTrimestral.ts');
    expect(s).toContain('areaPorMes(pastoRows, anoMesTri)');
    expect(s).toContain('const areaPecuariaHa = areaPorMesTri[2]');
    expect(s).toContain("data_inicio, data_fim')");
  });
});
