/**
 * OC-LISTA-LAYOUT-01 (Gabriel, 14/10/2026) — a Central de OCs: colunas na ordem do processo, a barra a 24px em duas linhas, o filtro
 * de fazenda em memoria, e os botoes de criar fora da lista.
 * ⚠ O `Select` do Radix nao abre no jsdom: aqui ele vira um `<select>` nativo (so' neste arquivo), para o filtro ser exercitado de
 *   verdade. O harness do supabase e do seletor lateral e' o de `centralFazendaGlobal.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const OC_A1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const OC_A2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const OC_B = 'bbbbbbbb-0000-0000-0000-000000000003';
const op = (id: string, fazenda_id: string, data: string) => ({
  id, versao: 1, data_operacao: data, tipo_operacao: 'abate', contraparte_id: null, fazenda_id,
  status_comercial: 'fechada', rascunho: false, entrega_encerrada: false, qtd_negociada: 10,
  peso_total_negociado_kg: null, valor_acordado: 1000, valor_total: 1000,
});
const TABELAS: Record<string, unknown[]> = {
  zoo_operacoes_comerciais: [op(OC_A1, 'faz-a', '2026-09-03'), op(OC_A2, 'faz-a', '2026-09-02'), op(OC_B, 'faz-b', '2026-09-01')],
  fazendas: [{ id: 'faz-b', nome: 'Faz Baia Grande', codigo: 'BG' }, { id: 'faz-a', nome: 'Faz. 3 Muchachas', codigo: '3M' }],
};
function construtor(tabela: string) {
  const resposta = { data: TABELAS[tabela] ?? [], error: null };
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
  b.then = (ok: (v: typeof resposta) => unknown) => Promise.resolve(resposta).then(ok);
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => construtor(t), rpc: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-vera', nome: 'Vera' } }) }));
const seletor: { fazendaAtual: { id: string; nome: string } | null; isGlobal: boolean } = { fazendaAtual: null, isGlobal: true };
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => seletor }));
vi.mock('@/hooks/useOperacaoComercial', () => ({ useOperacaoComercial: () => ({}) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/operacao-comercial/central/ResumoOperacoesModal', () => ({ ResumoOperacoesModal: () => null }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, disabled, children }: { value: string; onValueChange: (v: string) => void; disabled?: boolean; children: ReactNode }) => (
    <select value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
/* PASSO 8 do FIN-FINANC-28 — o filtro de fazenda e' o seletor da casa COM BUSCA; aqui ele vira o mesmo `<select>` nativo dos outros. */
vi.mock('@/components/ui/searchable-select', () => ({
  SearchableSelect: ({ value, onValueChange, options, allValue, allLabel, semTodos, disabled }:
    { value: string; onValueChange: (v: string) => void; options: { value: string; label: string }[]; allValue: string; allLabel: string; semTodos?: boolean; disabled?: boolean }) => (
    <select value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}>
      {!semTodos && <option value={allValue}>{allLabel}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

import { CentralOperacoesComerciais } from '@/components/operacao-comercial/central/CentralOperacoesComerciais';

const FONTE = readFileSync('src/components/operacao-comercial/central/CentralOperacoesComerciais.tsx', 'utf8');
const montar = () => { window.history.replaceState(null, '', '/'); return render(<BrowserRouter><CentralOperacoesComerciais /></BrowserRouter>); };
const visiveis = () => [OC_A1, OC_A2, OC_B].filter(id => document.querySelector(`td[title="${id}"]`));
const selectDeFazenda = () => {
  const s = Array.from(document.querySelectorAll('select')).find(x => x.textContent?.includes('Todas as fazendas'));
  if (!s) throw new Error('sem o filtro de fazenda');
  return s;
};

beforeEach(() => { seletor.fazendaAtual = { id: '__global__', nome: 'Global' }; seletor.isGlobal = true; });

describe('OC-LISTA-LAYOUT-01 — colunas na ordem do processo', () => {
  it('cabecalhos: a operacao, [divisor] Entrega · Comercialização, [divisor] Financeiro · Pagto', async () => {
    montar();
    await waitFor(() => expect(visiveis()).toHaveLength(3));
    const ths = Array.from(document.querySelectorAll('thead th'));
    expect(ths.map(th => th.textContent?.trim())).toEqual(
      ['OC', 'Data', 'Tipo', 'Contraparte', 'Faz', 'Cab', 'kg méd.', 'Valor R$', 'Entrega', 'Comercialização', 'Financeiro', 'Pagto', '']);
    const comDivisor = ths.filter(th => th.className.includes('border-l-2')).map(th => th.textContent?.trim());
    expect(comDivisor).toEqual(['Entrega', 'Financeiro']);
    /* a linha: Entrega e' a 9a celula (com o divisor), o Financeiro ("S/ lanc.") a 11a */
    const tds = Array.from(document.querySelector(`td[title="${OC_A1}"]`)?.closest('tr')?.querySelectorAll('td') ?? []);
    expect(tds[8].className).toContain('border-l-2');
    expect(tds[10].className).toContain('border-l-2');
    expect(tds[10].textContent).toContain('S/ lanc.');
    /* OC-LISTA-CAB-KG-COLUNAS-01 — Cab e kg méd. em celulas separadas, os dois a' direita; sem lote o kg e' "—" */
    expect(tds[5].textContent).toBe('10');
    expect(tds[6].textContent).toBe('—');
    expect(tds[5].className).toContain('text-right');
    expect(tds[6].className).toContain('text-right');
  });

  it('colgroup: as larguras MEDIDAS (01c + OC-LISTA-CAB-KG-COLUNAS-01), e a Contraparte >= 130 no piso de 893', () => {
    const cols = [...FONTE.slice(FONTE.indexOf('<colgroup>'), FONTE.indexOf('</colgroup>')).matchAll(/<col className="w-\[(\d+)px\]"/g)].map(m => Number(m[1]));
    /* OC Data Tipo Faz Cab kg méd. Valor | Entrega Comercializacao | Financeiro Pagto Acoes (medido no Chromium com a Inter) */
    expect(cols).toEqual([64, 56, 66, 34, 37, 52, 70, 66, 100, 126, 70, 22]);
    const piso = Number(FONTE.match(/<table className="w-full min-w-\[(\d+)px\] table-fixed/)?.[1]);
    expect(piso).toBe(893);
    expect(piso - cols.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(130);
  });
});

describe('OC-LISTA-CAB-KG-COLUNAS-01 — Cab e kg méd. ordenam', () => {
  it('as duas colunas ordenaveis: os cabecalhos tem a seta ao clicar, e a chave do kg medio existe', async () => {
    montar();
    await waitFor(() => expect(visiveis()).toHaveLength(3));
    for (const rotulo of ['Cab', 'kg méd.']) {
      const th = Array.from(document.querySelectorAll('thead th')).find(t => t.textContent?.trim() === rotulo) as HTMLElement;
      expect(th.className, rotulo).toContain('text-right');
      fireEvent.click(th);
      await waitFor(() => expect(th.getAttribute('aria-sort'), rotulo).not.toBe('none'));
    }
    expect(FONTE).toContain("case 'kgmedio':");
  });
});

describe('OC-LISTA-LAYOUT-01 — a barra a 24px', () => {
  const ALTURA_GRANDE = /\bh-(?:7|8|9|10)\b/;
  const barra = (fonte: string) => fonte.slice(fonte.indexOf('data-testid="barra-filtros-oc"'), fonte.indexOf('{/* ⚠ `<table>` CRU'));
  it('o detector sabe achar (auto-teste)', () => {
    expect(ALTURA_GRANDE.test('className="h-8 w-36 text-[11px]"')).toBe(true);
    expect(ALTURA_GRANDE.test('className="h-7 gap-1"')).toBe(true);
    expect(ALTURA_GRANDE.test('className="h-6 gap-1"')).toBe(false);
    expect(barra('x data-testid="barra-filtros-oc" <A className="h-8" /> {/* ⚠ `<table>` CRU y')).toMatch(ALTURA_GRANDE);
  });
  it('nenhum controle da barra acima de 24px; os selects pela classe CTL (h-6 py-0), os botoes e a busca em h-6', () => {
    const b = barra(FONTE);
    expect(b.length).toBeGreaterThan(1000);
    expect(b).not.toMatch(ALTURA_GRANDE);
    expect(FONTE).toContain("const CTL = 'h-6 py-0 text-[11px]';");
    expect(b.match(/<SelectTrigger className=\{`\$\{CTL\}/g)).toHaveLength(4);
    expect(b.match(/<SearchableSelect [\s\S]*?triggerClassName=\{CTL\} \/>/g)).toHaveLength(1);
    expect(b.match(/size="compact"/g)).toHaveLength(2);
  });
  it('os rotulos seguem as colunas: Toda entrega, Todo pagamento, Todas as fazendas', async () => {
    montar();
    await waitFor(() => expect(visiveis()).toHaveLength(3));
    const opcoes = Array.from(document.querySelectorAll('option')).map(o => o.textContent);
    for (const t of ['Toda entrega', 'Todo pagamento', 'Todas as fazendas', 'Todo comercial']) expect(opcoes).toContain(t);
    expect(opcoes).not.toContain('Todo recebimento');
    expect(opcoes).not.toContain('Toda liquidação');
  });
});

describe('OC-LISTA-LAYOUT-01 — o filtro de fazenda, em memoria', () => {
  it('Global: as fazendas por nome; escolher recorta as linhas; voltar a "Todas" mostra as tres', async () => {
    montar();
    await waitFor(() => expect(visiveis()).toHaveLength(3));
    const s = selectDeFazenda();
    expect(Array.from(s.options).map(o => o.textContent)).toEqual(['Todas as fazendas', 'Faz Baia Grande', 'Faz. 3 Muchachas']);
    expect(s.disabled).toBe(false);
    fireEvent.change(s, { target: { value: 'faz-b' } });
    await waitFor(() => expect(visiveis()).toEqual([OC_B]));
    expect(screen.getByTestId('contador-oc').textContent).toBe('1 operação(ões)');
    fireEvent.change(selectDeFazenda(), { target: { value: 'faz-a' } });
    await waitFor(() => expect(visiveis()).toEqual([OC_A1, OC_A2]));
    fireEvent.change(selectDeFazenda(), { target: { value: '__all__' } });
    await waitFor(() => expect(visiveis()).toHaveLength(3));
    expect(window.location.search).not.toMatch(/faz/);
  });
  it('com a lateral numa fazenda: o select mostra a dela e fica apagado, com o motivo no title', async () => {
    seletor.fazendaAtual = { id: 'faz-a', nome: 'Faz. 3 Muchachas' }; seletor.isGlobal = false;
    montar();
    await waitFor(() => expect(visiveis()).toEqual([OC_A1, OC_A2]));
    const s = selectDeFazenda();
    expect(s.disabled).toBe(true);
    expect(s.value).toBe('faz-a');
    expect(FONTE).toContain("title={fazendaSel ? 'a fazenda vem do seletor lateral' : undefined}");
  });
});

describe('OC-LISTA-LAYOUT-01 — criar OC nao mora mais na lista', () => {
  it('sem BOTAO_NOVA_OC nem as props de criar na Central; as abrirNova* seguem nos cards de "Lançar movimentação"', async () => {
    expect(FONTE).not.toContain('BOTAO_NOVA_OC');
    expect(FONTE).not.toMatch(/onNova(Compra|Venda)|onNovoAbate/);
    const v2 = readFileSync('src/v2/V2Index.tsx', 'utf8');
    for (const f of ['abrirNovaCompraOC', 'abrirNovaVendaOC', 'abrirNovoAbateOC']) expect(v2).toContain(`={${f}}`);
    montar();
    await waitFor(() => expect(visiveis()).toHaveLength(3));
    expect(screen.getByTestId('contador-oc').textContent).toBe('3 operação(ões)');
  });
});
