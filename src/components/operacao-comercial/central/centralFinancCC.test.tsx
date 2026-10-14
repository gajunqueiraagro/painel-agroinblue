/**
 * OC-LISTA-FINANC-CC-01 (Gabriel, 14/10/2026) — a Central le' a OC em CONTA CORRENTE pelo dono (`oc_conta_corrente_lote`) e a do
 * modelo TITULO pelas views, uma fonte por linha. Os sete abates da Vera do relatorio da FASE 0, com os numeros REAIS do proto
 * (`listaFinancCC.fixture.json`: o lote e as duas views, que diziam "S/ lanc." / "Parcial" para OCs quitadas). Mais: a linha do
 * modelo titulo nao muda com o lote, o kg vem dos lotes (multilote incluso), o clipe, e o filtro Pagamento lendo o mesmo estado.
 * ⚠ O harness do supabase e do seletor e' o de `centralListaLayout.test.tsx` (o `Select` vira `<select>` nativo so' aqui).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import FX from './listaFinancCC.fixture.json';
import { lerLoteContaCorrente, pagtoDaLinhaCC, financeiroDaLinhaCC, fraseDosDocumentos } from '@/lib/oc/listaContaCorrente';
import { lerContaCorrente } from '@/lib/oc/contaCorrente';

const OC_TITULO = 'tttttttt-0000-0000-0000-000000000001';
const OC_MULTI = 'mmmmmmmm-0000-0000-0000-000000000002';
const op = (id: string, data: string, cab: number, acordado: number, modelo: string | undefined) => ({
  id, versao: 1, data_operacao: data, tipo_operacao: 'abate', contraparte_id: null, fazenda_id: 'faz-a',
  status_comercial: 'fechada', rascunho: false, entrega_encerrada: false, qtd_negociada: cab,
  peso_total_negociado_kg: null, valor_acordado: acordado, valor_total: acordado,
  ...(modelo === undefined ? {} : { modelo_financeiro: modelo }),
});
const banco: { lote: unknown; tabelas: Record<string, unknown[]> } = { lote: null, tabelas: {} };
function reset(comLote = true) {
  banco.lote = comLote ? { ...FX.lote, [OC_TITULO]: { modelo: 'titulo', envelope: null, docs_operacao: 2, docs_financeiro: 1 } } : {};
  banco.tabelas = {
    zoo_operacoes_comerciais: [
      ...FX.ops.map(o => op(o.id, o.data, o.cab, o.acordado, 'conta_corrente')),
      /* fixture ANTIGO, sem `modelo_financeiro`: segue no modelo titulo */
      op(OC_TITULO, '2024-01-01', 10, 1000, undefined),
      op(OC_MULTI, '2024-01-02', 54, 2000, 'titulo'),
    ],
    fazendas: [{ id: 'faz-a', nome: 'Faz. Pureza', codigo: 'PUR' }],
    vw_oc_operacao_compromissos_resumo: [...FX.vw_oc_operacao_compromissos_resumo,
      { operacao_id: OC_TITULO, modo: 'titulo', n_compromissos: 1, obrigacao_total: 1000, total_programado: 1000, total_materializado: 1000,
        total_liquidado: 1000, tem_compromissos: true, tem_partes_legadas: false, entrada_obrigacao: 1000, saida_obrigacao: 0,
        entrada_liquidado: 1000, saida_liquidado: 0, entrada_materializado: 1000, saida_materializado: 0, entrada_programado: 1000, saida_programado: 0 }],
    vw_oc_operacao_liquidacao: [...FX.vw_oc_operacao_liquidacao,
      { operacao_id: OC_TITULO, estado_liquidacao: 'quitada', base: 1000, total_liquidado_valido: 1000, despesas_pendentes: null }],
    zoo_operacao_lotes: [
      { operacao_id: OC_MULTI, qtd_negociada: 36, peso_medio_negociado_kg: 461.72, criterio_valor: 'kg', valor_informado: 10 },
      { operacao_id: OC_MULTI, qtd_negociada: 18, peso_medio_negociado_kg: 456.61, criterio_valor: 'kg', valor_informado: 10 },
    ],
  };
}
function construtor(tabela: string) {
  const resposta = () => ({ data: banco.tabelas[tabela] ?? [], error: null });
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
  b.then = (ok: (v: ReturnType<typeof resposta>) => unknown) => Promise.resolve(resposta()).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => construtor(t), rpc: vi.fn(async () => ({ data: banco.lote, error: null })) },
}));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-vera', nome: 'Vera' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: '__global__', nome: 'Global' }, isGlobal: true }) }));
vi.mock('@/hooks/useOperacaoComercial', () => ({ useOperacaoComercial: () => ({}) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/operacao-comercial/central/ResumoOperacoesModal', () => ({ ResumoOperacoesModal: () => null }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

import { CentralOperacoesComerciais } from '@/components/operacao-comercial/central/CentralOperacoesComerciais';

const montar = async () => {
  window.history.replaceState(null, '', '/');
  const r = render(<BrowserRouter><CentralOperacoesComerciais /></BrowserRouter>);
  await waitFor(() => expect(document.querySelector(`td[title="${OC_TITULO}"]`)).toBeTruthy());
  return r;
};
const id8 = (p: string) => FX.ops.find(o => o.id.startsWith(p))?.id ?? p;
const celulas = (id: string) => {
  const tr = document.querySelector(`td[title="${id}"]`)?.closest('tr');
  if (!tr) throw new Error(`sem a linha ${id}`);
  return [...tr.querySelectorAll('td')];
};
/* OC Data Tipo Contraparte Faz Cab·kg Valor | Entrega Comercializacao | Financeiro Pagto ⋯ (em Global) */
const fin = (id: string) => celulas(id)[9];
const pagto = (id: string) => celulas(id)[10];
const texto = (td: Element) => (td.textContent ?? '').replace(/\s+/g, ' ').trim();

beforeEach(() => reset());

describe('o dono puro', () => {
  it('le o lote; envelope torto nao vira numero; titulo sem cc', () => {
    const m = lerLoteContaCorrente({ a: { modelo: 'conta_corrente', envelope: null }, b: { modelo: 'titulo', envelope: null, docs_operacao: 2 } });
    expect(m.a).toBeUndefined();
    expect(m.b).toEqual({ modelo: 'titulo', cc: null, docsOperacao: 2, docsFinanceiro: 0 });
    /* `linhas` ausente vira [] (o lote nao manda as linhas) */
    expect(lerContaCorrente({ modelo: 'conta_corrente', entregue: 1 })?.linhas).toEqual([]);
  });
  it('pagto: quitado -> quitada, nada recebido -> nao_liquidada, parcial com o % sobre o LIQUIDO', () => {
    const vera = lerLoteContaCorrente(FX.lote)[id8('2d39d7e9')].cc!;
    expect(pagtoDaLinhaCC(vera, 'abate', null)).toMatchObject({ estado_liquidacao: 'quitada', base: 103006.06, total_liquidado_valido: 103006.06 });
    const parcial = { ...vera, situacao: 'falta_receber' as const, recebido: 50000, saldo: -53006.06 };
    expect(pagtoDaLinhaCC(parcial, 'abate', null).estado_liquidacao).toBe('parcial');
    const nada = lerLoteContaCorrente(FX.lote)[id8('26fd02c1')].cc!;
    expect(pagtoDaLinhaCC(nada, 'abate', 12).estado_liquidacao).toBe('nao_liquidada');
    expect(pagtoDaLinhaCC(nada, 'abate', 12).despesas_pendentes).toBe(12);
  });
  it('financeiro: quitado sem numero "Liquidado"; programado "Progr." com o saldo; a receber; aguardando', () => {
    const L = lerLoteContaCorrente(FX.lote);
    expect(financeiroDaLinhaCC(L[id8('2d39d7e9')].cc!, 'abate')).toEqual({ valor: null, pilula: 'Liquidado', titulo: 'Liquidado', tom: 'sucesso' });
    expect(financeiroDaLinhaCC(L[id8('26fd02c1')].cc!, 'abate')).toEqual({ valor: 212449.03, pilula: 'Progr.', titulo: 'Programado', tom: 'neutro' });
    const semProg = { ...L[id8('26fd02c1')].cc!, programado: 0 };
    expect(financeiroDaLinhaCC(semProg, 'abate').pilula).toBe('A receber');
    /* na compra o saldo do banco tem o sinal da fazenda (+ = falta pagar) */
    expect(financeiroDaLinhaCC({ ...semProg, saldo: 212449.03 }, 'compra').pilula).toBe('A pagar');
    expect(financeiroDaLinhaCC({ ...semProg, situacao: 'aguardando_saida' }, 'abate')).toMatchObject({ pilula: 'Aguard.', titulo: 'Aguardando a saída do gado' });
  });
  it('a frase do clipe', () => {
    expect(fraseDosDocumentos(0, 'operacao')).toBeNull();
    expect(fraseDosDocumentos(1, 'financeiro')).toBe('1 documento no financeiro');
    expect(fraseDosDocumentos(2, 'operacao')).toBe('2 documentos da operação');
  });
});

describe('os sete abates da Vera, na lista', () => {
  it('os cinco quitados com dedução e o sem dedução: Financeiro "Liquidado" sem numero, Pagto "Paga"', async () => {
    await montar();
    for (const p of ['2d39d7e9', '02be1a41', '6336c7fc', 'c80ebe9e', 'f93f1a2b', '48972205']) {
      const id = id8(p);
      expect(texto(fin(id)), p).toBe('Liquidado');
      expect(within(fin(id)).queryByText(/−|-\d/), p).toBeNull();
      expect(texto(pagto(id)), p).toBe('Paga');
    }
  });
  it('26fd02c1: Financeiro "212.449" + "Progr."; Pagto "aguardando"', async () => {
    await montar();
    const id = id8('26fd02c1');
    expect(texto(fin(id))).toBe('212.449Progr.');
    expect(within(fin(id)).getByText('Progr.').getAttribute('title')).toBe('Programado');
    expect(texto(pagto(id))).toBe('aguardando');
  });
  it('o clipe dos documentos da operação (02be1a41: 11) e o lugar vazio reservado (48972205: 0)', async () => {
    await montar();
    expect(within(celulas(id8('02be1a41'))[8]).getByTestId('clipe-operacao').getAttribute('title')).toBe('11 documentos da operação');
    expect(within(celulas(id8('48972205'))[8]).queryByTestId('clipe-operacao')).toBeNull();
    expect(within(celulas(id8('48972205'))[8]).getByTestId('clipe-operacao-vazio')).toBeTruthy();
    expect(within(fin(id8('02be1a41'))).getByTestId('clipe-financeiro-vazio')).toBeTruthy();
  });
  it('o filtro Pagamento lê o MESMO estado da coluna: as opcoes nao oferecem "parcial" (nenhuma linha o mostra)', async () => {
    await montar();
    const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'quitada'));
    if (!sel) throw new Error('sem o filtro de pagamento');
    expect([...sel.options].map(o => o.value)).not.toContain('parcial');
  });
});

describe('a linha do modelo titulo nao muda', () => {
  it('fixture antigo sem modelo_financeiro: Financeiro e Pagto pelas views, iguais com e sem o lote', async () => {
    const um = await montar();
    const com = celulas(OC_TITULO).slice(9, 11).map(texto);
    expect(com).toEqual(['1.000Liquid.', 'Paga']);
    /* o clipe do lote vale tambem para o titulo */
    expect(within(fin(OC_TITULO)).getByTestId('clipe-financeiro').getAttribute('title')).toBe('1 documento no financeiro');
    um.unmount();
    reset(false);
    await montar();
    expect(celulas(OC_TITULO).slice(9, 11).map(texto)).toEqual(com);
  });
});

describe('Cab · kg pelos lotes', () => {
  it('multilote: 36 × 461,72 + 18 × 456,61 = 24.841 kg; OC sem lote fica so com a cabeca', async () => {
    await montar();
    expect(texto(celulas(OC_MULTI)[5])).toBe('54 · 24.841 kg');
    expect(texto(celulas(OC_TITULO)[5])).toBe('10');
  });
});
