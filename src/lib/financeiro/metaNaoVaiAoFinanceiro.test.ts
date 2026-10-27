/**
 * P120 — Meta nunca vai ao financeiro: a trava na entrada dos QUATRO geradores do rebanho (abate, compra pelo painel e pela função,
 * venda). Banco MOCKADO; dados SINTÉTICOS. A trava do banco (gatilho) tem o teste dela em supabase/tests/p120_meta_nao_vai_test.sql.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const chamadas = vi.hoisted(() => ({ from: [] as string[], info: [] as string[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => { chamadas.from.push(t); throw new Error(`não devia consultar ${t}`); } },
}));
vi.mock('sonner', () => ({ toast: { info: (m: string) => chamadas.info.push(m), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { FRASE_META_NAO_VAI_AO_FINANCEIRO, ehCenarioMeta } from './metaNaoVaiAoFinanceiro';
import { gerarFinanceiroCompra } from '@/components/compra/gerarFinanceiroCompra';

beforeEach(() => { chamadas.from.length = 0; chamadas.info.length = 0; });

describe('P120 — meta não vai ao financeiro', () => {
  it('só "meta" é META', () => {
    expect(ehCenarioMeta('meta')).toBe(true);
    for (const s of ['realizado', 'programado', 'previsto', 'agendado', null, undefined, '']) expect(ehCenarioMeta(s)).toBe(false);
  });

  it('a compra META não consulta nem grava nada e diz por quê', async () => {
    const ok = await gerarFinanceiroCompra({
      compraDetalhes: { tipoPreco: 'valor_total', valorTotal: 300000 }, lancamentoId: 'mov-1', clienteId: 'cli', fazendaId: 'faz',
      quantidade: 100, pesoKg: 200, data: '2026-11-01', categoria: 'desmama_m', statusOp: 'meta', fazendaOrigem: '', fornecedorId: null,
    } as unknown as Parameters<typeof gerarFinanceiroCompra>[0]);
    expect(ok).toBe(false);
    expect(chamadas.from).toEqual([]);
    expect(chamadas.info).toEqual([FRASE_META_NAO_VAI_AO_FINANCEIRO]);
  });

  /* Os três painéis são componentes grandes com dezenas de dependências; o contrato é estrutural: a trava vem ANTES de qualquer
     gravação em financeiro_lancamentos_v2 dentro do gerador. */
  it.each([
    ['src/components/AbateFinanceiroPanel.tsx', 'const handleGerarFinanceiroInternal = async', 'statusOperacional'],
    ['src/components/VendaFinanceiroPanel.tsx', 'const handleGerarFinanceiroInternal = async', 'statusOp'],
    ['src/components/CompraFinanceiroPanel.tsx', 'const handleGerarFinanceiro = useCallback(async', 'statusOp'],
  ])('%s: a trava é a primeira coisa do gerador', (arq, inicio, campo) => {
    const fonte = readFileSync(path.resolve(__dirname, '../../..', arq), 'utf8');
    const i = fonte.indexOf(inicio);
    expect(i).toBeGreaterThan(-1);
    const trava = fonte.indexOf(`if (ehCenarioMeta(${campo})) { toast.info(FRASE_META_NAO_VAI_AO_FINANCEIRO); return false; }`, i);
    const primeiraGravacao = fonte.indexOf(".from('financeiro_lancamentos_v2')", i);
    expect(trava).toBeGreaterThan(i);
    expect(trava).toBeLessThan(primeiraGravacao);
    expect(fonte.slice(i, trava).split('\n').length).toBeLessThanOrEqual(3);
  });
});
