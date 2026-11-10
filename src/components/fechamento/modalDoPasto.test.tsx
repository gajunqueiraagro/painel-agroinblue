/**
 * FECH-MAPA-PASTO-MODAL-01 + FECH-PASTO-SALVAR-TRANSACAO-01 — o modal do pasto (o MESMO do Fechamento Área) aberto pelo Mapa:
 * clicar no nome abre o pasto certo; sem card, cria; nome vazio / repetido recusado; o salvar e o reabrir vao SO' pelas duas RPCs
 * do card (nunca os hooks antigos) e a recusa fica escrita no rodape; altura fixa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
/* FECH-PASTO-UNIDADE-01 F2 — o modal lê os piquetes do pasto e o mês anterior; aqui o pasto não tem piquete (nenhuma ida à rede) */
vi.mock('@/lib/fechamento/piquetesDoPasto', async (original) => ({
  ...(await original<typeof import('@/lib/fechamento/piquetesDoPasto')>()),
  lerPiquetesDoPasto: async () => ({ ok: true, valor: { doMes: [], nomes: new Map() } }),
  lerMesAnteriorDoPasto: async (_p: string, mes: string) => ({ ok: true, valor: { anoMes: mes, semCard: true, linhas: [], nomes: new Map() } }),
}));
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
  pastosAtivosNoMes: <T,>(l: T[]) => l,
}));
/* MAPA-LOTES-01 fatia 1 — o Mapa de pastos monta o contexto do lote (`useLoteDoMes`): grupos, lotação, alocações e área do mês, sem rede */
vi.mock('@/components/pastos/GruposDePastejo', () => ({ useGruposDePastejo: () => ({ grupos: [] }) }));
vi.mock('@/lib/fechamento/loteNoGrupo', async (original) => ({
  ...(await original<typeof import('@/lib/fechamento/loteNoGrupo')>()),
  API_LOTE_NO_GRUPO: { lotacaoDoMes: async () => ({ ok: true, dados: new Map() }), alocacoesDoMes: async () => ({ ok: true, dados: [] }) },
}));
vi.mock('@/lib/pastos/areaDoPastoNoMes', async (original) => ({
  ...(await original<typeof import('@/lib/pastos/areaDoPastoNoMes')>()),
  useAreaDosPastosNoMes: () => ({ areaDe: () => undefined, carregando: false, erro: null }),
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
/* FECH-REABRIR-JUNTO-01 — só o rpc do client é de mentira (o resto segue o client de verdade); a leitura dos lotes também passa por ele */
const { rpc, respostaDoReabrir } = vi.hoisted(() => {
  const respostaDoReabrir: { erro: { message: string; code: string } | null; destrava: boolean } = { erro: null, destrava: true };
  const rpc = vi.fn(async (fn: string, _args?: unknown) => {
    if (fn !== 'fn_valor_rebanho_reabrir') return { data: [], error: null };
    if (respostaDoReabrir.erro) return { data: null, error: respostaDoReabrir.erro };
    if (respostaDoReabrir.destrava) { estadoP2.travado = false; estadoP2.revalidar = true; }
    return { data: {}, error: null };
  });
  return { rpc, respostaDoReabrir };
});
vi.mock('@/integrations/supabase/client', async (original) => {
  const m = await original<typeof import('@/integrations/supabase/client')>();
  return { ...m, supabase: new Proxy(m.supabase, { get: (alvo, chave, rec) => (chave === 'rpc' ? rpc : Reflect.get(alvo, chave, rec)) }) };
});
vi.mock('@/lib/fechamento/travaDoP2', async (original) => ({ ...(await original<typeof import('@/lib/fechamento/travaDoP2')>()), lerEstadoDoP2 }));

import { MapaPastosTab } from '@/pages/MapaPastosTab';
import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';

const comQc = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const FECH_P2 = { id: 'fp2', pasto_id: 'p2', fazenda_id: 'f', ano_mes: '2026-09', status: 'rascunho', tipo_uso_mes: 'recria', lote_mes: null, qualidade_mes: null, observacao_mes: null };

function abrirDialogo(fechamento: Record<string, unknown> = FECH_P2, onOpenChange = vi.fn(), pasto: Record<string, unknown> = PASTOS[1]) {
  comQc(<FechamentoPastoDialog open onOpenChange={onOpenChange} pasto={pasto as never} fechamento={fechamento as never}
    categorias={CATS as never} onFechar={vi.fn()} onCopiar={vi.fn()} />);
  return onOpenChange;
}
const FRASE_DO_BANCO = 'Mês 2026-09 possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.';
const FRASE_DO_SALVAR = 'O Valor do Rebanho de set/26 está validado. Reabra-o para editar os pastos deste mês.';

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
    expect((await screen.findByTestId('nome-do-pasto')).textContent).toBe('Retiro Velho');
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
  it('MODAL-PASTO-NOME-FIXO-01: o nome do pasto é só texto (sem campo, sem a nota do cadastro) e a área sai em pt-BR — o P_10 da 3 Muchachas', () => {
    abrirDialogo(FECH_P2, vi.fn(), { ...PASTOS[1], nome: 'P_10', area_produtiva_ha: 59.7 });
    const nome = screen.getByTestId('nome-do-pasto');
    expect(nome.tagName).toBe('H2');
    expect(nome.textContent).toBe('P_10');
    expect(screen.queryByRole('textbox', { name: 'Nome do pasto' })).toBeNull();
    expect(screen.queryByTestId('nota-do-nome')).toBeNull();
    expect(screen.queryByText(/vale para todos os meses/)).toBeNull();
    expect(screen.getByTestId('area-do-pasto').textContent).toBe('59,7 ha');
  });

  it('a regra do nome (a do mapa) segue a mesma: vazio e repetido na fazenda são recusados', () => {
    expect(motivoDoNomeDoPasto('  ', PASTOS[1], PASTOS)).toBe(FRASE_NOME_VAZIO);
    expect(motivoDoNomeDoPasto(' p_01 ', PASTOS[1], PASTOS)).toBe(FRASE_NOME_REPETIDO);
    expect(motivoDoNomeDoPasto('Retiro Velho', PASTOS[1], PASTOS)).toBeNull();
    expect(motivoDoNomeDoPasto('P_01', { ...PASTOS[1], fazenda_id: 'outra' }, PASTOS)).toBeNull();
  });

  it('salvar grava só o card pela RPC (campos + itens numa chamada) — nunca o cadastro do pasto', async () => {
    const fechar = abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(salvarCard).toHaveBeenCalled());
    expect(editarPasto).not.toHaveBeenCalled();
    expect(salvarCard.mock.calls[0][0]).toBe('fp2');
    expect(salvarCard.mock.calls[0][1]).toEqual({ lote_mes: null, tipo_uso_mes: 'recria', qualidade_mes: null, observacao_mes: null });
    expect(fech.salvarItens).not.toHaveBeenCalled();
    await waitFor(() => expect(fechar).toHaveBeenCalledWith(false));
  });

  it('REABRIR-AUTOMATICO-01: o Salvar recusado pela trava (validaram no meio) reabre o Valor do Rebanho sozinho e salva de novo', async () => {
    salvarCard.mockImplementationOnce(async () => ({ ok: false, erro: FRASE_DO_BANCO }));
    const fechar = abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(fechar).toHaveBeenCalledWith(false));
    expect(rpc).toHaveBeenCalledWith('fn_valor_rebanho_reabrir', { p_fazenda_id: 'f', p_ano_mes: '2026-09', p_motivo: 'Reabertura do pasto Retiro Velho' });
    expect(salvarCard).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('Valor do rebanho de set/26 reaberto — valide de novo depois.');
  });

  it('erro que NAO e a trava do P2 segue no rodape (sem a linha da trava)', async () => {
    salvarCard.mockImplementation(async () => ({ ok: false, erro: 'Card fechado não se salva.' }));
    abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(screen.getByTestId('erro-do-pasto').textContent).toBe('Card fechado não se salva.'));
    expect(screen.queryByTestId('trava-do-p2')).toBeNull();
  });

  it('REABRIR-AUTOMATICO-01 — mês travado: NADA de aviso grande, campo de motivo ou botão a mais; o Salvar fica ativo e o title diz o que ele faz', async () => {
    estadoP2.travado = true;
    abrirDialogo();
    await waitFor(() => expect(lerEstadoDoP2).toHaveBeenCalledWith('f', '2026-09'));
    expect(screen.queryByTestId('trava-do-p2')).toBeNull();
    expect(screen.queryByTestId('motivo-reabrir-junto')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reabrir e editar' })).toBeNull();
    const salvar = screen.getByRole('button', { name: /Salvar/ });
    await waitFor(() => expect(salvar.getAttribute('title')).toBe('Valor do rebanho de set/26 reaberto — valide de novo depois.'));
    expect(salvar).toHaveProperty('disabled', false);
  });

  it('mes livre: nada da trava; salvar com o Valor do Rebanho a revalidar NÃO avisa a cada Salvar (FECH-REVALIDAR-AVISO-01: a pendência é da Visão Geral)', async () => {
    estadoP2.revalidar = true;
    abrirDialogo();
    await waitFor(() => expect(lerEstadoDoP2).toHaveBeenCalled());
    expect(screen.queryByTestId('trava-do-p2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Fechamento salvo'));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('mes nunca validado: salvar nao lembra de nada', async () => {
    abrirDialogo();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Fechamento salvo'));
    /* FECH-REVALIDAR-AVISO-01: o Salvar não relê o P2 (só a abertura lê, para a trava) */
    expect(lerEstadoDoP2).toHaveBeenCalledTimes(1);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('"Reabrir pasto" chama a RPC do card com o motivo', async () => {
    abrirDialogo({ ...FECH_P2, status: 'fechado' });
    fireEvent.click(screen.getByRole('button', { name: /Reabrir pasto/ }));
    await waitFor(() => expect(reabrirCard).toHaveBeenCalledWith('fp2', 'Reabertura individual via modal de pasto'));
    await screen.findByRole('button', { name: /Salvar/ });
  });

  it('REABRIR-AUTOMATICO-01: o reabrir recusado pela trava reabre o Valor do Rebanho e tenta UMA vez de novo; recusou de novo = a frase no rodapé', async () => {
    reabrirCard.mockImplementation(async () => ({ ok: false, erro: 'Mês 2026-09 possui Valor do Rebanho validado ou P2 fechado.' }));
    abrirDialogo({ ...FECH_P2, status: 'fechado' });
    fireEvent.click(screen.getByRole('button', { name: /Reabrir pasto/ }));
    await waitFor(() => expect(reabrirCard).toHaveBeenCalledTimes(2));
    expect(rpc).toHaveBeenCalledWith('fn_valor_rebanho_reabrir', expect.objectContaining({ p_motivo: 'Reabertura do pasto Retiro Velho' }));
    await waitFor(() => expect(screen.getByTestId('erro-do-pasto').textContent).toBe('Mês 2026-09 possui Valor do Rebanho validado ou P2 fechado.'));
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

describe('LOTES-05 — "Usar o lote" no Nome no caderno (Baia Grande: "Vacas - CAR_07" → 7.1)', () => {
  const LINHA = { id: 'l1', codigo: 'CRI-VAC-NEL-04', codigos_antigos: [], nome_campeiro: null, situacao: 'ativo', formado_em: '2026-07-01', encerrado_em: null,
    categoria_id: 'cv', raca_id: 'rn', atividade_id: 'ac', numero: 4, carimbo: '7.1', versao: 1, pastos: [], lancamentos: 3 };
  const FECH = { ...FECH_P2, lote_mes: 'Vacas - CAR_07' };
  const rpcDeSempre = rpc.getMockImplementation();
  afterEach(() => { if (rpcDeSempre) rpc.mockImplementation(rpcDeSempre); fech.loadItens.mockImplementation(async () => []); });
  beforeEach(() => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'fn_lotes_da_fazenda' ? [LINHA] : [], error: null }));
    fech.loadItens.mockImplementation(async () => [{ categoria_id: 'c1', quantidade: 40, peso_medio_kg: 420, lote: null, observacoes: null, origem_dado: 'manual', lote_id: 'l1' }] as never);
  });
  it('troca o texto do campeiro pelo carimbo, o "Voltar o texto" devolve; o Salvar leva o texto novo (o antigo fica na trilha do banco)', async () => {
    abrirDialogo(FECH);
    fireEvent.click(await screen.findByTestId('caderno-usar-o-lote'));
    expect(screen.getByPlaceholderText('Lote...')).toHaveValue('7.1');
    fireEvent.click(screen.getByTestId('caderno-voltar-texto'));
    expect(screen.getByPlaceholderText('Lote...')).toHaveValue('Vacas - CAR_07');
    fireEvent.click(screen.getByTestId('caderno-usar-o-lote'));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(salvarCard).toHaveBeenCalled());
    expect(salvarCard.mock.calls[0][1]).toMatchObject({ lote_mes: '7.1' });
  });
  it('o texto já é o lote: o botão some; o campo Lote mostra 7.1 (o código no title); Machos sem caixa alta', async () => {
    abrirDialogo({ ...FECH, lote_mes: '7.1' });
    await waitFor(() => expect(screen.getByTestId('campo-lote-do-pasto').textContent).toBe('7.1'));
    expect(screen.getByTestId('campo-lote-do-pasto').getAttribute('title')).toBe('7.1 · CRI-VAC-NEL-04');
    expect(screen.queryByTestId('caderno-usar-o-lote')).toBeNull();
    expect(screen.getByText('Machos').className).not.toMatch(/uppercase/);
  });
});

/* REABRIR-AUTOMATICO-01 (Gabriel 08/11 08:15) — o caso real: Vera · BG out/26, Valor do Rebanho VALIDADO, reabrir o P_01. Um clique no
   "Reabrir pasto" reabre o Valor do Rebanho (a função da tela dele, motivo automático) e DEPOIS o pasto; o aviso é uma linha. */
describe('REABRIR-AUTOMATICO-01 — reabrir o pasto reabre o Valor do Rebanho (BG P_01, out/26)', () => {
  const BG = 'c01a1437-bc8f-458c-8c6c-d68947450cf7';
  const P01 = { ...PASTOS[1], id: 'p01', fazenda_id: BG, nome: 'P_01' };
  const CARD_P01 = { ...FECH_P2, id: 'fp01', pasto_id: 'p01', fazenda_id: BG, ano_mes: '2026-10', status: 'fechado' };
  const AVISO = 'Valor do rebanho de out/26 reaberto — valide de novo depois.';
  beforeEach(() => {
    estadoP2.travado = true;
    respostaDoReabrir.erro = null; respostaDoReabrir.destrava = true;
  });
  const doReabrir = () => rpc.mock.calls.filter((c) => c[0] === 'fn_valor_rebanho_reabrir');
  const ordemDoReabrir = () => rpc.mock.invocationCallOrder[rpc.mock.calls.findIndex((c) => c[0] === 'fn_valor_rebanho_reabrir')];
  const clicarReabrir = async (aviso = AVISO) => {
    const b = await screen.findByTestId('reabrir-pasto');
    await waitFor(() => expect(b.getAttribute('title')).toBe(aviso));   /* a abertura já leu a trava */
    fireEvent.click(b);
  };

  it('um clique: fn_valor_rebanho_reabrir com "Reabertura do pasto P_01", DEPOIS o pasto; o aviso é UMA linha; o Salvar aparece', async () => {
    abrirDialogo(CARD_P01, vi.fn(), P01);
    await clicarReabrir();
    await waitFor(() => expect(reabrirCard).toHaveBeenCalledWith('fp01', 'Reabertura individual via modal de pasto'));
    expect(doReabrir()).toEqual([['fn_valor_rebanho_reabrir', { p_fazenda_id: BG, p_ano_mes: '2026-10', p_motivo: 'Reabertura do pasto P_01' }]]);
    expect(ordemDoReabrir()).toBeLessThan(reabrirCard.mock.invocationCallOrder[0]);
    expect(toast.success).toHaveBeenCalledWith(AVISO);
    /* UMA linha só: o "Pasto reaberto" não vem junto */
    expect(toast.success).toHaveBeenCalledTimes(1);
    await screen.findByRole('button', { name: /Salvar/ });
    expect(screen.queryByTestId('trava-do-p2')).toBeNull();
  });

  it('o banco recusa: a frase curta no rodapé, o pasto NÃO reabre', async () => {
    respostaDoReabrir.erro = { message: 'sem_permissao', code: '42501' };
    abrirDialogo(CARD_P01, vi.fn(), P01);
    await clicarReabrir();
    await waitFor(() => expect(screen.getByTestId('erro-do-pasto').textContent).toBe('Não consegui reabrir o Valor do Rebanho deste mês.'));
    expect(reabrirCard).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalledWith(AVISO);
  });

  it('reaberto mas o mês SEGUE travado (outro P2): nada se libera e o rodapé diz o porquê', async () => {
    respostaDoReabrir.destrava = false;
    abrirDialogo(CARD_P01, vi.fn(), P01);
    await clicarReabrir();
    await waitFor(() => expect(screen.getByTestId('erro-do-pasto').textContent)
      .toBe('O Valor do Rebanho de out/26 está validado. Reabra-o para editar os pastos deste mês.'));
    expect(reabrirCard).not.toHaveBeenCalled();
  });

  it('card em rascunho no mês travado: o Salvar reabre o Valor do Rebanho e grava na mesma ação', async () => {
    const fechar = abrirDialogo({ ...CARD_P01, status: 'rascunho' }, vi.fn(), P01);
    const salvar = await screen.findByRole('button', { name: /Salvar/ });
    await waitFor(() => expect(salvar.getAttribute('title')).toBe(AVISO));
    fireEvent.click(salvar);
    await waitFor(() => expect(fechar).toHaveBeenCalledWith(false));
    expect(ordemDoReabrir()).toBeLessThan(salvarCard.mock.invocationCallOrder[0]);
    expect(salvarCard).toHaveBeenCalledTimes(1);
  });

  it('pelo MAPA de pastos (o mesmo modal): o "Reabrir pasto" reabre o Valor do Rebanho junto', async () => {
    fech.fechamentos = [{ ...FECH_P2, status: 'fechado' }];
    comQc(<MapaPastosTab periodo={{ ano: '2026', mes: 9 }} onPeriodoChange={() => {}} />);
    fireEvent.click((await screen.findAllByTestId('abrir-pasto'))[1]);
    await clicarReabrir('Valor do rebanho de set/26 reaberto — valide de novo depois.');
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_valor_rebanho_reabrir', expect.objectContaining({ p_ano_mes: '2026-09', p_motivo: 'Reabertura do pasto Retiro Velho' })));
  });

  it('nada se desloca ao reabrir: o lugar de 22px do topo do corpo fica SEMPRE (antes sumia com a trava e o corpo pulava 38px)', async () => {
    abrirDialogo(CARD_P01, vi.fn(), P01);
    await clicarReabrir();
    expect(screen.getByTestId('lugar-trava-master').hidden).toBe(false);
  });

  it('o modal não tem mais o bloco da parte A (aviso grande, "Motivo", "Reabrir e editar")', () => {
    const dialogo = readFileSync('src/components/FechamentoPastoDialog.tsx', 'utf8');
    for (const saiu of ['trava-do-p2', 'motivo-reabrir-junto', 'reabrir-e-editar', 'Motivo (opcional)', 'ROTULO_REABRIR_E_EDITAR']) expect(dialogo).not.toContain(saiu);
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
    /* MAPA-LOTES-01 fatia 1: as telas montam o modal só pelo gancho único; quem o monta é ele (o trecho existe: indexOf ≥ 0) */
    const gancho = readFileSync('src/hooks/useModalDoPasto.tsx', 'utf8');
    const i = gancho.indexOf('<FechamentoPastoDialog');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(gancho.slice(i, gancho.indexOf('/>', i))).not.toMatch(/onSave=|onReabrir=/);
    const hook = readFileSync('src/hooks/useFechamento.ts', 'utf8');
    expect(hook).not.toMatch(/const (reabrirPasto|atualizarCamposMensais) =/);
    /* auto-teste do detector */
    expect('<FechamentoPastoDialog onSave={x} />').toMatch(/onSave=|onReabrir=/);
  });
});
