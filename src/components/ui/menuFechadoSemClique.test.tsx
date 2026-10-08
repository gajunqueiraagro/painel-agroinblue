/**
 * MENU-CLIQUE-FECHANDO-01 — lista ou menu FECHANDO não aceita clique.
 *
 * O jsdom não anima: sem ajuda, o conteúdo some do DOM no instante em que fecha e o teste não mede nada. Aqui a animação de
 * saída é SIMULADA (o Radix decide "ainda estou saindo" lendo `animationName` do estilo computado): o conteúdo fica no DOM com
 * `data-state="closed"`, como fica no navegador durante os 150 ms do `animate-out` — e para sempre numa aba oculta.
 * ⚠ O jsdom também NÃO aplica CSS ao clique sintético: a classe dos primitivos se prova pela FONTE; o gesto, pela segunda trava.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { conteudoFechado } from './menuPadrao';

function simularAnimacaoDeSaida() {
  const real = window.getComputedStyle.bind(window);
  return vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const estilo = real(el, pseudo);
    if (!el.hasAttribute('data-state')) return estilo;
    return new Proxy(estilo, {
      get: (alvo, chave) => (chave === 'animationName'
        ? (el.getAttribute('data-state') === 'closed' ? 'exit' : 'enter')
        : Reflect.get(alvo, chave)),
    });
  });
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  definirFornecedoresDoLeitor([{ id: 'a', nome: 'Alfa Agro' }, { id: 'b', nome: 'Beta Boi' }, { id: 'c', nome: 'Capim Ltda' }]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('seletor de fornecedor — a lista fechando não escolhe', () => {
  it('sem animação (o jsdom de sempre): fechada, a lista SAI do DOM — não há opção para clicar', () => {
    const mudar = vi.fn();
    render(<FavorecidoSelect value="" onChange={mudar} clienteId="c" />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Beta Boi'));
    expect(mudar.mock.calls).toEqual([['b']]);
    expect(screen.queryAllByTestId('favorecido-opcao')).toHaveLength(0);
  });

  it('COM a saída em curso: a lista ainda está no DOM, e clicar em outra opção NÃO muda o valor', () => {
    simularAnimacaoDeSaida();
    const mudar = vi.fn();
    render(<FavorecidoSelect value="" onChange={mudar} clienteId="c" />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Beta Boi'));
    expect(mudar.mock.calls).toEqual([['b']]);
    /* a simulação funciona: a lista fechou (estado) e CONTINUA no DOM */
    expect(screen.getByTestId('favorecido-lista').closest('[role=dialog]')?.getAttribute('data-state')).toBe('closed');
    fireEvent.click(screen.getByText('Capim Ltda'));
    expect(mudar.mock.calls).toEqual([['b']]);
  });

  it('COM a saída em curso: "— nenhum —", a ação do pé da lista e o Enter na busca também não valem', () => {
    simularAnimacaoDeSaida();
    const mudar = vi.fn(); const acao = vi.fn();
    render(<FavorecidoSelect value="" onChange={mudar} clienteId="c" limpavel acaoFinal={{ label: 'Cadastrar', onSelect: acao }} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Beta Boi'));
    fireEvent.click(screen.getByText('— nenhum —'));
    fireEvent.click(screen.getByTestId('favorecido-acao-final'));
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar por nome ou CNPJ/CPF...'), { key: 'Enter' });
    expect(mudar.mock.calls).toEqual([['b']]);
    expect(acao).not.toHaveBeenCalled();
  });

  it('reaberta, a lista volta a escolher (a trava é do estado fechado, não um bloqueio para sempre)', () => {
    simularAnimacaoDeSaida();
    const mudar = vi.fn();
    render(<FavorecidoSelect value="" onChange={mudar} clienteId="c" />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Beta Boi'));
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Capim Ltda'));
    expect(mudar.mock.calls).toEqual([['b'], ['c']]);
  });
});

describe('DropdownMenu — o menu fechando não dispara o segundo item', () => {
  function montar() {
    const um = vi.fn(); const dois = vi.fn(); const doisClique = vi.fn(); const marca = vi.fn();
    render(<DropdownMenu><DropdownMenuTrigger>abrir</DropdownMenuTrigger><DropdownMenuContent>
      <DropdownMenuItem onSelect={um}>Um</DropdownMenuItem>
      <DropdownMenuItem onSelect={dois} onClick={doisClique}>Dois</DropdownMenuItem>
      <DropdownMenuCheckboxItem checked={false} onCheckedChange={marca}>Marcar</DropdownMenuCheckboxItem>
    </DropdownMenuContent></DropdownMenu>);
    return { um, dois, doisClique, marca };
  }
  const abrir = () => fireEvent.keyDown(screen.getByText('abrir'), { key: 'Enter' });

  it('aberto, o item dispara (o teste sabe disparar): onClick e onSelect', () => {
    const { dois, doisClique } = montar();
    abrir();
    fireEvent.click(screen.getByText('Dois'));
    expect([dois.mock.calls.length, doisClique.mock.calls.length]).toEqual([1, 1]);
  });

  it('COM a saída em curso: o menu ainda está no DOM, e o segundo item (onSelect, onClick e a caixa) NÃO dispara', () => {
    simularAnimacaoDeSaida();
    const { um, dois, doisClique, marca } = montar();
    abrir();
    fireEvent.click(screen.getByText('Um'));
    expect(um).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Dois').closest('[role=menu]')?.getAttribute('data-state')).toBe('closed');
    fireEvent.click(screen.getByText('Dois'));
    fireEvent.click(screen.getByText('Marcar'));
    fireEvent.click(screen.getByText('Um'));
    expect([um.mock.calls.length, dois.mock.calls.length, doisClique.mock.calls.length, marca.mock.calls.length]).toEqual([1, 0, 0, 0]);
  });
});

describe('`conteudoFechado` — quem responde "este conteúdo já fechou?"', () => {
  it('fechado só quando o conteúdo (menu ou lista) diz closed; aberto, fora de conteúdo ou nulo: não', () => {
    document.body.innerHTML = '<div role="menu" data-state="closed"><b id="x"></b></div><div role="dialog" data-state="open"><b id="y"></b></div><div role="dialog" data-state="closed"><b id="w"></b></div><b id="z"></b>';
    const el = (id: string) => document.getElementById(id);
    expect([conteudoFechado(el('x')), conteudoFechado(el('y')), conteudoFechado(el('w')), conteudoFechado(el('z')), conteudoFechado(null)]).toEqual([true, false, true, false, false]);
    document.body.innerHTML = '';
  });
});

describe('fonte — os primitivos de lista e de menu trazem a regra do estado fechado', () => {
  const REGRA = 'data-[state=closed]:!pointer-events-none';
  const ler = (c: string) => readFileSync(resolve(process.cwd(), c), 'utf8');
  /** as linhas de classe de CONTEÚDO de um primitivo: as que animam a entrada (`data-[state=open]:animate-in`) */
  const conteudos = (fonte: string) => fonte.split('\n').filter((l) => l.includes('data-[state=open]:animate-in'));
  const semARegra = (fonte: string) => conteudos(fonte).filter((l) => !l.includes(REGRA));

  it('AUTO-TESTE: o detector acha o conteúdo sem a regra, e não aceita a regra montada em pedaços nem sem o "!"', () => {
    expect(semARegra('"z-50 data-[state=open]:animate-in data-[state=closed]:animate-out"')).toHaveLength(1);
    expect(semARegra('"z-50 data-[state=closed]:pointer-events-none data-[state=open]:animate-in"')).toHaveLength(1);
    expect(semARegra('"z-50 " + FECHADO + " data-[state=open]:animate-in"')).toHaveLength(1);
    expect(semARegra('"z-50 data-[state=closed]:!pointer-events-none data-[state=open]:animate-in"')).toHaveLength(0);
  });

  it.each([
    ['src/components/ui/popover.tsx', 1],
    ['src/components/ui/dropdown-menu.tsx', 2],
    ['src/components/ui/context-menu.tsx', 2],
    ['src/components/ui/menubar.tsx', 2],
    ['src/components/ui/hover-card.tsx', 1],
  ])('%s: %i conteúdo(s), todos com a regra escrita por extenso', (arquivo, quantos) => {
    const fonte = ler(arquivo);
    expect(conteudos(fonte)).toHaveLength(quantos);
    expect(semARegra(fonte)).toEqual([]);
  });

  it('o seletor de fornecedor recusa os três gestos da lista com ela fechada, e os itens do DropdownMenu passam pela trava', () => {
    const dono = ler('src/components/shared/FavorecidoSelect.tsx');
    expect(dono.match(/if \(!open\) return;/g)).toHaveLength(3);
    const menu = ler('src/components/ui/dropdown-menu.tsx');
    expect(menu.match(/onClick=\{recusarSeFechado\(onClick\)\}/g)).toHaveLength(3);
  });
});
