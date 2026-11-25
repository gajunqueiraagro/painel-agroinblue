/** NOTA-ENTREGA-FUTURA-01 (B) — a ordem do "+ Ligar entrega da Caixa" (dados SINTÉTICOS). */
import { describe, expect, it } from 'vitest';
import { ordenarRemessas, type RemessaNaCaixa } from './entregasDaCaixa';

const r = (numero: string, o: Partial<RemessaNaCaixa> = {}): RemessaNaCaixa => ({ chave: numero.padStart(44, '0'), numero, emissao: '2026-11-18', valorCent: 0,
  emitenteNome: 'Sintética', xml: '<x/>', citaACompra: false, citaOutra: false, ...o });

describe('ordenarRemessas', () => {
  it('a que cita esta compra primeiro; sem referência depois, pela emissão; a que cita OUTRA nota fica de fora', () => {
    const lista = ordenarRemessas([r('3', { emissao: '2026-11-20' }), r('1', { emissao: '2026-11-19' }), r('2', { citaACompra: true, emissao: '2026-11-25' }),
      r('9', { citaOutra: true })]);
    expect(lista.map((x) => x.numero)).toEqual(['2', '1', '3']);
  });
});
