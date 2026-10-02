/**
 * PR-CONC-MESA-TRANSFERENCIA-VOLTA — o "É transferência para/de outra conta…" volta à Mesa compacta, no "⋯" do cabeçalho,
 * e abre um Dialog que desenha o MESMO nó que a aba monta (`actions.slotTransferencia`).
 *
 * ⚠ O NÓ AQUI É UM MARCADOR (`no-transferencia`) DE PROPÓSITO: o que se prova é que o Dialog desenha o nó RECEBIDO, sem
 *   cópia nem componente novo. O componente real (`AcaoEhTransferencia`) e a simulação vão na prova da tela.
 * ⚠ O jsdom NÃO MEDE: o layout fixo se prova pelo contrato (o rodapé e a tabela de campos idênticos com o Dialog aberto).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import { toRowVM } from '@/v2/lib/mesa/enriquecimentoView';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { EnriquecimentoMesaModal } from '@/v2/components/mesa/enriquecimento/EnriquecimentoMesaModal';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

/* "SEGURO PRESTAMISTA" −47,50 (Sicredi Pessoal, 15/09) — uma saída casada, o caso do Gabriel */
const saida = toRowVM(linhaCrua({ staging_id: 's-1', lanc_id: 'l-1', excel_valor: 47.5, lanc_valor: 47.5, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', excel_fornecedor: 'SEGURO PRESTAMISTA' }), [], {});
const entrada = toRowVM(linhaCrua({ staging_id: 's-2', lanc_id: 'l-2', excel_valor: 100, lanc_valor: 100, lanc_sinal: '1',
  lanc_tipo_operacao: '1-Entradas', excel_fornecedor: 'APLICACAO' }), [], {});
const acoes = (slot: React.ReactNode) => ({
  posicao: '1 / 2', onAnterior: vi.fn(), onProximo: vi.fn(), canAnterior: false, canProximo: true,
  revisado: false, onRevisado: vi.fn(), onSalvar: vi.fn(), onSalvarProximo: vi.fn(), onReverter: vi.fn(),
  onAplicarTodos: vi.fn(), nAplicaveis: 0, slotTransferencia: slot,
});
const NO = <div data-testid="no-transferencia">o nó da aba</div>;
const AO_FORN = { previa: null, aplicando: false, onAplicar: vi.fn() };

type Props = Parameters<typeof EnriquecimentoMesaModal>[0];
const montar = (row: typeof saida, slot: React.ReactNode, aoFornecedor?: Props['aoFornecedor']) => render(
  <EnriquecimentoMesaModal open onOpenChange={vi.fn()} sessaoLabel="Imp 03"
    lista={{ rows: [saida, entrada], selecionadoId: row.id, onSelecionar: vi.fn() }} detalhe={{ row }}
    actions={acoes(slot)} baldePorId={new Map()} aoFornecedor={aoFornecedor} />);
const abrirMenu = () => {
  const gatilho = screen.getByTestId('menu-linha-mesa');
  fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.keyDown(gatilho, { key: 'Enter' });
};

describe('"É transferência…" no "⋯" da Mesa', () => {
  it('com o slot: o "⋯" existe, tem o item da SAÍDA, e o item abre o Dialog com o MESMO nó', () => {
    montar(saida, NO);
    expect(screen.queryByTestId('dialog-transferencia')).not.toBeInTheDocument();
    abrirMenu();
    const item = screen.getByTestId('abrir-transferencia');
    expect(item).toHaveTextContent('É transferência para outra conta…');
    expect(screen.queryByTestId('aplicar-ao-fornecedor')).not.toBeInTheDocument();
    fireEvent.click(item);
    const dlg = screen.getByTestId('dialog-transferencia');
    expect(within(dlg).getByTestId('no-transferencia')).toHaveTextContent('o nó da aba');
    expect(dlg).toHaveTextContent('Transferência · SEGURO PRESTAMISTA ·');
  });

  it('na ENTRADA o item diz "de outra conta…"', () => {
    montar(entrada, NO);
    abrirMenu();
    expect(screen.getByTestId('abrir-transferencia')).toHaveTextContent('É transferência de outra conta…');
  });

  it('sem o slot e sem "Ao fornecedor": não há "⋯"; com os dois: os dois itens', () => {
    const { unmount } = montar(saida, null);
    expect(screen.queryByTestId('menu-linha-mesa')).not.toBeInTheDocument();
    unmount();
    montar(saida, NO, AO_FORN);
    abrirMenu();
    expect(screen.getByTestId('abrir-transferencia')).toBeInTheDocument();
    expect(screen.getByTestId('aplicar-ao-fornecedor')).toBeInTheDocument();
  });

  it('só "Ao fornecedor" (sem slot): o "⋯" continua, sem o item da transferência', () => {
    montar(saida, null, AO_FORN);
    abrirMenu();
    expect(screen.getByTestId('aplicar-ao-fornecedor')).toBeInTheDocument();
    expect(screen.queryByTestId('abrir-transferencia')).not.toBeInTheDocument();
  });

  it('o slot some (sucesso: a linha virou transferência) e o Dialog fecha; trocar de linha também fecha', () => {
    const { rerender } = montar(saida, NO);
    abrirMenu();
    fireEvent.click(screen.getByTestId('abrir-transferencia'));
    expect(screen.getByTestId('dialog-transferencia')).toBeInTheDocument();
    const props = (row: typeof saida, slot: React.ReactNode) => (
      <EnriquecimentoMesaModal open onOpenChange={vi.fn()} sessaoLabel="Imp 03"
        lista={{ rows: [saida, entrada], selecionadoId: row.id, onSelecionar: vi.fn() }} detalhe={{ row }}
        actions={acoes(slot)} baldePorId={new Map()} />);
    rerender(props(saida, null));
    expect(screen.queryByTestId('dialog-transferencia')).not.toBeInTheDocument();
    /* de volta com o slot, abre de novo — e trocar de linha fecha */
    rerender(props(saida, NO));
    abrirMenu();
    fireEvent.click(screen.getByTestId('abrir-transferencia'));
    expect(screen.getByTestId('dialog-transferencia')).toBeInTheDocument();
    rerender(props(entrada, NO));
    expect(screen.queryByTestId('dialog-transferencia')).not.toBeInTheDocument();
  });

  it('layout fixo: o rodapé e a tabela de campos são os MESMOS com o Dialog fechado e aberto', () => {
    montar(saida, NO);
    const painel = () => screen.getByTestId('cabecalho-painel').parentElement;
    const rodape = screen.getByTestId('rodape-mesa');
    const antes = { rodape: rodape.className, campos: painel()?.querySelector('table')?.outerHTML ?? '' };
    expect(antes.campos).not.toBe('');
    abrirMenu();
    fireEvent.click(screen.getByTestId('abrir-transferencia'));
    expect(screen.getByTestId('dialog-transferencia')).toBeInTheDocument();
    expect(screen.getByTestId('rodape-mesa').className).toBe(antes.rodape);
    expect(screen.getByTestId('rodape-mesa').className).toMatch(/\bh-8\b/);
    expect(painel()?.querySelector('table')?.outerHTML).toBe(antes.campos);
    /* o Dialog mora num portal, fora do painel da Mesa */
    expect(painel()?.contains(screen.getByTestId('dialog-transferencia'))).toBe(false);
  });
});
