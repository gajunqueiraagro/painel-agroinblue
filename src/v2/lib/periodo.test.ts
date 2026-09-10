import { describe, it, expect } from 'vitest';
import {
  anoInteiro, anoMes, contarMeses, dentro, descreverDias, descreverPeriodo,
  ehAnoInteiro, ehMesUnico, mesUnico, ordenar,
} from './periodo';

describe('período — um mês', () => {
  it('mês único é `de === ate`', () => {
    const p = mesUnico(2026, 8);
    expect(ehMesUnico(p)).toBe(true);
    expect(contarMeses(p)).toBe(1);
    expect(descreverPeriodo(p)).toBe('agosto/2026');
  });

  it('o mês vira texto zero-padded, que é como o banco guarda', () => {
    expect(anoMes({ ano: 2026, mes: 3 })).toBe('2026-03');
    expect(anoMes({ ano: 2026, mes: 12 })).toBe('2026-12');
  });

  it('só o próprio mês cai dentro', () => {
    const p = mesUnico(2026, 8);
    expect(dentro(p, '2026-08')).toBe(true);
    expect(dentro(p, '2026-07')).toBe(false);
    expect(dentro(p, '2026-09')).toBe(false);
  });
});

describe('período — dentro do mesmo ano', () => {
  const p = { de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 4 } };

  it('conta os dois extremos', () => {
    expect(contarMeses(p)).toBe(3);
    expect(ehMesUnico(p)).toBe(false);
  });

  it('o ano aparece uma vez só', () => {
    expect(descreverPeriodo(p)).toBe('fev → abr/2026');
  });

  it('inclui os extremos e exclui os vizinhos', () => {
    expect(dentro(p, '2026-02')).toBe(true);
    expect(dentro(p, '2026-03')).toBe(true);
    expect(dentro(p, '2026-04')).toBe(true);
    expect(dentro(p, '2026-01')).toBe(false);
    expect(dentro(p, '2026-05')).toBe(false);
  });

  it('o ano inteiro é janeiro a dezembro — o que `todos`/`__all__` queriam dizer', () => {
    const ano = anoInteiro(2026);
    expect(ehAnoInteiro(ano)).toBe(true);
    expect(contarMeses(ano)).toBe(12);
    expect(dentro(ano, '2026-01')).toBe(true);
    expect(dentro(ano, '2026-12')).toBe(true);
    expect(dentro(ano, '2025-12')).toBe(false);
  });
});

describe('período — atravessando anos', () => {
  const p = { de: { ano: 2024, mes: 1 }, ate: { ano: 2025, mes: 12 } };

  it('conta os meses dos dois anos', () => {
    expect(contarMeses(p)).toBe(24);
  });

  it('o ano aparece nos dois extremos', () => {
    expect(descreverPeriodo(p)).toBe('jan/2024 → dez/2025');
  });

  it('a comparação é lexicográfica e atravessa a virada do ano', () => {
    expect(dentro(p, '2024-01')).toBe(true);
    expect(dentro(p, '2024-12')).toBe(true);
    expect(dentro(p, '2025-01')).toBe(true);
    expect(dentro(p, '2025-12')).toBe(true);
    expect(dentro(p, '2023-12')).toBe(false);
    expect(dentro(p, '2026-01')).toBe(false);
  });

  it('a nota do popover fecha no último dia real do mês final', () => {
    expect(descreverDias(p)).toBe('01/01/2024 a 31/12/2025');
    expect(descreverDias(mesUnico(2024, 2))).toBe('01/02/2024 a 29/02/2024');
    expect(descreverDias(mesUnico(2026, 2))).toBe('01/02/2026 a 28/02/2026');
  });
});

describe('período invertido', () => {
  /* ⚠ Um intervalo invertido filtra ZERO linhas em silêncio — o pior defeito de um filtro.
     Clicar no fim antes do início é uso normal, não erro, e se resolve aqui. */
  it('ordenar troca os extremos', () => {
    const p = ordenar({ de: { ano: 2026, mes: 9 }, ate: { ano: 2026, mes: 3 } });
    expect(p.de.mes).toBe(3);
    expect(p.ate.mes).toBe(9);
    expect(contarMeses(p)).toBe(7);
  });

  it('não mexe no que já está em ordem', () => {
    const p = { de: { ano: 2025, mes: 11 }, ate: { ano: 2026, mes: 2 } };
    expect(ordenar(p)).toBe(p);
  });
});
