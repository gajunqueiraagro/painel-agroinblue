/**
 * FORN-SELETOR-PADRAO-01 passo 1b — as funções puras do seletor de fornecedor. Dados SINTÉTICOS.
 */
import { describe, it, expect } from 'vitest';
import {
  LIMITE_DE_OPCOES, SEM_DOCUMENTO, casaComABusca, digitosDaBusca, ehCadastroDeMeta, formatarDocumento, fraseDoLimite,
  linhaDoDocumento, mascaraDoDocumento, montarOpcoes, normalizarNome, recortarOpcoes, seloDeIguais, soDigitos,
} from '@/lib/fornecedores/fornecedorTexto';
import { documentoFormatado } from '@/lib/financeiro/nfe/formatos';

const f = (id: string, nome: string, cpf_cnpj: string | null = null) => ({ id, nome, cpf_cnpj, ativo: true });

describe('formatação do documento', () => {
  it('CNPJ e CPF ganham a máscara, venham com ou sem pontuação', () => {
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('11.222.333/0001-81')).toBe('11.222.333/0001-81');
    expect(formatarDocumento(' 12345678909 ')).toBe('123.456.789-09');
    expect(formatarDocumento('123.456.789-09')).toBe('123.456.789-09');
  });
  it('tamanho que não é 11 nem 14: aparece COMO ESTÁ, sem máscara inventada', () => {
    expect(formatarDocumento('1234567')).toBe('1234567');
    expect(formatarDocumento('12.345-6')).toBe('12.345-6');
    expect(formatarDocumento('112223330001811')).toBe('112223330001811');
    expect(mascaraDoDocumento('1234567')).toBeNull();
  });
  it('vazio, nulo e só espaço: ""', () => {
    expect(formatarDocumento(null)).toBe('');
    expect(formatarDocumento(undefined)).toBe('');
    expect(formatarDocumento('   ')).toBe('');
  });
  it('a máscara tem UM dono: o formatador da nota fiscal dá o mesmo CNPJ e o mesmo CPF', () => {
    for (const d of ['11222333000181', '12345678909']) expect(documentoFormatado(d)).toBe(formatarDocumento(d));
    expect(documentoFormatado('12.345-6')).toBe('123456');   /* lá o tamanho inválido sai em dígitos (contrato de antes) */
  });
  it('a linha sob o campo: documento, "sem CNPJ/CPF", ou vazia sem escolha', () => {
    expect(linhaDoDocumento(f('a', 'A', '11222333000181'))).toBe('11.222.333/0001-81');
    expect(linhaDoDocumento(f('a', 'A', null))).toBe(SEM_DOCUMENTO);
    expect(linhaDoDocumento(f('a', 'A', '  '))).toBe('sem CNPJ/CPF');
    expect(linhaDoDocumento(null)).toBe('');
  });
});

describe('normalização do nome', () => {
  it('acento, caixa, espaços duplos e pontas', () => {
    expect(normalizarNome('  João   da  SILVA ')).toBe('joao da silva');
    expect(normalizarNome('Agropecuária São José')).toBe(normalizarNome('AGROPECUARIA  SAO JOSE'));
    expect(normalizarNome(null)).toBe('');
  });
  it('nomes diferentes continuam diferentes (a normalização não funde o que não é igual)', () => {
    expect(normalizarNome('Agro Um')).not.toBe(normalizarNome('Agro Dois'));
    expect(normalizarNome('Agro-Um')).not.toBe(normalizarNome('Agro Um'));
  });
});

describe('busca', () => {
  const opcoes = montarOpcoes([
    f('a', 'Agropecuária São José', '11.222.333/0001-81'),
    f('b', 'Posto 21 Combustíveis', null),
    f('c', 'João da Silva', '12345678909'),
  ]);
  const acha = (q: string) => opcoes.filter((o) => casaComABusca(o, q)).map((o) => o.f.id);
  it('por nome, sem acento e sem caixa', () => {
    expect(acha('sao jose')).toEqual(['a']);
    expect(acha('JOÃO')).toEqual(['c']);
    expect(acha('  agropecuaria   sao ')).toEqual(['a']);
  });
  it('por dígitos do documento, ignorando ponto, barra e traço — do que se digita e do que está gravado', () => {
    expect(acha('11222333')).toEqual(['a']);
    expect(acha('11.222.333/0001')).toEqual(['a']);
    expect(acha('123.456.789-09')).toEqual(['c']);
    expect(acha('0001-81')).toEqual(['a']);
  });
  it('número que está no NOME também acha (a busca por dígitos soma, não substitui)', () => {
    expect(acha('21')).toEqual(['b']);
  });
  it('texto com letra não vira busca por documento', () => {
    expect(digitosDaBusca('11a')).toBeNull();
    expect(digitosDaBusca('./-')).toBeNull();
    expect(digitosDaBusca(' 11.222 ')).toBe('11222');
    expect(acha('cnpj 11222333')).toEqual([]);
  });
  it('busca vazia casa com todos; busca sem par não acha nada', () => {
    expect(acha('')).toEqual(['a', 'b', 'c']);
    expect(acha('zzz')).toEqual([]);
    expect(acha('99999')).toEqual([]);
  });
});

describe('nome repetido entre os ativos', () => {
  it('conta pelo nome NORMALIZADO; nome único não leva selo', () => {
    const o = montarOpcoes([f('a', 'Fulano Ltda'), f('b', 'FULANO  LTDA'), f('c', 'Fulâno Ltda'), f('d', 'Beltrano')]);
    expect(o.map((x) => x.iguais)).toEqual([3, 3, 3, 0]);
    expect(seloDeIguais(3)).toBe('3 iguais');
    expect(seloDeIguais(0)).toBe('');
    expect(seloDeIguais(1)).toBe('');
  });
  it('"[META]" fica fora por padrão — e fora da CONTAGEM; entra só com incluirMeta', () => {
    const lista = [f('a', 'Projeção'), f('m', '[META] Planejamento'), f('m2', 'Projeção [META]')];
    expect(ehCadastroDeMeta('[META] Planejamento')).toBe(true);
    expect(ehCadastroDeMeta('Metalúrgica Meta')).toBe(false);
    expect(montarOpcoes(lista).map((x) => x.f.id)).toEqual(['a']);
    expect(montarOpcoes(lista, true).map((x) => x.f.id)).toEqual(['a', 'm', 'm2']);
  });
  it('a opção leva o documento formatado, ou "" quando não tem (a área fica vazia)', () => {
    const o = montarOpcoes([f('a', 'A', '11222333000181'), f('b', 'B', null), f('c', 'C', '1234567')]);
    expect(o.map((x) => x.documento)).toEqual(['11.222.333/0001-81', '', '1234567']);
    expect(o.map((x) => x.digitos)).toEqual(['11222333000181', '', '1234567']);
  });
});

describe('o recorte: no máximo 100 desenhadas, a busca sobre todas, o escolhido no topo', () => {
  const muitos = Array.from({ length: 2594 }, (_v, i) => f(`id${i}`, `Fornecedor ${String(i).padStart(4, '0')}`, i === 2500 ? '11222333000181' : null));
  const opcoes = montarOpcoes(muitos);
  it('sem busca: 100 desenhadas de 2.594, e o rodapé diz', () => {
    const r = recortarOpcoes(opcoes, '', null);
    expect(LIMITE_DE_OPCOES).toBe(100);
    expect(r.visiveis).toHaveLength(100);
    expect(r.total).toBe(2594);
    expect(fraseDoLimite(r.visiveis.length, r.total)).toBe('Mostrando 100 de 2.594 — digite para refinar');
  });
  it('a busca corre sobre TODOS: acha o 2.500º, que está fora dos 100', () => {
    expect(recortarOpcoes(opcoes, 'fornecedor 2500', null).visiveis.map((o) => o.f.id)).toEqual(['id2500']);
    expect(recortarOpcoes(opcoes, '11222333', null).visiveis.map((o) => o.f.id)).toEqual(['id2500']);
  });
  it('o limite não muda o RESULTADO da busca: o total é o de todas as que casam', () => {
    const r = recortarOpcoes(opcoes, 'fornecedor 1', null);
    expect(r.total).toBe(1000);
    expect(r.visiveis).toHaveLength(100);
  });
  it('o escolhido vem no topo mesmo fora dos 100, sem repetir e sem passar do limite', () => {
    const r = recortarOpcoes(opcoes, '', 'id2400');
    expect(r.visiveis[0].f.id).toBe('id2400');
    expect(r.visiveis).toHaveLength(100);
    expect(r.visiveis.filter((o) => o.f.id === 'id2400')).toHaveLength(1);
    expect(r.visiveis[1].f.id).toBe('id0');
    /* o escolhido que JÁ estaria entre os 100 sobe para o topo e não aparece duas vezes */
    const perto = recortarOpcoes(opcoes, '', 'id5');
    expect(perto.visiveis[0].f.id).toBe('id5');
    expect(perto.visiveis.filter((o) => o.f.id === 'id5')).toHaveLength(1);
    expect(perto.visiveis).toHaveLength(100);
  });
  it('o escolhido que não casa com a busca não é empurrado para a lista', () => {
    expect(recortarOpcoes(opcoes, 'fornecedor 0001', 'id2400').visiveis.map((o) => o.f.id)).toEqual(['id1']);
  });
  it('cabe tudo: sem rodapé', () => {
    const r = recortarOpcoes(montarOpcoes(muitos.slice(0, 7)), '', null);
    expect(fraseDoLimite(r.visiveis.length, r.total)).toBeNull();
    expect(fraseDoLimite(100, 100)).toBeNull();
  });
});

describe('soDigitos', () => {
  it('tira tudo o que não é dígito; nulo vira ""', () => {
    expect(soDigitos('11.222.333/0001-81')).toBe('11222333000181');
    expect(soDigitos(null)).toBe('');
  });
});
