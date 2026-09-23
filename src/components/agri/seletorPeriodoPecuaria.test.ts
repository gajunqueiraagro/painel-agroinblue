/**
 * O PERÍODO QUE O BOTÃO "Ano" ENTREGA — DRE-PERIODO-01.
 *
 * ⚠ ELE NÃO É MAIS JANEIRO A DEZEMBRO, e a razão é de leitura, não de gosto: em setembro, "Ano"
 * incluía setembro inteiro — um mês que ainda está acontecendo, sem lançamento fechado e sem foto
 * de rebanho. O DRE mostrava uma fatia pela metade no meio da comparação.
 * ⚠ A DATA ENTRA POR PARÂMETRO de propósito: um teste que dependesse do relógio da máquina passaria
 * em setembro e falharia em janeiro, e é justamente janeiro que este arquivo precisa afirmar.
 */
import { describe, it, expect } from 'vitest';
import { periodoDoAno } from '@/components/agri/SeletorPeriodoPecuaria';
import { anoMes } from '@/v2/lib/periodo';

const texto = (ano: number, hoje: Date) => {
  const p = periodoDoAno(ano, hoje);
  return `${anoMes(p.de)} → ${anoMes(p.ate)}`;
};

describe('o período do botão Ano', () => {
  it('o ano corrente vai de janeiro até o último mês FECHADO', () => {
    expect(texto(2026, new Date(2026, 8, 23))).toBe('2026-01 → 2026-08'); // setembro
    expect(texto(2026, new Date(2026, 1, 2))).toBe('2026-01 → 2026-01');  // fevereiro
    expect(texto(2026, new Date(2026, 11, 31))).toBe('2026-01 → 2026-11'); // dezembro
  });

  /* ⚠ ANO PASSADO CONTINUA INTEIRO: ele fechou, e cortá-lo no mês de hoje compararia doze meses
     com oito por um acidente de calendário. */
  it('anos anteriores continuam de janeiro a dezembro', () => {
    expect(texto(2025, new Date(2026, 8, 23))).toBe('2025-01 → 2025-12');
    expect(texto(2024, new Date(2026, 0, 15))).toBe('2024-01 → 2024-12');
  });

  /**
   * ⚠ JANEIRO É DECISÃO PENDENTE, e este caso o REGISTRA em vez de escondê-lo: no primeiro mês do
   * ano não há mês fechado dentro dele, e a regra não tem resposta. Até o Gabriel decidir, o
   * comportamento é o de sempre (jan→dez) — e se alguém mudar isso por conta própria, é aqui que
   * aparece.
   */
  it('em janeiro, o ano corrente fica como sempre foi — jan→dez, à espera da decisão', () => {
    expect(texto(2026, new Date(2026, 0, 10))).toBe('2026-01 → 2026-12');
  });
});
