/** FIN-CLASSIF-DIVIDIDA-01b — a sugestao aprendida da conta de cada item (o produto -> a conta da ultima vez). */
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
import { aprender, chaveDoProduto, sugerir } from './sugestaoDeContaDosItens';

describe('sugestao aprendida', () => {
  it('a chave do produto: o codigo; sem codigo, a descricao sem caixa/acento/espacos repetidos', () => {
    expect(chaveDoProduto({ codigo: ' 7891 ', descricao: 'X' })).toBe('c:7891');
    expect(chaveDoProduto({ codigo: null, descricao: '  Cabeçote  ALUMÍNIO ' })).toBe('d:cabecote aluminio');
  });
  it('aprende a conta da vez MAIS RECENTE e so sugere conta valida', () => {
    const a = aprender([
      { chave: 'c:1', planoContaId: 'man', quando: '2026-09-01' }, { chave: 'c:1', planoContaId: 'inv', quando: '2026-10-01' },
      { chave: 'c:2', planoContaId: 'velha', quando: '2026-10-02' },
    ]);
    const s = sugerir([{ nItem: 1, codigo: '1', descricao: 'a' }, { nItem: 2, codigo: '2', descricao: 'b' }, { nItem: 3, codigo: '3', descricao: 'c' }],
      a, (p) => p !== 'velha');
    expect([...s]).toEqual([[1, 'inv']]);
  });
});
