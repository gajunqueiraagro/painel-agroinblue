/**
 * FIN-FINANC-28 · PASSO 6 — o lançamento visto pelo financiamento, no modal do Financeiro. As candidatas são as do motor do 4b ao
 * contrário (`fn_lancamento_financiamento`); a tela lê, simula e confirma. Já vinculado, o rodapé diz onde e abre o contrato.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { desfazivelPorAqui, fraseDoOndeEsta, lerLancamentoNoFinanciamento, type LancamentoNoFinanciamento } from '@/lib/financiamentos/buscaNoContrato';

const hook = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/hooks/useLancamentoNoFinanciamento', () => ({ useLancamentoNoFinanciamento: () => hook.atual }));
import { FinanciamentoDoLancamento, MOTIVO_CRIAR_CONTRATO_DEPOIS, VincularFinanciamentoDialog } from './FinanciamentoDoLancamento';

const CAND = { lancamento_id: 'x', data: '2031-06-12', valor: 550, descricao: 'PAGTO', conta: null, favorecido: 'Banco', extrato: false, dias: 2,
  pontos: 100, motivos: ['valor = total'], status_transacao: 'realizado', papel_sugerido: 'total', previsto: 550, diferenca: 0, outro: null };
const ENV = (o: Record<string, unknown> = {}) => ({
  lancamento: { id: 'x', tipo_operacao: '2-Saídas', data: '2031-06-12', valor: 550, descricao: 'PAGTO', cancelado: false },
  atual: null,
  parcelas: [{ ...CAND, financiamento_id: 'f1', numero_contrato: 'C-1', descricao_contrato: 'Custeio', credor: 'Banco', parcela_id: 'p1', parcela: 1, vencimento: '2031-06-10' }],
  liberacoes: [], ...o,
});

function api(o: Record<string, unknown> = {}) {
  return {
    dado: null,
    vincularParcela: vi.fn(async (_p: string, _pa: string, _m: boolean, s: boolean) => ({ simulado: s, recusa: null, avisos: [], cancelados: 2, movido: false, paga: true })),
    vincularLiberacao: vi.fn(async () => null), lerEncargo: vi.fn(async () => ({ elegivel: true, frase: null, papelSugerido: 'iof', candidatas: [] })),
    vincularEncargo: vi.fn(async () => null), desfazer: vi.fn(async () => null), ...o,
  };
}

describe('o leitor', () => {
  it('lê candidatas e onde o lançamento está; peça torta = nulo', () => {
    const d = lerLancamentoNoFinanciamento(ENV());
    expect(d?.parcelas[0]).toMatchObject({ parcelaId: 'p1', financiamentoId: 'f1', numeroContrato: 'C-1', papelSugerido: 'total' });
    expect(lerLancamentoNoFinanciamento(ENV({ atual: { tipo: 'invento', financiamento_id: 'f1' } }))).toBeNull();
    const v = lerLancamentoNoFinanciamento(ENV({ atual: { tipo: 'parcela', financiamento_id: 'f1', numero_contrato: 'C-1', parcela: 2, papel: 'juros', vinculo_id: 'v1' } }));
    expect(v?.atual && fraseDoOndeEsta(v.atual)).toBe('C-1 · parcela 2 (juros)');
    expect(v?.atual && desfazivelPorAqui(v.atual)).toBe(true);
    const motor = lerLancamentoNoFinanciamento(ENV({ atual: { tipo: 'parcela', financiamento_id: 'f1', numero_contrato: 'C-1', parcela: 2, papel: 'principal', vinculo_id: null } }));
    expect(motor?.atual && desfazivelPorAqui(motor.atual)).toBe(false);
  });
});

describe('o diálogo', () => {
  it('parcela: escolher simula; "Vincular" grava com o papel sugerido', async () => {
    const a = api(); const fechar = vi.fn();
    const d = lerLancamentoNoFinanciamento(ENV()) as LancamentoNoFinanciamento;
    render(<VincularFinanciamentoDialog dado={d} api={a} aoFechar={fechar} />);
    fireEvent.click(screen.getByTestId('parcela-candidata'));
    await waitFor(() => expect(screen.getByTestId('previa-do-vinculo').textContent).toContain('a parcela fica paga'));
    expect(a.vincularParcela).toHaveBeenLastCalledWith('p1', 'total', false, true);
    fireEvent.click(screen.getByTestId('gravar-parcela-do-modal'));
    await waitFor(() => expect(a.vincularParcela).toHaveBeenLastCalledWith('p1', 'total', false, false));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
  });
  it('entrada: a aba Liberação; grava "em conta" com a data e o valor do lançamento; a recusa fica escrita', async () => {
    const a = api({ vincularLiberacao: vi.fn(async () => 'Este lançamento já está ligado a outra liberação.') });
    const d = lerLancamentoNoFinanciamento(ENV({
      lancamento: { id: 'x', tipo_operacao: '1-Entradas', data: '2031-01-15', valor: 1000, descricao: 'LIB', cancelado: false }, parcelas: [],
      liberacoes: [{ ...CAND, papel_sugerido: null, financiamento_id: 'f1', numero_contrato: 'C-1', descricao_contrato: 'Custeio', credor: 'Banco', saldo_a_liberar: 1000 }],
    })) as LancamentoNoFinanciamento;
    render(<VincularFinanciamentoDialog dado={d} api={a} aoFechar={vi.fn()} />);
    fireEvent.click(screen.getByTestId('liberacao-candidata'));
    fireEvent.click(screen.getByTestId('gravar-liberacao-do-modal'));
    await waitFor(() => expect(screen.getByTestId('previa-do-vinculo').textContent).toBe('Este lançamento já está ligado a outra liberação.'));
    expect(a.vincularLiberacao).toHaveBeenCalledWith('f1', '2031-01-15', 1000);
  });
  it('"Criar contrato" sem o formulário novo fica apagado com o motivo; com ele, entrega o lançamento', () => {
    const d = lerLancamentoNoFinanciamento(ENV()) as LancamentoNoFinanciamento;
    const criar = vi.fn();
    const { rerender } = render(<VincularFinanciamentoDialog dado={d} api={api()} aoFechar={vi.fn()} />);
    fireEvent.click(screen.getByText('Criar contrato', { selector: 'button[role=radio], button:not([data-testid])' }));
    expect(screen.getByTestId('criar-contrato-do-modal')).toBeDisabled();
    expect(screen.getByTestId('criar-contrato-do-modal').getAttribute('title')).toBe(MOTIVO_CRIAR_CONTRATO_DEPOIS);
    rerender(<VincularFinanciamentoDialog dado={d} api={api()} aoFechar={vi.fn()} onCriarContrato={criar} />);
    fireEvent.click(screen.getByTestId('criar-contrato-do-modal'));
    expect(criar).toHaveBeenCalledWith(d);
  });
});

describe('o rodapé do modal', () => {
  it('vinculado: diz onde e abre o contrato; o desfazer só quando se desfaz por aqui', () => {
    hook.atual = api({ dado: lerLancamentoNoFinanciamento(ENV({ atual: { tipo: 'liberacao', financiamento_id: 'f9', numero_contrato: 'C-9', liberacao_id: 'l1' } })) });
    const abrir = vi.fn();
    render(<FinanciamentoDoLancamento lancamentoId="x" clienteId="c" onAbrirContrato={abrir} />);
    expect(screen.getByTestId('abrir-contrato-do-lancamento').textContent).toBe('↔ C-9 · liberação');
    fireEvent.click(screen.getByTestId('abrir-contrato-do-lancamento'));
    expect(abrir).toHaveBeenCalledWith('f9');
    expect(screen.getByTestId('desfazer-financiamento')).toBeTruthy();
  });
  it('não vinculado: o botão com o número de candidatas; transferência não tem o botão', () => {
    hook.atual = api({ dado: lerLancamentoNoFinanciamento(ENV()) });
    const { unmount } = render(<FinanciamentoDoLancamento lancamentoId="x" clienteId="c" />);
    expect(screen.getByTestId('acao-vincular-financiamento').textContent).toContain('Financiamento (1)');
    unmount();
    hook.atual = api({ dado: lerLancamentoNoFinanciamento(ENV({ lancamento: { id: 'x', tipo_operacao: '3-Transferências', data: '2031-06-12', valor: 1, descricao: 't', cancelado: false } })) });
    render(<FinanciamentoDoLancamento lancamentoId="x" clienteId="c" />);
    expect(screen.queryByTestId('acao-vincular-financiamento')).toBeNull();
  });
  it('fonte: o modal do Financeiro monta a peça fora do título de OC; o diálogo tem tamanho fixo e não soma', () => {
    const modal = readFileSync(resolve(__dirname, '../financeiro-v2/LancamentoV2Dialog.tsx'), 'utf8');
    expect(modal).toMatch(/!lancamento\.cancelado && parteOCLida && !parteOCViva && \(\s*<FinanciamentoDoLancamento/);
    const fonte = readFileSync(resolve(__dirname, 'FinanciamentoDoLancamento.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(fonte).toMatch(/h-\[440px\] w-\[780px\]/);
    expect(fonte).not.toMatch(/\.reduce\(|\+=/);
  });
});
