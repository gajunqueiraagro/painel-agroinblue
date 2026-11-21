/** COMPRAS-PARC-NF-01 — a NF da compra parcelada pela nota JÁ VINCULADA às parcelas (dados sintéticos). */
import { describe, expect, it } from 'vitest';
import { agruparNotas, chaveDeOrdem, numeroCurto, rotuloDasNotas, textoDasNotasParaBusca } from './notasDasCompras';

const doc = (lanc: string, id: string, numero: string, especie = 'nf') => ({ lancamento_id: lanc, documento_id: id, especie, numero, serie: '1',
  data_emissao: '2026-10-06', valor_documento: 100, emitente_nome: 'Oficina Sintetica' });

describe('COMPRAS-PARC-NF-01 — notas das compras', () => {
  it('a mesma nota ligada a várias parcelas conta uma vez; várias notas, a menor primeiro; boleto não é nota', () => {
    const m = agruparNotas(
      [{ financiamento_id: 'c1', lancamento_id: 'l1' }, { financiamento_id: 'c1', lancamento_id: 'l2' }, { financiamento_id: 'c2', lancamento_id: 'l3' },
        { financiamento_id: 'c3', lancamento_id: null }],
      [doc('l1', 'd404', '000.000.404'), doc('l2', 'd404', '000.000.404'), doc('l2', 'd288', '000.000.288'), doc('l1', 'b1', '15786', 'boleto'), doc('l3', 'd9', '9')]);
    expect([...m].map(([k, v]) => [k, v.map((n) => n.numero)])).toEqual([['c1', ['000.000.288', '000.000.404']], ['c2', ['9']]]);
  });
  it('o rótulo: "—", "NF 288", "NF 288 +5"; a busca acha pelo inteiro e pelo curto; a ordem pela menor', () => {
    const seis = ['288', '289', '402', '403', '404', '405'].map((n) => ({ documentoId: n, numero: `000.000.${n}`, serie: null, emissao: null, valorCent: null, emitente: null }));
    expect([rotuloDasNotas(undefined), rotuloDasNotas(seis.slice(0, 1)), rotuloDasNotas(seis)])
      .toEqual([{ texto: '—', extras: 0 }, { texto: 'NF 288', extras: 0 }, { texto: 'NF 288', extras: 5 }]);
    expect(textoDasNotasParaBusca(seis.slice(4, 5))).toBe('000.000.404 404');
    expect([chaveDeOrdem(seis), chaveDeOrdem(undefined), numeroCurto('12.345.678'), numeroCurto('0')]).toEqual([288, null, '12345678', '0']);
  });
});
