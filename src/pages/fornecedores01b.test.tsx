/**
 * FORN-01b (Gabriel, 21/10/2026) — Cadastros › Fornecedores na régua de Recorrências e sem deslocar:
 *   (1) a régua é UMA (`regua-tabela`): Recorrências e Fornecedores tiram dela; nome em uma linha com "…" e o inteiro no `title`;
 *   (2) a paginação mora na barra navy do pé do QUADRO, nada solto abaixo dele; a tela mede contra o pai (`SECOES_APP_SHELL`);
 *   (3) o texto que muda com a seleção tem a largura do maior valor (`TextoReservado`, algarismos tabulares) — a busca não encolhe a reserva;
 *   (4) "Último uso" / "Lanç.": só o realizado, a data até hoje (a regra é do banco, `fn_fornecedor_lista`);
 *   (5) Mesclar: o cadastro já mesclado escolhido vira o dono atual dele, com o aviso;
 *   (6) a dedução do abate nasce com o comprador; Meta nunca vira lançamento realizado.
 * Tela montada sobre banco de mentira; nomes sintéticos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const banco = vi.hoisted(() => ({
  total: 2356,
  cadeia: new Map<string, { id: string; nome: string; fundido_em_id: string | null }>(),
}));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const estado: { ids: string[] | null } = { ids: null };
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'is', 'order', 'neq', 'limit', 'or', 'range', 'maybeSingle', 'single']) c[m] = () => c;
    c.in = (_col: string, ids: string[]) => { estado.ids = ids; return c; };
    c.then = (ok: (r: unknown) => unknown) => {
      if (tabela === 'financeiro_fornecedores' && estado.ids) return Promise.resolve({ data: estado.ids.map((id) => banco.cadeia.get(id)).filter(Boolean), error: null }).then(ok);
      return Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    };
    return c;
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn !== 'fn_fornecedor_lista') return { data: null, error: null };
    const busca = String(args.p_busca ?? '').trim();
    const total = busca ? 3 : banco.total;
    const itens = Array.from({ length: Math.min(Number(args.p_limite), total) }, (_, i) => ({ id: `f${i}`, nome: `Sintq Fornecedor ${i} Comércio de Produtos Agropecuários Ltda`,
      nome_fantasia: null, cpf_cnpj: null, municipio: null, uf: null, lancamentos: i, ultimo_uso: '2026-10-05', situacao: 'ativo', ativo: true }));
    return { data: { total, contagens: { ativos: total, inativos: 0, mesclados: 0, todos: total }, documentos: [], itens }, error: null };
  };
  return { supabase: { from: (t: string) => cadeia(t), rpc, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Teste' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { FinV2FornecedoresTab, reservasDaLista } from './FinV2FornecedoresTab';
import { fimDaCadeia, trocarMescladosPeloDono, fraseDaTroca } from '@/lib/fornecedores/donoDoMesclado';
import { reservaDeNumero, TH_REGUA, TD_REGUA } from '@/components/ui/regua-tabela';

const ler = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const guardado = new Map<string, string>();
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, v); }, clear: () => guardado.clear() } });
beforeEach(() => { window.localStorage.clear(); banco.total = 2356; Object.defineProperty(window, 'innerWidth', { value: 1300, configurable: true }); });

describe('FORN-01b — a régua é uma só', () => {
  it('Recorrências e Fornecedores tiram as classes da tabela de `regua-tabela` (cabeçalho 22, linha 19, 9,5/10px, padding 4px)', () => {
    expect(TH_REGUA).toContain('h-[22px]'); expect(TH_REGUA).toContain('text-[9.5px]'); expect(TH_REGUA).toContain('px-1');
    expect(TD_REGUA).toBe('h-[19px] px-1 py-0 text-[10px] leading-none');
    const rec = ler('../v2/pages/V2Recorrencias.tsx');
    expect(rec).toContain("from '@/components/ui/regua-tabela'");
    expect(rec).toContain('const TH = TH_REGUA;');
    expect(rec).not.toMatch(/const TD = 'h-\[19px\]/);
    const forn = ler('FinV2FornecedoresTab.tsx');
    expect(forn).toContain('className={cn(TH_REGUA,');
    expect(forn).toContain('<td className={cn(TD_REGUA_TEXTO, \'font-medium\')} title={f.nome}>{f.nome}</td>');
    /* nenhum texto da lista corta seco: o "rola escondido" saiu das células */
    const corpo = forn.slice(forn.indexOf('<tbody>'), forn.indexOf('</tbody>'));
    expect(corpo).not.toContain('uma-linha-que-rola');
  });
  it('a tela mede contra o pai: "fornecedores" no app-shell, sem o calc(100dvh-120px)', () => {
    expect(ler('../v2/V2Index.tsx')).toMatch(/SECOES_APP_SHELL = new Set\(\[[^\]]*'fornecedores'\]\)/);
    expect(ler('FinV2FornecedoresTab.tsx')).not.toContain('100dvh-120px');
  });
  it('a aba Sem cadastro: o texto da célula em uma linha com "…" e o inteiro no title (sem corte seco)', () => {
    const sc = ler('../components/financeiro-v2/FornecedoresSemCadastro.tsx');
    /* as duas tabelas da aba (a lista e as ligações recentes); o recado e a pergunta, fora delas, rolam na faixa de 18px */
    const tabelas = sc.split('<table').slice(1).map((t) => t.slice(0, t.indexOf('</table>')));
    expect(tabelas).toHaveLength(2);
    for (const tabela of tabelas) expect(tabela).not.toContain('uma-linha-que-rola');
    const tabela = tabelas[0];
    expect(tabela).toContain('<span className="block truncate font-medium" title={t.texto}>{t.texto}</span>');
  });
});

describe('FORN-01b — a paginação no pé do quadro, sem deslocar', () => {
  it('o rodapé (intervalo, Por página, navegação) mora DENTRO do quadro, e nada vem depois dele', async () => {
    render(<FinV2FornecedoresTab />);
    await screen.findByText('Sintq Fornecedor 0 Comércio de Produtos Agropecuários Ltda');
    const quadro = screen.getByTestId('quadro-fornecedores');
    const rodape = screen.getByTestId('rodape-fornecedores');
    expect(quadro.contains(rodape)).toBe(true);
    expect(quadro.lastElementChild).toBe(rodape);
    expect(quadro.nextElementSibling).toBeNull();
    expect(rodape.className).toContain('bg-primary');
    expect(screen.getByTestId('intervalo-fornecedores').textContent).toBe('Mostrando 1–100 de 2.356');
    expect(screen.getByTestId('pagina-fornecedores').textContent).toBe('Página 1 de 24');
  });
  it('largura reservada do maior valor + algarismos tabulares; a busca não encolhe a reserva', async () => {
    expect(reservaDeNumero(4)).toBe('9.999');
    expect(reservasDaLista(2356)).toEqual({ numero: '9.999', intervalo: 'Mostrando 9.999–9.999 de 9.999', pagina: 'Página 99 de 99' });
    render(<FinV2FornecedoresTab />);
    await screen.findByText('Sintq Fornecedor 0 Comércio de Produtos Agropecuários Ltda');
    const intervalo = () => screen.getByTestId('intervalo-fornecedores');
    expect(intervalo().getAttribute('data-reserva')).toBe('Mostrando 9.999–9.999 de 9.999');
    expect(intervalo().className).toContain('tabular-nums');
    expect(screen.getByTestId('pagina-fornecedores').getAttribute('data-reserva')).toBe('Página 99 de 99');
    fireEvent.change(screen.getByTestId('busca-fornecedores'), { target: { value: 'sintq' } });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 450)); });
    await waitFor(() => expect(intervalo().textContent).toBe('Mostrando 1–3 de 3'));
    expect(intervalo().getAttribute('data-reserva')).toBe('Mostrando 9.999–9.999 de 9.999');
    /* os contadores dos filtros e o da aba também têm o lugar reservado */
    const ativos = screen.getByRole('button', { name: /^Ativos / });
    expect(ativos.querySelector('[data-reserva="9.999"]')).toBeTruthy();
    expect(screen.getByTestId('contador-sem-cadastro')).toBeTruthy();
  });
});

describe('FORN-01b — "Último uso" e "Lanç." só com o realizado até hoje (a regra é do banco)', () => {
  it('a migration da lista conta só o cenário realizado e não deixa data depois de hoje', () => {
    const m = ler('../../supabase/migrations/20261028110000_forn_01b_lista_e_sem_cadastro.sql');
    const lista = m.slice(m.indexOf('CREATE OR REPLACE FUNCTION public.fn_fornecedor_lista'));
    expect(lista).toContain("v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date");
    expect(lista).toContain('FILTER (WHERE coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) <= v_hoje) ult');
    expect(lista).toContain("AND l.favorecido_id IS NOT NULL AND l.cenario = 'realizado'");
    const base = m.slice(m.indexOf('CREATE OR REPLACE FUNCTION public._fn_sem_cadastro_base'), m.indexOf('CREATE OR REPLACE FUNCTION public.fn_fornecedor_lista'));
    expect(base).toContain("AND l.cenario = 'realizado' AND l.origem_tipo IS NULL");
    expect(base).toContain("OR l.origem_lancamento IN ('importacao_incremental', 'extrato', 'ofx', 'excel', 'mesa_excel', 'mesa_split', 'migracao')");
  });
});

describe('FORN-01b — Mesclar: o mesclado escolhido vira o dono atual', () => {
  const m = (pares: [string, string, string | null][]) => new Map(pares.map(([id, nome, f]) => [id, { id, nome, fundido_em_id: f }]));
  it('o fim da cadeia, em mais de um salto; a volta vira nulo', () => {
    const c = m([['a', 'A', 'b'], ['b', 'B', 'c'], ['c', 'C', null], ['x', 'X', 'y'], ['y', 'Y', 'x']]);
    expect(fimDaCadeia(c, 'a')?.id).toBe('c');
    expect(fimDaCadeia(c, 'c')?.id).toBe('c');
    expect(fimDaCadeia(c, 'x')).toBeNull();
  });
  it('troca pelo dono lido do banco, com a frase; sem repetir coluna', async () => {
    banco.cadeia = m([['abs', 'Sintq Absorvido', 'dono'], ['dono', 'Sintq Dono', null], ['outro', 'Sintq Outro', null]]);
    const r = await trocarMescladosPeloDono('cli', ['outro', 'abs', 'dono']);
    expect(r.ids).toEqual(['outro', 'dono']);
    expect(r.trocas).toEqual([{ de: 'abs', nomeDe: 'Sintq Absorvido', para: 'dono', nomePara: 'Sintq Dono' }]);
    expect(fraseDaTroca(r.trocas[0])).toBe('Sintq Absorvido foi unido em Sintq Dono; usando Sintq Dono.');
  });
  it('a ferramenta troca nas três portas (busca, sugestão e o par pedido) e aceita o par só com o inativo', () => {
    const d = ler('../components/financeiro-v2/MesclarFornecedoresDialog.tsx');
    expect(d.match(/void colocarColunas\(/g)).toHaveLength(3);
    expect(d).toContain('inicial?: { manter?: string; absorver: string[] }');
  });
});

describe('FORN-01b — o cadastro ATIVO não é cobrado por um INATIVO com o mesmo documento', () => {
  it('o duplicado conta só ativo quando o cadastro é ativo (ou novo)', () => {
    const f = ler('../components/financeiro-v2/FornecedorFormDialog.tsx');
    expect(f).toContain("const editandoAtivo = !editing || editing.ativo !== false;");
    expect(f).toContain('.filter((f) => !editandoAtivo || f.ativo)');
  });
});

describe('FORN-01b — o abate: Meta não vira realizado; a dedução nasce com o comprador', () => {
  const abate = ler('../components/AbateFinanceiroPanel.tsx');
  it('as duas gravações (parcela e dedução) levam o cenário do abate', () => {
    expect(abate.match(/cenario: statusOperacional === 'meta' \? 'meta' : 'realizado',/g)).toHaveLength(2);
  });
  it('a dedução leva o fornecedor PADRÃO = o comprador do abate (o mesmo da parcela)', () => {
    const deducao = abate.slice(abate.indexOf("origem_tipo: 'abate:deducao'"), abate.indexOf('});', abate.indexOf("origem_tipo: 'abate:deducao'")));
    expect(deducao).toContain('...(fornecedorId ? { favorecido_id: fornecedorId } : {}),');
  });
});
