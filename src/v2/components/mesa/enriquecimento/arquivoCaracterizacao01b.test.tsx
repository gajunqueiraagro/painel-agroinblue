/**
 * UI-ARRASTAR-ARQUIVO-01b — CARACTERIZAÇÃO da planilha do Enriquecer (passo 1) e do diálogo "Importar Excel de classificação"
 * da Mesa, ESCRITA ANTES DA TROCA: a planilha ESCOLHIDA chega aos MESMOS leitores, com o mesmo arquivo, antes e depois.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  lerArquivo: vi.fn(async (_f: File) => {}),
  selecionarArquivo: vi.fn(async (_f: File | null) => null as unknown),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
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
const planilha = (nome = 'nj-set26.xlsx') => new File(['PK'], nome, { type: XLSX });
const seletor = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  M.lerArquivo.mockClear(); M.selecionarArquivo.mockClear();
  Element.prototype.scrollIntoView = () => {};
});

describe('Enriquecer · passo 1 (planilha do mês)', () => {
  it('a planilha escolhida vai aos DOIS leitores (de-para e staging), com o mesmo arquivo, uma vez cada', async () => {
    render(<EnriquecerTresPassos ano={2026} mes={9} clienteNome="NJ Pecuária" />);
    const arquivo = planilha();
    fireEvent.change(seletor(), { target: { files: [arquivo] } });
    await waitFor(() => expect(M.lerArquivo).toHaveBeenCalledTimes(1));
    expect(M.lerArquivo.mock.calls[0][0]).toBe(arquivo);
    expect(M.selecionarArquivo).toHaveBeenCalledTimes(1);
    expect(M.selecionarArquivo.mock.calls[0][0]).toBe(arquivo);
  });
});

describe('Mesa · "Importar Excel de classificação"', () => {
  it('a planilha escolhida vai ao leitor do staging, com o mesmo arquivo, uma vez', async () => {
    render(<EnriquecimentoImportarDialog open onClose={() => {}} clienteId="nj" onImportado={() => {}} anoMes="2026-09" />);
    const arquivo = planilha();
    fireEvent.change(seletor(), { target: { files: [arquivo] } });
    await waitFor(() => expect(M.selecionarArquivo).toHaveBeenCalledTimes(1));
    expect(M.selecionarArquivo.mock.calls[0][0]).toBe(arquivo);
  });
});
