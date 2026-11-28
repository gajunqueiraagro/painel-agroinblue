/** NOTA-FORNECEDOR-COMPARAR-01 — a comparacao campo a campo (PURA). Dados SINTETICOS. */
import { describe, it, expect } from 'vitest';
import { cadastroPareceErrado, camposMarcados, dadosNovosDaNota, linhasDaComparacao, situacaoDoCadastro } from './compararCadastro';

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
  it('FORN-ACHAR-CNPJ-01 + FORN-NOTA-ATUALIZAR-01 — razão social diferente, sem CNPJ e OUTRO endereço: CNPJ e razão APARECEM, nada vem marcado', () => {
    expect([de('cnpj')?.estado, de('razao')?.estado]).toEqual(['vazio', 'diferente']);
    expect(l.every((x) => !x.marcadoPadrao)).toBe(true);
    /* o caso COAMO (Gabriel 19/11): o posto da mesma cidade — a fantasia da nota é a cidade — não recebe nada MARCADO que identifique a COAMO */
    const posto = linhasDaComparacao({ nome: 'Auto Posto Rota da Se Sidrolandia', cpf_cnpj: null, municipio: 'Sidrolândia', uf: 'MS' },
      { nome: 'COAMO AGROINDUSTRIAL COOPERATIVA', nome_fantasia: 'SIDROLANDIA', cpf_cnpj: '75.904.383/0218-03', inscricao_estadual: '283000000', municipio: 'SIDROLANDIA', uf: 'MS', logradouro: 'Rod. BR 060' });
    expect(posto.map((x) => x.grupo.chave).filter((c) => ['razao', 'cnpj', 'ie'].includes(c))).toEqual(['razao', 'cnpj', 'ie']);
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

/* FORN-NOTA-ATUALIZAR-01 (Gabriel 28/11 07:00) — o cadastro achado pelo nome, SEM CNPJ, com a fantasia, o endereço, o CEP e a cidade iguais aos
   da nota e a razão social escrita com um "e" a mais: era "Atualizar 0 campos" com o CNPJ escondido. Dados SINTÉTICOS. */
describe('FORN-NOTA-ATUALIZAR-01 — provável o mesmo · completar o CNPJ', () => {
  const nota = { nome: 'SILVA SOUZA LTDA - ME', nome_fantasia: 'MATERIAIS EXEMPLO', cpf_cnpj: '11.222.333/0001-81', inscricao_estadual: '283000001',
    logradouro: 'Av. Exemplo', numero: '100', bairro: 'Centro', cep: '79780-000', municipio: 'Cidade Exemplo', uf: 'MS' };
  const cadastro = { nome: 'Silva e Souza Ltda', nome_fantasia: 'Materiais Exemplo', cpf_cnpj: null, inscricao_estadual: null,
    logradouro: 'AV. EXEMPLO', numero: '100', bairro: 'CENTRO', cep: '79780000', municipio: 'CIDADE EXEMPLO', uf: 'MS' };
  const de = (ls: ReturnType<typeof linhasDaComparacao>, c: string) => ls.find((x) => x.grupo.chave === c);
  it('mesma cidade e mesmo endereço, sem CNPJ no cadastro: "provavel"; o CNPJ e a IE vêm marcados; a razão diferente, desmarcada', () => {
    expect(situacaoDoCadastro(cadastro, nota)).toBe('provavel');
    const ls = linhasDaComparacao(cadastro, nota);
    expect(ls.map((x) => x.grupo.chave)).toEqual(['razao', 'fantasia', 'cnpj', 'ie', 'endereco', 'cep', 'cidade']);
    expect([de(ls, 'cnpj')?.estado, de(ls, 'cnpj')?.marcadoPadrao]).toEqual(['vazio', true]);
    expect([de(ls, 'ie')?.estado, de(ls, 'ie')?.marcadoPadrao]).toEqual(['vazio', true]);
    expect([de(ls, 'razao')?.estado, de(ls, 'razao')?.marcadoPadrao, de(ls, 'razao')?.hoje, de(ls, 'razao')?.proposto])
      .toEqual(['diferente', false, 'Silva e Souza Ltda', 'SILVA SOUZA LTDA - ME']);
    expect(['fantasia', 'endereco', 'cep', 'cidade'].map((c) => de(ls, c)?.estado)).toEqual(['igual', 'igual', 'igual', 'igual']);
    expect(dadosNovosDaNota(cadastro, nota)).toBe(3);
    expect(camposMarcados(nota, new Set(ls.filter((x) => x.marcadoPadrao).map((x) => x.grupo.chave)))).toEqual({ cpf_cnpj: '11.222.333/0001-81', inscricao_estadual: '283000001' });
  });
  it('a mesma fantasia + o mesmo CEP + a mesma cidade também é "provavel" (endereço escrito de outro jeito)', () => {
    expect(situacaoDoCadastro({ ...cadastro, logradouro: 'Avenida Ex.', numero: null }, nota)).toBe('provavel');
  });
  it('a fantasia sozinha NÃO basta (COAMO × Auto Posto): sem o endereço nem o CEP iguais é "outro"', () => {
    expect(situacaoDoCadastro({ ...cadastro, logradouro: 'Rua Outra', cep: null }, nota)).toBe('outro');
    expect(situacaoDoCadastro({ ...cadastro, municipio: 'Outra Cidade' }, nota)).toBe('outro');
  });
  it('cadastro COM outro CNPJ nunca é "provavel" (o documento manda); o mesmo CNPJ é "mesmo"', () => {
    expect(situacaoDoCadastro({ ...cadastro, cpf_cnpj: '11.444.777/0001-61' }, nota)).toBe('outro');
    expect(situacaoDoCadastro({ ...cadastro, cpf_cnpj: '11222333000181' }, nota)).toBe('mesmo');
    expect(linhasDaComparacao({ ...cadastro, cpf_cnpj: '11.444.777/0001-61' }, nota).filter((x) => x.marcadoPadrao)).toEqual([]);
  });
  it('a nota sem CNPJ: nunca "provavel" (não há o que completar)', () => {
    expect(situacaoDoCadastro(cadastro, { ...nota, cpf_cnpj: null })).toBe('outro');
  });
});
