/**
 * CONC-CRIAR-PERDE-DADOS-01 item 2 (Gabriel 08/11 10:57) — O CICLO do "Criar lançamento pela diferença": abrir o "Casar com o banco" sem
 * levados (diferença = o extrato inteiro), criar, salvar e voltar com o lançamento novo LEVADO, a diferença 0 e o Conciliar pronto —
 * mesmo com o dono se repintando (a estação relê o mês depois que o lançamento grava e refaz o objeto do extrato, igual).
 * O diálogo do lançamento e o banco são falsos aqui (sintéticos); a RPC da simulação responde pelos itens que recebe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

interface PropsDoModal {
  onSave: (f: { valor: number; descricao?: string }) => Promise<boolean | string>;
  onClose: () => void;
  prefill?: { valor?: number };
}

const M = vi.hoisted(() => {
  const m: { props: PropsDoModal | null; rpc: ReturnType<typeof vi.fn>; criarComId: ReturnType<typeof vi.fn> } =
    { props: null, rpc: vi.fn(), criarComId: vi.fn() };
  return m;
});

vi.mock('sonner', () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => M.rpc(...a) } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { fazenda_id: 'faz-da-conta' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanceiroV2', () => ({
  useFinanceiroV2: () => ({
    contasBancarias: [{ id: 'conta-extrato', nome_conta: 'Banco Exemplo' }], fornecedores: [], classificacoes: [], safras: [],
    loadContas: async () => {}, loadFornecedores: async () => {}, loadClassificacoes: async () => {}, loadSafras: async () => {},
    criarFornecedor: async () => null, criarLancamentoComId: (...a: unknown[]) => M.criarComId(...a),
  }),
  notificarLancamentosMudaram: () => {},
}));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-1' } }) }));
vi.mock('@/components/financeiro-v2/LancamentoV2Dialog', () => ({
  LancamentoV2Dialog: (p: PropsDoModal) => { M.props = p; return null; },
}));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));

import { CasarComBancoModal } from './CasarComBancoModal';

/* o extrato do caso (sintético): uma saída de R$ 10.500,00 sem par */
const extratoNovo = () => ({ extrato_id: 'ext-10500', data: '2026-10-08', historico: 'PIX ENVIADO MECANICA EXEMPLO', valor: -10500 });

beforeEach(() => {
  M.props = null;
  M.criarComId.mockReset().mockResolvedValue('lanc-novo');
  /* a simulação: soma os itens que recebe (o que a `fn_espelho_casar` faz) */
  M.rpc.mockReset().mockImplementation(async (nome: string, args: { p_itens?: { valor: number }[] }) => {
    if (nome !== 'fn_espelho_casar') return { data: null, error: null };
    const soma = (args.p_itens ?? []).reduce((s, i) => s + i.valor, 0);
    return Math.abs(soma - 10500) < 0.005
      ? { data: { ok: true, no_extrato: -10500, soma: -10500 }, error: null }
      : { data: { ok: false, motivo: 'soma_nao_bate', no_extrato: -10500, soma: -soma, diferenca: 10500 - soma }, error: null };
  });
});

/* o dono que se repinta: cada `repintar()` passa um extrato NOVO e IGUAL e `iniciais` novo e vazio (a releitura) */
function montar() {
  const el = () => (
    <CasarComBancoModal open onClose={() => {}} extrato={extratoNovo()} iniciais={[]} contaBancariaId="conta-extrato" onConciliado={() => {}} />
  );
  const r = render(el());
  return () => r.rerender(el());
}

describe('o ciclo do "Criar lançamento pela diferença"', () => {
  it('volta com o lançamento novo levado, a diferença 0 e o Conciliar pronto — mesmo com o dono relendo', async () => {
    const repintar = montar();
    await waitFor(() => expect(screen.getByText('Criar lançamento pela diferença').closest('button')?.disabled).toBe(false));
    expect(screen.getByText(/lançamentos levados \(0\)/)).toBeTruthy();
    fireEvent.click(screen.getByText('Criar lançamento pela diferença'));
    await waitFor(() => expect(M.props).not.toBeNull());
    expect(M.props?.prefill?.valor).toBe(10500);
    await act(async () => { await M.props?.onSave({ valor: 10500, descricao: 'Peças da mecânica' }); });
    /* a releitura depois que o lançamento gravou: o dono se repinta ANTES e DEPOIS de o modal fechar */
    repintar();
    await act(async () => { M.props?.onClose(); });
    repintar();
    await waitFor(() => expect(screen.getByText(/lançamentos levados \(1\)/)).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('frase-diferenca').textContent).toBe('Confere com o banco ✓'));
    const conciliar = screen.getByTestId('conciliar-casar');
    expect(conciliar.textContent).toBe('Conciliar');
    expect((conciliar as HTMLButtonElement).disabled).toBe(false);
    /* a simulação recebeu o lançamento novo com o valor da diferença */
    const ultima = M.rpc.mock.calls.filter((c) => c[0] === 'fn_espelho_casar').at(-1);
    expect(ultima?.[1]).toMatchObject({ p_extrato_id: 'ext-10500', p_itens: [{ lancamento_id: 'lanc-novo', valor: 10500 }], p_simular: true });
  });

  it('o dono que se repinta com o modal aberto não apaga os levados (o objeto do extrato igual)', async () => {
    const LEV = { lancamento_id: 'l-1', descricao: 'Bomba', fornecedor: null, valor_assinado: -10500 };
    const iniciais = () => [{ ...LEV }];
    const el = () => (
      <CasarComBancoModal open onClose={() => {}} extrato={extratoNovo()} iniciais={iniciais()} contaBancariaId="conta-extrato" onConciliado={() => {}} />
    );
    const r = render(el());
    fireEvent.click(await screen.findByText('remover deste casamento'));
    expect(screen.getByText(/lançamentos levados \(0\)/)).toBeTruthy();
    r.rerender(el());
    /* o que o operador fez no modal aberto fica: o levado removido não volta por um objeto igual */
    expect(screen.getByText(/lançamentos levados \(0\)/)).toBeTruthy();
  });
});

describe('a fonte do modal no padrão (PADROES-UI A18, a escala de modal)', () => {
  it('cabeçalho 36px com título 12/500; valor do topo 15/500; rodapé 32px com botões de 22px; nada abaixo de 10px', async () => {
    const LEV = { lancamento_id: 'l-1', descricao: 'Bomba', fornecedor: null, valor_assinado: -10500, numero_documento: '000123456' };
    render(<CasarComBancoModal open onClose={() => {}} extrato={extratoNovo()} iniciais={[LEV]} contaBancariaId="conta-extrato" onConciliado={() => {}} />);
    const titulo = await screen.findByText('Casar com o banco');
    expect(titulo.className).toContain('text-[12px] font-medium');
    expect(titulo.parentElement?.className).toContain('h-9');
    expect(screen.getByTestId('casar-valor-banco').className).toContain('text-[15px] font-medium');
    expect(screen.getByTestId('casar-rodape').className).toMatch(/\bh-8\b/);
    expect(screen.getByTestId('criar-pela-diferenca').className).toContain('h-[22px]');
    expect(screen.getByTestId('conciliar-casar').className).toContain('h-[22px]');
    const modal = titulo.closest('[role="dialog"]');
    expect(modal?.innerHTML ?? '').not.toMatch(/text-\[(?:[0-8]|9(?:\.\d+)?)px\]/);
  });
});
