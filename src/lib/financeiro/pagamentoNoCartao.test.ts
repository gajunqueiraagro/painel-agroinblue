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
  comoAbre, comPagamento, diaMaisFrequente, fraseDoRodapeDoCartao, parcelasDoCartao, periodoDaSugestao, primeiraFatura, rotuloDaSugestao,
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
});
