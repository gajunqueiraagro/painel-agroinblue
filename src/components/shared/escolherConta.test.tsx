/**
 * SELETOR-CONTA-POR-ATIVIDADE-01 (P78) — o `EscolherConta`: a barra de atividade em cima (so' as que o plano usa neste tipo), a busca ja'
 * filtrada por ela, a atividade nascendo da conta de hoje ou da sugestao, e a lista de altura fixa (trocar a atividade nao desloca nada).
 * Plano SINTETICO.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { EscolherConta } from './EscolherConta';
import { ContasDosItens } from '@/components/financeiro-v2/ContasDosItens';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';

const conta = (id: string, subcentro: string, escopo: string, tipo = '2-Saídas'): ClassificacaoItem => ({
  id, subcentro, centro_custo: 'C', grupo_custo: 'G', macro_custo: 'M', tipo_operacao: tipo, escopo_negocio: escopo,
});
const PLANO = [
  conta('pec-1', 'Sanidade Animal Sintetica', 'pecuaria'), conta('pec-2', 'Nutrição Sintetica', 'pecuaria'),
  conta('lav-1', 'Defensivos Sinteticos', 'agricultura'), conta('adm-1', 'Escritório Sintetico', 'administrativo'),
  conta('sil-e', 'Venda de Madeira Sintetica', 'silvicultura', '1-Entradas'),
];
const abrir = (valor: string, atividadeSugerida: 'pecuaria' | 'agricultura' | null = null) => {
  const onEscolher = vi.fn();
  render(<EscolherConta valor={valor} classificacoes={PLANO} tipoOperacao="2-Saídas" onEscolher={onEscolher} atividadeSugerida={atividadeSugerida} />);
  fireEvent.click(screen.getByRole('combobox'));
  return onEscolher;
};
const barra = () => within(screen.getByTestId('conta-barra-atividade'));
const marcada = () => barra().getAllByRole('button').filter((b) => b.className.includes('bg-primary')).map((b) => b.textContent);
/* os itens da lista (o "mostrar todos" do outro lado e' a porta de sempre, nao um item) */
const naLista = () => within(screen.getByTestId('conta-lista')).queryAllByRole('button').map((b) => b.textContent).filter((t) => t !== 'mostrar todos');
/* o jsdom nao tem `scrollIntoView` (o seletor posiciona a lista no item de hoje) */
Element.prototype.scrollIntoView = vi.fn();

describe('EscolherConta — a atividade primeiro', () => {
  it('a barra tem SO\' as atividades que o plano usa neste tipo (silvicultura so\' existe nas entradas: fora)', () => {
    abrir('');
    expect(barra().getAllByRole('button').map((b) => b.textContent)).toEqual(['Pecuária', 'Lavoura', 'Administrativo']);
  });
  it('abre na atividade da conta de hoje, com a lista ja\' filtrada; escolher devolve a conta pelo id', () => {
    const onEscolher = abrir('pec-1');
    expect(marcada()).toEqual(['Pecuária']);
    expect(naLista()).toEqual(['Sanidade Animal Sintetica', 'Nutrição Sintetica']);
    fireEvent.click(screen.getByText('Nutrição Sintetica'));
    expect(onEscolher).toHaveBeenCalledWith(expect.objectContaining({ id: 'pec-2', escopo_negocio: 'pecuaria' }));
  });
  it('sem conta: a sugestao marca a atividade; trocar filtra; clicar na marcada mostra todas', () => {
    abrir('', 'agricultura');
    expect(marcada()).toEqual(['Lavoura']);
    expect(naLista()).toEqual(['Defensivos Sinteticos']);
    fireEvent.click(barra().getByText('Administrativo'));
    expect(naLista()).toEqual(['Escritório Sintetico']);
    fireEvent.click(barra().getByText('Administrativo'));
    expect(marcada()).toEqual([]);
    expect(naLista()).toHaveLength(4);
  });
  it('a busca vale dentro da atividade escolhida', () => {
    abrir('pec-1');
    fireEvent.change(screen.getByPlaceholderText('Buscar subcentro...'), { target: { value: 'sint' } });
    expect(naLista()).toEqual(['Sanidade Animal Sintetica', 'Nutrição Sintetica']);
  });
  it('nada se desloca: a lista tem ALTURA (14rem, ou o que cabe do lado em que abriu), nunca so\' o maximo', () => {
    abrir('pec-1');
    const lista = screen.getByTestId('conta-lista');
    expect(lista.className).toContain('h-[min(14rem,calc(var(--radix-popover-content-available-height)_-_68px))]');
    expect(lista.className).not.toContain('max-h-56');
  });
});

describe('onde trocou: a conta de cada item (aba Contas dos Itens da nota)', () => {
  it('o item sem conta abre a barra na atividade do lancamento; o item com conta, na dele', () => {
    render(<ContasDosItens itens={[{ nItem: 1, descricao: 'Vacina sintetica', liquidoCent: 1000 }, { nItem: 2, descricao: 'Ração sintetica', liquidoCent: 2000 }]}
      classificacoes={PLANO} tipoOperacao="2-Saídas" contaDeHoje={null} sugeridas={new Map([[2, 'adm-1']])} gravando={false} onDividir={() => undefined}
      atividadeSugerida="agricultura" />);
    fireEvent.click(within(screen.getByTestId('conta-do-item-1')).getByRole('combobox'));
    expect(marcada()).toEqual(['Lavoura']);
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar subcentro...'), { key: 'Escape' });
    fireEvent.click(within(screen.getByTestId('conta-do-item-2')).getByRole('combobox'));
    expect(marcada()).toEqual(['Administrativo']);
  });
});

