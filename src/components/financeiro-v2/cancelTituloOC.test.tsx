/**
 * FIN-V2-CANCEL-MOTIVO-01 — as duas pontas de tela da frente:
 *  (2) o rodape do lancamento troca "Cancelar lancamento" pelo aviso + "Abrir OC" quando ha' parte
 *      viva de OC (o caminho e' o Desfazer compromisso);
 *  (b) o "Atualizar compromisso" vem com o motivo da reabertura da sessao (venda/abate), EDITAVEL e
 *      marcado em ambar enquanto for sugestao; a compra (sem motivo) segue com o campo vazio.
 * ⚠ O caso real do (b): OC 2b44889d (Agnaldo, abate), reabriu com "ajuste valor" e 2 minutos depois
 *   reprogramou com "valor ajustado" — duas perguntas, dois registros. A sugestao nao funde nada.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RodapeCancelamento } from '@/components/financeiro-v2/RodapeCancelamento';
import { DialogoAtualizarCompromisso } from '@/components/compra/DialogoAtualizarCompromisso';
import { MOTIVO_BLOQUEIO_TITULO_OC, MOTIVO_BLOQUEIO_REBANHO } from '@/lib/financeiro/cancelamentoLancamento';
import type { ReprogramarCompromissoApi, ResultadoReprogramacao, SimulacaoReprogramacao } from '@/hooks/useReprogramarCompromissoLote';

describe('rodape do lancamento', () => {
  it('titulo de OC: aviso e "Abrir OC" no lugar do botao', () => {
    const onAbrirOC = vi.fn();
    const onCancelar = vi.fn();
    render(<RodapeCancelamento tituloOC={{ operacaoId: '7f7de76f', tipo: 'venda' }} bloqueioRebanho={false}
      onCancelar={onCancelar} onAbrirOC={onAbrirOC} />);
    expect(screen.getByTestId('cancelar-titulo-oc').textContent).toContain(MOTIVO_BLOQUEIO_TITULO_OC);
    expect(screen.queryByText('Cancelar lançamento')).toBeNull();
    fireEvent.click(screen.getByText('Abrir OC →'));
    expect(onAbrirOC).toHaveBeenCalledWith('7f7de76f', 'venda');
  });

  it('a OC vence o rebanho; sem OC, o rebanho segue com a frase dele; sem nada, o botao', () => {
    const { rerender } = render(<RodapeCancelamento tituloOC={{ operacaoId: 'x', tipo: null }} bloqueioRebanho
      onCancelar={vi.fn()} onAbrirOC={vi.fn()} />);
    expect(screen.queryByText(MOTIVO_BLOQUEIO_REBANHO)).toBeNull();
    rerender(<RodapeCancelamento tituloOC={null} bloqueioRebanho onCancelar={vi.fn()} onAbrirOC={vi.fn()} />);
    expect(screen.getByText(MOTIVO_BLOQUEIO_REBANHO)).toBeTruthy();
    const onCancelar = vi.fn();
    rerender(<RodapeCancelamento tituloOC={null} bloqueioRebanho={false} onCancelar={onCancelar} onAbrirOC={vi.fn()} />);
    fireEvent.click(screen.getByText('Cancelar lançamento'));
    expect(onCancelar).toHaveBeenCalled();
  });
});

function apiFalsa() {
  const reprogramar = vi.fn(async (): Promise<ResultadoReprogramacao | null> => (
    { operacaoVersao: 9, valorAntigo: 487028.79, valorNovo: 490000, nadaAFazer: false }
  ));
  const api: ReprogramarCompromissoApi = {
    simulando: false,
    reprogramando: false,
    simular: async (): Promise<SimulacaoReprogramacao | null> => (
      { ok: true, rol: [], bloqueios: [], valorAntigo: 487028.79, valorNovo: 490000 }
    ),
    reprogramar,
  };
  return { api, reprogramar };
}
/* Sem cast: o elemento e' conferido, nao afirmado. */
function valorDe(el: Element): string {
  if (!(el instanceof HTMLTextAreaElement)) throw new Error('campo de motivo nao e textarea');
  return el.value;
}

describe('Atualizar compromisso depois de reabrir', () => {
  it('venda/abate: vem com o motivo da reabertura, em ambar; editar tira a marca; grava o que esta no campo', async () => {
    const { api, reprogramar } = apiFalsa();
    render(<DialogoAtualizarCompromisso api={api} loteId="lote" rotulo="Bois · 72 cab" versao={8}
      onFechar={vi.fn()} onAtualizado={vi.fn()} motivoReabertura="ajuste valor" />);
    const campo = await screen.findByTestId('motivo-atualizar');
    expect(valorDe(campo)).toBe('ajuste valor');
    expect(campo.className).toMatch(/amber/);
    expect(screen.getByTestId('motivo-sugerido').textContent).toMatch(/motivo da reabertura/);
    /* Nada grava sozinho. */
    expect(reprogramar).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: 'valor ajustado' } });
    expect(screen.queryByTestId('motivo-sugerido')).toBeNull();
    expect(campo.className).not.toMatch(/amber/);
    fireEvent.click(screen.getByText('Atualizar compromisso', { selector: 'button' }));
    await waitFor(() => expect(reprogramar).toHaveBeenCalledWith('lote', 8, 'valor ajustado'));
  });

  it('compra (sem motivo da reabertura): campo vazio, sem marca — como sempre', async () => {
    render(<DialogoAtualizarCompromisso api={apiFalsa().api} loteId="lote" rotulo="Bois · 72 cab" versao={8}
      onFechar={vi.fn()} onAtualizado={vi.fn()} />);
    const campo = await screen.findByTestId('motivo-atualizar');
    expect(valorDe(campo)).toBe('');
    expect(screen.queryByTestId('motivo-sugerido')).toBeNull();
  });
});
