/**
 * PR-CONC-ENRIQ-AGRUP-2b-TELA — a forma da seleção no Extrato da planilha.
 *
 * ⚠ O CASO REAL É O DO NJ (Sicredi Lavoura, set/26): o cru Terra Forte −63.716,00 (10/09) contra as linhas "sem par" da
 *   planilha — 16.150,00 + 15.963,00 + 15.816,80 + 15.786,20 = 63.716,00 fecha ao centavo; tirar a última não fecha.
 */
import { describe, it, expect } from 'vitest';
import { gestoDaSelecao } from './agruparNoExtrato';
import { textoSomaDifere } from './desmembrar';

const p = (...vs: number[]) => vs.map((valor, i) => ({ id: `p${i}`, valor }));
const s = (...vs: number[]) => vs.map((valor, i) => ({ id: `s${i}`, valor }));

describe('gestoDaSelecao — as cinco formas', () => {
  it('nada marcado: sem forma e sem motivo', () => {
    expect(gestoDaSelecao({ planilha: [], sistema: [] })).toMatchObject({ forma: null, habilitado: false, motivo: null });
  });

  it('só um lado: "marque também o outro lado"', () => {
    for (const sel of [{ planilha: p(-10), sistema: [] }, { planilha: [], sistema: s(-10) }]) {
      expect(gestoDaSelecao(sel)).toMatchObject({ forma: null, habilitado: false, motivo: 'marque também o outro lado' });
    }
  });

  /* fix1: a RPC do 1×1 só aceita `candidatos_proximos`, e a linha marcável é a `sem_match` — o botão não se habilita */
  it('1 × 1: "Casar" desabilitado, com a frase de que ainda não tem gravação', () => {
    expect(gestoDaSelecao({ planilha: p(-500), sistema: s(-500) })).toMatchObject({
      forma: 'casar', rotulo: 'Casar', habilitado: false,
      motivo: 'casar 1×1 em linha sem par ainda não tem gravação', diferenca: 0,
    });
  });

  it('N × 1 que fecha ao centavo: "Desmembrar em 4", habilitado (Terra Forte −63.716,00)', () => {
    const g = gestoDaSelecao({ planilha: p(-16150, -15963, -15816.8, -15786.2), sistema: s(-63716) });
    expect(g).toMatchObject({ forma: 'desmembrar', rotulo: 'Desmembrar em 4', habilitado: true, motivo: null });
    expect(g.somaPlanilha).toBe(-63716);
    expect(g.somaSistema).toBe(-63716);
    expect(g.diferenca).toBe(0);
  });

  it('N × 1 que NÃO fecha: desabilitado, com a frase do motivoDoDesmembrar (a mesma da RPC)', () => {
    const g = gestoDaSelecao({ planilha: p(-16150, -15963, -15816.8), sistema: s(-63716) });
    expect(g.forma).toBe('desmembrar');
    expect(g.rotulo).toBe('Desmembrar em 3');
    expect(g.habilitado).toBe(false);
    expect(g.diferenca).toBe(15786.2);
    expect(g.motivo).toBe(textoSomaDifere(1578620));
  });

  it('1 × N: "Juntar 2 nesta linha"', () => {
    expect(gestoDaSelecao({ planilha: p(-107521.6), sistema: s(-63716, -43805.6) }))
      .toMatchObject({ forma: 'juntar', rotulo: 'Juntar 2 nesta linha', habilitado: true, diferenca: 0 });
  });

  it('N × M: bloco desabilitado, "bloco 2×2 ainda não tem gravação"', () => {
    expect(gestoDaSelecao({ planilha: p(-1, -2), sistema: s(-1, -2) }))
      .toMatchObject({ forma: 'bloco', habilitado: false, motivo: 'bloco 2×2 ainda não tem gravação' });
  });

  it('a soma é com sinal e ao centavo (sem resíduo de ponto flutuante)', () => {
    const g = gestoDaSelecao({ planilha: p(-0.1, -0.2), sistema: s(-0.3) });
    expect(g.somaPlanilha).toBe(-0.3);
    expect(g.diferenca).toBe(0);
    expect(g.habilitado).toBe(true);
  });
});
