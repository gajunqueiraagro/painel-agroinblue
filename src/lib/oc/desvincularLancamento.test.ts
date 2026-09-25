/**
 * OC-DESVINCULAR-01 — o que a tela diz do desvinculo, lido da simulacao, e QUANDO o gesto aparece.
 *
 * ⚠ OS NUMEROS SAO DAS PROVAS EM ROLLBACK NO PROTO (25/09/2026):
 *   parcela unica — c80ebe9e / a5c1c61a: a devolucao de 5.056 ao comprador. Compromisso 6b349b87 cancelado,
 *     recebido 107.367,46 -> 102.311,46; com "Pagamento Estornado" a conta leva a fazenda para
 *     "Administrativo", tira a safra e sai do DRE (regra FIN-FAZENDA-ADM-01 do gatilho do plano);
 *   varias parcelas — 4c5e8c86 / 2764120e: compromisso 0cb2c49d de 380.000 (300.000 + 80.000) reduzido
 *     a 80.000.
 * ⚠ A RPC NAO E' EXERCIDA AQUI: a regra mora no banco e foi provada la'. O arquivo trava a LEITURA.
 */
import { describe, it, expect } from 'vitest';
import {
  resumoDoDesvinculo, titulosDesvinculaveis, podeOferecerDesvinculo,
  type DesvinculoFeito, type ClassificacaoDesvinculo,
} from '@/lib/oc/desvincularLancamento';

const CLASSIF_OC: ClassificacaoDesvinculo = {
  plano_conta_id: '70d5708e', subcentro: 'Impostos e Despesas de Abates e Vendas', centro_custo: 'Impostos',
  grupo_custo: 'Deduções Pecuária', macro_custo: 'Deduções de Receitas', escopo_negocio: 'pecuaria',
  fazenda_id: 'ac8a596c', fazenda_nome: 'Faz. 3 Muchachas', safra_id: '5e8b70ac', compoe_dre: true,
};
const CLASSIF_ESTORNO: ClassificacaoDesvinculo = {
  plano_conta_id: 'fc73eac3', subcentro: 'Pagamento Estornado', centro_custo: 'Ajustes', grupo_custo: 'Outras Saídas',
  macro_custo: 'Saída Financeira', escopo_negocio: 'administrativo', fazenda_id: '673f02ad', fazenda_nome: 'Administrativo',
  safra_id: null, compoe_dre: false,
};

const simC80 = (o: Partial<DesvinculoFeito> = {}): DesvinculoFeito => ({
  ok: true, acao: 'simulado', simulado: true, operacao_id: 'c80ebe9e', operacao_versao: 16, parte_id: 'a7ed61c9',
  compromisso: { id: '6b349b87', acao: 'cancelado', componente: 'adiantamento_devolvido', descricao: 'Abate 020 V - Graxaria',
    valor_anterior: 5056, valor_total: 0 },
  recebido: { de: 107367.46, para: 102311.46 },
  compromissos_total: { de: 112423.46, para: 107367.46 },
  liquidacoes_estornadas: ['e3545aaa'],
  lancamento: { id: 'a5c1c61a', valor: 5056, data_pagamento: '2025-01-20', status_transacao: 'realizado',
    conta_bancaria_id: '1afe76df', origem_de: 'operacao_comercial', origem_para: 'manual', era_da_oc: true, intacto: true },
  conciliacao: { vinculos_antes: 0, vinculos_depois: 0 },
  classificacao: { mudou: false, de: CLASSIF_OC, para: CLASSIF_OC },
  ...o,
});
const valorDe = (linhas: { rotulo: string; valor: string }[], rotulo: string) => linhas.find(l => l.rotulo === rotulo)?.valor;

describe('resumo do desvinculo', () => {
  it('parcela unica: o lancamento fica, o compromisso e cancelado, o recebido cai, a classificacao e mantida', () => {
    const r = resumoDoDesvinculo(simC80(), 'OC de 17/01/2025');
    expect(valorDe(r, 'O lançamento fica')).toMatch(/5\.056,00 · pago 20\/01\/2025 · conciliação não conciliado/);
    expect(valorDe(r, 'Sai da')).toBe('OC de 17/01/2025');
    expect(valorDe(r, 'Compromisso')).toMatch(/Abate 020 V - Graxaria · R\$\s5\.056,00 — cancelado/);
    expect(valorDe(r, 'Recebido da OC')).toMatch(/107\.367,46 → R\$\s102\.311,46/);
    expect(valorDe(r, 'Classificação')).toBe('mantida · Impostos e Despesas de Abates e Vendas');
    /* Sem reclassificacao, fazenda e DRE nao aparecem: nada mudou neles. */
    expect(valorDe(r, 'Fazenda')).toBeUndefined();
    expect(valorDe(r, 'DRE')).toBeUndefined();
  });

  it('varias parcelas: o compromisso e REDUZIDO ao que sobra, nao cancelado', () => {
    const r = resumoDoDesvinculo(simC80({
      compromisso: { id: '0cb2c49d', acao: 'reduzido', componente: 'principal', descricao: 'Compra 93 Vacas Paridas',
        valor_anterior: 380000, valor_total: 80000 },
      recebido: { de: 396975.2, para: 96975.2 },
    }), 'OC 93');
    expect(valorDe(r, 'Compromisso')).toMatch(/380\.000,00 → R\$\s80\.000,00/);
    expect(valorDe(r, 'Compromisso')).not.toMatch(/cancelado/);
  });

  it('com reclassificacao: subcentro de A para B, e a fazenda, a safra e o DRE que a conta nova arrasta', () => {
    const r = resumoDoDesvinculo(simC80({ classificacao: { mudou: true, de: CLASSIF_OC, para: CLASSIF_ESTORNO } }), 'OC x');
    expect(valorDe(r, 'Classificação')).toBe('Impostos e Despesas de Abates e Vendas → Pagamento Estornado');
    expect(valorDe(r, 'Fazenda')).toBe('Faz. 3 Muchachas → Administrativo');
    expect(valorDe(r, 'Safra')).toMatch(/sai/);
    expect(valorDe(r, 'DRE')).toBe('deixa de compor');
    /* E o ambar marca o que muda — o operador ve' o que nao escreveu. */
    expect(r.filter(l => l.tom === 'ambar').map(l => l.rotulo)).toEqual(['Compromisso', 'Classificação', 'Fazenda', 'Safra', 'DRE']);
  });

  it('conciliado: a linha diz que a conciliacao e mantida', () => {
    const r = resumoDoDesvinculo(simC80({ conciliacao: { vinculos_antes: 1, vinculos_depois: 1 } }), 'OC x');
    expect(valorDe(r, 'O lançamento fica')).toMatch(/conciliação mantida/);
  });
});

describe('quando o gesto aparece', () => {
  const parcela = (o: Partial<Parameters<typeof titulosDesvinculaveis>[1][number]>) => ({
    compromissoId: 'c1', materializada: true, parteId: 'pa1', tituloId: 't1', tituloValor: 5056, valor: 5056, sequencia: 1, ...o,
  });

  it('menu da linha: so parcela com titulo VIVO — o orfao (titulo cancelado, parte viva) fica de fora', () => {
    const lista = titulosDesvinculaveis({ compromissoId: 'c1', status: 'programado' }, [
      parcela({}),
      parcela({ tituloId: 'orfao', materializada: false, sequencia: 2 }),   // f489abd9: titulo cancelado
      parcela({ tituloId: 'sem-parte', parteId: null, sequencia: 3 }),
      parcela({ compromissoId: 'outro', tituloId: 'de-outro' }),
    ]);
    /* A busca sabe achar: o titulo vivo esta' la'. */
    expect(lista).toEqual([{ lancamentoId: 't1', sequencia: 1, valor: 5056 }]);
  });

  it('compromisso cancelado nao oferece nada', () => {
    expect(titulosDesvinculaveis({ compromissoId: 'c1', status: 'cancelado' }, [parcela({})])).toEqual([]);
  });

  it('Financeiro V2: so com parte viva e lancamento vivo', () => {
    expect(podeOferecerDesvinculo({ lancamentoId: 'l', cancelado: false, temParteViva: true })).toBe(true);
    expect(podeOferecerDesvinculo({ lancamentoId: 'l', cancelado: false, temParteViva: false })).toBe(false);
    expect(podeOferecerDesvinculo({ lancamentoId: 'l', cancelado: true, temParteViva: true })).toBe(false);
    expect(podeOferecerDesvinculo({ lancamentoId: null, cancelado: false, temParteViva: true })).toBe(false);
  });
});
