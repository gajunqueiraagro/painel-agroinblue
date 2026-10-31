/**
 * P74 — a nota paga no cartão em N vezes (PURO). Números do caso real (NF 778.618: R$ 3.284,88 em 4 × 821,22, faturas 10/09 a 10/12/2026),
 * cadastros e nomes SINTÉTICOS.
 *   K1 abre em Duplicatas com duplicatas, senão À vista · K2 o dia mais frequente; empate = o mais recente; sem histórico = nulo
 *   K3 a 1ª fatura no mês seguinte à emissão (o dia que o mês não tem vira o último) · K4 as parcelas pelo arredondamento do Novo
 *   lançamento (4 × 821,22; 100 em 3 = 33,33/33,33/33,34) e os limites 2..24 · K5 a nota como foi paga (cartão: as parcelas no lugar das
 *   duplicatas, mensal; à vista: sem duplicatas; duplicatas: intocada) · K6 os rótulos
 */
import { describe, it, expect } from 'vitest';
import {
  comoAbre, comPagamento, diaDoVencimentoDoCartao, explicacaoDaFatura, diaMaisFrequente, faturaDaCompra, fechamentoDaCompra, formaPelaConta, fraseDaFaturaNoLancamento, fraseDoRodapeDoCartao, vencimentoPelaFatura, parcelasDoCartao, periodoDaSugestao, primeiraFatura, rotuloDaSugestao,
} from './pagamentoNoCartao';
import type { DoXml } from './nfePrefill';
import { digitoDaChave } from './nfe/danfe';
import { notaDaChaveDigitada } from './nfe/chaveDigitada';
import { proporLancamento } from './nfe/proporLancamento';
import { resolverEmitente } from './nfe/resolverEmitente';

/* uma nota SINTÉTICA de R$ 3.284,88 sem duplicata (a da chave digitada, com emissão e valor preenchidos) */
function doXmlSintetico(): DoXml {
  const c43 = '5026081122233300042455001000000937121753829';
  const r = notaDaChaveDigitada(`${c43}${digitoDaChave(c43)}`);
  if (r.ok === false) throw new Error(r.frase);
  const nota = { ...r.nota, emissao: '2026-08-10', totais: { ...r.nota.totais, produtosCent: 328488, notaCent: 328488 } };
  const resolucao = resolverEmitente(nota.emitente, [], null);
  const p = proporLancamento({ nota, avisosDoLeitor: [], fazendas: [], emitente: resolucao, favorecidoId: null, ultima: null });
  if (p.ok === false) throw new Error(p.frase);
  return { proposta: p.proposta, emitenteNome: '', emitenteDocumento: nota.emitente.documento, resolucao, ocorrencias: [], arquivo: new File([], 'n.pdf') };
}
const DOXML = doXmlSintetico();

describe('P74 — pagamento no cartão', () => {
  it('K1 abre em Duplicatas com duplicatas; sem, À vista', () => {
    expect([comoAbre(3), comoAbre(1), comoAbre(0)]).toEqual(['duplicatas', 'duplicatas', 'avista']);
  });
  it('K2 o dia mais frequente; empate: o mais recente; sem histórico: nulo', () => {
    expect(diaMaisFrequente([{ dia: 10, lancamentos: 409, ultimo: '2026-10-10' }, { dia: 13, lancamentos: 1, ultimo: '2026-10-13' }])).toBe(10);
    expect(diaMaisFrequente([{ dia: 10, lancamentos: 3, ultimo: '2026-03-10' }, { dia: 5, lancamentos: 3, ultimo: '2026-06-05' }])).toBe(5);
    expect(diaMaisFrequente([{ dia: 5, lancamentos: 3, ultimo: '2026-06-05' }, { dia: 10, lancamentos: 3, ultimo: '2026-03-10' }])).toBe(5);
    expect(diaMaisFrequente([])).toBeNull();
    expect(periodoDaSugestao('2026-10-24')).toEqual({ desde: '2025-10-24', ate: '2026-10-24' });
  });
  it('K3 a 1ª fatura: o dia no mês seguinte à emissão', () => {
    expect(primeiraFatura('2026-08-10', 10)).toBe('2026-09-10');
    expect(primeiraFatura('2026-12-20', 5)).toBe('2027-01-05');
    expect(primeiraFatura('2027-01-15', 31)).toBe('2027-02-28');
    expect(primeiraFatura('', 10)).toBe('');
  });
  it('K4 as parcelas pelo arredondamento do Novo lançamento, de 2 a 24', () => {
    expect(parcelasDoCartao(328488, 4, '2026-09-10')).toEqual([
      { numero: '1', vencimento: '2026-09-10', valorCent: 82122 }, { numero: '2', vencimento: '2026-10-10', valorCent: 82122 },
      { numero: '3', vencimento: '2026-11-10', valorCent: 82122 }, { numero: '4', vencimento: '2026-12-10', valorCent: 82122 }]);
    expect(parcelasDoCartao(10000, 3, '2026-01-31').map((x) => [x.vencimento, x.valorCent])).toEqual([['2026-01-31', 3333], ['2026-02-28', 3333], ['2026-03-31', 3334]]);
    expect([parcelasDoCartao(10000, 1, '2026-09-10'), parcelasDoCartao(10000, 25, '2026-09-10'), parcelasDoCartao(10000, 4, '')]).toEqual([[], [], []]);
    expect(parcelasDoCartao(10000, 24, '2026-09-10')).toHaveLength(24);
  });
  it('K5 a nota como foi paga', () => {
    const cartao = comPagamento(DOXML, 'cartao', parcelasDoCartao(328488, 4, '2026-09-10'));
    expect(cartao.proposta.duplicatas.map((x) => x.valorCent)).toEqual([82122, 82122, 82122, 82122]);
    expect(cartao.proposta.valorCent).toBe(328488);
    expect(cartao.proposta.parcelamento).toEqual({ tipo: 'parcelado', parcelas: 4, primeiroVencimento: '2026-09-10' });
    const livres = comPagamento(DOXML, 'cartao', [{ numero: '1', vencimento: '2026-09-10', valorCent: 200000 }, { numero: '2', vencimento: '2026-10-03', valorCent: 128488 }]);
    expect(livres.proposta.parcelamento).toEqual({ tipo: 'livres', parcelas: 2 });
    const comDup = { ...DOXML, proposta: { ...DOXML.proposta, duplicatas: [{ numero: '1', vencimento: '2026-09-10', valorCent: 328488 }] } };
    expect(comPagamento(comDup, 'avista').proposta.duplicatas).toEqual([]);
    expect(comPagamento(comDup, 'duplicatas')).toBe(comDup);
  });
  it('K6 os rótulos', () => {
    expect(rotuloDaSugestao('Cartão Elo', 10)).toBe('1ª fatura · sugerido (Elo, dia 10)');
    expect(fraseDoRodapeDoCartao('PDF', 4, '778.618', 'Cartão Elo')).toBe('O PDF fica anexado às 4 parcelas como a NF 778.618 · 4 saídas no Cartão Elo, uma em cada fatura.');
  });

  /* CARTAO-LANCAMENTO-01 (Gabriel 30/10, decisão 3): a compra vence na fatura onde ela cai pelo FECHAMENTO do cartão; sem fechamento
     cadastrado, a regra de hoje (o dia da fatura no mês seguinte à competência) */
  it('K7 sem dia de fechamento, a fatura é a de hoje: o dia do vencimento no mês seguinte à compra', () => {
    expect(faturaDaCompra('2026-10-30', 10, null)).toBe('2026-11-10');
    expect(faturaDaCompra('2026-10-02', 10, null)).toBe(primeiraFatura('2026-10-02', 10));
  });
  it('K8 com fechamento antes do vencimento (fecha 3, vence 10): antes do dia 3 cai na fatura do mês; do dia 3 em diante, na seguinte', () => {
    expect(faturaDaCompra('2026-10-02', 10, 3)).toBe('2026-10-10');
    expect(faturaDaCompra('2026-10-03', 10, 3)).toBe('2026-11-10');
    expect(faturaDaCompra('2026-10-30', 10, 3)).toBe('2026-11-10');
    expect(faturaDaCompra('2026-12-15', 10, 3)).toBe('2027-01-10');
  });
  it('K9 com fechamento depois do vencimento (fecha 28, vence 5): a fatura que fecha no mês vence no dia 5 do mês seguinte', () => {
    expect(faturaDaCompra('2026-10-27', 5, 28)).toBe('2026-11-05');
    expect(faturaDaCompra('2026-10-28', 5, 28)).toBe('2026-12-05');
    expect(faturaDaCompra('2026-12-28', 5, 28)).toBe('2027-02-05');
  });
  it('K10 o dia que o mês não tem vira o último (fecha 30, vence 31 em fevereiro); entrada inválida = vazio', () => {
    expect(faturaDaCompra('2027-01-31', 31, 30)).toBe('2027-02-28');
    expect(faturaDaCompra('2027-02-27', 31, 30)).toBe('2027-02-28');
    expect(faturaDaCompra('', 10, 3)).toBe('');
    expect(faturaDaCompra('2026-10-02', 0, 3)).toBe('');
    expect(faturaDaCompra('2026-10-02', 10, 32)).toBe('');
  });

  /* CARTAO-LANCAMENTO-01 (Gabriel 30/10 18:36): o dia do vencimento = o DIGITADO no cadastro; vazio → o mais frequente das faturas
     (sugestão); nenhum → não sugere */
  it('K11 o dia digitado manda; vazio, o das faturas como sugestão; nenhum, nada', () => {
    const faturas = [{ dia: 10, lancamentos: 9, ultimo: '2026-10-10' }, { dia: 13, lancamentos: 1, ultimo: '2026-09-13' }];
    expect(diaDoVencimentoDoCartao(15, faturas)).toEqual({ dia: 15, origem: 'digitado' });
    expect(diaDoVencimentoDoCartao(null, faturas)).toEqual({ dia: 10, origem: 'faturas' });
    expect(diaDoVencimentoDoCartao(null, [])).toBeNull();
    expect(diaDoVencimentoDoCartao(0, faturas)).toEqual({ dia: 10, origem: 'faturas' });
  });

  /* CARTAO-LANCAMENTO-01 — a frase do cadastro (mock v2, "Em qual fatura cai a compra"), no mês seguinte ao de hoje */
  it('K12 a explicação da fatura no cadastro', () => {
    expect(explicacaoDaFatura(3, 10, '2026-10-30')).toEqual({
      titulo: 'Em qual fatura cai a compra (fecha dia 3, vence dia 10):',
      linha: 'compra de 01/11 ou 02/11 → fatura que fecha em 03/11 e vence em 10/11 · compra de 03/11 em diante (no dia do fechamento também) → vence em 10/12',
      nota: 'Sem dia de fechamento: vence no dia 10 do mês seguinte à compra (a regra de hoje).',
    });
    expect(explicacaoDaFatura(28, 5, '2026-10-30').linha).toBe(
      'compra de 01/11 a 27/11 → fatura que fecha em 28/11 e vence em 05/12 · compra de 28/11 em diante (no dia do fechamento também) → vence em 05/01');
    expect(explicacaoDaFatura(2, 10, '2026-10-30').linha.startsWith('compra de 01/11 → fatura que fecha em 02/11')).toBe(true);
    expect(explicacaoDaFatura(1, 10, '2026-10-30').linha).toBe('toda compra (no dia do fechamento também) → vence em 10/12, na fatura que fecha no dia 1 seguinte');
    expect(explicacaoDaFatura(null, 10, '2026-10-30')).toEqual({ titulo: 'Em qual fatura cai a compra (vence dia 10):',
      linha: 'Sem dia de fechamento: vence no dia 10 do mês seguinte à compra (a regra de hoje).', nota: '' });
    expect(explicacaoDaFatura(3, null, '2026-10-30')).toEqual({ titulo: 'Em qual fatura cai a compra:',
      linha: 'Digite o dia de vencimento (ou deixe o sugerido pelas faturas) para ver em qual fatura cai a compra.', nota: '' });
  });

  /* CARTAO-LANCAMENTO-01 (decisão 2) — a forma pela conta: só vazia ou a automática; o operador e a nota nunca são trocados */
  it('K13 a forma automática do cartão', () => {
    expect(formaPelaConta({ forma: '', automatica: false }, true)).toEqual({ forma: 'Cartão de crédito', automatica: true });
    expect(formaPelaConta({ forma: 'PIX', automatica: false }, true)).toEqual({ forma: 'PIX', automatica: false });
    expect(formaPelaConta({ forma: 'Cartão de crédito', automatica: true }, true)).toEqual({ forma: 'Cartão de crédito', automatica: true });
    expect(formaPelaConta({ forma: 'Cartão de crédito', automatica: true }, false)).toEqual({ forma: '', automatica: false });
    expect(formaPelaConta({ forma: 'Boleto', automatica: false }, false)).toEqual({ forma: 'Boleto', automatica: false });
    expect(formaPelaConta({ forma: 'Cartão de crédito', automatica: false }, false)).toEqual({ forma: 'Cartão de crédito', automatica: false });
  });

  it('K14 o vencimento pela fatura: entra no vazio ou no lugar da sugestão anterior; a data do operador fica', () => {
    expect(vencimentoPelaFatura('', '', '2026-11-10')).toBe('2026-11-10');
    expect(vencimentoPelaFatura('2026-11-10', '2026-11-10', '2026-12-10')).toBe('2026-12-10');
    expect(vencimentoPelaFatura('2026-11-20', '2026-11-10', '2026-12-10')).toBe('2026-11-20');
    expect(vencimentoPelaFatura('2026-11-20', '', '')).toBe('2026-11-20');
  });

  it('K15 o fechamento da compra e a frase do lançamento (mock v2)', () => {
    expect(fechamentoDaCompra('2026-10-30', 3)).toBe('2026-11-03');
    expect(fechamentoDaCompra('2026-11-02', 3)).toBe('2026-11-03');
    expect(fechamentoDaCompra('2026-11-03', 3)).toBe('2026-12-03');
    expect(fechamentoDaCompra('2026-02-10', 31)).toBe('2026-02-28');
    expect(fraseDaFaturaNoLancamento('Cartão Elo', '2026-10-30', { dia: 10, origem: 'digitado' }, 3))
      .toBe('Cartão Elo: compra de 30/10 cai na fatura que fecha 03/11 e vence 10/11 · pode trocar');
    expect(fraseDaFaturaNoLancamento('Cartão Elo', '2026-10-30', { dia: 10, origem: 'faturas' }, null))
      .toBe('Cartão Elo: compra de 30/10 cai na fatura que vence 10/11 (dia 10, sugerido pelas faturas; sem dia de fechamento) · pode trocar');
    expect(fraseDaFaturaNoLancamento('Cartão Elo', '2026-10-30', { dia: 10, origem: 'digitado' }, null)).toContain('(dia 10, do cadastro;');
    expect(fraseDaFaturaNoLancamento('Cartão Elo', '', { dia: 10, origem: 'digitado' }, 3)).toBe('');
  });
});
