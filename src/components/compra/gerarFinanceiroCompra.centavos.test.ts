/**
 * VG-CENTAVO D1a (Gabriel 31/10 07:42) — a compra do rebanho grava em CENTAVOS: o valor por kg × peso, o frete e a comissão (um %)
 * são contas e davam fração (FASE 0: compra_rebanho:parcela com fração em 04/05/2026). O banco é falso; dados SINTÉTICOS.
 *   R1 à vista: base por kg (12 cab × 301,333 kg × R$ 10,33/kg), frete 99,995 e comissão de 1,5% vão ao insert em 2 casas
 */
import { describe, it, expect, vi } from 'vitest';

const inseridos = vi.hoisted(() => ({ linhas: [] as { valor: number; origem_tipo: string }[] }));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (resultado: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'limit']) c[m] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve(resultado).then(ok);
    return c;
  };
  const PLANO = [
    { id: 'p1', macro_custo: 'Investimento', grupo_custo: 'Reposição', centro_custo: 'Bovinos', subcentro: 'Investimento Compra Bovinos Machos' },
    { id: 'p2', macro_custo: 'Investimento', grupo_custo: 'Reposição', centro_custo: 'Bovinos', subcentro: 'Investimento Frete/Comissão Compra Bovinos' },
  ];
  return {
    supabase: {
      from: (t: string) => ({
        select: () => (t === 'financeiro_plano_contas' ? cadeia({ data: PLANO }) : cadeia({ data: [] })),
        insert: (linhas: { valor: number; origem_tipo: string }[]) => { inseridos.linhas = linhas; return Promise.resolve({ error: null }); },
      }),
    },
  };
});
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/financeiro/metaPlanejamentoMirror', () => ({ mirrorMetaToPlanejamento: vi.fn() }));

import { gerarFinanceiroCompra } from './gerarFinanceiroCompra';
import { EMPTY_COMPRA_DETALHES } from './CompraDetalhesDialog';

describe('compra do rebanho · valores em centavos', () => {
  it('R1 base, frete e comissão vão ao banco com 2 casas', async () => {
    await gerarFinanceiroCompra({
      compraDetalhes: { ...EMPTY_COMPRA_DETALHES, tipoPreco: 'por_kg', precoKg: '10.33', frete: '99.995', comissaoPct: '1.5' },
      lancamentoId: 'mov-1', clienteId: 'cli', fazendaId: 'faz', quantidade: 12, pesoKg: 301.333, data: '2026-10-15',
      categoria: 'bois', statusOp: 'realizado', fazendaOrigem: '', fornecedorId: 'f1',
    });
    const v = Object.fromEntries(inseridos.linhas.map((l) => [l.origem_tipo, l.valor]));
    /* 12 × 301,333 × 10,33 = 37.353,23868 · frete 99,995 · comissão 1,5% = 560,2985802 */
    expect(v).toEqual({ 'compra_rebanho:parcela': 37353.24, 'compra_rebanho:frete': 100, 'compra_rebanho:comissao': 560.3 });
    for (const l of inseridos.linhas) expect(Math.round(l.valor * 100) / 100).toBe(l.valor);
  });
});
