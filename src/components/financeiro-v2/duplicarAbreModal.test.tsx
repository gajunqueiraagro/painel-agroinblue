/**
 * PR-FIN-DUPLICAR-ABRE-MODAL-01 — "Duplicar" abre o `LancamentoV2Dialog` em modo NOVO, preenchido com o original; só o
 * Salvar grava.
 *
 * ⚠ O CASO DO NJ (30/09 11:16): a cópia de "Vivo Casa" (Telefonica, R$ 506,84, previsto, BB) foi gravada na hora como
 *   "(Cópia) Vivo Casa", SEM vencimento — e com "Data por: Financeira" ela não aparecia em mês nenhum. A fixture é esse
 *   lançamento, com a classificação inteira, documento, forma de pagamento, recorrência e origem de extrato (que a cópia
 *   NÃO pode levar).
 * ⚠ O DIALOG É MONTADO DE VERDADE (nenhum teste do repo o montava): só as bordas são falsas — o banco, o cliente e os
 *   modais filhos. O que se prova é o PAYLOAD que chega no `onSave`, que é o que o `criarLancamento` grava.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
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
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'nj', nome: 'NJ Pecuária' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { prefillDeDuplicar } from '@/lib/financeiro/prefillDeDuplicar';

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Pureza' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{
  id: 'bb', nome_conta: 'Banco do Brasil', banco: 'BB', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Banco do Brasil', agencia: null, numero_conta: null, conta_digito: null,
}];
const FORNECEDORES = [{ id: 'tel', nome: 'Telefonica Brasil S.A.', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-tel', subcentro: 'Telefonia e Internet', centro_custo: 'Administração', grupo_custo: 'Despesas Administrativas',
    macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-mand', subcentro: 'Colheita Mandioca', centro_custo: 'Lavoura', grupo_custo: 'Custeio Lavoura',
    macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'agricultura' },
];

const VIVO: LancamentoV2 = {
  id: 'orig-vivo', cliente_id: 'nj', fazenda_id: 'f-pur', conta_bancaria_id: 'bb', conta_destino_id: null,
  data_competencia: '2026-09-01', data_vencimento: '2026-09-10', data_pagamento: '2026-09-10', ano_mes: '2026-09',
  valor: 506.84, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'previsto', descricao: 'Vivo Casa',
  macro_custo: 'Custeio Produtivo', grupo_custo: 'Despesas Administrativas', centro_custo: 'Administração',
  subcentro: 'Telefonia e Internet', escopo_negocio: 'pecuaria', observacao: 'conta de set', numero_documento: '000123',
  tipo_documento: 'Fatura', favorecido_id: 'tel', forma_pagamento: 'boleto', dados_pagamento: '8469...0001',
  origem_lancamento: 'ofx', recorrencia_id: 'rec-1', plano_conta_id: 'pl-tel', safra_id: null, cultura: null, fase: null,
  cancelado: false, editado_manual: false,
} as LancamentoV2;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});

function montar(props: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>) {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string) => true);
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LancamentoV2Dialog open onClose={onClose} onSave={onSave} lancamento={null}
          fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={[]}
          onCriarFornecedor={async () => null} {...p} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(tree(props));
  return { ...r, onSave, onClose, rerender: (p: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>) => r.rerender(tree(p)) };
}

const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;

describe('Duplicar abre o dialog em modo NOVO, preenchido', () => {
  it('abre com os dados do original — competência, vencimento, valor, fornecedor, conta, subcentro — sem "(Cópia)"', async () => {
    montar({ prefill: prefillDeDuplicar(VIVO) });
    await screen.findByDisplayValue('Vivo Casa');
    expect(screen.getByDisplayValue('01/09/2026')).toBeInTheDocument(); // competência
    expect(screen.getByDisplayValue('10/09/2026')).toBeInTheDocument(); // vencimento
    /* o pagamento NÃO vem (10/09 aparece uma vez só, no vencimento): previsto não tem data de pagamento */
    expect(screen.getAllByDisplayValue('10/09/2026')).toHaveLength(1);
    expect(screen.getByDisplayValue('506,84')).toBeInTheDocument();
    for (const texto of ['Previsto', 'Telefonica Brasil S.A.', 'Faz. Pureza', 'Banco do Brasil', 'Telefonia e Internet']) {
      expect(screen.getAllByRole('combobox').some((c) => c.textContent === texto)).toBe(true);
    }
    expect(screen.queryByDisplayValue(/Cópia/)).toBeNull();
  });

  it('cancelar não grava nada', async () => {
    const { onSave, onClose } = montar({ prefill: prefillDeDuplicar(VIVO) });
    await screen.findByDisplayValue('Vivo Casa');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('salvar grava UM lançamento novo, com a classificação do original e sem pagamento, recorrência ou origem', async () => {
    const { onSave } = montar({ prefill: prefillDeDuplicar(VIVO) });
    await screen.findByDisplayValue('Vivo Casa');
    await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [form, id] = onSave.mock.calls[0];
    expect(id).toBeUndefined(); // modo NOVO
    expect(form).toMatchObject({
      fazenda_id: 'f-pur', conta_bancaria_id: 'bb', data_competencia: '2026-09-01', data_vencimento: '2026-09-10',
      data_pagamento: null, valor: 506.84, tipo_operacao: '2-Saídas', status_transacao: 'previsto', descricao: 'Vivo Casa',
      subcentro: 'Telefonia e Internet', centro_custo: 'Administração', plano_conta_id: 'pl-tel', escopo_negocio: 'pecuaria',
      observacao: 'conta de set', numero_documento: '000123', tipo_documento: 'Fatura', favorecido_id: 'tel',
      forma_pagamento: 'boleto', dados_pagamento: '8469...0001',
    });
    for (const k of ['id', 'recorrencia_id', 'origem_lancamento', 'conciliado_em']) expect(form).not.toHaveProperty(k);
  });
});

describe('cópia de um REALIZADO', () => {
  it('nasce realizado e SEM pagamento; o Salvar fica travado até o operador informar a data', async () => {
    const { onSave } = montar({ prefill: prefillDeDuplicar({ ...VIVO, status_transacao: 'realizado' } as LancamentoV2) });
    await screen.findByDisplayValue('Vivo Casa');
    expect(screen.getAllByRole('combobox').some((c) => c.textContent === 'Realizado')).toBe(true);
    expect(screen.getAllByDisplayValue('10/09/2026')).toHaveLength(1); // só o vencimento; o pagamento vem vazio
    expect(botaoSalvar().disabled).toBe(true);
    fireEvent.click(botaoSalvar());
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('a cultura/fase/atividade da sessão NÃO vaza para a cópia', () => {
  it('abrir antes um lançamento de mandioca e depois duplicar o de pecuária: a cópia sai com a classificação do original', async () => {
    const MANDIOCA = { ...VIVO, id: 'lav-1', descricao: 'Colheita', subcentro: 'Colheita Mandioca', centro_custo: 'Lavoura',
      grupo_custo: 'Custeio Lavoura', plano_conta_id: 'pl-mand', escopo_negocio: 'agricultura', cultura: 'mandioca',
      fase: 'colheita', observacao: 'lavoura' } as LancamentoV2;
    const { rerender, onSave } = montar({ lancamento: MANDIOCA });
    await screen.findByDisplayValue('Colheita');
    rerender({ lancamento: null, prefill: prefillDeDuplicar(VIVO) });
    await screen.findByDisplayValue('Vivo Casa');
    await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [form] = onSave.mock.calls[0];
    expect(form.escopo_negocio).toBe('pecuaria');
    expect(form.cultura ?? null).toBeNull();
    expect(form.fase ?? null).toBeNull();
  });
});

describe('um caminho só: a lista abre o dialog, e o insert direto saiu', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const tela = readFileSync(resolve(__dirname, '../../pages/FinanceiroV2Tab.tsx'), 'utf8');
  const hook = readFileSync(resolve(__dirname, '../../hooks/useFinanceiroV2.ts'), 'utf8');
  it('o "Duplicar" relê o original e abre o dialog com o prefill; nenhum caminho grava na hora', () => {
    expect(tela).toContain('const original = (await hook.buscarLancamentoPorId(lanc.id)) ?? lanc;');
    expect(tela).toContain('setPrefillDuplicar(prefillDeDuplicar(original));');
    expect(tela).toContain('prefill={prefillDuplicar ?? undefined}');
    expect(tela).not.toMatch(/hook\.duplicarLancamento/);
    expect(hook).not.toMatch(/const duplicarLancamento = useCallback/);
    expect(hook).not.toContain("'(Cópia)'");
  });
});
