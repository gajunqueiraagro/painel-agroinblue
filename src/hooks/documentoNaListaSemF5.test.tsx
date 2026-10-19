/**
 * FIN-FILTRO-DOC-01 (acréscimo 1) — gravou um documento, a lista do Financeiro V2 mostra o número na coluna DOC. e o clipe SEM F5.
 * Os dois escritores avisam o canal ÚNICO de lançamentos (`notificarLancamentosMudaram`) e a leitura dos documentos da lista
 * (`useDocumentosDoCliente`) relê por ele. A linha de teste monta o hook de verdade e escreve o que o dono `docDaLinha` diz.
 * Banco de mentira, dados sintéticos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const banco = vi.hoisted(() => ({ vista: [] as Record<string, unknown>[], leiturasDaLista: 0, seq: 0 }));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'order', 'range', 'limit', 'in']) c[m] = () => c;
    c.maybeSingle = () => Promise.resolve({ data: null, error: null });
    c.then = (ok: (r: unknown) => unknown) => {
      if (tabela === 'vw_lancamento_documentos') { banco.leiturasDaLista += 1; return Promise.resolve({ data: [...banco.vista], error: null }).then(ok); }
      return Promise.resolve({ data: [], error: null }).then(ok);
    };
    return c;
  };
  const rpc = async (fn: string, a: Record<string, unknown>) => {
    if (fn === 'fin_documento_registrar') {
      const p = (a.p_payload ?? {}) as Record<string, unknown>;
      const id = `doc-${++banco.seq}`;
      banco.vista.push({ documento_id: id, lancamento_id: a.p_lancamento_id, especie: p.especie, numero: p.numero ?? null, cancelado: false, chave_acesso: null });
      return { data: { documento_id: id, confronto: null }, error: null };
    }
    return { data: null, error: null };
  };
  return { supabase: { from: (t: string) => cadeia(t), rpc } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1', nome: 'Teste' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));

import { useDocumentosDoCliente } from './useDocumentosDoCliente';
import { useLancamentoDocumentos } from './useLancamentoDocumentos';
import { gravarDocumentosPendentes, novoPendente } from '@/lib/financeiro/documentosPendentes';
import { docDaLinha } from '@/lib/financeiro/documentoHelper';

const CLI = 'cli-1';
const L = 'lanc-1';

function Linha() {
  const { data } = useDocumentosDoCliente(CLI);
  const d = docDaLinha({ tipo_documento: null, numero_documento: null }, data?.get(L));
  return <div><span data-testid="doc">{d.rotulo ?? ''}</span><span data-testid="clipe">{d.clipe ? 'clipe' : ''}</span></div>;
}
const comCliente = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(() => { banco.vista = []; banco.leiturasDaLista = 0; banco.seq = 0; });

describe('documento gravado aparece na lista sem recarregar', () => {
  it('salvar pelo XML (os pendentes): a linha mostra o número da NF e o clipe', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Linha />, { wrapper: comCliente(qc) });
    await waitFor(() => expect(banco.leiturasDaLista).toBe(1));
    expect(screen.getByTestId('doc').textContent).toBe('');
    expect(screen.getByTestId('clipe').textContent).toBe('');
    await act(async () => { await gravarDocumentosPendentes(CLI, L, [novoPendente({ especie: 'nf', numero: '000.013.910' }, null)]); });
    await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('NF 000.013.910'));
    expect(screen.getByTestId('clipe').textContent).toBe('clipe');
    expect(banco.leiturasDaLista).toBe(2);   /* UMA releitura, pelo canal */
  });
  it('registrar documento na aba Documentos: a coluna DOC. atualiza', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Linha />, { wrapper: comCliente(qc) });
    await waitFor(() => expect(banco.leiturasDaLista).toBe(1));
    const aba = renderHook(() => useLancamentoDocumentos(L, CLI));
    await waitFor(() => expect(aba.result.current.loading).toBe(false));
    await act(async () => { await aba.result.current.registrar({ especie: 'recibo', numero: '55' }); });
    await waitFor(() => expect(screen.getByTestId('doc').textContent).toBe('Rec. 55'));
    expect(screen.getByTestId('clipe').textContent).toBe('clipe');
  });
  it('os dois escritores avisam o canal (lido da fonte, com contagem)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const hook = readFileSync(resolve(__dirname, 'useLancamentoDocumentos.ts'), 'utf8');
    expect(hook.match(/if \(clienteId\) notificarLancamentosMudaram\(clienteId\);/g) ?? []).toHaveLength(4);
    const pend = readFileSync(resolve(__dirname, '../lib/financeiro/documentosPendentes.ts'), 'utf8');
    expect(pend.match(/avisarSeGravou\(clienteId, pendentes, saida\);/g) ?? []).toHaveLength(2);
  });
});
