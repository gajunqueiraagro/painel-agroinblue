/**
 * Teste de validação real: grupo R$ 1.537,52 de jun/2020 Sta. Rita
 * Dados exatos extraídos do banco de produção
 */
import { describe, it, expect } from 'vitest';
import {
  classificarLote,
  gerarChaveForteLinha,
  gerarChaveForteExistente,
  type RegistroExistente,
  type LinhaParaClassificar,
} from '@/lib/financeiro/duplicidadeImportacao';

const CONTA_BB = 'a5ed9922-e476-4ec0-a19c-6481140e52eb';
const FORNECEDOR_BRADESCO = 'de827aed-5524-4865-9fb6-74aa2b355cce';

// Registros REAIS do banco
const bancoReal: RegistroExistente[] = [
  {
    id: '79a96a33-1c1a-400d-a761-93e102e1d46f',
    data_pagamento: '2020-06-10',
    data_competencia: '2020-06-10',
    valor: 1537.52,
    fornecedor_id: FORNECEDOR_BRADESCO,
    fornecedor_nome: 'Banco Bradesco',
    conta_bancaria_id: CONTA_BB,
    subcentro: 'Distribuição de Dividendos Despesas Pessoais',
    centro_custo: 'Pessoas',
    descricao: 'okBradesco Consorcio',
    numero_documento: null,
    tipo_operacao: '2-Saídas',
    ano_mes: '2020-06',
  },
  {
    id: '1c5df343-e5f5-4251-a743-91815189f89f',
    data_pagamento: '2020-06-10',
    data_competencia: '2020-06-10',
    valor: 1537.52,
    fornecedor_id: FORNECEDOR_BRADESCO,
    fornecedor_nome: 'Banco Bradesco',
    conta_bancaria_id: CONTA_BB,
    subcentro: 'Distribuição de Dividendos Despesas Pessoais',
    centro_custo: 'Pessoas',
    descricao: 'Bradesco Consorcio',
    numero_documento: null,
    tipo_operacao: '2-Saídas',
    ano_mes: '2020-06',
  },
];

// Linhas do ARQUIVO (simulando reimportação)
function makeLinhaArquivo(desc: string): LinhaParaClassificar {
  return {
    dataPagamento: '2020-06-10',
    anoMes: '2020-06',
    valor: 1537.52,
    fornecedorId: FORNECEDOR_BRADESCO,
    fornecedorNome: 'Banco Bradesco',
    contaBancariaId: CONTA_BB,
    subcentro: 'Distribuição de Dividendos Despesas Pessoais',
    descricao: desc,
    numeroDocumento: null,
    tipoOperacao: '2-Saídas',
  };
}

describe('Caso real jun/2020 Sta. Rita — grupo R$ 1.537,52', () => {
  it('chave forte agrupa "okBradesco Consorcio" e "Bradesco Consorcio" juntos', () => {
    const k1 = gerarChaveForteExistente(bancoReal[0]); // okBradesco
    const k2 = gerarChaveForteExistente(bancoReal[1]); // Bradesco
    console.log('Chave banco[0] (okBradesco):', k1);
    console.log('Chave banco[1] (Bradesco):', k2);
    expect(k1).toBe(k2);
  });

  it('chave forte da linha do arquivo match com banco', () => {
    const kLinha = gerarChaveForteLinha(makeLinhaArquivo('Bradesco Consorcio'));
    const kBanco = gerarChaveForteExistente(bancoReal[1]);
    console.log('Chave linha:', kLinha);
    console.log('Chave banco:', kBanco);
    expect(kLinha).toBe(kBanco);
  });

  it('2 arquivo × 2 banco = 2 DUPLICADO_EXATO', () => {
    const linhas = [
      { index: 0, linha: makeLinhaArquivo('okBradesco Consorcio') },
      { index: 1, linha: makeLinhaArquivo('Bradesco Consorcio') },
    ];
    const resultados = classificarLote(linhas, bancoReal);
    
    expect(resultados.size).toBe(2);
    const values = [...resultados.values()];
    console.log('Resultados:', values.map(v => ({ class: v.classificacao, resumo: v.resumo, grupoArq: v.grupoArquivo, grupoBco: v.grupoBanco })));
    
    expect(values.every(v => v.classificacao === 'DUPLICADO_EXATO')).toBe(true);
    expect(values[0].grupoArquivo).toBe(2);
    expect(values[0].grupoBanco).toBe(2);
  });

  it('3 arquivo × 2 banco = 2 DUPLICADO_EXATO + 1 NOVO', () => {
    const linhas = [
      { index: 0, linha: makeLinhaArquivo('okBradesco Consorcio') },
      { index: 1, linha: makeLinhaArquivo('Bradesco Consorcio') },
      { index: 2, linha: makeLinhaArquivo('Bradesco Consorcio') },
    ];
    const resultados = classificarLote(linhas, bancoReal);
    
    expect(resultados.size).toBe(3); // NENHUMA SOME
    const values = [...resultados.values()];
    console.log('Resultados 3×2:', values.map(v => ({ idx: v.chaveGrupo, class: v.classificacao, grupoArq: v.grupoArquivo, grupoBco: v.grupoBanco })));
    
    const dupes = values.filter(v => v.classificacao === 'DUPLICADO_EXATO');
    const novos = values.filter(v => v.classificacao === 'NOVO');
    expect(dupes.length).toBe(2);
    expect(novos.length).toBe(1);
  });

  it('1 arquivo × 2 banco = 1 DUPLICADO_EXATO', () => {
    const linhas = [
      { index: 0, linha: makeLinhaArquivo('Bradesco Consorcio') },
    ];
    const resultados = classificarLote(linhas, bancoReal);
    
    expect(resultados.size).toBe(1);
    const r = resultados.get(0)!;
    expect(r.classificacao).toBe('DUPLICADO_EXATO');
    expect(r.grupoArquivo).toBe(1);
    expect(r.grupoBanco).toBe(2);
  });

  it('nenhuma linha desaparece em cenário misto', () => {
    // Mix: 2 do grupo 1537.52 + 1 linha diferente
    const linhas = [
      { index: 0, linha: makeLinhaArquivo('okBradesco Consorcio') },
      { index: 1, linha: makeLinhaArquivo('Bradesco Consorcio') },
      { index: 2, linha: { ...makeLinhaArquivo('Outra coisa'), valor: 999.99, fornecedorNome: 'Outro Fornecedor', fornecedorId: 'forn-outro' } },
    ];
    const resultados = classificarLote(linhas, bancoReal);
    
    expect(resultados.size).toBe(3); // TODAS aparecem
    expect(resultados.get(0)!.classificacao).toBe('DUPLICADO_EXATO');
    expect(resultados.get(1)!.classificacao).toBe('DUPLICADO_EXATO');
    expect(resultados.get(2)!.classificacao).toBe('NOVO');
  });
});
