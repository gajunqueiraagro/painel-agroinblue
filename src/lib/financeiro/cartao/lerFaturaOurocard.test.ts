/**
 * CARTAO-FATURA-IMPORT-01 — o leitor da fatura BB Ourocard sobre linhas SINTÉTICAS (nomes e valores inventados; o gabarito com as
 * faturas reais fica fora do repositório, em relatorios/nf-gabarito/cartao).
 */
import { describe, expect, it } from 'vitest';
import { dataDaCompra, lerFaturaOurocard } from './lerFaturaOurocard';

const fatura = (totalDaFatura = '1.311,90') => [
  'Fulano de Tal',
  'OUROCARD VISA | Final 1234',
  'Vencimento',
  '16/10/2026 | Pagamentos/Créditos | R$ -1.018,00',
  'Fatura fechada em | 05/10/2026',
  'Fulano de Tal (Cartão 1234)',
  'Data | Descrição | País | Valor',
  'SALDO FATURA ANTERIOR | BR | R$ 1.000,00',
  'Pagamentos/Créditos',
  '16/09 | PGTO DEBITO CONTA 0001 000000001 200 | BR | R$ -1.000,00',
  '02/10 | DESC AUTOMATICO ANUD. TIT-PARC 06/12 | BR | R$ -18,00',
  'Serviços',
  '04/09 | LOJA EXEMPLO | CAMPO GRANDE | BR | R$ 156,00',
  '21/09 | LOJA DE FORA | CIDADE PY | PY | R$ 500,00',
  '*** | 1.000.000,00 GUARANI',
  'Página 2/3',
  'equivalente a US$ 93,20',
  'Cotação do Dólar de 21/09: R$ 5,3638',
  'Outros lançamentos',
  '22/09 | IOF - COMPRA NO EXTERIOR | R$ 17,50',
  '02/10 | ANUIDADE DIFERENCIADA TIT-PARC 06/12 | BR | R$ 18,00',
  'Compras parceladas',
  '26/11 | LOJA PARCELADA PARC 11/12 OSASCO | BR | R$ 299,69',
  'Página 3/3',
  '27/07 | OUTRA LOJA | PARC 03/04 CAMPO GRANDE | BR | R$ 338,71',
  `Total da Fatura | R$ ${totalDaFatura}`,
];

describe('leitor da fatura BB Ourocard', () => {
  it('cabeçalho: produto, final, titular, vencimento, fechamento, total e saldo anterior', () => {
    const f = lerFaturaOurocard(fatura());
    expect([f.produto, f.finalCartao, f.titular]).toEqual(['OUROCARD VISA', '1234', 'Fulano de Tal']);
    expect([f.vencimento, f.fechamento]).toEqual(['2026-10-16', '2026-10-05']);
    expect([f.totalCent, f.saldoAnteriorCent]).toEqual([131190, 100000]);
  });

  it('os lançamentos por tipo e seção; a soma (saldo anterior + lançamentos) confere com o total', () => {
    const f = lerFaturaOurocard(fatura());
    expect(f.linhas.map(l => l.tipo)).toEqual(['pagamento', 'desconto_anuidade', 'compra', 'compra', 'iof', 'anuidade', 'compra', 'compra']);
    expect(f.linhas[2]).toMatchObject({ secao: 'Serviços', dataCompra: '2026-09-04', descricao: 'LOJA EXEMPLO CAMPO GRANDE', pais: 'BR', valorCent: 15600 });
    expect(f.linhas[4]).toMatchObject({ descricao: 'IOF - COMPRA NO EXTERIOR', pais: null, valorCent: 1750 });
    expect(f.somaConfere).toBe(true);
    expect(f.avisos).toEqual([]);
  });

  it('PARC k/N: a parcela e a data da COMPRA (mês depois do fechamento = ano anterior)', () => {
    const f = lerFaturaOurocard(fatura());
    const parc = f.linhas.filter(l => l.tipo === 'compra' && l.parcela);
    expect(parc.map(l => [l.dataCompra, l.parcela])).toEqual([['2025-11-26', { k: 11, n: 12 }], ['2026-07-27', { k: 3, n: 4 }]]);
    /* a troca de página no meio das parceladas não muda a seção */
    expect(parc.map(l => l.secao)).toEqual(['Compras parceladas', 'Compras parceladas']);
    expect(dataDaCompra('05/10', '2026-10-05')).toBe('2026-10-05');
    expect(dataDaCompra('06/10', '2026-10-05')).toBe('2026-10-06');
  });

  it('compra no exterior: moeda, valor original, US$ e cotação vêm das linhas de baixo, mesmo com a troca de página no meio', () => {
    const f = lerFaturaOurocard(fatura());
    expect(f.linhas[3].exterior).toEqual({ moeda: 'GUARANI', valorOriginal: '1.000.000,00', usd: '93,20', cotacao: '5,3638' });
  });

  it('a soma que não fecha vira aviso, e uma linha estranha também (nada some)', () => {
    const f = lerFaturaOurocard(fatura('1.311,91'));
    expect(f.somaConfere).toBe(false);
    expect(f.avisos.join(' ')).toContain('A soma não fecha');
    const g = lerFaturaOurocard([...fatura().slice(0, -1), '30/09 | LINHA SEM VALOR | BR', fatura().at(-1) ?? '']);
    expect(g.avisos.join(' ')).toContain('Linha não lida');
  });

  it('PDF que não é fatura: diz, não inventa', () => {
    const f = lerFaturaOurocard(['Extrato de conta corrente', 'Saldo | R$ 10,00']);
    expect(f.linhas).toEqual([]);
    expect(f.avisos[0]).toContain('Não achei a tabela');
  });
});
