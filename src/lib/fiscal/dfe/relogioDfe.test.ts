/** NOTAS-RECEITA-A1-01 · F3.0 — o relógio da Distribuição DF-e (137 = 1 h; 656 = bloqueio; 138 até ultNSU = maxNSU; 20 chaves por hora). */
import { describe, expect, it } from 'vitest';
import { chavesQueCabem, depoisDaResposta, podeBuscar, type EstadoDoRelogio } from '../../../../supabase/functions/_shared/dfe/relogioDfe';

const AGORA = new Date('2026-11-14T20:00:00Z');
const UMA_HORA = '2026-11-14T21:00:00.000Z';
const E: EstadoDoRelogio = { ultNsu: 100n, maxNsu: 100n, naoAntesDe: null, ultimoCstat: null };

describe('relógio da distribuição', () => {
  it('podeBuscar respeita o "não antes de"', () => {
    expect(podeBuscar({ naoAntesDe: null }, AGORA)).toEqual({ pode: true });
    expect(podeBuscar({ naoAntesDe: UMA_HORA }, AGORA)).toEqual({ pode: false, ate: UMA_HORA });
    expect(podeBuscar({ naoAntesDe: '2026-11-14T20:00:00Z' }, AGORA)).toEqual({ pode: true });
  });
  it('138 com mais por vir: continua já, sem hora marcada; o NSU anda', () => {
    const d = depoisDaResposta(E, { cStat: '138', ultNsu: 150n, maxNsu: 400n }, AGORA);
    expect(d).toEqual({ estado: { ultNsu: 150n, maxNsu: 400n, naoAntesDe: null, ultimoCstat: '138' }, continuar: true, parouPorErro: false });
  });
  it('138 que chegou ao fim (ultNSU = maxNSU) e 137: próxima só em 1 hora', () => {
    expect(depoisDaResposta(E, { cStat: '138', ultNsu: 400n, maxNsu: 400n }, AGORA))
      .toEqual({ estado: { ultNsu: 400n, maxNsu: 400n, naoAntesDe: UMA_HORA, ultimoCstat: '138' }, continuar: false, parouPorErro: false });
    expect(depoisDaResposta(E, { cStat: '137', ultNsu: 100n, maxNsu: 100n }, AGORA))
      .toEqual({ estado: { ultNsu: 100n, maxNsu: 100n, naoAntesDe: UMA_HORA, ultimoCstat: '137' }, continuar: false, parouPorErro: false });
  });
  it('656: bloqueio de 1 hora, o NSU não anda', () => {
    expect(depoisDaResposta(E, { cStat: '656', ultNsu: 999n, maxNsu: 999n }, AGORA))
      .toEqual({ estado: { ...E, naoAntesDe: UMA_HORA, ultimoCstat: '656' }, continuar: false, parouPorErro: false });
  });
  it('erro (472, 593, outro): para sem marcar hora e sem andar o NSU', () => {
    for (const c of ['472', '593', '999']) {
      expect(depoisDaResposta(E, { cStat: c, ultNsu: 500n, maxNsu: 500n }, AGORA))
        .toEqual({ estado: { ...E, ultimoCstat: c }, continuar: false, parouPorErro: true });
    }
  });
  it('o NSU nunca volta: 138 com ultNSU menor que o guardado não rebobina', () => {
    const d = depoisDaResposta({ ...E, ultNsu: 300n, maxNsu: 300n }, { cStat: '138', ultNsu: 120n, maxNsu: 300n }, AGORA);
    expect(d.estado.ultNsu).toBe(300n);
    expect(d.continuar).toBe(false);
  });
  it('138 sem NSUs no retorno = erro', () => {
    expect(depoisDaResposta(E, { cStat: '138', ultNsu: null, maxNsu: null }, AGORA).parouPorErro).toBe(true);
  });
  it('consulta por chave: 20 por hora (a de exatamente 1 hora atrás já saiu da conta)', () => {
    const feitas = Array.from({ length: 19 }, (_, i) => new Date(AGORA.getTime() - (i + 1) * 60_000).toISOString());
    expect(chavesQueCabem(feitas, AGORA)).toBe(1);
    expect(chavesQueCabem([...feitas, '2026-11-14T19:59:30Z'], AGORA)).toBe(0);
    expect(chavesQueCabem(['2026-11-14T19:00:00Z', 'torto'], AGORA)).toBe(20);
  });
});
