/**
 * FORN-EDITAR-01 — o validador único de CPF/CNPJ. Documentos SINTÉTICOS (dígitos verificadores calculados), e o exemplo OFICIAL
 * do CNPJ alfanumérico publicado pelo Serpro ("Cálculo dos dígitos verificadores de CNPJ alfanumérico": 12.ABC.345/01DE-35).
 */
import { describe, it, expect } from 'vitest';
import {
  chaveDoDocumento, mascararAoDigitar, situacaoDoGravado, validarDocumento,
  MOTIVO_CNPJ_DV, MOTIVO_CNPJ_LETRA_NO_DV, MOTIVO_CNPJ_REPETIDO, MOTIVO_CPF_COM_LETRA, MOTIVO_CPF_DV, MOTIVO_CPF_REPETIDO,
  MOTIVO_TAMANHO,
} from './documentoFiscal';

describe('vazio', () => {
  it('é válido, sem tipo, sem formato', () => {
    for (const t of ['', '   ', null, undefined, '.-/']) {
      expect(validarDocumento(t)).toEqual({ valido: true, tipo: null, formatado: '', digitos: '', motivo: null });
    }
  });
});

describe('CPF', () => {
  it('válido com e sem máscara, gravado no formato 000.000.000-00', () => {
    for (const t of ['52998224725', '529.982.247-25', ' 529 982 247 25 ']) {
      expect(validarDocumento(t)).toEqual({ valido: true, tipo: 'cpf', formatado: '529.982.247-25', digitos: '52998224725', motivo: null });
    }
    expect(validarDocumento('123.456.789-09').valido).toBe(true);
  });
  it('dígito verificador errado', () => {
    expect(validarDocumento('529.982.247-24')).toMatchObject({ valido: false, tipo: 'cpf', formatado: '', motivo: MOTIVO_CPF_DV });
    expect(validarDocumento('52998224735').motivo).toBe(MOTIVO_CPF_DV);
  });
  it('sequência repetida é recusada (mesmo com o DV "certo")', () => {
    for (const n of '0123456789') expect(validarDocumento(n.repeat(11)).motivo).toBe(MOTIVO_CPF_REPETIDO);
  });
  it('letra em 11 posições não é CPF', () => {
    expect(validarDocumento('5299822472A').motivo).toBe(MOTIVO_CPF_COM_LETRA);
  });
});

describe('CNPJ numérico', () => {
  it('válido com e sem máscara, gravado no formato 00.000.000/0000-00', () => {
    for (const t of ['11222333000181', '11.222.333/0001-81']) {
      expect(validarDocumento(t)).toEqual({ valido: true, tipo: 'cnpj', formatado: '11.222.333/0001-81', digitos: '11222333000181', motivo: null });
    }
  });
  it('dígito verificador errado', () => {
    expect(validarDocumento('11.222.333/0001-82')).toMatchObject({ valido: false, tipo: 'cnpj', motivo: MOTIVO_CNPJ_DV });
  });
  it('sequência repetida', () => {
    expect(validarDocumento('00000000000000').motivo).toBe(MOTIVO_CNPJ_REPETIDO);
  });
});

describe('CNPJ alfanumérico (Receita, a partir de jul/2026)', () => {
  it('o exemplo OFICIAL do Serpro: 12.ABC.345/01DE-35', () => {
    expect(validarDocumento('12ABC34501DE35')).toEqual({ valido: true, tipo: 'cnpj', formatado: '12.ABC.345/01DE-35', digitos: '12ABC34501DE35', motivo: null });
    expect(validarDocumento('12.ABC.345/01DE-35').formatado).toBe('12.ABC.345/01DE-35');
  });
  it('letra minúscula vira maiúscula', () => {
    expect(validarDocumento('12.abc.345/01de-35').formatado).toBe('12.ABC.345/01DE-35');
  });
  it('inválido: DV trocado, e letra no lugar do DV', () => {
    expect(validarDocumento('12.ABC.345/01DE-36').motivo).toBe(MOTIVO_CNPJ_DV);
    expect(validarDocumento('12.ABC.345/01DE-3A').motivo).toBe(MOTIVO_CNPJ_LETRA_NO_DV);
  });
});

describe('tamanho', () => {
  it('nem 11 nem 14 é recusado, com o motivo', () => {
    for (const t of ['1234567', '123456789012', '112223330001810']) {
      expect(validarDocumento(t)).toMatchObject({ valido: false, tipo: null, formatado: '', motivo: MOTIVO_TAMANHO });
    }
  });
});

describe('máscara enquanto se digita', () => {
  it('CPF até 11 dígitos, CNPJ a partir do 12º ou com letra', () => {
    expect(mascararAoDigitar('529')).toBe('529');
    expect(mascararAoDigitar('5299')).toBe('529.9');
    expect(mascararAoDigitar('529982247')).toBe('529.982.247');
    expect(mascararAoDigitar('52998224725')).toBe('529.982.247-25');
    expect(mascararAoDigitar('112223330001')).toBe('11.222.333/0001');
    expect(mascararAoDigitar('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascararAoDigitar('12abc')).toBe('12.ABC');
    expect(mascararAoDigitar('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });
  it('com a máscara já posta, ou colado com outro desenho: o mesmo resultado; corta em 14', () => {
    expect(mascararAoDigitar('529.982.247-25')).toBe('529.982.247-25');
    expect(mascararAoDigitar('11 222 333 0001 81 99')).toBe('11.222.333/0001-81');
    expect(mascararAoDigitar('')).toBe('');
  });
});

describe('o gravado no cadastro', () => {
  it('vazio, no padrão, ou fora do padrão (só dígitos, outro formato, tamanho, DV)', () => {
    expect(situacaoDoGravado(null).situacao).toBe('vazio');
    expect(situacaoDoGravado(' ').situacao).toBe('vazio');
    expect(situacaoDoGravado('11.222.333/0001-81')).toEqual({ situacao: 'ok', motivo: null });
    expect(situacaoDoGravado('11222333000181').situacao).toBe('fora_do_padrao');
    expect(situacaoDoGravado('11222333000181').motivo).toContain('11.222.333/0001-81');
    expect(situacaoDoGravado('11.222.333.0001.81').situacao).toBe('fora_do_padrao');
    expect(situacaoDoGravado('1234567')).toEqual({ situacao: 'fora_do_padrao', motivo: MOTIVO_TAMANHO });
    expect(situacaoDoGravado('11.222.333/0001-82').motivo).toBe(MOTIVO_CNPJ_DV);
  });
  it('a chave de comparação ignora pontuação e caixa', () => {
    expect(chaveDoDocumento('11.222.333/0001-81')).toBe(chaveDoDocumento('11222333000181'));
    expect(chaveDoDocumento('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });
});
