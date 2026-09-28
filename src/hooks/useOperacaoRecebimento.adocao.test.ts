/**
 * OC-VENDA-ENTREGAS-01a — o hook da entrega fala com as tres RPCs novas e manda a data de cada saida.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO E' O DE VARIAS SAIDAS NUM GESTO: cada `oc_adotar_movimentacao` sobe a versao, e a
 *   segunda chamada com a versao do RENDER cairia em 40001. O banco falso recusa versao velha como o de verdade.
 * ⚠ A origem ('adotada'/'registrada'), o valor do lancamento e o contrato do lote chegam da leitura — a tabela depende
 *   dos tres.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

let versaoBanco = 10;
const chamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];

function from(tabela: string) {
  const b: Record<string, unknown> = {};
  b.select = () => b; b.eq = () => b; b.order = () => b;
  b.then = (ok: (v: unknown) => unknown) => {
    const data = tabela === 'vw_oc_lotes_recebimento'
      ? [{ lote_id: 'l7', ordem: 7, categoria_negociada: 'garrotes', qtd_negociada: 11, qtd_recebida: 0, diferenca: 11,
           estado_recebimento: 'nao_iniciado', peso_medio_negociado_kg: 189.82 }]
      : tabela === 'zoo_operacao_lotes'
        ? [{ id: 'l7', criterio_valor: 'kg', valor_informado: 12 }]
        : [{ id: 'm1', operacao_lote_id: 'l1', movimentacao_id: 'ef0a8a40', origem: 'adotada',
             lancamentos: { data: '2025-03-19', categoria: 'desmama_m', quantidade: 178, peso_medio_kg: 248.21, valor_total: 565521.66, cancelado: false } }];
    return Promise.resolve({ data, error: null }).then(ok);
  };
  return b;
}
async function rpc(fn: string, args: Record<string, unknown>) {
  chamadas.push({ fn, args });
  if (fn === 'oc_saidas_adotaveis') {
    return { data: [{ lancamento_id: '81e41593', data: '2025-06-25', categoria: 'garrotes', quantidade: 11,
      peso_medio_kg: 189.82, valor_total: 25056.24, origem_registro: 'importacao_historica', created_at: '2026-04-13T10:00:00Z' }], error: null };
  }
  if (fn === 'oc_adotar_movimentacao' || fn === 'oc_desvincular_movimentacao') {
    if (args.p_versao_esperada !== versaoBanco) {
      return { data: null, error: { code: '40001', message: `Conflito de versao (esperada ${args.p_versao_esperada}, atual ${versaoBanco})` } };
    }
    versaoBanco += 1;
    return { data: { ok: true, versao: versaoBanco }, error: null };
  }
  if (fn === 'oc_receber_lotes') return { data: { versao: versaoBanco + 1, recebidos: 1 }, error: null };
  return { data: null, error: null };
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => from(t), rpc: (f: string, a: Record<string, unknown>) => rpc(f, a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { useOperacaoRecebimento } from '@/hooks/useOperacaoRecebimento';

beforeEach(() => { versaoBanco = 10; chamadas.length = 0; });

function montar(onVersaoChange = vi.fn()) {
  return renderHook(() => useOperacaoRecebimento({
    operacaoId: 'op', clienteId: 'sr', versao: 10, onVersaoChange, enabled: true,
  }));
}

describe('useOperacaoRecebimento — adocao', () => {
  it('le a origem, o valor do lancamento e o contrato do lote', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.movimentacoes.length).toBe(1));
    expect(result.current.movimentacoes[0]).toMatchObject({ origem: 'adotada', lancamentoId: 'ef0a8a40', valorTotal: 565521.66 });
    expect(result.current.lotes[0]).toMatchObject({ criterioValor: 'kg', valorInformado: 12 });
  });

  it('adotar varias saidas encadeia a versao que cada RPC devolveu (sem 40001)', async () => {
    const onVersaoChange = vi.fn();
    const { result } = montar(onVersaoChange);
    await waitFor(() => expect(result.current.lotes.length).toBe(1));
    let erro: string | null = 'x';
    await act(async () => { erro = await result.current.adotar('l7', ['5293daf3', '81e41593']); });
    expect(erro).toBeNull();
    const adocoes = chamadas.filter(c => c.fn === 'oc_adotar_movimentacao');
    expect(adocoes.map(c => [c.args.p_lancamento_id, c.args.p_versao_esperada])).toEqual([['5293daf3', 10], ['81e41593', 11]]);
    expect(onVersaoChange).toHaveBeenLastCalledWith(12);
  });

  it('adotar sem nada selecionado nao chama o banco e devolve a frase', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lotes.length).toBe(1));
    let erro: string | null = null;
    await act(async () => { erro = await result.current.adotar('l7', []); });
    expect(erro).toBe('Selecione ao menos uma saída.');
    expect(chamadas.some(c => c.fn === 'oc_adotar_movimentacao')).toBe(false);
  });

  it('desvincular manda o id do vinculo e a versao; a lista vem da RPC de adotaveis', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lotes.length).toBe(1));
    let erro: string | null = 'x';
    await act(async () => { erro = await result.current.desvincular('m1'); });
    expect(erro).toBeNull();
    expect(chamadas.find(c => c.fn === 'oc_desvincular_movimentacao')?.args).toMatchObject({ p_movimentacao_id: 'm1', p_versao_esperada: 10 });
    let r: Awaited<ReturnType<typeof result.current.listarAdotaveis>> | null = null;
    await act(async () => { r = await result.current.listarAdotaveis('l7'); });
    expect(chamadas.find(c => c.fn === 'oc_saidas_adotaveis')?.args).toEqual({ p_operacao_id: 'op', p_lote_id: 'l7' });
    expect(r!.saidas[0]).toMatchObject({ lancamentoId: '81e41593', valorTotal: 25056.24, origemRegistro: 'importacao_historica' });
  });

  it('"Enviar todos" com datas manda a data de cada item; sem datas (compra), o payload de sempre', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.lotes.length).toBe(1));
    await act(async () => { await result.current.receberTodos({ l7: '2025-06-25' }); });
    await act(async () => { await result.current.receberTodos(); });
    const envios = chamadas.filter(c => c.fn === 'oc_receber_lotes').map(c => c.args.p_recebimentos);
    expect(envios[0]).toEqual([{ lote_id: 'l7', categoria: 'garrotes', quantidade: 11, data: '2025-06-25' }]);
    expect(envios[1]).toEqual([{ lote_id: 'l7', categoria: 'garrotes', quantidade: 11 }]);
  });
});
