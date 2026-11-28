/**
 * CONTAS-CONSUMO-01 C1 + CAIXA-OCR-01 O4 — os leitores da fatura de energia (NF3e, modelo 66) e da posição de operações do banco.
 * ⚠ Dado INVENTADO no formato do layout (concessionária, titular, unidade, chave e valores fictícios; a chave de 44 dígitos foi montada com
 * o CNPJ de exemplo 11.222.333/0001-81 e o DV certo); nenhum documento de cliente entra.
 */
import { describe, it, expect } from 'vitest';
import { lerFaturaConsumo, chaveNF3e, FRASE_NAO_E_FATURA } from './lerFaturaConsumo';
import { lerPosicaoOperacoes, FRASE_NAO_E_POSICAO } from './lerPosicaoOperacoes';
import { chaveValidaDoModelo, chaveValida } from '@/lib/oc/leitura/chaveNFe';

const L = (...c: string[]) => c.join(' | ');
const CHAVE = '50261111222333000181660010000123451123456780';
const FATURA = [
  'DANF3E - DOCUMENTO AUXILIAR DA NOTA FISCAL DE ENERGIA ELÉTRICA ELETRÔNICA', 'CONCESSIONARIA EXEMPLO DE ENERGIA S.A.', 'Rua Exemplo, 1',
  L('CNPJ 11.222.333/0001-81', 'Insc. Est. 00.000.000-0'), L('Data de Apresentação:', '27/03/2026'), 'TITULAR EXEMPLO DA SILVA',
  L('24/02/2026', '24/03/2026', '28', '22/04/2026'), 'RUA DO TITULAR, 10 - SITIO - 00000000', 'NOTA FISCAL Nº: 000.012.345 - Série: 001',
  'chave de acesso:', '5026 1111 2223 3300 0181 6600 1000 0123 4511 2345', '6780', L('Março / 2026', '16/04/2026', 'R$ 61,29'),
  L('X0000000001', 'Energia ativa em kWh', 'Ponta', '403', '422', '1', '19', 'Art. 1'),
  'CADASTRE SUA FATURA EM DÉBITO AUTOMÁTICO UTILIZANDO O CÓDIGO: 0000000001-1',
];

describe('a chave da NF3e', () => {
  it('modelo 66 com DV certo; a mesma régua da NF-e (55 continua 55)', () => {
    expect(chaveValidaDoModelo(CHAVE, '66')).toBe(true);
    expect(chaveValida(CHAVE)).toBe(false);
    expect(chaveValidaDoModelo(CHAVE.slice(0, 43) + '1', '66')).toBe(false);
    expect(chaveNF3e('chave: 5026 1111 2223 3300 0181 6600 1000 0123 4511 2345\n6780 fim')).toBe(CHAVE);
    expect(chaveNF3e('nada aqui 1234')).toBeNull();
  });
});

describe('a fatura de energia', () => {
  it('a chave manda (CNPJ, número, série); do texto: referência, vencimento, valor, UC, medidor, consumo, leitura, titular, endereço, débito', () => {
    const r = lerFaturaConsumo([FATURA]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.fatura).toEqual({
      tipo: 'energia', chave: CHAVE, concessionaria: { nome: 'CONCESSIONARIA EXEMPLO DE ENERGIA S.A.', cnpj: '11222333000181' },
      numero: '000012345', serie: '001', referencia: '2026-03', vencimento: '2026-04-16', valor: 61.29, uc: '0000000001', medidor: 'X0000000001',
      titular: 'TITULAR EXEMPLO DA SILVA', endereco: 'RUA DO TITULAR, 10 - SITIO - 00000000', consumoKwh: 19,
      leitura: { anterior: '2026-02-24', atual: '2026-03-24', dias: 28 }, debitoAutomatico: '0000000001-1', linhaDigitavel: null,
    });
  });
  it('a UC pelo rótulo próprio manda sobre o código do débito automático', () => {
    const r = lerFaturaConsumo([[...FATURA, L('Unidade Consumidora:', '7777777')]]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.fatura.uc).toBe('7777777');
  });
  it('o que não veio fica null (nunca inventado)', () => {
    const r = lerFaturaConsumo([FATURA.filter((l) => !l.startsWith('Março') && !l.includes('Energia ativa') && !l.startsWith('CADASTRE'))]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.fatura).toMatchObject({ referencia: null, vencimento: null, valor: null, medidor: null, consumoKwh: null, uc: null, debitoAutomatico: null });
  });
  it('sem chave de modelo 66 com DV certo não é fatura (o texto parecido não basta)', () => {
    expect(lerFaturaConsumo([FATURA.filter((l) => !l.startsWith('5026') && l !== '6780')])).toEqual({ ok: false, frase: FRASE_NAO_E_FATURA });
    expect(lerFaturaConsumo([FATURA.map((l) => l.replace('6780', '6781'))])).toEqual({ ok: false, frase: FRASE_NAO_E_FATURA });
  });
});

const POSICAO = [
  'Pág.:1de1', 'Posição de operações financeiras para simples conferência', L('Nome: CLIENTE EXEMPLO', 'Data base:', 'Data de emissão:'),
  L('CPF: 000.000.000-00', '26/03/2026', '27/03/2026'),
  L('RURAL CUSTEIO EXEMPLO', '000000000001', 'PRE', 'BRL', '12,50', '0', '02/02/2026', '26/07/2027', 'R$ 100.000,00', 'R$ 1.500,00', 'R$ 0,00', 'R$ 101.500,00'),
  L('INVESTIMENTO EXEMPLO', '000000000002', 'PRE', 'BRL', '8,00', '0', '01/01/2025', '01/01/2030', 'R$ 50.000,00', 'R$ 500,00', 'R$ 0,00', 'R$ 50.500,00'),
  L('Total', 'R$ 150.000,00', 'R$ 2.000,00', 'R$ 0,00', 'R$ 152.000,00'),
];
describe('a posição de operações do banco', () => {
  it('data base, emissão e, por operação, contrato, taxa, datas e os 4 valores; confere com o total', () => {
    const r = lerPosicaoOperacoes([POSICAO]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.posicao).toMatchObject({ dataBase: '2026-03-26', emissao: '2026-03-27', total: 152000, confere: true });
    expect(r.posicao.operacoes[0]).toEqual({ produto: 'RURAL CUSTEIO EXEMPLO', contrato: '000000000001', taxa: 12.5, inicio: '2026-02-02',
      vencimento: '2027-07-26', principal: 100000, juros: 1500, atraso: 0, saldo: 101500 });
    expect(r.posicao.operacoes.map((o) => o.contrato)).toEqual(['000000000001', '000000000002']);
  });
  it('o total que não bate: confere = false', () => {
    const r = lerPosicaoOperacoes([POSICAO.map((l) => l.replace('R$ 152.000,00', 'R$ 152.000,01'))]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.posicao.confere).toBe(false);
  });
  it('não é posição: sem o título, sem a data base ou sem operação', () => {
    const nao = { ok: false, frase: FRASE_NAO_E_POSICAO };
    expect(lerPosicaoOperacoes([POSICAO.slice(2)])).toEqual(nao);
    expect(lerPosicaoOperacoes([POSICAO.filter((l) => !l.startsWith('CPF'))])).toEqual(nao);
    expect(lerPosicaoOperacoes([POSICAO.slice(0, 4)])).toEqual(nao);
  });
});
