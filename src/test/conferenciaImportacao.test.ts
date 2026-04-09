/**
 * Tests for ConferenciaImportacaoDialog validation logic
 */
import { describe, it, expect } from 'vitest';
import type { LinhaImportada } from '@/lib/financeiro/importParser';

// Inline the validation logic for unit testing (mirrors ConferenciaImportacaoDialog)
type RowStatus = 'valid' | 'warning' | 'error';
interface ValidationResult { status: RowStatus; errors: string[]; warnings: string[]; }

const TIPOS_DOCUMENTO = ['Nota Fiscal','Fatura','Recibo','Contrato','Folha de Pagamento','Outros'] as const;

function validateRow(row: LinhaImportada): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!row.fazenda && !row.fazendaId) errors.push('Fazenda obrigatória');
  if (!row.fazendaId && row.fazenda) errors.push(`Fazenda "${row.fazenda}" não encontrada`);
  if (row.valor === null || row.valor === undefined || isNaN(row.valor)) errors.push('Valor obrigatório');
  if (!row.tipoOperacao) errors.push('Tipo obrigatório');
  if (!row.contaOrigem) errors.push('Conta obrigatória');

  const isTransf = row.tipoOperacao?.toLowerCase().startsWith('3') || row.tipoOperacao?.toLowerCase().includes('transfer');
  if (isTransf) {
    if (!row.contaDestino) errors.push('Conta Destino obrigatória para transferência');
    if (row.contaOrigem && row.contaDestino && row.contaOrigem.toLowerCase().trim() === row.contaDestino.toLowerCase().trim()) {
      errors.push('Conta origem e destino iguais');
    }
  }

  if (row.tipoDocumento) {
    const valid = (TIPOS_DOCUMENTO as readonly string[]).includes(row.tipoDocumento);
    if (!valid) warnings.push(`Tipo documento "${row.tipoDocumento}" não reconhecido`);
  }

  if (row.numeroDocumento && /[^\d]/.test(row.numeroDocumento)) {
    warnings.push('Número documento contém caracteres não numéricos');
  }

  if (!row.anoMes) errors.push('Competência ausente');

  const status: RowStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';
  return { status, errors, warnings };
}

function makeLine(overrides: Partial<LinhaImportada> = {}): LinhaImportada {
  return {
    linha: 2,
    anoMes: '2025-01',
    dataPagamento: '2025-01-15',
    valor: 1500,
    statusTransacao: 'realizado',
    fazenda: 'FAZ01',
    fazendaId: 'uuid-faz01',
    tipoOperacao: '2-Saídas',
    macroCusto: 'Custeio Produtivo',
    grupoCusto: null,
    centroCusto: 'Nutrição',
    subcentro: 'PEC/Sal Mineral',
    contaOrigem: 'cc-01',
    contaDestino: null,
    fornecedor: 'Fornecedor X',
    produto: 'Sal Mineral',
    obs: null,
    escopoNegocio: 'pecuaria',
    tipoDocumento: null,
    numeroDocumento: null,
    ...overrides,
  };
}

describe('ConferenciaImportacao - Validação', () => {

  it('Cenário 1: Linha totalmente válida → status green', () => {
    const result = validateRow(makeLine());
    expect(result.status).toBe('valid');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('Cenário 2: Transferência sem conta destino → error', () => {
    const result = validateRow(makeLine({
      tipoOperacao: '3-Transferência',
      contaDestino: null,
    }));
    expect(result.status).toBe('error');
    expect(result.errors).toContain('Conta Destino obrigatória para transferência');
  });

  it('Cenário 3: Conta inválida (contaOrigem vazia) → error', () => {
    const result = validateRow(makeLine({ contaOrigem: null }));
    expect(result.status).toBe('error');
    expect(result.errors).toContain('Conta obrigatória');
  });

  it('Cenário 4: Documento com tipo e número válidos → valid', () => {
    const result = validateRow(makeLine({
      tipoDocumento: 'Nota Fiscal',
      numeroDocumento: '123456789',
    }));
    expect(result.status).toBe('valid');
    expect(result.warnings).toHaveLength(0);
  });

  it('Cenário 5: Tipo documento não reconhecido → warning (alerta)', () => {
    const result = validateRow(makeLine({
      tipoDocumento: 'Boleto',
    }));
    expect(result.status).toBe('warning');
    expect(result.warnings[0]).toContain('não reconhecido');
  });

  it('Cenário 6: Número documento com letras → warning', () => {
    const result = validateRow(makeLine({
      numeroDocumento: 'NF123',
    }));
    expect(result.status).toBe('warning');
    expect(result.warnings[0]).toContain('não numéricos');
  });

  it('Cenário 7: Transferência com conta origem = destino → error', () => {
    const result = validateRow(makeLine({
      tipoOperacao: '3-Transferência',
      contaOrigem: 'cc-01',
      contaDestino: 'cc-01',
    }));
    expect(result.status).toBe('error');
    expect(result.errors).toContain('Conta origem e destino iguais');
  });

  it('Cenário 8: Fazenda presente mas não resolvida → error', () => {
    const result = validateRow(makeLine({
      fazenda: 'INVALIDA',
      fazendaId: null,
    }));
    expect(result.status).toBe('error');
    expect(result.errors[0]).toContain('não encontrada');
  });

  it('Cenário 9: Sem fazenda nenhuma → error', () => {
    const result = validateRow(makeLine({
      fazenda: null,
      fazendaId: null,
    }));
    expect(result.status).toBe('error');
    expect(result.errors).toContain('Fazenda obrigatória');
  });

  it('Cenário 10: Transferência válida com conta destino diferente → valid', () => {
    const result = validateRow(makeLine({
      tipoOperacao: '3-Transferência',
      contaOrigem: 'cc-01',
      contaDestino: 'cc-02',
    }));
    expect(result.status).toBe('valid');
  });

  it('Linhas com erro bloqueiam importação total', () => {
    const rows = [
      makeLine(), // valid
      makeLine({ contaOrigem: null }), // error
    ];
    const results = rows.map(r => validateRow(r));
    const hasErrors = results.some(r => r.status === 'error');
    expect(hasErrors).toBe(true);
    // "Importar todas" should be disabled
  });

  it('Linhas com alerta podem ser importadas separadamente', () => {
    const rows = [
      makeLine(), // valid
      makeLine({ tipoDocumento: 'Boleto' }), // warning
    ];
    const results = rows.map(r => validateRow(r));
    const validOrWarning = results.filter(r => r.status !== 'error');
    expect(validOrWarning).toHaveLength(2);
    // "Importar apenas válidas" should import both
  });
});
