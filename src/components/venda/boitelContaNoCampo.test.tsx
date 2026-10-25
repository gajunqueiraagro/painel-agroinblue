/**
 * P91/P89 — a conta nos campos de número do boitel (cabeças, dias, GMD, %, as médias de 5 casas) e a média em DINHEIRO de 5 casas
 * pelo `CampoMoeda` (o "R$" dentro e a conta). Dado da Vera b58bf556 (109 cab abatidas, 104 dias), sintético no resto.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BoitelBlocosModais, boitelVazio } from '@/components/venda/BoitelBlocosModais';
import type { BoitelEdicao } from '@/components/venda/BoitelNegociacaoDerivado';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';

vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

const comoInput = (el: Element | null | undefined): HTMLInputElement => { if (!(el instanceof HTMLInputElement)) throw new Error('não é input'); return el; };
const caixa = (el: Element | null): HTMLElement => { if (!(el instanceof HTMLElement)) throw new Error('sem caixa'); return el; };

const PROJETADO: BoitelEdicao = {
  ...boitelVazio(),
  qtdCabecas: 110, pesoInicial: 408, dias: 104, gmd: 1.5, rendimentoEntrada: 50, rendimento: 55,
  custoDiaria: 18.5, precoVendaArroba: 330,
};
const FATOS = {
  qtdAbatida: 109, dias: 104, pesoVivoTotalAbate: 62075.5, arrobasTotaisAbate: 2251.67,
  valorTotalDiarias: 214590.48, valorTotalAbate: 813771.01,
};
definirFornecedoresDoLeitor([{ id: 'jbs', nome: 'JBS' }]);

function montar(realizado: BoitelEdicao) {
  const onChangeRealizado = vi.fn();
  render(
    <BoitelBlocosModais valor={PROJETADO} onChange={vi.fn()} cenario="projetado" clienteId="cli"
      realizado={realizado} onChangeRealizado={onChangeRealizado} onIniciarRealizado={() => Promise.resolve(true)} />,
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Editar Desempenho e Custos' })[1]);
  return onChangeRealizado;
}
const blocoPorTitulo = (titulo: string) => caixa(screen.getByTitle(titulo).closest('div.min-w-0'));
const campoDe = (titulo: string) => comoInput(within(blocoPorTitulo(titulo)).getByRole('textbox'));
const digitarESair = (input: HTMLInputElement, texto: string) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: texto } });
  fireEvent.blur(input);
};

describe('a conta nos campos do realizado do boitel', () => {
  it('Cabeças abatidas: "100+9" = 109 (0 casas); o balão mostra o resultado enquanto digita', () => {
    const onChangeRealizado = montar({ ...PROJETADO, ...FATOS, qtdAbatida: undefined });
    const cab = campoDe('Cabeças efetivamente abatidas — do papel do frigorífico');
    fireEvent.focus(cab);
    fireEvent.change(cab, { target: { value: '100+9' } });
    expect(within(blocoPorTitulo('Cabeças efetivamente abatidas — do papel do frigorífico')).getByTestId('conta-do-campo').textContent).toBe('= 109');
    fireEvent.blur(cab);
    expect(cab.value).toBe('109');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChangeRealizado.mock.calls[0][0]).toMatchObject({ qtdAbatida: 109 });
  });

  it('Arrobas na média (@/cab, 5 casas): "2251,67/109" = 20,65752 @/cab, e o total que desce é 2.251,67', () => {
    const onChangeRealizado = montar({ ...PROJETADO, ...FATOS, arrobasTotaisAbate: undefined });
    const titulo = 'Arrobas do abate (@) — do papel do frigorífico';
    fireEvent.click(within(blocoPorTitulo(titulo)).getByRole('button', { name: '@/cab' }));
    const media = campoDe(titulo);
    digitarESair(media, '2251,67/109');
    expect(media.value).toBe('20,65752');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChangeRealizado.mock.calls[0][0]).toMatchObject({ arrobasTotaisAbate: 2251.67 });
  });

  it('P89 — Diárias na média (R$/cab/dia, 5 casas) é o CampoMoeda: "R$" dentro, e "214590,48/11336" = 18,93 (o piso de 2 casas do A19; o teto é 5)', () => {
    const onChangeRealizado = montar({ ...PROJETADO, ...FATOS, valorTotalDiarias: undefined });
    const titulo = 'Valor total das diárias (R$) — do papel do acerto';
    fireEvent.click(within(blocoPorTitulo(titulo)).getByRole('button', { name: '/cab/dia' }));
    expect(within(blocoPorTitulo(titulo)).getByTestId('prefixo-rs')).toBeTruthy();
    const media = campoDe(titulo);
    digitarESair(media, '214590,48/11336');
    expect(media.value).toBe('18,93');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChangeRealizado.mock.calls[0][0]).toMatchObject({ valorTotalDiarias: 214590.48 });
  });

  it('Peso vivo na média (kg/cab): sem conta, 569,5 kg/cab × 109 desce como total a 2 casas; o campo escreve sem zeros inventados (A19)', () => {
    const onChangeRealizado = montar({ ...PROJETADO, ...FATOS, pesoVivoTotalAbate: undefined });
    const titulo = 'Peso vivo na balança — do papel do frigorífico';
    fireEvent.click(within(blocoPorTitulo(titulo)).getByRole('button', { name: 'kg/cab' }));
    const media = campoDe(titulo);
    digitarESair(media, '569,5');
    expect(media.value).toBe('569,50');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChangeRealizado.mock.calls[0][0]).toMatchObject({ pesoVivoTotalAbate: 62075.5 });
  });
});
