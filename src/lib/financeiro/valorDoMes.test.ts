/**
 * REC-VALOR-DO-MES-MODAL-01 — o dono puro do "valor do mês" da ocorrência de recorrência.
 *
 * ⚠ O ESPELHO DO VENCIMENTO É CONFERIDO CONTRA O BANCO: `valorDoMes.vencimentos.fixture.json` são as 435 combinações
 *   DISTINTAS (data_inicio, primeiro_vencimento, dia, competência) das ocorrências vivas do proto em 05/10/2026, com o que
 *   `_fn_recorrencia_vencimento` devolveu para cada uma. Só datas — nenhum dado de cliente.
 */
import { describe, it, expect } from 'vitest';
import vencimentos from './valorDoMes.vencimentos.fixture.json';
import {
  marcaAoSalvar, ocorrenciaAberta, colunasDoValorDoMes, vencimentoPrevisto, previstoDaOcorrencia, difereDoGravado,
  partesDaMarcada, partesDaIntencao, juntar, tituloDasPartes, MOTIVO_CONTA_PAGA, type DecisaoDaMarca, type OrigemDoValorDoMes,
} from './valorDoMes';

const ANTES = { valor: 888.49, vencimento: '2026-11-05' };

describe('marcaAoSalvar — a tabela de casos', () => {
  const casos: Array<[string, { rec: boolean; aberta: boolean; marca: OrigemDoValorDoMes | null; valor: number; venc: string | null }, DecisaoDaMarca]> = [
    ['lançamento comum, valor mudou', { rec: false, aberta: true, marca: null, valor: 958.6, venc: '2026-11-05' }, 'nada'],
    ['lançamento comum, nada mudou', { rec: false, aberta: true, marca: null, valor: 888.49, venc: '2026-11-05' }, 'nada'],
    ['ocorrência aberta, valor mudou', { rec: true, aberta: true, marca: null, valor: 958.6, venc: '2026-11-05' }, 'marcar_manual'],
    ['ocorrência aberta, só o vencimento mudou', { rec: true, aberta: true, marca: null, valor: 888.49, venc: '2026-11-10' }, 'marcar_manual'],
    ['ocorrência aberta, vencimento apagado', { rec: true, aberta: true, marca: null, valor: 888.49, venc: null }, 'marcar_manual'],
    ['ocorrência aberta, nada mudou', { rec: true, aberta: true, marca: null, valor: 888.49, venc: '2026-11-05' }, 'manter'],
    ['marcada pela planilha, valor mudou: o operador assume', { rec: true, aberta: true, marca: 'planilha', valor: 900, venc: '2026-11-05' }, 'marcar_manual'],
    ['marcada pela planilha, nada mudou: a marca fica', { rec: true, aberta: true, marca: 'planilha', valor: 888.49, venc: '2026-11-05' }, 'manter'],
    ['marcada à mão, nada mudou', { rec: true, aberta: true, marca: 'manual', valor: 888.49, venc: '2026-11-05' }, 'manter'],
    ['marcada à mão, valor mudou de novo', { rec: true, aberta: true, marca: 'manual', valor: 1000, venc: '2026-11-05' }, 'marcar_manual'],
    ['ocorrência que vai ser gravada PAGA, valor mudou', { rec: true, aberta: false, marca: null, valor: 958.6, venc: '2026-11-05' }, 'manter'],
    ['diferença abaixo de um centavo não é mudança', { rec: true, aberta: true, marca: null, valor: 888.4901, venc: '2026-11-05' }, 'manter'],
    ['o sinal não conta (o lançamento guarda o módulo)', { rec: true, aberta: true, marca: null, valor: -888.49, venc: '2026-11-05' }, 'manter'],
  ];
  it.each(casos)('%s', (_n, c, esperado) => {
    expect(marcaAoSalvar({
      ehRecorrencia: c.rec, aberta: c.aberta, antes: { ...ANTES, marca: c.marca }, depois: { valor: c.valor, vencimento: c.venc },
    })).toBe(esperado);
  });
  it('vencimento gravado nulo e em edição vazio são o mesmo', () => {
    expect(difereDoGravado({ valor: 10, vencimento: null }, { valor: 10, vencimento: '' })).toBe(false);
    expect(difereDoGravado({ valor: 10, vencimento: null }, { valor: 10, vencimento: '2026-01-01' })).toBe(true);
  });
});

describe('ocorrenciaAberta — o predicado do Propagar', () => {
  it.each(['previsto', 'programado', 'agendado', 'meta'])('%s sem pagamento e sem conciliação é aberta', (status) => {
    expect(ocorrenciaAberta({ status, dataPagamento: null, conciliadoEm: null })).toBe(true);
  });
  it('realizado, com data de pagamento ou conciliada: fechada', () => {
    expect(ocorrenciaAberta({ status: 'realizado', dataPagamento: null, conciliadoEm: null })).toBe(false);
    expect(ocorrenciaAberta({ status: 'programado', dataPagamento: '2026-10-01', conciliadoEm: null })).toBe(false);
    expect(ocorrenciaAberta({ status: 'programado', dataPagamento: null, conciliadoEm: '2026-10-01T00:00:00Z' })).toBe(false);
    expect(ocorrenciaAberta({ status: null, dataPagamento: null, conciliadoEm: null })).toBe(false);
  });
});

describe('colunasDoValorDoMes — o que o UPDATE leva', () => {
  const agora = new Date('2026-10-05T15:00:00Z');
  it('sem pedido: objeto vazio (o payload é o de sempre)', () => {
    expect(colunasDoValorDoMes(undefined, agora)).toEqual({});
    expect(Object.keys(colunasDoValorDoMes(undefined, agora))).toHaveLength(0);
  });
  it('marcar: agora e manual', () => {
    expect(colunasDoValorDoMes('marcar_manual', agora)).toEqual({ valor_do_mes_em: '2026-10-05T15:00:00.000Z', valor_do_mes_origem: 'manual' });
  });
  it('limpar: as duas nulas (o CHECK do banco exige o par)', () => {
    expect(colunasDoValorDoMes('limpar', agora)).toEqual({ valor_do_mes_em: null, valor_do_mes_origem: null });
  });
});

describe('vencimentoPrevisto — espelho de _fn_recorrencia_vencimento', () => {
  it('as combinações reais do proto dão o mesmo que o banco', () => {
    const linhas = vencimentos as Array<[string, string, number, string, string]>;
    /* a prova diz o tamanho do conjunto: vazio seria prova inválida */
    expect(linhas.length).toBe(435);
    const divergentes = linhas.filter(([di, pv, dia, comp, esperado]) =>
      vencimentoPrevisto({ data_inicio: di, primeiro_vencimento: pv, dia_vencimento: dia }, comp) !== esperado);
    expect(divergentes).toEqual([]);
  });
  it('apara o dia no mês curto, atravessa o ano e aceita deslocamento negativo', () => {
    expect(vencimentoPrevisto({ data_inicio: '2026-01-01', primeiro_vencimento: '2026-01-31', dia_vencimento: 31 }, '2026-02-01')).toBe('2026-02-28');
    expect(vencimentoPrevisto({ data_inicio: '2026-01-01', primeiro_vencimento: '2026-02-05', dia_vencimento: 5 }, '2026-12-15')).toBe('2027-01-05');
    expect(vencimentoPrevisto({ data_inicio: '2026-02-01', primeiro_vencimento: '2026-01-20', dia_vencimento: 20 }, '2026-01-01')).toBe('2025-12-20');
  });
  it('o previsto leva o valor em módulo', () => {
    expect(previstoDaOcorrencia({ valor_base: -888.49, dia_vencimento: 5, data_inicio: '2026-01-01', primeiro_vencimento: '2026-02-05' }, '2026-10-01'))
      .toEqual({ valor: 888.49, vencimento: '2026-11-05' });
  });
});

describe('as frases', () => {
  it('marcada', () => {
    expect(juntar(partesDaMarcada('R$ 888,49', 'manual'))).toBe('Valor do mês ajustado · previsto R$ 888,49');
    expect(juntar(partesDaMarcada('R$ 888,49', 'planilha'))).toBe('Valor do mês ajustado · previsto R$ 888,49 · pela planilha');
  });
  it('intenção', () => {
    /* na tela a curta; a inteira, com o Propagar, no `title` */
    expect(juntar(partesDaIntencao('R$ 888,49'))).toBe('Ao salvar, fica como valor do mês · previsto R$ 888,49');
    expect(tituloDasPartes(partesDaIntencao('R$ 888,49'))).toBe('Ao salvar, fica como valor do mês (previsto R$ 888,49); o Propagar não altera esta conta.');
    expect(tituloDasPartes(partesDaMarcada('R$ 888,49', 'planilha'))).toBe('Valor do mês ajustado · previsto R$ 888,49 · pela planilha');
  });
  it('o motivo da conta paga', () => { expect(MOTIVO_CONTA_PAGA).toBe('Conta já paga.'); });
});
