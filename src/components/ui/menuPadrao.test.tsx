/**
 * UI-DROPDOWN-PADRAO-01 — um padrão só para todo menu aberto: o painel OPACO (`MENU_PALETA`) e o item de 22px / 10px
 * (`MENU_ITEM`), num dono só (`menuPadrao.ts`), aplicados pelos quatro componentes de menu e pelos campos com busca.
 *
 * ⚠ O jsdom NÃO PINTA: aqui se prova o CONTRATO das classes (o item de cada componente leva text-[10px] e min-h-[22px]; o
 *   painel leva bg-zinc-800 sem alpha e sem backdrop-blur). A cor e a altura renderizadas vão no relatório, medidas com
 *   `getComputedStyle` sobre fundo branco e sobre o navy.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { MENU_PALETA, MENU_ITEM, MENU_ROTULO } from '@/components/ui/menuPadrao';
import { COMBOBOX_PALETA } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Command, CommandList, CommandItem, CommandGroup } from '@/components/ui/command';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';

beforeEach(() => {
  /* o cmdk mede a lista com ResizeObserver, que o jsdom não tem */
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);
/** O item tem a medida do padrão e NÃO tem a de antes. */
function temMedidaDoPadrao(el: Element | null) {
  const c = classes(el);
  expect(c).toContain('text-[10px]');
  expect(c).toContain('min-h-[22px]');
  expect(c).not.toContain('text-[12px]');
  expect(c).not.toContain('min-h-[26px]');
}
/** O painel é a paleta opaca. */
function temPaletaOpaca(el: Element | null) {
  const cls = el?.getAttribute('class') ?? '';
  expect(classes(el)).toContain('bg-zinc-800');
  expect(cls).not.toMatch(/backdrop-blur/);
  expect(cls).not.toMatch(/bg-zinc-950\//);
}

describe('as constantes — um dono só', () => {
  it('a paleta é opaca, o item é 22px / 10px, o rótulo é 10px', () => {
    expect(MENU_PALETA).toBe('border-zinc-700/40 bg-zinc-800 text-zinc-100');
    /* o FUNDO não tem alpha (a borda tem, de propósito) e não há desfoque */
    expect(MENU_PALETA).not.toMatch(/\bbg-\S+\/\d|backdrop/);
    expect(MENU_ITEM).toBe('min-h-[22px] px-2 py-1 text-[10px] leading-[14px]');
    expect(MENU_ROTULO).toBe('text-[10px] font-medium text-zinc-400');
    /* o nome antigo continua, valendo o dono novo — os importadores não quebram */
    expect(COMBOBOX_PALETA).toBe(MENU_PALETA);
  });
});

describe('os quatro componentes aplicam o padrão', () => {
  it('Select: o painel opaco, o item 22/10 (com o recuo do check) e o rótulo', () => {
    render(
      <Select open value="a">
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent data-testid="painel-select">
          <SelectGroup>
            <SelectLabel>Grupo</SelectLabel>
            <SelectItem value="a">Alfa</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );
    temPaletaOpaca(screen.getByTestId('painel-select'));
    const item = screen.getByRole('option', { name: 'Alfa' });
    temMedidaDoPadrao(item);
    expect(classes(item)).toContain('pl-8');
    expect(classes(screen.getByText('Grupo'))).toContain('text-zinc-400');
  });

  it('DropdownMenu: o painel opaco, o item e o item de checkbox 22/10, o rótulo', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>abrir</DropdownMenuTrigger>
        <DropdownMenuContent data-testid="painel-dropdown">
          <DropdownMenuLabel>Ações</DropdownMenuLabel>
          <DropdownMenuItem>Abrir OC</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>Marcado</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    temPaletaOpaca(screen.getByTestId('painel-dropdown'));
    temMedidaDoPadrao(screen.getByRole('menuitem', { name: 'Abrir OC' }));
    temMedidaDoPadrao(screen.getByRole('menuitemcheckbox', { name: 'Marcado' }));
    expect(classes(screen.getByText('Ações'))).toContain('text-zinc-400');
  });

  it('Command: a caixa opaca e o item 22/10', () => {
    render(
      <Command data-testid="painel-command">
        <CommandList><CommandGroup><CommandItem>Fornecedor X</CommandItem></CommandGroup></CommandList>
      </Command>,
    );
    temPaletaOpaca(screen.getByTestId('painel-command'));
    temMedidaDoPadrao(screen.getByRole('option', { name: 'Fornecedor X' }));
  });

  it('SearchableSelect: o painel opaco (pela constante do command.tsx) e o item 22/10', async () => {
    render(<SearchableSelect value="__all__" onValueChange={() => {}} placeholder="Buscar..."
      options={[{ value: 'a', label: 'Amanda Montes Camargo' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Todos|Buscar|Selecione/ }));
    const painel = await screen.findByTestId('searchable-select-painel');
    temPaletaOpaca(painel);
    temMedidaDoPadrao(screen.getByTitle('Amanda Montes Camargo').closest('button'));
  });
});

describe('campos com busca — o item no padrão e o texto do gatilho à esquerda', () => {
  const FORN = [{ id: 'f1', nome: 'Luis Paulo Carvalho da Silva — fornecedor de nome bem longo', ativo: true }];

  it('FavorecidoSelect: o gatilho tem o span min-w-0 flex-1 truncate text-left; o item é 22/10', () => {
    render(<FavorecidoSelect value="f1" onChange={() => {}} fornecedores={FORN} search="" onSearchChange={() => {}} />);
    const gatilho = screen.getByRole('combobox');
    const span = gatilho.querySelector('span');
    for (const c of ['min-w-0', 'flex-1', 'truncate', 'text-left']) expect(classes(span)).toContain(c);
    fireEvent.click(gatilho);
    temMedidaDoPadrao(screen.getByTitle(FORN[0].nome).closest('button'));
  });

  it('PlanoSubcentroSelect e FornecedorSelect: o mesmo span no gatilho (inspeção do fonte)', () => {
    const plano = readFileSync(resolve(__dirname, '../shared/PlanoSubcentroSelect.tsx'), 'utf8');
    expect(plano).toMatch(/<span className="min-w-0 flex-1 truncate text-left" title=\{value \|\| undefined\}>/);
    const forn = readFileSync(resolve(__dirname, '../shared/FornecedorSelect.tsx'), 'utf8');
    expect(forn).toMatch(/<span className="min-w-0 flex-1 truncate text-left">\s*\{fornecedorSelecionado\?\.nome \?\? placeholder\}/);
    /* e o item do subcentro vem da medida do padrão, não de uma régua escrita no componente */
    expect(plano).toContain('MENU_ITEM,');
  });
});
