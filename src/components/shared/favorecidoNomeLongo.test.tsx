/**
 * LANC-IDENTIFICACAO-LARGURA-01 (Gabriel 27/11 17:16) — com `nomeLongoEmbaixo={45}` (só o Novo/Editar Lançamento): o nome com mais de 45 letras
 * aparece INTEIRO na linha de baixo, antes do "CNPJ · Cidade/UF"; até 45, a linha de sempre. Sem a prop, nada muda. Dados SINTÉTICOS.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FavorecidoSelect } from './FavorecidoSelect';

const LONGO = 'Cooperativa Agroindustrial dos Produtores Rurais do Vale Exemplo Ltda'; // 69 letras
const CURTO = 'Agropecuaria Exemplo Comercio de Insumos Ltd'; // 44 letras
const F = [
  { id: 'l', nome: LONGO, cpf_cnpj: '11.222.333/0001-81', municipio: 'Presidente Prudente', uf: 'SP', ativo: true },
  { id: 'c', nome: CURTO, cpf_cnpj: '11.222.333/0002-62', municipio: 'Campo Grande', uf: 'MS', ativo: true },
];
const montar = (value: string, nomeLongoEmbaixo?: number) => render(<FavorecidoSelect value={value} onChange={() => {}} fornecedores={F}
  search="" onSearchChange={() => {}} linhaDoDocumento nomeLongoEmbaixo={nomeLongoEmbaixo} />);

describe('FavorecidoSelect — o nome longo inteiro na linha de baixo', () => {
  it('mais de 45 letras: o nome inteiro na linha (o CNPJ · cidade no title)', () => {
    montar('l', 45);
    expect(screen.getByTestId('favorecido-nome-inteiro').textContent).toBe(LONGO);
    const linha = screen.getByTestId('favorecido-linha-texto');
    expect(linha.textContent).toBe(LONGO);
    expect(linha.getAttribute('title')).toContain('11.222.333/0001-81');
    expect(linha.getAttribute('title')).toContain(LONGO);
  });
  it('até 45 letras, ou sem a prop: a linha de sempre (sem o nome)', () => {
    const r = montar('c', 45);
    expect(screen.queryByTestId('favorecido-nome-inteiro')).toBeNull();
    r.unmount();
    montar('l');
    expect(screen.queryByTestId('favorecido-nome-inteiro')).toBeNull();
  });
});
