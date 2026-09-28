/**
 * OC-VENDA-ENTREGAS-01d (A2) — depois de um ajuste de preco (ou do desfazer dele) os LOTES da tela sao relidos.
 *
 * ⚠ NASCE DA HOMOLOGACAO DA 232c05aa: o ajuste do lote 7 (R$/kg 12,00 -> total 23.698,35) revalorou o lote e o banco ficou certo
 *   (`valor_acordado` 2.365.243,37 = soma dos lotes), mas o resumo lateral soma `lotesApi.totais` — o estado da tela — e seguia
 *   em 2.366.601,26, o lote de antes. O hook da conta corrente nao avisava ninguem que os lotes tinham mudado.
 * ⚠ O CASO DA RECUSA IMPORTA: numa explicacao em varios itens, os anteriores JA' gravaram (inclusive um ajuste). Reler so' no
 *   sucesso deixaria a tela no lote velho exatamente quando o operador vai tentar de novo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let recusarSegundo = false;
let explicacoes = 0;
async function rpc(fn: string) {
  if (fn === 'oc_conta_corrente') return { data: { modelo: 'conta_corrente', versao: 41, linhas: [], explicacoes: [] }, error: null };
  if (fn === 'oc_explicar_saldo') {
    explicacoes += 1;
    if (recusarSegundo && explicacoes === 2) return { data: null, error: { code: 'P0001', message: 'Informe o motivo da explicacao' } };
    return { data: { operacao_versao: 41 + explicacoes }, error: null };
  }
  if (fn === 'oc_desfazer_explicacao') return { data: { operacao_versao: 50 }, error: null };
  return { data: null, error: null };
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (f: string) => rpc(f), from: () => ({}) } }));

import { useOcContaCorrente, type ExplicacaoRascunho } from '@/hooks/useOcContaCorrente';

const AJUSTE: ExplicacaoRascunho = { tipo: 'ajuste_preco', valor: 1357.89, loteId: 'lote7', planoContaId: null, motivo: 'Ajuste casa decimal', vencimento: null };

function montar(aoMudarLotes: () => Promise<void>) {
  return renderHook(() => useOcContaCorrente({ operacaoId: 'oc', enabled: true, versao: 41, onVersaoChange: vi.fn(), aoMudarLotes }));
}

describe('conta corrente relê os lotes depois de revalorar', () => {
  beforeEach(() => { recusarSegundo = false; explicacoes = 0; });

  it('explicar com ajuste de preco relê os lotes (uma vez, no fim da cadeia)', async () => {
    const aoMudarLotes = vi.fn(async () => {});
    const { result } = montar(aoMudarLotes);
    await waitFor(() => expect(result.current.contaCorrente).not.toBeNull());
    await act(async () => { expect(await result.current.explicarSaldo([AJUSTE])).toBeNull(); });
    expect(aoMudarLotes).toHaveBeenCalledTimes(1);
  });

  it('desfazer uma explicacao tambem relê os lotes', async () => {
    const aoMudarLotes = vi.fn(async () => {});
    const { result } = montar(aoMudarLotes);
    await waitFor(() => expect(result.current.contaCorrente).not.toBeNull());
    await act(async () => { expect(await result.current.desfazerExplicacao('parte1', 'lancei errado')).toBeNull(); });
    expect(aoMudarLotes).toHaveBeenCalledTimes(1);
  });

  it('recusa no meio da cadeia: o primeiro item ja gravou, entao relê mesmo com erro', async () => {
    recusarSegundo = true;
    const aoMudarLotes = vi.fn(async () => {});
    const { result } = montar(aoMudarLotes);
    await waitFor(() => expect(result.current.contaCorrente).not.toBeNull());
    await act(async () => {
      expect(await result.current.explicarSaldo([AJUSTE, { ...AJUSTE, motivo: 'segundo' }])).toContain('motivo');
    });
    expect(aoMudarLotes).toHaveBeenCalledTimes(1);
  });

  it('o shell da venda passa a releitura dos lotes (lido da fonte: o shell nao se monta em teste)', () => {
    const fonte = readFileSync(resolve(__dirname, '../components/venda/VendaModalShell.tsx'), 'utf8');
    expect(fonte).toContain('aoMudarLotes: lotesApi?.recarregar');
    /* e o "Valor acordado" do resumo sai dos totais dos lotes — o estado que passa a ser relido */
    expect(fonte).toContain('lotesApi.totais.valorNegociado');
  });
});
