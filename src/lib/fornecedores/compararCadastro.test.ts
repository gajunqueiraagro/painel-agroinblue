/** NOTA-FORNECEDOR-COMPARAR-01 — a comparacao campo a campo (PURA). Dados SINTETICOS. */
import { describe, it, expect } from 'vitest';
import { cadastroPareceErrado, camposMarcados, linhasDaComparacao } from './compararCadastro';

describe('linhasDaComparacao', () => {
  const hoje = { nome: 'Pec.3M-Esc. Garças', cpf_cnpj: null, municipio: 'Campo Grande', uf: 'MS', cep: '79.000-000', logradouro: 'Rua A' };
  const nota = { nome: 'ESCRITORIO GARCAS LTDA', cpf_cnpj: '11.222.333/0001-81', municipio: 'CAMPO GRANDE', uf: 'MS', cep: '79000000', logradouro: 'Rua B', inscricao_estadual: null };
  const l = linhasDaComparacao(hoje, nota);
  const de = (c: string) => l.find((x) => x.grupo.chave === c);
  it('vazio vem marcado; diferente desmarcado; igual (sem acento, caixa ou mascara) e\' igual', () => {
    expect([de('cnpj')?.estado, de('cnpj')?.marcadoPadrao]).toEqual(['vazio', true]);
    expect([de('razao')?.estado, de('razao')?.marcadoPadrao]).toEqual(['diferente', false]);
    expect(de('cidade')?.estado).toBe('igual');
    expect(de('cep')?.estado).toBe('igual');
    expect(de('endereco')?.estado).toBe('diferente');
  });
  it('o que a nota nao traz nao vira linha (o vazio da nota nao apaga nada)', () => {
    expect(de('ie')).toBeUndefined();
    expect(de('fantasia')).toBeUndefined();
  });
  it('camposMarcados: so\' as colunas dos grupos marcados, so\' com valor', () => {
    expect(camposMarcados(nota, new Set(['cnpj', 'cidade']))).toEqual({ cpf_cnpj: '11.222.333/0001-81', municipio: 'CAMPO GRANDE', uf: 'MS' });
    expect(camposMarcados(nota, new Set())).toEqual({});
  });
});

describe('cadastroPareceErrado', () => {
  it('outro CNPJ no cadastro', () => {
    expect(cadastroPareceErrado({ cpf_cnpj: '11.444.777/0001-61', nome: 'Agro X' }, { documento: '11222333000181', nomes: ['Agro X'] })).toContain('outro CNPJ');
  });
  it('nome sem palavra em comum', () => {
    expect(cadastroPareceErrado({ nome: 'Posto Exemplo' }, { documento: '11222333000181', nomes: ['Lineagro Produtos'] })).toContain('não parece');
  });
  it('mesmo CNPJ, ou uma palavra em comum: parece o certo', () => {
    expect(cadastroPareceErrado({ cpf_cnpj: '11.222.333/0001-81', nome: 'Qualquer' }, { documento: '11222333000181', nomes: ['Outro'] })).toBeNull();
    expect(cadastroPareceErrado({ nome: 'Lineagro SA' }, { documento: '1', nomes: ['Nova Lineagro Produtos Ltda'] })).toBeNull();
  });
});
