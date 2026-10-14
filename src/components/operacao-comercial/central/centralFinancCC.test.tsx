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
import { readFileSync } from 'node:fs';
import { lerLoteContaCorrente, pagtoDaLinhaCC, financeiroDaLinhaCC, fraseDosDocumentos, numeroDoFinanceiro } from '@/lib/oc/listaContaCorrente';
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
/* OC Data Tipo Contraparte Faz Cab kg·méd. Valor | Entrega Comercializacao | Financeiro Pagto ⋯ (em Global) */
const fin = (id: string) => celulas(id)[10];
const pagto = (id: string) => celulas(id)[11];
const texto = (td: Element) => (td.textContent ?? '').replace(/\s+/g, ' ').trim();

beforeEach(() => reset());

describe('o dono puro', () => {
  it('le o lote; envelope torto nao vira numero; titulo sem cc', () => {
    const m = lerLoteContaCorrente({ a: { modelo: 'conta_corrente', envelope: null }, b: { modelo: 'titulo', envelope: null, docs_operacao: 2 } });
    expect(m.a).toBeUndefined();
    /* 01b: os blocos `despesas` e `programados` vem vazios no modelo titulo */
    expect(m.b).toEqual({ modelo: 'titulo', cc: null, docsOperacao: 2, docsFinanceiro: 0, despesas: [], programados: [] });
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
  it('financeiro: quitado sem numero "Liquidado"; programado "Programado" com o saldo; a receber; aguardando', () => {
    const L = lerLoteContaCorrente(FX.lote);
    expect(financeiroDaLinhaCC(L[id8('2d39d7e9')].cc!, 'abate')).toEqual({ valor: null, pilula: 'Liquidado', titulo: 'Liquidado', tom: 'sucesso' });
    expect(financeiroDaLinhaCC(L[id8('26fd02c1')].cc!, 'abate')).toEqual({ valor: 212449.03, pilula: 'Programado', titulo: 'Programado', tom: 'neutro' });
    const semProg = { ...L[id8('26fd02c1')].cc!, programado: 0 };
    expect(financeiroDaLinhaCC(semProg, 'abate').pilula).toBe('A receber');
    /* na compra o saldo do banco tem o sinal da fazenda (+ = falta pagar) */
    expect(financeiroDaLinhaCC({ ...semProg, saldo: 212449.03 }, 'compra').pilula).toBe('A pagar');
    expect(financeiroDaLinhaCC({ ...semProg, situacao: 'aguardando_saida' }, 'abate')).toMatchObject({ pilula: 'Aguardando', titulo: 'Aguardando a saída do gado' });
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
  it('26fd02c1: Financeiro "Programado" + "212.449" (a pilula a esquerda, o numero a direita); Pagto "Aguardando"', async () => {
    await montar();
    const id = id8('26fd02c1');
    expect(texto(fin(id))).toBe('Programado212.449');
    expect(within(fin(id)).getByText('Programado').getAttribute('title')).toBe('Programado');
    expect(texto(pagto(id))).toBe('Aguardando');
  });
  it('o clipe dos documentos da operação (02be1a41: 11) e o lugar vazio reservado (48972205: 0)', async () => {
    await montar();
    expect(within(celulas(id8('02be1a41'))[9]).getByTestId('clipe-operacao').getAttribute('title')).toBe('11 documentos da operação');
    expect(within(celulas(id8('48972205'))[9]).queryByTestId('clipe-operacao')).toBeNull();
    expect(within(celulas(id8('48972205'))[9]).getByTestId('clipe-operacao-vazio')).toBeTruthy();
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
    const com = celulas(OC_TITULO).slice(10, 12).map(texto);
    /* OC-LISTA-FINANC-CC-01c: quitada pela view = sem numero (a regra unica), a pilula por extenso */
    expect(com).toEqual(['Liquidado', 'Paga']);
    /* o clipe do lote vale tambem para o titulo */
    expect(within(fin(OC_TITULO)).getByTestId('clipe-financeiro').getAttribute('title')).toBe('1 documento no financeiro');
    um.unmount();
    reset(false);
    await montar();
    expect(celulas(OC_TITULO).slice(10, 12).map(texto)).toEqual(com);
  });
});

describe('Cab · kg méd. pelos lotes', () => {
  it('multilote: (36 × 461,72 + 18 × 456,61) ÷ 54 = 460 kg de peso medio; OC sem lote fica so com a cabeca', async () => {
    await montar();
    /* OC-LISTA-CAB-KG-COLUNAS-01 — "54" e "460" em celulas separadas; o "kg" so' no cabecalho */
    expect(texto(celulas(OC_MULTI)[5])).toBe('54');
    expect(texto(celulas(OC_MULTI)[6])).toBe('460');
    expect(texto(celulas(OC_TITULO)[5])).toBe('10');
    expect(texto(celulas(OC_TITULO)[6])).toBe('—');
  });
});

/* OC-LISTA-FINANC-CC-01b — o ponto ambar da linha em conta corrente le' as despesas do DONO (a view devolve nulo para essas OCs). */
describe('o ponto ambar em conta corrente', () => {
  it('todas as despesas pagas: nao acende (02be1a41, Fundersul e Iagro realizados)', async () => {
    await montar();
    expect(pagto(id8('02be1a41')).querySelector('[data-testid="despesa-pendente"]')).toBeNull();
  });
  it('uma despesa programada: acende e o title lista "descrição · favorecido — R$ valor"', async () => {
    const id = id8('02be1a41');
    const lote = banco.lote as Record<string, { despesas: unknown[] }>;
    lote[id] = { ...lote[id], despesas: [...lote[id].despesas,
      { descricao: 'Frete 070 Vacas', favorecido: 'Transp. Exemplo', valor: -1500, status: 'programado', vencimento: '2026-11-01' }] };
    await montar();
    const ponto = pagto(id).querySelector('[data-testid="despesa-pendente"]');
    expect(ponto?.getAttribute('title')).toBe('Frete 070 Vacas · Transp. Exemplo — R$\u00a01.500,00');
    /* o Pagto continua "Paga" (a despesa e' o outro lado) */
    expect(texto(pagto(id))).toBe('Paga');
  });
});

/* OC-LISTA-FINANC-CC-01c (Gabriel, 14/10/2026) — a regra unica do numero, as pilulas por extenso medidas, o Pagto centralizado e o
   clipe colado na pilula. */
const FONTE = readFileSync('src/components/operacao-comercial/central/CentralOperacoesComerciais.tsx', 'utf8');
describe('OC-LISTA-FINANC-CC-01c', () => {
  it('numeroDoFinanceiro: quitado ou zero ao centavo = sem numero; com falta, o proprio valor', () => {
    expect(numeroDoFinanceiro(2505586, true)).toBeNull();
    expect(numeroDoFinanceiro(0.004, false)).toBeNull();
    expect(numeroDoFinanceiro(null, false)).toBeNull();
    expect(numeroDoFinanceiro(-396975, false)).toBe(-396975);
  });
  it('linha titulo com falta (view "parcial"): o numero aparece A DIREITA da pilula; quitada nao', async () => {
    banco.tabelas.vw_oc_operacao_liquidacao = (banco.tabelas.vw_oc_operacao_liquidacao as { operacao_id: string }[])
      .map(l => l.operacao_id === OC_TITULO ? { ...l, estado_liquidacao: 'parcial', total_liquidado_valido: 400 } : l);
    await montar();
    const span = fin(OC_TITULO).querySelector('span.grid');
    const filhos = [...(span?.children ?? [])];
    expect(filhos[0].textContent).toBe('Parcial');
    expect(filhos[filhos.length - 1].getAttribute('data-testid')).toBe('fin-numero');
    expect(filhos[filhos.length - 1].textContent).toBe('1.000');
    expect(filhos[filhos.length - 1].className).toContain('text-right');
    expect(texto(pagto(OC_TITULO))).toBe('Parcial');
  });
  it('Pagto: a pilula centralizada na coluna, "Aguardando" vira pilula (nao texto solto)', async () => {
    await montar();
    const p = pagto(id8('26fd02c1'));
    expect(p.className).toContain('text-center');
    expect(within(p).getByText('Aguardando').className).toContain('w-[52px]');
  });
  it('Comercializacao: o clipe colado na pilula (pilula · clipe · Rasc.), o lugar do clipe reservado', async () => {
    await montar();
    const g = within(celulas(id8('02be1a41'))[9]).getByTestId('comercial');
    expect(g.className).toContain('grid-cols-[52px_10px_26px]');
    expect(g.children[1].getAttribute('data-testid')).toBe('clipe-operacao');
    expect(within(celulas(id8('48972205'))[9]).getByTestId('comercial').children[1].getAttribute('data-testid')).toBe('clipe-operacao-vazio');
  });
  /* MEDIDO no Chromium com a Inter (8px, peso 500), 14/10/2026: a largura do texto de cada rotulo da pilula de 52px. A pilula
     comporta 49px de texto (1,5 de respiro de cada lado). Rotulo novo entra nesta tabela medido, ou o teste reprova. */
  const MEDIDO: Record<string, number> = {
    Programada: 46.6, Fechada: 32.6, Cancelada: 40.6, Liquidado: 37.6, Programado: 46.9, Aguardando: 47.0, 'A receber': 37.5,
    'A pagar': 30.0, Adiantado: 39.0, Parcial: 25.8, 'Lançado': 32.9, 'Obrigação': 39.8, 'S/ lanc.': 28.7, Paga: 19.2,
    Excedente: 40.2, 'N/ paga': 30.2, 'S/ base': 28.8, Aberto: 26.0,
  };
  it('pilulas por extenso, todas medidas e cabendo nos 52px; nenhuma forma curta sobrou', () => {
    const LISTA = readFileSync('src/lib/oc/listaContaCorrente.ts', 'utf8');
    for (const t of ['Programada', 'Cancelada', 'Liquidado', 'Programado', 'Aguardando', 'Obrigação', 'Excedente']) {
      expect(FONTE.includes(`'${t}'`) || FONTE.includes(`>${t}<`) || LISTA.includes(`'${t}'`), t).toBe(true);
    }
    for (const curto of ["'Progr.'", "'Liquid.'", "'Aguard.'", "'Cancel.'", "'Obrig.'", "'Exced.'"]) {
      expect(FONTE.includes(curto) || LISTA.includes(curto), curto).toBe(false);
    }
    for (const [t, w] of Object.entries(MEDIDO)) expect(w, t).toBeLessThanOrEqual(49);
    expect(FONTE).toContain("w-[52px] overflow-hidden';");
  });
});
