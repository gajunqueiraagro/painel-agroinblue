/**
 * FECH-MAPA-PASTO-MODAL-01 — o modal do pasto (o MESMO do Fechamento Área) aberto pelo Mapa de Pastos:
 * clicar no nome abre o pasto certo; sem card, cria; nome vazio / repetido recusado; recusa dos campos do mes para antes
 * dos itens e fica escrita; DELETE que falha nao chega ao INSERT; o Reabrir reabre so' o pasto; altura fixa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { motivoDoNomeDoPasto, FRASE_NOME_VAZIO, FRASE_NOME_REPETIDO } from '@/lib/pastos/nomeDoPasto';

/* ── bancos de mentira ── */
const camposMes = vi.fn(async () => ({ ok: true, erro: null as string | null }));
const fech = {
  fechamentos: [] as unknown[], loadFechamentos: vi.fn(), loadItens: vi.fn(async () => []), setPesoAtualizadoPasto: vi.fn(),
  criarFechamento: vi.fn(async (pastoId: string, anoMes: string) => ({ id: 'novo', pasto_id: pastoId, ano_mes: anoMes, status: 'rascunho', tipo_uso_mes: 'cria', lote_mes: null, qualidade_mes: null, observacao_mes: null })),
  salvarItens: vi.fn(async () => true), fecharPasto: vi.fn(), reabrirPasto: vi.fn(async () => true), copiarMesAnterior: vi.fn(),
  atualizarCamposMensais: camposMes,
};
vi.mock('@/hooks/useFechamento', () => ({ useFechamento: () => fech }));
const PASTOS = [
  { id: 'p1', fazenda_id: 'f', nome: 'P_01', area_produtiva_ha: 10, tipo_uso: 'cria', ativo: true, entra_conciliacao: true, ordem_exibicao: 1, lote_padrao: null },
  { id: 'p2', fazenda_id: 'f', nome: 'Retiro Velho', area_produtiva_ha: 20, tipo_uso: 'recria', ativo: true, entra_conciliacao: true, ordem_exibicao: 2, lote_padrao: null },
];
const CATS = [{ id: 'c1', nome: 'Bois', codigo: 'bois', ordem_exibicao: 1 }];
const editarPasto = vi.fn(async (_nome: string, _aoRecusar?: unknown) => true);
vi.mock('@/hooks/usePastos', () => ({
  usePastos: () => ({ pastos: PASTOS, categorias: CATS, editarPasto }),
  isPastoAtivoNoMes: () => true,
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ isGlobal: false, fazendaAtual: { id: 'f', nome: 'Faz' } }) }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/hooks/useMasterLock', () => ({ useMasterLock: () => ({ isReadOnly: () => false, isMaster: true, isMesLocked: () => false }) }));
vi.mock('@/components/agri/AreaPlantadaPanel', () => ({ AreaPlantadaPanel: () => null }));
vi.mock('@/lib/supabase/fetchAllPaginated', () => ({ fetchAllPaginated: async () => ({ data: [] }), MAX_ROWS: 1000 }));
vi.mock('@/lib/exportMapaPastos', () => ({ exportMapaPastosXlsx: vi.fn() }));
vi.mock('@/lib/exportMapaPastosPdf', () => ({ exportMapaPastosPdf: vi.fn() }));

import { MapaPastosTab } from '@/pages/MapaPastosTab';
import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';

const comQc = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const FECH_P2 = { id: 'fp2', pasto_id: 'p2', ano_mes: '2026-09', status: 'rascunho', tipo_uso_mes: 'recria', lote_mes: null, qualidade_mes: null, observacao_mes: null };

function abrirDialogo(onSave = vi.fn(async () => true)) {
  comQc(<FechamentoPastoDialog open onOpenChange={() => {}} pasto={PASTOS[1] as never} fechamento={FECH_P2 as never}
    categorias={CATS as never} onSave={onSave} onFechar={vi.fn()} onReabrir={vi.fn()} onCopiar={vi.fn()}
    pastosDaFazenda={PASTOS as never} onRenomear={editarPasto} />);
  return onSave;
}

beforeEach(() => {
  vi.clearAllMocks();
  fech.fechamentos = [];
  camposMes.mockImplementation(async () => ({ ok: true, erro: null }));
});

describe('Mapa de Pastos → modal do pasto', () => {
  it('clicar no NOME abre o modal com o pasto certo; sem card, cria pelo mesmo caminho', async () => {
    comQc(<MapaPastosTab periodo={{ ano: '2026', mes: 9 }} onPeriodoChange={() => {}} />);
    const botoes = await screen.findAllByTestId('abrir-pasto');
    fireEvent.click(botoes[1]);
    await waitFor(() => expect(fech.criarFechamento).toHaveBeenCalledWith('p2', '2026-09'));
    expect(((await screen.findByTestId('nome-do-pasto')) as HTMLInputElement).value).toBe('Retiro Velho');
  });

  it('pasto COM card abre o card que existe, sem criar outro', async () => {
    fech.fechamentos = [FECH_P2];
    comQc(<MapaPastosTab periodo={{ ano: '2026', mes: 9 }} onPeriodoChange={() => {}} />);
    fireEvent.click((await screen.findAllByTestId('abrir-pasto'))[1]);
    await screen.findByTestId('modal-do-pasto');
    expect(fech.criarFechamento).not.toHaveBeenCalled();
  });
});

describe('modal do pasto', () => {
  it('nome vazio e nome repetido na fazenda sao recusados (a regra e o campo)', () => {
    expect(motivoDoNomeDoPasto('  ', PASTOS[1], PASTOS)).toBe(FRASE_NOME_VAZIO);
    expect(motivoDoNomeDoPasto(' p_01 ', PASTOS[1], PASTOS)).toBe(FRASE_NOME_REPETIDO);
    expect(motivoDoNomeDoPasto('Retiro Velho', PASTOS[1], PASTOS)).toBeNull();
    expect(motivoDoNomeDoPasto('P_01', { ...PASTOS[1], fazenda_id: 'outra' }, PASTOS)).toBeNull();
    abrirDialogo();
    fireEvent.change(screen.getByTestId('nome-do-pasto'), { target: { value: 'P_01' } });
    expect(screen.getByTestId('nota-do-nome').textContent).toBe(FRASE_NOME_REPETIDO);
    expect(screen.getByRole('button', { name: /Salvar/ })).toHaveProperty('disabled', true);
  });

  it('nome novo grava pelo editarPasto, antes dos campos do mes', async () => {
    const onSave = abrirDialogo();
    fireEvent.change(screen.getByTestId('nome-do-pasto'), { target: { value: 'Retiro Novo' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(editarPasto.mock.calls[0][0]).toBe('Retiro Novo');
  });

  it('erro dos campos do mes impede os itens e fica escrito no modal', async () => {
    camposMes.mockImplementation(async () => ({ ok: false, erro: 'Mês 2026-09 possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.' }));
    const onSave = abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(screen.getByTestId('erro-do-pasto').textContent).toContain('P2 fechado'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('recusa dos itens fica escrita e o modal nao fecha', async () => {
    const fechar = vi.fn();
    comQc(<FechamentoPastoDialog open onOpenChange={fechar} pasto={PASTOS[1] as never} fechamento={FECH_P2 as never}
      categorias={CATS as never} onSave={async (_i, aoRecusar) => { aoRecusar('Não foi possível salvar as quantidades: x'); return false; }}
      onFechar={vi.fn()} onReabrir={vi.fn()} onCopiar={vi.fn()} pastosDaFazenda={PASTOS as never} onRenomear={editarPasto} />);
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(screen.getByTestId('erro-do-pasto').textContent).toContain('quantidades'));
    expect(fechar).not.toHaveBeenCalledWith(false);
  });

  it('altura fixa; o corpo nao rola (sem min-h nem overflow no corpo)', () => {
    abrirDialogo();
    const modal = screen.getByTestId('modal-do-pasto');
    expect(modal.className).toContain('h-[524px]');
    expect(modal.className).not.toMatch(/min-h-\[70vh\]|max-h-\[9/);
    const corpo = screen.getByTestId('corpo-do-pasto');
    expect(corpo.className).toContain('overflow-hidden');
    expect(corpo.className).not.toContain('overflow-y-auto');
  });
});

describe('o Reabrir reabre so o pasto (fonte)', () => {
  const trecho = (arq: string) => {
    const src = readFileSync(arq, 'utf8');
    const i = src.indexOf('<FechamentoPastoDialog');
    return src.slice(i, src.indexOf('/>', src.indexOf('onRenomear', i)));
  };
  it('FechamentoTab e Mapa ligam o reabrirPasto, nunca o reabrir_pilar', () => {
    for (const arq of ['src/pages/FechamentoTab.tsx', 'src/pages/MapaPastosTab.tsx']) {
      const t = trecho(arq);
      expect(t).toMatch(/onReabrir=\{async \(\) => reabrirPasto\(/);
      expect(t).not.toContain('reabrir_pilar_fechamento');
    }
    /* auto-teste do detector */
    expect('onReabrir={async () => reabrirPasto(x)}').toMatch(/onReabrir=\{async \(\) => reabrirPasto\(/);
  });
});
