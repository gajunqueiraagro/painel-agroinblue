import { describe, expect, it } from 'vitest';
import { casarNomePasto, chaveDoNomeDePasto, type PastoParaCasar } from './casarNomePasto';

const FAZ = 'faz-3m';
// Nomes reais dos pastos da 3M (proto, 30/10/2026).
const PASTOS_3M: PastoParaCasar[] = [
  { id: 'p07', nome: 'P_07', ativo: true, fazenda_id: FAZ },
  { id: 'p09', nome: 'P_09', ativo: true, fazenda_id: FAZ },
  { id: 'p27', nome: 'P_27', ativo: true, fazenda_id: FAZ },
  { id: 'arr', nome: 'Arrendamento - Baldasso', ativo: true, fazenda_id: FAZ },
  { id: 'div', nome: '⚠️ Divergência do Campeiro', ativo: true, fazenda_id: FAZ },
];

describe('casarNomePasto (MAPA-IMPORT-01a)', () => {
  it('P07 casa com P_07', () => {
    expect(casarNomePasto('P07', PASTOS_3M, FAZ)).toEqual({ pastoId: 'p07', clara: true, candidatos: [{ id: 'p07', nome: 'P_07' }] });
  });

  it('as grafias do mesmo número são o mesmo pasto', () => {
    for (const nome of ['P_07', 'P 7', 'p7', 'P-07', 'P.7', 'Pasto 7', ' p 07 ']) {
      expect(casarNomePasto(nome, PASTOS_3M, FAZ).pastoId, nome).toBe('p07');
    }
  });

  it('P27 - Mombaça casa com P_27 (o que vem depois de " - " não conta)', () => {
    expect(casarNomePasto('P27 - Mombaça', PASTOS_3M, FAZ).pastoId).toBe('p27');
  });

  it('P01 não está cadastrado: sem vínculo', () => {
    expect(casarNomePasto('P01', PASTOS_3M, FAZ)).toEqual({ pastoId: null, clara: false, candidatos: [] });
  });

  it('"Área Total" não é pasto: sem vínculo', () => {
    expect(casarNomePasto('Área Total', PASTOS_3M, FAZ)).toEqual({ pastoId: null, clara: false, candidatos: [] });
  });

  it('P7 não casa com P17 nem com P70', () => {
    const pastos: PastoParaCasar[] = [
      { id: 'a', nome: 'P_17', ativo: true, fazenda_id: FAZ },
      { id: 'b', nome: 'P_70', ativo: true, fazenda_id: FAZ },
    ];
    expect(casarNomePasto('P7', pastos, FAZ).pastoId).toBeNull();
  });

  it('dois pastos ativos com o mesmo nome: sem vínculo e os 2 candidatos', () => {
    const pastos: PastoParaCasar[] = [...PASTOS_3M, { id: 'p07b', nome: 'P 07', ativo: true, fazenda_id: FAZ }];
    const r = casarNomePasto('P07', pastos, FAZ);
    expect(r.pastoId).toBeNull();
    expect(r.clara).toBe(false);
    expect(r.candidatos.map(c => c.id).sort()).toEqual(['p07', 'p07b']);
  });

  it('pasto inativo não casa', () => {
    const pastos: PastoParaCasar[] = [{ id: 'x', nome: 'P_07', ativo: false, fazenda_id: FAZ }];
    expect(casarNomePasto('P07', pastos, FAZ)).toEqual({ pastoId: null, clara: false, candidatos: [] });
  });

  it('pasto de outra fazenda não casa', () => {
    const pastos: PastoParaCasar[] = [{ id: 'x', nome: 'P_07', ativo: true, fazenda_id: 'outra' }];
    expect(casarNomePasto('P07', pastos, FAZ).pastoId).toBeNull();
  });

  it('nome vazio não casa com nada', () => {
    expect(casarNomePasto('  ', PASTOS_3M, FAZ).pastoId).toBeNull();
    expect(chaveDoNomeDePasto(null)).toBe('');
  });
});
