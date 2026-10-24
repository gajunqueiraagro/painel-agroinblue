/**
 * FIN-CONTRATO-CRONOGRAMA-01 (ajuste, Gabriel 20/10/2026) — "Gerar N parcelas" no contrato NOVO não troca o sistema: o contrato nasce
 * pelo gerador do banco com o sistema escolhido (SAC) e a linha que o operador editou na tabela vai, na MESMA ação do Salvar, logo depois
 * da criação, pelo `editarParcelas` (fica "ajustada"). O FIN-POS-FIXADO-01 depende do sistema gravado. Dados SINTÉTICOS.
 * ⚠ P97 (23/10/2026) — o TEMPO deste teste: ele monta o modal inteiro do contrato (≈210 ms sozinho) e espera a prévia do cronograma,
 * que sai depois da espera REAL de 300 ms do modal. No vitest completo, com os workers disputando a máquina, a montagem chegou a
 * 3,8 s e o teste passou dos 5 s padrão ("Test timed out in 5000ms" — reproduzido com 32 workers; sozinho, ≈0,5 s). A regra não
 * mudou: o teste ganhou UM orçamento de tempo explícito (`TEMPO`), e as esperas de dentro (o "Gerar" aparecer, o editarParcelasDe
 * ser chamado) usam o mesmo orçamento em vez de 2 s e 1 s.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const edicao = {
  parcelas: null, ultimaOperacao: null,
  salvarCabecalho: vi.fn(), editarParcelas: vi.fn(), regerar: vi.fn(), desfazer: vi.fn(),
  editarParcelasDe: vi.fn(async (_id: string, _m: unknown, simular: boolean) => ({ simulado: simular, recusa: null, corpo: {} })),
};
vi.mock('@/hooks/useEdicaoDoContrato', () => ({ useEdicaoDoContrato: () => edicao }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'c1', nome: 'Cliente Teste' } }) }));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [] }) }));
vi.mock('@/hooks/useFinanciamentoCadastro', () => ({ useFinanciamentoCadastro: () => ({ contas: [], classificacoes: [] }) }));
vi.mock('@/hooks/useContratoDeCredito', () => ({ useContratoDeCredito: () => ({ documentos: [] }) }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/components/financeiro-v2/NovoFornecedorDialog', () => ({ NovoFornecedorDialog: () => null }));
/* depois de criar o modal abre a aba Liberações (fora do que este teste mede) */
vi.mock('@/components/financiamentos/ContratoDeCredito', () => ({ BlocoLiberacoes: () => null, BlocoDestinacoes: () => null, BlocoDocumentos: () => null }));
/* os campos do contrato não são o que este teste mede: "o que falta" vazio deixa o Salvar ir ao banco */
vi.mock('@/lib/financiamentos/cadastroDoContrato', async (orig) => ({ ...(await orig<typeof import('@/lib/financiamentos/cadastroDoContrato')>()), oQueFalta: () => [] }));

/* o orçamento do teste (o vitest completo estica a montagem do modal ~20x); as esperas de dentro cabem nele */
const TEMPO = 30_000;
const ESPERA = { timeout: TEMPO / 2 };

const CRONOGRAMA = { recusa: null, parcelas: 3, parcelas_so_juros: 0, principal_total: 3000, juros_total: 60, total: 3060, vencimento_final: '2031-03-10',
  linhas: [1, 2, 3].map((n) => ({ numero: n, vencimento: `2031-0${n}-10`, principal: 1000, juros: 30 - (n - 1) * 10, total: 1030 - (n - 1) * 10, saldo_apos: 3000 - n * 1000 })) };
const rpc = vi.fn(async (fn: string, _a?: unknown) => ({
  data: fn === 'fn_financiamento_cronograma' ? CRONOGRAMA : fn === 'fn_financiamento_criar' ? { financiamento_id: 'novo1' } : null, error: null }));
vi.mock('@/integrations/supabase/client', () => {
  const lista = (t: string) => (t === 'financiamento_parcelas' ? [1, 2, 3].map((n) => ({ id: `pc${n}`, numero_parcela: n })) : []);
  const q = (t: string): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    Object.assign(o, { select: () => o, eq: () => o, maybeSingle: async () => ({ data: null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: lista(t), error: null }).then(ok) });
    return o;
  };
  return { supabase: { from: (t: string) => q(t), rpc: (fn: string, a: unknown) => rpc(fn, a) } };
});

import { CadastroDeContratoDialog } from './CadastroDeContratoDialog';

describe('Novo SAC: "Gerar N parcelas" mantém o sistema; a linha editada vai pelo editarParcelas depois de criar', () => {
  it('contrato SAC + 1 parcela ajustada (a 2ª, juros 25,00), na mesma ação do Salvar', async () => {
    render(<CadastroDeContratoDialog aberto aoFechar={vi.fn()} prefill={{ natureza: 'financiamento' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Condições e cronograma' }));
    const gerar = await screen.findByRole('button', { name: 'Gerar 3 parcelas' }, ESPERA);
    fireEvent.click(gerar);
    /* o sistema segue SAC na tela */
    expect(within(screen.getByTestId('condicoes-linha-1')).getByRole('button', { name: 'SAC' }).className).toContain('bg-primary');
    const linha2 = within(screen.getByTestId('tabela-da-aba-condicoes')).getAllByTestId('linha-editar-parcela')[1];
    const [, juros] = within(linha2).getAllByRole('textbox').filter((e) => e.getAttribute('inputmode') === 'decimal');
    fireEvent.focus(juros); fireEvent.change(juros, { target: { value: '25,00' } }); fireEvent.blur(juros);
    expect(within(linha2).getByTestId('selo-ajustada')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByTestId('salvar-cadastro')); });
    const criar = rpc.mock.calls.find((c) => c[0] === 'fn_financiamento_criar');
    expect(criar).toBeTruthy();
    expect((criar![1] as { p_dados: { sistema: string } }).p_dados.sistema).toBe('sac');
    await waitFor(() => expect(edicao.editarParcelasDe).toHaveBeenCalledWith('novo1', { alterar: [{ id: 'pc2', valor_juros: 25 }], acrescentar: [], retirar: [] }, false), ESPERA);
  }, TEMPO);
});
