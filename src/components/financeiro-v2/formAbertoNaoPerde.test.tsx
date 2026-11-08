/**
 * CONC-CRIAR-PERDE-DADOS-01 (Gabriel 08/11 10:55, URGENTE) — o "criar do extrato" perdia tudo o que foi digitado: a Conciliação relê
 * (`useEspelhadosReais`: o react-query relê ao voltar o foco à janela e repinta a cada `isFetching`), o dono monta o `movimento` de novo
 * a cada render, o `prefill` muda de IDENTIDADE e a hidratação do `LancamentoV2Dialog` repunha todos os campos.
 * A REGRA: FORMULÁRIO ABERTO NUNCA PERDE DADOS — a hidratação só roda quando o CONTEÚDO do `prefill`/`lockedFields` muda (o "+ Da nota"
 * segue reidratando), nunca por um objeto novo igual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { CampoTravavelDoModal } from '@/lib/oc/lancarPeloModal';
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
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente Exemplo' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';

const FAZENDAS = [{ id: 'f1', nome: 'Faz. Exemplo' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{
  id: 'itau', nome_conta: 'Itaú Personalite', banco: 'Itaú', fazenda_id: 'f1', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Itaú Personalite', agencia: null, numero_conta: null, conta_digito: null,
}];
const FORNECEDORES = [{ id: 'banco', nome: 'Banco Exemplo', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-rend', subcentro: 'Rendimento de Aplicação', centro_custo: 'Receitas Financeiras', grupo_custo: 'Receitas Financeiras',
    macro_custo: 'Receita Não Operacional', tipo_operacao: '1-Entradas', escopo_negocio: 'pecuaria' },
];

type Props = Partial<React.ComponentProps<typeof LancamentoV2Dialog>>;
/* o prefill do "criar do extrato" (o que o `CriarLancamentoDaLinha` monta) — sintético */
const doExtrato = () => ({
  fazenda_id: 'f1', conta_destino_id: 'itau', data_pagamento: '2026-10-08', data_competencia: '2026-10-08', data_vencimento: '2026-10-08',
  valor: 6000, tipo_operacao: '1-Entradas', status_transacao: 'realizado', descricao: 'PIX ENVIADO MECANICA EXEMPLO',
}) as Props['prefill'];
const travas = (): CampoTravavelDoModal[] => ['valor', 'data_pagamento', 'conta_destino_id'];

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (q: Props) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LancamentoV2Dialog open={false} onClose={() => {}} onSave={vi.fn(async (_f: LancamentoV2Form) => true)} lancamento={null}
          fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={[]}
          onCriarFornecedor={async () => null} {...q} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(tree({}));
  r.rerender(tree({ open: true, prefill: doExtrato(), lockedFields: travas() }));
  return (q: Props) => r.rerender(tree({ open: true, ...q }));
}
const campoDescricao = () => screen.getByPlaceholderText('Descrição do produto') as HTMLInputElement;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

describe('formulário aberto nunca perde dados', () => {
  it('a releitura da Conciliação (prefill e travas NOVOS, com o MESMO conteúdo) não apaga o que foi digitado', () => {
    const repintar = montar();
    expect(campoDescricao().value).toBe('PIX ENVIADO MECANICA EXEMPLO');
    fireEvent.change(campoDescricao(), { target: { value: 'Rolamento e bomba — mecânica' } });
    repintar({ prefill: doExtrato(), lockedFields: travas() });
    repintar({ prefill: doExtrato(), lockedFields: travas() });
    expect(campoDescricao().value).toBe('Rolamento e bomba — mecânica');
  });

  it('o prefill com CONTEÚDO novo (o "+ Da nota" lido) continua reidratando', () => {
    const repintar = montar();
    fireEvent.change(campoDescricao(), { target: { value: 'digitado' } });
    repintar({ prefill: { ...doExtrato(), descricao: 'Da nota: peças' } as Props['prefill'], lockedFields: travas() });
    expect(campoDescricao().value).toBe('Da nota: peças');
  });
});

describe('o Editar também: a lista relê a linha aberta (o mesmo lançamento, objeto novo)', () => {
  it('o que foi digitado fica', () => {
    const repintar = montar();
    /* o mesmo lançamento relido: um objeto NOVO, igual, a cada chamada (sintético) */
    const lanc = (): LancamentoV2 => ({
      id: 'l-1', cliente_id: 'cli', fazenda_id: 'f1', conta_bancaria_id: 'itau', conta_destino_id: null, data_competencia: '2026-10-08',
      data_vencimento: '2026-10-08', data_pagamento: null, ano_mes: '2026-10', valor: 330, sinal: -1, tipo_operacao: '2-Saídas',
      status_transacao: 'programado', descricao: 'Bomba alimentadora', macro_custo: null, grupo_custo: null, centro_custo: null, subcentro: null,
      escopo_negocio: null, observacao: null, documento: null, historico: null, numero_documento: null, favorecido_id: null,
      origem_lancamento: 'manual', lote_importacao_id: null, forma_pagamento: null, dados_pagamento: null, cancelado: false, conciliado_em: null,
      editado_manual: false, created_by: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
      movimentacao_rebanho_id: null, recorrencia_id: null,
    });
    repintar({ prefill: undefined, lockedFields: undefined, lancamento: lanc() });
    expect(campoDescricao().value).toBe('Bomba alimentadora');
    fireEvent.change(campoDescricao(), { target: { value: 'Bomba alimentadora e rolamento' } });
    repintar({ prefill: undefined, lockedFields: undefined, lancamento: lanc() });
    expect(campoDescricao().value).toBe('Bomba alimentadora e rolamento');
  });
});
