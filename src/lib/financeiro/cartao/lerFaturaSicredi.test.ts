/**
 * CARTAO-FATURA-GRAVAR — o leitor da fatura Sicredi (Mastercard) e a porta única. ⚠ Linhas INVENTADAS no formato do leiaute (nomes,
 * cartões e valores fictícios); nenhuma fatura de cliente entra.
 */
import { describe, expect, it } from 'vitest';
import { dataDaCompraSicredi, lerFaturaSicredi, pareceFaturaSicredi } from './lerFaturaSicredi';
import { lerFaturaDoCartao } from './lerFatura';

const CABECALHO = (total = '1.234,56', mes = 'outubro') => [`Titular Exemplo | Vencimento | 10/10/2031`, `Mastercard Black | final | 1234 | Total fatura de ${mes} | R$ ${total}`];
const FATURA = [
  'Titular Exemplo | Limite total de crédito | R$ 50.000,00', 'Mastercard Black final 1234 | Melhor dia de compra 26',
  'Total fatura de outubro | R$ 1.234,56 | Total de parcelas em próximas faturas R$ 2.000,00',
  'Resumo da fatura | Valor (R$) Valor (US$) | Limite | em 25/09',
  'Total da fatura anterior | 1.000,00 | Saque à crédito | Crédito',
  'Pagamentos | Créditos | -1.000,00 | 0,00 | Total | R$ 1,00 | R$ 2,00',
  'Total desta Fatura | 1.234,56',
  ...CABECALHO(),
  'Transações', 'Cartão Titular Exemplo (final 1234)',
  'Data e hora | Cidade | Compra | Descrição | Parcela | Valor em Dolar | Cotação | Valor em reais', '(Transações no exterior¹) | do dólar',
  'Anuidade Diferenc 06/12', '25/set 03:00 | R$ 40,00', '1234',
  '12/set 10:15 | Pagamento 000000001 | -R$ 1.000,00',
  '25/set 03:00 | Credito Anuidade Cartao | -R$ 20,00',
  '28/ago 09:40 | Sao Paulo | Online | Provedor Exemplo de Internet | R$ 300,00',
  'Total cartão (final 1234) | R$ -680,00',
  'Cartão adicional Outro Exemplo (final 5678)',
  '02/set 14:02 | Campo Grande | Presencial | Loja de Pecas Exemplo | 02/03 | R$ 500,00',
  '15/set 08:30 | Presencial | Posto Exemplo da Rodovia | R$ 414,56',
  'Total cartão adicional (final 5678) | R$ 914,56',
];

describe('o leitor da fatura Sicredi', () => {
  it('S1 cabeçalho, as linhas (cartão de cada uma, parcela, descrição de cima na anuidade) e a soma que confere', () => {
    expect(pareceFaturaSicredi(FATURA)).toBe(true);
    const f = lerFaturaSicredi(FATURA);
    expect([f.produto, f.finalCartao, f.titular, f.vencimento, f.fechamento, f.totalCent, f.saldoAnteriorCent]).toEqual(
      ['Mastercard Black', '1234', 'Titular Exemplo', '2031-10-10', null, 123456, 100000]);
    expect(f.linhas.map((l) => [l.ordem, l.dataCompra, l.descricao, l.valorCent, l.tipo, l.finalCartao, l.parcela])).toEqual([
      [1, '2031-09-25', 'Anuidade Diferenc 06/12', 4000, 'anuidade', '1234', null],
      [2, '2031-09-12', 'Pagamento 000000001', -100000, 'pagamento', '1234', null],
      [3, '2031-09-25', 'Credito Anuidade Cartao', -2000, 'desconto_anuidade', '1234', null],
      [4, '2031-08-28', 'Provedor Exemplo de Internet', 30000, 'compra', '1234', null],
      [5, '2031-09-02', 'Loja de Pecas Exemplo', 50000, 'compra', '5678', { k: 2, n: 3 }],
      [6, '2031-09-15', 'Posto Exemplo da Rodovia', 41456, 'compra', '5678', null],
    ]);
    expect(f.linhas[4].titular).toBe('Outro Exemplo');
    expect(f.somaConfere).toBe(true);
    expect(f.avisos).toEqual([]);
  });
  it('S2 a fonte que troca o ponto do milhar por "!": vale como ponto; o total do resumo ilegível cede ao do cabeçalho', () => {
    const f = lerFaturaSicredi(FATURA.map((l) => l.replace('Total desta Fatura | 1.234,56', 'Total desta Fatura | !234,56')
      .replace('R$ 1.234,56', 'R$ 1!234,56').replace('-R$ 1.000,00', '-R$ 1!000,00')));
    expect(f.totalCent).toBe(123456);
    expect(f.linhas[1].valorCent).toBe(-100000);
    expect(f.somaConfere).toBe(true);
  });
  it('S3 o total do resumo e o do cabeçalho lidos e diferentes = aviso (vale o do resumo); a soma que não fecha = aviso', () => {
    const f = lerFaturaSicredi(FATURA.map((l) => l.replace('Total desta Fatura | 1.234,56', 'Total desta Fatura | 1.234,57')));
    expect(f.totalCent).toBe(123457);
    expect(f.somaConfere).toBe(false);
    expect(f.avisos.join(' ')).toMatch(/resumo \(123457\) e o do cabeçalho \(123456\) diferem/);
    expect(f.avisos.join(' ')).toMatch(/A soma não fecha/);
  });
  it('S4 o ano da compra pelo vencimento (compra de dezembro na fatura de janeiro = ano anterior); mês desconhecido = nulo', () => {
    expect(dataDaCompraSicredi('20', 'dez', '2032-01-10')).toBe('2031-12-20');
    expect(dataDaCompraSicredi('05', 'jan', '2032-01-10')).toBe('2032-01-05');
    expect(dataDaCompraSicredi('05', 'xyz', '2032-01-10')).toBeNull();
    expect(dataDaCompraSicredi('05', 'jan', null)).toBeNull();
  });
  it('S5 sem a tabela de transações = aviso, nenhuma linha; o Ourocard não "parece" Sicredi e a porta única escolhe o leitor', () => {
    const sem = lerFaturaSicredi(FATURA.filter((l) => !l.startsWith('Data e hora')));
    expect(sem.linhas).toEqual([]);
    expect(sem.avisos[0]).toMatch(/Transações/);
    const ourocard = ['OUROCARD VISA | Final 1234', '16/10/2031 | x', 'Data | Descrição | País | Valor', '04/09 | POSTO | BR | R$ 10,00', 'Total da Fatura | R$ 10,00'];
    expect(pareceFaturaSicredi(ourocard)).toBe(false);
    expect(lerFaturaDoCartao(ourocard).finalCartao).toBe('1234');
    expect(lerFaturaDoCartao(ourocard).linhas[0].descricao).toBe('POSTO');
    expect(lerFaturaDoCartao(FATURA).produto).toBe('Mastercard Black');
  });
});
