/**
 * FIN-NFE-PARCELAS-01 PR 2b — a linha digitável dos 8 boletos REAIS da Vera (St Repro, NF 18112), lidos do
 * PDF na FASE 0 (29/09/2026). O vencimento sai do fator pela regra de 22/02/2025 (fator 1000); a regra
 * antiga daria 2002 — o caso de controle abaixo prova que o teste sabe a diferença.
 */
import { describe, it, expect } from 'vitest';
import { lerLinhaDigitavel, vencimentoDoFator } from '@/lib/financeiro/linhaDigitavel';

const VERA: [string, number, string][] = [
  ['34191090080488182004919646100008816110000300650', 1611, '2026-10-26'],
  ['34191090080488190004919646100008216420000300650', 1642, '2026-11-26'],
  ['34191090080488208004919646100008316740000300650', 1674, '2026-12-28'],
  ['34191090080488216004919646100008117040000300650', 1704, '2027-01-27'],
  ['34191090080488224004919646100008617370000300650', 1737, '2027-03-01'],
  ['34191090080488232004919646100008117660000300650', 1766, '2027-03-30'],
  ['34191090080488240004919646100008417970000300650', 1797, '2027-04-30'],
  ['34191090080488257004919646100008118280000300650', 1828, '2027-05-31'],
];

/** Como o banco imprime: "34191.09008 04881.820049 19646.100008 8 16110000300650". */
const impressa = (l: string) =>
  `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;

describe('linha digitável — os 8 boletos da Vera', () => {
  it.each(VERA)('%s -> fator %i, vencimento %s, valor 3.006,50', (linha, fator, venc) => {
    const r = lerLinhaDigitavel(`Pagador VERA LIGIA ... Linha digitável ${impressa(linha)} Vencimento ...`);
    expect(r).toEqual({ linha, vencimento: venc, valor: 3006.5 });
    expect(Number(linha.slice(33, 37))).toBe(fator);
  });

  it('também lê a linha corrida (47 dígitos sem separador)', () => {
    expect(lerLinhaDigitavel(`xx ${VERA[4][0]} yy`)?.vencimento).toBe('2027-03-01');
  });

  it('a regra é a de 22/02/2025: fator 1000 = 22/02/2025 (a antiga, base 07/10/1997, daria 2002)', () => {
    expect(vencimentoDoFator(1000)).toBe('2025-02-22');
    expect(vencimentoDoFator(1611)).toBe('2026-10-26');
    expect(vencimentoDoFator(1611)).not.toBe('2002-03-06');
  });

  it('sem linha digitável -> null; linha curta -> null; fator 0000 -> vencimento null', () => {
    expect(lerLinhaDigitavel('Boleto sem linha, só texto 3.006,50 26/10/2026')).toBeNull();
    expect(lerLinhaDigitavel('3419109008048818200491964610000881611000030065')).toBeNull();
    const semVenc = '34191090080488182004919646100008800000000300650';
    expect(lerLinhaDigitavel(semVenc)).toEqual({ linha: semVenc, vencimento: null, valor: 3006.5 });
  });
});
