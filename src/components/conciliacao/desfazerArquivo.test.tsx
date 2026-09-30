/**
 * PR-CONC-DESFAZER-ARQUIVO-01 — o Desfazer do "Ver importações" abre o `DesfazerArquivoModal` (RPC
 * `fn_extrato_desfazer_arquivo`) para QUALQUER arquivo ativo, com ou sem vínculo.
 *
 * ⚠ O CASO DO NJ: o Banco do Brasil de set/26 tem 3 OFX com crus e vínculos manuais, e o botão ficava
 *   cinza ("desfaça os vínculos primeiro") porque o desfazer era um UPDATE direto que não sabia desfazer
 *   vínculo. Aqui o arquivo A tem 8 vínculos e o B nenhum: os dois abrem o modal.
 * ⚠ O RISCO A: "Cancelar" e o X não zeravam motivo e confirmação. A → "Desfazer arquivo" → Cancelar → B
 *   abria B já em "Confirmar", com o motivo de A — um clique desfazia o arquivo errado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImportacoesDialog } from '@/components/conciliacao/ImportacoesDialog';
import type { ImportacaoDaConta } from '@/hooks/useExtratoDaConta';

const chamadas = vi.hoisted(() => ({ rpc: [] as Array<{ fn: string; args: Record<string, unknown> }> }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      chamadas.rpc.push({ fn, args });
      return Promise.resolve({
        data: {
          ok: true, arquivo: `arquivo-${String(args.p_importacao_id)}.ofx`, meses: '2026-09', extratos: 70,
          sem_par: 0, crus_cancelados: 69, crus_enriquecidos: 0, substituidos_restaurados: 0,
          substituidos_com_audit: 0, vinculos_manuais_desfeitos: 8,
        },
        error: null,
      });
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const imp = (id: string, nome: string, comVinculo: number): ImportacaoDaConta => ({
  id, nomeArquivo: nome, data: '2026-09-30', importados: 70, comVinculo, crus: comVinculo > 0 ? 62 : 0,
  substituidos: 0, desfeitaEm: null, meses: ['2026-09'], canceladaNoRegistro: false,
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const aoDesfeito = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ImportacoesDialog
        aberto aoFechar={() => {}} contaNome="Banco do Brasil" anoMes="2026-09" carregando={false}
        importacoes={[imp('imp-a', 'bb_set_a.ofx', 8), imp('imp-b', 'bb_set_b.ofx', 0)]}
        aoDesfeito={aoDesfeito}
      />
    </QueryClientProvider>,
  );
  return { aoDesfeito };
}

const botoesDesfazer = () => screen.getAllByRole('button', { name: 'Desfazer' });

beforeEach(() => { chamadas.rpc = []; });

describe('ImportacoesDialog — o Desfazer abre o modal da RPC', () => {
  it('arquivo COM vínculo: o botão fica habilitado e abre o modal com a simulação', async () => {
    montar();
    const [botaoA] = botoesDesfazer();
    expect(botaoA).not.toBeDisabled();
    fireEvent.click(botaoA);
    await screen.findByText(/vínculos manuais serão desfeitos/);
    expect(chamadas.rpc).toEqual([{
      fn: 'fn_extrato_desfazer_arquivo',
      args: { p_importacao_id: 'imp-a', p_motivo: 'simulacao', p_simular: true },
    }]);
    expect(screen.getByText(/8 vínculos manuais serão desfeitos — o lançamento fica como você deixou \(valor\/status editados não voltam\)/))
      .toBeInTheDocument();
  });

  it('o rodapé diz o alcance novo, e não "em construção"', () => {
    montar();
    expect(screen.queryByText(/em construção/)).toBeNull();
    expect(screen.getByText(/O lançamento\s+que você casou à mão fica como está/)).toBeInTheDocument();
  });

  it('risco A: A → "Desfazer arquivo" → Cancelar → B volta a "Desfazer arquivo" com motivo vazio', async () => {
    montar();
    fireEvent.click(botoesDesfazer()[0]);
    const motivoA = await screen.findByLabelText('Motivo (obrigatório)');
    fireEvent.change(motivoA, { target: { value: 'arquivo importado errado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer arquivo' }));
    expect(screen.getByRole('button', { name: /Confirmar — não dá para desfazer o desfazer/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByLabelText('Motivo (obrigatório)')).toBeNull());

    fireEvent.click(botoesDesfazer()[1]);
    const motivoB = await screen.findByLabelText('Motivo (obrigatório)');
    await screen.findByText('arquivo-imp-b.ofx');
    expect(motivoB).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Desfazer arquivo' })).toBeInTheDocument();
  });
});
