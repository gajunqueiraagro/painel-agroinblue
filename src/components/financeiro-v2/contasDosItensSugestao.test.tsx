/**
 * NOTA-ITENS-SUGESTAO (Gabriel 27/11, mock `nota-itens-sugestao-modal-real.html` aprovado 10:47) — a vista Contas com a sugestão da escada
 * única: "Obra ou manutenção?" (o item de material fica SEM conta até a resposta), a origem de cada item, o total por conta (com "a decidir"),
 * "Juntar tudo numa conta ▾" e "Usar divisão (N contas)"; e Q3 (as contas que o operador escolheu). Dados SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ItemSugerido } from '@/lib/financeiro/nfe/sugestaoDosItens';
import { ContasDosItens } from './ContasDosItens';

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
  it('o item de material NÃO nasce na conta de hoje: espera a resposta; origem por linha; o total tem "a decidir"; Usar divisão desabilitado', () => {
    montar();
    expect(screen.getByTestId('conta-do-item-3').textContent).toBe('responda obra ou manutenção');
    expect(screen.getByTestId('origem-do-item-1').textContent).toBe('mesmo produto em 14/08');
    expect(screen.getByTestId('origem-do-item-3').textContent).toBe('cerca · obra ou manutenção?');
    expect(screen.getByTestId('contas-frase').textContent).toBe('4 itens em 3 contas · 1 espera obra ou manutenção (item 3)');
    expect(screen.getByTestId('contas-total-a-decidir').textContent).toContain('392,00');
    expect(screen.getAllByTestId('contas-total-linha').map((l) => l.textContent?.replace(/\s/g, ' '))).toEqual([
      'Nutrição Engorda19.600,0088,8%', 'Vacinas e Vermífugos1716,006,6%', 'Brincos de Identificação1100,000,9%']);
    expect(screen.getByTestId('contas-total-da-nota').textContent).toBe('Total da nota410.808,00100%');
    const usar = screen.getByTestId('contas-dividir');
    expect([usar.textContent, (usar as HTMLButtonElement).disabled]).toEqual(['Usar divisão (4 contas)', true]);
  });

  it('a resposta põe a conta (manutenção × obra), a origem vira "você escolheu", o Usar divisão libera e grava o mapa; Q3 recebe a escolha', () => {
    const { onDividir, onEscolhas } = montar();
    fireEvent.click(screen.getByTestId('pergunta-3-manutencao'));
    expect(screen.getByTestId('origem-do-item-3').textContent).toBe('você escolheu');
    expect(screen.queryByTestId('contas-total-a-decidir')).toBeNull();
    expect(onEscolhas).toHaveBeenLastCalledWith(new Map([[3, 'pm']]));
    fireEvent.click(screen.getByTestId('pergunta-3-obra'));
    expect(onEscolhas).toHaveBeenLastCalledWith(new Map([[3, 'po']]));
    const usar = screen.getByTestId('contas-dividir');
    expect([usar.textContent, (usar as HTMLButtonElement).disabled]).toEqual(['Usar divisão (4 contas)', false]);
    fireEvent.click(usar);
    expect(onDividir).toHaveBeenCalledWith(new Map([[1, 'pn'], [2, 'pv'], [4, 'pb'], [3, 'po']]));
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
