/**
 * P94 — SELETOR COM VALOR FORA DAS OPÇÕES NUNCA DIZ "Todos"/"Todas" (critério 4 do FIN-V2-FILTRO-FANTASMA-01). Cadastros SINTÉTICOS.
 *   V1 cada seletor da barra (SearchableSelect, ContaBancariaSelect, FavorecidoSelect, Select do Radix) com `valorInexistente`: a frase
 *      vermelha, nunca o rótulo do vazio nem o id cru; o ✕ volta ao padrão · V2 sem a prop, nada muda (as outras telas)
 *   V3 a barra da lista (larga e compacta) liga TODO seletor de cadastro à conferência (lida da fonte)
 *   V4 o inativo escolhido tem o selo no gatilho com `marcarInativo`, mesmo em `situacao="todos"`
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FRASE_VALOR_INEXISTENTE, ValorInexistente } from './ValorInexistente';

vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

const DE_OUTRO_CLIENTE = 'ffffffff-0000-0000-0000-000000000001';
const naoDizTodos = (t: string | null) => { expect(t).toContain(FRASE_VALOR_INEXISTENTE); expect(t).not.toMatch(/Todos|Todas/); expect(t).not.toContain(DE_OUTRO_CLIENTE); };

beforeEach(() => { Element.prototype.scrollIntoView = () => {}; Element.prototype.hasPointerCapture = () => false; });

describe('P94 — o valor inexistente nos seletores', () => {
  it('V1 SearchableSelect (Fazenda, plano): a frase em vermelho; o ✕ limpa para o padrão', () => {
    const onValueChange = vi.fn();
    const { container } = render(<SearchableSelect value={DE_OUTRO_CLIENTE} onValueChange={onValueChange} options={[{ value: 'faz-a', label: 'Faz. Sintetica' }]}
      allValue="__all__" allLabel="Todas" valorInexistente />);
    naoDizTodos(container.textContent);
    expect(container.querySelector('button')?.className).toContain('!border-destructive');
    fireEvent.click(container.querySelector('button span.p-0\\.5') as HTMLElement);
    expect(onValueChange).toHaveBeenCalledWith('__all__');
  });
  it('V1 ContaBancariaSelect (Conta Origem/Destino)', () => {
    const { container } = render(<ContaBancariaSelect value={DE_OUTRO_CLIENTE} onValueChange={() => {}} placeholder="Todas"
      contas={[{ id: 'elo', nome_conta: 'Cartão Sintetico', nome_exibicao: null, tipo_conta: 'cartao' }]} prependItems={[{ value: '__all__', label: 'Todas' }]} valorInexistente />);
    naoDizTodos(container.textContent);
  });
  it('V1 FavorecidoSelect (Fornecedor): a frase, nunca o "Todos" do vazio; o ✕ esvazia sem abrir a lista', () => {
    const onChange = vi.fn();
    const { container } = render(<FavorecidoSelect value={DE_OUTRO_CLIENTE} onChange={onChange} fornecedores={[{ id: 'f1', nome: 'Agro Sintetica' }]}
      situacao="todos" nomeInteiro limpavel rotuloDoVazio="Todos" placeholder="Todos" size="compact" valorInexistente />);
    naoDizTodos(container.textContent);
    fireEvent.click(screen.getByTestId('valor-inexistente'));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.queryByTestId('favorecido-lista')).toBeNull();
  });
  it('V1 Select do Radix (Safra, Atividade, Cultura): a frase no lugar do branco', () => {
    const onLimpar = vi.fn();
    const { container } = render(
      <Select value={DE_OUTRO_CLIENTE} onValueChange={() => {}}>
        <SelectTrigger><SelectValue><ValorInexistente onLimpar={onLimpar} /></SelectValue></SelectTrigger>
        <SelectContent><SelectItem value="__all__">Todas</SelectItem></SelectContent>
      </Select>);
    naoDizTodos(container.textContent);
    fireEvent.click(screen.getByTestId('valor-inexistente'));
    expect(onLimpar).toHaveBeenCalled();
  });
  it('V2 sem a prop, nada muda: o Fornecedor desconhecido segue no rótulo de antes (as outras telas)', () => {
    const { container } = render(<FavorecidoSelect value={DE_OUTRO_CLIENTE} onChange={() => {}} fornecedores={[]} placeholder="Todos" size="compact" />);
    expect(container.textContent).not.toContain(FRASE_VALOR_INEXISTENTE);
  });
  it('V4 o inativo escolhido tem o selo, com `marcarInativo`, mesmo em "todos"', () => {
    render(<FavorecidoSelect value="in0" onChange={() => {}} fornecedores={[{ id: 'in0', nome: 'Loja Parada Sintetica', ativo: false }]}
      situacao="todos" nomeInteiro size="compact" marcarInativo />);
    expect(screen.getByTestId('favorecido-inativo').textContent).toBe('inativo');
  });
});

describe('V3 — a barra da lista liga todo seletor de cadastro (fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
  it.each([
    ['fazendaId', 2], ['contaOrigem', 2], ['contaDestino', 2], ['macroFiltro', 2], ['grupoFiltro', 2], ['centroFiltro', 2],
    ['subcentroFiltro', 2], ['fornecedorFiltro', 2], ['safraFiltro', 2], ['atividadeFiltro', 2], ['culturaFiltro', 1],
  ])('%s: o seletor da barra (larga e compacta) recebe a marca', (campo, n) => {
    const marcas = (tela.match(new RegExp(`valorInexistente=\\{inexistente\\('${campo}'\\)\\}|<ValorInexistente onLimpar=\\{\\(\\) => set\\w+\\('__all__'\\)\\} />`, 'g')) ?? [])
      .filter((m) => m.includes(`'${campo}'`));
    const radix = (tela.match(new RegExp(`inexistente\\('${campo}'\\) \\? <ValorInexistente`, 'g')) ?? []).length;
    expect(marcas.length + radix).toBe(n);
  });
});
