/**
 * FIN-RESUMO-PAGAMENTO-01 — o bloco "Pagamento" do resumo do lançamento diz o STATUS (com a cor da paleta dona) e o VENCIMENTO.
 *
 * ⚠ O PEDIDO DO GABRIEL (04/10): "não aparece vencimento nem se está agendado/programado". O status morava em "Financeiro",
 *   em texto neutro, e o bloco Pagamento só tinha a data de pagamento — vazia em tudo o que ainda não foi pago.
 * ⚠ A COR NÃO É ESCRITA NO MODAL: sai de `STATUS_PALETA` (`statusFinanceiro.ts`). O teste compara com a paleta, não com um hex.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

vi.mock('@/integrations/supabase/client', () => {
  const vazio = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: () => vazio(),
      rpc: () => Promise.resolve({ data: null, error: null }),
      storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'vera', nome: 'Vera' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { esquecerAtividade } from '@/lib/financeiro/ultimaAtividade';
import { STATUS_PALETA, STATUS_PILULA_BASE, STATUS_FINANCEIRO_LABEL, type StatusFinanceiro } from '@/lib/financeiro/statusFinanceiro';

const FAZENDAS = [{ id: 'bg', nome: 'Faz Baia Grande' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{
  id: 'itau', nome_conta: 'Itaú Personalite', banco: 'Itaú', fazenda_id: 'bg', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Itaú Personalite', agencia: null, numero_conta: null, conta_digito: null,
}];
const FORNECEDORES = [{ id: 'agn', nome: 'Agnaldo da Cruz Cunegundes', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-sal', subcentro: 'Salários e Encargos Pecuária', centro_custo: 'Mão de Obra', grupo_custo: 'Custo Fixo Pecuária',
    macro_custo: 'Custeio Produção', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
];
const SAFRAS: Safra[] = [{ id: 'p2627', nome: 'Safra 26/27 Pecuária', codigo: '26/27-Pec', escopo_negocio: 'pecuaria', ativa: true }] as Safra[];
const FOLHA: LancamentoV2 = {
  id: '5c281f67-ebe3-4bdc-a7da-413d40f76792', cliente_id: 'vera', fazenda_id: 'bg', conta_bancaria_id: 'itau',
  conta_destino_id: null, data_competencia: '2026-10-01', data_vencimento: '2026-11-05', data_pagamento: null,
  ano_mes: '2026-10', valor: 3192, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'previsto',
  descricao: 'Folha de Pagamento', macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo Pecuária',
  centro_custo: 'Mão de Obra', subcentro: 'Salários e Encargos Pecuária', escopo_negocio: 'pecuaria', observacao: null,
  numero_documento: null, tipo_documento: null, favorecido_id: 'agn', forma_pagamento: 'PIX', dados_pagamento: null,
  origem_lancamento: 'recorrencia', recorrencia_id: null, plano_conta_id: 'pl-sal', safra_id: 'p2627',
  cultura: null, fase: null, cancelado: false, editado_manual: false,
} as LancamentoV2;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  esquecerAtividade();
});

async function abrir(lanc: LancamentoV2) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LancamentoV2Dialog open={false} onClose={() => {}} onSave={async () => true} lancamento={null}
          fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS}
          onCriarFornecedor={async () => null} {...p} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(tree({}));
  r.rerender(tree({ open: true, lancamento: lanc }));
  await screen.findByDisplayValue('Folha de Pagamento');
  await new Promise((ok) => setTimeout(ok, 30));
}
/** As linhas (rótulo, valor) do bloco Pagamento do resumo, e o elemento do valor de uma delas. */
const linhasPagamento = () => [...screen.getByTestId('resumo-pagamento').children]
  .map(l => [l.querySelector('span')?.textContent ?? '', (l.querySelector('span.tabular-nums')?.textContent ?? '')]);
const valorDe = (rotulo: string) => {
  const linha = [...screen.getByTestId('resumo-pagamento').children].find(l => l.querySelector('span')?.textContent === rotulo);
  if (!linha) throw new Error(`sem a linha ${rotulo}`);
  return linha.querySelector('span.tabular-nums') as HTMLElement;
};

describe('o status no bloco Pagamento, com a cor da paleta', () => {
  const TEXTO: StatusFinanceiro[] = ['previsto', 'programado', 'agendado'];
  it.each(TEXTO)('%s: o rótulo do domínio, só texto colorido em semibold, sem caixa', async (st) => {
    await abrir({ ...FOLHA, status_transacao: st });
    const v = valorDe('Status');
    expect(v.textContent).toBe(STATUS_FINANCEIRO_LABEL[st]);
    expect(v.className).toContain(STATUS_PALETA[st].texto);
    expect(v.className).toContain('font-semibold');
    expect(v.className).not.toContain('rounded-[7px]');
    /* a cor é a DAQUELE status, não a de outro */
    for (const outro of TEXTO.filter(o => o !== st)) expect(v.className).not.toContain(STATUS_PALETA[outro].texto);
  });
  it('realizado: a pílula com caixa da paleta', async () => {
    await abrir({ ...FOLHA, status_transacao: 'realizado', data_pagamento: '2026-11-05' });
    const v = valorDe('Status');
    expect(v.textContent).toBe('Realizado');
    for (const c of [...STATUS_PILULA_BASE.split(' '), ...STATUS_PALETA.realizado.pilula.split(' ')]) expect(v.className).toContain(c);
    expect(STATUS_PALETA.realizado.comCaixa).toBe(true);
  });
});

describe('a ordem do bloco e o vencimento', () => {
  it('Status · Vencimento · Pagamento · Forma · Modalidade · Nº de Parcelas; previsto mostra o vencimento e "—" no pagamento', async () => {
    await abrir(FOLHA);
    expect(linhasPagamento()).toEqual([
      ['Status', 'Previsto'], ['Vencimento', '05/11/2026'], ['Pagamento', '—'], ['Forma', 'PIX'], ['Modalidade', '—'], ['Nº de Parcelas', '—'],
    ]);
  });
  it('sem vencimento: "—"; realizado mostra as duas datas', async () => {
    await abrir({ ...FOLHA, data_vencimento: null, status_transacao: 'realizado', data_pagamento: '2026-11-06' });
    expect(linhasPagamento().slice(0, 3)).toEqual([['Status', 'Realizado'], ['Vencimento', '—'], ['Pagamento', '06/11/2026']]);
  });
  it('"Status" não aparece mais em Financeiro: uma linha só no resumo inteiro', async () => {
    await abrir(FOLHA);
    const aside = screen.getByTestId('resumo-pagamento').closest('aside') as HTMLElement;
    /* a busca sabe achar: o resumo tem as outras linhas */
    expect(within(aside).getByText('Conta origem')).toBeInTheDocument();
    expect(within(aside).getAllByText('Status')).toHaveLength(1);
    expect(screen.getByTestId('resumo-pagamento').contains(within(aside).getByText('Status'))).toBe(true);
  });
});
