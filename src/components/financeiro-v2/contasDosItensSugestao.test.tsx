/**
 * NOTA-ITENS-SUGESTAO (Gabriel 27/11, mock `nota-itens-sugestao-modal-real.html` aprovado 10:47) — a vista Contas com a sugestão da escada
 * única: "Obra ou manutenção?" (o item de material fica SEM conta até a resposta), a origem de cada item, o total por conta (com "a decidir"),
 * "Juntar tudo numa conta ▾" e "Usar divisão (N contas)"; e Q3 (as contas que o operador escolheu). Dados SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ItemSugerido } from '@/lib/financeiro/nfe/sugestaoDosItens';
import { ClassificarItens, ContasDosItens } from './ContasDosItens';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

const C = (id: string, subcentro: string, escopo = 'pecuaria'): ClassificacaoItem =>
  ({ id, subcentro, centro_custo: 'C', grupo_custo: 'G', macro_custo: 'M', tipo_operacao: '2-Saídas', escopo_negocio: escopo });
const CLASSIF = [C('pn', 'Nutrição Engorda'), C('pv', 'Vacinas e Vermífugos'), C('pb', 'Brincos de Identificação'),
  C('pm', 'Manutenção de Cercas Pecuária'), C('po', 'Investimento em Cercas Pecuária')];
const ITENS = [
  { nItem: 1, descricao: 'SAL MINERAL 80 P SC 30KG', liquidoCent: 960000 },
  { nItem: 2, descricao: 'VERMIFUGO INJETAVEL 500ML', liquidoCent: 71600 },
  { nItem: 3, descricao: 'ARAME FARPADO 500M', liquidoCent: 39200 },
  { nItem: 4, descricao: 'BRINCO IDENTIFICACAO CX 100', liquidoCent: 10000 },
];
const s = (n: number, plano: string | null, sub: string | null, origem: string | null, extra: Partial<ItemSugerido> = {}): ItemSugerido =>
  ({ itemId: null, nItem: n, planoContaId: plano, subcentro: sub, fonte: plano ? 'mesmo_produto' : 'familia_pergunta', confianca: plano ? 'alta' : null,
    porque: `porque ${n}`, origem, pergunta: null, ...extra });
const SUG: ItemSugerido[] = [
  s(1, 'pn', 'Nutrição Engorda', 'mesmo produto em 14/08'),
  s(2, 'pv', 'Vacinas e Vermífugos', 'família sanidade animal'),
  s(3, null, null, 'cerca · obra ou manutenção?', { pergunta: {
    manutencao: { planoContaId: 'pm', subcentro: 'Manutenção de Cercas Pecuária' }, obra: { planoContaId: 'po', subcentro: 'Investimento em Cercas Pecuária' } } }),
  s(4, 'pb', 'Brincos de Identificação', 'mesmo produto em 02/06'),
];
const SUGERIDAS = new Map([[1, 'pn'], [2, 'pv'], [4, 'pb']]);

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

function montar(extra: Partial<React.ComponentProps<typeof ContasDosItens>> = {}) {
  const onDividir = vi.fn(); const onJuntar = vi.fn(); const onEscolhas = vi.fn();
  render(<ContasDosItens itens={ITENS} classificacoes={CLASSIF} tipoOperacao="2-Saídas" contaDeHoje="pn" sugeridas={SUGERIDAS} gravando={false}
    onDividir={onDividir} aoSalvar sugestoes={SUG} onJuntar={onJuntar} onEscolhas={onEscolhas} {...extra} />);
  return { onDividir, onJuntar, onEscolhas };
}

describe('ContasDosItens com a sugestão da escada', () => {
  it('SUGESTAO-ITENS-02 — NUNCA TRAVA: o item do atalho nasce SEM conta (aviso pequeno, "sem conta" no total) e o Usar divisão segue livre, levando-o na conta do lançamento', () => {
    const { onDividir } = montar();
    expect(screen.getByTestId('origem-do-item-1').textContent).toBe('mesmo produto em 14/08');
    expect(screen.getByTestId('origem-do-item-3').textContent).toBe('cerca · obra ou manutenção?');
    expect(screen.getByTestId('contas-frase').textContent).toBe('1 item sem conta: vai na conta do lançamento (Nutrição Engorda) — não trava o salvar');
    expect(screen.getByTestId('contas-total-sem-conta').textContent).toContain('392,00');
    expect(screen.getAllByTestId('contas-total-linha').map((l) => l.textContent?.replace(/\s/g, ' '))).toEqual([
      'Nutrição Engorda19.600,0088,8%', 'Vacinas e Vermífugos1716,006,6%', 'Brincos de Identificação1100,000,9%']);
    expect(screen.getByTestId('contas-total-da-nota').textContent).toBe('Total da nota410.808,00100%');
    const usar = screen.getByTestId('contas-dividir');
    expect([usar.textContent, usar.hasAttribute('disabled')]).toEqual(['Usar divisão (3 contas)', false]);
    fireEvent.click(usar);
    expect(onDividir).toHaveBeenCalledWith(new Map([[1, 'pn'], [2, 'pv'], [4, 'pb'], [3, 'pn']]));
  });

  it('o ATALHO (opcional) põe a conta (manutenção × obra), a origem vira "você escolheu (atalho)" e grava o mapa; Q3 recebe a escolha', () => {
    const { onDividir, onEscolhas } = montar();
    fireEvent.click(screen.getByTestId('pergunta-3-manutencao'));
    expect(screen.getByTestId('origem-do-item-3').textContent).toBe('você escolheu (atalho)');
    expect(screen.queryByTestId('contas-total-sem-conta')).toBeNull();
    expect(onEscolhas).toHaveBeenLastCalledWith(new Map([[3, 'pm']]));
    fireEvent.click(screen.getByTestId('pergunta-3-obra'));
    expect(onEscolhas).toHaveBeenLastCalledWith(new Map([[3, 'po']]));
    const usar = screen.getByTestId('contas-dividir');
    expect([usar.textContent, usar.hasAttribute('disabled')]).toEqual(['Usar divisão (4 contas)', false]);
    fireEvent.click(usar);
    expect(onDividir).toHaveBeenCalledWith(new Map([[1, 'pn'], [2, 'pv'], [4, 'pb'], [3, 'po']]));
  });

  it('SUGESTAO-ITENS-02 — a aba mostra só o resumo; "Classificar itens ▸" abre o modal (Qtd, fonte 11 — a régua, Cancelar), e o que mudou volta ao reabrir', async () => {
    const onDividir = vi.fn();
    render(<ClassificarItens itens={ITENS.map((i) => ({ ...i, quantidade: '20', unidade: 'SC' }))} classificacoes={CLASSIF} tipoOperacao="2-Saídas"
      contaDeHoje="pn" sugeridas={SUGERIDAS} gravando={false} onDividir={onDividir} aoSalvar sugestoes={SUG} onJuntar={vi.fn()} />);
    expect(screen.getByTestId('contas-frase').textContent).toBe('4 itens em 3 contas · 1 sem conta');
    expect(screen.queryByTestId('contas-linha')).toBeNull();
    fireEvent.click(screen.getByTestId('classificar-itens'));
    const modal = await screen.findByTestId('classificar-itens-modal');
    expect(within(modal).getAllByTestId('contas-linha')[0].textContent).toContain('20 SC');
    expect(within(modal).getAllByTestId('contas-linha')[0].querySelector('td')?.className).toContain('text-[11px]');
    fireEvent.click(within(modal).getByTestId('pergunta-3-obra'));
    fireEvent.click(within(modal).getByTestId('contas-cancelar'));
    expect(screen.getByTestId('contas-frase').textContent).toBe('4 itens em 4 contas');
    fireEvent.click(screen.getByTestId('classificar-itens'));
    expect(within(await screen.findByTestId('classificar-itens-modal')).getByTestId('origem-do-item-3').textContent).toBe('você trocou');
  });

  it('"Juntar tudo numa conta ▾" abre na de MAIOR valor (Q2) e põe todos os itens nela', async () => {
    const { onJuntar } = montar();
    fireEvent.keyDown(screen.getByTestId('contas-juntar'), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    const opcoes = within(menu).getAllByRole('menuitem').map((o) => o.textContent);
    expect(opcoes[0]).toBe('Nutrição Engorda · R$ 9.600,00');
    fireEvent.click(within(menu).getAllByRole('menuitem')[0]);
    expect(onJuntar).toHaveBeenCalledWith('pn');
    expect(screen.getByTestId('contas-frase').textContent).toBe('Todos os itens estão na mesma conta: não há o que dividir.');
  });

  it('SUGESTAO-ITENS-02 — "Juntar ▾" termina em "Escolher outra conta…": o plano INTEIRO abre já e a escolhida junta tudo', async () => {
    const { onJuntar } = montar();
    fireEvent.keyDown(screen.getByTestId('contas-juntar'), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    const outra = within(menu).getByTestId('contas-juntar-outra-conta');
    expect(outra.textContent).toBe('Escolher outra conta… (o plano inteiro)');
    fireEvent.click(outra);
    expect(await screen.findByTestId('contas-juntar-outra')).toBeTruthy();
    /* a lista abre JÁ (sem clicar no gatilho), com a busca e a barra de atividade do seletor de sempre */
    expect(await screen.findByPlaceholderText('Buscar subcentro...')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Investimento em Cercas Pecuária/ }));
    expect(onJuntar).toHaveBeenCalledWith('po');
  });

  it('BUG-01: `todasNaConta` (sem divisão) põe TODOS os itens na conta do lançamento, inclusive o que perguntaria; "Usar divisão" some e volta ao trocar um item', () => {
    montar({ todasNaConta: 'pn' });
    for (const n of [1, 2, 3, 4]) expect(within(screen.getByTestId(`conta-do-item-${n}`)).getByRole('combobox').textContent).toContain('Nutrição Engorda');
    expect(screen.getByTestId('origem-do-item-2').textContent).toBe('a do lançamento (sugestão: Vacinas e Vermífugos)');
    expect(screen.getByTestId('origem-do-item-1').textContent).toBe('a do lançamento');
    expect(screen.queryByTestId('contas-total-a-decidir')).toBeNull();
    expect(screen.getByTestId('contas-dividir').className).toContain('invisible');
    fireEvent.click(screen.getByTestId('pergunta-3-obra'));
    expect(screen.getByTestId('contas-dividir').className).not.toContain('invisible');
  });

  it('sem `sugestoes` a vista é a de antes (sem as colunas novas, sem total, sem Juntar)', () => {
    render(<ContasDosItens itens={ITENS} classificacoes={CLASSIF} tipoOperacao="2-Saídas" contaDeHoje="pn" sugeridas={new Map()} gravando={false} onDividir={vi.fn()} aoSalvar />);
    expect(screen.queryByText('Obra ou manutenção?')).toBeNull();
    expect(screen.queryByTestId('contas-total-por-conta')).toBeNull();
    expect(screen.queryByTestId('contas-juntar')).toBeNull();
    expect(screen.getByTestId('contas-dividir').textContent).toBe('Dividir em 2 contas ao salvar');
  });
});
