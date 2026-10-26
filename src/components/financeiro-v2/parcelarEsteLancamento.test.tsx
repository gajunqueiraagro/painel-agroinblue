/**
 * P74 B — "Parcelar este lançamento" (aba Pagamento do Editar). Os números do caso (R$ 3.284,88 → 4 × 821,22, competência 10/08/2026,
 * faturas 10/09 a 10/12/2026), cadastros SINTÉTICOS; o banco é falso — prova-se o que a tela mostra e manda gravar.
 *   B1 à vista no cartão: a sugestão do 1º vencimento (dia mais frequente, mês seguinte à competência), a grade com a Situação, a
 *      confirmação antes → depois, e a gravação (RPC com as 4; os documentos do lançamento ligados às 4)
 *   B2 pago: botão apagado, a frase no title e embaixo · B3 conciliado: idem, a frase da conciliação
 *   B4 conta que não é cartão: sem sugestão (o 1º vencimento vazio e obrigatório)
 *   B5 a ligação no Editar (fonte): só lançamento de saída, gravado, sem parcelamento/financiamento e não gerado pelo sistema
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const cartaoNoBanco = vi.hoisted(() => ({ diasDoCartao: vi.fn(async (_c: string): Promise<{ dia: number; lancamentos: number; ultimo: string }[]> => []) }));
vi.mock('@/lib/financeiro/diasDoCartao', () => cartaoNoBanco);

import { ParcelarEsteLancamento } from './ParcelarEsteLancamento';
import type { GravadoresDoParcelar, LancamentoParaParcelar } from '@/lib/financeiro/parcelarLancamento';
import type { PayloadParcelamento } from '@/lib/financiamentos/montarPayloadParcelamento';

const LANC: LancamentoParaParcelar = {
  id: 'lanc-1', valorCent: 328488, descricao: 'Compra sintetica de vacinas', dataCompetencia: '2026-08-10', fazendaId: 'faz-1', planoContaId: 'pl-vac',
  safraId: null, cultura: null, fase: null, favorecidoId: 'f1', formaPagamento: 'Cartão', contaId: 'elo', escopo: 'pecuaria',
};
const ABERTO = { status: 'programado', dataPagamento: null, conciliadoEm: null };

function falsos() {
  const g = {
    parcelar: vi.fn(async (_l: string, _p: PayloadParcelamento): Promise<string | null> => 'fin-1'),
    parcelas: vi.fn(async (_f: string) => [1, 2, 3, 4].map((numero) => ({ numero, lancamentoId: numero === 1 ? 'lanc-1' : `lanc-${numero}` }))),
    documentos: vi.fn(async (_c: string, _l: string): Promise<string[]> => ['doc-nf']),
    vincular: vi.fn(async (_c: string, _d: string, _ids: readonly string[]): Promise<void> => undefined),
  };
  const como: GravadoresDoParcelar = g;
  return { g, como };
}
function montar(extra: { situacao?: typeof ABERTO | { status: string; dataPagamento: string | null; conciliadoEm: string | null }; cartao?: boolean; g?: GravadoresDoParcelar } = {}) {
  const onParcelado = vi.fn();
  render(<ParcelarEsteLancamento clienteId="cli" lancamento={LANC} situacao={extra.situacao ?? ABERTO} vencimentoAtual="2026-08-10"
    conta={{ id: 'elo', nome: 'Cartão Elo Sintetico', cartao: extra.cartao ?? true }} onParcelado={onParcelado} gravadores={extra.g} />);
  return { onParcelado };
}
const textoDoVenc = () => {
  const el = within(screen.getByTestId('parcelar-este-venc').closest('div') ?? document.body).getByRole('textbox');
  if (!(el instanceof HTMLInputElement)) throw new Error('o 1º vencimento não é um campo de texto');
  return el.value;
};

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  vi.clearAllMocks();
  cartaoNoBanco.diasDoCartao.mockResolvedValue([{ dia: 10, lancamentos: 409, ultimo: '2026-10-10' }, { dia: 13, lancamentos: 1, ultimo: '2026-10-13' }]);
});

describe('P74 B — Parcelar este lançamento', () => {
  it('B1 à vista no cartão: sugestão, grade, confirmação e gravação (as 4 + os documentos)', async () => {
    const { g, como } = falsos();
    const { onParcelado } = montar({ g: como });
    expect(screen.getByTestId('parcelar-este').textContent).toContain('hoje: à vista (1/1)');
    fireEvent.click(screen.getByTestId('parcelar-este-abrir'));
    fireEvent.change(screen.getByTestId('parcelar-este-n'), { target: { value: '4' } });
    await waitFor(() => expect(textoDoVenc()).toBe('10/09/2026'), { timeout: 4000 });
    expect(screen.getByTestId('parcelar-este-rotulo-venc').textContent).toBe('1º vencimento · sugerido (Elo Sintetico, dia 10)');
    expect(screen.getByTestId('parcelar-este-recado').textContent).toContain('vira a 1/4');
    expect(screen.getByTestId('grade-de-parcelas').textContent).toContain('este lançamento');
    expect(screen.getAllByTestId('cel-vencimento').map((c) => c.textContent)).toEqual(['10/09/2026', '10/10/2026', '10/11/2026', '10/12/2026']);   // data inteira (compacta)
    fireEvent.click(screen.getByTestId('parcelar-este-confirmar'));
    const tabela = await screen.findByTestId('parcelar-este-antes-depois');
    expect(tabela.textContent).toContain('Antes1/110/08/2026−3.284,88');
    expect(screen.getAllByTestId('parcelar-este-depois').map((l) => l.textContent)).toEqual([
      'Depois1/4 (este)10/09/2026−821,22', '2/4 nova10/10/2026−821,22', '3/4 nova10/11/2026−821,22', '4/4 nova10/12/2026−821,22']);
    expect(tabela.textContent).toContain('igual ao antes');
    fireEvent.click(screen.getByTestId('parcelar-este-gravar'));
    await waitFor(() => expect(onParcelado).toHaveBeenCalled());
    const [id, payload] = g.parcelar.mock.calls[0];
    expect(id).toBe('lanc-1');
    expect(payload).toMatchObject({ valor_total: 3284.88, total_parcelas: 4, data_competencia: '2026-08-10', conta_bancaria_id: 'elo', plano_conta_id: 'pl-vac',
      parcelas: [{ numero: 1, data_vencimento: '2026-09-10', valor: 821.22 }, { numero: 2, data_vencimento: '2026-10-10', valor: 821.22 },
        { numero: 3, data_vencimento: '2026-11-10', valor: 821.22 }, { numero: 4, data_vencimento: '2026-12-10', valor: 821.22 }] });
    expect(g.vincular).toHaveBeenCalledWith('cli', 'doc-nf', ['lanc-1', 'lanc-2', 'lanc-3', 'lanc-4']);
  });
  it('B2 pago: o botão apagado, com a frase (nunca some)', () => {
    montar({ situacao: { status: 'realizado', dataPagamento: '2026-08-12', conciliadoEm: null } });
    const b = screen.getByTestId('parcelar-este-abrir');
    expect(b).toBeDisabled();
    const frase = 'Já pago em 12/08/2026: parcelar mudaria o que saiu da conta. Desfaça o pagamento antes.';
    expect(b.getAttribute('title')).toBe(frase);
    expect(screen.getByTestId('parcelar-este-trava').textContent).toBe(frase);
  });
  it('B3 conciliado: a frase da conciliação', () => {
    montar({ situacao: { status: 'conciliado', dataPagamento: '2026-08-12', conciliadoEm: '2026-08-15T10:00:00Z' } });
    expect(screen.getByTestId('parcelar-este-abrir').getAttribute('title')).toBe('Conciliado com o extrato em 15/08/2026: desfaça a conciliação antes.');
  });
  it('B4 conta que não é cartão: sem sugestão, o 1º vencimento vazio e obrigatório', async () => {
    montar({ cartao: false });
    fireEvent.click(screen.getByTestId('parcelar-este-abrir'));
    fireEvent.change(screen.getByTestId('parcelar-este-n'), { target: { value: '4' } });
    expect(screen.getByTestId('parcelar-este-motivo').textContent).toBe('Informe o 1º vencimento.');
    expect(textoDoVenc()).toBe('');
    expect(cartaoNoBanco.diasDoCartao).not.toHaveBeenCalled();
    expect(screen.getByTestId('parcelar-este-confirmar')).toBeDisabled();
  });
  it('B5 a ligação no Editar: só a saída gravada, sem parcelamento/financiamento, não gerada pelo sistema, não cancelada', () => {
    const tela = readFileSync(resolve(__dirname, './LancamentoV2Dialog.tsx'), 'utf8');
    expect(tela).toMatch(/\{isEdit && lancamento && clienteAtual\?\.id && !financiamentoDoLanc && !lancamento\.origem_tipo && !lancamento\.cancelado\s+&& lancamento\.tipo_operacao\.startsWith\('2'\) && \(\s+<ParcelarEsteLancamento/);
  });
});

/** P104 — a parcela lançada SOLTA ("… - 6/6", o caso da NF 46.994) não oferece "Parcelar"; o à vista de verdade, sim. */
describe('P104 — parcela solta no bloco Parcelamento', () => {
  const IRMAS = [620.85, 620.80, 620.83, 620.83, 620.83, 620.83].map((v, i) => ({ id: i === 5 ? 'lanc-1' : `irma-${i + 1}`,
    descricao: `Tinta sintetica - ${i + 1}/6`, valorCent: Math.round(v * 100) }));
  it('B6 a 6/6 com as 5 irmãs: sem "Parcelar", sem "à vista (1/1)", a frase com "achadas 6 de 6"', async () => {
    const buscar = vi.fn(async (_c: string, _f: string, _n: number) => IRMAS);
    render(<ParcelarEsteLancamento clienteId="cli" lancamento={{ ...LANC, descricao: 'Tinta sintetica - 6/6', valorCent: 62083 }} situacao={ABERTO}
      vencimentoAtual="2026-10-10" conta={{ id: 'elo', nome: 'Cartão Elo Sintetico', cartao: true }} onParcelado={vi.fn()} buscarIrmas={buscar} />);
    await waitFor(() => expect(screen.getByTestId('parcela-solta-frase').textContent).toBe('Parcela 6/6 lançada solta (sem parcelamento) · achadas 6 de 6'));
    expect(buscar).toHaveBeenCalledWith('cli', 'f1', 6);
    expect(screen.queryByTestId('parcelar-este-abrir')).toBeNull();
    expect(screen.queryByText(/à vista \(1\/1\)/)).toBeNull();
  });
  it('B7 o à vista de verdade: "hoje: à vista (1/1)" e o "Parcelar"; a busca de irmãs nem roda', () => {
    const buscar = vi.fn(async () => IRMAS);
    render(<ParcelarEsteLancamento clienteId="cli" lancamento={LANC} situacao={ABERTO} vencimentoAtual="2026-08-10"
      conta={{ id: 'elo', nome: 'Cartão Elo Sintetico', cartao: true }} onParcelado={vi.fn()} buscarIrmas={buscar} />);
    expect(screen.getByTestId('parcelar-este').textContent).toContain('hoje: à vista (1/1)');
    expect(screen.getByTestId('parcelar-este-abrir')).toBeEnabled();
    expect(buscar).not.toHaveBeenCalled();
  });
});
