/**
 * UI-ARRASTAR-ARQUIVO-01b — a planilha do Enriquecer (passo 1) e o diálogo "Importar Excel de classificação" da Mesa passaram
 * a aceitar ARRASTAR, na mesma altura do campo do sistema que havia; o tipo errado é recusado na área, antes do leitor.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  lerArquivo: vi.fn(async (_f: File) => {}),
  selecionarArquivo: vi.fn(async (_f: File | null) => null as unknown),
  toastErro: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: M.toastErro, warning: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'nj' } }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ useFinanceiroV2: () => ({ criarFornecedor: vi.fn(), loadContas: vi.fn(), contasBancarias: [] }) }));
vi.mock('@/components/financeiro-v2/NovoFornecedorDialog', () => ({ NovoFornecedorDialog: () => null }));
vi.mock('./MesaEnriquecimentoTab', () => ({ MesaEnriquecimentoTab: () => null }));
vi.mock('./EnriquecerPasso1DePara', () => ({ EnriquecerPasso1DePara: () => null }));
vi.mock('@/v2/hooks/useImportLancamentosExcel', () => ({
  useImportLancamentosExcel: () => ({
    dePara: { conta: {}, subcentro: {}, fazenda: {}, fornecedor: {}, safra: {} },
    pendentes: { total: 0 }, parse: null, arquivo: null,
    lendo: false, erro: null, classificacoes: [], fornecedores: [], fazendas: [], contasBancarias: [], safras: [],
    contasResolviveis: [],
    lerArquivo: M.lerArquivo, resolverManualmente: vi.fn(), alternarDescarte: vi.fn(), limpar: vi.fn(),
  }),
}));
vi.mock('@/v2/hooks/useImportarClassificacao', () => ({
  useImportarClassificacao: () => ({
    lote: null, errosParser: [], contasDistintas: [], contaMap: {}, origemConta: {}, falha: null, textoFalha: null,
    todasResolvidasOuIgnoradas: true, preResolverPelaMemoria: vi.fn(),
    popular: vi.fn(), resolverConta: vi.fn(), reset: vi.fn(), selecionarArquivo: M.selecionarArquivo,
    isPopulating: false, parsing: false, progresso: null,
  }),
}));
vi.mock('@/v2/hooks/useClassificacaoStaging', () => ({
  useSessoesClassificacao: () => ({ data: [] }),
  useClassificacaoStaging: () => ({ staging: [], casarSessao: vi.fn(), isCasando: false }),
}));

import { EnriquecerTresPassos } from './EnriquecerTresPassos';
import { EnriquecimentoImportarDialog } from './EnriquecimentoImportarDialog';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const soltar = (alvo: Element, arquivos: File[]) => fireEvent.drop(alvo, { dataTransfer: { files: arquivos, types: ['Files'] } });

beforeEach(() => {
  M.lerArquivo.mockClear(); M.selecionarArquivo.mockClear(); M.toastErro.mockClear();
  Element.prototype.scrollIntoView = () => {};
});

describe('Enriquecer · passo 1 — a área no lugar do campo do sistema, nos mesmos 28px', () => {
  const montar = () => { render(<EnriquecerTresPassos ano={2026} mes={9} clienteNome="NJ Pecuária" />); return screen.getByTestId('area-planilha-do-mes'); };
  it('convida numa linha curta (o rótulo acima já diz os tipos) e tem 28px', () => {
    const area = montar();
    expect(area.textContent).toBe('Clique ou arraste a planilha');
    expect(area.className).toContain('h-7');
    /* largura FIXA: a recusa não pode alargar a área (medido: 220 -> 258px sem ela) */
    expect(area.className).toContain('w-[264px]');
    expect(screen.getByText('Planilha do mês (.xlsx, .xls)')).toBeTruthy();
  });
  it('planilha SOLTA vai aos dois leitores, com o mesmo arquivo; `.xls` e `.xlsx` sem tipo também valem', async () => {
    const area = montar();
    const a = new File(['PK'], 'nj-set26.xlsx', { type: XLSX });
    soltar(area, [a]);
    await waitFor(() => expect(M.lerArquivo).toHaveBeenCalledTimes(1));
    expect(M.lerArquivo.mock.calls[0][0]).toBe(a);
    expect(M.selecionarArquivo.mock.calls[0][0]).toBe(a);
    soltar(area, [new File(['x'], 'antiga.xls', { type: 'application/vnd.ms-excel' })]);
    soltar(area, [new File(['PK'], 'sem-tipo.xlsx', { type: '' })]);
    await waitFor(() => expect(M.lerArquivo).toHaveBeenCalledTimes(3));
    expect((M.lerArquivo.mock.calls[2][0] as File).name).toBe('sem-tipo.xlsx');
  });
  it('tipo errado: recusado NA ÁREA, antes do leitor — nenhum toast de "não foi possível ler"', () => {
    const area = montar();
    soltar(area, [new File(['a;b'], 'planilha.csv', { type: 'text/csv' })]);
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Formato não aceito. Envie XLSX ou XLS.');
    expect(M.lerArquivo).not.toHaveBeenCalled();
    expect(M.selecionarArquivo).not.toHaveBeenCalled();
    expect(M.toastErro).not.toHaveBeenCalled();
  });
});

describe('Mesa · "Importar Excel de classificação" — a área nos mesmos 23px', () => {
  const montar = () => {
    render(<EnriquecimentoImportarDialog open onClose={() => {}} clienteId="nj" onImportado={() => {}} anoMes="2026-09" />);
    return screen.getByTestId('area-excel-de-classificacao');
  };
  it('convida, diz o tipo e tem 23px', () => {
    const area = montar();
    expect(area.textContent).toBe('Clique ou arraste a planilha · Excel');
    expect(area.className).toContain('h-[23px]');
  });
  it('planilha SOLTA vai ao leitor do staging, uma vez, com o mesmo arquivo', async () => {
    const area = montar();
    const a = new File(['PK'], 'nj-set26.xlsx', { type: XLSX });
    soltar(area, [a]);
    await waitFor(() => expect(M.selecionarArquivo).toHaveBeenCalledTimes(1));
    expect(M.selecionarArquivo.mock.calls[0][0]).toBe(a);
  });
  it('só `.xlsx`, como sempre: `.xls` é recusado na área e não chega ao leitor', () => {
    const area = montar();
    soltar(area, [new File(['x'], 'antiga.xls', { type: 'application/vnd.ms-excel' })]);
    expect(screen.getByTestId('area-de-arquivo-recusa').textContent).toBe('Formato não aceito. Envie XLSX.');
    expect(M.selecionarArquivo).not.toHaveBeenCalled();
  });
});
