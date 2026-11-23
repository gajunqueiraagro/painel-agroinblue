/**
 * NOTA-PAGA-POR-TERCEIRO-01 · Fatia A — o bloco "Quem paga" da aba Pagamento (dados SINTÉTICOS; o banco é injetado).
 *   T1 a regra pura: só a saída ainda não paga escolhe; a resposta fora do formato é nula
 *   T2 já pago por nós: o bloco não aparece
 *   T3 Terceiro: avisa o hospedeiro, pede a prévia (simular) só com parceiro e motivo; o botão grava (simular=false) e devolve a frase
 *   T4 o aviso do boleto aparece na prévia; a recusa do banco aparece como frase e não grava
 *   T5 já marcado: faixa + Desfazer pede o motivo, grava e devolve a frase; "Nós" fica desligado
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuemPagaTerceiro } from './QuemPagaTerceiro';
import { lerPreviaDoTerceiro, podeEscolherQuemPaga, type PreviaDoTerceiro } from '@/lib/financeiro/pagoPorTerceiro';

vi.mock('@/components/shared/FavorecidoSelect', () => ({
  FavorecidoSelect: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select aria-label="Quem pagou" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option><option value="emp">Empreiteiro Exemplo</option>
    </select>),
}));

const previa = (o: Partial<PreviaDoTerceiro> = {}): PreviaDoTerceiro => ({ parceiro: 'Empreiteiro Exemplo', dataPagamento: '2026-11-20',
  antes: { status: 'programado', dataPagamento: null, semCaixa: false }, depois: { status: 'realizado', dataPagamento: '2026-11-20', semCaixa: true },
  avisos: [], efeitos: ['sai de "a pagar"'], ...o });

const abrir = (o: { status?: string; ler?: () => Promise<null | { parceiroId: string; motivo: string; dataPagamento: string; documentoId: null; feitoEm: string }>;
  marcar?: ReturnType<typeof vi.fn>; desfazer?: ReturnType<typeof vi.fn> } = {}) => {
  const aoGravar = vi.fn(); const aoMudar = vi.fn();
  render(<QuemPagaTerceiro lancamentoId="L1" clienteId="cli" tipoOperacao="2-Saídas" status={o.status ?? 'programado'} documentos={[]}
    aoMudarQuemPaga={aoMudar} aoGravar={aoGravar} ler={o.ler ?? (async () => null)}
    marcar={o.marcar ?? vi.fn(async () => ({ ok: true, previa: previa() }))} desfazer={o.desfazer ?? vi.fn(async () => ({ ok: true, previa: previa() }))} />);
  return { aoGravar, aoMudar };
};

describe('NOTA-PAGA-POR-TERCEIRO-01 — o bloco Quem paga', () => {
  it('T1 a regra pura', () => {
    expect(podeEscolherQuemPaga('2-Saídas', 'programado')).toBe(true);
    expect(podeEscolherQuemPaga('2-Saídas', 'realizado')).toBe(false);
    expect(podeEscolherQuemPaga('1-Entradas', 'programado')).toBe(false);
    expect(lerPreviaDoTerceiro({ ok: false })).toBeNull();
    expect(lerPreviaDoTerceiro({ ok: true, avisos: ['x', 3], depois: { status: 'realizado', sem_caixa: true } })?.avisos).toEqual(['x']);
  });
  it('T2 já pago por nós: não aparece (depois que a leitura terminou)', async () => {
    const ler = vi.fn(async () => null);
    abrir({ status: 'realizado', ler });
    await waitFor(() => expect(ler).toHaveBeenCalledWith('L1'));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('quem-paga')).toBeNull();
    /* o controle: a mesma saída AINDA NÃO paga mostra o bloco (o teste sabe achar) */
    abrir({ status: 'programado' });
    expect(await screen.findByTestId('quem-paga')).toBeTruthy();
  });
  it('T3 Terceiro: prévia só com parceiro; o botão grava', async () => {
    const marcar = vi.fn(async (_a: unknown, simular: boolean) => ({ ok: true, previa: previa({ antes: { status: 'programado', dataPagamento: null, semCaixa: !simular && false } }) }));
    const { aoGravar, aoMudar } = abrir({ marcar });
    await screen.findByTestId('quem-paga');
    fireEvent.click(screen.getByRole('button', { name: 'Terceiro (desconta de contrato)' }));
    expect(aoMudar).toHaveBeenCalledWith('terceiro');
    expect(screen.getByTestId('quem-paga-gravar')).toBeDisabled();
    expect(marcar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Quem pagou'), { target: { value: 'emp' } });
    await waitFor(() => expect(marcar).toHaveBeenCalledWith(expect.objectContaining({ lancamentoId: 'L1', parceiroId: 'emp' }), true));
    await waitFor(() => expect(screen.getByTestId('quem-paga-gravar')).not.toBeDisabled());
    expect(screen.getByTestId('quem-paga-previa').textContent).toMatch(/Realizado.*20\/11\/2026.*sem movimento de caixa/);
    fireEvent.click(screen.getByTestId('quem-paga-gravar'));
    await waitFor(() => expect(marcar).toHaveBeenCalledWith(expect.objectContaining({ parceiroId: 'emp' }), false));
    await waitFor(() => expect(aoGravar).toHaveBeenCalledWith(expect.stringMatching(/^Marcado como pago por Empreiteiro Exemplo em 20\/11\/2026/)));
  });
  it('T4 aviso do boleto; recusa do banco vira frase', async () => {
    const marcar = vi.fn(async (_a: unknown, simular: boolean) => (simular
      ? { ok: true, previa: previa({ avisos: ['Tem boleto ligado: confirme que o terceiro pagou esse boleto.'] }) }
      : { ok: false, frase: 'Este lançamento está na aprovação de pagamentos: tire do pedido antes. Nada foi gravado.' }));
    const { aoGravar } = abrir({ marcar });
    await screen.findByTestId('quem-paga');
    fireEvent.click(screen.getByRole('button', { name: 'Terceiro (desconta de contrato)' }));
    fireEvent.change(screen.getByLabelText('Quem pagou'), { target: { value: 'emp' } });
    expect((await screen.findByTestId('quem-paga-aviso')).textContent).toMatch(/boleto ligado/);
    fireEvent.click(screen.getByTestId('quem-paga-gravar'));
    await waitFor(() => expect(screen.getByTestId('quem-paga-erro').textContent).toMatch(/na aprovação/));
    expect(aoGravar).not.toHaveBeenCalled();
  });
  it('T5 já marcado: faixa e Desfazer com motivo', async () => {
    const desfazer = vi.fn(async () => ({ ok: true, previa: previa({ depois: { status: 'programado', dataPagamento: null, semCaixa: false } }) }));
    const { aoGravar, aoMudar } = abrir({ desfazer,
      ler: async () => ({ parceiroId: 'emp', motivo: 'desconta da empreitada', dataPagamento: '2026-11-20', documentoId: null, feitoEm: '2026-11-23T20:00:00Z' }) });
    expect((await screen.findByTestId('quem-paga-marcado')).textContent).toMatch(/Pago por terceiro em 20\/11\/2026/);
    expect(aoMudar).toHaveBeenCalledWith('terceiro');
    expect(screen.getByRole('button', { name: 'Nós' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('quem-paga-desfazer'));
    fireEvent.click(screen.getByTestId('quem-paga-desfazer-confirmar'));
    expect(screen.getByTestId('quem-paga-erro').textContent).toBe('Escreva por que desfaz.');
    expect(desfazer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('quem-paga-desfazer-motivo'), { target: { value: 'pagamos nós' } });
    fireEvent.click(screen.getByTestId('quem-paga-desfazer-confirmar'));
    await waitFor(() => expect(desfazer).toHaveBeenCalledWith('L1', 'pagamos nós', false));
    await waitFor(() => expect(aoGravar).toHaveBeenCalledWith('Desfeito: volta a Programado.'));
  });
});
