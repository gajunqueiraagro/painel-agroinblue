/** NOTA-FORNECEDOR-COMPARAR-01 — a comparacao campo a campo (PURA). Dados SINTETICOS. */
import { describe, it, expect } from 'vitest';
import { cadastroPareceErrado, camposMarcados, linhasDaComparacao } from './compararCadastro';

describe('linhasDaComparacao', () => {
  const hoje = { nome: 'Pec.3M-Esc. Garças', cpf_cnpj: null, municipio: 'Campo Grande', uf: 'MS', cep: '79.000-000', logradouro: 'Rua A' };
  const nota = { nome: 'ESCRITORIO GARCAS LTDA', cpf_cnpj: '11.222.333/0001-81', municipio: 'CAMPO GRANDE', uf: 'MS', cep: '79000000', logradouro: 'Rua B', inscricao_estadual: null };
  const l = linhasDaComparacao(hoje, nota);
  const de = (c: string) => l.find((x) => x.grupo.chave === c);
  it('vazio vem marcado; diferente desmarcado; igual (sem acento, caixa ou mascara) e\' igual — no cadastro que E\' o da nota', () => {
    const mesmo = linhasDaComparacao({ ...hoje, nome: 'Escritório Garças' }, nota);
    const dm = (c: string) => mesmo.find((x) => x.grupo.chave === c);
    expect([dm('cnpj')?.estado, dm('cnpj')?.marcadoPadrao]).toEqual(['vazio', true]);
    expect([dm('razao')?.estado, dm('razao')?.marcadoPadrao]).toEqual(['diferente', false]);   // "Ltda" a mais: o texto difere, a empresa é a mesma
    expect(de('cidade')?.estado).toBe('igual');
    expect(de('cep')?.estado).toBe('igual');
    expect(de('endereco')?.estado).toBe('diferente');
  });
  it('FORN-ACHAR-CNPJ-01 — razão social diferente e sem CNPJ no cadastro: CNPJ, IE e razão NUNCA se oferecem; o resto vem desmarcado', () => {
    expect([de('cnpj'), de('razao'), de('ie')]).toEqual([undefined, undefined, undefined]);
    expect(l.every((x) => !x.marcadoPadrao)).toBe(true);
    /* o caso COAMO (Gabriel 19/11): o posto da mesma cidade não recebe nada que identifique a COAMO */
    const posto = linhasDaComparacao({ nome: 'Auto Posto Rota da Se Sidrolandia', cpf_cnpj: null, municipio: 'Sidrolândia', uf: 'MS' },
      { nome: 'COAMO AGROINDUSTRIAL COOPERATIVA', nome_fantasia: 'SIDROLANDIA', cpf_cnpj: '75.904.383/0218-03', inscricao_estadual: '283000000', municipio: 'SIDROLANDIA', uf: 'MS', logradouro: 'Rod. BR 060' });
    expect(posto.map((x) => x.grupo.chave).filter((c) => ['razao', 'cnpj', 'ie'].includes(c))).toEqual([]);
    expect(posto.filter((x) => x.marcadoPadrao)).toEqual([]);
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
    expect(cadastroPareceErrado({ nome: 'Posto Exemplo' }, { documento: '11222333000181', nomes: ['Lineagro Produtos'] })).toContain('Parece outro fornecedor');
  });
  it('mesmo CNPJ, ou a MESMA razão social: parece o certo', () => {
    expect(cadastroPareceErrado({ cpf_cnpj: '11.222.333/0001-81', nome: 'Qualquer' }, { documento: '11222333000181', nomes: ['Outro'] })).toBeNull();
    expect(cadastroPareceErrado({ nome: 'Nova Lineagro Produtos' }, { documento: '1', nomes: ['NOVA LINEAGRO PRODUTOS LTDA'] })).toBeNull();
  });
  it('FORN-ACHAR-CNPJ-01 — UMA palavra em comum (a cidade) NÃO basta: "parece outro fornecedor"', () => {
    expect(cadastroPareceErrado({ nome: 'Lineagro SA' }, { documento: '1', nomes: ['Nova Lineagro Produtos Ltda'] })).toContain('Parece outro fornecedor');
    expect(cadastroPareceErrado({ nome: 'Auto Posto Rota da Se Sidrolandia' }, { documento: '75904383021803', nomes: ['COAMO AGROINDUSTRIAL COOPERATIVA', 'SIDROLANDIA'] }))
      .toContain('Parece outro fornecedor');
  });
});
