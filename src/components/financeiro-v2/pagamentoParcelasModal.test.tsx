/**
 * P143 PAGAMENTO-PARCELAS-01 — no Editar lançamento (o modal de verdade; dado SINTETICO):
 * M1 a parcela de parcelamento: a tabela das parcelas no bloco Parcelamento (a aberta destacada) e o Resumo "Compra parcelada · i de N"
 * M2 clicar noutra parcela troca o lançamento NO MESMO MODAL (o hospedeiro rele^), fica na aba Pagamento e oferece a volta
 * M3 com algo mudado, pergunta antes de trocar (nada se perde calado)
 * M4 sem `onTrocarLancamento` a tabela so' se le^
 * M5 a parcela SOLTA no Resumo: "Parcela solta · k de N"
 * M6 o bug do 150a759d: a forma gravada fora da lista aparece no Editar ("valor atual"), igual ao Resumo
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { LancamentoV2, ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { lerSituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

vi.mock('@/integrations/supabase/client', () => {
  const vazio = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains', 'like']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: () => vazio(), rpc: () => Promise.resolve({ data: null, error: null }),
      storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-sint', nome: 'Cliente Sintetico' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
/* o bloco do "Voltar para à vista" sem a prévia do banco: so' a moldura e o que vai dentro dele */
vi.mock('@/components/financeiro-v2/VoltarParaAVista', () => ({
  VoltarParaAVista: ({ children }: { children?: ReactNode }) => <section data-testid="voltar-a-vista-bloco">{children}</section>,
}));

const parcela = (numero: number, situacao: string) => ({
  id: `p${numero}`, numero, data_vencimento: `2026-0${numero + 5}-16`, valor_principal: 239.99, valor_juros: 0, valor_total: 239.99, situacao,
  pago_em: situacao === 'paga' ? '2026-06-16' : null, valor_pago: situacao === 'paga' ? 239.99 : 0, lancamento_id: `lanc-${numero}`,
  lancamento_juros_id: null, fonte: 'lancamento', diverge: false, conta_nome: 'Cartão Sintetico', documentos: [], boletos: 0,
});
const SITUACAO = lerSituacaoDoContrato({
  parcelas: [parcela(1, 'paga'), parcela(2, 'vencida'), parcela(3, 'pendente'), parcela(4, 'pendente')],
  cartoes: { valor_contrato: 959.96, pago: 239.99, a_vencer: 479.98, vencido: 239.99, adiado: 0, adiado_qtde: 0, pagas: 1, parcelas: 4,
    juros_previstos: 0, soma_principal: 959.96, soma_total: 959.96, divergentes: 0 },
});
vi.mock('@/lib/financiamentos/parcelaNoModalBanco', () => ({
  lerContratoDaParcela: vi.fn(async (id: string) => (id.startsWith('lanc-') ? { financiamentoId: 'fin-sint', situacao: SITUACAO } : null)),
  gravarParcelaDoModal: vi.fn(async () => null),
}));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { esquecerAtividade } from '@/lib/financeiro/ultimaAtividade';

const FAZENDAS: Fazenda[] = [{ id: 'faz', nome: 'Faz Sintetica', owner_id: 'u1', cliente_id: 'cli-sint' }];
const CONTAS: ContaBancariaV2[] = [{
  id: 'cartao', nome_conta: 'Cartão Sintetico', banco: 'Banco Sintetico', fazenda_id: 'faz', tipo_conta: 'cartao', codigo_conta: null,
  nome_exibicao: 'Cartão Sintetico', agencia: null, numero_conta: null, conta_digito: null,
}];
const FORNECEDORES: FornecedorV2[] = [{ id: 'forn', nome: 'Fornecedor Sintetico', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null,
  pix_tipo_chave: null, pix_chave: null, banco: null, agencia: null, conta: null, tipo_conta: null, cpf_cnpj_pagamento: null, nome_favorecido: null,
  observacao_pagamento: null }];
const CLASSIF: ClassificacaoItem[] = [{ id: 'pl', subcentro: 'Manutenção Sintetica', centro_custo: 'Manutenção', grupo_custo: 'Custo Fixo Pecuária',
  macro_custo: 'Custeio Produção', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' }];
const SAFRAS: Safra[] = [];
const BASE: LancamentoV2 = {
  id: 'lanc-2', cliente_id: 'cli-sint', fazenda_id: 'faz', conta_bancaria_id: 'cartao', conta_destino_id: null, data_competencia: '2026-05-04',
  data_vencimento: '2026-07-16', data_pagamento: null, ano_mes: '2026-05', valor: 239.99, sinal: -1, tipo_operacao: '2-Saídas',
  status_transacao: 'programado', descricao: 'Bomba sintetica 2/4', macro_custo: 'Custeio Produção', grupo_custo: 'Custo Fixo Pecuária',
  centro_custo: 'Manutenção', subcentro: 'Manutenção Sintetica', escopo_negocio: 'pecuaria', observacao: null, documento: null, historico: null,
  numero_documento: null, favorecido_id: 'forn', origem_lancamento: 'parcelamento', lote_importacao_id: null, forma_pagamento: 'Cartão',
  dados_pagamento: null, cancelado: false, conciliado_em: null, editado_manual: false, created_by: null, created_at: '2026-05-04T00:00:00Z',
  updated_at: '2026-05-04T00:00:00Z', movimentacao_rebanho_id: null, plano_conta_id: 'pl', safra_id: null, cultura: null, fase: null,
  tipo_documento: null, origem_tipo: 'parcela_principal', recorrencia_id: null,
};
/* `financiamento_id` vem do banco na linha inteira, mas nao esta' no tipo `LancamentoV2` (o modal o le^ por `Reflect.get`) */
const PARCELA = (n: number, extra: Partial<LancamentoV2> & { financiamento_id?: string | null } = {}): LancamentoV2 => {
  const comContrato = { financiamento_id: 'fin-sint', ...extra };
  return { ...BASE, id: `lanc-${n}`, data_vencimento: `2026-0${n + 5}-16`, descricao: `Bomba sintetica ${n}/4`, ...comContrato };
};

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  esquecerAtividade();
});

function montar(lanc: LancamentoV2, onTrocarLancamento?: (id: string) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (l: LancamentoV2 | null, open: boolean) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LancamentoV2Dialog open={open} onClose={() => {}} onSave={async () => true} lancamento={l} fazendas={FAZENDAS} contas={CONTAS}
          classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS} onCriarFornecedor={async () => null} onTrocarLancamento={onTrocarLancamento} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(tree(null, false));
  r.rerender(tree(lanc, true));
  return { trocar: (l: LancamentoV2) => r.rerender(tree(l, true)) };
}
async function irAoPagamento() {
  const aba = screen.getByRole('tab', { name: /Pagamento/ });
  fireEvent.mouseDown(aba); fireEvent.click(aba);
}
const linhasPagamento = () => [...screen.getByTestId('resumo-pagamento').querySelectorAll('tr')].flatMap((tr) => {
  const td = [...tr.querySelectorAll('td')].map((c) => c.textContent ?? '');
  return [[td[0], td[1]], [td[2], td[3]]];
});

describe('P143 — as parcelas no Editar', () => {
  it('M1 a tabela das 4 (a 2/4 aberta destacada) dentro do bloco, com os totais do banco; o Resumo "Compra parcelada · 2 de 4"', async () => {
    montar(PARCELA(2), vi.fn());
    await screen.findByDisplayValue('Bomba sintetica 2/4');
    await irAoPagamento();
    const linhas = await screen.findAllByTestId('parcela-no-pagamento');
    expect(linhas).toHaveLength(4);
    expect(linhas.map((l) => l.getAttribute('data-aberta'))).toEqual([null, 'sim', null, null]);
    expect(screen.getByTestId('voltar-a-vista-bloco').contains(linhas[0])).toBe(true);
    expect(screen.getByTestId('parcelas-no-pagamento-rodape').textContent).toBe('4 parcelas · R$ 959,96pagas 1 · R$ 239,99a pagar 3 · R$ 719,97');
    expect(linhasPagamento().slice(4)).toEqual([['Modalid.', 'Compra parcelada'], ['Parcelas', '2 de 4']]);
  });
  it('M2 clicar na 3/4 troca no mesmo modal, fica no Pagamento e oferece a volta à de antes', async () => {
    const trocar = vi.fn();
    const m = montar(PARCELA(2), trocar);
    await screen.findByDisplayValue('Bomba sintetica 2/4');
    await irAoPagamento();
    fireEvent.click((await screen.findAllByTestId('parcela-no-pagamento'))[2]);
    expect(trocar).toHaveBeenCalledWith('lanc-3');
    m.trocar(PARCELA(3));
    /* sem clicar na aba: continua no Pagamento (a descrição, que mora na aba Geral, nem está na tela) */
    await waitFor(() => expect(screen.getAllByTestId('parcela-no-pagamento').map((l) => l.getAttribute('data-aberta'))).toEqual([null, null, 'sim', null]));
    expect(screen.queryByDisplayValue('Bomba sintetica 3/4')).toBeNull();
    expect(screen.getByRole('tab', { name: /Pagamento/ }).getAttribute('data-state')).toBe('active');
    fireEvent.click(screen.getByTestId('parcela-voltar'));
    expect(trocar).toHaveBeenLastCalledWith('lanc-2');
  });
  it('M3 com a descrição mudada, pergunta antes; "Ficar" não troca, "Trocar sem salvar" troca', async () => {
    const trocar = vi.fn();
    montar(PARCELA(2), trocar);
    const desc = await screen.findByDisplayValue('Bomba sintetica 2/4');
    fireEvent.change(desc, { target: { value: 'Bomba sintetica mudada 2/4' } });
    await irAoPagamento();
    fireEvent.click((await screen.findAllByTestId('parcela-no-pagamento'))[0]);
    expect(trocar).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('parcela-troca-cancelar'));
    expect(trocar).not.toHaveBeenCalled();
    fireEvent.click((await screen.findAllByTestId('parcela-no-pagamento'))[0]);
    fireEvent.click(await screen.findByTestId('parcela-troca-confirmar'));
    expect(trocar).toHaveBeenCalledWith('lanc-1');
  });
  it('M4 sem onTrocarLancamento a tabela só se lê', async () => {
    montar(PARCELA(2));
    await screen.findByDisplayValue('Bomba sintetica 2/4');
    await irAoPagamento();
    const linhas = await screen.findAllByTestId('parcela-no-pagamento');
    expect(linhas.some((l) => (l.getAttribute('title') ?? '').startsWith('Abrir'))).toBe(false);
    expect(screen.queryByTestId('parcela-voltar')).toBeNull();
  });
  it('M5 a parcela solta (sem parcelamento) no Resumo: "Parcela solta · 2 de 3"', async () => {
    montar(PARCELA(2, { id: 'solta-2', descricao: 'Peca sintetica - 2/3', origem_tipo: null, financiamento_id: null, origem_lancamento: 'excel' }), vi.fn());
    await screen.findByDisplayValue('Peca sintetica - 2/3');
    expect(linhasPagamento().slice(4)).toEqual([['Modalid.', 'Parcela solta'], ['Parcelas', '2 de 3']]);
  });
  it('M6 a forma gravada fora da lista ("Cartão de Crédito") aparece no Editar como no Resumo', async () => {
    montar(PARCELA(2, { forma_pagamento: 'Cartão de Crédito' }), vi.fn());
    await screen.findByDisplayValue('Bomba sintetica 2/4');
    await irAoPagamento();
    const rotulo = await screen.findByText('Forma de pagamento');
    const gatilho = rotulo.parentElement?.querySelector('button[role="combobox"]');
    expect(gatilho?.textContent).toContain('Cartão de Crédito');
    /* o gatilho (150px) mostra SÓ a forma: o "· valor atual" fica na lista (inteiro cortava em "…" no gate) */
    expect(gatilho?.textContent).not.toContain('valor atual');
    expect(linhasPagamento()[1]).toEqual(['Forma', 'Cartão de Crédito']);
  });
});
