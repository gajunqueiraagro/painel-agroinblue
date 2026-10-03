/**
 * PR-CONC-CONFERENCIA-FECHAMENTO-DIA — a tela: os avisos novos e o fechamento do dia, sobre o retorno REAL da RPC
 * (`src/lib/conciliacao/mesaDoDia.fixture.json`). A regra mora na lib (`mesaDoDia.test.ts`); aqui se prova o desenho.
 *
 * ⚠ OS AVISOS VÊM ANTES DA DESCRIÇÃO na mesma célula: ela corta no FIM (a descrição, inteira no `title`), e o aviso nunca
 *   pode ser o pedaço cortado. jsdom não faz layout: a largura renderizada foi medida na tela e vai no relatório.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EspelhadosReais } from '@/lib/conciliacao/mesaDoDia';
import { montarMesaAntes } from '@/lib/conciliacao/mesaDoDiaAntes.fixture';

const fixture = vi.hoisted(() => ({ espelho: null as unknown }));
vi.mock('@/integrations/supabase/client', () => {
  const vazio = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'is', 'not', 'order', 'in']) b[m] = () => b;
    b.then = (ok: (x: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string) => Promise.resolve(fn === 'fn_extratos_espelhados' ? { data: fixture.espelho, error: null } : { data: null, error: null }),
      from: () => vazio(),
    },
  };
});
const FIN = vi.hoisted(() => {
  const noop = async () => undefined;
  return {
    loadContas: noop, loadClassificacoes: noop, loadFornecedores: noop, loadSafras: noop,
    contasBancarias: [], fornecedores: [], safras: [], classificacoes: [],
    buscarLancamentoPorId: async () => null, criarFornecedor: noop, editarLancamento: noop, criarLancamento: noop, excluirLancamento: noop,
  };
});
vi.mock('@/hooks/useFinanceiroV2', () => ({ useFinanceiroV2: () => FIN }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
const INTERNAS = vi.hoisted(() => ({
  contasInternas: new Set<string>(), lancamentosInternos: new Set<string>(),
  saldoInicialConsolidado: null, saldoInformadoConsolidado: null,
}));
vi.mock('@/hooks/useEspelhoInternas', () => ({ useEspelhoInternas: () => INTERNAS }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({ LancamentoV2Dialog: () => null }));
vi.mock('@/components/financeiro-v2/DecisaoDerivadosDialog', () => ({ DecisaoDerivadosDialog: () => null }));
vi.mock('@/components/financeiro-v2/CasarComBancoModal', () => ({
  CasarComBancoModal: () => null, CasarN1Modal: () => null, CasarBlocoModal: () => null,
  fraseDaRecusa: (m: string) => m,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EspelhoConciliacaoTab, montarEvolucao, textosDosAvisos, LIMITE_AVISOS } from './EspelhoConciliacaoTab';

type Caso = { internos: string[]; esp: EspelhadosReais };
const FIX: Record<string, Caso> = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/conciliacao/mesaDoDia.fixture.json'), 'utf8'));

beforeEach(() => { Element.prototype.scrollIntoView = () => {}; });

async function abrir(nome: string, mes: string) {
  fixture.espelho = FIX[nome].esp;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <EspelhoConciliacaoTab clienteId="c" contaId="k" ano="2026" mes={mes} />
    </QueryClientProvider>,
  );
  await screen.findByTestId('resumo-espelho');
  fireEvent.click(screen.getByRole('button', { name: 'Conferência' }));
  return screen.findByTestId('modal-conferencia');
}
const linhaDoFechamento = (modal: HTMLElement, ddmm: string) => {
  const td = within(modal).getByText(`fechamento ${ddmm}`);
  const tr = td.closest('tr');
  if (!tr) throw new Error('sem linha de fechamento');
  return tr;
};

describe('a Conferência do NJ Sicredi Lavoura set/26 (o print do Gabriel)', () => {
  it('02/09 fecha: "confere" (era "diferença 33.760,12")', async () => {
    const modal = await abrir('nj_sicredi_lavoura_2026_09', '09');
    expect(linhaDoFechamento(modal, '02/09')).toHaveTextContent(/confere/);
    expect(linhaDoFechamento(modal, '28/09')).toHaveTextContent(/diferença -17\.345,60/);
  });

  it('D3/D4: a venda paga em dois dias diz "lançado em 04/09" (âmbar) e "parte de 11.080,80 · resto em 04/09", ANTES da descrição', async () => {
    const modal = await abrir('nj_sicredi_lavoura_2026_09', '09');
    const lancado = within(modal).getAllByText((_t, el) => el?.getAttribute('data-aviso') === 'lancado-em' && /lançado em 04\/09/.test(el.textContent ?? ''));
    expect(lancado.length).toBeGreaterThan(0);
    expect(lancado[0].className).toMatch(/text-amber-600/);
    const parte = within(modal).getAllByText((_t, el) => el?.getAttribute('data-aviso') === 'parte' && /parte de 11\.080,80 · resto em 04\/09/.test(el.textContent ?? ''));
    expect(parte.length).toBeGreaterThan(0);
    /* o aviso é o primeiro filho da célula (a descrição vem depois, e é ela que o corte alcança) */
    const cel = parte[0].closest('td');
    expect(cel?.querySelector('[data-aviso]')).toBe(cel?.firstElementChild);
    expect(cel?.getAttribute('title')).toMatch(/parte de 11\.080,80 · resto em 04\/09/);
  });
});

describe('os motivos de R5 na tela', () => {
  it('sobre-aplicação (77711d94, 21/05): "aplicado acima do lançamento" e o dia mostra 360,00', async () => {
    const modal = await abrir('a1b2_itau_personalite_2026_05', '05');
    expect(within(modal).getAllByText((_t, el) => el?.getAttribute('data-aviso') === 'sobre-aplicado').length).toBeGreaterThan(0);
    expect(linhaDoFechamento(modal, '21/05')).toHaveTextContent(/diferença 360,00/);
  });

  it('sub-aplicação (a627a6eb, 19/09): a linha do resto (1,96) com "aplicado abaixo do lançamento · resto de 2,09", e o dia mostra −1,96', async () => {
    const modal = await abrir('a1b2_itau_personalite_2026_09', '09');
    const resto = modal.querySelector('tr[data-resto]');
    expect(resto).not.toBeNull();
    /* rendimento: é ENTRADA — o resto aparece positivo (1,96), e o dia fica −1,96 (o banco tem menos que o sistema) */
    expect(resto?.textContent).toMatch(/!1,96/);
    expect(resto?.textContent).toMatch(/aplicado abaixo do lançamento · resto de 2,09/);
    expect(linhaDoFechamento(modal, '19/09')).toHaveTextContent(/diferença -1,96/);
    expect(linhaDoFechamento(modal, '21/09')).toHaveTextContent(/confere/);
  });
});

describe('T9 — a Evolução usa a mesma mesa: os 11 dias deixam de divergir', () => {
  it('Sicredi Lavoura set/26: só 28/09 com movimento do banco ≠ do sistema (antes, 11)', () => {
    const { esp } = FIX.nj_sicredi_lavoura_2026_09;
    const rows = montarEvolucao(esp, new Set());
    expect(rows.filter((r) => Math.abs(r.movOfx - r.movSis) > 0.01).map((r) => r.dia)).toEqual([28]);
    const antes = montarMesaAntes(esp, new Set()).filter((d) => Math.abs(d.banco - d.sistema) > 0.01);
    expect(antes).toHaveLength(11);
  });
});

describe('D8 — a escada de abreviação: nunca passa do limite medido, a frase inteira no title', () => {
  const total = (xs: { texto: string }[]) => xs.reduce((t, i) => t + i.texto.length + 3, 0);
  it('o pior caso real do mês (lançado em + parte com 1 data) fica por extenso, dentro do limite', () => {
    const xs = textosDosAvisos({ lancadoEm: '2026-09-04', parte: { valorCheio: 11080.8, restoEm: ['2026-09-04'] }, sobreAplicado: false });
    expect(xs.map((x) => x.texto)).toEqual(['lançado em 04/09', 'parte de 11.080,80 · resto em 04/09']);
    expect(total(xs)).toBeLessThanOrEqual(LIMITE_AVISOS);
  });
  it('valor de 7 dígitos, 3 datas e o aplicado acima: o nível 4 (a parte sem o resto, que fica no title), sem "…", cabe', () => {
    const xs = textosDosAvisos({ lancadoEm: '2026-09-04', parte: { valorCheio: -1234567.89, restoEm: ['2026-09-02', '2026-09-09', '2026-09-11'] }, sobreAplicado: true });
    expect(xs.map((x) => x.texto)).toEqual(['aplic. acima', 'lanç. 04/09', 'parte -1.234.567,89']);
    expect(total(xs)).toBeLessThanOrEqual(LIMITE_AVISOS);
    expect(xs.some((x) => x.texto.includes('…'))).toBe(false);
  });
  it('2 datas com valor médio: o nível 2 ("lanç." · "resto DD/MM e DD/MM") basta', () => {
    const xs = textosDosAvisos({ lancadoEm: '2026-09-04', parte: { valorCheio: 11063.7, restoEm: ['2026-09-09', '2026-09-11'] }, sobreAplicado: false });
    expect(xs.map((x) => x.texto)).toEqual(['lanç. 04/09', 'parte 11.063,70 · resto 09/09 e 11/09']);
    expect(total(xs)).toBeLessThanOrEqual(LIMITE_AVISOS);
  });
});

it('um nível intermediário: 3 datas com valor médio → "resto em 3 datas"', () => {
  const xs = textosDosAvisos({ lancadoEm: '2026-09-04', parte: { valorCheio: 11063.7, restoEm: ['2026-09-02', '2026-09-09', '2026-09-11'] }, sobreAplicado: false });
  expect(xs.map((x) => x.texto)).toEqual(['lanç. 04/09', 'parte 11.063,70 · resto em 3 datas']);
  expect(xs.reduce((t, i) => t + i.texto.length + 3, 0)).toBeLessThanOrEqual(LIMITE_AVISOS);
});
