/**
 * FIN-PIX-CADASTRO-MODAL-01 — a montagem dos dados para pagamento a partir do cadastro do fornecedor.
 *
 * ⚠ O TEXTO É CONTRATO: `textoDoCadastro` tem de devolver, byte a byte, o que o `buildDadosPagamento` do modal gravava — é a
 *   comparação com ele que decide se uma cópia antiga "segue o cadastro" ou é "dados próprios". Os textos esperados aqui são
 *   os do formato gravado no proto ("PIX | Tipo: CPF\nChave: …\nFavorecido: …"), escritos por extenso.
 */
import { describe, it, expect } from 'vitest';
import {
  formaEfetiva, linhasDoCadastro, modoDosDados, normalizarFormaDoCadastro, textoDoCadastro, valorParaCopiar,
  type CadastroDePagamento,
} from './dadosPagamentoDoCadastro';

const f = (x: Partial<CadastroDePagamento>): CadastroDePagamento => ({
  nome: 'Agnaldo da Cruz Cunegundes', tipo_recebimento: null, pix_tipo_chave: null, pix_chave: null, banco: null, agencia: null,
  conta: null, tipo_conta: null, cpf_cnpj_pagamento: null, nome_favorecido: null, observacao_pagamento: null, ...x,
});
const PIX = f({ tipo_recebimento: 'PIX', pix_tipo_chave: 'Telefone', pix_chave: '67999990000', nome_favorecido: 'Agnaldo da Cruz Cunegundes' });
const BANCO = f({ nome: 'Oficina do Zé', tipo_recebimento: 'Transferência Bancária', banco: 'Sicredi', agencia: '0903', conta: '12345-6',
  tipo_conta: 'Corrente', cpf_cnpj_pagamento: '12.345.678/0001-90', nome_favorecido: 'José da Silva ME' });

describe('textoDoCadastro — o formato gravado, byte a byte', () => {
  it('PIX com favorecido', () => {
    expect(textoDoCadastro(PIX, 'PIX')).toBe('PIX | Tipo: Telefone\nChave: 67999990000\nFavorecido: Agnaldo da Cruz Cunegundes');
  });
  it('PIX sem favorecido e sem tipo de chave ("-"), com observação no fim', () => {
    expect(textoDoCadastro(f({ pix_chave: '123.456.789-00' }), 'PIX')).toBe('PIX | Tipo: -\nChave: 123.456.789-00');
    expect(textoDoCadastro(f({ pix_chave: 'a@b.com', pix_tipo_chave: 'E-mail', observacao_pagamento: 'pagar até dia 5' }), 'PIX'))
      .toBe('PIX | Tipo: E-mail\nChave: a@b.com\npagar até dia 5');
  });
  it('Transferência: as seis linhas, na ordem; e "Transferência Bancária" dá o MESMO texto', () => {
    const esperado = 'Banco: Sicredi\nAgência: 0903\nConta: 12345-6\nTipo: Corrente\nCPF/CNPJ: 12.345.678/0001-90\nFavorecido: José da Silva ME';
    expect(textoDoCadastro(BANCO, 'Transferência')).toBe(esperado);
    expect(textoDoCadastro(BANCO, 'Transferência Bancária')).toBe(esperado);
    expect(textoDoCadastro(BANCO)).toBe(esperado);                        // sem método: o tipo do cadastro
  });
  it('PIX no lançamento com tipo Boleto (ou nenhum) no cadastro devolve a chave — decisão 5', () => {
    expect(textoDoCadastro(f({ tipo_recebimento: 'Boleto', pix_tipo_chave: 'CNPJ', pix_chave: '09.248.179/0001-75' }), 'PIX'))
      .toBe('PIX | Tipo: CNPJ\nChave: 09.248.179/0001-75');
    expect(textoDoCadastro(f({ pix_chave: '11999998888' }), 'PIX')).toBe('PIX | Tipo: -\nChave: 11999998888');
  });
  it('sem chave devolve vazio; forma sem dado de cadastro (Boleto) também — só a observação, se houver', () => {
    expect(textoDoCadastro(f({ tipo_recebimento: 'PIX' }), 'PIX')).toBe('');
    expect(textoDoCadastro(PIX, 'Boleto')).toBe('');
    expect(textoDoCadastro(f({ pix_chave: 'x', observacao_pagamento: 'obs' }), 'Boleto')).toBe('obs');
  });
});

describe('forma efetiva — a do lançamento; sem ela, a preferida do cadastro', () => {
  it('"Transferência Bancária" do cadastro é "Transferência"; o resto passa como veio', () => {
    expect(normalizarFormaDoCadastro('Transferência Bancária')).toBe('Transferência');
    expect(['PIX', 'Boleto', 'Cartão', 'Débito Automático', 'Débito', 'Outro'].map(normalizarFormaDoCadastro))
      .toEqual(['PIX', 'Boleto', 'Cartão', 'Débito Automático', 'Débito', 'Outro']);
    expect(normalizarFormaDoCadastro(null)).toBe('');
  });
  it('a forma do lançamento vence; vazia, vale a do cadastro; sem nenhuma, vazio', () => {
    expect(formaEfetiva('Boleto', PIX)).toBe('Boleto');
    expect(formaEfetiva('', PIX)).toBe('PIX');
    expect(formaEfetiva(null, BANCO)).toBe('Transferência');
    expect(formaEfetiva('', f({}))).toBe('');
    expect(formaEfetiva('', null)).toBe('');
  });
});

describe('linhasDoCadastro — o que o bloco desenha', () => {
  it('PIX: tipo (sem copiar), chave (principal), favorecido, valor — e o valor copia sem R$ nem milhar', () => {
    const b = linhasDoCadastro(PIX, 'PIX', -3192, 'R$ 3.192,00');
    if (b.tipo !== 'dados') throw new Error('esperava o bloco');
    expect(b.titulo).toBe('PIX');
    expect(b.linhas.map(l => [l.rotulo, l.valor, l.copia ?? null, !!l.principal])).toEqual([
      ['Tipo da chave', 'Telefone', null, false],
      ['Chave', '67999990000', '67999990000', true],
      ['Favorecido', 'Agnaldo da Cruz Cunegundes', 'Agnaldo da Cruz Cunegundes', false],
      ['Valor', 'R$ 3.192,00', '3192,00', false],
    ]);
    expect(b.observacao).toBeNull();
  });
  it('favorecido cai no nome do fornecedor quando o cadastro não tem nome_favorecido', () => {
    const b = linhasDoCadastro(f({ nome: 'Comercial Pantanal', pix_chave: 'k' }), 'PIX', 10, 'R$ 10,00');
    expect(b.tipo === 'dados' && b.linhas[2].valor).toBe('Comercial Pantanal');
  });
  it('Transferência: banco, agência / conta · tipo, CPF/CNPJ, favorecido, valor', () => {
    const b = linhasDoCadastro(BANCO, 'Transferência', 1234.5, 'R$ 1.234,50');
    if (b.tipo !== 'dados') throw new Error('esperava o bloco');
    expect(b.titulo).toBe('Transferência');
    expect(b.linhas.map(l => [l.rotulo, l.valor, l.copia ?? null])).toEqual([
      ['Banco', 'Sicredi', null],
      ['Agência / Conta', '0903 / 12345-6 · Corrente', '0903 / 12345-6 · Corrente'],
      ['CPF/CNPJ', '12.345.678/0001-90', '12.345.678/0001-90'],
      ['Favorecido', 'José da Silva ME', 'José da Silva ME'],
      ['Valor', 'R$ 1.234,50', '1234,50'],
    ]);
  });
  it('sem dado para a forma: falta (pix | banco); forma sem cadastro ou sem fornecedor: nada', () => {
    expect(linhasDoCadastro(f({ tipo_recebimento: 'PIX' }), 'PIX', 1, 'R$ 1,00')).toEqual({ tipo: 'falta', falta: 'pix' });
    expect(linhasDoCadastro(PIX, 'Transferência', 1, 'R$ 1,00')).toEqual({ tipo: 'falta', falta: 'banco' });
    for (const forma of ['Boleto', 'Cartão', 'Débito', 'Débito Automático', 'Dinheiro', 'Outro', '']) {
      expect(linhasDoCadastro(PIX, forma, 1, 'R$ 1,00')).toEqual({ tipo: 'nada' });
    }
    expect(linhasDoCadastro(null, 'PIX', 1, 'R$ 1,00')).toEqual({ tipo: 'nada' });
  });
  it('valorParaCopiar', () => {
    expect([3192, -3192, 0.5, 1234567.891].map(valorParaCopiar)).toEqual(['3192,00', '3192,00', '0,50', '1234567,89']);
  });
});

describe('modoDosDados — a decisão 3', () => {
  const cad = textoDoCadastro(PIX, 'PIX');
  it('não realizado: vazio ou igual ao cadastro = cadastro; diferente = próprio', () => {
    expect(modoDosDados({ realizado: false, textoGravado: '', textoDoCadastro: cad })).toBe('cadastro');
    expect(modoDosDados({ realizado: false, textoGravado: cad, textoDoCadastro: cad })).toBe('cadastro');
    expect(modoDosDados({ realizado: false, textoGravado: `${cad}\n`, textoDoCadastro: cad })).toBe('cadastro');   // só espaço no fim
    expect(modoDosDados({ realizado: false, textoGravado: 'PIX | Tipo: CPF\nChave: 000', textoDoCadastro: cad })).toBe('proprio');
    expect(modoDosDados({ realizado: false, textoGravado: 'qualquer', textoDoCadastro: '' })).toBe('proprio');       // sem com o que comparar
  });
  it('realizado: com texto gravado é o gravado (mesmo igual ao cadastro); sem texto, o cadastro', () => {
    expect(modoDosDados({ realizado: true, textoGravado: cad, textoDoCadastro: cad })).toBe('proprio');
    expect(modoDosDados({ realizado: true, textoGravado: '', textoDoCadastro: cad })).toBe('cadastro');
  });
});
