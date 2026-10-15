/**
 * FORN-EDITAR-01 — a conferência de repetido do cadastro completo: CPF/CNPJ (sempre) e nome (na edição), no MESMO cliente,
 * ativos e inativos, fora o próprio registro. Fornecedores SINTÉTICOS.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { acharRepetidos, fraseDosRepetidos, temRepetido, type FornecedorParaConferir } from './repetidosDoCadastro';

const f = (id: string, nome: string, cpf_cnpj: string | null, ativo = true): FornecedorParaConferir => ({ id, nome, cpf_cnpj, ativo });
const CADASTRO = [
  f('a', 'Agro Alfa', '11.222.333/0001-81'),
  f('b', 'Beta Insumos', '11222333000181', false),
  f('c', 'Gama Ltda', '529.982.247-25'),
  f('d', 'Delta Alfanumerica', '12.ABC.345/01DE-35'),
  f('e', 'Agro  Álfa', null, false),
];

describe('documento repetido', () => {
  it('sem duplicado: nada', () => {
    const r = acharRepetidos({ nome: 'Novo', cpfCnpj: '123.456.789-09', conferirNome: false }, CADASTRO);
    expect(temRepetido(r)).toBe(false);
  });
  it('com duplicado: acha pela chave (máscara diferente) e inclui o inativo', () => {
    const r = acharRepetidos({ nome: 'Novo', cpfCnpj: '11.222.333/0001-81', conferirNome: false }, CADASTRO);
    expect(r.porDocumento.map((x) => x.id)).toEqual(['a', 'b']);
    expect(fraseDosRepetidos(r)).toBe('Este CPF/CNPJ já está em: Agro Alfa (ativo), Beta Insumos (inativo).');
  });
  it('na edição o próprio registro não conta', () => {
    const r = acharRepetidos({ proprioId: 'a', nome: 'Agro Alfa', cpfCnpj: '11222333000181', conferirNome: true }, CADASTRO);
    expect(r.porDocumento.map((x) => x.id)).toEqual(['b']);
    const so = acharRepetidos({ proprioId: 'c', nome: 'Gama Ltda', cpfCnpj: '529.982.247-25', conferirNome: true }, CADASTRO);
    expect(temRepetido(so)).toBe(false);
  });
  it('alfanumérico compara letras também', () => {
    expect(acharRepetidos({ nome: 'X', cpfCnpj: '12abc34501de35', conferirNome: false }, CADASTRO).porDocumento.map((x) => x.id)).toEqual(['d']);
  });
  it('documento vazio não repete nada', () => {
    expect(acharRepetidos({ nome: 'X', cpfCnpj: null, conferirNome: false }, CADASTRO).porDocumento).toEqual([]);
  });
});

describe('nome repetido (na edição)', () => {
  it('pelo nome normalizado (acento, caixa, espaço), inativo incluído, fora o próprio', () => {
    const r = acharRepetidos({ proprioId: 'a', nome: 'AGRO ALFA', cpfCnpj: null, conferirNome: true }, CADASTRO);
    expect(r.porNome.map((x) => x.id)).toEqual(['e']);
    expect(fraseDosRepetidos(r)).toBe('Já existe fornecedor com este nome: Agro  Álfa (inativo).');
  });
  it('sem `conferirNome` (a criação), o nome não é conferido aqui', () => {
    expect(acharRepetidos({ nome: 'Agro Alfa', cpfCnpj: null, conferirNome: false }, CADASTRO).porNome).toEqual([]);
  });
});
