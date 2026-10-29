/**
 * P153 — o "Criar igual" da Conferência: o `CasarComBancoModal` aberto VAZIO com o modelo abre o Criar de hoje sozinho, com o modelo
 * (o lançamento novo entra nos levados e o Conciliar é o de sempre). Sem modelo, o Criar só abre pelo botão.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({ criar: [] as { modelo?: unknown; semVinculo?: boolean }[] }));
vi.mock('sonner', () => ({ toast: { error: () => {}, success: () => {} } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: () => Promise.resolve({ data: null, error: null }) } }));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({
  CriarLancamentoDaLinha: (p: { modelo?: unknown; semVinculo?: boolean }) => { M.criar.push(p); return null; },
}));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));

import { CasarComBancoModal } from './CasarComBancoModal';

const EXTRATO = { extrato_id: 'e1', data: '2026-10-05', historico: 'PAGAMENTO DE BOLETO - ZEBRALUX SINT', valor: -1382 };
const MODELO = { favorecido_id: 'f1', subcentro: 'Nutrição', fazenda_id: 'fz1', descricao: 'Ração de engorda' };

beforeEach(() => { M.criar = []; });

describe('CasarComBancoModal com o modelo do histórico', () => {
  it('abre o Criar sozinho, com o modelo e sem vínculo (o grupo vincula depois)', async () => {
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXTRATO} iniciais={[]} contaBancariaId="bb" onConciliado={() => {}} modelo={MODELO} />);
    await waitFor(() => expect(M.criar.length).toBeGreaterThan(0));
    expect(M.criar[M.criar.length - 1]).toMatchObject({ modelo: MODELO, semVinculo: true });
  });
  it('sem modelo, o Criar não abre sozinho', async () => {
    render(<CasarComBancoModal open onClose={() => {}} extrato={EXTRATO} iniciais={[]} contaBancariaId="bb" onConciliado={() => {}} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(M.criar).toHaveLength(0);
  });
});
