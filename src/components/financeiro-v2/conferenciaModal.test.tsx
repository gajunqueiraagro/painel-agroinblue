/**
 * PR-CONC-CONFERENCIA-MODAL-01 — a Conferência abre num modal largo, com uma régua só (10px, 18px, uma linha), uma
 * informação por coluna, e o resumo do corpo vira tabela.
 *
 * ⚠ OS NÚMEROS SÃO OS DO PRINT DO GABRIEL (NJ · Banco do Brasil · set/26): o fechamento "diferença -134.613,84" saía
 *   "-134…", e o candidato "Folha de Pagamento · Jonatas…" perdia o nome do funcionário. O banco falso devolve um dia com
 *   esse extrato sem par (o sistema do dia fica em zero, e a diferença é o valor inteiro) e esse candidato programado.
 * ⚠ jsdom NÃO FAZ LAYOUT: "nada cortado" foi medido na tela (tabela 1.060px no modal de 1.090, 280 linhas de 18px, 5.936
 *   células a 10px, zero corte em valor/data/status/ações). Aqui se prova a ESTRUTURA que garante isso — o texto inteiro no
 *   DOM, `whitespace-nowrap` sem `text-ellipsis` onde não pode cortar, 11 colunas em toda linha, a altura única.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EspelhadosReais } from './EspelhoConciliacaoTab';

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
vi.mock('@/components/financeiro-v2/CasarComBancoModal', () => ({ CasarComBancoModal: () => null, CasarN1Modal: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EspelhoConciliacaoTab } from './EspelhoConciliacaoTab';

const ESPELHO: EspelhadosReais = {
  escopo: { cliente_id: 'nj', conta_id: 'bb', ano_mes: '2026-09', nome_conta: 'Banco do Brasil' },
  saldos: { inicial: 177290.71, final_oficial: null, periodo_ini: '2026-09-01', periodo_fim: '2026-09-30', extrato_ini: null, extrato_fim: null },
  ofx_completo: [{
    extrato_id: 'e1', data: '2026-09-05', historico: 'TED Transf.Eletr.Dispon - 237 2372 5216892300015', documento: null,
    valor: -134613.84, status: 'sem_vinculo', flag_dup: false, flag_investimento: false,
  }],
  sistema_completo: [],
  vinculos: [],
  sistema_candidatos: [{
    lancamento_id: 'c1', data_vencimento: '2026-09-05', competencia: '2026-09-01', valor: 3407.89, valor_assinado: -3407.89,
    sinal: '-1', descricao: 'Folha de Pagamento', centro: 'Mão de Obra', subcentro: 'Salários e Encargos',
    status_transacao: 'programado', cenario: 'realizado', cultura: null, numero_documento: null, tipo_documento: null,
    favorecido_id: 'f1', fornecedor: 'Jonatas Barbosa Batista', safra_codigo: null, safra_descricao: null,
    vencido: false, ja_conciliado: false, sem_conta: false,
  }],
  versao: 't', gerado_em: 'agora',
};

beforeEach(() => {
  fixture.espelho = ESPELHO;
  Element.prototype.scrollIntoView = () => {};
});

function montar(props: Partial<React.ComponentProps<typeof EspelhoConciliacaoTab>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = render(
    <QueryClientProvider client={qc}>
      <EspelhoConciliacaoTab clienteId="nj" contaId="bb" ano="2026" mes="09" {...props} />
    </QueryClientProvider>,
  );
  return { ...r, qc };
}

const botaoSubAba = (nome: string) => screen.getByRole('button', { name: nome });
const ativa = (nome: string) => botaoSubAba(nome).className.includes('border-primary');

async function abrirConferencia() {
  montar();
  await screen.findByTestId('resumo-espelho');
  fireEvent.click(botaoSubAba('Conferência'));
  return screen.findByTestId('modal-conferencia');
}
const tabelaDaMesa = (modal: HTMLElement) =>
  [...modal.querySelectorAll('table')].find((t) => t.textContent?.includes('Banco (OFX)'))!;

describe('a sub-aba inicial e o modal', () => {
  it('nasce em "Extrato (banco)", sem modal; clicar "Conferência" abre o Dialog com conta e mês', async () => {
    montar();
    await screen.findByTestId('resumo-espelho');
    expect(ativa('Extrato (banco)')).toBe(true);
    expect(screen.queryByTestId('modal-conferencia')).toBeNull();
    fireEvent.click(botaoSubAba('Conferência'));
    const modal = await screen.findByTestId('modal-conferencia');
    expect(within(modal).getByText('Conferência · Banco do Brasil · set/2026')).toBeInTheDocument();
  });

  it('fechar volta para a sub-aba que estava antes', async () => {
    montar();
    await screen.findByTestId('resumo-espelho');
    fireEvent.click(botaoSubAba('Sistema'));
    fireEvent.click(botaoSubAba('Conferência'));
    const modal = await screen.findByTestId('modal-conferencia');
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByTestId('modal-conferencia')).toBeNull());
    expect(ativa('Sistema')).toBe(true);
  });

  it('controlado de fora: fechar devolve ao pai a sub-aba anterior', async () => {
    const onAbaChange = vi.fn();
    const { rerender, qc } = montar({ aba: 'evolucao', onAbaChange });
    await screen.findByTestId('resumo-espelho');
    rerender(
      <QueryClientProvider client={qc}>
        <EspelhoConciliacaoTab clienteId="nj" contaId="bb" ano="2026" mes="09" aba="conferencia" onAbaChange={onAbaChange} />
      </QueryClientProvider>,
    );
    const modal = await screen.findByTestId('modal-conferencia');
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }));
    expect(onAbaChange).toHaveBeenCalledWith('evolucao');
  });
});

describe('a mesa dentro do modal — uma régua só', () => {
  it('o fechamento mostra "diferença -134.613,84" INTEIRA, numa célula que não corta', async () => {
    const modal = await abrirConferencia();
    const dif = within(modal).getByText('diferença -134.613,84');
    const td = dif.closest('td')!;
    expect(td.className).toContain('whitespace-nowrap');
    expect(td.className).not.toContain('text-ellipsis');
  });

  it('toda linha tem 18px, 11 colunas e nenhuma fonte fora de 10px', async () => {
    const modal = await abrirConferencia();
    const linhas = [...tabelaDaMesa(modal).querySelectorAll('tr')];
    expect(linhas.length).toBeGreaterThanOrEqual(5); // cabeçalho, dia, extrato, candidato, fechamento
    for (const tr of linhas) {
      expect(tr.className).toContain('h-[18px]');
      expect([...tr.children].reduce((a, c) => a + ((c as HTMLTableCellElement).colSpan || 1), 0)).toBe(11);
    }
    expect(tabelaDaMesa(modal).innerHTML).not.toMatch(/text-\[1[1-9]px\]/);
    expect(tabelaDaMesa(modal).className).toContain('text-[10px]');
  });

  it('o candidato: vencimento e status em colunas próprias; o texto guarda descrição · fornecedor · subcentro', async () => {
    const modal = await abrirConferencia();
    const status = modal.querySelector('td[data-status="programado"]')!;
    expect(status.textContent).toBe('Programado');
    /* programado é SÓ TEXTO na paleta: nada de fundo */
    expect(status.innerHTML).not.toMatch(/\bbg-/);
    const linha = status.closest('tr')!;
    const celulas = [...linha.children];
    const texto = celulas[8];
    expect(texto.textContent).toContain('Folha de Pagamento');
    expect(texto.textContent).toContain('Jonatas Barbosa Batista');
    expect(texto.textContent).toContain('Salários e Encargos');
    expect(texto.textContent).not.toContain('Programado');
    expect(texto.textContent).not.toContain('05/09');
    expect(celulas[7].textContent).toBe('05/09');
    expect(celulas[7].getAttribute('title')).toBe('vencimento');
  });
});

describe('o resumo do corpo vira tabela', () => {
  it('Banco (OFX) | Sistema | Diferença com divisores, e o "Sem par" com Qtde e Valor', async () => {
    montar();
    const resumo = await screen.findByTestId('resumo-espelho');
    const [tot, semPar] = [...resumo.querySelectorAll('table')];
    expect([...tot.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['', 'Banco (OFX)', 'Sistema', 'Diferença']);
    expect(tot.querySelector('thead tr')!.className).toContain('bg-primary');
    expect([...tot.querySelectorAll('tbody td')].filter((td) => td.className.includes('border-r')).length).toBe(6);
    expect(within(tot).getAllByText('-134.613,84').length).toBe(2); // saídas do banco e a diferença
    expect([...semPar.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Sem par', 'Qtde', 'Valor']);
    expect(within(semPar).getByText('Extratos').closest('tr')!.textContent).toBe('Extratos1—');
  });
});
