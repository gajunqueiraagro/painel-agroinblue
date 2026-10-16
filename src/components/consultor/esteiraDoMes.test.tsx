/**
 * RESUMO-CLIENTES-01 passo b — a Esteira do mês: agregação por fazenda, ordem "mais atrasado primeiro", próximo passo + ⚑, mês
 * padrão = o anterior, o erro de um cliente não derruba os outros, o clique e a ligação no shell (lida da fonte).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';

vi.mock('@/integrations/supabase/client', () => {
  const pilares: Record<string, unknown[]> = {
    a: [{ fazenda_id: 'fa1', fazenda_nome: 'Faz. Alfa', ano_mes: '2026-09', p1: 'oficial', p2: 'oficial' }],
    b: [{ fazenda_id: 'fb1', fazenda_nome: 'Faz. Beta', ano_mes: '2026-09', p1: 'oficial', p2: 'oficial' },
        { fazenda_id: 'fb2', fazenda_nome: 'Faz. Gama', ano_mes: '2026-09', p1: 'pendente', p2: 'nao_aplicavel' }],
  };
  const tabela = (rows: unknown[]) => { const q = { select: () => q, eq: () => q, in: () => Promise.resolve({ data: rows, error: null }) }; return q; };
  return { supabase: {
    rpc: (_fn: string, args: { p_cliente_id: string }) => args.p_cliente_id === 'c'
      ? Promise.resolve({ data: null, error: { message: 'timeout do cliente C' } })
      : Promise.resolve({ data: pilares[args.p_cliente_id] ?? [], error: null }),
    from: (t: string) => tabela(t === 'zoot_mensal_cache'
      ? [{ cliente_id: 'a', saldo_final: 1000 }, { cliente_id: 'a', saldo_final: 200 }]
      : [{ fazenda_id: 'fa1', fechado_em: '2026-10-04T12:00:00Z' }]),
  } };
});
vi.mock('@/hooks/useResumoConciliacao', () => ({
  invalidarDono: () => undefined,
  consultaDoResumoMes: (c: string, mes: string) => ({
    queryKey: ['conc', c, mes],
    queryFn: async () => [{ nivel: 'total', status: c === 'b' ? 'nao_conciliado' : 'conciliado', diferenca: c === 'b' ? -506.51 : 0, motivos: [] }],
  }),
}));
vi.mock('@/hooks/usePendenciasConsultor', () => ({
  usePendenciasConsultor: () => ({ lista: [{ id: 'p', clienteId: 'b', status: 'aberta' }, { id: 'q', clienteId: 'b', status: 'resolvida' }] }),
}));

import { EsteiraDoMes } from './EsteiraDoMes';
import {
  agregarPilar, celulaDaConciliacao, diaDaCobranca, mesAoLado, mesDaCobranca, ordenarEsteira, proximoPasso, rodapeDaColuna,
  type CelulaEtapa, type LinhaDaEsteira,
} from '@/lib/consultor/esteira';

const f = (id: string, status: string) => ({ fazendaId: id, fazendaNome: `Faz ${id}`, status });
const C = (estado: CelulaEtapa['estado'], detalhe?: string): CelulaEtapa => ({ estado, rotulo: '', titulo: '', detalhe });
const L = (nome: string, p1: CelulaEtapa, p2: CelulaEtapa, conc: CelulaEtapa, pendencias = 0): LinhaDaEsteira => ({ clienteId: nome, nome, p1, p2, conc, pendencias });

describe('agregação por fazenda', () => {
  it('todas ✓ → ✓ (com a data só se todas tiverem carimbo); algumas → ● "k de n faz."; nenhuma → –; "não se aplica" não conta', () => {
    expect(agregarPilar([f('a', 'oficial'), f('b', 'nao_aplicavel')]).estado).toBe('ok');
    expect(agregarPilar([f('a', 'oficial')], new Map([['a', '2026-10-04']])).rotulo).toBe('04/10');
    expect(agregarPilar([f('a', 'oficial'), f('b', 'oficial')], new Map([['a', '2026-10-04']])).rotulo).toBe('');
    const p = agregarPilar([f('a', 'oficial'), f('b', 'nao_iniciado'), f('c', 'nao_aplicavel')]);
    expect([p.estado, p.rotulo, p.detalhe]).toEqual(['parcial', '1 de 2 faz.', 'Faz b']);
    expect(agregarPilar([f('a', 'pendente')]).estado).toBe('parcial');
    expect(agregarPilar([f('a', 'nao_iniciado'), f('b', 'nao_iniciado')]).estado).toBe('nada');
    expect(agregarPilar([f('a', 'nao_aplicavel')]).rotulo).toBe('n/a');
  });

  it('conciliação: o status do dono; não conciliado mostra a diferença', () => {
    expect(celulaDaConciliacao({ status: 'conciliado', diferenca: 0, motivos: [] }).estado).toBe('ok');
    const t = celulaDaConciliacao({ status: 'nao_conciliado', diferenca: -506.51, motivos: [{ motivo: 'contas_nao_conciliadas' }] });
    expect([t.estado, t.rotulo]).toEqual(['travado', '−506,51']);
    expect(celulaDaConciliacao({ status: 'nao_conciliado', diferenca: null, motivos: [] }).rotulo).toBe('não conc.');
    expect(celulaDaConciliacao({ status: 'pendente', diferenca: null, motivos: [] }).estado).toBe('nada');
  });
});

describe('ordem, próximo passo e rodapé', () => {
  const ok = C('ok');
  it('mais atrasado primeiro; depois a travada mais à esquerda; empate pelo nome', () => {
    const r = ordenarEsteira([L('Zeta', ok, ok, ok), L('Beta', ok, ok, C('travado')), L('Alfa', ok, ok, C('travado')), L('Gama', C('nada'), ok, ok), L('Delta', C('nada'), C('nada'), ok)]);
    expect(r.map(l => l.nome)).toEqual(['Delta', 'Gama', 'Alfa', 'Beta', 'Zeta']);
  });
  it('a primeira etapa não ✓ vira o texto; tudo ✓ = pronto para fechar', () => {
    expect(proximoPasso(L('x', C('parcial', 'Baia Grande'), ok, ok))).toBe('fechar pastos (Baia Grande)');
    expect(proximoPasso(L('x', ok, C('nada'), C('travado', '−506,51')))).toBe('valor do rebanho');
    expect(proximoPasso(L('x', ok, ok, C('travado', '−506,51')))).toBe('conciliar (−506,51)');
    expect(proximoPasso(L('x', ok, ok, ok))).toBe('pronto para fechar');
  });
  it('rodapé "N ok · M faltam"', () => {
    expect(rodapeDaColuna([ok, ok, C('nada'), C('erro'), C('carregando')])).toBe('2 ok · 2 faltam');
  });
});

describe('o mês', () => {
  it('padrão = o anterior ao de hoje; "dia N da cobrança" só nele', () => {
    expect(mesDaCobranca('2026-10-16')).toBe('2026-09');
    expect(mesDaCobranca('2027-01-05')).toBe('2026-12');
    expect(diaDaCobranca('2026-09', '2026-10-16')).toBe(16);
    expect(diaDaCobranca('2026-08', '2026-10-16')).toBeNull();
    expect(mesAoLado('2026-12', 1)).toBe('2027-01');
  });
});

function montar(onAbrirEtapa = vi.fn(), onVerPendencias = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>
    <EsteiraDoMes mes="2026-09" onMes={vi.fn()} clientes={[{ id: 'a', nome: 'Alfa' }, { id: 'b', nome: 'Beta' }, { id: 'c', nome: 'Cê' }]}
      onAbrirEtapa={onAbrirEtapa} onVerPendencias={onVerPendencias} />
  </QueryClientProvider>);
  return { onAbrirEtapa, onVerPendencias };
}
const linha = (id: string) => document.querySelector(`[data-testid="esteira-linha"][data-cliente="${id}"]`) as HTMLElement;

describe('a tela', () => {
  it('cada cliente com as suas bolinhas; o erro do C vira "?" só nele; Fechamento "—"', async () => {
    montar();
    await waitFor(() => expect(within(linha('a')).getByTestId('etapa-p1').getAttribute('data-estado')).toBe('ok'));
    await waitFor(() => expect(within(linha('c')).getByTestId('etapa-p1').getAttribute('data-estado')).toBe('erro'));
    expect(within(linha('c')).getByTestId('etapa-p1').getAttribute('title')).toBe('timeout do cliente C');
    expect(within(linha('a')).getByTestId('etapa-p2').textContent).toContain('04/10');
    expect(within(linha('b')).getByTestId('etapa-p1').textContent).toContain('1 de 2 faz.');
    await waitFor(() => expect(within(linha('b')).getByTestId('etapa-conc').getAttribute('data-estado')).toBe('travado'));
    expect(within(linha('a')).getByTestId('etapa-fech').getAttribute('title')).toBe('ainda sem registro de entrega');
    expect(linha('a').textContent).toContain('1.200 cab');
    /* B (travado em duas) vem antes de A (tudo ✓) */
    const ordem = screen.getAllByTestId('esteira-linha').map(tr => tr.getAttribute('data-cliente'));
    expect(ordem.indexOf('b')).toBeLessThan(ordem.indexOf('a'));
  });

  it('próximo passo com ⚑ das em aberto; clicar no ⚑ abre as pendências do cliente; clicar na bolinha abre a etapa', async () => {
    const { onAbrirEtapa, onVerPendencias } = montar();
    await waitFor(() => expect(within(linha('b')).getByTestId('proximo-passo').textContent).toBe('fechar pastos (Faz. Gama) · ⚑ 1'));
    fireEvent.click(within(linha('b')).getByTestId('esteira-pendencias'));
    expect(onVerPendencias).toHaveBeenCalledWith('b');
    fireEvent.click(within(linha('a')).getByTestId('etapa-conc'));
    expect(onAbrirEtapa).toHaveBeenCalledWith('a', 'conc');
  });
});

describe('a ligação no shell', () => {
  const v2 = readFileSync('src/v2/V2Index.tsx', 'utf8');
  it('esteira é a primeira aba e a que abre; o clique troca cliente, mês e tela; a seta volta ao painel no mesmo mês', () => {
    expect(v2).toContain("const menuDoPainel = modoResumo ? <>{abaDoPainel('esteira', 'Esteira do mês')}{abaDoPainel('pendencias', 'Pendências')}</> : undefined;");
    expect(v2).toContain("setAbaResumo(abaAoEntrarRef.current ?? 'esteira');");
    expect(v2).toContain('const [mesDaEsteira, setMesDaEsteira] = useState(() => mesDaCobranca());');
    expect(v2).toMatch(/const abrirEtapaDaEsteira = [\s\S]*setClienteAtual\(c\)[\s\S]*setAno\(a\); setMes\(m\);[\s\S]*'fechamento' : etapa === 'p2' \? 'valor-rebanho' : 'conciliacao'/);
    expect(v2).toContain('if (forcado) { periodoForcadoRef.current = null; setAno(forcado.ano); setMes(forcado.mes); return; }');
    expect(v2.split('onBack={voltaAoResumoRef.current ? voltarAoResumo').length - 1).toBe(3);
  });
  it('a esteira não recalcula status: lê o dono dos pilares e a MESMA consulta da Conciliação', () => {
    const est = readFileSync('src/components/consultor/EsteiraDoMes.tsx', 'utf8');
    expect(est).toContain("rpc('get_status_pilares_ano'");
    expect(est).toContain('consultaDoResumoMes(c.id, mes, null)');
    expect(readFileSync('src/hooks/useResumoConciliacao.ts', 'utf8')).toContain('...consultaDoResumoMes(clienteId, anoMes, contaIds),');
  });
});
