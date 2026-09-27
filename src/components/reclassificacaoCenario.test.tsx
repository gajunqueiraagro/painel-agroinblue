/**
 * MODAIS-PADRAO-01f — o cenario da evolucao de categoria NASCE DO CAMINHO e nao se escolhe no formulario.
 *
 * ⚠ NASCE DE UM DEFEITO MEDIDO NA TELA (27/09/2026): o estado nascia fixo em 'realizado' e os cards
 *   Realizado/Meta do formulario so' checavam a permissao de consultor. Em "Lancar meta" a evolucao abria em
 *   Realizado e saia gravada assim sem o clique; em "Lancar movimentacao" um consultor gravava meta.
 * ⚠ O PAYLOAD E' A PROVA DE GRAVACAO: mesmo preenchimento, os dois cenarios, e o unico campo que muda e'
 *   `statusOperacional` (null = meta, como sempre foi). Os outros sao comparados um a um.
 * ⚠ E OS CARDS TEM DE TER SUMIDO: o teste procura os dois rotulos e prova que a busca sabe achar — o titulo
 *   "Evolução de Categoria" esta' la'.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook, act, screen } from '@testing-library/react';

vi.mock('@/hooks/useRebanhoOficial', () => ({ useRebanhoOficial: () => ({ rawCategorias: [] }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useReclassificacaoState, ReclassificacaoFormFields } from '@/components/ReclassificacaoForm';
import type { Lancamento } from '@/types/cattle';

async function payloadDe(cenarioInicial?: 'realizado' | 'meta') {
  const recebidos: Omit<Lancamento, 'id'>[] = [];
  const onAdicionar = vi.fn(async (l: Omit<Lancamento, 'id'>) => { recebidos.push(l); return 'novo-id'; });
  const { result } = renderHook(() => useReclassificacaoState({
    onAdicionar, dataInicial: '2026-05-01', autoSugerir: false, cenarioInicial,
  }));
  act(() => { result.current.setQuantidade('10'); result.current.setPesoKg('300'); });
  await act(async () => { await result.current.handleSubmit(); });
  expect(onAdicionar).toHaveBeenCalledTimes(1);
  const payload = recebidos[0];
  if (!payload) throw new Error('onAdicionar nao recebeu payload');
  return { payload, statusOp: result.current.statusOp };
}

describe('evolucao de categoria — cenario pelo caminho', () => {
  it('"Lancar meta" nasce em meta e grava meta (statusOperacional null) sem clique nenhum', async () => {
    const { payload, statusOp } = await payloadDe('meta');
    expect(statusOp).toBe('meta');
    expect(payload.statusOperacional).toBeNull();
  });

  it('"Lancar movimentacao" nasce em realizado e grava realizado', async () => {
    const { payload, statusOp } = await payloadDe('realizado');
    expect(statusOp).toBe('realizado');
    expect(payload.statusOperacional).toBe('realizado');
  });

  it('sem caminho (Fechamento, edicao antes da hidratacao) segue realizado, como antes', async () => {
    const { statusOp } = await payloadDe(undefined);
    expect(statusOp).toBe('realizado');
  });

  it('mesmo preenchimento, os dois cenarios: so\' `statusOperacional` muda', async () => {
    const meta = (await payloadDe('meta')).payload;
    const real = (await payloadDe('realizado')).payload;
    const { statusOperacional: _m, ...restoMeta } = meta;
    const { statusOperacional: _r, ...restoReal } = real;
    expect(restoMeta).toEqual(restoReal);
    expect(restoReal).toEqual({
      data: '2026-05-01', tipo: 'reclassificacao', quantidade: 10, categoria: 'garrotes',
      categoriaDestino: 'bois', pesoMedioKg: 300, pesoMedioArrobas: 10,
    });
  });

  it('o formulario nao oferece mais Realizado/Meta', () => {
    const { result } = renderHook(() => useReclassificacaoState({
      onAdicionar: vi.fn(), dataInicial: '2026-05-01', autoSugerir: false, cenarioInicial: 'meta',
    }));
    render(<ReclassificacaoFormFields state={result.current} />);
    expect(screen.getByText('Evolução de Categoria')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Realizado/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Meta$/ })).toBeNull();
    expect(screen.queryByText('Status da Operação')).toBeNull();
  });
});
