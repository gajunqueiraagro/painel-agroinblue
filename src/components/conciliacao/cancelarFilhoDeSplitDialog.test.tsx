/**
 * CONC-SPLIT-FILHO-CANCELADO-01 passo 2, commit B — o aviso de filho de desmembramento, MONTADO: mostra o que o banco leu
 * (extrato, filhos, soma dos vivos), exige o motivo, apaga o botão com o motivo quando o banco diz que não dá para desfazer
 * e escreve a recusa da gravação ao lado do botão (sem toast).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const banco = vi.hoisted(() => ({
  desfazer: vi.fn(), notificar: vi.fn(), invalidarDono: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/conciliacao/cancelarFilhoDeSplit', async (original) => ({
  ...(await original<typeof import('@/lib/conciliacao/cancelarFilhoDeSplit')>()), desfazerSplit: banco.desfazer,
}));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: banco.notificar }));
vi.mock('@/hooks/useResumoConciliacao', () => ({ invalidarDono: banco.invalidarDono }));
vi.mock('sonner', () => ({ toast: banco.toast }));

import { CancelarFilhoDeSplitDialog } from './CancelarFilhoDeSplitDialog';
import { FRASE_DO_SPLIT, lerSplitDoLancamento, type SplitDoLancamento } from '@/lib/conciliacao/cancelarFilhoDeSplit';

const BASE = {
  split_id: 'split-1',
  extrato: { id: 'ext-1', data: '2026-08-10', valor: -13760.35, descricao: 'Pix - Enviado SINT com um histórico bem comprido do banco', conta_nome: 'Banco SINT' },
  importacao: { sessao_id: 'sessao-1', criada_em: '2026-09-01T10:00:00Z' },
  filhos: [
    { lancamento_id: 'f-a', descricao: 'SINT folha', valor: 10219.33, cancelado: false, este: true },
    { lancamento_id: 'f-b', descricao: 'SINT adiantamento', valor: 3291.02, cancelado: false, este: false },
    { lancamento_id: 'f-c', descricao: 'SINT vale', valor: 250, cancelado: true, este: false },
  ],
  total_filhos: 3, soma_vivos: 13510.35, desfazivel: true, motivo_nao_desfazivel: null,
};
const ler = (j: unknown): SplitDoLancamento => { const s = lerSplitDoLancamento(j); if (!s) throw new Error('fixture torta'); return s; };

function montar(json: unknown = BASE) {
  const aoVoltar = vi.fn(); const aoDesfazer = vi.fn();
  const qc = new QueryClient();
  const invalidar = vi.spyOn(qc, 'invalidateQueries');
  render(
    <QueryClientProvider client={qc}>
      <CancelarFilhoDeSplitDialog clienteId="cli" split={ler(json)} aoVoltar={aoVoltar} aoDesfazer={aoDesfazer} />
    </QueryClientProvider>,
  );
  return { aoVoltar, aoDesfazer, invalidar };
}
const txt = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/\s+/g, ' ').trim();
const botao = () => screen.getByTestId('split-desfazer') as HTMLButtonElement;

beforeEach(() => { vi.clearAllMocks(); banco.desfazer.mockResolvedValue(null); });

describe('CancelarFilhoDeSplitDialog', () => {
  it('mostra o extrato, os filhos (o "este" em destaque, o cancelado riscado), o confronto e a frase', () => {
    montar();
    expect(txt('split-titulo')).toBe('Este lançamento veio de um desmembramento');
    expect(txt('split-extrato')).toBe('extrato de 10/08/26· Banco SINT· R$ 13.760,35· Pix - Enviado SINT com um histórico bem comprido do banco');
    const linhas = screen.getAllByTestId('split-filho');
    expect(linhas.map(l => (l.textContent ?? '').replace(/\s+/g, ' '))).toEqual([
      'SINT folha10.219,33este lançamento', 'SINT adiantamento3.291,02vivo', 'SINT vale250,00cancelado',
    ]);
    expect(linhas.map(l => l.getAttribute('data-este'))).toEqual(['sim', null, null]);
    expect(linhas[0].className).toContain('bg-primary/10');
    expect(linhas[1].className).not.toContain('bg-primary/10');
    expect(linhas[2].getAttribute('data-cancelado')).toBe('sim');
    expect(within(linhas[2]).getByText('SINT vale').className).toContain('line-through');
    expect(within(linhas[0]).getByText('SINT folha').className).not.toContain('line-through');
    expect(txt('split-confronto')).toBe('soma dos vivosR$ 13.510,35· extratoR$ 13.760,35· não confere');
    expect(txt('split-frase')).toBe(FRASE_DO_SPLIT);
  });

  it('confere quando a soma dos vivos é o valor do extrato', () => {
    montar({ ...BASE, soma_vivos: 13760.35 });
    expect(txt('split-confere')).toBe('· confere ✓');
  });

  it('tamanho FIXO: a casca, o corpo, a lista (único scrollport, cabeçalho preso) e os lugares das linhas condicionais', () => {
    montar();
    const casca = screen.getByTestId('cancelar-filho-de-split');
    expect(casca.className).toContain('h-[300px]');
    expect(casca.className).toContain('max-w-[560px]');
    expect(casca.className).toContain('overflow-hidden');
    const lista = screen.getByTestId('split-filhos');
    expect(lista.className).toContain('h-[110px]');
    expect(lista.className).toContain('overflow-y-auto');
    expect(lista.querySelector('table')?.className).toContain('table-fixed');
    for (const th of lista.querySelectorAll('th')) expect(th.className).toContain('sticky top-0');
    expect(screen.getByTestId('split-confronto').className).toContain('h-[16px]');
    expect(screen.getByTestId('split-frase').className).toContain('h-[28px]');
    // o recado existe SEMPRE (vazio ou com texto): a entrada da recusa não muda a altura do rodapé
    expect(screen.getByTestId('split-recado')).toBeTruthy();
    // o extrato: só a descrição corta, e leva o texto inteiro no title
    const desc = within(screen.getByTestId('split-extrato')).getByTitle(BASE.extrato.descricao);
    expect(desc.className).toContain('truncate');
  });

  it('motivo OBRIGATÓRIO: sem ele o botão fica apagado com a frase escrita, e o clique não chama o banco', () => {
    montar();
    expect(botao().disabled).toBe(true);
    expect(txt('split-recado')).toBe('Informe o motivo do cancelamento.');
    fireEvent.click(botao());
    fireEvent.change(screen.getByTestId('split-motivo'), { target: { value: '   ' } });
    expect(botao().disabled).toBe(true);
    fireEvent.click(botao());
    expect(banco.desfazer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('split-motivo'), { target: { value: 'lançado errado' } });
    expect(botao().disabled).toBe(false);
    expect(txt('split-recado')).toBe('');
  });

  it('desfazer: chama o dono com o motivo, avisa o canal, invalida o que a Conferência lê e fecha a porta', async () => {
    const { aoDesfazer, aoVoltar, invalidar } = montar();
    fireEvent.change(screen.getByTestId('split-motivo'), { target: { value: '  lançado errado ' } });
    fireEvent.click(botao());
    await waitFor(() => expect(aoDesfazer).toHaveBeenCalledTimes(1));
    expect(banco.desfazer).toHaveBeenCalledTimes(1);
    expect(banco.desfazer.mock.calls[0][0].splitId).toBe('split-1');
    expect(banco.desfazer.mock.calls[0][1]).toBe('lançado errado');
    expect(banco.notificar).toHaveBeenCalledWith('cli');
    expect(banco.invalidarDono).toHaveBeenCalledWith(expect.anything(), 'cli');
    expect(invalidar.mock.calls.map(c => (c[0] as { queryKey: string[] }).queryKey[0])).toEqual(expect.arrayContaining(['espelho-conciliacao', 'classificacao-staging', 'extrato-ger-lancs']));
    expect(aoVoltar).not.toHaveBeenCalled();
    expect(banco.toast.error).not.toHaveBeenCalled();
    expect(banco.toast.success).not.toHaveBeenCalled();
  });

  it('a recusa do banco fica ESCRITA ao lado do botão, sem toast; a porta não fecha e o motivo fica', async () => {
    banco.desfazer.mockResolvedValue('O filho 2 foi gravado em outra importação: reverta lá antes.');
    const { aoDesfazer } = montar();
    fireEvent.change(screen.getByTestId('split-motivo'), { target: { value: 'lançado errado' } });
    fireEvent.click(botao());
    await waitFor(() => expect(txt('split-recado')).toBe('O filho 2 foi gravado em outra importação: reverta lá antes.'));
    expect(screen.getByTestId('split-recado').className).toContain('text-destructive');
    expect(aoDesfazer).not.toHaveBeenCalled();
    expect(banco.notificar).not.toHaveBeenCalled();
    expect((screen.getByTestId('split-motivo') as HTMLInputElement).value).toBe('lançado errado');
    expect(banco.toast.error).not.toHaveBeenCalled();
    // mexer no motivo limpa a recusa
    fireEvent.change(screen.getByTestId('split-motivo'), { target: { value: 'outro motivo' } });
    expect(txt('split-recado')).toBe('');
  });

  it('NÃO desfazível: botão apagado com o motivo do banco escrito no lugar, mesmo com motivo digitado; nada é chamado', () => {
    montar({ ...BASE, desfazivel: false, motivo_nao_desfazivel: 'Um filho já foi cancelado por outro caminho.' });
    expect(txt('split-recado')).toBe('Um filho já foi cancelado por outro caminho.');
    expect(screen.getByTestId('split-recado').className).toContain('text-destructive');
    expect(botao().disabled).toBe(true);
    expect((screen.getByTestId('split-motivo') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(botao());
    expect(banco.desfazer).not.toHaveBeenCalled();
  });

  it('Voltar fecha sem gravar', () => {
    const { aoVoltar } = montar();
    fireEvent.click(screen.getByTestId('split-voltar'));
    expect(aoVoltar).toHaveBeenCalledTimes(1);
    expect(banco.desfazer).not.toHaveBeenCalled();
  });
});
