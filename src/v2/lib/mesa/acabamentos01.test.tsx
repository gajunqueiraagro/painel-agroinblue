/**
 * PR-CONC-ENRIQ-ACABAMENTOS-01 — quatro acabamentos da homologação (NJ, set/26), só tela.
 *
 * D1 importação antiga: o aviso no painel (com o link) e o selo no Extrato da planilha e na Mesa; a mais recente, nada.
 * D2 "Só não enriquecidos": também tira o bloco conferido vivo (as duas pontas); o cabeçalho e as somas não mudam.
 * D3 par fora da vista: texto cinza (fora do mês / outra conta / cancelado) no lado Sistema; par no mês, como antes.
 * D4 Identificação: Descrição antes do Fornecedor (só a ORDEM); o checklist não muda.
 *
 * ⚠ O jsdom NÃO MEDE: as alturas e larguras renderizadas vão no relatório.
 * ⚠ A ABA (MesaEnriquecimentoTab) NÃO TEM TESTE DE RENDER no repo (precisa de cliente, sessões, staging e espelho): o link
 *   "ir para a mais recente" se prova pelo CONTRATO DA FONTE (o clique troca a sessão para a mais recente), como o
 *   "nenhum toast" do desfazerSplit.test.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClassificacaoStagingPreviewRow, SessaoClassificacaoResumo } from '@/v2/hooks/useClassificacaoStaging';
import { linhaCrua } from '@/v2/lib/mesa/linhaCrua.fixture';
import { CONTA_BB, espelhoBB0109, stagingBB0109 } from '@/v2/lib/mesa/enriquecerV2.fixture';
import { montarExtratoDaPlanilha, parForaDaVista, soNaoEnriquecidos } from '@/v2/lib/mesa/extratoDaPlanilha';
import { sessaoMaisNovaQueAberta, toRowVM } from '@/v2/lib/mesa/enriquecimentoView';

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

import { ExtratoDaPlanilhaModal } from '@/v2/components/mesa/enriquecimento/ExtratoDaPlanilhaModal';
import {
  EnriquecimentoMesaModal, textoImportacaoAntiga,
} from '@/v2/components/mesa/enriquecimento/EnriquecimentoMesaModal';
import { PainelContasEnriquecer } from '@/v2/components/mesa/enriquecimento/PainelContasEnriquecer';
import {
  ROTULOS_DA_GRADE, checklistDaLinha, MesaCamposTabela,
} from '@/v2/components/mesa/enriquecimento/MesaCamposTabela';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

const st = (s: string): Partial<ClassificacaoStagingPreviewRow> => JSON.parse(JSON.stringify({ match_status: s }));

/* ═══ D1 — a importação antiga ═══════════════════════════════════════════════════════════════════════════════════ */
/* As duas importações do NJ set/26 (Imp 03 e Imp 04), mais uma de agosto que não entra na peneira do mês. */
const SESSAO = (sessao_id: string, criada_em: string, excel_ano_mes: string): SessaoClassificacaoResumo => JSON.parse(JSON.stringify({
  sessao_id, criada_em, excel_ano_mes, total: 10, exatos: 0, ambiguos: 0, aplicados: 0,
}));
const SESSOES = [
  SESSAO('imp01', '2026-09-20T10:00:00Z', '2026-09'), SESSAO('imp02', '2026-09-25T10:00:00Z', '2026-09'),
  SESSAO('8d6efeb7', '2026-10-01T11:00:00Z', '2026-09'), SESSAO('dfd0f02c', '2026-10-02T15:27:00Z', '2026-09'),
  SESSAO('ago-nova', '2026-10-03T08:00:00Z', '2026-08'),
];

describe('D1 — qual é a importação antiga', () => {
  it('a aberta é antiga: a mais recente do MESMO mês (Imp 04 · 02/10 15:27), nunca a de outro mês', () => {
    const r = sessaoMaisNovaQueAberta(SESSOES, '2026-09', '8d6efeb7');
    expect(r).toMatchObject({ id: 'dfd0f02c', imp: 'Imp 04' });
    if (!r) throw new Error('sem a mais recente');
    expect(textoImportacaoAntiga(r)).toBe('importação antiga · a mais recente é Imp 04 · 02/10 15:27');
  });

  it('a aberta é a mais recente: nenhum aviso', () => {
    expect(sessaoMaisNovaQueAberta(SESSOES, '2026-09', 'dfd0f02c')).toBeNull();
    /* a prova de que a busca sabe achar: a de agosto, mais nova no relógio, não conta para setembro */
    expect(sessaoMaisNovaQueAberta(SESSOES, '2026-08', 'ago-nova')).toBeNull();
  });
});

describe('D1 — o aviso nos três lugares', () => {
  const MAIS_RECENTE = { imp: 'Imp 04', criadaEm: '2026-10-02T15:27:00Z' };

  it('Extrato da planilha: selo "importação antiga" no cabeçalho, a frase no title; sem ela, nenhum selo', () => {
    ESPELHO.atual = espelhoBB0109();
    const abrir = (antiga: typeof MAIS_RECENTE | null) => render(
      <ExtratoDaPlanilhaModal open onOpenChange={vi.fn()} clienteId="nj" anoMes="2026-09" mesRotulo="set/2026"
        staging={stagingBB0109()} contas={[{ id: CONTA_BB, nome: 'Banco do Brasil' }]} contaId={CONTA_BB}
        onContaId={vi.fn()} onAbrirLinha={vi.fn()} importacaoMaisRecente={antiga} />);
    const { unmount } = abrir(MAIS_RECENTE);
    const selo = screen.getByTestId('selo-importacao-antiga');
    expect(selo).toHaveTextContent(/^importação antiga$/);
    expect(selo.getAttribute('title')).toMatch(/^importação antiga · a mais recente é Imp 04 · 02\/10 15:27/);
    expect(selo.className).toMatch(/shrink-0/);
    expect(selo.className).toMatch(/text-\[9\.5px\]/);
    unmount();
    abrir(null);
    expect(screen.queryByTestId('selo-importacao-antiga')).toBeNull();
  });

  it('Mesa: o mesmo selo ao lado do rótulo da sessão; sem ela, nenhum', () => {
    const row = toRowVM(linhaCrua({ staging_id: 's-1' }), [], {});
    const ACOES = {
      posicao: '1 / 1', onAnterior: vi.fn(), onProximo: vi.fn(), canAnterior: false, canProximo: false,
      revisado: false, onRevisado: vi.fn(), onSalvar: vi.fn(), onSalvarProximo: vi.fn(), onReverter: vi.fn(),
      onAplicarTodos: vi.fn(), nAplicaveis: 0,
    };
    const abrir = (antiga: typeof MAIS_RECENTE | null) => render(
      <EnriquecimentoMesaModal open onOpenChange={vi.fn()} sessaoLabel="set/2026 · Imp 03 · 01/10 11:00 · 10 linhas"
        importacaoMaisRecente={antiga}
        lista={{ rows: [row], selecionadoId: row.id, onSelecionar: vi.fn() }}
        detalhe={{ row, onEditar: vi.fn(() => Promise.resolve()) }}
        actions={ACOES} contaId={null} contaNome="BB" baldePorId={new Map([[row.id, 'pronta']])} filtroInicial="todas" />);
    const { unmount } = abrir(MAIS_RECENTE);
    expect(screen.getByTestId('selo-importacao-antiga')).toHaveTextContent('importação antiga');
    expect(screen.getByText('set/2026 · Imp 03 · 01/10 11:00 · 10 linhas')).toBeInTheDocument();
    unmount();
    abrir(null);
    expect(screen.queryByTestId('selo-importacao-antiga')).toBeNull();
  });

  it('painel: o aviso por extenso vem ANTES do "sem conta", no slot de 18px, e o link não encolhe', () => {
    render(<PainelContasEnriquecer mesRotulo="set/2026" clienteNome="NJ Pecuária" seletorSessao={<span>Imp 03</span>}
      linhas={[]} mesCurto="set/26" filtro="todas" onFiltro={vi.fn()} pendentesDePara={0} onPlanilha={vi.fn()}
      onExtrato={vi.fn()} onRevisar={vi.fn()} gravarN={0} gravando={false} onGravar={vi.fn()}
      menu={[]} avisos={[
        { id: 'aviso-sessao-mais-nova', texto: 'importação antiga · a mais recente é Imp 04 · 02/10 15:27 ·', cls: 'text-amber-700',
          conteudo: <><span>importação antiga · a mais recente é Imp 04 · 02/10 15:27 ·</span><button type="button">ir para a mais recente</button></> },
        { id: 'aviso-sem-conta', texto: '1 linha desta planilha ficou sem conta — reimporte a planilha.', cls: 'text-amber-800',
          conteudo: <span>1 linha desta planilha ficou sem conta — reimporte a planilha.</span> },
      ]} />);
    const slot = screen.getByTestId('slot-aviso-painel');
    expect(slot.className).toMatch(/h-\[18px\]/);
    const ids = Array.from(slot.children).map((c) => c.getAttribute('data-testid'));
    expect(ids).toEqual(['aviso-sessao-mais-nova', 'aviso-sem-conta']);
    expect(slot.getAttribute('title')).toMatch(/^importação antiga · a mais recente é Imp 04 · 02\/10 15:27 · · 1 linha/);
  });

  it('a aba: o aviso usa o texto do D1, vem antes do "sem conta", o link TROCA a sessão para a mais recente e o selo vai aos dois modais', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/v2/components/mesa/enriquecimento/MesaEnriquecimentoTab.tsx'), 'utf8');
    const i = src.indexOf("id: 'aviso-sessao-mais-nova'");
    const j = src.indexOf("id: 'aviso-sem-conta'");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    /* PR-CONC-ENRIQ-IMPORT-ATOMICA-01: na importação incompleta o slot é só dela — a condição ganhou `&& !sessaoBloqueada` */
    const ini = src.lastIndexOf('if (sessaoMaisNova && !sessaoBloqueada) {', i);
    expect(ini).toBeGreaterThan(0);
    const bloco = src.slice(ini, src.indexOf('\n  }\n', ini));
    expect(bloco).toMatch(/textoImportacaoAntiga\(sessaoMaisNova\)/);
    expect(bloco).toMatch(/onClick=\{\(\) => \{ setSessaoId\(sessaoMaisNova\.id\);/);
    expect(bloco).toMatch(/>ir para a mais recente</);
    /* sem "…": o texto corta na borda */
    expect(bloco).not.toMatch(/truncate/);
    expect((src.match(/importacaoMaisRecente=\{sessaoMaisNova\}/g) ?? []).length).toBe(2);
  });
});

/* ═══ D2 — "Só não enriquecidos" tira o bloco conferido vivo ═════════════════════════════════════════════════════ */
const linhaPl = (staging_id: string, excel_valor: number, sobre: Partial<ClassificacaoStagingPreviewRow> = {}) => linhaCrua({
  staging_id, match_status: 'sem_match', excel_valor, excel_tipo_operacao: '2-Saídas', excel_data_pagamento: '2026-09-01',
  conta_filtro_id: CONTA_BB, excel_subcentro: 'Telefone', excel_fornecedor: 'TELEFONICA', ...sobre,
});
const emBloco = (staging_id: string, excel_valor: number) => linhaPl(staging_id, excel_valor, {
  ...st('conferido_bloco'), match_lancamento_ids: ['e7970f00'], casamento_meta: { bloco_id: 'b1' },
});
const comBloco = () => [...stagingBB0109(), emBloco('bl-1', 300), emBloco('bl-2', 206.51), linhaPl('sp-9', 50)];

describe('D2 — "Só não enriquecidos" e o bloco conferido', () => {
  it('ligado: some a linha em bloco E o lançamento "Em bloco"; desligado: os dois aparecem', () => {
    const ex = montarExtratoDaPlanilha(comBloco(), espelhoBB0109(), CONTA_BB, new Set());
    const todas = ex.dias.flatMap((d) => d.linhas);
    /* a busca sabe achar: com o filtro desligado o bloco está lá (2 linhas + 1 lançamento) */
    expect(todas.filter((l) => l.blocoId === 'b1')).toHaveLength(3);
    expect(todas.some((l) => l.selo === 'Em bloco')).toBe(true);
    const so = soNaoEnriquecidos(ex.dias).flatMap((d) => d.linhas);
    expect(so.some((l) => l.blocoId)).toBe(false);
    expect(so.some((l) => l.selo === 'Em bloco')).toBe(false);
    /* o resto continua: a linha sem par e o "Só no sistema" fora do bloco */
    expect(so.some((l) => l.stagingId === 'sp-9')).toBe(true);
    expect(so.length).toBeGreaterThan(0);
  });

  it('o dia que fica vazio some; o fecho do dia que fica é o mesmo do extrato inteiro', () => {
    /* um dia SÓ de bloco (05/09): a linha em bloco e o lançamento dela */
    const esp = espelhoBB0109();
    esp.sistema_completo = [...esp.sistema_completo, { ...esp.sistema_completo[3], lancamento_id: 'bloco-05', data: '2026-09-05' }];
    const staging = [...stagingBB0109(), linhaPl('bl-5', 506.51, {
      ...st('conferido_bloco'), excel_data_pagamento: '2026-09-05', match_lancamento_ids: ['bloco-05'], casamento_meta: { bloco_id: 'b5' },
    })];
    const ex = montarExtratoDaPlanilha(staging, esp, CONTA_BB, new Set());
    expect(ex.dias.map((d) => d.data)).toContain('2026-09-05');
    const so = soNaoEnriquecidos(ex.dias);
    expect(so.map((d) => d.data)).not.toContain('2026-09-05');
    for (const d of so) {
      const orig = ex.dias.find((x) => x.data === d.data);
      expect({ p: d.planilha, s: d.sistema, c: d.confere }).toEqual({ p: orig?.planilha, s: orig?.sistema, c: orig?.confere });
    }
  });

  it('a tela: o contador e os totais do cabeçalho são os mesmos com o filtro ligado e desligado', () => {
    ESPELHO.atual = espelhoBB0109();
    render(<ExtratoDaPlanilhaModal open onOpenChange={vi.fn()} clienteId="nj" anoMes="2026-09" mesRotulo="set/2026"
      staging={comBloco()} contas={[{ id: CONTA_BB, nome: 'Banco do Brasil' }]} contaId={CONTA_BB}
      onContaId={vi.fn()} onAbrirLinha={vi.fn()} />);
    const cab = () => screen.getByTestId('totais-extrato-planilha').textContent;
    const fecho = () => screen.getByTestId('fechamento-mes').textContent;
    const antes = { cab: cab(), fecho: fecho(), n: screen.getAllByTestId('linha-extrato-planilha').length };
    expect(antes.cab).toMatch(/13 linhas da planilha · 10 lançamentos do sistema/);
    expect(screen.getAllByTestId('selo').some((s) => s.textContent === 'Em bloco')).toBe(true);
    fireEvent.click(screen.getByTestId('so-nao-enriquecidos'));
    expect(cab()).toBe(antes.cab);
    expect(fecho()).toBe(antes.fecho);
    expect(screen.getAllByTestId('linha-extrato-planilha').length).toBeLessThan(antes.n);
    expect(screen.queryAllByTestId('selo').some((s) => s.textContent === 'Em bloco')).toBe(false);
    fireEvent.click(screen.getByTestId('so-nao-enriquecidos'));
    expect(screen.getAllByTestId('linha-extrato-planilha')).toHaveLength(antes.n);
  });
});

/* ═══ D3 — o par fora da vista ═══════════════════════════════════════════════════════════════════════════════════ */
describe('D3 — o par fora do mês / da conta / cancelado', () => {
  const comPar = (sobre: Partial<ClassificacaoStagingPreviewRow>) => linhaPl('par-1', 1690.71, {
    match_status: 'exato', lanc_id: 'tokio', lanc_sinal: '-1', lanc_valor: 1690.71, lanc_descricao: 'TOKIO MARINE',
    lanc_conta_bancaria_id: CONTA_BB, lanc_conta_bancaria_nome: 'Banco do Brasil', ...sobre,
  });

  it('fora do mês: "par em DD/MM/AAAA · fora do mês"', () => {
    expect(parForaDaVista(comPar({ lanc_data_pagamento: '2026-10-10' }), CONTA_BB, '2026-09')).toMatchObject({
      texto: 'par em 10/10/2026 · fora do mês',
    });
  });

  it('outra conta: "· outra conta: <nome>" (pela direção: saída → bancária, entrada → destino)', () => {
    expect(parForaDaVista(comPar({ lanc_data_pagamento: '2026-09-10', lanc_conta_bancaria_id: 'sicredi',
      lanc_conta_bancaria_nome: 'Sicredi Lavoura' }), CONTA_BB, '2026-09')?.texto).toBe('par em 10/09/2026 · outra conta: Sicredi Lavoura');
    expect(parForaDaVista(comPar({ lanc_sinal: '1', lanc_data_pagamento: '2026-10-01', lanc_conta_bancaria_id: null,
      lanc_conta_bancaria_nome: null, lanc_conta_destino_id: 'itau', lanc_conta_destino_nome: 'Itaú BBA' }), CONTA_BB, '2026-09')?.texto)
      .toBe('par em 01/10/2026 · fora do mês · outra conta: Itaú BBA');
  });

  it('cancelado: "par cancelado"; o title explica e nenhum valor ou status é inventado', () => {
    const p = parForaDaVista(comPar({ lanc_cancelado: true, lanc_data_pagamento: '2026-09-10' }), CONTA_BB, '2026-09');
    expect(p?.texto).toBe('par cancelado');
    expect(p?.titulo).toMatch(/cancelado/);
    expect(p?.texto).not.toMatch(/\d+,\d{2}|Realizado|Conciliado/);
  });

  it('par no mês e na conta que o Espelho não traz: nada a dizer (null) — sem par, também', () => {
    expect(parForaDaVista(comPar({ lanc_data_pagamento: '2026-09-10' }), CONTA_BB, '2026-09')).toBeNull();
    expect(parForaDaVista(linhaPl('sp', 10), CONTA_BB, '2026-09')).toBeNull();
  });

  it('no Extrato: a linha com par fora do mês leva o texto cinza no lado Sistema (4 células) e o clique abre a Mesa', () => {
    ESPELHO.atual = espelhoBB0109();
    const onAbrirLinha = vi.fn();
    render(<ExtratoDaPlanilhaModal open onOpenChange={vi.fn()} clienteId="nj" anoMes="2026-09" mesRotulo="set/2026"
      staging={[...stagingBB0109(), comPar({ lanc_data_pagamento: '2026-10-10' })]}
      contas={[{ id: CONTA_BB, nome: 'Banco do Brasil' }]} contaId={CONTA_BB} onContaId={vi.fn()} onAbrirLinha={onAbrirLinha} />);
    const linhas = screen.getAllByTestId('linha-extrato-planilha');
    const tr = linhas.find((el) => el.getAttribute('data-staging') === 'par-1');
    if (!tr) throw new Error('sem a linha par-1');
    const cel = within(tr).getByTestId('par-fora');
    expect(cel).toHaveTextContent('par em 10/10/2026 · fora do mês');
    expect(cel.getAttribute('colspan')).toBe('4');
    expect(cel.className).toMatch(/text-muted-foreground/);
    expect(cel.getAttribute('title')).toMatch(/TOKIO MARINE.*outro mês/);
    expect(within(tr).getByTestId('status-sistema')).toBeEmptyDOMElement();
    /* o mesmo número de células de toda linha (colgroup intacto): 4 viraram 1 com colspan 4 */
    const colunas = (el: HTMLElement) => Array.from(el.children).reduce((a, td) => a + Number(td.getAttribute('colspan') ?? 1), 0);
    expect(colunas(tr)).toBe(colunas(linhas[0]));
    fireEvent.click(tr);
    expect(onAbrirLinha).toHaveBeenLastCalledWith('par-1', CONTA_BB);
    /* o par no mês continua como hoje: nenhuma célula cinza nas linhas do fixture */
    expect(linhas.filter((el) => within(el).queryByTestId('par-fora'))).toHaveLength(1);
  });
});

/* ═══ D4 — Descrição antes do Fornecedor ═════════════════════════════════════════════════════════════════════════ */
describe('D4 — a ordem da Identificação', () => {
  it('na ORDEM, Descrição vem antes de Fornecedor; o resto da grade não se mexe', () => {
    const i = ROTULOS_DA_GRADE.indexOf('Descrição');
    expect(i).toBeGreaterThan(-1);
    expect(ROTULOS_DA_GRADE[i + 1]).toBe('Fornecedor');
    expect(ROTULOS_DA_GRADE).toHaveLength(15);
  });

  it('no render, a linha da Descrição vem antes da do Fornecedor', () => {
    const row = toRowVM(linhaCrua({ staging_id: 's-1' }), [], {});
    render(<MesaCamposTabela row={row} />);
    const desc = screen.getByTestId('linha-Descrição');
    const forn = screen.getByTestId('linha-Fornecedor');
    expect(desc.compareDocumentPosition(forn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('o checklist não muda: Pagamento · Descrição · Fazenda · Plano de contas (sem Fornecedor)', () => {
    const row = toRowVM(linhaCrua({ staging_id: 's-1' }), [], {});
    expect(checklistDaLinha(row, {}).map((c) => c.rotulo)).toEqual(['Pagamento', 'Descrição', 'Fazenda', 'Plano de contas']);
  });
});
