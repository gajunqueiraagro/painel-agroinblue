/**
 * PR-CONC-ENRIQUECER-V2-01 — Enriquecer v2: painel por conta, Extrato da planilha (Planilha × Sistema) e Mesa compacta.
 *
 * ⚠ O jsdom NÃO FAZ LAYOUT: aqui se prova o contrato (colgroup, altura declarada, `whitespace-nowrap`, slots sempre
 *   presentes) e as contas (Total = soma, partição sem sobra); as medidas renderizadas vão no relatório do PR.
 * ⚠ ASSERÇÃO DE "NENHUM" LEVA O TAMANHO DO CONJUNTO (CLAUDE.md): o Extrato reporta quantas linhas comparou dos dois lados.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import { CONTA_BB, espelhoBB0109, stagingBB0109 } from '@/v2/lib/mesa/enriquecerV2.fixture';
import {
  baldeDaLinha, elegivelParaLote, filtrarPainel, montarPainelContas, totalPainel,
} from '@/v2/lib/mesa/painelContas';
import { montarExtratoDaPlanilha, soNaoEnriquecidos } from '@/v2/lib/mesa/extratoDaPlanilha';
import { toRowVM } from '@/v2/lib/mesa/enriquecimentoView';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));
const ESPELHO = vi.hoisted(() => {
  const estado: { atual: import('@/components/financeiro-v2/EspelhoConciliacaoTab').EspelhadosReais | null } = { atual: null };
  return estado;
});
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', async (orig) => {
  const real = await orig<typeof import('@/components/financeiro-v2/EspelhoConciliacaoTab')>();
  return { ...real, useEspelhadosReais: () => ({ data: ESPELHO.atual, isLoading: false }) };
});
vi.mock('@/hooks/useEspelhoInternas', () => ({
  useEspelhoInternas: () => ({ contasInternas: new Set(), lancamentosInternos: new Set(), saldoInicialConsolidado: null, saldoInformadoConsolidado: null }),
}));

import {
  PainelContasEnriquecer, COLUNAS_PAINEL, ALTURA_LINHA_PAINEL,
} from '@/v2/components/mesa/enriquecimento/PainelContasEnriquecer';
import { ExtratoDaPlanilhaModal, FechamentoDoMes } from '@/v2/components/mesa/enriquecimento/ExtratoDaPlanilhaModal';
import {
  EnriquecimentoMesaModal, LARGURA_LISTA_MESA, ALTURA_ITEM_LISTA,
} from '@/v2/components/mesa/enriquecimento/EnriquecimentoMesaModal';
import { checklistDaLinha, pendenciasDaLinha, MesaCamposTabela } from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

/* ═══ PAINEL POR CONTA — 9 contas sintéticas, uma de cada estado ═══════════════════════════════════════════════════ */
const linha = (conta: string, i: number, sobre: Partial<ClassificacaoStagingPreviewRow>) => linhaCrua({
  staging_id: `${conta}-${i}`, conta_filtro_id: conta, conta_filtro_nome: `Conta ${conta} — nome bem comprido de agência e número`,
  excel_valor: 100 + i, ...sobre,
});
/* Os status que o banco grava e o tipo `MatchStatus` não declara entram pelo JSON (como no fixture real). */
const st = (s: string): Partial<ClassificacaoStagingPreviewRow> => JSON.parse(JSON.stringify({ match_status: s }));
const SESSAO_9_CONTAS: ClassificacaoStagingPreviewRow[] = [
  /* c1: gravadas (aplicada pela Mesa e ja_aplicado), prontas (exato, divergente), decide (ambiguo), sem banco */
  linha('c1', 1, { aplicado: true }), linha('c1', 2, st('ja_aplicado')), linha('c1', 3, { match_status: 'exato', lanc_id: 'l3' }),
  linha('c1', 4, { match_status: 'divergente', lanc_id: 'l4' }), linha('c1', 5, { match_status: 'ambiguo' }),
  linha('c1', 6, { match_status: 'sem_match' }),
  /* c2: concluída — tudo gravado */
  linha('c2', 1, { aplicado: true }), linha('c2', 2, { match_status: 'ja_classificado', lanc_id: 'l22' }),
  /* c3: sem OFX no mês */
  linha('c3', 1, { match_status: 'exato', lanc_id: 'l31' }),
  /* c4: parte de agrupamento — NÃO é pronta (não entra no lote) */
  linha('c4', 1, { ...st('sugestao_split'), lanc_id: 'l41', casamento_meta: { grupo_ids: ['a', 'b'] } }),
  /* c4: e uma 'exato' que é PARTE de agrupamento — o status a levaria ao lote; a trava `parteDeAgrupamento` não deixa */
  linha('c4', 2, { match_status: 'exato', lanc_id: 'l42', casamento_meta: { grupo_ids: ['x', 'y'] } }),
  linha('c5', 1, st('sugestao_grupo')), linha('c6', 1, st('resolvido_manual')), linha('c7', 1, st('sem_conta_para_match')),
  linha('c8', 1, st('ambiguo_resolvido')), linha('c9', 1, { match_status: 'sem_match' }),
];
const FORA = new Map([['c1', 3], ['c9', 1]]);
const COM_OFX = new Set(['c1', 'c2', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']);
const PAINEL = montarPainelContas(SESSAO_9_CONTAS, { foraPlanilhaPorConta: FORA, contasComOfx: COM_OFX });

describe('painel por conta — as contas', () => {
  it('nove contas, e cada linha cai em UM balde: a soma dos baldes é a coluna Linhas', () => {
    expect(PAINEL).toHaveLength(9);
    for (const l of PAINEL) expect(l.gravadas + l.prontas + l.decide + l.semBanco + l.outras).toBe(l.linhas);
  });

  it('o Total é a soma das linhas da tabela', () => {
    const t = totalPainel(PAINEL);
    expect(t.contas).toBe(9);
    expect(t.linhas).toBe(SESSAO_9_CONTAS.length);
    const chaves: Array<'gravadas' | 'prontas' | 'decide' | 'semBanco' | 'foraPlanilha' | 'revisar' | 'valorProntas'> =
      ['gravadas', 'prontas', 'decide', 'semBanco', 'foraPlanilha', 'revisar', 'valorProntas'];
    for (const k of chaves) {
      expect(t[k], k).toBeCloseTo(PAINEL.reduce((a, l) => a + l[k], 0), 6);
    }
    expect(t.foraPlanilha).toBe(4);
  });

  it('Prontas é o "Gravar N": a mesma `elegivelParaLote` — parte de agrupamento fica fora', () => {
    const t = totalPainel(PAINEL);
    expect(t.prontas).toBe(SESSAO_9_CONTAS.filter((r) => elegivelParaLote(r)).length);
    expect(PAINEL.find((l) => l.contaId === 'c4')).toMatchObject({ linhas: 2, prontas: 0 });
    expect(elegivelParaLote(SESSAO_9_CONTAS[10])).toBe(false);
    expect(baldeDaLinha(SESSAO_9_CONTAS[9])).toBe('decide');
    expect(SESSAO_9_CONTAS[10].staging_id).toBe('c4-2');
  });

  it('c1 nos baldes certos; c2 concluída; c3 sem OFX', () => {
    const c1 = PAINEL.find((l) => l.contaId === 'c1');
    expect(c1).toMatchObject({ linhas: 6, gravadas: 2, prontas: 2, decide: 1, semBanco: 1, foraPlanilha: 3, revisar: 3,
      concluida: false, faltaOfx: false });
    expect(c1?.valorProntas).toBeCloseTo(103 + 104, 6);
    expect(PAINEL.find((l) => l.contaId === 'c2')).toMatchObject({ concluida: true, faltaOfx: false });
    expect(PAINEL.find((l) => l.contaId === 'c3')).toMatchObject({ faltaOfx: true, concluida: false });
  });

  it('"ja_classificado" com sobrescrever marcado vira pronta (é o lote que o leva)', () => {
    const r = SESSAO_9_CONTAS[7];
    expect(baldeDaLinha(r, false)).toBe('gravada');
    expect(baldeDaLinha(r, true)).toBe('pronta');
  });

  it('enquanto o extrato do mês carrega, ninguém é "falta OFX"', () => {
    expect(montarPainelContas(SESSAO_9_CONTAS).every((l) => l.faltaOfx === null)).toBe(true);
  });

  it('filtro: Com pendência + Concluídas = Todas', () => {
    expect(filtrarPainel(PAINEL, 'pendentes').length + filtrarPainel(PAINEL, 'concluidas').length).toBe(PAINEL.length);
    expect(filtrarPainel(PAINEL, 'concluidas').map((l) => l.contaId)).toEqual(['c2']);
  });
});

const montarPainel = (extra: Partial<Parameters<typeof PainelContasEnriquecer>[0]> = {}) => render(
  <PainelContasEnriquecer mesRotulo="set/2026" clienteNome="NJ Pecuária" seletorSessao={<span>Imp 03</span>}
    linhas={PAINEL} mesCurto="set/26" filtro="todas" onFiltro={vi.fn()} pendentesDePara={2} onPlanilha={vi.fn()}
    onExtrato={vi.fn()} onRevisar={vi.fn()} gravarN={totalPainel(PAINEL).prontas} gravando={false} onGravar={vi.fn()}
    menu={[]} avisos={[]} {...extra} />,
);

describe('painel por conta — a tela', () => {
  it('uma linha de 20px por conta, colgroup medido, nenhuma célula quebra', () => {
    montarPainel();
    const t = screen.getByTestId('tabela-contas');
    expect(t.className).toMatch(/table-fixed/);
    expect(Array.from(t.querySelectorAll('col')).map((c) => c.style.width))
      .toEqual(COLUNAS_PAINEL.map((c) => c.largura ?? ''));
    const linhas = within(t).getAllByTestId(/^conta-/);
    expect(linhas).toHaveLength(9);
    for (const tr of [...linhas, screen.getByTestId('linha-total')]) {
      expect(tr.style.height).toBe(ALTURA_LINHA_PAINEL);
      for (const td of Array.from(tr.querySelectorAll('td'))) {
        const quebra = td.className.includes('whitespace-nowrap') || td.querySelector('[data-testid="barra-andamento"]')
          || td.className.includes('text-ellipsis') || td.children.length === 0 || td.querySelector('.justify-end');
        expect(quebra, td.textContent ?? '').toBeTruthy();
      }
    }
  });

  it('os seis números e o Total batem com a soma; zero em cinza', () => {
    montarPainel();
    const t = totalPainel(PAINEL);
    expect(screen.getByTestId('kpi-linhas')).toHaveTextContent(String(t.linhas));
    expect(screen.getByTestId('kpi-prontas')).toHaveTextContent(String(t.prontas));
    expect(screen.getByTestId('kpi-foraPlanilha')).toHaveTextContent('4');
    const total = screen.getByTestId('linha-total');
    expect(total).toHaveTextContent(`Total · 9 contas${t.linhas}`);
    const c2 = screen.getByTestId('conta-c2');
    const zero = within(c2).getAllByText('0')[0];
    expect(zero.className).toMatch(/muted-foreground/);
  });

  it('ações: pendente = Extrato + Revisar N; concluída ✓; sem OFX = "falta OFX set/26"', () => {
    const onRevisar = vi.fn(); const onExtrato = vi.fn();
    montarPainel({ onRevisar, onExtrato });
    const c1 = screen.getByTestId('conta-c1');
    fireEvent.click(within(c1).getByTestId('acao-revisar'));
    expect(onRevisar).toHaveBeenCalledWith('c1');
    expect(within(c1).getByTestId('acao-revisar')).toHaveTextContent('Revisar 3');
    fireEvent.click(within(c1).getByTestId('acao-extrato'));
    expect(onExtrato).toHaveBeenCalledWith('c1');
    expect(within(screen.getByTestId('conta-c2')).getByTestId('concluida')).toHaveTextContent('concluída ✓');
    expect(within(screen.getByTestId('conta-c3')).getByTestId('falta-ofx')).toHaveTextContent('falta OFX set/26');
  });

  it('barra: "1 · Planilha e de-para 2", "Extrato da planilha · todas" e "Gravar N prontas"', () => {
    const onExtrato = vi.fn();
    montarPainel({ onExtrato });
    expect(screen.getByTestId('botao-planilha')).toHaveTextContent('1 · Planilha e de-para 2');
    fireEvent.click(screen.getByTestId('botao-extrato-todas'));
    expect(onExtrato).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('botao-gravar')).toHaveTextContent(`Gravar ${totalPainel(PAINEL).prontas} prontas`);
  });

  it('o slot de aviso existe sempre, com 18px, e leva os avisos juntos', () => {
    const { unmount } = montarPainel();
    expect(screen.getByTestId('slot-aviso-painel').className).toMatch(/h-\[18px\]/);
    unmount();
    montarPainel({ avisos: [
      { id: 'aviso-sem-conta', texto: '1 linha sem conta', cls: '', conteudo: <span>1 linha sem conta</span> },
      { id: 'aviso-sessao-mais-nova', texto: 'mais nova', cls: '', conteudo: <span>mais nova</span> },
    ] });
    const slot = screen.getByTestId('slot-aviso-painel');
    expect(within(slot).getByTestId('aviso-sem-conta')).toBeInTheDocument();
    expect(slot.title).toBe('1 linha sem conta · mais nova');
  });
});

/* ═══ EXTRATO DA PLANILHA — o fixture real (8d6efeb7, BB, 01/09/2026) ═════════════════════════════════════════════ */
describe('Extrato da planilha — sessão 8d6efeb7, BB, 01/09', () => {
  const staging = stagingBB0109();
  const ex = montarExtratoDaPlanilha(staging, espelhoBB0109(), CONTA_BB, new Set());
  const linhas = ex.dias.flatMap((d) => d.linhas);

  it('o conjunto comparado: 10 linhas da planilha × 10 lançamentos, um dia', () => {
    expect(ex.nPlanilha).toBe(10);
    expect(ex.nSistema).toBe(10);
    expect(ex.dias).toHaveLength(1);
  });

  it('pares 1:1 — sete lançamentos, cada um ao lado da sua linha', () => {
    const pares = linhas.filter((l) => l.planilha && l.sistema);
    expect(pares).toHaveLength(8);
    const pro = pares.find((l) => l.stagingId === '6d4f80f7');
    expect(pro?.sistema?.lancamentoId).toBe('f22ec415');
    expect(pro?.simbolo).toBe('≈');
    expect(pares.filter((l) => l.simbolo === '✓')).toHaveLength(7);
  });

  it('↳: as duas "Telefone 506,51" sob o MESMO lançamento (8ebd63d4), e o outro "Vivo Casa" só no sistema', () => {
    const mae = linhas.findIndex((l) => l.chave === 'n1-8ebd63d4');
    expect(mae).toBeGreaterThanOrEqual(0);
    expect(linhas[mae].selo).toBe('Desmembrar');
    const filhas = linhas.slice(mae + 1, mae + 3);
    expect(filhas.map((f) => f.simbolo)).toEqual(['↳', '↳']);
    expect(filhas.map((f) => f.stagingId).sort()).toEqual(['547a04fa', '9fd050ed']);
    const so = linhas.filter((l) => l.selo === 'Só no sistema');
    expect(so.map((l) => l.sistema?.lancamentoId)).toEqual(['e7970f00']);
    /* PR-CONC-ENRIQ-AGRUP-2b-TELA — a origem B/✓/M virou o STATUS do lançamento (era '✓' = conciliado) */
    expect(so[0].sistema?.status).toBe('conciliado');
  });

  it('o dia fecha: planilha e sistema somam o mesmo (as duas pontas têm dois 506,51)', () => {
    expect(ex.dias[0].planilha).toBeCloseTo(-28817.71, 2);
    expect(ex.dias[0].sistema).toBeCloseTo(-28817.71, 2);
    expect(ex.dias[0].confere).toBe(true);
    expect(ex.totais.difSaidas).toBeCloseTo(0, 6);
  });

  it('selos: Enriquecido no já gravado; Valor ≠ quando o valor do par difere', () => {
    expect(linhas.find((l) => l.stagingId === '06689028')?.selo).toBe('Enriquecido');
    const torto = staging.map((r) => (r.staging_id === '06689028' ? linhaCrua({ ...r, match_status: 'divergente', excel_valor: 999 }) : r));
    const e2 = montarExtratoDaPlanilha(torto, espelhoBB0109(), CONTA_BB, new Set());
    const l = e2.dias.flatMap((d) => d.linhas).find((x) => x.stagingId === '06689028');
    expect(l?.selo).toBe('Valor ≠');
    expect(l?.simbolo).toBe('≠');
    expect(e2.dias[0].confere).toBe(false);
  });

  it('sem par no banco (○) e você decide (!) do lado da planilha, sem lançamento ao lado', () => {
    const mais = [...staging,
      linhaCrua({ staging_id: 'sp-1', match_status: 'sem_match', excel_valor: 10, excel_data_pagamento: '2026-09-01', conta_filtro_id: CONTA_BB }),
      linhaCrua({ staging_id: 'amb-1', match_status: 'ambiguo', excel_valor: 20, excel_data_pagamento: '2026-09-01', conta_filtro_id: CONTA_BB })];
    const e3 = montarExtratoDaPlanilha(mais, espelhoBB0109(), CONTA_BB, new Set());
    const ls = e3.dias.flatMap((d) => d.linhas);
    expect(ls.find((l) => l.stagingId === 'sp-1')).toMatchObject({ simbolo: '○', sistema: null });
    expect(ls.find((l) => l.stagingId === 'amb-1')).toMatchObject({ simbolo: '!', sistema: null });
  });

  it('"Só não enriquecidos" tira as linhas enriquecidas e deixa o resto', () => {
    const so = soNaoEnriquecidos(ex.dias).flatMap((d) => d.linhas);
    expect(so.some((l) => l.enriquecida)).toBe(false);
    expect(so.map((l) => l.stagingId)).toContain('6d4f80f7');
    expect(so.length).toBeLessThan(linhas.length);
  });
});

describe('Extrato da planilha — a tela', () => {
  it('clicar na linha (ou no "⋯") abre a Mesa naquela linha, na conta', () => {
    ESPELHO.atual = espelhoBB0109();
    const onAbrirLinha = vi.fn();
    render(<ExtratoDaPlanilhaModal open onOpenChange={vi.fn()} clienteId="nj" anoMes="2026-09" mesRotulo="set/2026"
      staging={stagingBB0109()} contas={[{ id: CONTA_BB, nome: 'Banco do Brasil' }]} contaId={CONTA_BB}
      onContaId={vi.fn()} onAbrirLinha={onAbrirLinha} />);
    const linhas = screen.getAllByTestId('linha-extrato-planilha');
    const pro = linhas.find((tr) => tr.getAttribute('data-staging') === '6d4f80f7');
    if (!pro) throw new Error('sem a linha 6d4f80f7');
    fireEvent.click(pro);
    expect(onAbrirLinha).toHaveBeenLastCalledWith('6d4f80f7', CONTA_BB);
    fireEvent.click(within(linhas.find((tr) => tr.getAttribute('data-staging') === '9fd050ed') ?? pro).getByTestId('abrir-mesa'));
    expect(onAbrirLinha).toHaveBeenLastCalledWith('9fd050ed', CONTA_BB);
    expect(screen.getByTestId('fecho-dia')).toHaveTextContent('confere');
    expect(screen.getByTestId('legenda')).toHaveTextContent('↳ parte de um agrupamento');
    /* toda linha tem 18px */
    for (const tr of linhas) expect(tr.style.height).toBe('18px');
    /* "Só no sistema" não abre a Mesa: não há linha da planilha */
    const so = linhas.find((tr) => within(tr).queryByText('Só no sistema'));
    expect(so && within(so).queryByTestId('abrir-mesa')).toBeNull();
  });
});

/* ═══ PR-CONC-ENRIQUECER-V2-02 — o Extrato da planilha: referência × verdade, o dia fecha no fim, o mês congelado ═══ */
describe('Extrato da planilha — leitura limpa (V2-02)', () => {
  const abrirExtrato = () => render(<ExtratoDaPlanilhaModal open onOpenChange={vi.fn()} clienteId="nj" anoMes="2026-09"
    mesRotulo="set/2026" staging={stagingBB0109()} contas={[{ id: CONTA_BB, nome: 'Banco do Brasil' }]} contaId={CONTA_BB}
    onContaId={vi.fn()} onAbrirLinha={vi.fn()} />);

  it('o cabeçalho diz quem manda: "Planilha · referência" azul-claro, "Sistema · o que vale" navy', () => {
    ESPELHO.atual = espelhoBB0109();
    abrirExtrato();
    expect(screen.getByTestId('cabecalho-planilha')).toHaveTextContent('Planilha · referência');
    expect(screen.getByTestId('cabecalho-planilha').className).toMatch(/bg-blue-100 .*text-blue-900/);
    expect(screen.getByTestId('cabecalho-sistema')).toHaveTextContent('Sistema · o que vale');
    expect(screen.getByTestId('cabecalho-sistema').className).toMatch(/bg-primary .*text-primary-foreground/);
  });

  it('o dia FECHA no fim: "fechamento DD/MM" vem DEPOIS de todas as linhas do dia, no azul da Conferência', () => {
    ESPELHO.atual = espelhoBB0109();
    abrirExtrato();
    const corpo = screen.getByTestId('tabela-extrato-planilha').querySelector('tbody');
    if (!corpo) throw new Error('sem corpo');
    const trs = Array.from(corpo.querySelectorAll('tr'));
    const dias = trs.filter((tr) => tr.dataset.testid === 'dia');
    /* a busca prova que sabe achar: há dia e há linha */
    expect(dias.length).toBeGreaterThan(0);
    expect(trs.filter((tr) => tr.dataset.testid === 'linha-extrato-planilha').length).toBeGreaterThan(0);
    /* a última linha do corpo é um fechamento, e todo fechamento é precedido por uma linha do dia */
    expect(trs[trs.length - 1].dataset.testid).toBe('dia');
    for (const d of dias) expect(trs[trs.indexOf(d) - 1]?.dataset.testid).toBe('linha-extrato-planilha');
    expect(dias[0]).toHaveTextContent(/^fechamento 01\/09/);
    expect(dias[0].className).toMatch(/bg-primary\/10/);
    expect(within(dias[0]).getByTestId('fecho-dia')).toHaveTextContent('confere');
  });

  it('o fechamento do MÊS fica fora do scrollport, com planilha, sistema e confere/difere', () => {
    ESPELHO.atual = espelhoBB0109();
    abrirExtrato();
    const mes = screen.getByTestId('fechamento-mes');
    expect(mes).toHaveTextContent(/^Fechamento set\/2026 · planilha -?[\d.]+,\d{2} · sistema -?[\d.]+,\d{2} · (confere|difere R\$ -?[\d.]+,\d{2})$/);
    /* PR-CONC-ENRIQ-AGRUP-2b-TELA — o rodapé passou a 26px (o fechamento OU a barra da seleção, no mesmo lugar) */
    expect(screen.getByTestId('rodape-extrato').style.height).toBe('26px');
    expect(screen.getByTestId('rodape-extrato').contains(mes)).toBe(true);
    /* fora do scrollport: não é descendente da área que rola */
    expect(screen.getByTestId('tabela-extrato-planilha').parentElement?.contains(mes)).toBe(false);
  });

  it('a faixa do mês existe sem extrato, com "—"', () => {
    ESPELHO.atual = null;
    abrirExtrato();
    expect(screen.getByTestId('fechamento-mes')).toHaveTextContent('Fechamento set/2026 · —');
  });

  it('a soma é a dos totais do topo: P = entradas + saídas da planilha, S = do sistema', () => {
    render(<FechamentoDoMes mesRotulo="set/2026"
      totais={{ entradasBanco: 1000, saidasBanco: -400, entradasSistema: 1000, saidasSistema: -350.5 }} />);
    expect(screen.getByTestId('fechamento-mes')).toHaveTextContent('Fechamento set/2026 · planilha 600,00 · sistema 649,50 · difere R$ -49,50');
  });
});

/* ═══ PR-CONC-ENRIQ-AGRUP-2b-TELA — agrupar pela seleção e o status do lado Sistema ═══════════════════════════════════ */
describe('Extrato da planilha — agrupar pela seleção (2b-tela)', () => {
  /* a linha "sem par" de 506,51 no dia e o "Vivo Casa" só no sistema (e7970f00): o 1×1 do caso real do ↳ */
  const semPar = (staging_id: string, excel_valor: number) => linhaCrua({ staging_id, match_status: 'sem_match', excel_valor,
    excel_tipo_operacao: '2-Saídas', excel_data_pagamento: '2026-09-01', conta_filtro_id: CONTA_BB, excel_subcentro: 'Telefone',
    excel_fornecedor: 'TELEFONICA' });
  /* sp-1 (506,51) faz o 1×1 com o "Vivo Casa"; sp-2 + sp-3 (300,00 + 206,51) fazem o N×1 que FECHA com ele (fix1) */
  const comSemPar = () => [...stagingBB0109(), semPar('sp-1', 506.51), semPar('sp-2', 300), semPar('sp-3', 206.51)];
  const abrirSel = (onAgrupar?: (g: unknown) => Promise<{ ok: boolean; mensagem?: string }>) => render(
    <ExtratoDaPlanilhaModal open onOpenChange={vi.fn()} clienteId="nj" anoMes="2026-09" mesRotulo="set/2026"
      staging={comSemPar()} contas={[{ id: CONTA_BB, nome: 'Banco do Brasil' }]} contaId={CONTA_BB}
      onContaId={vi.fn()} onAbrirLinha={vi.fn()} onAgrupar={onAgrupar} />);
  const linhaDo = (pred: (tr: HTMLElement) => boolean) => {
    const tr = screen.getAllByTestId('linha-extrato-planilha').find(pred);
    if (!tr) throw new Error('linha não encontrada');
    return tr;
  };

  it('o que se marca: a linha sem par e o "Só no sistema"; a pareada, a filha e a Transferência não', () => {
    /* a interna: um lançamento sem par marcado como transferência entre contas do cliente */
    const esp = espelhoBB0109();
    const interna = { ...esp.sistema_completo[0], lancamento_id: 'tr-1', descricao: 'TED entre contas', valor_assinado: -1000 };
    const ex = montarExtratoDaPlanilha(comSemPar(), { ...esp, sistema_completo: [...esp.sistema_completo, interna] },
      CONTA_BB, new Set(['tr-1']));
    const ls = ex.dias.flatMap((d) => d.linhas);
    expect(ls.find((l) => l.stagingId === 'sp-1')?.selPlanilha).toBe('sp-1');
    expect(ls.find((l) => l.selo === 'Só no sistema')?.selSistema).toBe('e7970f00');
    /* a busca prova que sabe achar: há pareadas, filhas e a interna — e nenhuma é marcável */
    const pareadas = ls.filter((l) => l.planilha && l.sistema);
    const filhas = ls.filter((l) => l.filha);
    const internas = ls.filter((l) => l.selo === 'Transferência');
    expect(pareadas.length).toBeGreaterThan(0);
    expect(filhas.length).toBe(2);
    expect(internas.length).toBe(1);
    for (const l of [...pareadas, ...filhas, ...internas]) {
      expect(l.selPlanilha).toBeNull();
      expect(l.selSistema).toBeNull();
    }
    expect(ls.find((l) => l.selo === 'Desmembrar')).toMatchObject({ selPlanilha: null, selSistema: null });
  });

  it('as caixas: a linha sem par e o "Só no sistema" têm; a pareada não; 13 colunas no colgroup', () => {
    ESPELHO.atual = espelhoBB0109();
    abrirSel();
    expect(screen.getByTestId('tabela-extrato-planilha').querySelectorAll('colgroup col')).toHaveLength(13);
    expect(within(linhaDo((tr) => tr.dataset.staging === 'sp-1')).getByTestId('p-sel').querySelector('input')).not.toBeNull();
    const so = linhaDo((tr) => !!within(tr).queryByText('Só no sistema'));
    expect(within(so).getByTestId('s-sel').querySelector('input')).not.toBeNull();
    const pareada = linhaDo((tr) => tr.dataset.staging === '6d4f80f7');
    expect(within(pareada).getByTestId('p-sel').querySelector('input')).toBeNull();
    expect(within(pareada).getByTestId('s-sel').querySelector('input')).toBeNull();
    /* toda linha tem as duas células, mesmo vazias (layout fixo) */
    for (const tr of screen.getAllByTestId('linha-extrato-planilha')) expect(tr.querySelectorAll('td')).toHaveLength(13);
    for (const tr of screen.getAllByTestId('dia')) {
      const span = Array.from(tr.querySelectorAll('td')).reduce((a, td) => a + (Number(td.getAttribute('colspan')) || 1), 0);
      expect(span).toBe(13);
    }
  });

  it('o status do lado Sistema é a pílula do STATUS_PALETA, e a legenda não fala mais de origem', () => {
    ESPELHO.atual = espelhoBB0109();
    abrirSel();
    const st = within(linhaDo((tr) => tr.dataset.staging === '6d4f80f7')).getByTestId('status-sistema');
    expect(st).toHaveTextContent('Conciliado');
    expect(st.querySelector('span')?.className).toMatch(/bg-\[#166534\]/);
    expect(screen.getByTestId('legenda')).not.toHaveTextContent('origem');
  });

  it('marcar não abre a Mesa; 1×1 mostra "Casar" e a faixa tem a MESMA altura com e sem seleção', () => {
    ESPELHO.atual = espelhoBB0109();
    const onAbrir = vi.fn();
    render(<ExtratoDaPlanilhaModal open onOpenChange={vi.fn()} clienteId="nj" anoMes="2026-09" mesRotulo="set/2026"
      staging={comSemPar()} contas={[{ id: CONTA_BB, nome: 'Banco do Brasil' }]} contaId={CONTA_BB}
      onContaId={vi.fn()} onAbrirLinha={onAbrir} onAgrupar={vi.fn()} />);
    const alturaSem = screen.getByTestId('rodape-extrato').style.height;
    expect(screen.getByTestId('fechamento-mes')).toBeInTheDocument();
    fireEvent.click(within(linhaDo((tr) => tr.dataset.staging === 'sp-1')).getByRole('checkbox'));
    expect(onAbrir).not.toHaveBeenCalled();
    expect(screen.getByTestId('barra-selecao')).toHaveTextContent('marque também o outro lado');
    fireEvent.click(within(linhaDo((tr) => !!within(tr).queryByText('Só no sistema'))).getByRole('checkbox'));
    const barra = screen.getByTestId('barra-selecao');
    expect(barra).toHaveTextContent('marcados: 1 da planilha -506,51 · 1 do sistema -506,51');
    expect(screen.getByTestId('diferenca-selecao')).toHaveTextContent('diferença 0,00');
    expect(screen.getByTestId('botao-gesto')).toHaveTextContent('Casar');
    expect(screen.getByTestId('rodape-extrato').style.height).toBe(alturaSem);
    expect(screen.queryByTestId('fechamento-mes')).not.toBeInTheDocument();
  });

  /* o N×1 que fecha: sp-2 + sp-3 (−300,00 − 206,51) contra o "Vivo Casa" −506,51 — "Desmembrar em 2", confirmado NA barra */
  const marcarDesmembrar = () => {
    fireEvent.click(within(linhaDo((tr) => tr.dataset.staging === 'sp-2')).getByRole('checkbox'));
    fireEvent.click(within(linhaDo((tr) => tr.dataset.staging === 'sp-3')).getByRole('checkbox'));
    fireEvent.click(within(linhaDo((tr) => !!within(tr).queryByText('Só no sistema'))).getByRole('checkbox'));
  };
  const confirmarDesmembrar = () => {
    expect(screen.getByTestId('botao-gesto')).toHaveTextContent('Desmembrar em 2');
    expect(screen.getByTestId('botao-gesto')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('botao-gesto'));
    expect(screen.getByTestId('confirmar-gesto')).toHaveTextContent('Confirmar: cria 2 lançamentos e cancela o consolidado');
    fireEvent.click(screen.getByTestId('confirmar-gesto'));
  };

  it('o "Casar" 1×1 fica APAGADO, com a frase escrita ao lado e no title (fix1)', () => {
    ESPELHO.atual = espelhoBB0109();
    const onAgrupar = vi.fn(async () => ({ ok: true }));
    abrirSel(onAgrupar);
    fireEvent.click(within(linhaDo((tr) => tr.dataset.staging === 'sp-1')).getByRole('checkbox'));
    fireEvent.click(within(linhaDo((tr) => !!within(tr).queryByText('Só no sistema'))).getByRole('checkbox'));
    const botao = screen.getByTestId('botao-gesto');
    expect(botao).toHaveTextContent('Casar');
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', 'casar 1×1 em linha sem par ainda não tem gravação');
    expect(screen.getByTestId('recado-selecao')).toHaveTextContent('casar 1×1 em linha sem par ainda não tem gravação');
    fireEvent.click(botao);
    expect(onAgrupar).not.toHaveBeenCalled();
  });

  it('a recusa da RPC fica ESCRITA na barra e a seleção NÃO se desfaz', async () => {
    ESPELHO.atual = espelhoBB0109();
    const recusa = 'Lançamento vinculado a uma Operação Comercial não se desmembra: o caminho é a própria OC.';
    const onAgrupar = vi.fn(async () => ({ ok: false, mensagem: recusa }));
    abrirSel(onAgrupar);
    marcarDesmembrar();
    confirmarDesmembrar();
    await waitFor(() => expect(screen.getByTestId('recado-selecao')).toHaveTextContent(recusa));
    expect(onAgrupar).toHaveBeenCalledWith({ forma: 'desmembrar', stagingIds: ['sp-2', 'sp-3'], lancamentoIds: ['e7970f00'] });
    expect(screen.getByTestId('recado-selecao').className).toMatch(/text-\[#F5B5B5\]/);
    for (const id of ['sp-2', 'sp-3']) expect(within(linhaDo((tr) => tr.dataset.staging === id)).getByRole('checkbox')).toBeChecked();
    expect(within(linhaDo((tr) => !!within(tr).queryByText('Só no sistema'))).getByRole('checkbox')).toBeChecked();
  });

  it('o sucesso limpa a seleção e volta o fechamento do mês; "limpar" e Esc limpam', async () => {
    ESPELHO.atual = espelhoBB0109();
    const onAgrupar = vi.fn(async () => ({ ok: true }));
    abrirSel(onAgrupar);
    const marcar = marcarDesmembrar;
    marcar();
    confirmarDesmembrar();
    await waitFor(() => expect(screen.getByTestId('fechamento-mes')).toBeInTheDocument());
    expect(onAgrupar).toHaveBeenCalledWith({ forma: 'desmembrar', stagingIds: ['sp-2', 'sp-3'], lancamentoIds: ['e7970f00'] });
    marcar();
    fireEvent.click(screen.getByTestId('limpar-selecao'));
    expect(screen.getByTestId('fechamento-mes')).toBeInTheDocument();
    marcar();
    fireEvent.keyDown(screen.getByTestId('barra-selecao'), { key: 'Escape' });
    expect(screen.getByTestId('fechamento-mes')).toBeInTheDocument();
  });
});

/* ═══ MESA COMPACTA ═══════════════════════════════════════════════════════════════════════════════════════════════ */
const cls = (subcentro: string, escopo_negocio: string): ClassificacaoItem => ({
  id: subcentro, subcentro, escopo_negocio, macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo',
  centro_custo: 'Centro', tipo_operacao: '2-Saídas',
});
const CLASSIF = [cls('Salários e Encargos Pecuária', 'pecuaria'), cls('Seguros', 'administrativo')];
const COMPLETA = toRowVM(linhaCrua({
  staging_id: 's-ok', lanc_id: 'l-ok', match_status: 'divergente', lanc_valor: 480, excel_valor: 480, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', lanc_data_pagamento: '2026-09-01', lanc_conta_bancaria_id: 'bb', lanc_conta_bancaria_nome: 'BB',
  conta_filtro_id: 'bb', lanc_fazenda_id: 'f1', lanc_fazenda_nome: 'Faz. Pureza', lanc_descricao: 'Folha Pagamento',
  proposto_subcentro: 'Salários e Encargos Pecuária', proposto_subcentro_existe_no_plano: true,
}), [], { classificacoes: CLASSIF });
/* ⚠ "Resultado" diz "mantém" aqui (regra "nunca vazio"), e a cobrança antiga não via a falta: o checklist vê. */
const SEM_PLANO = toRowVM(linhaCrua({
  staging_id: 's-falta', lanc_id: 'l-falta', match_status: 'divergente', lanc_valor: 10, excel_valor: 10, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', lanc_data_pagamento: '2026-09-01', lanc_conta_bancaria_id: 'bb', lanc_conta_bancaria_nome: 'BB',
  conta_filtro_id: 'bb', lanc_fazenda_id: 'f1', lanc_fazenda_nome: 'Faz. Pureza', lanc_descricao: 'Pix',
}), [], { classificacoes: CLASSIF });

describe('Mesa compacta — o checklist', () => {
  it('a linha completa: tudo ✓, nada pendente', () => {
    const c = checklistDaLinha(COMPLETA, { classificacoes: CLASSIF });
    expect(c.map((i) => i.rotulo)).toEqual(['Pagamento', 'Atividade', 'Fazenda', 'Conta do plano', 'Descrição']);
    expect(c.every((i) => i.ok)).toBe(true);
    expect(pendenciasDaLinha(COMPLETA, { classificacoes: CLASSIF })).toEqual([]);
  });

  it('sem conta do plano: ● Conta do plano: vazio — e é a pendência que o rodapé escreve', () => {
    const c = checklistDaLinha(SEM_PLANO, { classificacoes: CLASSIF });
    expect(c.find((i) => i.rotulo === 'Conta do plano')).toEqual({ rotulo: 'Conta do plano', ok: false, motivo: 'vazio' });
    expect(pendenciasDaLinha(SEM_PLANO, { classificacoes: CLASSIF })).toContain('Conta do plano');
  });

  it('plano de outra atividade: "Conta do plano (de outra atividade)", a frase de antes', () => {
    expect(pendenciasDaLinha(COMPLETA, { classificacoes: CLASSIF, atividade: 'administrativo' }))
      .toEqual(['Conta do plano (de outra atividade)']);
  });

  it('transferência sem destino: ● Conta destino', () => {
    const t = toRowVM(linhaCrua({ ...{ staging_id: 's-t', lanc_id: 'l-t', lanc_valor: 5, excel_valor: 5, lanc_sinal: '-1',
      lanc_tipo_operacao: '3-Transferências', lanc_data_pagamento: '2026-09-01', lanc_conta_bancaria_id: 'bb',
      lanc_conta_bancaria_nome: 'BB', lanc_fazenda_id: 'f1', lanc_fazenda_nome: 'Faz', lanc_descricao: 'TED' } }), [], { classificacoes: CLASSIF });
    expect(pendenciasDaLinha(t, { classificacoes: CLASSIF })).toContain('Conta destino');
  });
});

/* PR-CONC-ENRIQUECER-V2-02 — o Pagamento virou três linhas na grade, mas o checklist continua com UM item "Pagamento". */
const SEM_EXTRATO = toRowVM(linhaCrua({
  staging_id: 's-sx', lanc_id: 'l-sx', match_status: 'divergente', lanc_valor: 480, excel_valor: 480, lanc_sinal: '-1',
  lanc_tipo_operacao: '2-Saídas', lanc_data_pagamento: null, lanc_conta_bancaria_id: 'bb', lanc_conta_bancaria_nome: 'BB',
  conta_filtro_id: 'bb', lanc_fazenda_id: 'f1', lanc_fazenda_nome: 'Faz. Pureza', lanc_descricao: 'Folha Pagamento',
  proposto_subcentro: 'Salários e Encargos Pecuária', proposto_subcentro_existe_no_plano: true,
}), [], { classificacoes: CLASSIF });

describe('Mesa — Pagamento em três linhas, checklist com um item (V2-02)', () => {
  it('sem data de pagamento no extrato: o checklist diz "Pagamento", nunca o rótulo da linha', () => {
    const c = checklistDaLinha(SEM_EXTRATO, { classificacoes: CLASSIF });
    expect(c.find((i) => i.rotulo === 'Pagamento')).toEqual({ rotulo: 'Pagamento', ok: false, motivo: 'sem extrato' });
    const p = pendenciasDaLinha(SEM_EXTRATO, { classificacoes: CLASSIF });
    expect(p).toEqual(['Pagamento']);
    for (const r of ['Data pgto.', 'Valor', 'Conta bancária']) expect(p).not.toContain(r);
  });

  it('na grade, o vermelho é POR CAMPO: só a Data pgto. (sem extrato) pinta; Valor e Conta bancária não', () => {
    render(<MesaCamposTabela row={SEM_EXTRATO} classificacoes={CLASSIF} onEditar={vi.fn(() => Promise.resolve())} />);
    expect(screen.getByTestId('extrato-Data pgto.')).toHaveTextContent('obrigatório');
    expect(screen.getByTestId('extrato-Data pgto.').className).toMatch(/border-destructive/);
    for (const r of ['Valor', 'Conta bancária']) {
      expect(screen.getByTestId(`extrato-${r}`).className).not.toMatch(/destructive/);
    }
    expect(screen.getByTestId('extrato-Valor')).toHaveTextContent('480,00');
    expect(screen.getByTestId('checklist-Pagamento')).toHaveTextContent('● Pagamento: sem extrato');
    expect(screen.queryByTitle('Pagamento')).not.toBeInTheDocument();
  });

  it('o "falta:" do rodapé continua dizendo "Pagamento"', () => {
    const motivo = `Falta preencher: ${pendenciasDaLinha(SEM_EXTRATO, { classificacoes: CLASSIF }).join(', ')}.`;
    render(<EnriquecimentoMesaModal open onOpenChange={vi.fn()} sessaoLabel="Imp 03"
      lista={{ rows: [SEM_EXTRATO], selecionadoId: SEM_EXTRATO.id, onSelecionar: vi.fn() }}
      detalhe={{ row: SEM_EXTRATO, classificacoes: CLASSIF }}
      actions={ACOES({ salvarMotivo: motivo, salvarDisabled: true })} contaId="bb" contaNome="BB"
      baldePorId={new Map([[SEM_EXTRATO.id, 'decide']])} />);
    expect(screen.getByTestId('falta')).toHaveTextContent(/^falta: Pagamento$/);
  });
});

const ACOES = (sobre: Record<string, unknown> = {}) => ({
  posicao: '1 / 2', onAnterior: vi.fn(), onProximo: vi.fn(), canAnterior: false, canProximo: true,
  revisado: false, onRevisado: vi.fn(), onSalvar: vi.fn(), onSalvarProximo: vi.fn(), onReverter: vi.fn(),
  onAplicarTodos: vi.fn(), nAplicaveis: 0, ...sobre,
});
const montarMesa = (row: ReturnType<typeof toRowVM>, acoes: ReturnType<typeof ACOES>) => render(
  <EnriquecimentoMesaModal open onOpenChange={vi.fn()} sessaoLabel="Imp 03"
    lista={{ rows: [COMPLETA, SEM_PLANO], selecionadoId: row.id, onSelecionar: vi.fn() }}
    detalhe={{ row, classificacoes: CLASSIF }} actions={acoes} contaId="bb" contaNome="BB"
    baldePorId={new Map([[COMPLETA.id, 'pronta'], [SEM_PLANO.id, 'gravada']])} />,
);

describe('Mesa compacta — a tela', () => {
  it('lista de 168px aberta na conta, itens de 16px com bolinha + fornecedor + valor, filtro Revisar/Feitas/Todas', () => {
    montarMesa(COMPLETA, ACOES());
    expect(LARGURA_LISTA_MESA).toBe('168px');
    const itens = screen.getAllByTestId('item-mesa');
    /* abre em "Revisar": só a pronta */
    expect(itens).toHaveLength(1);
    expect(itens[0].style.height).toBe(ALTURA_ITEM_LISTA);
    expect(itens[0].getAttribute('data-balde')).toBe('pronta');
    expect(screen.getByRole('button', { name: 'Revisar 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Feitas 1' }));
    expect(screen.getAllByTestId('item-mesa').map((i) => i.getAttribute('data-balde'))).toEqual(['gravada']);
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(screen.getAllByTestId('item-mesa')).toHaveLength(2);
  });

  it('cabeçalho: valor na cor do sinal, fornecedor · data · descrição do banco, selo, n / N', () => {
    montarMesa(COMPLETA, ACOES());
    const cab = screen.getByTestId('cabecalho-painel');
    expect(within(cab).getByText(/480,00/).className).toMatch(/red/);
    expect(cab).toHaveTextContent('Folha Pagamento');
    expect(within(cab).getByTestId('posicao')).toHaveTextContent('1 / 2');
    expect(within(cab).getByTestId('selo-regra')).toBeInTheDocument();
  });

  it('rodapé: ◀ ▶ Reverter | falta | Pular | Aprovar e próximo — e só eles', () => {
    montarMesa(COMPLETA, ACOES());
    const r = screen.getByTestId('rodape-mesa');
    expect(within(r).getAllByRole('button').map((b) => b.textContent)).toEqual(['◀', '▶', '↺ Reverter', 'Pular', 'Aprovar e próximo']);
    expect(within(r).queryByText('Salvar')).toBeNull();
  });

  it('com pendência: "Aprovar e próximo" apagado, e o "falta:" diz o quê', () => {
    montarMesa(SEM_PLANO, ACOES({ salvarDisabled: true, salvarMotivo: 'Falta preencher: Conta do plano.' }));
    expect(screen.getByTestId('aprovar')).toBeDisabled();
    expect(screen.getByTestId('falta')).toHaveTextContent('falta: Conta do plano');
    expect(screen.getByTestId('checklist-Conta do plano').getAttribute('data-ok')).toBe('nao');
  });

  it('Enter = Aprovar e próximo; num campo, o Enter é do campo; apagado, o Enter não grava', () => {
    const a = ACOES();
    const { unmount } = montarMesa(COMPLETA, a);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(a.onSalvarProximo).toHaveBeenCalledTimes(1);
    const campo = document.createElement('input'); document.body.appendChild(campo);
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(a.onSalvarProximo).toHaveBeenCalledTimes(1);
    /* depois de clicar num item da lista, o Enter aprova (o item é só navegação) */
    fireEvent.keyDown(screen.getAllByTestId('item-mesa')[0], { key: 'Enter' });
    expect(a.onSalvarProximo).toHaveBeenCalledTimes(2);
    unmount(); campo.remove();
    const b = ACOES({ salvarDisabled: true, salvarMotivo: 'Falta preencher: Conta do plano.' });
    montarMesa(SEM_PLANO, b);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(b.onSalvarProximo).not.toHaveBeenCalled();
  });

  it('Pular avança sem gravar', () => {
    const a = ACOES();
    montarMesa(COMPLETA, a);
    fireEvent.click(screen.getByTestId('pular'));
    expect(a.onProximo).toHaveBeenCalledTimes(1);
    expect(a.onSalvarProximo).not.toHaveBeenCalled();
  });
});
