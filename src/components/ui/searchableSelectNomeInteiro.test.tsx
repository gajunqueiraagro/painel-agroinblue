/**
 * P102 — o nome escolhido INTEIRO no gatilho, rolando no lugar (fora de tabela, nada de "…": a regra da casa). Achado pelo gate de tela do
 * Editar obrigação (o nome da conta cortava com "…"). Opção nova, OPT-IN: sem ela o gatilho segue com `truncate` (as outras telas).
 *   S1 com `nomeInteiro`: `uma-linha-que-rola`, sem `truncate` · S2 sem a prop: `truncate` · S3 a conta do Editar obrigação liga a opção
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SearchableSelect } from './searchable-select';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';

const NOME = 'Banco Exemplo Cooperativo de Crédito Rural · Agência Centro';
const rotulo = (c: HTMLElement) => c.querySelector('button span');

describe('P102 — SearchableSelect com o nome inteiro', () => {
  it('S1 com `nomeInteiro` o texto rola no lugar; S2 sem ela, como sempre', () => {
    const com = render(<SearchableSelect value="c1" onValueChange={() => {}} options={[{ value: 'c1', label: NOME }]} nomeInteiro />);
    expect(rotulo(com.container)?.className).toContain('uma-linha-que-rola');
    expect(rotulo(com.container)?.className).not.toContain('truncate');
    expect(rotulo(com.container)?.textContent).toBe(NOME);
    com.unmount();
    const sem = render(<SearchableSelect value="c1" onValueChange={() => {}} options={[{ value: 'c1', label: NOME }]} />);
    expect(rotulo(sem.container)?.className).toContain('truncate');
  });
  it('S1 o ContaBancariaSelect repassa a opção', () => {
    const { container } = render(<ContaBancariaSelect value="c1" onValueChange={() => {}} placeholder="Selecione" nomeInteiro
      contas={[{ id: 'c1', nome_conta: NOME, nome_exibicao: null, tipo_conta: 'cc' }]} />);
    expect(rotulo(container)?.className).toContain('uma-linha-que-rola');
  });
  it('S3 a conta do Editar obrigação liga a opção', () => {
    const tela = readFileSync(resolve(__dirname, '../financiamentos/ObrigacaoDialog.tsx'), 'utf8');
    expect(tela).toMatch(/showBankDetails="banco"\s+className=\{CAMPO\}\s+comBusca\s+nomeInteiro\s+\/>/);
  });
});
