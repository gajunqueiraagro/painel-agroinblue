/**
 * FECH-MAPA-PASTO-MODAL-01 + FECH-PASTO-SALVAR-TRANSACAO-01 — o modal do pasto (o MESMO do Fechamento Área) aberto pelo Mapa:
 * clicar no nome abre o pasto certo; sem card, cria; nome vazio / repetido recusado; o salvar e o reabrir vao SO' pelas duas RPCs
 * do card (nunca os hooks antigos) e a recusa fica escrita no rodape; altura fixa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { motivoDoNomeDoPasto, FRASE_NOME_VAZIO, FRASE_NOME_REPETIDO } from '@/lib/pastos/nomeDoPasto';
import { toast } from 'sonner';

/* ── bancos de mentira ── */
const salvarCard = vi.fn(async (_id: string, _campos: unknown, _itens: unknown) => ({ ok: true, erro: null as string | null }));
const reabrirCard = vi.fn(async (_id: string, _motivo: string) => ({ ok: true, erro: null as string | null }));
const fech = {
  fechamentos: [] as unknown[], loadFechamentos: vi.fn(), loadItens: vi.fn(async () => []), setPesoAtualizadoPasto: vi.fn(),
  criarFechamento: vi.fn(async (pastoId: string, anoMes: string) => ({ id: 'novo', pasto_id: pastoId, ano_mes: anoMes, status: 'rascunho', tipo_uso_mes: 'cria', lote_mes: null, qualidade_mes: null, observacao_mes: null })),
  salvarItens: vi.fn(async () => true), fecharPasto: vi.fn(), copiarMesAnterior: vi.fn(),
  salvarCardDoPasto: salvarCard, reabrirCardDoPasto: reabrirCard,
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
/* FECH-P2-TRAVA-AVISO-01 — só a leitura das duas marcas é de mentira; as frases e a regra são as de verdade */
const { estadoP2, lerEstadoDoP2 } = vi.hoisted(() => {
  const estadoP2 = { travado: false, revalidar: false };
  return { estadoP2, lerEstadoDoP2: vi.fn(async (_faz: string, _mes: string) => ({ ok: true as const, valor: { ...estadoP2 } })) };
});
vi.mock('@/lib/fechamento/travaDoP2', async (original) => ({ ...(await original<typeof import('@/lib/fechamento/travaDoP2')>()), lerEstadoDoP2 }));

import { MapaPastosTab } from '@/pages/MapaPastosTab';
import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';

const comQc = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const FECH_P2 = { id: 'fp2', pasto_id: 'p2', fazenda_id: 'f', ano_mes: '2026-09', status: 'rascunho', tipo_uso_mes: 'recria', lote_mes: null, qualidade_mes: null, observacao_mes: null };

function abrirDialogo(fechamento: Record<string, unknown> = FECH_P2, onOpenChange = vi.fn(), onReabrirValorRebanho?: () => void) {
  comQc(<FechamentoPastoDialog open onOpenChange={onOpenChange} pasto={PASTOS[1] as never} fechamento={fechamento as never}
    categorias={CATS as never} onFechar={vi.fn()} onCopiar={vi.fn()} pastosDaFazenda={PASTOS as never} onRenomear={editarPasto}
    onReabrirValorRebanho={onReabrirValorRebanho} />);
  return onOpenChange;
}
const FRASE_DO_BANCO = 'Mês 2026-09 possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.';
const FRASE_DA_TELA = 'O Valor do Rebanho de set/26 está validado. Reabra-o para editar os pastos deste mês.';

beforeEach(() => {
  vi.clearAllMocks();
  fech.fechamentos = [];
  salvarCard.mockImplementation(async () => ({ ok: true, erro: null }));
  reabrirCard.mockImplementation(async () => ({ ok: true, erro: null }));
  estadoP2.travado = false; estadoP2.revalidar = false;
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

  it('nome novo grava pelo editarPasto, depois o card pela RPC (campos + itens numa chamada)', async () => {
    const fechar = abrirDialogo();
    fireEvent.change(screen.getByTestId('nome-do-pasto'), { target: { value: 'Retiro Novo' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(salvarCard).toHaveBeenCalled());
    expect(editarPasto.mock.calls[0][0]).toBe('Retiro Novo');
    expect(editarPasto.mock.invocationCallOrder[0]).toBeLessThan(salvarCard.mock.invocationCallOrder[0]);
    expect(salvarCard.mock.calls[0][0]).toBe('fp2');
    expect(salvarCard.mock.calls[0][1]).toEqual({ lote_mes: null, tipo_uso_mes: 'recria', qualidade_mes: null, observacao_mes: null });
    expect(fech.salvarItens).not.toHaveBeenCalled();
    await waitFor(() => expect(fechar).toHaveBeenCalledWith(false));
  });

  it('recusa da RPC (P2 validado) vira a linha da trava, com a frase inteira; o rodape fica limpo e o modal nao fecha', async () => {
    salvarCard.mockImplementation(async () => ({ ok: false, erro: FRASE_DO_BANCO }));
    const fechar = abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(screen.getByTestId('frase-da-trava-do-p2').textContent).toBe(FRASE_DA_TELA));
    expect(screen.getByTestId('erro-do-pasto').textContent).toBe('');
    expect(fechar).not.toHaveBeenCalledWith(false);
  });

  it('erro que NAO e a trava do P2 segue no rodape (sem a linha da trava)', async () => {
    salvarCard.mockImplementation(async () => ({ ok: false, erro: 'Card fechado não se salva.' }));
    abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(screen.getByTestId('erro-do-pasto').textContent).toBe('Card fechado não se salva.'));
    expect(screen.queryByTestId('trava-do-p2')).toBeNull();
  });

  it('mes travado: a linha aparece ao ABRIR (antes de digitar), Salvar desabilitado com o porque, e o botao leva ao Valor do Rebanho', async () => {
    estadoP2.travado = true;
    const ir = vi.fn();
    abrirDialogo(FECH_P2, vi.fn(), ir);
    expect((await screen.findByTestId('frase-da-trava-do-p2')).textContent).toBe(FRASE_DA_TELA);
    expect(lerEstadoDoP2).toHaveBeenCalledWith('f', '2026-09');
    const salvar = screen.getByRole('button', { name: /Salvar/ });
    expect(salvar).toHaveProperty('disabled', true);
    expect(salvar.getAttribute('title')).toBe(FRASE_DA_TELA);
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir Valor do Rebanho de set/26' }));
    expect(ir).toHaveBeenCalledTimes(1);
  });

  it('sem a ida (host sem callback) a trava se explica, sem botao', async () => {
    estadoP2.travado = true;
    abrirDialogo();
    await screen.findByTestId('trava-do-p2');
    expect(screen.queryByTestId('reabrir-valor-rebanho')).toBeNull();
  });

  it('mes livre: nada da trava; salvar com o Valor do Rebanho reaberto lembra de revalidar (aviso, nada reabre sozinho)', async () => {
    estadoP2.revalidar = true;
    abrirDialogo();
    await waitFor(() => expect(lerEstadoDoP2).toHaveBeenCalled());
    expect(screen.queryByTestId('trava-do-p2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Revalide o Valor do Rebanho de set/26 (o peso mudou).'));
  });

  it('mes nunca validado: salvar nao lembra de nada', async () => {
    abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Fechamento salvo'));
    await waitFor(() => expect(lerEstadoDoP2).toHaveBeenCalledTimes(2));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('"Reabrir pasto" chama a RPC do card com o motivo', async () => {
    abrirDialogo({ ...FECH_P2, status: 'fechado' });
    fireEvent.click(screen.getByRole('button', { name: /Reabrir pasto/ }));
    await waitFor(() => expect(reabrirCard).toHaveBeenCalledWith('fp2', 'Reabertura individual via modal de pasto'));
    await screen.findByRole('button', { name: /Salvar/ });
  });

  it('recusa do reabrir (P2) fica escrita e o card segue fechado', async () => {
    reabrirCard.mockImplementation(async () => ({ ok: false, erro: 'Mês 2026-09 possui Valor do Rebanho validado ou P2 fechado.' }));
    abrirDialogo({ ...FECH_P2, status: 'fechado' });
    fireEvent.click(screen.getByRole('button', { name: /Reabrir pasto/ }));
    await waitFor(() => expect(screen.getByTestId('frase-da-trava-do-p2').textContent).toBe(FRASE_DA_TELA));
    expect(screen.getByRole('button', { name: /Reabrir pasto/ })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull();
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

describe('o modal grava so pelas RPCs do card (fonte)', () => {
  it('nem o modal nem as telas que o montam chamam os escritores antigos', () => {
    const dialogo = readFileSync('src/components/FechamentoPastoDialog.tsx', 'utf8');
    expect(dialogo).toMatch(/salvarCardDoPasto\(/);
    expect(dialogo).toMatch(/reabrirCardDoPasto\(/);
    for (const proibido of ['atualizarCamposMensais', 'salvarItens', 'reabrirPasto', 'reabrir_pilar_fechamento', ".from('fechamento_pasto"]) {
      expect(dialogo).not.toContain(proibido);
    }
    for (const arq of ['src/pages/FechamentoTab.tsx', 'src/pages/MapaPastosTab.tsx']) {
      const src = readFileSync(arq, 'utf8');
      const i = src.indexOf('<FechamentoPastoDialog');
      expect(src.slice(i, src.indexOf('/>', i))).not.toMatch(/onSave=|onReabrir=/);
    }
    const hook = readFileSync('src/hooks/useFechamento.ts', 'utf8');
    expect(hook).not.toMatch(/const (reabrirPasto|atualizarCamposMensais) =/);
    /* auto-teste do detector */
    expect('<FechamentoPastoDialog onSave={x} />').toMatch(/onSave=|onReabrir=/);
  });
});
