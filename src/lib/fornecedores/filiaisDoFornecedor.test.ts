/**
 * FIN-FILTRO-FILIAIS-01 — o conjunto do filtro "+ filiais (N)": mesma raiz de 8 dígitos, mesmo cliente (a lista é do cliente), inativos
 * entram, mesclado nunca, CPF/sem CNPJ = só ele. Dados sintéticos.
 */
import { describe, it, expect } from 'vitest';
import { filiaisDoFornecedor } from './filiaisDoFornecedor';

const cad = [
  { id: 'matriz', cpf_cnpj: '11.222.333/0001-81' },
  { id: 'filial-a', cpf_cnpj: '11222333000262' },
  { id: 'filial-inativa', cpf_cnpj: '11.222.333/0003-43', ativo: false },
  { id: 'filial-mesclada', cpf_cnpj: '11.222.333/0004-24', fundido_em_id: 'matriz' },
  { id: 'outra-raiz', cpf_cnpj: '99.888.777/0001-00' },
  { id: 'pessoa', cpf_cnpj: '123.456.789-09' },
  { id: 'sem-doc', cpf_cnpj: null },
];

describe('filiaisDoFornecedor', () => {
  it('o escolhido primeiro e as filiais da mesma raiz; inativa entra, mesclada e outra raiz não', () => {
    expect(filiaisDoFornecedor(cad, 'filial-a')).toEqual(['filial-a', 'matriz', 'filial-inativa']);
  });
  it('CPF, sem documento ou fora da lista: só ele', () => {
    expect(filiaisDoFornecedor(cad, 'pessoa')).toEqual(['pessoa']);
    expect(filiaisDoFornecedor(cad, 'sem-doc')).toEqual(['sem-doc']);
    expect(filiaisDoFornecedor(cad, 'nao-carregado')).toEqual(['nao-carregado']);
  });
  it('raiz sem outra filial: só ele', () => {
    expect(filiaisDoFornecedor(cad, 'outra-raiz')).toEqual(['outra-raiz']);
  });
});
