/**
 * NOTA-ITENS-CLASSIF-01 (Gabriel 24/11 16:3x) — nota ligada com itens = a aba "Itens da nota" aparece, qualquer que seja a origem e a forma
 * como o documento guardou a chave. O lançamento da Vera tinha a chave em grupos ("5026 0921 …") e o hook a descartava antes de ler.
 * Chaves SINTÉTICAS.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const lidas = vi.hoisted(() => ({ chaves: [] as string[][] }));
vi.mock('@/lib/financeiro/itensDaNotaBanco', () => ({
  lerItensGuardados: async (_c: string, chaves: readonly string[]) => {
    lidas.chaves.push([...chaves]);
    return { cabecalho: { chave: chaves[0] }, lidos: { itens: [{ nItem: 1 }] } };
  },
  chavesGuardadas: async () => new Set<string>(),
  notaComItensDoArquivo: async () => null,
}));
import { useItensDaNota } from './useItensDaNota';

const K = '5'.repeat(44);
const EM_GRUPOS = Array.from({ length: 11 }, () => '5555').join(' ');

describe('useItensDaNota', () => {
  it('a chave em grupos do documento acha os itens (a aba aparece)', async () => {
    lidas.chaves = [];
    const { result } = renderHook(() => useItensDaNota({ clienteId: 'cli', chaves: [EM_GRUPOS], arquivo: null }));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(lidas.chaves).toEqual([[K]]);
  });
  it('a mesma nota em grupos e em dígitos (PDF + XML) é UMA chave; o que não é chave não pergunta nada', async () => {
    lidas.chaves = [];
    const { result } = renderHook(() => useItensDaNota({ clienteId: 'cli', chaves: [EM_GRUPOS, K, '123'], arquivo: null }));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(lidas.chaves).toEqual([[K]]);
    lidas.chaves = [];
    const vazio = renderHook(() => useItensDaNota({ clienteId: 'cli', chaves: ['123', ''], arquivo: null }));
    await waitFor(() => expect(vazio.result.current).toBeNull());
    expect(lidas.chaves).toEqual([]);
  });
});
