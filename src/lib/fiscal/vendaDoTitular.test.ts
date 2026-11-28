/** NOTA-TIPO-ABATE-01 — a venda do titular: NF de entrada (tpNF 0) com um titular do cliente no destinatário. */
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
import { ehVendaDoTitular, fraseDaVendaNaOc } from './vendaDoTitular';

const TITULARES = new Set(['11144477735']);
describe('ehVendaDoTitular', () => {
  it('entrada + titular no destinatário (com máscara) = venda', () => {
    expect(ehVendaDoTitular({ tipoNota: 'entrada', destinatario: { documento: '111.444.777-35' } }, TITULARES)).toBe(true);
  });
  it('saída comum (a compra do titular) nunca é venda, mesmo com o titular no destinatário', () => {
    expect(ehVendaDoTitular({ tipoNota: 'saida', destinatario: { documento: '11144477735' } }, TITULARES)).toBe(false);
  });
  it('entrada de terceiro sem o titular no destinatário não é venda; destinatário vazio também não', () => {
    expect(ehVendaDoTitular({ tipoNota: 'entrada', destinatario: { documento: '52168923000231' } }, TITULARES)).toBe(false);
    expect(ehVendaDoTitular({ tipoNota: 'entrada', destinatario: { documento: '' } }, new Set(['']))).toBe(false);
  });
  it('a frase manda para a OC, com a data dd/mm/aaaa', () => {
    expect(fraseDaVendaNaOc({ operacaoId: 'x', data: '2026-11-25', valor: 1 })).toContain('25/11/2026');
  });
});
