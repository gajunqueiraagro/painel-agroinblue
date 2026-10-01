/**
 * PR-CONC-ENRIQ-AGRUP-2a — N:1 fora do lote até ter gravação, "Ao fornecedor" só proposta, desmembrar só com a soma
 * fechada. (As guardas do banco do desmembrar se provam no ensaio SQL em ROLLBACK e pelo `rpc` do app — no relatório.)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import {
  aguardaAgrupamento, baldeDaLinha, elegivelParaLote, montarPainelContas, STATUS_DO_LOTE, totalPainel,
} from '@/v2/lib/mesa/painelContas';
import { levarAoFornecedor, previaAoFornecedor } from '@/v2/lib/mesa/aoFornecedor';
import { motivoDoDesmembrar } from '@/v2/lib/mesa/desmembrar';
import { toRowVM } from '@/v2/lib/mesa/enriquecimentoView';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { EnriquecimentoMesaModal } from '@/v2/components/mesa/enriquecimento/EnriquecimentoMesaModal';
import { AgruparModal } from '@/v2/components/mesa/enriquecimento/AgruparModal';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

/* Status que o banco grava e o tipo `MatchStatus` não declara entram pelo JSON (como no fixture real). */
const st = (s: string): Partial<ClassificacaoStagingPreviewRow> => JSON.parse(JSON.stringify({ match_status: s }));

describe('N:1 (resolvido_grupo) fora do lote até ter gravação', () => {
  const grupo = linhaCrua({ staging_id: 'g1', ...st('resolvido_grupo'), conta_filtro_id: 'bb', excel_valor: 3504.38,
    match_lancamento_ids: ['l1', 'l2'] });
  it('não está no STATUS_DO_LOTE e não é elegível', () => {
    expect(STATUS_DO_LOTE.has('resolvido_grupo')).toBe(false);
    expect(elegivelParaLote(grupo)).toBe(false);
  });
  it('cai no balde "aguarda" — não é pronta nem gravada', () => {
    expect(aguardaAgrupamento(grupo)).toBe(true);
    expect(baldeDaLinha(grupo)).toBe('aguarda');
    expect(baldeDaLinha(linhaCrua({ ...grupo, aplicado: true }))).toBe('gravada');
  });
  it('o painel conta em "aguarda", a conta não fica concluída e o Total soma', () => {
    const outra = linhaCrua({ staging_id: 'x1', ...st('ja_aplicado'), conta_filtro_id: 'bb', excel_valor: 10 });
    const p = montarPainelContas([grupo, outra]);
    expect(p[0]).toMatchObject({ linhas: 2, gravadas: 1, prontas: 0, aguarda: 1, concluida: false });
    expect(totalPainel(p).aguarda).toBe(1);
  });
});

/* ═══ AO FORNECEDOR ════════════════════════════════════════════════════════════════════════════════════════════════ */
const cls = (subcentro: string, escopo_negocio: string): ClassificacaoItem => ({
  id: subcentro, subcentro, escopo_negocio, macro_custo: 'Custeio', grupo_custo: 'G', centro_custo: 'C', tipo_operacao: '2-Saídas',
});
const CLASSIF = [cls('Combustível Máquinas Agricultura', 'agricultura'), cls('Despesas de Escritório', 'administrativo')];
const FAZENDAS = [{ id: 'pureza', nome: 'Faz. Pureza' }, { id: 'adm', nome: 'Administrativo' }];
const linhaF = (id: string, sobre: Partial<ClassificacaoStagingPreviewRow> = {}) => linhaCrua({
  staging_id: id, match_status: 'sem_match', planilha_favorecido_id: 'f-unipetro', excel_fornecedor: 'UNIPETRO', ...sobre,
});
const FONTE = linhaF('fonte', {
  lanc_id: 'l-fonte', proposto_subcentro: 'Combustível Máquinas Agricultura', proposto_fazenda_id: 'pureza',
  proposto_safra_id: 'safra-lav',
});

describe('Ao fornecedor — a prévia', () => {
  const sessao = [
    FONTE,
    linhaF('a1'),                                                            // cru/sem par: muda os três
    linhaF('a2', { excel_fornecedor: 'Unipetro M.S. Dist' }),               // TEXTO diferente, MESMO id: entra
    linhaF('a3', { planilha_favorecido_id: 'f-outro', excel_fornecedor: 'UNIPETRO' }), // MESMO texto, outro id: fora
    linhaF('a4', { aplicado: true }),                                        // aprovada: fora
    linhaF('a5', { lanc_id: 'l5', lanc_plano_conta_id_atual: 'pc', lanc_subcentro_atual: 'Outra' }), // classificada
    linhaF('a6', { proposto_subcentro: 'Combustível Máquinas Agricultura', proposto_fazenda_id: 'pureza',
      proposto_safra_id: 'safra-lav' }),                                      // já igual: não muda nada
    linhaF('a7', { proposto_subcentro: 'Combustível Máquinas Agricultura' }), // só fazenda e safra
  ];
  const p = previaAoFornecedor(FONTE, sessao, { classificacoes: CLASSIF, fazendas: FAZENDAS });

  it('alvo pelo ID do fornecedor resolvido, nunca pelo texto; só não aprovadas', () => {
    expect(p.alvos.map((a) => a.stagingId).sort()).toEqual(['a1', 'a2', 'a7']);
  });
  it('a linha já classificada fica com o sistema e entra só na contagem', () => {
    expect(p.classificadas).toBe(1);
    expect(p.alvos.some((a) => a.stagingId === 'a5')).toBe(false);
  });
  it('cada alvo leva só o que muda; a prévia diz quantas linhas e quais campos', () => {
    expect(p.alvos.find((a) => a.stagingId === 'a7')?.patch).toEqual({ fazenda_id: 'pureza', safra_id: 'safra-lav' });
    expect(p.alvos.find((a) => a.stagingId === 'a1')?.campos).toEqual(['Conta do plano', 'Fazenda', 'Safra']);
    expect(p.resumo).toBe('3 linhas · campos: Conta do plano, Fazenda, Safra · 1 já classificada (o sistema prevalece)');
  });
  it('plano administrativo: fazenda Administrativo e nenhuma safra', () => {
    const adm = linhaF('adm-fonte', { proposto_subcentro: 'Despesas de Escritório', proposto_fazenda_id: 'pureza',
      proposto_safra_id: 'safra-lav' });
    const r = previaAoFornecedor(adm, [adm, linhaF('b1', { proposto_safra_id: 'safra-x' })], { classificacoes: CLASSIF, fazendas: FAZENDAS });
    expect(r.alvos[0].patch).toEqual({ subcentro: 'Despesas de Escritório', fazenda_id: 'adm', safra_id: null });
  });
  it('sem fornecedor resolvido, ou sem conta do plano, diz por quê e não tem alvo', () => {
    expect(previaAoFornecedor(linhaF('s', { planilha_favorecido_id: null }), sessao, {}).motivo).toMatch(/não está resolvido/);
    expect(previaAoFornecedor(linhaF('s2'), sessao, {}).motivo).toMatch(/ainda não tem conta do plano/);
  });
});

describe('Ao fornecedor — o gesto grava só a proposta', () => {
  it('chama editarProposto uma vez por alvo, com o patch, e nada mais', async () => {
    const editar = vi.fn(() => Promise.resolve({ ok: true }));
    const marcadas: string[] = [];
    const r = await levarAoFornecedor(
      [{ stagingId: 'a1', patch: { subcentro: 'X' }, campos: ['Conta do plano'] },
        { stagingId: 'a2', patch: { fazenda_id: 'f' }, campos: ['Fazenda'] }],
      editar, (id) => marcadas.push(id));
    expect(r).toEqual({ ok: 2, falhas: 0 });
    expect(editar).toHaveBeenCalledTimes(2);
    expect(editar).toHaveBeenNthCalledWith(1, { staging_id: 'a1', patch: { subcentro: 'X' } });
    expect(marcadas).toEqual(['a1', 'a2']);
  });
  it('recusa do banco conta como falha e não marca a linha', async () => {
    const editar = vi.fn(() => Promise.resolve({ ok: false, motivo: 'sem_permissao' }));
    const marcadas: string[] = [];
    const r = await levarAoFornecedor([{ stagingId: 'a1', patch: {}, campos: [] }], editar, (id) => marcadas.push(id));
    expect(r).toEqual({ ok: 0, falhas: 1 });
    expect(marcadas).toEqual([]);
  });
});

describe('Ao fornecedor — o "⋯" do cabeçalho da Mesa', () => {
  const row = toRowVM(linhaCrua({ staging_id: 's-1', lanc_id: 'l-1', excel_valor: 100, lanc_valor: 100, lanc_sinal: '-1',
    lanc_tipo_operacao: '2-Saídas' }), [], {});
  const acoes = { posicao: '1 / 1', onAnterior: vi.fn(), onProximo: vi.fn(), canAnterior: false, canProximo: false,
    revisado: false, onRevisado: vi.fn(), onSalvar: vi.fn(), onSalvarProximo: vi.fn(), onReverter: vi.fn(),
    onAplicarTodos: vi.fn(), nAplicaveis: 0 };
  const montar = (aoFornecedor: Parameters<typeof EnriquecimentoMesaModal>[0]['aoFornecedor']) => render(
    <EnriquecimentoMesaModal open onOpenChange={vi.fn()} sessaoLabel="Imp 03"
      lista={{ rows: [row], selecionadoId: row.id, onSelecionar: vi.fn() }} detalhe={{ row }} actions={acoes}
      baldePorId={new Map()} aoFornecedor={aoFornecedor} />);
  const abrir = () => {
    const gatilho = screen.getByTestId('menu-linha-mesa');
    fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.keyDown(gatilho, { key: 'Enter' });
  };

  it('mostra a prévia ANTES e o gesto chama onAplicar', () => {
    const onAplicar = vi.fn();
    const p = previaAoFornecedor(FONTE, [FONTE, linhaF('a1')], { classificacoes: CLASSIF, fazendas: FAZENDAS });
    montar({ previa: p, aplicando: false, onAplicar });
    abrir();
    expect(screen.getByTestId('previa-ao-fornecedor')).toHaveTextContent('Ao fornecedor: 1 linha · campos: Conta do plano, Fazenda, Safra');
    const item = screen.getByTestId('aplicar-ao-fornecedor');
    expect(item).toHaveTextContent('não grava o lançamento');
    fireEvent.click(item);
    expect(onAplicar).toHaveBeenCalledTimes(1);
  });

  it('sem alvo, ou aplicando, o item fica desligado (trava de duplo clique)', () => {
    const onAplicar = vi.fn();
    const p = previaAoFornecedor(FONTE, [FONTE, linhaF('a1')], { classificacoes: CLASSIF, fazendas: FAZENDAS });
    montar({ previa: p, aplicando: true, onAplicar });
    abrir();
    const item = screen.getByTestId('aplicar-ao-fornecedor');
    expect(item).toHaveAttribute('data-disabled');
    expect(item).toHaveTextContent('Levando…');
    fireEvent.click(item);
    expect(onAplicar).not.toHaveBeenCalled();
  });
});

/* ═══ DESMEMBRAR SÓ COM A SOMA FECHADA ═════════════════════════════════════════════════════════════════════════════ */
describe('desmembrar: bloco cuja soma não fecha fica sem proposta e sem desmembrar à mão', () => {
  it('o motivo diz a diferença ao centavo', () => {
    expect(motivoDoDesmembrar({ completo: true, bate: false, diferencaCent: -1, carregadas: 2, total: 2 }))
      .toMatch(/^A soma da planilha difere do lançamento em R\$\s0,01\.$/);
    expect(motivoDoDesmembrar({ completo: true, bate: true, diferencaCent: 0, carregadas: 2, total: 2 })).toBeNull();
    expect(motivoDoDesmembrar({ completo: false, bate: false, diferencaCent: 0, carregadas: 1, total: 3 }))
      .toBe('1 de 3 linhas carregadas — a soma não se confere.');
    expect(motivoDoDesmembrar(null)).toBeNull();
  });

  it('o modal do Agrupar não confirma com a soma diferente, e diz a mesma frase', () => {
    const c = (id: string, v: number) => linhaCrua({ staging_id: id, match_status: 'sem_match', excel_valor: v, excel_data: '2026-09-11' });
    render(<AgruparModal open onOpenChange={vi.fn()} movimento={{ data: '2026-09-11', descricao: 'Pix', contaNome: 'BB', valor: 22639.95, documento: null }}
      candidatas={[c('p1', 20000), c('p2', 2639.94)]} sugeridasIds={['p1', 'p2']} onConfirmar={vi.fn(() => Promise.resolve())} />);
    expect(screen.getByText(/A soma da planilha difere do lançamento em R\$\s0,01\./)).toBeInTheDocument();
    const confirmar = screen.getAllByRole('button').find((b) => b.getAttribute('title')?.startsWith('A soma da planilha difere'));
    expect(confirmar).toBeDefined();
    expect(confirmar).toBeDisabled();
  });
});
