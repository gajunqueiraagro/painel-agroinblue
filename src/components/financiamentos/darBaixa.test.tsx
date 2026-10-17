/**
 * FIN-FINANC-28 · PASSO 5 — "Dar baixa ▾" e "Desfazer baixa". O banco decide e a prévia é a gravação desfeita: o botão só grava sem
 * recusa; a diferença do quitado pede a confirmação; a prorrogação mostra as parcelas que andam; o rodapé é o do banco.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BotaoDarBaixa, DarBaixaDialog, MOTIVO_BAIXA_SO_VIGENTE } from './DarBaixa';
import { fraseDoRodape, lerBaixaViva, lerResultadoDaBaixa, podeDarBaixa } from '@/lib/financiamentos/baixaDoContrato';
import type { useContratoDeCredito } from '@/hooks/useContratoDeCredito';

type Api = ReturnType<typeof useContratoDeCredito>;
const OK = { simulado: true, recusa: null, principal: 1000, liquidado: 400, diferenca: 600, lancamentos_cancelados: 4,
  parcelas: [{ numero: 2, data_vencimento: '2031-05-10', para: '2031-07-10' }, { numero: 3, data_vencimento: '2031-06-10', para: '2031-08-10' }] };

function api(o: Partial<Api> = {}): Api {
  return {
    liberacoes: [], destinacoes: [], documentos: [], encargos: [], erroDeLeitura: null,
    salvarLiberacao: vi.fn(async () => null), removerLiberacao: vi.fn(async () => null), salvarDestinacao: vi.fn(async () => null),
    removerDestinacao: vi.fn(async () => null), enviarDocumento: vi.fn(async () => null), removerDocumento: vi.fn(async () => null),
    urlDoDocumento: vi.fn(async () => null), lerCaptacoesLivres: vi.fn(async () => []), lerContratosAnteriores: vi.fn(async () => []),
    baixaViva: null, darBaixa: vi.fn(async (_t: string, _d: Record<string, unknown>, simular: boolean) => lerResultadoDaBaixa({ ...OK, simulado: simular }) ?? 'x'),
    desfazerBaixa: vi.fn(async () => null), lerSucessores: vi.fn(async () => [{ id: 'novo', numero: 'C-2', descricao: 'Novo' }]),
    vinculos: [], buscar: vi.fn(async () => 'x'), vincularPagamento: vi.fn(async () => 'x'), desvincularPagamento: vi.fn(async () => 'x'),
    lerEncargosPerto: vi.fn(async () => []), vincularEncargo: vi.fn(async () => null),
    ...o,
  };
}

describe('o dono da baixa', () => {
  it('só contrato vigente dá baixa; o rodapé são os três números do banco; a baixa viva se lê sem cast', () => {
    expect([podeDarBaixa('ativo'), podeDarBaixa('prorrogado'), podeDarBaixa('quitado'), podeDarBaixa('rolado')]).toEqual([true, true, false, false]);
    expect(fraseDoRodape(lerResultadoDaBaixa(OK))).toBe('principal 1.000,00 = liquidado 400,00 · diferença 600,00');
    expect(fraseDoRodape(null)).toBe('principal — = liquidado — · diferença —');
    expect(lerBaixaViva({ id: 'b', tipo: 'rolado', data: '2031-04-20', motivo: 'm' })).toEqual({ id: 'b', tipo: 'rolado', data: '2031-04-20', motivo: 'm' });
    expect(lerBaixaViva({ id: 'b', tipo: 'inventado', data: '2031-04-20' })).toBeNull();
  });
});

describe('o diálogo', () => {
  it('quitado com diferença: a simulação recusa, a caixa confirma, o botão acende e grava com o motivo', async () => {
    const dar = vi.fn(async (_t: string, d: Record<string, unknown>, simular: boolean) =>
      lerResultadoDaBaixa(d.confirmar_diferenca ? { ...OK, simulado: simular } : { simulado: true, recusa: { frase: 'Principal 1.000,00 e liquidado 400,00 não fecham (diferença 600,00): confirme a diferença para quitar.' } }) ?? 'x');
    const fechar = vi.fn();
    render(<DarBaixaDialog api={api({ darBaixa: dar })} tipo="quitado" aoFechar={fechar} />);
    await waitFor(() => expect(screen.getByTestId('previa-da-baixa').textContent).toContain('confirme a diferença'));
    expect(screen.getByTestId('gravar-baixa')).toBeDisabled();
    fireEvent.click(screen.getByTestId('confirmar-diferenca'));
    await waitFor(() => expect(screen.getByTestId('gravar-baixa')).not.toBeDisabled());
    expect(screen.getByTestId('rodape-da-baixa').textContent).toBe('principal 1.000,00 = liquidado 400,00 · diferença 600,00');
    fireEvent.click(screen.getByTestId('gravar-baixa'));
    expect(screen.getByTestId('previa-da-baixa').textContent).toBe('Informe o motivo da baixa.');
    fireEvent.change(screen.getByTestId('motivo-da-baixa'), { target: { value: 'pago no banco' } });
    fireEvent.click(screen.getByTestId('gravar-baixa'));
    await waitFor(() => expect(dar).toHaveBeenLastCalledWith('quitado', expect.objectContaining({ motivo: 'pago no banco', confirmar_diferenca: true }), false));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
  });
  it('prorrogado: a prévia lista as parcelas que andam (de → para), o aditivo a anexar vai junto', async () => {
    const a = api();
    render(<DarBaixaDialog api={a} tipo="prorrogado" aoFechar={vi.fn()} />);
    fireEvent.change(screen.getByTestId('meses-prorrogacao'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('aditivo-a-anexar'));
    await waitFor(() => expect(screen.getByTestId('previa-da-baixa').textContent).toBe('2 parcela(s) andam: 2 10/05/31 → 10/07/31 · 3 10/06/31 → 10/08/31'));
    expect(a.darBaixa).toHaveBeenLastCalledWith('prorrogado', expect.objectContaining({ meses: 2, aditivo_a_anexar: true }), true);
  });
  it('tamanho fixo: a área dos campos tem o mesmo lugar em toda saída', () => {
    for (const t of ['quitado', 'rolado', 'prorrogado', 'cancelado'] as const) {
      const { unmount } = render(<DarBaixaDialog api={api()} tipo={t} aoFechar={vi.fn()} />);
      expect(screen.getByTestId('dar-baixa-dialogo').className).toContain('h-[430px] w-[600px]');
      expect(screen.getByTestId('campos-da-baixa').className).toBe('h-[112px]');
      unmount();
    }
  });
});

describe('o botão do cabeçalho', () => {
  it('vigente: o menu; encerrado com baixa viva: "Desfazer baixa"; encerrado sem baixa viva: apagado com o motivo', () => {
    const { rerender } = render(<BotaoDarBaixa status="ativo" api={api()} onEscolher={vi.fn()} onDesfazer={vi.fn()} />);
    expect(screen.getByTestId('dar-baixa')).not.toBeDisabled();
    const desfazer = vi.fn();
    rerender(<BotaoDarBaixa status="rolado" api={api({ baixaViva: { id: 'b', tipo: 'rolado', data: '2031-04-20', motivo: 'm' } })} onEscolher={vi.fn()} onDesfazer={desfazer} />);
    fireEvent.click(screen.getByTestId('desfazer-baixa'));
    expect(desfazer).toHaveBeenCalled();
    rerender(<BotaoDarBaixa status="quitado" api={api()} onEscolher={vi.fn()} onDesfazer={vi.fn()} />);
    expect(screen.getByTestId('dar-baixa')).toBeDisabled();
    expect(screen.getByTestId('dar-baixa').getAttribute('title')).toBe(MOTIVO_BAIXA_SO_VIGENTE);
  });
});
