/**
 * MAPA-LOTES-01 fatia 1 (A) — o modal do pasto do P1 tem UM jeito de abrir (`useModalDoPasto`): o Fechamento, o Mapa de pastos e o Geo
 * pastos montam o MESMO `FechamentoPastoDialog`, com o contexto do lote; sem card no mês, cria pelo mesmo caminho;
 * fechar relê quem abriu (sem F5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

const recebido = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/components/FechamentoPastoDialog', () => ({
  FechamentoPastoDialog: (p: Record<string, unknown>) => { recebido.props = p; return null; },
}));

import { useModalDoPasto, type EntradaDoModalDoPasto } from './useModalDoPasto';

const PASTO = { id: 'p1', fazenda_id: 'f', nome: 'P13', area_produtiva_ha: 40, tipo_uso: 'cria', ativo: true, grupo_id: null };
const CARD = { id: 'fp1', pasto_id: 'p1', fazenda_id: 'f', ano_mes: '2026-10', status: 'aberto', lote_mes: null, tipo_uso_mes: 'cria', qualidade_mes: null, observacao_mes: null };
const CONTEXTO = { proprio: { id: 'p1', nome: 'P13', grupo_id: null, area: 38 }, nomeDoGrupo: null, membros: [], outrosPastos: [], impedidos: new Map(), gravada: null };

function entrada(mais: Partial<EntradaDoModalDoPasto> = {}): EntradaDoModalDoPasto {
  return {
    anoMes: '2026-10',
    fechamentos: [CARD as never],
    categorias: [],
    lote: { contextoDoLote: vi.fn(() => CONTEXTO as never), areaDe: (id: string, mes: string) => (id === 'p1' && mes === '2026-10' ? 38 : undefined) },
    acoes: { criarFechamento: vi.fn(async () => ({ ...CARD, id: 'novo' })), fecharPasto: vi.fn(), copiarMesAnterior: vi.fn() } as never,
    aoFechar: vi.fn(),
    ...mais,
  };
}
const montar = (modal: ReactNode) => render(<>{modal}</>);

beforeEach(() => { recebido.props = null; });

describe('useModalDoPasto: o mesmo modal, as mesmas props', () => {
  it('pasto COM card: abre o card que existe (sem criar), com o contexto do lote e a área DO MÊS', async () => {
    const e = entrada();
    const { result, rerender } = renderHook(() => useModalDoPasto(e));
    await act(async () => { await result.current.abrir(PASTO as never); });
    rerender();
    montar(result.current.modal);
    const p = recebido.props!;
    expect(e.acoes.criarFechamento).not.toHaveBeenCalled();
    expect((p.fechamento as { id: string }).id).toBe('fp1');
    expect((p.pasto as { area_produtiva_ha: number }).area_produtiva_ha).toBe(38);
    expect(p.lote).toBe(CONTEXTO);
    expect(e.lote.contextoDoLote).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'fp1');
    expect(p.onSave).toBeUndefined();
  });

  it('pasto SEM card: cria pelo mesmo `criarFechamento` do Fechamento (pasto, mês); sem card criado, nada abre', async () => {
    const e = entrada({ fechamentos: [] });
    const { result, rerender } = renderHook(() => useModalDoPasto(e));
    await act(async () => { await result.current.abrir(PASTO as never); });
    rerender();
    expect(e.acoes.criarFechamento).toHaveBeenCalledWith('p1', '2026-10');
    montar(result.current.modal);
    expect((recebido.props!.fechamento as { id: string }).id).toBe('novo');

    recebido.props = null;
    const e2 = entrada({ fechamentos: [], acoes: { criarFechamento: vi.fn(async () => null), fecharPasto: vi.fn(), copiarMesAnterior: vi.fn() } as never });
    const h2 = renderHook(() => useModalDoPasto(e2));
    await act(async () => { await h2.result.current.abrir(PASTO as never); });
    h2.rerender();
    expect(h2.result.current.modal).toBeNull();
  });

  it('fechar o modal relê quem abriu (aoFechar) e o modal some', async () => {
    const e = entrada();
    const { result, rerender } = renderHook(() => useModalDoPasto(e));
    await act(async () => { await result.current.abrir(PASTO as never); });
    rerender();
    montar(result.current.modal);
    act(() => { (recebido.props!.onOpenChange as (o: boolean) => void)(false); });
    rerender();
    expect(e.aoFechar).toHaveBeenCalledTimes(1);
    expect(result.current.modal).toBeNull();
    expect(result.current.aberto).toBeNull();
  });

  it('LOTES-03: o modal recebe o código da fazenda DO CARD (o assistente do lote escreve "na PUR"); sem a função, vazio', async () => {
    const e = entrada({ rotuloDaFazenda: (id: string) => (id === 'f' ? 'PUR' : 'OUTRA') });
    const { result, rerender } = renderHook(() => useModalDoPasto(e));
    await act(async () => { await result.current.abrir(PASTO as never); });
    rerender();
    montar(result.current.modal);
    expect(recebido.props!.fazendaRotulo).toBe('PUR');

    const sem = entrada();
    const h = renderHook(() => useModalDoPasto(sem));
    await act(async () => { await h.result.current.abrir(PASTO as never); });
    h.rerender();
    montar(h.result.current.modal);
    expect(recebido.props!.fazendaRotulo).toBe('');
  });
});

/* ── a trava: UM lugar monta o modal; as três telas o abrem pelo gancho ─────────────────────────────────────────────────────────── */
function arquivosDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? arquivosDe(join(dir, d.name)) : [join(dir, d.name)]));
}
const quemMonta = (arquivos: readonly string[], ler: (a: string) => string) =>
  arquivos.filter(a => /\.tsx?$/.test(a) && !/\.test\.tsx?$/.test(a) && ler(a).includes('<FechamentoPastoDialog'));

describe('um modal só', () => {
  it('fora dos testes, só o `useModalDoPasto` monta o `FechamentoPastoDialog`; Fechamento, Mapa de pastos e Geo pastos usam o gancho', () => {
    const ler = (a: string) => readFileSync(a, 'utf8');
    const montam = quemMonta(arquivosDe('src'), ler);
    expect(montam).toEqual([join('src', 'hooks', 'useModalDoPasto.tsx')]);
    for (const tela of ['src/pages/FechamentoTab.tsx', 'src/pages/MapaPastosTab.tsx', 'src/pages/MapaGeoPastosTab.tsx']) {
      expect(ler(tela)).toMatch(/useModalDoPasto\(\{/);
      expect(ler(tela)).not.toContain("from '@/components/FechamentoPastoDialog'");
    }
    /* auto-teste do detector: acha uma tela que montasse o modal por conta própria */
    const falsa = { 'src/pages/Outra.tsx': '<FechamentoPastoDialog open />', 'src/pages/Outra.test.tsx': '<FechamentoPastoDialog />' };
    expect(quemMonta(Object.keys(falsa), a => falsa[a as keyof typeof falsa])).toEqual(['src/pages/Outra.tsx']);
  });
});
