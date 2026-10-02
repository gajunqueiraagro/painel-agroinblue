/**
 * PR-FIN-FILTRO-DROPDOWN-LARGURA-01 — o painel do SearchableSelect abre em PORTAL (Radix Popover), com largura limitada,
 * e continua funcionando igual: teclado, Esc, clique fora, e dentro de um Dialog.
 *
 * ⚠ O DEFEITO (NJ, 30/09 11:36): o painel era um `div absolute` dentro do filtro; na última coluna (Fornecedor) passava
 *   da borda e a página ganhava rolagem horizontal. jsdom não faz layout — "sem rolagem" foi medido na tela; aqui se prova
 *   a ESTRUTURA que garante isso: o painel fora do componente (portal) e a largura com teto.
 * ⚠ A API NÃO MUDOU: os casos da memória da busca (`searchableSelectMemoria.test.tsx`) passam sem alterar asserção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const LONGO = '3R Logistica e Cereais Eireli — Armazém Geral de Grãos do Mato Grosso do Sul Ltda';
const OPCOES = [
  { value: 'a', label: LONGO, hint: '1' },
  { value: 'b', label: 'Telefonica Brasil S.A.', hint: '12' },
  { value: 'c', label: 'Amanda Montes Camargo' },
];

beforeEach(() => { Element.prototype.scrollIntoView = () => {}; });

function montar(extra?: { dentroDeDialog?: boolean }) {
  const onValueChange = vi.fn();
  const campo = (
    <div data-testid="barra-de-filtros">
      <SearchableSelect value="__all__" onValueChange={onValueChange} options={OPCOES} placeholder="Buscar fornecedor..." />
    </div>
  );
  render(extra?.dentroDeDialog
    ? <Dialog open><DialogContent><DialogTitle>Modal</DialogTitle>{campo}</DialogContent></Dialog>
    : <>{campo}<button type="button">fora</button></>);
  return { onValueChange };
}
const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
const painel = () => screen.getByTestId('searchable-select-painel');

describe('o painel em portal, com largura limitada', () => {
  it('abre FORA do componente (portal), não dentro da barra de filtros', async () => {
    montar();
    abrir();
    await screen.findByPlaceholderText('Buscar fornecedor...');
    expect(screen.getByTestId('barra-de-filtros').contains(painel())).toBe(false);
    expect(document.body.contains(painel())).toBe(true);
  });

  it('largura: mínimo = o campo, máximo 320px (era 448 e crescia com o nome); a paleta OPACA do padrão de menu', async () => {
    montar();
    abrir();
    await screen.findByPlaceholderText('Buscar fornecedor...');
    const c = painel().className;
    expect(c).toContain('min-w-[var(--radix-popover-trigger-width)]');
    expect(c).toContain('max-w-[320px]');
    expect(c).not.toContain('max-w-[28rem]');
    /* UI-DROPDOWN-PADRAO-01 — era o vidro translúcido (zinc-950/55 + blur); agora a `MENU_PALETA`, opaca, zinc-600 (fix1) */
    expect(c).toContain('bg-zinc-600');
    expect(c).not.toContain('bg-zinc-800');
    expect(c).not.toMatch(/backdrop-blur/);
  });

  it('item longo trunca, com o texto inteiro no title', async () => {
    montar();
    abrir();
    const item = await screen.findByTitle(LONGO);
    expect(item.className).toContain('truncate');
  });
});

describe('o comportamento de antes, refeito no Popover', () => {
  it('foco na busca ao abrir; setas + Enter escolhem', async () => {
    const { onValueChange } = montar();
    abrir();
    const busca = await screen.findByPlaceholderText('Buscar fornecedor...');
    await waitFor(() => expect(document.activeElement).toBe(busca));
    fireEvent.keyDown(busca, { key: 'ArrowDown' }); // do 1º para o 2º item
    fireEvent.keyDown(busca, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith('b');
    await waitFor(() => expect(screen.queryByTestId('searchable-select-painel')).toBeNull());
  });

  it('Esc fecha', async () => {
    montar();
    abrir();
    const busca = await screen.findByPlaceholderText('Buscar fornecedor...');
    fireEvent.keyDown(busca, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('searchable-select-painel')).toBeNull());
  });

  it('clicar fora fecha', async () => {
    montar();
    abrir();
    await screen.findByPlaceholderText('Buscar fornecedor...');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'fora' }));
    await waitFor(() => expect(screen.queryByTestId('searchable-select-painel')).toBeNull());
  });

  it('dentro de um Dialog: abre, busca, escolhe — e o Dialog continua aberto', async () => {
    const { onValueChange } = montar({ dentroDeDialog: true });
    abrir();
    const busca = await screen.findByPlaceholderText('Buscar fornecedor...');
    fireEvent.change(busca, { target: { value: 'amanda' } });
    fireEvent.click(await screen.findByText('Amanda Montes Camargo'));
    expect(onValueChange).toHaveBeenCalledWith('c');
    expect(screen.getByText('Modal')).toBeInTheDocument();
  });
});
