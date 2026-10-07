/** PARC-CADEIA-01 passo 2 — o instantâneo da ida da Contas a Pagar e Receber ao contrato: validado campo a campo, lido UMA vez. */
import { describe, it, expect, beforeEach } from 'vitest';
import { CHAVE_RETORNO_CPR, consumirRetornoCpr, guardarRetornoCpr, lerRetornoCpr, type RetornoCpr } from './cprRetorno';

const ESTADO: RetornoCpr = {
  visao: 'fluxo', atalho: 'datas', datas: { de: '2026-10-01', ate: '2026-11-30' }, incluirVencidos: false,
  contaSel: 'conta-1', segmento: 'ambos', statusLigados: ['previsto', 'programado'], ampliado: true,
};

beforeEach(() => sessionStorage.clear());

describe('retorno da CPR', () => {
  it('guarda e devolve o recorte inteiro', () => {
    guardarRetornoCpr(ESTADO);
    expect(consumirRetornoCpr()).toEqual(ESTADO);
  });
  it('lê UMA vez: a segunda leitura não acha nada', () => {
    guardarRetornoCpr(ESTADO);
    consumirRetornoCpr();
    expect(sessionStorage.getItem(CHAVE_RETORNO_CPR)).toBeNull();
    expect(consumirRetornoCpr()).toBeNull();
  });
  it('campo torto fica de fora; o resto vale', () => {
    const r = lerRetornoCpr(JSON.stringify({ ...ESTADO, visao: 'grade', atalho: '90', datas: { de: '01/10/2026', ate: '2026-11-30' }, segmento: 7, statusLigados: ['previsto', 3] }));
    expect(r).toEqual({ incluirVencidos: false, contaSel: 'conta-1', statusLigados: ['previsto'], ampliado: true });
  });
  it('conta "todas" (nula) e datas nulas voltam como nulas, não como ausentes', () => {
    const r = lerRetornoCpr(JSON.stringify({ ...ESTADO, contaSel: null, datas: null }));
    expect(r).toMatchObject({ contaSel: null, datas: null });
    expect(r && 'contaSel' in r && 'datas' in r).toBe(true);
  });
  it('lixo não derruba: texto que não é JSON, lista, vazio', () => {
    expect(lerRetornoCpr('{')).toBeNull();
    expect(lerRetornoCpr('[1]')).toBeNull();
    expect(lerRetornoCpr(null)).toBeNull();
    expect(lerRetornoCpr('{}')).toBeNull();
  });
});
