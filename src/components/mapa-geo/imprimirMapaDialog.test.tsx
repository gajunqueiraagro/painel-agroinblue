/**
 * MAPA-IMPRESSAO-01 — o diálogo "Imprimir mapa": sem a chave Esri a opção do satélite NÃO aparece (o motivo numa linha); com a chave ela
 * aparece e o padrão continua "Sem satélite" (até a resposta da Esri sobre a licença, Gabriel 03/11);
 * "Baixar PDF" chama o gerador com o tamanho e a imagem escolhidos; a recusa aparece no diálogo (nunca toast).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ImprimirMapaDialog, MOTIVO_SEM_CHAVE_NO_DIALOGO, mesPorExtenso } from './ImprimirMapaDialog';

const ok = { arquivo: 'mapa_pureza_A3_2026-10.pdf', comImagem: false, motivoSemImagem: null };

function abre(aoGerar = vi.fn().mockResolvedValue(ok), temChave = false) {
  render(<ImprimirMapaDialog open onOpenChange={() => undefined} anoMes="2026-10" aoGerar={aoGerar} temChave={temChave} />);
  return aoGerar;
}
const botao = (el: HTMLElement, nome: string) => within(el).getByRole('button', { name: nome });

describe('ImprimirMapaDialog', () => {
  it('o mês é o do Gestor, em mmm/aaaa minúsculo', () => {
    expect(mesPorExtenso('2026-10')).toBe('out/2026');
    abre();
    expect(screen.getByTestId('imprimir-mes').textContent).toBe('out/2026');
  });

  it('sem a chave Esri: a opção do satélite não aparece, o motivo está escrito e o PDF sai sem satélite', async () => {
    const aoGerar = abre();
    const imagem = screen.getByTestId('imprimir-imagem');
    expect(within(imagem).queryByRole('button', { name: 'Satélite Esri' })).toBeNull();
    expect(botao(imagem, 'Sem satélite')).toBeTruthy();
    expect(screen.getByTestId('imprimir-motivo-chave').textContent).toBe(MOTIVO_SEM_CHAVE_NO_DIALOGO);
    fireEvent.click(screen.getByTestId('imprimir-baixar'));
    await waitFor(() => expect(aoGerar).toHaveBeenCalledTimes(1));
    expect(aoGerar).toHaveBeenCalledWith({ tamanho: 'A3', querImagem: false });
  });

  it('com a chave: a opção aparece, o padrão é "Sem satélite" e escolher o Esri pede a imagem', async () => {
    const aoGerar = abre(vi.fn().mockResolvedValue(ok), true);
    const imagem = screen.getByTestId('imprimir-imagem');
    expect(screen.getByTestId('imprimir-motivo-chave').textContent).toBe('');
    fireEvent.click(screen.getByTestId('imprimir-baixar'));
    await waitFor(() => expect(aoGerar).toHaveBeenLastCalledWith({ tamanho: 'A3', querImagem: false }));
    fireEvent.click(botao(imagem, 'Satélite Esri'));
    expect(screen.getByTestId('imprimir-motivo-chave').textContent).toContain('atribuição');
    fireEvent.click(screen.getByTestId('imprimir-baixar'));
    await waitFor(() => expect(aoGerar).toHaveBeenLastCalledWith({ tamanho: 'A3', querImagem: true }));
  });

  it('"Baixar PDF" chama o gerador com o tamanho escolhido e diz o arquivo baixado', async () => {
    const aoGerar = abre();
    fireEvent.click(botao(screen.getByTestId('imprimir-tamanho'), 'A1'));
    fireEvent.click(screen.getByTestId('imprimir-baixar'));
    await waitFor(() => expect(aoGerar).toHaveBeenCalledWith({ tamanho: 'A1', querImagem: false }));
    await waitFor(() => expect(screen.getByTestId('imprimir-mensagem').textContent).toContain('PDF baixado: mapa_pureza_A3_2026-10.pdf'));
  });

  it('a imagem que não veio aparece em âmbar junto do arquivo', async () => {
    abre(vi.fn().mockResolvedValue({ ...ok, motivoSemImagem: 'A imagem de satélite não veio.' }));
    fireEvent.click(screen.getByTestId('imprimir-baixar'));
    const frase = await screen.findByText('A imagem de satélite não veio.');
    expect(frase.className).toContain('amber');
  });

  it('a recusa do gerador aparece no diálogo, em vermelho, e o botão volta', async () => {
    abre(vi.fn().mockRejectedValue(new Error('Esta fazenda não tem nenhum polígono no mapa: não há o que imprimir.')));
    fireEvent.click(screen.getByTestId('imprimir-baixar'));
    const frase = await screen.findByText('Esta fazenda não tem nenhum polígono no mapa: não há o que imprimir.');
    expect(frase.className).toContain('red');
    expect(within(screen.getByTestId('imprimir-mensagem')).getByText(/polígono/)).toBe(frase);
    expect((screen.getByTestId('imprimir-baixar') as HTMLButtonElement).disabled).toBe(false);
  });
});
