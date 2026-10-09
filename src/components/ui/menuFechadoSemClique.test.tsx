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
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from './alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { useState } from 'react';

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

/* ─── DIALOG-CLIQUE-FECHANDO-01 — diálogo, confirmação e folha: o botão de ação não vale com o conteúdo saindo ─── */
describe('Dialog, AlertDialog e Sheet — fechando, o botão de ação não recebe o segundo clique', () => {
  function Caso({ tipo, acao, captura }: { tipo: 'dialog' | 'alert' | 'sheet'; acao: () => void; captura?: () => void }) {
    const [aberto, setAberto] = useState(true);
    const salvar = () => { acao(); setAberto(false); };
    if (tipo === 'dialog') return (
      <Dialog open={aberto} onOpenChange={setAberto}><DialogContent onClickCapture={captura}>
        <DialogTitle>t</DialogTitle><DialogDescription>d</DialogDescription><button onClick={salvar}>Salvar</button>
      </DialogContent></Dialog>);
    if (tipo === 'sheet') return (
      <Sheet open={aberto} onOpenChange={setAberto}><SheetContent onClickCapture={captura}>
        <SheetTitle>t</SheetTitle><SheetDescription>d</SheetDescription><button onClick={salvar}>Salvar</button>
      </SheetContent></Sheet>);
    return (
      <AlertDialog open={aberto} onOpenChange={setAberto}><AlertDialogContent onClickCapture={captura}>
        <AlertDialogTitle>t</AlertDialogTitle><AlertDialogDescription>d</AlertDialogDescription>
        <AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={salvar}>Salvar</AlertDialogAction>
      </AlertDialogContent></AlertDialog>);
  }
  const papel = (tipo: string) => (tipo === 'alert' ? 'alertdialog' : 'dialog');

  it.each(['dialog', 'alert', 'sheet'] as const)('%s — sem animação (o jsdom de sempre): fechado, o conteúdo SAI do DOM', (tipo) => {
    const acao = vi.fn();
    render(<Caso tipo={tipo} acao={acao} />);
    fireEvent.click(screen.getByText('Salvar'));
    expect(acao).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Salvar')).toBeNull();
  });

  it.each(['dialog', 'alert', 'sheet'] as const)('%s — COM a saída em curso: o conteúdo ainda está no DOM, e o segundo clique no Salvar NÃO dispara', (tipo) => {
    simularAnimacaoDeSaida();
    const acao = vi.fn(); const captura = vi.fn();
    render(<Caso tipo={tipo} acao={acao} captura={captura} />);
    fireEvent.click(screen.getByText('Salvar'));
    expect([acao.mock.calls.length, captura.mock.calls.length]).toEqual([1, 1]);   // aberto, o `onClickCapture` de quem usa segue valendo
    /* a simulação funciona: fechou (estado) e CONTINUA no DOM */
    expect(screen.getByText('Salvar').closest(`[role=${papel(tipo)}]`)?.getAttribute('data-state')).toBe('closed');
    fireEvent.click(screen.getByText('Salvar'));
    fireEvent.click(screen.getByText('Salvar'));
    expect([acao.mock.calls.length, captura.mock.calls.length]).toEqual([1, 1]);
  });

  it('diálogo por cima de diálogo: fechar o de cima não tira o clique do de baixo', () => {
    simularAnimacaoDeSaida();
    const deBaixo = vi.fn(); const deCima = vi.fn();
    function Dois() {
      const [cima, setCima] = useState(true);
      return (
        <Dialog open><DialogContent>
          <DialogTitle>baixo</DialogTitle><DialogDescription>d</DialogDescription><button onClick={deBaixo}>Gravar embaixo</button>
          <Dialog open={cima} onOpenChange={setCima}><DialogContent>
            <DialogTitle>cima</DialogTitle><DialogDescription>d</DialogDescription>
            <button onClick={() => { deCima(); setCima(false); }}>Confirmar em cima</button>
          </DialogContent></Dialog>
        </DialogContent></Dialog>);
    }
    render(<Dois />);
    fireEvent.click(screen.getByText('Confirmar em cima'));
    expect(screen.getByText('Confirmar em cima').closest('[role=dialog]')?.getAttribute('data-state')).toBe('closed');
    fireEvent.click(screen.getByText('Confirmar em cima'));           // o de cima, saindo: não vale
    expect(deCima).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Gravar embaixo').closest('[role=dialog]')?.getAttribute('data-state')).toBe('open');
    fireEvent.click(screen.getByText('Gravar embaixo'));              // o de baixo segue aberto e recebe
    expect(deBaixo).toHaveBeenCalledTimes(1);
  });

  it('Select: MEDIDO — a lista sai do DOM no instante em que fecha, mesmo com a saída simulada (não há o que clicar)', () => {
    simularAnimacaoDeSaida();
    const mudar = vi.fn();
    render(<Select onValueChange={mudar}><SelectTrigger><SelectValue placeholder="escolha" /></SelectTrigger>
      <SelectContent><SelectItem value="a">Alfa</SelectItem><SelectItem value="b">Beta</SelectItem></SelectContent></Select>);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(screen.getAllByRole('option')).toHaveLength(2);            // a busca sabe achar a lista aberta
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
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

  /* DIALOG-CLIQUE-FECHANDO-01: conteúdo E fundo (as duas linhas que animam a entrada em cada arquivo) */
  it.each([
    ['src/components/ui/dialog.tsx', 2],
    ['src/components/ui/alert-dialog.tsx', 2],
    ['src/components/ui/sheet.tsx', 2],
  ])('%s: conteúdo e fundo (%i linhas), os dois com a regra por extenso, e o conteúdo com a trava de clique', (arquivo, quantos) => {
    const fonte = ler(arquivo);
    expect(conteudos(fonte)).toHaveLength(quantos);
    expect(semARegra(fonte)).toEqual([]);
    expect(fonte.match(/onClickCapture=\{recusarCliqueFechado\(onClickCapture\)\}/g)).toHaveLength(1);
  });

  it('gaveta (vaul) e dica: a gaveta usa o MESMO `data-state` do Radix (fundo e conteúdo); a dica que sai não segura o clique', () => {
    const gaveta = ler('src/components/ui/drawer.tsx');
    expect(gaveta.split(REGRA).length - 1).toBe(2);
    expect(gaveta.match(/onClickCapture=\{recusarCliqueFechado\(onClickCapture\)\}/g)).toHaveLength(1);
    expect(ler('src/components/ui/tooltip.tsx').split(REGRA).length - 1).toBe(1);
    /* o SearchableSelect desmonta a lista ao fechar (`{open && <PopoverContent`): não há conteúdo fechado no DOM */
    expect(ler('src/components/ui/searchable-select.tsx')).toContain('{open && (\n        <PopoverContent');
  });

  it('o seletor de fornecedor recusa os três gestos da lista com ela fechada, e os itens do DropdownMenu passam pela trava', () => {
    const dono = ler('src/components/shared/FavorecidoSelect.tsx');
    expect(dono.match(/if \(!open\) return;/g)).toHaveLength(3);
    const menu = ler('src/components/ui/dropdown-menu.tsx');
    expect(menu.match(/onClick=\{recusarSeFechado\(onClick\)\}/g)).toHaveLength(3);
  });
});
