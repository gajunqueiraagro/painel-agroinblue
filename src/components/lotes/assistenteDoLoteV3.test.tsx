/** LOTE-PADRAO-V3 · L2 — o assistente v3 na tela: os 8 passos (recria pula Situação e Ordem de parto), as 7 categorias FIXAS pela fase
 *  (NJ: o "BO Boi" do cliente nunca aparece), tudo por extenso, a parida trava sem carimbo e a gravação manda `categoria_rebanho`. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const banco = vi.hoisted(() => ({ cadastros: [] as Record<string, unknown>[], rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const tabela = (nome: string) => {
    const dado = nome === 'categorias_rebanho'
      ? [{ id: 'rb-va', nome: 'Vacas', codigo: 'vacas' }, { id: 'rb-no', nome: 'Novilhas', codigo: 'novilhas' }, { id: 'rb-dm', nome: 'Desmama M', codigo: 'desmama_m' },
        { id: 'rb-bo', nome: 'Bois', codigo: 'bois' }]
      : banco.cadastros;
    const b: Record<string, unknown> = {};
    const eu = () => b;
    Object.assign(b, { select: eu, eq: eu, order: eu, then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: dado, error: null }).then(ok) });
    return b;
  };
  return { supabase: { from: tabela, rpc: (...a: unknown[]) => banco.rpc(...a) } };
});
const notificar = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useLotesDaFazenda', () => ({ notificarLotesMudaram: notificar }));

import { AssistenteDoLoteV3 } from './AssistenteDoLoteV3';

const c = (id: string, tipo: string, sigla: string | null, nome: string, categorias_rebanho: string[] = []) =>
  ({ id, tipo, sigla, nome, categorias_rebanho, ordem: 10, ativo: true });

beforeEach(() => {
  banco.cadastros = [c('a-c', 'atividade', 'C', 'Cria'), c('a-r', 'atividade', 'R', 'Recria'), c('a-x', 'atividade', 'LEI', 'Leiteiras'),
    c('ne', 'raca', 'NEL', 'Nelore'), c('an', 'raca', 'ANG', 'Angus'), c('bo', 'categoria', 'BO', 'Boi', ['rb-bo'])];
  banco.rpc.mockReset(); notificar.mockReset();
  banco.rpc.mockImplementation(async () => ({ data: { id: 'novo', codigo: 'X', codigo_antigo: null }, error: null }));
});

const montar = () => {
  const onPronto = vi.fn();
  render(<AssistenteDoLoteV3 open clienteId="cli" fazendaId="faz" fazendaRotulo="PUR" lotesDaFazenda={[]} onPronto={onPronto} onFechar={vi.fn()} />);
  return { onPronto };
};
const avancar = () => fireEvent.click(screen.getByTestId('assistente-avancar'));
const opcao = (testid: string, nome: string) => fireEvent.click(within(screen.getByTestId(testid)).getByText(nome));

describe('AssistenteDoLoteV3', () => {
  it('recria: só C/R/E, categorias fixas da fase por extenso, pula Situação e Ordem; grava categoria_rebanho', async () => {
    const { onPronto } = montar();
    const ativ = await screen.findByTestId('assistente-atividades');
    expect(within(ativ).queryByText('Leiteiras')).toBeNull();
    opcao('assistente-atividades', 'Recria'); avancar();
    const cats = within(screen.getByTestId('assistente-categorias')).getAllByRole('button').map(b => b.textContent);
    expect(cats).toEqual(['Desmama fêmea', 'Desmama macho', 'Garrotes', 'Novilhas']);
    expect(screen.queryByText('Boi')).toBeNull();
    opcao('assistente-categorias', 'Desmama macho');
    expect(screen.getByTestId('assistente-codigo').textContent).toBe('R-DSM-__');
    avancar();
    opcao('assistente-racas', 'Angus');
    expect(screen.getByTestId('assistente-passo-valor-3').textContent).toBe('não se aplica');
    expect(screen.getByTestId('assistente-passo-3')).toBeDisabled();
    avancar();
    expect(screen.getByText('Programa', { selector: 'h2' })).toBeTruthy();
    opcao('assistente-programa', 'Recria'); avancar();
    opcao('assistente-sistema', 'Pasto + suplemento'); avancar();
    fireEvent.change(screen.getByTestId('assistente-marcador'), { target: { value: 'Retiro' } });
    fireEvent.keyDown(screen.getByTestId('assistente-marcador'), { key: 'Enter' });
    avancar();
    await vi.waitFor(() => expect(onPronto).toHaveBeenCalled());
    const [fn, args] = banco.rpc.mock.calls[0];
    expect(fn).toBe('fn_lote_salvar');
    expect(args.p_campos).toMatchObject({ categoria_rebanho: 'desmama_m', atividade_id: 'a-r', raca_id: 'an', programa_lote: 'recria',
      sistema_lote: 'pasto_suplemento', marcadores: ['Retiro'], cria_ao_pe: '', carimbos: [] });
    expect(args.p_campos).not.toHaveProperty('categoria_id');
  });

  it('cria · vacas parida: sem carimbo trava (trilho marca a Situação); com 7.1 e 8.1 o código leva a faixa 7/8', async () => {
    montar();
    opcao(await screen.findByTestId('assistente-atividades').then(() => 'assistente-atividades'), 'Cria'); avancar();
    expect(within(screen.getByTestId('assistente-categorias')).getAllByRole('button').map(b => b.textContent)).toEqual(['Vacas', 'Novilhas', 'Touros']);
    opcao('assistente-categorias', 'Vacas'); avancar();
    opcao('assistente-racas', 'Nelore'); avancar();
    opcao('assistente-cria-ao-pe', 'Parida');
    expect(screen.getByTestId('assistente-avancar')).toBeDisabled();
    expect(screen.getByTestId('assistente-dica').textContent).toBe('Parida: informe o carimbo (mês.lote, ex.: 7.1).');
    expect(screen.getByTestId('assistente-passo-problema')).toBeTruthy();
    for (const k of ['7.1', '8.1']) {
      fireEvent.change(screen.getByTestId('assistente-carimbo'), { target: { value: k } });
      fireEvent.keyDown(screen.getByTestId('assistente-carimbo'), { key: 'Enter' });
    }
    expect(screen.getAllByTestId('assistente-carimbo-chip')).toHaveLength(2);
    expect(screen.getByTestId('assistente-codigo').textContent).toBe('C-VAC-NEL-7/8');
    expect(screen.getByTestId('assistente-avancar')).not.toBeDisabled();
    /* prenha libera de quê / parto; vazia apaga */
    expect(within(screen.getByTestId('assistente-prenha-de')).getByText('IATF')).toBeDisabled();
    opcao('assistente-prenhez', 'Prenha');
    expect(within(screen.getByTestId('assistente-prenha-de')).getByText('IATF')).not.toBeDisabled();
    avancar();
    expect(within(screen.getByTestId('assistente-ordem-parto')).getAllByRole('button').map(b => b.textContent))
      .toEqual(['Sem parto', 'Primípara', 'Secundípara', 'Multípara']);
  });
});
