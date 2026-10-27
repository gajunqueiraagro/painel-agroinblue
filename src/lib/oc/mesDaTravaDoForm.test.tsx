/**
 * P53b — a trava master do formulário só pergunta o mês depois que a OC chegou. Medido no P53 (23/10): abrir uma OC pedia a trava de
 * 10/2026 (o "hoje" do formulário antes de hidratar) e de 09/2026 (o mês da OC). Agora só o da OC.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { mesDaTravaDoForm } from './mesDaTravaDoForm';

const meses = vi.hoisted(() => [] as string[]);
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (t: string): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.select = () => c; c.or = () => c; c.limit = () => c;
    c.eq = (col: string, v: string) => { if (col === 'ano_mes') meses.push(`${t}:${v}`); return c; };
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  return { supabase: { from: (t: string) => cadeia(t) } };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', config: {} } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz-1' } }) }));
import { useMasterLock } from '@/hooks/useMasterLock';

describe('mesDaTravaDoForm — a regra', () => {
  it('sem OC na URL: o mês do formulário, como sempre', () => {
    expect(mesDaTravaDoForm('2026-10', { idNaUrl: null, hidratando: false, idHidratado: null })).toBe('2026-10');
    expect(mesDaTravaDoForm(undefined, { idNaUrl: null, hidratando: false, idHidratado: null })).toBeUndefined();
  });
  it('OC na URL ainda não hidratada, ou em voo: nenhum mês (a data do formulário ainda é "hoje")', () => {
    expect(mesDaTravaDoForm('2026-10', { idNaUrl: 'oc1', hidratando: false, idHidratado: null })).toBeUndefined();
    expect(mesDaTravaDoForm('2026-10', { idNaUrl: 'oc1', hidratando: true, idHidratado: 'oc1' })).toBeUndefined();
    /* outra OC aberta na mesma montagem: até a segunda chegar, a data é a da primeira */
    expect(mesDaTravaDoForm('2026-08', { idNaUrl: 'oc2', hidratando: false, idHidratado: 'oc1' })).toBeUndefined();
  });
  it('hidratada (ou falhada e solta): o mês do formulário, que já é o da OC', () => {
    expect(mesDaTravaDoForm('2026-09', { idNaUrl: 'oc1', hidratando: false, idHidratado: 'oc1' })).toBe('2026-09');
  });
});

describe('a abertura da OC pede a trava de UM mês só', () => {
  it('render 1 ("hoje", antes do efeito) → hidratando → hidratada com a data da OC: só 09/2026 vai ao banco', async () => {
    meses.length = 0;
    type P = { mes: string; hidratando: boolean; idHidratado: string | null };
    const h = renderHook((p: P) => useMasterLock(mesDaTravaDoForm(p.mes, { idNaUrl: 'oc1', hidratando: p.hidratando, idHidratado: p.idHidratado })),
      { initialProps: { mes: '2026-10', hidratando: false, idHidratado: null } });
    h.rerender({ mes: '2026-10', hidratando: true, idHidratado: 'oc1' });
    h.rerender({ mes: '2026-09', hidratando: false, idHidratado: 'oc1' });
    await waitFor(() => expect(meses.length).toBe(2));
    await new Promise((r) => setTimeout(r, 20));
    expect([...meses].sort()).toEqual(['fechamento_pastos:2026-09', 'valor_rebanho_mensal:2026-09']);
  });
});

describe('a ligação no LancamentosTab (lida da fonte: a tela inteira não monta em teste)', () => {
  it('a trava do formulário passa pela regra, com a OC da URL e o estado da hidratação', async () => {
    const { readFileSync } = await import('node:fs');
    const fonte = readFileSync('src/pages/LancamentosTab.tsx', 'utf8');
    expect(fonte).toContain('const travaMasterDoForm = useMasterLock(mesDaTravaDoForm(formAnoMes,\n    { idNaUrl: ocIdParam, hidratando: ocHidratando, idHidratado: ocHidratadoRef.current }));');
    expect(fonte).not.toContain('useMasterLock(formAnoMes)');
  });
});
