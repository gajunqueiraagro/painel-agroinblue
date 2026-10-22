/**
 * OC-HOSPEDEIRO-LEVE-01 — com a OC aberta sobre Lançamentos (a tela propria da OC: `V2LancamentosWrapper somenteOperacao`, o hospedeiro
 * REAL), nenhuma consulta de rebanho dispara; nenhuma aba da OC usa rebanho, entao percorrer todas tambem nao dispara nenhuma.
 *   H1 Compra, Venda e Abate abertas pela URL (como a lista de OCs, o lancamento e a conciliacao abrem): a OC fica pronta e nenhum
 *      pedido ao banco sai de modulo de rebanho — nem depois de abrir cada aba da Compra
 *   H2 a busca sabe achar: o MESMO hospedeiro como "Lançar movimentação" (sem o modo) pede o rebanho
 * O banco, o cliente e a fazenda sao os da bancada (`scripts/ui-cortes/mocks`): cada pedido anota quem o fez (a pilha do app).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => import('../../scripts/ui-cortes/mocks/supabase'));
vi.mock('@/contexts/ClienteContext', () => import('../../scripts/ui-cortes/mocks/cliente'));
vi.mock('@/contexts/AuthContext', () => import('../../scripts/ui-cortes/mocks/auth'));
vi.mock('@/contexts/FazendaContext', () => import('../../scripts/ui-cortes/mocks/fazenda'));
vi.mock('@/hooks/useFornecedoresDoCliente', () => import('../../scripts/ui-cortes/mocks/leitor'));

import { V2LancamentosWrapper } from '@/v2/V2Index';

/** Os modulos do rebanho: quem le lancamentos zootecnicos, saldos, pastos, categorias e os mensais do rebanho. */
const MODULOS_DO_REBANHO = ['hooks/useLancamentos.ts', 'hooks/useRebanhoOficial.ts', 'hooks/useZootMensal.ts', 'hooks/useZootCategoriaMensal.ts',
  'hooks/useMetaGmd.ts', 'hooks/usePastos.ts', 'hooks/useCategoriaParametros.ts', 'hooks/useAnosDisponiveis.ts', 'lib/oc/enriquecerMovimentosOC.ts'];

type Pedido = { tipo: string; nome: string; quem: string[] };
const g = globalThis as unknown as { __pedidosBancada?: Pedido[]; __bancoBancada?: unknown; __fazendaBancada?: unknown };
const doRebanho = () => (g.__pedidosBancada ?? []).filter((p) => p.quem.some((f) => MODULOS_DO_REBANHO.some((m) => f.startsWith(m))))
  .map((p) => `${p.tipo}:${p.nome} <= ${p.quem[0]}`);

const OC_ID = 'a1b2c3d4-0000-4000-8000-000000000000';
const FAZ1 = { id: 'f1', nome: 'Faz. Exemplo', cliente_id: 'cli', tem_pecuaria: true };
const banco = (tipo: string) => ({
  from: (t: string) => t === 'zoo_operacoes_comerciais' ? [{ id: OC_ID, cliente_id: 'cli', fazenda_id: 'f1', tipo_operacao: tipo, data_operacao: '2026-09-15',
    versao: 3, status_comercial: 'rascunho', rascunho: true, cenario: 'realizado', contraparte_id: null, observacoes: null, numero_documento: null,
    entrega_encerrada: false }]
    : t === 'lancamentos' ? [{ id: 'l1', data: '2026-09-10', tipo: 'nascimento', quantidade: 3, categoria: 'bezerros', cenario: 'realizado', fazenda_id: 'f1',
      cliente_id: 'cli', created_by: 'u1', cancelado: false }] : [],
  rpc: (fn: string) => fn === 'get_status_pilares_fechamento' ? { p1_mapa_pastos: { status: 'aberto' }, p2_valor_rebanho: { status: 'aberto' } } : null,
});
const montar = (url: string, somenteOperacao: boolean) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[url]}>
      <V2LancamentosWrapper somenteOperacao={somenteOperacao} cenariosPermitidos={['realizado']} onFecharOperacaoOC={() => {}} />
    </MemoryRouter>
  </QueryClientProvider>);
const assentar = () => new Promise((r) => setTimeout(r, 400));

/* o Node desta maquina expoe um `localStorage` sem metodos por cima do do jsdom: um de memoria, por teste */
const memoria = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); },
  removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };

beforeEach(() => {
  cleanup();
  vi.stubGlobal('localStorage', memoria());
  g.__pedidosBancada = [];
  g.__fazendaBancada = { fazendas: [FAZ1], fazendasComPecuaria: [FAZ1], fazendaAtual: FAZ1, isGlobal: false, fazendaId: 'f1', setFazendaAtual: () => {}, loading: false };
});

describe('OC-HOSPEDEIRO-LEVE-01 — a OC aberta sobre Lançamentos não carrega o rebanho', () => {
  it.each([
    ['compra', 'Compra de Animais'],
    ['venda', /Venda/],
    ['abate', /Abate/],
  ] as const)('H1 %s: a OC fica pronta e nenhuma consulta de rebanho dispara', async (tipo, titulo) => {
    g.__bancoBancada = banco(tipo);
    montar(`/v2?oc_${tipo}=1&oc_id=${OC_ID}`, true);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent(titulo), { timeout: 15_000 });
    await assentar();
    /* a busca olhou pedidos de verdade: a OC leu a propria operacao */
    expect((g.__pedidosBancada ?? []).some((p) => p.nome === 'zoo_operacoes_comerciais')).toBe(true);
    expect(doRebanho()).toEqual([]);
    if (tipo !== 'compra') return;
    /* cada aba da Compra: nenhuma usa rebanho, entao nenhuma o carrega */
    for (const aba of ['Negociação', 'Recebimento', 'Documentos', 'Financeiro', 'Auditoria']) {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${aba}`) })[0]);
      await assentar();
    }
    expect(doRebanho()).toEqual([]);
  }, 30_000);

  it('H2 a busca sabe achar: o mesmo hospedeiro em "Lançar movimentação" pede o rebanho', async () => {
    g.__bancoBancada = banco('compra');
    montar('/v2', false);
    await waitFor(() => expect(doRebanho().length).toBeGreaterThan(0), { timeout: 15_000 });
    const modulos = new Set(doRebanho().map((p) => p.split(' <= ')[1].split(':')[0]));
    for (const m of ['hooks/useLancamentos.ts', 'hooks/useZootMensal.ts', 'hooks/useAnosDisponiveis.ts']) expect(modulos).toContain(m);
  }, 30_000);
});
