/**
 * CONC-SEM-F5-01 — A CONCILIAÇÃO RELÊ SOZINHA: F5 NUNCA É NECESSÁRIO.
 *  (1) o canal de lançamentos invalida o RESUMO e a RÉGUA do cliente — e vence o `servirDoCache` (staleTime de 60 s);
 *  (2) voltar à vista (entrar na seção, trocar para a aba interna "Conciliação", foco/visibilidade da janela) relê o dono:
 *      UMA chamada do resumo e UMA da régua por retorno, sem esvaziar o que está na tela;
 *  (3) os gestos que gravam com a Conciliação montada avisam o canal no ponto de sucesso — os hooks que se montam em teste
 *      são exercitados; os que não se montam (o `useFinanceiroV2`, o importador, a aba) são lidos da FONTE.
 * O caso do Gabriel de ponta a ponta (gesto da Conferência -> resumo E régua) está em `conferenciaModal.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const banco = vi.hoisted(() => ({
  chamadas: [] as string[],
  resposta: {} as Record<string, unknown>,
  /** quando ligado, as leituras do dono ficam pendentes até `soltar()` — para olhar a tela DURANTE a releitura */
  segurar: false, pendentes: [] as Array<() => void>,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string) => {
      banco.chamadas.push(fn);
      const r = { data: banco.resposta[fn] ?? null, error: null };
      if (banco.segurar && fn.startsWith('fn_conciliacao_')) return new Promise((ok) => banco.pendentes.push(() => ok(r)));
      return Promise.resolve(r);
    },
  },
}));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1' }, isAdmin: true }) }));

import { notificarLancamentosMudaram, inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import {
  useResumoMes, useStatusAno, useReleDonoAoMudarLancamentos, useReleDonoAoVoltarAVista, invalidarDono,
  CHAVE_RESUMO_MES, JANELA_DO_RETORNO_MS,
} from '@/hooks/useResumoConciliacao';
import { useClassificacaoStaging } from '@/v2/hooks/useClassificacaoStaging';
import { useCancelarMovimento } from '@/hooks/useCancelarMovimento';
import { useTransferenciaAplicar } from '@/v2/hooks/useTransferenciaAplicar';

const C = 'cli-1';
const resumo = () => banco.chamadas.filter((f) => f === 'fn_conciliacao_resumo_mes').length;
const regua = () => banco.chamadas.filter((f) => f === 'fn_conciliacao_status_ano').length;
const novoQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const dentro = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const LINHA_TOTAL = [{ nivel: 'total', conta_nome: 'Total', status: 'nao_conciliado', saldo_sistema: 10, saldo_extrato: 20, diferenca: 10 }];

beforeEach(() => {
  banco.chamadas = []; banco.resposta = { fn_conciliacao_resumo_mes: LINHA_TOTAL }; banco.segurar = false; banco.pendentes = [];
});
afterEach(() => { vi.useRealTimers(); });

describe('o canal: `menosEste` deixa de fora só quem gravou', () => {
  it('todos ouvem; com `menosEste`, os outros ouvem e ele não', () => {
    const a = vi.fn(); const b = vi.fn();
    const sairA = inscreverEmLancamentos(C, a); const sairB = inscreverEmLancamentos(C, b);
    notificarLancamentosMudaram(C);
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
    notificarLancamentosMudaram(C, a);
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 2]);
    sairA(); sairB();
  });
});

describe('(1) o canal invalida o dono — resumo E régua', () => {
  function Telas() {
    useResumoMes(C, '2026-09', null);
    useStatusAno(C, 2026);
    useReleDonoAoMudarLancamentos(C);
    return null;
  }
  it('um aviso: uma releitura do resumo e uma da régua; aviso de OUTRO cliente não relê nada', async () => {
    render(<Telas />, { wrapper: dentro(novoQc()) });
    await waitFor(() => expect([resumo(), regua()]).toEqual([1, 1]));
    act(() => notificarLancamentosMudaram('outro-cliente'));
    act(() => notificarLancamentosMudaram(C));
    await waitFor(() => expect([resumo(), regua()]).toEqual([2, 2]));
  });

  it('M3: com `servirDoCache` (60 s) a invalidação VENCE o staleTime — o painel relê', async () => {
    function Painel() {
      const q = useResumoMes(C, '2026-09', ['conta-1'], { servirDoCache: true });
      useReleDonoAoMudarLancamentos(C);
      return <span data-testid="n">{q.data?.length ?? '-'}</span>;
    }
    const qc = novoQc();
    const tela = render(<Painel />, { wrapper: dentro(qc) });
    await waitFor(() => expect(resumo()).toBe(1));
    /* a prova de que o cache serve mesmo: remontar dentro dos 60 s NÃO relê */
    tela.unmount();
    render(<Painel />, { wrapper: dentro(qc) });
    await new Promise((r) => setTimeout(r, 20));
    expect(resumo()).toBe(1);
    act(() => notificarLancamentosMudaram(C));
    await waitFor(() => expect(resumo()).toBe(2));
  });
});

describe('(2) voltar à vista relê o dono — uma vez, sem esvaziar', () => {
  function Conciliacao({ aVista }: { aVista: boolean }) {
    const r = useResumoMes(C, '2026-09', null);
    useStatusAno(C, 2026);
    useReleDonoAoVoltarAVista(C, aVista);
    return <span data-testid="total">{r.data?.[0]?.status ?? 'vazio'}</span>;
  }
  const passarAJanela = () => act(() => { vi.setSystemTime(Date.now() + JANELA_DO_RETORNO_MS + 1); });

  it('entrar na seção: UMA chamada do resumo e UMA da régua (a releitura do montar não é duplicada)', async () => {
    render(<Conciliacao aVista />, { wrapper: dentro(novoQc()) });
    await waitFor(() => expect([resumo(), regua()]).toEqual([1, 1]));
    await new Promise((r) => setTimeout(r, 30));
    expect([resumo(), regua()]).toEqual([1, 1]);
  });

  it('trocar para a aba interna "Conciliação": +1 e +1; sair dela não relê', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const tela = render(<Conciliacao aVista={false} />, { wrapper: dentro(novoQc()) });
    await waitFor(() => expect([resumo(), regua()]).toEqual([1, 1]));
    passarAJanela();
    tela.rerender(<Conciliacao aVista />);
    await waitFor(() => expect([resumo(), regua()]).toEqual([2, 2]));
    tela.rerender(<Conciliacao aVista={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect([resumo(), regua()]).toEqual([2, 2]);
  });

  it('a janela volta a ter foco: +1 e +1; foco e visibilidade colados contam UM retorno', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    render(<Conciliacao aVista />, { wrapper: dentro(novoQc()) });
    await waitFor(() => expect([resumo(), regua()]).toEqual([1, 1]));
    passarAJanela();
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect([resumo(), regua()]).toEqual([2, 2]));
    await new Promise((r) => setTimeout(r, 30));
    expect([resumo(), regua()]).toEqual([2, 2]);
    /* SEM RAJADA: a releitura já voltou, e um segundo evento do MESMO retorno (dentro da janela) não abre outra */
    act(() => { window.dispatchEvent(new Event('focus')); });
    await new Promise((r) => setTimeout(r, 30));
    expect([resumo(), regua()]).toEqual([2, 2]);
  });

  it('retorno com a releitura ainda em curso: não abre uma segunda chamada (nem cancela a primeira)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    render(<Conciliacao aVista />, { wrapper: dentro(novoQc()) });
    await waitFor(() => expect([resumo(), regua()]).toEqual([1, 1]));
    banco.segurar = true;
    passarAJanela();
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(banco.pendentes.length).toBe(2));
    passarAJanela();
    act(() => { window.dispatchEvent(new Event('focus')); });
    await new Promise((r) => setTimeout(r, 30));
    expect([resumo(), regua()]).toEqual([2, 2]);
    act(() => { banco.pendentes.splice(0).forEach((soltar) => soltar()); });
  });

  it('fora de vista (outra aba interna aberta), o foco da janela não dispara releitura daqui', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    render(<Conciliacao aVista={false} />, { wrapper: dentro(novoQc()) });
    await waitFor(() => expect([resumo(), regua()]).toEqual([1, 1]));
    passarAJanela();
    act(() => { window.dispatchEvent(new Event('focus')); });
    await new Promise((r) => setTimeout(r, 30));
    expect([resumo(), regua()]).toEqual([1, 1]);
  });

  it('NÃO ESVAZIA: durante a releitura o número anterior continua na tela, e troca quando o novo chega', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const tela = render(<Conciliacao aVista={false} />, { wrapper: dentro(novoQc()) });
    await waitFor(() => expect(tela.getByTestId('total').textContent).toBe('nao_conciliado'));
    banco.segurar = true;
    banco.resposta = { fn_conciliacao_resumo_mes: [{ ...LINHA_TOTAL[0], status: 'conciliado', diferenca: 0 }] };
    passarAJanela();
    tela.rerender(<Conciliacao aVista />);
    await waitFor(() => expect(banco.pendentes.length).toBe(2));
    expect(tela.getByTestId('total').textContent).toBe('nao_conciliado');
    act(() => { banco.pendentes.splice(0).forEach((soltar) => soltar()); });
    await waitFor(() => expect(tela.getByTestId('total').textContent).toBe('conciliado'));
  });

  it('M3: o retorno marca também a chave POR CONTA — o painel com `servirDoCache` relê ao montar depois', async () => {
    const qc = novoQc();
    const painel = renderHook(() => useResumoMes(C, '2026-09', ['conta-1'], { servirDoCache: true }), { wrapper: dentro(qc) });
    await waitFor(() => expect(resumo()).toBe(1));
    painel.unmount();
    act(() => invalidarDono(qc, C));
    expect(qc.getQueryState([CHAVE_RESUMO_MES, C, '2026-09', ['conta-1']])?.isInvalidated).toBe(true);
    renderHook(() => useResumoMes(C, '2026-09', ['conta-1'], { servirDoCache: true }), { wrapper: dentro(qc) });
    await waitFor(() => expect(resumo()).toBe(2));
  });
});

describe('(3) os gestos avisam o canal no ponto de sucesso', () => {
  const ouvir = () => { const cb = vi.fn(); const sair = inscreverEmLancamentos(C, cb); return { cb, sair }; };

  it('Mesa do Enriquecer (`useClassificacaoStaging`): gravar a linha avisa; recusa do banco e ensaio NÃO avisam', async () => {
    const { cb, sair } = ouvir();
    const h = renderHook(() => useClassificacaoStaging('sessao-1', C), { wrapper: dentro(novoQc()) });
    banco.resposta = { fn_classificacao_apply_row: { ok: true }, fn_classificacao_desfazer_split: { ok: true } };
    await act(async () => { await h.result.current.applyRow({ staging_id: 's1', overwrite: false }); });
    expect(cb).toHaveBeenCalledTimes(1);
    await act(async () => { await h.result.current.desfazerSplit({ staging_id: 's1', motivo: null, simular: true }); });
    expect(cb).toHaveBeenCalledTimes(1);
    await act(async () => { await h.result.current.desfazerSplit({ staging_id: 's1', motivo: 'x', simular: false }); });
    expect(cb).toHaveBeenCalledTimes(2);
    banco.resposta = { fn_classificacao_apply_row: { ok: false, motivo: 'sem_lancamento_vinculado' }, fn_classificacao_reverter_row: { ok: true } };
    await act(async () => { await h.result.current.applyRow({ staging_id: 's1', overwrite: false }); });
    expect(cb).toHaveBeenCalledTimes(2);
    await act(async () => { await h.result.current.reverterRow('s1'); });
    expect(cb).toHaveBeenCalledTimes(3);
    banco.resposta = { fn_classificacao_split_substituir: { ok: true } };
    await act(async () => { await h.result.current.splitSubstituir({ lancamento_id: 'l1', sessao_id: 'sessao-1', staging_ids: ['s1'] }); });
    expect(cb).toHaveBeenCalledTimes(4);
    sair();
  });

  it('cancelar e reverter o cancelamento de um movimento do extrato (`useCancelarMovimento`)', async () => {
    const { cb, sair } = ouvir();
    const h = renderHook(() => useCancelarMovimento(C, 'conta-1', '2026-09'), { wrapper: dentro(novoQc()) });
    await act(async () => { expect(await h.result.current.cancelar('e1', 'duplicado')).toBe(true); });
    expect(cb).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await h.result.current.reverter('e1')).toBe(true); });
    expect(cb).toHaveBeenCalledTimes(2);
    sair();
  });

  it('transferência pela Mesa (`useTransferenciaAplicar`): aplicar avisa, simular não', async () => {
    const { cb, sair } = ouvir();
    const h = renderHook(() => useTransferenciaAplicar());
    await act(async () => { await h.result.current.simular('l1', 'conta-2'); });
    expect(cb).not.toHaveBeenCalled();
    await act(async () => { await h.result.current.aplicar('l1', 'conta-2'); });
    expect(cb).toHaveBeenCalledTimes(1);
    sair();
  });
});

const fonte = (arq: string) => readFileSync(arq, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

describe('(3) os pontos que não se montam em teste, lidos da FONTE', () => {
  it('`useFinanceiroV2`: editar (os dois ramos), excluir, excluir em lote e realizar em lote avisam os OUTROS, depois de gravar', () => {
    const hook = fonte('src/hooks/useFinanceiroV2.ts');
    expect(hook).toContain('if (clienteId) notificarLancamentosMudaram(clienteId, meuOuvinteRef.current);');
    expect(hook.match(/if \(!opts\?\.silent\) \{ toast\.success\('Lançamento atualizado'\); avisarOsOutros\(\); \}/g)).toHaveLength(2);
    expect(hook).toContain("toast.success('Lançamento excluído com sucesso'); avisarOsOutros(); return true;");
    expect(hook).toContain('if (totalExcluidos > 0) avisarOsOutros(); return { excluidos: totalExcluidos, bloqueados: [], puladosOC, puladosParcela };');
    expect(hook).toContain('if (atualizados > 0) avisarOsOutros(); return { atualizados }; }, [clienteId, user, avisarOsOutros]);');
  });
  it('o `onMudou` do Espelho (todo gesto da Conferência) relê o espelho E avisa; o quadro do topo ouve o canal', () => {
    const espelho = fonte('src/components/financeiro-v2/EspelhoConciliacaoTab.tsx');
    expect(espelho).toContain('const aoMudarConferencia = () => { void refetch(); if (clienteId) notificarLancamentosMudaram(clienteId); };');
    expect(espelho).toContain('onAbrir={onAbrirLancamento} onMudou={aoMudarConferencia}');
    expect(espelho).toContain('useReleDonoAoMudarLancamentos(clienteId);');
  });
  it('criar pela linha, importar extrato, desfazer importação e parcela de financiamento: aviso depois do sucesso', () => {
    expect(fonte('src/components/conciliacao/CriarLancamentoDaLinha.tsx'))
      .toContain("toast.success('Lançamento criado e vinculado — o movimento fechou.'); if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id); await aoCriado();");
    expect(fonte('src/hooks/useImportacaoExtrato.ts'))
      .toContain('const idsPorHash = new Map<string, string>(r.ids.map((x) => [x.hash, x.id])); notificarLancamentosMudaram(clienteAtual.id);');
    expect(fonte('src/components/conciliacao/PainelExtratoMes.tsx'))
      .toContain('aoDesfeito={() => { setHouveDesfazer(true); void importacoes.recarregar(); if (clienteId) notificarLancamentosMudaram(clienteId); }}');
    expect(fonte('src/v2/components/mesa/enriquecimento/AcaoEhParcelaFinanciamento.tsx'))
      .toContain('await chamar(parcelaId, false); if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);');
  });
  it('a Mesa não avisa mais por conta própria: o aviso é do hook (um dono, sem aviso em dobro)', () => {
    expect(fonte('src/v2/components/mesa/enriquecimento/MesaEnriquecimentoTab.tsx')).not.toContain('notificarLancamentosMudaram');
  });
  it('a aba Conciliação: relê ao voltar à vista, e a recarga pelo canal é SILENCIOSA (não desmonta o Casar nem o Importar)', () => {
    const aba = fonte('src/pages/ConciliacaoBancariaTab.tsx');
    expect(aba).toContain("useReleDonoAoVoltarAVista(clienteId, vistaExtrato === 'conciliacao');");
    expect(aba).toContain('return inscreverEmLancamentos(clienteId, () => { void loadData(true); releDono(); });');
    expect(aba).toContain('if (!silencioso) { setLoading(true); setLancamentos([]); }');
    expect(aba).toContain('const releDono = useCallback(() => invalidarDono(queryClient, clienteId), [clienteId, queryClient]);');
  });
});
