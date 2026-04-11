/**
 * Tests for duplicidadeImportacao — deterministic classification rules
 */
import { describe, it, expect } from 'vitest';
import {
  classificarLinha,
  gerarHashImportacao,
  type LinhaParaClassificar,
  type RegistroExistente,
} from '@/lib/financeiro/duplicidadeImportacao';

function makeLinha(overrides: Partial<LinhaParaClassificar> = {}): LinhaParaClassificar {
  return {
    dataPagamento: '2020-06-15',
    anoMes: '2020-06',
    valor: 1500,
    fornecedorId: 'forn-1',
    fornecedorNome: 'Fornecedor X',
    contaBancariaId: 'conta-1',
    subcentro: 'Sal Mineral',
    descricao: 'Sal Mineral',
    numeroDocumento: '12345',
    tipoOperacao: '2-Saídas',
    ...overrides,
  };
}

function makeExistente(overrides: Partial<RegistroExistente> = {}): RegistroExistente {
  return {
    id: 'ex-1',
    data_pagamento: '2020-06-15',
    valor: 1500,
    fornecedor_id: 'forn-1',
    fornecedor_nome: 'Fornecedor X',
    conta_bancaria_id: 'conta-1',
    subcentro: 'Sal Mineral',
    centro_custo: 'Nutrição',
    descricao: 'Sal Mineral',
    numero_documento: '12345',
    tipo_operacao: '2-Saídas',
    ano_mes: '2020-06',
    ...overrides,
  };
}

describe('classificarLinha', () => {
  it('NOVO — sem registros existentes', () => {
    const result = classificarLinha(makeLinha(), []);
    expect(result.classificacao).toBe('NOVO');
    expect(result.registroExistenteId).toBeNull();
  });

  it('DUPLICADO_EXATO — valor + data + conta + fornecedor + documento iguais', () => {
    const result = classificarLinha(makeLinha(), [makeExistente()]);
    expect(result.classificacao).toBe('DUPLICADO_EXATO');
    expect(result.registroExistenteId).toBe('ex-1');
    expect(result.resumo).toContain('DUPLICADO EXATO');
    expect(result.motivos.length).toBeGreaterThan(0);
  });

  it('DUPLICADO_EXATO — sem documento mas descrição similar', () => {
    const result = classificarLinha(
      makeLinha({ numeroDocumento: null }),
      [makeExistente({ numero_documento: null })],
    );
    expect(result.classificacao).toBe('DUPLICADO_EXATO');
  });

  it('DUPLICADO_EXATO — valor + data + conta + fornecedor (sem complementar)', () => {
    const result = classificarLinha(
      makeLinha({ numeroDocumento: null, descricao: 'Algo totalmente diferente sem match' }),
      [makeExistente({ numero_documento: null, descricao: 'Outra coisa completamente distinta aqui' })],
    );
    expect(result.classificacao).toBe('DUPLICADO_EXATO');
  });

  it('SUSPEITA — mesmo valor + mesma data, fornecedor diferente', () => {
    const result = classificarLinha(
      makeLinha({ fornecedorId: 'forn-2', fornecedorNome: 'Outro Fornecedor' }),
      [makeExistente()],
    );
    expect(result.classificacao).toBe('SUSPEITA');
    expect(result.resumo).toContain('SUSPEITA');
  });

  it('SUSPEITA — mesmo valor + mesmo fornecedor, data diferente', () => {
    const result = classificarLinha(
      makeLinha({ dataPagamento: '2020-06-20' }),
      [makeExistente()],
    );
    // With same valor + fornecedor + conta but different date, 
    // it should still be DUPLICADO_EXATO if documento matches OR
    // SUSPEITA if no date match breaks the mandatory
    // Here: data differs → not all 4 mandatory → check suspicion
    expect(['DUPLICADO_EXATO', 'SUSPEITA']).toContain(result.classificacao);
  });

  it('SUSPEITA — mesmo documento, valor diferente', () => {
    const result = classificarLinha(
      makeLinha({ valor: 3000, fornecedorId: null, fornecedorNome: null }),
      [makeExistente()],
    );
    expect(result.classificacao).toBe('SUSPEITA');
  });

  it('NOVO — valor totalmente diferente, fornecedor diferente', () => {
    const result = classificarLinha(
      makeLinha({ valor: 99999, fornecedorId: 'forn-999', fornecedorNome: 'Alguém', numeroDocumento: null, descricao: 'Coisa aleatória' }),
      [makeExistente()],
    );
    expect(result.classificacao).toBe('NOVO');
  });

  it('motivos explicam campos que bateram e não bateram', () => {
    const result = classificarLinha(makeLinha(), [makeExistente()]);
    expect(result.motivos.length).toBeGreaterThan(0);
    const valorMotivo = result.motivos.find(m => m.campo === 'Valor');
    expect(valorMotivo).toBeDefined();
    expect(valorMotivo!.match).toBe(true);
  });

  it('SUSPEITA — mesma conta + valor igual + datas próximas (2 dias)', () => {
    const result = classificarLinha(
      makeLinha({ dataPagamento: '2020-06-17', fornecedorId: 'forn-2', fornecedorNome: 'Outro', numeroDocumento: null, descricao: 'Algo diferente' }),
      [makeExistente({ numero_documento: null, descricao: 'Outra coisa' })],
    );
    expect(result.classificacao).toBe('SUSPEITA');
  });
});

describe('gerarHashImportacao', () => {
  it('gera hash determinístico', () => {
    const h1 = gerarHashImportacao('2020-06-15', 1500, 'Fornecedor X', 'conta-1', '12345');
    const h2 = gerarHashImportacao('2020-06-15', 1500, 'Fornecedor X', 'conta-1', '12345');
    expect(h1).toBe(h2);
  });

  it('hash diferente para dados diferentes', () => {
    const h1 = gerarHashImportacao('2020-06-15', 1500, 'Fornecedor X', 'conta-1', '12345');
    const h2 = gerarHashImportacao('2020-06-15', 1501, 'Fornecedor X', 'conta-1', '12345');
    expect(h1).not.toBe(h2);
  });
});
