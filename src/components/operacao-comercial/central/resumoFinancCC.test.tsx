/**
 * OC-LISTA-FINANC-CC-01b (Gabriel, 14/10/2026) — o Resumo / PDF / Excel le' a OC em CONTA CORRENTE pelo dono (o lote que a Central
 * ja' carregou) e a do modelo TITULO pelas views, como sempre. Os sete abates da Vera com os numeros REAIS do proto
 * (`listaFinancCC.fixture.json`), mais o ponto ambar da lista lendo as despesas do dono.
 * ⚠ `carregarResumoOC` roda DE VERDADE (o supabase e' um construtor falso por tabela); jsPDF, autotable e xlsx sao espioes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FX from './listaFinancCC.fixture.json';
import {
  lerLoteContaCorrente, despesasEmAbertoCC, totalDespesasCC, totalDespesasEmAbertoCC, tituloDasDespesasEmAberto,
  programadosNaTela, linhaDoResumoCC, type ResumoListaOC,
} from '@/lib/oc/listaContaCorrente';

const autotable = vi.fn();
const planilhas: unknown[][][] = [];
vi.mock('jspdf', () => ({
  default: class {
    setFillColor() {} rect() {} setTextColor() {} setFontSize() {} setFont() {} text() {} setDrawColor() {}
    setLineWidth() {} line() {} addPage() {} setPage() {} save() {} roundedRect() {}
    getNumberOfPages() { return 1; }
    getTextWidth() { return 10; }
  },
}));
vi.mock('jspdf-autotable', () => ({ default: (...a: unknown[]) => autotable(...a) }));
vi.mock('xlsx', () => ({
  utils: { book_new: () => ({}), aoa_to_sheet: (aoa: unknown[][]) => { planilhas.push(aoa); return {}; }, book_append_sheet: () => {} },
  writeFile: () => {},
}));
vi.mock('@/lib/pdf/pdfChassi', () => ({
  carregarLogoBase64: () => Promise.reject(new Error('sem logo')), addLogoToDoc: () => {}, PALETA: { AZUL_PRIMARIO: [0, 0, 0] },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const TABELAS: Record<string, unknown[]> = {
  vw_oc_lotes_recebimento: FX.ops.map(o => ({ operacao_id: o.id, categoria_negociada: 'vacas', qtd_negociada: o.cab, qtd_recebida: o.cab })),
  vw_oc_operacao_liquidacao: FX.vw_oc_operacao_liquidacao.map(l => ({ ...l, valor_total: 0, saldo_operacao: 0 })),
  vw_oc_parcelas_materializacao: FX.vw_oc_parcelas_materializacao,
  zoo_operacao_movimentacoes: [],
  vw_oc_operacao_compromissos_resumo: FX.vw_oc_operacao_compromissos_resumo,
  vw_oc_compromissos_resumo: [], financeiro_plano_contas: [],
};
function construtor(tabela: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: TABELAS[tabela] ?? [], error: null }).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => construtor(t) } }));

import { carregarResumoOC, type OcResumoLinha } from '@/v2/lib/ocResumo';
import { ResumoOperacoesModal } from '@/components/operacao-comercial/central/ResumoOperacoesModal';

const LOTE = lerLoteContaCorrente(FX.lote);
const id8 = (p: string) => FX.ops.find(o => o.id.startsWith(p))?.id ?? p;
const ops = FX.ops.map(o => ({
  id: o.id, tipo_operacao: 'abate', data_operacao: o.data, contraparte_id: null, qtd_negociada: o.cab,
  valor_acordado: o.acordado, valor_total: o.acordado, status_comercial: 'fechada', modelo_financeiro: 'conta_corrente',
}));
const linhas = async (cc: Record<string, ResumoListaOC> | undefined = LOTE) => {
  const r = await carregarResumoOC('cli', ops, () => 'Frigorífico', cc);
  return { r, porId: new Map<string, OcResumoLinha>(r.blocos.flatMap(b => [...b.entrou, ...b.naoEntrou]).map(l => [l.operacao_id, l])) };
};
const resumo = (l: OcResumoLinha | undefined) => l && [l.valor, l.pago, l.faltaPagar, l.despesas, l.situacao];

beforeEach(() => { autotable.mockReset(); planilhas.length = 0; });

describe('o dono puro: despesas e programados', () => {
  it('total das despesas em modulo; em aberto = status fora de realizado/conciliado; o title lista cada uma', () => {
    const r = LOTE[id8('02be1a41')];
    expect(totalDespesasCC(r)).toBe(3057.06);
    expect(despesasEmAbertoCC(r)).toEqual([]);
    expect(tituloDasDespesasEmAberto(r)).toBeNull();
    const com: ResumoListaOC = { ...r, despesas: [...r.despesas, { descricao: 'Frete', favorecido: 'Transp. X', valor: -1500, status: 'programado', vencimento: '2026-11-01' }] };
    expect(totalDespesasEmAbertoCC(com)).toBe(1500);
    expect(tituloDasDespesasEmAberto(com)).toBe('Frete · Transp. X — R$ 1.500,00');
    expect(totalDespesasCC(LOTE[id8('2d39d7e9')])).toBeNull();
  });
  it('programados no lado da fazenda e a linha do Resumo pelo dono', () => {
    expect(programadosNaTela(LOTE[id8('26fd02c1')], 'abate')).toEqual([{ data: '2026-11-12', valor: 212449.03 }]);
    expect(linhaDoResumoCC(LOTE[id8('02be1a41')], 'abate')).toEqual({ valor: 367783.4, pago: 367783.4, falta: 0, despesas: 3057.06, estado: 'quitada' });
  });
});

describe('o Resumo dos sete abates da Vera', () => {
  it('quitados: líquido · recebido · 0 · despesas do dono · paga', async () => {
    const { porId } = await linhas();
    expect(resumo(porId.get(id8('02be1a41')))).toEqual([367783.4, 367783.4, 0, 3057.06, 'paga']);
    expect(resumo(porId.get(id8('6336c7fc')))).toEqual([147380.11, 147380.11, 0, 1080.85, 'paga']);
    expect(resumo(porId.get(id8('c80ebe9e')))).toEqual([102311.46, 102311.46, 0, 5772.83, 'paga']);
    expect(resumo(porId.get(id8('f93f1a2b')))).toEqual([174629.27, 174629.27, 0, 541.84, 'paga']);
    expect(resumo(porId.get(id8('2d39d7e9')))).toEqual([103006.06, 103006.06, 0, null, 'paga']);
    expect(resumo(porId.get(id8('48972205')))).toEqual([5453, 5453, 0, null, 'paga']);
  });
  it('26fd02c1: Falta 212.449,03 e o programado na lista "Falta receber"; a Graxaria 73a183eb da view some', async () => {
    const { r, porId } = await linhas();
    expect(resumo(porId.get(id8('26fd02c1')))?.slice(0, 4)).toEqual([212449.03, 0, 212449.03, null]);
    const falta = r.blocos[0].faltaPagar;
    expect(falta.map(p => [p.operacao_id, p.vencimento, p.valor])).toEqual([[id8('26fd02c1'), '2026-11-12', 212449.03]]);
    expect(falta.some(p => p.operacao_id === id8('c80ebe9e'))).toBe(false);
    expect(r.blocos[0].despesasEmAberto).toEqual([]);
  });
  it('sem o lote (modelo titulo / Central antiga): o caminho de sempre, pelas views', async () => {
    const { porId } = await linhas({});
    /* o defeito que o 01b fecha: a OC quitada sai "paga em parte" com Valor 0 */
    expect(resumo(porId.get(id8('02be1a41')))).toEqual([0, 0, 0, 3057.06, 'paga em parte']);
  });
});

describe('a previa, o PDF e o Excel imprimem os mesmos numeros', () => {
  it('a linha da 02be1a41 e o TOTAL iguais nos tres', async () => {
    const filtros = { produtor: 'Vera', fazenda: 'todas as fazendas', periodoIni: '', periodoFim: '', tipo: 'Abate', chips: [] };
    render(<ResumoOperacoesModal open onClose={vi.fn()} clienteId="cli" operacoes={ops} contaCorrente={LOTE} filtros={filtros}
      nomeContraparte={() => 'Frigorífico'} />);
    await waitFor(() => expect(screen.getAllByText('367.783,40').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText('PDF'));
    await waitFor(() => expect(autotable).toHaveBeenCalled());
    const { head, body, foot } = autotable.mock.calls[0][1] as { head: string[][]; body: string[][]; foot: string[][] };
    const c = (n: string) => head[0].indexOf(n);
    const linhaPdf = body.find(b => b.includes('367.783,40'));
    expect(linhaPdf?.[c('Recebido')]).toBe('367.783,40');
    expect(linhaPdf?.[c('Despesas')]).toBe('3.057,06');
    fireEvent.click(screen.getByText('Excel'));
    const [entrou] = planilhas;
    const ce = (n: string) => entrou[0].indexOf(n);
    const linhaXls = entrou.find(l => l[ce('Valor')] === 367783.4);
    expect(linhaXls?.[ce('Despesas')]).toBe(3057.06);
    const totalXls = entrou.find(l => l[2] === 'TOTAL');
    /* o TOTAL do PDF e o do Excel sao o mesmo numero */
    expect(foot[0][c('Valor')]).toBe((totalXls?.[ce('Valor')] as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(foot[0][c('Recebido')]).toBe((totalXls?.[ce('Recebido / pago')] as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  });
});
