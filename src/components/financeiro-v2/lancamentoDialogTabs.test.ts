import { describe, it, expect } from 'vitest';
import {
  computeValidacaoModal,
  contaSimpleValid,
  ABAS_FINANCEIRAS,
  type ValidacaoModalInput,
} from './lancamentoDialogTabs';

// Base VÁLIDA (saída à vista, pontual, conta origem preenchida).
function baseValida(over: Partial<ValidacaoModalInput> = {}): ValidacaoModalInput {
  return {
    fazendaId: 'faz-1',
    dataCompetencia: '2026-07-01',
    dataPagamento: '2026-07-01',
    descricao: 'Compra de insumo',
    tipoOperacao: '2-Saídas',
    statusTransacao: 'realizado',
    valorNum: 100,
    contaOrigemId: 'conta-1',
    contaDestinoId: '',
    subcentro: 'Ureia',
    formaPagamentoParc: 'avista',
    numParcelas: 2,
    parcelaRowsLength: 0,
    frequencia: 'pontual',
    recorrenciaRowsLength: 0,
    ...over,
  };
}

describe('computeValidacaoModal — tudo válido', () => {
  it('nenhuma aba inválida e canSave=true', () => {
    const r = computeValidacaoModal(baseValida());
    expect(r.canSave).toBe(true);
    expect(r.abasInvalidas).toEqual([]);
    expect(r.primeiraAbaInvalida).toBeNull();
    expect(r.documentosValida).toBe(true);
  });
});

describe('pendência por aba', () => {
  it('GERAL inválida quando falta valor', () => {
    const r = computeValidacaoModal(baseValida({ valorNum: 0 }));
    expect(r.geralValida).toBe(false);
    expect(r.abasInvalidas).toContain('geral');
    expect(r.primeiraAbaInvalida).toBe('geral');
    expect(r.canSave).toBe(false);
  });
  it('GERAL inválida quando falta descrição/fazenda/datas/status', () => {
    expect(computeValidacaoModal(baseValida({ descricao: '' })).geralValida).toBe(false);
    expect(computeValidacaoModal(baseValida({ fazendaId: '' })).geralValida).toBe(false);
    expect(computeValidacaoModal(baseValida({ dataCompetencia: '' })).geralValida).toBe(false);
    expect(computeValidacaoModal(baseValida({ dataPagamento: '' })).geralValida).toBe(false);
    expect(computeValidacaoModal(baseValida({ statusTransacao: '' })).geralValida).toBe(false);
  });
  it('CLASSIFICAÇÃO inválida quando falta subcentro', () => {
    const r = computeValidacaoModal(baseValida({ subcentro: '' }));
    expect(r.classificacaoValida).toBe(false);
    expect(r.abasInvalidas).toContain('classificacao');
    expect(r.primeiraAbaInvalida).toBe('classificacao');
  });
  it('PAGAMENTO inválida quando parcelado incompleto', () => {
    const r = computeValidacaoModal(baseValida({ formaPagamentoParc: 'parcelada', numParcelas: 3, parcelaRowsLength: 2 }));
    expect(r.pagamentoValido).toBe(false);
    expect(r.abasInvalidas).toContain('pagamento');
    expect(r.primeiraAbaInvalida).toBe('pagamento');
  });
});

describe('primeira aba inválida respeita a ordem canônica', () => {
  it('múltiplas pendências (classificação + pagamento) → geral primeiro se também inválida', () => {
    const r = computeValidacaoModal(baseValida({ valorNum: 0, subcentro: '', formaPagamentoParc: 'parcelada', numParcelas: 3, parcelaRowsLength: 1 }));
    expect(r.abasInvalidas).toEqual(['geral', 'classificacao', 'pagamento']);
    expect(r.primeiraAbaInvalida).toBe('geral');
  });
  it('classificação + pagamento (geral ok) → classificação primeiro', () => {
    const r = computeValidacaoModal(baseValida({ subcentro: '', frequencia: 'recorrente', recorrenciaRowsLength: 0 }));
    expect(r.abasInvalidas).toEqual(['classificacao', 'pagamento']);
    expect(r.primeiraAbaInvalida).toBe('classificacao');
  });
});

describe('contas condicionais por tipo', () => {
  it('transferência exige origem E destino', () => {
    expect(contaSimpleValid('3-Transferências', 'a', 'b')).toBe(true);
    expect(contaSimpleValid('3-Transferências', 'a', '')).toBe(false);
    expect(contaSimpleValid('3-Transferências', '', 'b')).toBe(false);
    expect(contaSimpleValid('3-Transferências', '__none__', 'b')).toBe(false);
  });
  it('entrada exige apenas a conta de destino (origem inaplicável não gera pendência)', () => {
    expect(contaSimpleValid('1-Entradas', '', 'b')).toBe(true);
    expect(contaSimpleValid('1-Entradas', '', '')).toBe(false);
    // origem preenchida ou não é irrelevante para entrada
    expect(contaSimpleValid('1-Entradas', 'qualquer', 'b')).toBe(true);
  });
  it('saída exige apenas a conta de origem (destino inaplicável não gera pendência)', () => {
    expect(contaSimpleValid('2-Saídas', 'a', '')).toBe(true);
    expect(contaSimpleValid('2-Saídas', '', '')).toBe(false);
    expect(contaSimpleValid('2-Saídas', 'a', 'qualquer')).toBe(true);
  });
  it('entrada sem conta destino → GERAL inválida', () => {
    const r = computeValidacaoModal(baseValida({ tipoOperacao: '1-Entradas', contaOrigemId: '', contaDestinoId: '' }));
    expect(r.geralValida).toBe(false);
    expect(r.primeiraAbaInvalida).toBe('geral');
  });
  it('entrada com conta destino → GERAL válida', () => {
    const r = computeValidacaoModal(baseValida({ tipoOperacao: '1-Entradas', contaOrigemId: '', contaDestinoId: 'dest' }));
    expect(r.geralValida).toBe(true);
  });
});

describe('parcelamento e recorrência', () => {
  it('parcelado válido (rows === numParcelas)', () => {
    expect(computeValidacaoModal(baseValida({ formaPagamentoParc: 'parcelada', numParcelas: 3, parcelaRowsLength: 3 })).pagamentoValido).toBe(true);
  });
  it('parcelado inválido fora do intervalo 2..24', () => {
    expect(computeValidacaoModal(baseValida({ formaPagamentoParc: 'parcelada', numParcelas: 1, parcelaRowsLength: 1 })).pagamentoValido).toBe(false);
    expect(computeValidacaoModal(baseValida({ formaPagamentoParc: 'parcelada', numParcelas: 25, parcelaRowsLength: 25 })).pagamentoValido).toBe(false);
  });
  it('recorrência válida exige linhas > 0', () => {
    expect(computeValidacaoModal(baseValida({ frequencia: 'recorrente', recorrenciaRowsLength: 5 })).pagamentoValido).toBe(true);
    expect(computeValidacaoModal(baseValida({ frequencia: 'recorrente', recorrenciaRowsLength: 0 })).pagamentoValido).toBe(false);
  });
  it('à vista + pontual nunca torna PAGAMENTO inválida', () => {
    expect(computeValidacaoModal(baseValida()).pagamentoValido).toBe(true);
  });
});

describe('DOCUMENTOS nunca é inválida (sem obrigatório real)', () => {
  it('documentosValida sempre true e nunca aparece em abasInvalidas', () => {
    const r = computeValidacaoModal(baseValida({ descricao: '', subcentro: '' }));
    expect(r.documentosValida).toBe(true);
    expect(r.abasInvalidas).not.toContain('documentos');
  });
});

describe('colocação Valor→GERAL e Safra→CLASSIFICAÇÃO (PR-FIN-MODAL-02B ajuste final)', () => {
  it('valor inválido marca GERAL', () => {
    const r = computeValidacaoModal(baseValida({ valorNum: 0 }));
    expect(r.geralValida).toBe(false);
    expect(r.abasInvalidas).toContain('geral');
  });
  it('valor inválido NÃO marca CLASSIFICAÇÃO quando o restante da classificação está válido', () => {
    const r = computeValidacaoModal(baseValida({ valorNum: 0, subcentro: 'Ureia' }));
    expect(r.classificacaoValida).toBe(true);
    expect(r.abasInvalidas).not.toContain('classificacao');
    expect(r.primeiraAbaInvalida).toBe('geral');
  });
  it('Safra vazia NÃO invalida CLASSIFICAÇÃO (Safra é opcional e nem é entrada do helper)', () => {
    // A validade de CLASSIFICAÇÃO depende apenas de subcentro; não há campo de safra no input.
    const comSub = computeValidacaoModal(baseValida({ subcentro: 'Ureia' }));
    expect(comSub.classificacaoValida).toBe(true);
    expect(comSub.abasInvalidas).not.toContain('classificacao');
  });
  it('subcentro inválido continua marcando CLASSIFICAÇÃO (valor não interfere)', () => {
    const r = computeValidacaoModal(baseValida({ subcentro: '', valorNum: 100 }));
    expect(r.classificacaoValida).toBe(false);
    expect(r.geralValida).toBe(true);
    expect(r.abasInvalidas).toContain('classificacao');
    expect(r.abasInvalidas).not.toContain('geral');
    expect(r.primeiraAbaInvalida).toBe('classificacao');
  });
});

describe('ordem canônica das abas', () => {
  it('é geral, classificacao, pagamento, documentos', () => {
    expect(ABAS_FINANCEIRAS).toEqual(['geral', 'classificacao', 'pagamento', 'documentos']);
  });
});
