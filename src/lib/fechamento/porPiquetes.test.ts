/**
 * FECH-PASTO-UNIDADE-01 F2 — as regras puras do "Por piquetes": as abas, o juntar (o espelho da `fn_fechamento_pasto_inteiro`), o que vai ao
 * gravador e o "Usar" do mês anterior. Os números são os do caso real: PUR P7 (7A 24,76 · 7B 25,11 · 7C 24,35 · 7D 23,32), set/26 com
 * mamotes F 28, mamotes M 46 e vacas 74.
 */
import { describe, it, expect } from 'vitest';
import {
  abasDoCard, cabecasDe, gradeDasLinhas, juntarAbas, linhasParaGravar, modoDasLinhas, separarPorPiquete, usarNaGrade, SEM_PIQUETE,
  type LinhaDoCard,
} from './porPiquetes';

const CATS = [{ id: 'mf' }, { id: 'mm' }, { id: 'va' }];
const l = (cat: string, q: number, peso: number | null, piq: string | null = null, extra: Partial<LinhaDoCard> = {}): LinhaDoCard =>
  ({ categoria_id: cat, quantidade: q, peso_medio_kg: peso, lote: null, observacoes: null, origem_dado: 'manual', lote_id: null, piquete_id: piq, ...extra });

describe('modo e abas', () => {
  it('sem linha com piquete = pasto inteiro; uma linha com piquete = por piquetes', () => {
    expect(modoDasLinhas([l('va', 74, 450)])).toBe('inteiro');
    expect(modoDasLinhas([])).toBe('inteiro');
    expect(modoDasLinhas([l('va', 40, 450, '7A'), l('va', 34, 450)])).toBe('piquetes');
  });

  it('as abas são os piquetes do mês + todo piquete que já tem linha; as linhas sem piquete de um card misto ganham a aba "Sem piquete"', () => {
    expect(abasDoCard(['7A', '7B', '7C', '7D'], [])).toEqual(['7A', '7B', '7C', '7D']);
    expect(abasDoCard(['7A', '7B'], [l('va', 10, 450, '7X')])).toEqual(['7A', '7B', '7X']);
    expect(abasDoCard(['7A'], [l('va', 10, 450, '7A'), l('mf', 5, 30)])).toEqual(['7A', SEM_PIQUETE]);
    /* pasto inteiro (nenhuma linha com piquete): as linhas sem piquete NÃO viram aba */
    expect(abasDoCard(['7A'], [l('mf', 5, 30)])).toEqual(['7A']);
  });

  it('separar: cada aba tem a grade inteira das categorias, com as linhas do piquete dela', () => {
    const mapa = separarPorPiquete(CATS, ['7A', '7B'], [l('va', 40, 450, '7A'), l('mf', 28, 30, '7B'), l('va', 34, 440, '7B')]);
    expect([...mapa.keys()]).toEqual(['7A', '7B']);
    expect(mapa.get('7A')!.map(i => i.quantidade)).toEqual([0, 0, 40]);
    expect(mapa.get('7B')!.map(i => i.quantidade)).toEqual([28, 0, 34]);
  });
});

describe('juntar as abas (o espelho da fn_fechamento_pasto_inteiro)', () => {
  it('cabeças somadas por categoria; peso médio ponderado pelas linhas com peso (2 casas); nenhuma cabeça se perde', () => {
    const g = juntarAbas(CATS, [[l('va', 40, 450, '7A')], [l('va', 34, 440, '7B'), l('mf', 28, 30, '7B')], [l('mm', 46, null, '7C')]]);
    expect(g.map(i => i.quantidade)).toEqual([28, 46, 74]);
    expect(g[2].peso_medio_kg).toBe(445.41); // (40×450 + 34×440) / 74
    expect(g[1].peso_medio_kg).toBeNull();   // sem peso em linha nenhuma
    expect(cabecasDe(g)).toBe(148);
  });

  it('a linha sem peso não puxa a média para baixo (pesa só quem tem peso)', () => {
    const [, , va] = juntarAbas(CATS, [[l('va', 40, 450, '7A'), l('va', 10, null, '7B')]]);
    expect(va.quantidade).toBe(50);
    expect(va.peso_medio_kg).toBe(450);
  });

  it('o lote fica só se for UM só em todas as linhas; com alguma linha sem lote, sai', () => {
    const [, , um] = juntarAbas(CATS, [[l('va', 40, 450, '7A', { lote_id: 'L1' }), l('va', 34, 450, '7B', { lote_id: 'L1' })]]);
    expect(um.lote_id).toBe('L1');
    const [, , dois] = juntarAbas(CATS, [[l('va', 40, 450, '7A', { lote_id: 'L1' }), l('va', 34, 450, '7B', { lote_id: 'L2' })]]);
    expect(dois.lote_id).toBeNull();
    const [, , semUm] = juntarAbas(CATS, [[l('va', 40, 450, '7A', { lote_id: 'L1' }), l('va', 34, 450, '7B')]]);
    expect(semUm.lote_id).toBeNull();
  });

  it('linha zerada não entra na conta', () => {
    const [, , va] = juntarAbas(CATS, [[l('va', 0, 999, '7A', { lote_id: 'LX' }), l('va', 30, 450, '7B', { lote_id: 'L1' })]]);
    expect(va.quantidade).toBe(30); expect(va.peso_medio_kg).toBe(450); expect(va.lote_id).toBe('L1');
  });
});

describe('o que vai ao gravador', () => {
  it('pasto inteiro: as linhas da grade, sem piquete', () => {
    const g = gradeDasLinhas(CATS, [l('va', 74, 450)]);
    expect(linhasParaGravar('inteiro', g, new Map()).every(x => !x.piquete_id)).toBe(true);
  });

  it('por piquetes: só as categorias com cabeça, cada uma com o piquete da aba; a aba "Sem piquete" vai sem piquete', () => {
    const abas = new Map([['7A', gradeDasLinhas(CATS, [l('va', 40, 450)])], ['7B', gradeDasLinhas(CATS, [l('va', 34, 440), l('mf', 28, 30)])],
      [SEM_PIQUETE, gradeDasLinhas(CATS, [l('mm', 46, 30)])]]);
    const out = linhasParaGravar('piquetes', [], abas);
    expect(out.map(x => `${x.piquete_id ?? '—'} ${x.categoria_id} ${x.quantidade}`)).toEqual(['7A va 40', '7B mf 28', '7B va 34', '— mm 46']);
    expect(cabecasDe(out)).toBe(148);
  });
});

describe('"Usar" uma linha do mês anterior', () => {
  it('categoria vazia recebe a linha (cab, peso, lote) com a origem "copiado do mês anterior"', () => {
    const g = usarNaGrade(gradeDasLinhas(CATS, []), l('va', 74, 450, null, { lote_id: 'L1' }));
    expect(g[2]).toMatchObject({ quantidade: 74, peso_medio_kg: 450, lote_id: 'L1', origem_dado: 'copiado_mes_anterior' });
    expect(g[0].quantidade).toBe(0);
  });

  it('categoria com cabeça SOMA (peso ponderado); lote diferente sai', () => {
    const g = usarNaGrade(gradeDasLinhas(CATS, [l('va', 40, 450, null, { lote_id: 'L1' })]), l('va', 34, 440, null, { lote_id: 'L2' }));
    expect(g[2]).toMatchObject({ quantidade: 74, peso_medio_kg: 445.41, lote_id: null });
  });
});
