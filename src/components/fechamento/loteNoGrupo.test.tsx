/**
 * FECH-ROTACAO-01 · FATIA 3 — o lote do card no grupo de pastejo (dado SINTÉTICO).
 *   L1 quem recebe (o próprio card não conta) · L7 o fechar em lote não propõe vedar quem recebe · L2 a alocação gravada do card · L3 o grupo inteiro sem vedado/fechado
 *   L4 a faixa do grupo: Σ UA ÷ Σ área SEM os vedados · L5 o que o salvar manda (null / [] / lista) · L6 a lotação lida sem `as`
 *   C1 o botão diz "grupo inteiro" e a área · C2 "parte do grupo" deixa só o próprio; marcar soma · C3 vedado apagado com o porquê
 *   C4 a linha de efeito: UA do card ÷ Σ área · D1 o modal com o contexto grava card + alocação numa chamada (grupo inteiro por padrão)
 *   D2 sem o contexto, o modal salva como sempre (a RPC antiga)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  quemRecebe, alocacaoDoCard, grupoInteiro, propostosComoVedado, resumoDoGrupo, pastosParaGravar, lerLotacao, type LotacaoDoPasto,
} from '@/lib/fechamento/loteNoGrupo';
import { OndeOLoteEsteve, escolhaInicial, type ContextoDoLote } from './OndeOLoteEsteve';

const salvarCard = vi.fn(async () => ({ ok: true, erro: null }));
const salvarComAlocacao = vi.fn(async (_id: string, _campos: unknown, _itens: unknown, _pastos: string[] | null) => ({ ok: true, erro: null }));
const ITEM = { categoria_id: 'c1', quantidade: 100, peso_medio_kg: 450, lote: null, observacoes: null, origem_dado: 'manual' };
/* o hook de mentira devolve SEMPRE o mesmo objeto (como o `fech` do modalDoPasto.test): um objeto novo por render refaz o efeito que
   lê os itens, e o modal entra em laço */
const FECH_HOOK = { loadItens: async () => [ITEM], salvarCardDoPasto: salvarCard, salvarCardComAlocacao: salvarComAlocacao, reabrirCardDoPasto: vi.fn() };
vi.mock('@/hooks/useFechamento', () => ({ useFechamento: () => FECH_HOOK }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/hooks/useMasterLock', () => ({ useMasterLock: () => ({ isReadOnly: () => false, isMaster: true, isMesLocked: () => false }) }));
vi.mock('@/components/agri/AreaPlantadaPanel', () => ({ AreaPlantadaPanel: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/fechamento/travaDoP2', async (original) => ({
  ...(await original<typeof import('@/lib/fechamento/travaDoP2')>()),
  lerEstadoDoP2: vi.fn(async () => ({ ok: true, valor: { travado: false, revalidar: false } })),
}));

import { FechamentoPastoDialog } from '@/components/FechamentoPastoDialog';
import type { FechamentoPasto } from '@/hooks/useFechamento';
import type { Pasto, CategoriaRebanho } from '@/hooks/usePastos';

const A = { id: 'a', nome: 'P10A', area_produtiva_ha: 10, grupo_id: 'g' };
const B = { id: 'b', nome: 'P10B', area_produtiva_ha: 30, grupo_id: 'g' };
const C = { id: 'c', nome: 'P10C', area_produtiva_ha: 20, grupo_id: 'g' };
const X = { id: 'x', nome: 'P11 Retiro', area_produtiva_ha: 40, grupo_id: null };
const lot = (id: string, ua: number, cab: number): LotacaoDoPasto => ({ pastoId: id, grupoId: 'g', areaHa: 0, cabecas: cab, ua, uaHa: null, recebeDeOutroCard: false });

beforeEach(() => { vi.clearAllMocks(); Element.prototype.scrollIntoView = () => {}; });

describe('L — as contas puras', () => {
  it('L1 quem recebe: destino → origens; o pasto do próprio card não conta', () => {
    const r = quemRecebe([{ fechamentoId: 'fa', lote: '', pastoId: 'a' }, { fechamentoId: 'fa', lote: '', pastoId: 'b' }], [{ id: 'fa', pasto_id: 'a' }]);
    expect([...r]).toEqual([['b', ['a']]]);
  });
  it('L2 a alocação gravada do card (lote ""), ou null', () => {
    const al = [{ fechamentoId: 'fa', lote: '', pastoId: 'a' }, { fechamentoId: 'fa', lote: '', pastoId: 'b' }, { fechamentoId: 'fz', lote: '', pastoId: 'c' }];
    expect(alocacaoDoCard(al, 'fa')).toEqual(['a', 'b']);
    expect(alocacaoDoCard(al, 'nenhum')).toBeNull();
  });
  it('L3 grupo inteiro = o próprio + os membros que podem receber (sem vedado nem fechado)', () => {
    expect(grupoInteiro('a', [A, B, C], new Set(['c']))).toEqual(['a', 'b']);
  });
  it('L4 a faixa do grupo divide pela área dos NÃO vedados (decisão 4)', () => {
    const r = resumoDoGrupo([A, B, C], new Map([['a', lot('a', 25, 25)], ['b', lot('b', 75, 75)]]), new Set(['c']));
    expect(r.areaHa).toBe(40);
    expect(r.uaHa).toBe(2.5);
    expect(r.cabecas).toBe(100);
    expect(r.vedados).toEqual(['P10C']);
  });
  it('L5 o salvar: sem grupo e sem nada = null; no grupo só ele = []; sem cabeça com gravada = []; lista com o próprio primeiro', () => {
    expect(pastosParaGravar({ pastoId: 'x', escolhidos: ['x'], temCabeca: true, temGrupo: false, gravada: null })).toBeNull();
    expect(pastosParaGravar({ pastoId: 'a', escolhidos: ['a'], temCabeca: true, temGrupo: true, gravada: null })).toEqual([]);
    expect(pastosParaGravar({ pastoId: 'a', escolhidos: ['a', 'b'], temCabeca: false, temGrupo: true, gravada: ['a', 'b'] })).toEqual([]);
    expect(pastosParaGravar({ pastoId: 'a', escolhidos: ['b', 'a', 'c'], temCabeca: true, temGrupo: true, gravada: null })).toEqual(['a', 'b', 'c']);
  });
  it('L7 o fechar em lote não propõe vedar quem RECEBE lote (F3-4b); o vazio de verdade continua proposto', () => {
    const cards = [{ id: 'fb', pasto_id: 'b' }, { id: 'fz', pasto_id: 'z' }, { id: 'fy', pasto_id: 'y' }];
    expect(propostosComoVedado(['fb', 'fz', 'fy'], new Set(['fy']), cards, new Map([['b', ['a']]]))).toEqual(['fz']);
  });
  it('L6 a lotação do banco lida sem `as` (número em texto vira número; linha sem pasto some)', () => {
    const m = lerLotacao([{ pasto_id: 'b', ua: '75', ua_ha: 2.5, cabecas: 75, recebe_de_outro_card: true }, { ua: 1 }]);
    expect(m.size).toBe(1);
    expect(m.get('b')?.ua).toBe(75);
    expect(m.get('b')?.recebeDeOutroCard).toBe(true);
  });
});

const CTX: ContextoDoLote = { nomeDoGrupo: 'P10', membros: [A, B, C], outrosPastos: [X], impedidos: new Map([['c', 'vedado']]), gravada: null };

function montarBotao(escolhidos: string[], uaDoCard = 100) {
  const onChange = vi.fn();
  render(<OndeOLoteEsteve pasto={A} contexto={CTX} escolhidos={escolhidos} onChange={onChange} uaDoCard={uaDoCard} />);
  return onChange;
}

describe('C — o botão e o quadro "Onde o lote esteve"', () => {
  it('C1 começa no grupo inteiro (sem o vedado) e diz a área', () => {
    const inicio = escolhaInicial('a', CTX);
    expect(inicio).toEqual(['a', 'b']);
    montarBotao(inicio);
    expect(screen.getByTestId('lote-onde').textContent).toBe('Lote no grupo P10 inteiro · 40,00 ha');
  });
  it('C2 "Em parte do grupo" deixa só o próprio; marcar um membro soma', () => {
    const onChange = montarBotao(['a', 'b']);
    fireEvent.click(screen.getByTestId('lote-onde'));
    fireEvent.click(screen.getByTestId('lote-grupo-parte'));
    expect(onChange).toHaveBeenLastCalledWith(['a']);
  });
  it('C3 o vedado do mês aparece apagado, com o porquê; o próprio fica marcado e travado', () => {
    montarBotao(['a']);
    fireEvent.click(screen.getByTestId('lote-onde'));
    const membros = within(screen.getByTestId('lote-membros')).getAllByTestId('lote-membro');
    expect(membros[0]).toBeDisabled();
    expect(membros[2]).toBeDisabled();
    expect(screen.getByTestId('lote-membros').textContent).toContain('P10C · vedado no mês');
  });
  it('C4 a linha de efeito: UA do card ÷ Σ área (e o "só neste pasto" ao lado)', () => {
    montarBotao(['a', 'b'], 100);
    fireEvent.click(screen.getByTestId('lote-onde'));
    expect(screen.getByTestId('lote-efeito-frase').textContent).toBe('O lote fica em 2 pastos, 40,00 ha: 2,50 UA/ha em cada (só neste pasto: 10,00 UA/ha).');
  });
});

describe('D — o modal do pasto', () => {
  const FECH: FechamentoPasto = { id: 'fa', pasto_id: 'a', fazenda_id: 'f', ano_mes: '2026-10', status: 'rascunho', responsavel_nome: null,
    tipo_uso_mes: 'recria', lote_mes: null, qualidade_mes: null, observacao_mes: null, created_at: '2026-10-01', updated_at: '2026-10-01' };
  const PASTO_A: Pasto = { ...A, fazenda_id: 'f', tipo_uso: 'recria', ativo: true, entra_conciliacao: true, ordem_exibicao: 1, lote_padrao: null,
    qualidade: null, observacoes: null, data_inicio: null, created_at: '2026-01-01', updated_at: '2026-01-01' };
  const CATS: CategoriaRebanho[] = [{ id: 'c1', nome: 'Bois', codigo: 'bois', ordem_exibicao: 1 }];
  const abrir = (lote?: ContextoDoLote) => render(
    <QueryClientProvider client={new QueryClient()}>
      <FechamentoPastoDialog open onOpenChange={vi.fn()} pasto={PASTO_A} fechamento={FECH}
        categorias={CATS} onFechar={vi.fn()} onCopiar={vi.fn()}
        pastosDaFazenda={[PASTO_A]} onRenomear={vi.fn()} lote={lote} />
    </QueryClientProvider>);

  it('D1 com o contexto: o botão aparece e o Salvar grava card + alocação "grupo inteiro" numa chamada', async () => {
    abrir(CTX);
    expect((await screen.findByTestId('lote-onde')).textContent).toBe('Lote no grupo P10 inteiro · 40,00 ha');
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(salvarComAlocacao).toHaveBeenCalledTimes(1));
    expect(salvarComAlocacao.mock.calls[0][0]).toBe('fa');
    expect(salvarComAlocacao.mock.calls[0][3]).toEqual(['a', 'b']);
    expect(salvarCard).not.toHaveBeenCalled();
  });
  it('D2 sem o contexto: nenhum botão de lote e o salvar de sempre', async () => {
    abrir(undefined);
    await screen.findByTestId('modal-do-pasto');
    await waitFor(() => expect(screen.getByRole('button', { name: /Salvar/ })).toBeEnabled());
    expect(screen.queryByTestId('lote-onde')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(salvarCard).toHaveBeenCalledTimes(1));
    expect(salvarComAlocacao).not.toHaveBeenCalled();
  });
});
