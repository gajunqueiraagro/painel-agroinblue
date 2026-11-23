/* FAZ-TEM-PECUARIA-DERIVADA-01 (D2) — o bloqueio das abas zootécnicas é da fazenda ADMINISTRATIVA (coluna própria), nunca de
   "sem pecuária": a fazenda sem gado precisa entrar por essas abas para lançar o 1º gado (o banco então liga `tem_pecuaria`). */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const ctx = vi.hoisted(() => ({ fazendaAtual: null as Record<string, unknown> | null, isGlobal: false }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ctx }));

import { useRedirecionarPecuaria } from './useRedirecionarPecuaria';

const bloqueado = (fazendaAtual: Record<string, unknown> | null, isGlobal = false) => {
  ctx.fazendaAtual = fazendaAtual; ctx.isGlobal = isGlobal;
  return renderHook(() => useRedirecionarPecuaria()).result.current.bloqueado;
};

describe('useRedirecionarPecuaria · FAZ-TEM-PECUARIA-DERIVADA-01', () => {
  it('administrativa bloqueia', () => {
    expect(bloqueado({ id: 'adm', tem_pecuaria: false, eh_administrativa: true })).toBe(true);
  });
  it('sem gado e NÃO administrativa não bloqueia (é por aqui que entra o 1º gado)', () => {
    expect(bloqueado({ id: 'cana', tem_pecuaria: false, eh_administrativa: false })).toBe(false);
  });
  it('com pecuária não bloqueia; Global não bloqueia', () => {
    expect(bloqueado({ id: 'pur', tem_pecuaria: true, eh_administrativa: false })).toBe(false);
    expect(bloqueado({ id: '__global__', eh_administrativa: true }, true)).toBe(false);
  });
});
