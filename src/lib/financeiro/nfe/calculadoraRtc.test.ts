/**
 * CALCULADORA-RTC-CONFERIR-01 (Gabriel 22/11: "aprovado adotar a regra da calculadora (redução/diferimento) no conferirIbsCbs, com os
 * casos dela como teste") — a conta do IBS/CBS por item é a da calculadora oficial da Receita (`calculadora-rtc-regime-regular`, MIT), e os
 * casos dos testes dela (`calculadoraRtc.casos.json`, entrada + saída esperada) prendem a nossa: cada número igual, centavo a centavo.
 * Antes, a conferência usava a alíquota CHEIA (0,9% / 0,1%): no proto, 70 dos 237 itens com IBS/CBS (redução de 60%/100% e diferimento)
 * seriam acusados sem motivo.
 */
import { describe, expect, it } from 'vitest';
import casos from './calculadoraRtc.casos.json';
import { contaDaCalculadora, conferirIbsCbs } from './ibsCbsDoPdf';
import { CCLASSTRIB_RTC } from './cClassTribRtc';

type Tributo = 'CBS' | 'IBSUF' | 'IBSMun';
const TRIBUTOS: readonly Tributo[] = ['CBS', 'IBSUF', 'IBSMun'];
type Linha = [string, number, number, string, string];
const linha = (c: (typeof casos.casos)[number], t: Tributo): Linha => {
  const [aliquota, pRed, pDif, efetiva, devido] = c[t];
  return [String(aliquota), Number(pRed), Number(pDif), String(efetiva), String(devido)];
};

describe('a conta da calculadora oficial (os casos dos testes dela)', () => {
  it.each(casos.casos)('$teste: alíquota efetiva e valor devido de cada tributo, centavo a centavo', (c) => {
    for (const t of TRIBUTOS) {
      const [aliquota, pRed, pDif, efetiva, devido] = linha(c, t);
      const r = contaDaCalculadora({ vBC: c.vBC, aliquota, pRed, pDif });
      expect({ t, efetiva: r.aliquotaEfetiva, devido: r.devido }).toEqual({ t, efetiva, devido });
    }
  });

  it('o empate exato vai para o PAR (HALF_EVEN, ABNT NBR 5891): 25,00 × 0,9% = 0,225 → 0,22; 0,235 → 0,24', () => {
    expect(contaDaCalculadora({ vBC: '25.00', aliquota: '0.90' }).calculado).toBe('0.22');
    expect(contaDaCalculadora({ vBC: '26.11', aliquota: '0.90' }).calculado).toBe('0.23'); // 0,23499 → 0,23 (não é empate)
    expect(contaDaCalculadora({ vBC: '23.50', aliquota: '1.00' }).calculado).toBe('0.24'); // 0,235 → 0,24 (o par)
  });

  it('o diferimento: vDif = arred2(vBC × efetiva ÷ 100 × pDif ÷ 100) e o devido é o calculado menos ele', () => {
    expect(contaDaCalculadora({ vBC: '200.00', aliquota: '0.90', pRed: 60, pDif: 100 })).toEqual({ aliquotaEfetiva: '0.3600', calculado: '0.72', diferido: '0.72', devido: '0.00' });
    expect(contaDaCalculadora({ vBC: '200.00', aliquota: '0.90', pRed: 60, pDif: 50 })).toEqual({ aliquotaEfetiva: '0.3600', calculado: '0.72', diferido: '0.36', devido: '0.36' });
  });
});

describe('a tabela de cClassTrib (gerada dos dados da calculadora) bate com os casos dela', () => {
  it('a redução e o diferimento de cada caso são os da tabela; o 510002 saiu da tabela vigente (só o teste antigo o usa)', () => {
    const fora: string[] = [];
    for (const c of casos.casos) {
      const r = CCLASSTRIB_RTC[c.cClassTrib];
      if (!r) { fora.push(c.cClassTrib); continue; }
      for (const t of TRIBUTOS) {
        const [, pRed, pDif] = linha(c, t);
        if (r.regra === 'zero') { expect(linha(c, t)[0]).toMatch(/^0(\.0+)?$/); continue; }
        expect({ c: c.cClassTrib, t, pRed: r.pRed?.[t] ?? 0, pDif: r.pDif ?? 0 }).toEqual({ c: c.cClassTrib, t, pRed, pDif });
      }
    }
    expect(fora).toEqual(['510002']);
  });

  it('as classificações vistas nas notas dos clientes (proto, 22/11) têm a regra certa', () => {
    expect(CCLASSTRIB_RTC['000001']).toMatchObject({ cst: '000', regra: 'conta' });
    expect(CCLASSTRIB_RTC['515001']).toMatchObject({ cst: '515', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 }, pDif: 100 });
    for (const c of ['200030', '200031', '200034', '200035', '200038']) expect(CCLASSTRIB_RTC[c]).toMatchObject({ regra: 'conta', pRed: { CBS: 60 } });
    for (const c of ['200003', '200009', '200020']) expect(CCLASSTRIB_RTC[c]).toMatchObject({ regra: 'conta', pRed: { CBS: 100 } });
    for (const c of ['620006', '410999']) expect(CCLASSTRIB_RTC[c].regra).toBe('fora');
    expect(Object.keys(CCLASSTRIB_RTC)).toHaveLength(170);
  });
});

describe('a conferência pela regra da calculadora (só avisa)', () => {
  /* o item como o PDF o escreve: CST/cClassTrib, base e valores — a redução e o diferimento vêm da TABELA */
  const itemDoPapel = (c: (typeof casos.casos)[number]): Record<string, string> => ({
    CST: CCLASSTRIB_RTC[c.cClassTrib]?.cst ?? '000', cClassTrib: c.cClassTrib, vBC: c.vBC,
    pCBS: linha(c, 'CBS')[0], pIBSUF: linha(c, 'IBSUF')[0], pIBSMun: linha(c, 'IBSMun')[0],
    vCBS: linha(c, 'CBS')[4], vIBSUF: linha(c, 'IBSUF')[4], vIBSMun: linha(c, 'IBSMun')[4],
  });
  const naTabela = casos.casos.filter((c) => CCLASSTRIB_RTC[c.cClassTrib]);

  it.each(naTabela)('$teste: o item escrito como a calculadora calcula não leva aviso', (c) => {
    expect(conferirIbsCbs([itemDoPapel(c)], null)).toEqual([]);
  });

  it.each(naTabela.filter((c) => Number(c.vBC) >= 200))('$teste: 2 centavos a mais na CBS levam o aviso', (c) => {
    const g = itemDoPapel(c);
    expect(conferirIbsCbs([{ ...g, vCBS: (Number(g.vCBS) + 0.02).toFixed(2) }], null)).toEqual([`item 1: IBS/CBS escritos não fecham com a base ${c.vBC}`]);
  });

  it('o que o XML traz (pRedAliq, pDif) manda sobre a tabela', () => {
    const papel = { CST: '200', cClassTrib: '200038', vBC: '100.00', vCBS: '0.36', vIBSUF: '0.04', vIBSMun: '0.00' };
    expect(conferirIbsCbs([papel], null)).toEqual([]);                                                       // a tabela: 60%
    expect(conferirIbsCbs([{ ...papel, pRedAliq: '100.0000', vCBS: '0.00', vIBSUF: '0.00' }], null)).toEqual([]); // o XML: 100%
    expect(conferirIbsCbs([{ ...papel, pDif: '100.0000' }], null)).toEqual(['item 1: IBS/CBS escritos não fecham com a base 100.00']);
  });

  it('as formas do papel com redução e diferimento (antes acusadas pela alíquota cheia): sem aviso', () => {
    expect(conferirIbsCbs([{ CST: '515', cClassTrib: '515001', vBC: '100.00', vCBS: '0.00', vIBSUF: '0.00', vIBSMun: '0.00' }], null)).toEqual([]);
    expect(conferirIbsCbs([{ CST: '200', cClassTrib: '200038', vBC: '100.00', vCBS: '0.36', vIBSUF: '0.04', vIBSMun: '0.00' }], null)).toEqual([]);
    expect(conferirIbsCbs([{ CST: '200', cClassTrib: '200009', vBC: '100.00', vCBS: '0.00', vIBSUF: '0.00', vIBSMun: '0.00' }], null)).toEqual([]);
    /* a alíquota cheia no item reduzido: o aviso */
    expect(conferirIbsCbs([{ CST: '200', cClassTrib: '200038', vBC: '100.00', vCBS: '0.90', vIBSUF: '0.10', vIBSMun: '0.00' }], null))
      .toEqual(['item 1: IBS/CBS escritos não fecham com a base 100.00']);
  });

  it('não se confere: a classificação "fora" (monofásica, imunidade…) e o cClassTrib que a tabela não conhece com CST ≠ 000', () => {
    expect(conferirIbsCbs([{ CST: '620', cClassTrib: '620006', vBC: '100.00', vCBS: '9.99', vIBSUF: '9.99' }], null)).toEqual([]);
    expect(conferirIbsCbs([{ CST: '200', cClassTrib: '299999', vBC: '100.00', vCBS: '9.99', vIBSUF: '9.99' }], null)).toEqual([]);
    /* desconhecido com CST 000: a tributação integral */
    expect(conferirIbsCbs([{ CST: '000', cClassTrib: '099999', vBC: '100.00', vCBS: '9.99', vIBSUF: '0.10' }], null))
      .toEqual(['item 1: IBS/CBS escritos não fecham com a base 100.00']);
  });
});
