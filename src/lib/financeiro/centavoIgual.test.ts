/**
 * CENTAVO-IGUAL-01 (Chat 12/11 20:58) — a suspeita de duplicata do extrato (OFX) compara o valor pelo CENTAVO IGUAL.
 * Antes, a folga de ±R$ 0,01 marcava "duplicado?" um débito real com 1 centavo de diferença do que já estava no banco
 * (no proto: −341,34 × −341,35, −10.630,56 × −10.630,55, −33.052,11 × −33.052,12) e, pelo padrão, ele não entrava.
 * Dado sintético.
 */
import { describe, expect, it } from 'vitest';
import { classificarDuplicidadeOFX, type LinhaOFXParaDup, type RegistroExtratoExistente } from './duplicidadeImportacao';

const linha = (valor: number): LinhaOFXParaDup => ({ contaBancariaId: 'c1', dataMovimento: '2031-09-08', valor, documento: null, descricao: 'TARIFA' });
const existente: RegistroExtratoExistente = { id: 'e1', data_movimento: '2031-09-08', valor: -341.34, documento: null, descricao: 'TARIFA' };

describe('CENTAVO-IGUAL-01 — suspeita de duplicata do OFX', () => {
  it('o mesmo centavo, no mesmo dia, é suspeita', () => {
    expect(classificarDuplicidadeOFX(linha(-341.34), [existente])).not.toBeNull();
  });
  it('1 centavo de diferença NÃO é suspeita (nos dois sentidos)', () => {
    expect(classificarDuplicidadeOFX(linha(-341.35), [existente])).toBeNull();
    expect(classificarDuplicidadeOFX(linha(-341.33), [existente])).toBeNull();
  });
});
