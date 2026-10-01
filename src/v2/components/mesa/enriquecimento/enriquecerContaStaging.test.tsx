/**
 * PR-CONC-EXCEL-CONTA-STAGING-01 — o `EnriquecerTresPassos` entrega o de-para de conta ao `popular` e avisa quando a
 * sessão do mês foi gravada sem conta.
 *
 * ⚠ O DEFEITO NASCEU AQUI (`irParaRevisao`): um laço de `imp.resolverConta(...)` — que só agenda o estado — seguido
 *   de `imp.popular()`, que lia o mapa ainda vazio. Este teste prova a CHAMADA: o `popular` recebe as respostas do
 *   passo 1 e o catálogo da memória por parâmetro, e o `resolverConta` nem é chamado.
 * ⚠ E A SESSÃO JÁ GRAVADA SEM CONTA (NJ, set/26: 483 de 509) não se conserta recasando: a aba diz, com o número.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const BB = 'Banco do Brasil - Pecuária Ag. 8974 C/C 25367 7';
const DEPARA_CONTA = { [BB]: { texto: BB, qtd: 235, valor: 'bb', origem: 'alias', rotulo: 'Banco do Brasil' },
  'Cartao-BB': { texto: 'Cartao-BB', qtd: 24, valor: null, origem: 'pendente', rotulo: null } };
const CATALOGO = [{ id: 'bb', nome_conta: 'Banco do Brasil', nome_exibicao: 'Banco do Brasil', banco: null, agencia: null, numero_conta: null, aliases: [BB] }];

const M = vi.hoisted(() => ({
  popular: vi.fn(), resolverConta: vi.fn(), casarSessao: vi.fn(),
  sessoes: [] as unknown[], staging: [] as unknown[],
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'nj' } }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ useFinanceiroV2: () => ({ criarFornecedor: vi.fn() }) }));
vi.mock('@/components/financeiro-v2/NovoFornecedorDialog', () => ({ NovoFornecedorDialog: () => null }));
/* PR-CONC-ENRIQUECER-V2-01 — no passo 2 quem fala é o painel (mockado aqui): a casca só lhe entrega o caminho do passo 1. */
vi.mock('./MesaEnriquecimentoTab', () => ({
  MesaEnriquecimentoTab: (p: { onPlanilha?: () => void; pendentesDePara?: number | null }) => (
    <button type="button" data-testid="painel-mock" data-pendentes={String(p.pendentesDePara)} onClick={p.onPlanilha}>1 · Planilha e de-para</button>
  ),
}));
vi.mock('./EnriquecerPasso1DePara', () => ({
  EnriquecerPasso1DePara: (p: { onIrParaRevisao: () => void }) => <button type="button" onClick={p.onIrParaRevisao}>Ir para a Revisão</button>,
}));
vi.mock('@/v2/hooks/useImportLancamentosExcel', () => ({
  useImportLancamentosExcel: () => ({
    dePara: { conta: DEPARA_CONTA, subcentro: {}, fazenda: {}, fornecedor: {}, safra: {} },
    pendentes: { total: 1 }, parse: { rows: [], nomeSheet: 'set' }, arquivo: new File(['x'], 'nj-set26.xlsx'),
    lendo: false, erro: null, classificacoes: [], fornecedores: [], fazendas: [], contasBancarias: [], safras: [],
    contasResolviveis: CATALOGO,
    lerArquivo: vi.fn(), resolverManualmente: vi.fn(), alternarDescarte: vi.fn(), limpar: vi.fn(),
  }),
}));
vi.mock('@/v2/hooks/useImportarClassificacao', () => ({
  useImportarClassificacao: () => ({
    lote: { rows: [], totalLinhas: 1, linhasValidas: 1, linhasComErro: 0, erros: [] },
    popular: M.popular, resolverConta: M.resolverConta, reset: vi.fn(), selecionarArquivo: vi.fn(),
    isPopulating: false, parsing: false, progresso: null,
  }),
}));
vi.mock('@/v2/hooks/useClassificacaoStaging', () => ({
  useSessoesClassificacao: () => ({ data: M.sessoes }),
  useClassificacaoStaging: () => ({ staging: M.staging, casarSessao: M.casarSessao, isCasando: false }),
}));

import { EnriquecerTresPassos } from './EnriquecerTresPassos';

beforeEach(() => {
  M.sessoes = []; M.staging = [];
  M.popular.mockReset().mockResolvedValue({ sessaoId: 's-nova', inseridas: 509, counts: {} });
  M.resolverConta.mockReset();
  M.casarSessao.mockReset().mockResolvedValue({ casou: 44, ambiguo: 2, sugestaoGrupo: 0, sugestaoSplit: 0, semPar: 0, semConta: 0 });
});

describe('Ir para a Revisão entrega o de-para ao popular', () => {
  it('por parâmetro — respostas do passo 1 e catálogo da memória; resolverConta nem é chamado', async () => {
    render(<EnriquecerTresPassos ano={2026} mes={9} clienteNome="NJ Pecuária" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ir para a Revisão' }));
    await waitFor(() => expect(M.popular).toHaveBeenCalledTimes(1));
    expect(M.popular).toHaveBeenCalledWith({ deParaConta: DEPARA_CONTA, contasMemoria: CATALOGO });
    expect(M.resolverConta).not.toHaveBeenCalled();
    await waitFor(() => expect(M.casarSessao).toHaveBeenCalledWith({ sessao_id: 's-nova', ano_mes: '2026-09' }));
  });
});

describe('sessão do mês gravada sem conta', () => {
  const sessaoSet26 = { sessao_id: 'b6955356', excel_ano_mes: '2026-09', criada_em: '2026-09-30T10:38:26Z', total: 509 };
  const linha = (st: string, i: number) => ({ staging_id: `st${i}`, match_status: st, aplicado: false, excel_valor: 1, excel_linha_origem: i });

  it('mostra "N linhas desta planilha ficaram sem conta — reimporte a planilha", com o caminho para o passo 1', async () => {
    M.sessoes = [sessaoSet26];
    M.staging = [linha('sem_conta_para_match', 1), linha('sem_conta_para_match', 2), linha('ja_aplicado', 3)];
    render(<EnriquecerTresPassos ano={2026} mes={9} clienteNome="NJ Pecuária" />);
    /* passo 2: o aviso mora no slot do painel (PR-CONC-ENRIQUECER-V2-01) — a casca não o repete */
    const painel = await screen.findByTestId('painel-mock');
    expect(screen.queryByTestId('aviso-sem-conta')).toBeNull();
    expect(painel.getAttribute('data-pendentes')).toBe('1');
    fireEvent.click(painel);
    expect(screen.getByRole('button', { name: 'Ir para a Revisão' })).toBeInTheDocument(); // passo 1 aberto
    const aviso = screen.getByTestId('aviso-sem-conta');
    expect(aviso.textContent).toContain('2 linhas desta planilha ficaram sem conta — reimporte a planilha.');
  });

  it('sessão com conta em todas as linhas: sem aviso', async () => {
    M.sessoes = [sessaoSet26];
    M.staging = [linha('exato', 1), linha('sem_match', 2)];
    render(<EnriquecerTresPassos ano={2026} mes={9} clienteNome="NJ Pecuária" />);
    await waitFor(() => expect(screen.queryByTestId('aviso-sem-conta')).toBeNull());
  });
});
