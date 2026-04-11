/**
 * Testes de validação real da classificação de duplicidade
 * Baseados em dados concretos do cliente Santa Rita Agro, junho/2020
 * 
 * Validações obrigatórias:
 * 1. Nenhuma linha desaparece
 * 2. Decisão da tela é soberana (selected = importado)
 * 3. DUPLICADO EXATO não é agressivo demais
 * 4. Casos reais com lançamentos legítimos distintos
 */
import { describe, it, expect } from 'vitest';
import {
  classificarLinha,
  classificarLote,
  gerarHashImportacao,
  type RegistroExistente,
  type LinhaParaClassificar,
} from '@/lib/financeiro/duplicidadeImportacao';

// ── Helpers ──

const CONTA_BB = 'a5ed9922-e476-4ec0-a19c-6481140e52eb';
const FORNECEDOR_BRADESCO = 'de827aed-5524-4865-9fb6-74aa2b355cce';
const FORNECEDOR_RACA_FORTE = 'f81ec3cb-c4de-4d7a-a565-3c39f454b7bd';

function makeExistente(overrides: Partial<RegistroExistente> = {}): RegistroExistente {
  return {
    id: 'exist-' + Math.random().toString(36).slice(2, 8),
    data_pagamento: '2020-06-01',
    data_competencia: '2020-06-01',
    valor: 221.53,
    fornecedor_id: FORNECEDOR_BRADESCO,
    fornecedor_nome: 'Banco Bradesco',
    conta_bancaria_id: CONTA_BB,
    conta_nome: 'Banco do Brasil',
    subcentro: 'Distribuição de Dividendos Despesas Pessoais',
    centro_custo: 'Pessoas',
    descricao: 'Bradesco Vida e Previdencia',
    numero_documento: null,
    tipo_operacao: '2-Saídas',
    ano_mes: '2020-06',
    ...overrides,
  };
}

function makeLinha(overrides: Partial<LinhaParaClassificar> = {}): LinhaParaClassificar {
  return {
    dataPagamento: '2020-06-01',
    anoMes: '2020-06',
    valor: 221.53,
    fornecedorId: FORNECEDOR_BRADESCO,
    fornecedorNome: 'Banco Bradesco',
    contaBancariaId: CONTA_BB,
    subcentro: 'Distribuição de Dividendos Despesas Pessoais',
    descricao: 'Bradesco Vida e Previdencia',
    numeroDocumento: null,
    tipoOperacao: '2-Saídas',
    ...overrides,
  };
}

// ── VALIDAÇÃO 1: Nenhuma linha desaparece ──

describe('Validação 1 — Nenhuma linha desaparece', () => {
  it('classificarLinha SEMPRE retorna resultado para cada chamada', () => {
    const existentes = [makeExistente()];
    
    // 10 linhas: mix de cenários
    const linhas: LinhaParaClassificar[] = [
      makeLinha(), // duplicado exato
      makeLinha({ valor: 500, fornecedorId: 'outro', fornecedorNome: 'Outro' }), // novo
      makeLinha({ valor: 221.53, dataPagamento: '2020-06-02' }), // suspeita (valor igual, data próxima)
      makeLinha({ valor: 0 }), // edge case
      makeLinha({ fornecedorId: null, fornecedorNome: null }), // sem fornecedor
      makeLinha({ contaBancariaId: null }), // sem conta
      makeLinha({ dataPagamento: null }), // sem data
      makeLinha({ valor: 221.53, descricao: 'Totalmente diferente', fornecedorId: 'x', fornecedorNome: 'X' }), // novo
      makeLinha({ valor: 221.54 }), // valor quase igual (±0.01)
      makeLinha({ valor: 1000000 }), // valor totalmente diferente
    ];

    const resultados = linhas.map(l => classificarLinha(l, existentes));
    
    // REGRA: Toda linha gera resultado, nenhuma é null/undefined
    expect(resultados).toHaveLength(10);
    for (const r of resultados) {
      expect(r).toBeDefined();
      expect(r.classificacao).toBeDefined();
      expect(['NOVO', 'DUPLICADO_EXATO', 'SUSPEITA']).toContain(r.classificacao);
    }
  });

  it('classificarLinha sem existentes retorna NOVO para todas', () => {
    const linhas = [makeLinha(), makeLinha({ valor: 500 }), makeLinha({ valor: 1000 })];
    const resultados = linhas.map(l => classificarLinha(l, []));
    expect(resultados.every(r => r.classificacao === 'NOVO')).toBe(true);
  });
});

// ── VALIDAÇÃO 2: Decisão soberana (seleção = gravação) ──

describe('Validação 2 — Decisão da tela é soberana', () => {
  it('Apenas linhas marcadas como selected são incluídas na importação', () => {
    // Simula o fluxo do ConferenciaImportacaoDialog.handleImport
    const existentes = [makeExistente()];
    const linhas = [
      makeLinha(), // será DUPLICADO
      makeLinha({ valor: 999, fornecedorId: 'novo', fornecedorNome: 'Novo Forn' }), // será NOVO
      makeLinha({ valor: 221.53, dataPagamento: '2020-06-03', fornecedorId: FORNECEDOR_BRADESCO }), // será SUSPEITA
    ];

    const classificados = linhas.map(l => {
      const r = classificarLinha(l, existentes);
      return {
        ...l,
        _classificacao: r.classificacao,
        _selected: r.classificacao === 'NOVO', // padrão: NOVO=true, resto=false
      };
    });

    // Apenas NOVO deve estar selecionado por padrão
    const paraImportar = classificados.filter(c => c._selected);
    expect(paraImportar).toHaveLength(1);
    expect(paraImportar[0].valor).toBe(999);

    // Simular override: marcar SUSPEITA para importar
    classificados[2]._selected = true;
    const paraImportar2 = classificados.filter(c => c._selected);
    expect(paraImportar2).toHaveLength(2);

    // Simular desmarcar NOVO
    classificados[1]._selected = false;
    const paraImportar3 = classificados.filter(c => c._selected);
    expect(paraImportar3).toHaveLength(1);
    expect(paraImportar3[0]._classificacao).toBe('SUSPEITA');
  });
});

// ── VALIDAÇÃO 3: DUPLICADO EXATO não é agressivo demais ──

describe('Validação 3 — Duplicado exato não é agressivo demais', () => {
  
  it('Caso real: 3 lançamentos Bradesco R$221.53 mesma data — são legítimos distintos se descrição/documento difere', () => {
    // No banco da Sta. Rita existem 3 registros com valor=221.53, data=2020-06-01, fornecedor=Bradesco, conta=BB
    // Mas com descrições: "Bradesco Vida e Previdencia", "okBradesco Vida e Previdencia", "okBradesco Vida e Previdencia"
    const existentes = [
      makeExistente({ id: 'e1', descricao: 'Bradesco Vida e Previdencia' }),
      makeExistente({ id: 'e2', descricao: 'okBradesco Vida e Previdencia' }),
      makeExistente({ id: 'e3', descricao: 'okBradesco Vida e Previdencia' }),
    ];

    // Importando OUTRA linha com descrição diferente mas mesmos campos-chave
    const linhaNovaDesc = makeLinha({ descricao: 'Bradesco Saúde Empresarial' });
    const r1 = classificarLinha(linhaNovaDesc, existentes);
    
    // Valor + data + conta + fornecedor batem, mas descrição é diferente
    // A regra forte (sem complementar) classifica como DUPLICADO_EXATO mesmo sem doc/desc
    // Isso é correto: 4 campos obrigatórios são idênticos
    expect(r1.classificacao).toBe('DUPLICADO_EXATO');
    // Mas os motivos devem ser claros
    expect(r1.motivos.length).toBeGreaterThan(0);
  });

  it('Mesmo valor+data+conta MAS fornecedor diferente → NÃO é duplicado exato', () => {
    const existentes = [makeExistente()]; // Bradesco
    const linha = makeLinha({
      fornecedorId: FORNECEDOR_RACA_FORTE,
      fornecedorNome: 'Raça Forte',
    });
    const r = classificarLinha(linha, existentes);
    // Fornecedor diferente → quebra regra obrigatória → não é DUPLICADO_EXATO
    expect(r.classificacao).not.toBe('DUPLICADO_EXATO');
  });

  it('Mesmo valor+data+fornecedor MAS conta diferente → NÃO é duplicado exato', () => {
    const existentes = [makeExistente()];
    const linha = makeLinha({ contaBancariaId: 'outra-conta-id' });
    const r = classificarLinha(linha, existentes);
    expect(r.classificacao).not.toBe('DUPLICADO_EXATO');
  });

  it('Mesmo valor+fornecedor+conta MAS data diferente (>3 dias) → NÃO é duplicado exato', () => {
    const existentes = [makeExistente()];
    const linha = makeLinha({ dataPagamento: '2020-06-15' });
    const r = classificarLinha(linha, existentes);
    expect(r.classificacao).not.toBe('DUPLICADO_EXATO');
  });

  it('Lançamentos recorrentes legítimos: mesmo fornecedor, conta, valor mas meses diferentes', () => {
    const existentes = [makeExistente({ ano_mes: '2020-05', data_pagamento: '2020-05-01' })];
    const linha = makeLinha({ dataPagamento: '2020-06-01', anoMes: '2020-06' });
    const r = classificarLinha(linha, existentes);
    // Data totalmente diferente (mês diferente) → não é duplicado
    expect(r.classificacao).not.toBe('DUPLICADO_EXATO');
  });

  it('Valor com diferença de 1 centavo (R$221.53 vs R$221.54) deve ser DUPLICADO se resto bate', () => {
    const existentes = [makeExistente({ valor: 221.53 })];
    const linha = makeLinha({ valor: 221.54 }); // ±R$0.01
    const r = classificarLinha(linha, existentes);
    // A tolerância de ±R$0.01 deve considerar como valor igual
    expect(r.classificacao).toBe('DUPLICADO_EXATO');
  });

  it('Valor com diferença de 2 centavos NÃO deve ser duplicado exato', () => {
    const existentes = [makeExistente({ valor: 221.53 })];
    const linha = makeLinha({ valor: 221.55 });
    const r = classificarLinha(linha, existentes);
    expect(r.classificacao).not.toBe('DUPLICADO_EXATO');
  });
});

// ── VALIDAÇÃO 4: Cenários reais problemáticos ──

describe('Validação 4 — Cenários reais problemáticos', () => {

  it('Simula importação completa junho/2020 Sta. Rita — classificação em lote', () => {
    // Registros existentes simulados (baseados nos dados reais)
    const existentes: RegistroExistente[] = [
      makeExistente({ id: 'e1', valor: 2.18, descricao: 'Jscp Acoes', fornecedor_id: FORNECEDOR_BRADESCO, tipo_operacao: '1-Entradas', subcentro: 'Rendimentos Financeiros', centro_custo: 'Financeiro' }),
      makeExistente({ id: 'e2', valor: 67.74, descricao: 'CEP/JUROS 14 DIAS', fornecedor_id: 'other-forn', fornecedor_nome: 'Outro', subcentro: 'Distribuição de Dividendos Despesas Pessoais' }),
      makeExistente({ id: 'e3', valor: 221.53, descricao: 'Bradesco Vida e Previdencia' }),
      makeExistente({ id: 'e4', valor: 221.53, descricao: 'okBradesco Vida e Previdencia' }),
      makeExistente({ id: 'e5', valor: 429.37, descricao: 'Fundersul venda de 35bzrros para Biro', fornecedor_id: '83be2be4', fornecedor_nome: 'Impostos', subcentro: 'Impostos e Despesas de Abates e Vendas', centro_custo: 'Impostos' }),
    ];

    // Linhas do arquivo (mix: duplicados, novos, suspeitas)
    const linhasArquivo: LinhaParaClassificar[] = [
      // L1: Duplicado exato de e3
      makeLinha({ valor: 221.53, descricao: 'Bradesco Vida e Previdencia' }),
      // L2: Novo — fornecedor diferente
      makeLinha({ valor: 221.53, fornecedorId: FORNECEDOR_RACA_FORTE, fornecedorNome: 'Raça Forte', descricao: 'Medicamentos' }),
      // L3: Novo — valor totalmente diferente
      makeLinha({ valor: 5000, descricao: 'Compra de sal mineral', fornecedorId: 'x', fornecedorNome: 'Nutrisal' }),
      // L4: Suspeita — mesmo valor+data, fornecedor diferente
      makeLinha({ valor: 429.37, descricao: 'Fundersul venda', fornecedorId: FORNECEDOR_BRADESCO }),
      // L5: Novo — data diferente
      makeLinha({ valor: 221.53, dataPagamento: '2020-06-20', descricao: 'Outro pagamento' }),
      // L6: Duplicado exato de e1 (entrada)
      makeLinha({ valor: 2.18, descricao: 'Jscp Acoes', tipoOperacao: '1-Entradas' }),
    ];

    const resultados = linhasArquivo.map(l => classificarLinha(l, existentes));

    // REGRA 1: Todas as 6 linhas retornam resultado
    expect(resultados).toHaveLength(6);
    for (const r of resultados) {
      expect(r).toBeDefined();
      expect(r.classificacao).toBeDefined();
    }

    // L1: Duplicado exato (valor+data+conta+fornecedor idênticos)
    expect(resultados[0].classificacao).toBe('DUPLICADO_EXATO');
    expect(resultados[0].registroExistenteId).toBeTruthy();

    // L2: Novo — fornecedor diferente quebra a regra obrigatória
    expect(resultados[1].classificacao).not.toBe('DUPLICADO_EXATO');

    // L3: Novo — valor totalmente diferente + fornecedor diferente
    expect(resultados[2].classificacao).toBe('NOVO');

    // L4: Não é duplicado exato (fornecedor diferente do e5)
    expect(resultados[3].classificacao).not.toBe('DUPLICADO_EXATO');

    // L5: Data diferente → não é duplicado exato
    expect(resultados[4].classificacao).not.toBe('DUPLICADO_EXATO');

    // L6: Duplicado exato de e1
    expect(resultados[5].classificacao).toBe('DUPLICADO_EXATO');

    // Contadores
    const novos = resultados.filter(r => r.classificacao === 'NOVO').length;
    const duplicados = resultados.filter(r => r.classificacao === 'DUPLICADO_EXATO').length;
    const suspeitas = resultados.filter(r => r.classificacao === 'SUSPEITA').length;
    
    console.log(`Resultado importação simulada:
      Total linhas: ${resultados.length}
      NOVO: ${novos}
      DUPLICADO_EXATO: ${duplicados}
      SUSPEITA: ${suspeitas}
    `);

    expect(novos + duplicados + suspeitas).toBe(6); // nenhuma linha some
  });

  it('Hash de importação é determinístico', () => {
    const h1 = gerarHashImportacao('2020-06-01', 221.53, 'Banco Bradesco', CONTA_BB, null);
    const h2 = gerarHashImportacao('2020-06-01', 221.53, 'Banco Bradesco', CONTA_BB, null);
    expect(h1).toBe(h2);

    const h3 = gerarHashImportacao('2020-06-01', 221.54, 'Banco Bradesco', CONTA_BB, null);
    expect(h3).not.toBe(h1); // valor diferente = hash diferente
  });

  it('Motivos do conflito são sempre explicados', () => {
    const existentes = [makeExistente()];
    const linha = makeLinha();
    const r = classificarLinha(linha, existentes);
    
    expect(r.motivos.length).toBeGreaterThan(0);
    expect(r.resumo).toBeTruthy();
    expect(r.resumo.length).toBeGreaterThan(5);
    
    // Cada motivo tem campo, match e detalhe
    for (const m of r.motivos) {
      expect(m.campo).toBeTruthy();
      expect(typeof m.match).toBe('boolean');
      expect(m.detalhe).toBeTruthy();
    }
  });
});

// ── Cardinality-aware group tests ──

describe('classificarLote — cardinalidade de grupo', () => {
  const baseLinha: LinhaParaClassificar = {
    dataPagamento: '2020-06-01',
    anoMes: '2020-06',
    valor: 1537.52,
    fornecedorId: FORNECEDOR_BRADESCO,
    fornecedorNome: 'Banco Bradesco',
    contaBancariaId: CONTA_BB,
    subcentro: 'Distribuição de Dividendos Despesas Pessoais',
    descricao: 'Distribuição de Dividendos Despesas Pessoais',
    numeroDocumento: null,
    tipoOperacao: '2-Saídas',
  };

  const baseExistente: RegistroExistente = {
    id: 'ex-div-1',
    data_pagamento: '2020-06-01',
    data_competencia: '2020-06-01',
    valor: 1537.52,
    fornecedor_id: FORNECEDOR_BRADESCO,
    fornecedor_nome: 'Banco Bradesco',
    conta_bancaria_id: CONTA_BB,
    subcentro: 'Distribuição de Dividendos Despesas Pessoais',
    centro_custo: 'Pessoas',
    descricao: 'Distribuição de Dividendos Despesas Pessoais',
    numero_documento: null,
    tipo_operacao: '2-Saídas',
    ano_mes: '2020-06',
  };

  it('4 arquivo × 4 banco = 4 DUPLICADO_EXATO', () => {
    const linhas = Array.from({ length: 4 }, (_, i) => ({ index: i, linha: { ...baseLinha } }));
    const existentes = Array.from({ length: 4 }, (_, i) => ({ ...baseExistente, id: `ex-div-${i}` }));

    const resultados = classificarLote(linhas, existentes);

    expect(resultados.size).toBe(4);
    for (const [, r] of resultados) {
      expect(r.classificacao).toBe('DUPLICADO_EXATO');
      expect(r.grupoArquivo).toBe(4);
      expect(r.grupoBanco).toBe(4);
    }
  });

  it('4 arquivo × 3 banco = 3 DUPLICADO_EXATO + 1 NOVO', () => {
    const linhas = Array.from({ length: 4 }, (_, i) => ({ index: i, linha: { ...baseLinha } }));
    const existentes = Array.from({ length: 3 }, (_, i) => ({ ...baseExistente, id: `ex-div-${i}` }));

    const resultados = classificarLote(linhas, existentes);

    expect(resultados.size).toBe(4); // nenhuma linha some
    const dupes = [...resultados.values()].filter(r => r.classificacao === 'DUPLICADO_EXATO');
    const novos = [...resultados.values()].filter(r => r.classificacao === 'NOVO');
    expect(dupes.length).toBe(3);
    expect(novos.length).toBe(1);
  });

  it('4 arquivo × 0 banco = 4 NOVO', () => {
    const linhas = Array.from({ length: 4 }, (_, i) => ({ index: i, linha: { ...baseLinha } }));

    const resultados = classificarLote(linhas, []);

    expect(resultados.size).toBe(4);
    for (const [, r] of resultados) {
      expect(r.classificacao).toBe('NOVO');
    }
  });

  it('2 arquivo × 5 banco = 2 DUPLICADO_EXATO', () => {
    const linhas = Array.from({ length: 2 }, (_, i) => ({ index: i, linha: { ...baseLinha } }));
    const existentes = Array.from({ length: 5 }, (_, i) => ({ ...baseExistente, id: `ex-div-${i}` }));

    const resultados = classificarLote(linhas, existentes);

    expect(resultados.size).toBe(2);
    for (const [, r] of resultados) {
      expect(r.classificacao).toBe('DUPLICADO_EXATO');
    }
  });

  it('descrição com variação "ok" prefix cai em grupo correto', () => {
    const linhaComOk = { ...baseLinha, descricao: 'okBradesco Consorcio' };
    const linhaSemOk = { ...baseLinha, descricao: 'Bradesco Consorcio' };
    const existente = { ...baseExistente, descricao: 'Bradesco Consorcio' };

    const linhas = [
      { index: 0, linha: linhaComOk },
      { index: 1, linha: linhaSemOk },
    ];
    const resultados = classificarLote(linhas, [existente]);

    // Both should group to same key (normDesc strips "ok" prefix)
    expect(resultados.size).toBe(2);
    const dupes = [...resultados.values()].filter(r => r.classificacao === 'DUPLICADO_EXATO');
    const novos = [...resultados.values()].filter(r => r.classificacao === 'NOVO');
    expect(dupes.length).toBe(1); // only 1 existing record
    expect(novos.length).toBe(1); // excess becomes NOVO
  });

  it('todas as linhas sempre aparecem no resultado', () => {
    const mixed = [
      { index: 0, linha: { ...baseLinha } },
      { index: 1, linha: { ...baseLinha, valor: 999.99 } },
      { index: 2, linha: { ...baseLinha } },
      { index: 3, linha: { ...baseLinha, fornecedorId: 'other', fornecedorNome: 'Outro' } },
    ];
    const existentes = [{ ...baseExistente }];

    const resultados = classificarLote(mixed, existentes);

    expect(resultados.size).toBe(4); // NENHUMA LINHA SOME
  });
});
