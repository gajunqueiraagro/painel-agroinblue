/** NOTA-PARCELAR-01 — o "None" da planilha nunca vira descrição (o caso real: "Parcela 2 - None" da NF 5.629). */
import { describe, expect, it } from 'vitest';
import { semVazioEscrito } from './parserLancamentos';

describe('NOTA-PARCELAR-01 — semVazioEscrito', () => {
  it('tira o vazio escrito do fim e o texto que é só vazio', () => {
    expect(['Parcela 2 - None', 'Parcela 3 – nan', 'Frete null', 'None', ' NaN ', 'Manutenção de Instalações', null].map(semVazioEscrito))
      .toEqual(['Parcela 2', 'Parcela 3', 'Frete', null, null, 'Manutenção de Instalações', null]);
  });
  it('não mexe em palavra que só contém o vazio no meio', () => {
    expect(['Nonestop peças', 'Banana nanica'].map(semVazioEscrito)).toEqual(['Nonestop peças', 'Banana nanica']);
  });
});
