/**
 * OC-LIQ-SINAL-01 (B) — a prévia, o PDF e o Excel do Resumo ganham a coluna Despesas, e a coluna do
 * dinheiro diz de que lado ela fala ("Recebido"/"Falta receber" na venda e no abate; "Pago"/"Falta
 * pagar" na compra).
 * ⚠ jsPDF, autotable e xlsx sao TROCADOS por espioes que guardam o que receberam: o que se trava aqui e'
 *   o CABECALHO e a linha, nao o desenho da folha. O resumo vem pronto (a regra do lado tem teste
 *   proprio em `ocResumo.lado.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const autotable = vi.fn();
const planilhas: unknown[][][] = [];
vi.mock('jspdf', () => ({
  default: class {
    setFillColor() {} rect() {} setTextColor() {} setFontSize() {} setFont() {} text() {} setDrawColor() {}
    setLineWidth() {} line() {} addPage() {} setPage() {} save() {} roundedRect() {}
    getNumberOfPages() { return 1; }
    getTextWidth() { return 10; }
  },
}));
vi.mock('jspdf-autotable', () => ({ default: (...a: unknown[]) => autotable(...a) }));
vi.mock('xlsx', () => ({
  utils: { book_new: () => ({}), aoa_to_sheet: (aoa: unknown[][]) => { planilhas.push(aoa); return {}; }, book_append_sheet: () => {} },
  writeFile: () => {},
}));
vi.mock('@/lib/pdf/pdfChassi', () => ({
  carregarLogoBase64: () => Promise.reject(new Error('sem logo')), addLogoToDoc: () => {}, PALETA: { AZUL_PRIMARIO: [0, 0, 0] },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const linhaVenda = {
  operacao_id: 'c80ebe9e', data: '2025-01-17', descricao: 'Abate 020 V', fornecedor: 'Frizelo', tipo: 'abate',
  qtdNegociada: 20, qtdRecebida: 20, dataRecebimento: { primeira: '2025-01-17', n: 1 },
  valor: 107367.46, pago: 102311.46, faltaPagar: 5056, despesas: 5772.83, situacao: 'paga 95%', tomSituacao: 'parcial' as const,
};
const linhaCompra = { ...linhaVenda, operacao_id: 'f56c50d3', tipo: 'compra', descricao: 'Compra 110', valor: 892645, pago: 892645,
  faltaPagar: 0, despesas: 0, situacao: 'paga', tomSituacao: 'ok' as const };
let blocos: unknown[] = [];
vi.mock('@/v2/lib/ocResumo', async (orig) => {
  const real = await orig<typeof import('@/v2/lib/ocResumo')>();
  return { ...real, carregarResumoOC: vi.fn(async () => ({ blocos, geradoEm: new Date('2026-09-25T12:00:00') })) };
});

import { ResumoOperacoesModal } from '@/components/operacao-comercial/central/ResumoOperacoesModal';

const filtros = { produtor: 'Vera', fazenda: 'todas as fazendas', periodoIni: '', periodoFim: '', tipo: 'todos', chips: [] };
const montar = () => render(<ResumoOperacoesModal open onClose={vi.fn()} clienteId="cli" operacoes={[]} filtros={filtros}
  nomeContraparte={() => 'x'} />);
const cabecalhosPdf = () => autotable.mock.calls.map(c => (c[1] as { head: string[][] }).head[0]);

beforeEach(() => { autotable.mockReset(); planilhas.length = 0; });

const parcelaFrete = { operacao_id: '744c520e', vencimento: '2025-07-15', descricao: 'Venda 066 G', fornecedor: 'Transp.',
  sequencia: 1, totalParcelas: 1, gado: 'entrou 30/06', valor: 20615, situacao: 'a vencer', tomSituacao: 'aberto' as const, diasVencida: 0 };

describe('Resumo com Despesas', () => {
  it('previa de abate: Recebido, Falta receber e Despesas, com os numeros pelo lado', async () => {
    blocos = [{ tipo: 'abate', entrou: [linhaVenda], naoEntrou: [], faltaPagar: [], despesasEmAberto: [] }];
    montar();
    await waitFor(() => expect(screen.getAllByText('Despesas').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Recebido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Falta receber').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pago')).toBeNull();
    expect(screen.getAllByText('5.772,83').length).toBeGreaterThan(0);
  });

  it('PDF: as duas tabelas de linhas tem Recebido, Falta receber e Despesas; a de parcelas nao muda', async () => {
    blocos = [{ tipo: 'abate', entrou: [linhaVenda], naoEntrou: [linhaVenda], faltaPagar: [], despesasEmAberto: [] }];
    montar();
    fireEvent.click(await screen.findByText('PDF'));
    await waitFor(() => expect(autotable).toHaveBeenCalledTimes(3));
    const [entrou, nao, parcelas] = cabecalhosPdf();
    expect(entrou).toEqual(expect.arrayContaining(['Recebido', 'Falta receber', 'Despesas']));
    expect(nao).toEqual(expect.arrayContaining(['Recebido', 'Falta receber', 'Despesas']));
    expect(parcelas).not.toContain('Despesas');
    /* A linha leva o numero das despesas na coluna certa (antes de Situacao). */
    const corpo = (autotable.mock.calls[0][1] as { body: unknown[][] }).body[0];
    expect(corpo[entrou.indexOf('Despesas')]).toBe('5.772,83');
  });

  it('PDF de compra: Pago e Falta pagar, como sempre', async () => {
    blocos = [{ tipo: 'compra', entrou: [linhaCompra], naoEntrou: [], faltaPagar: [], despesasEmAberto: [] }];
    montar();
    fireEvent.click(await screen.findByText('PDF'));
    await waitFor(() => expect(autotable).toHaveBeenCalled());
    expect(cabecalhosPdf()[0]).toEqual(expect.arrayContaining(['Pago', 'Falta pagar', 'Despesas']));
  });

  it('Excel: coluna Despesas nas abas de linhas, com o numero e o total', async () => {
    blocos = [{ tipo: 'abate', entrou: [linhaVenda], naoEntrou: [], faltaPagar: [], despesasEmAberto: [] }];
    montar();
    fireEvent.click(await screen.findByText('Excel'));
    const [entrou, nao] = planilhas;
    const col = entrou[0].indexOf('Despesas');
    expect(col).toBeGreaterThan(-1);
    expect(nao[0]).toContain('Despesas');
    expect(entrou[1][col]).toBe(5772.83);
    expect(entrou[2][col]).toBe(5772.83); // a linha de TOTAL
  });

  it('OC-STATUS-LADO-01: despesas em aberto em lista, secao de PDF e aba de Excel proprias', async () => {
    blocos = [{ tipo: 'venda', entrou: [linhaVenda], naoEntrou: [], faltaPagar: [], despesasEmAberto: [parcelaFrete] }];
    montar();
    await waitFor(() => expect(screen.getByText('Despesas em aberto')).toBeTruthy());
    fireEvent.click(screen.getByText('PDF'));
    await waitFor(() => expect(autotable).toHaveBeenCalledTimes(4));
    const corpoDesp = (autotable.mock.calls[3][1] as { body: unknown[][] }).body[0];
    expect(JSON.stringify(corpoDesp)).toContain('20.615,00');
    fireEvent.click(screen.getByText('Excel'));
    const abaDesp = planilhas.find(a => a.some(l => l.includes(20615)));
    expect(abaDesp?.[0]).toEqual(['Tipo', 'Vence', 'Operação', 'Fornecedor', 'Gado', 'Valor', 'Situação']);
  });

  it('sem despesa em aberto, a lista nao aparece (e a busca sabe achar: a de cima continua)', async () => {
    blocos = [{ tipo: 'venda', entrou: [linhaVenda], naoEntrou: [], faltaPagar: [parcelaFrete], despesasEmAberto: [] }];
    montar();
    await waitFor(() => expect(screen.getAllByText('Falta receber').length).toBeGreaterThan(0));
    /* A busca sabe achar: a parcela do lado esta' na lista de cima. */
    expect(screen.getAllByText('20.615,00').length).toBeGreaterThan(0);
    expect(screen.queryByText('Despesas em aberto')).toBeNull();
  });
});
