/**
 * PR-FIN-SAFRA-MODAL-01 — a safra GRAVADA abre e salva como está; a sugestão pela data só preenche campo VAZIO.
 *
 * ⚠ O CASO DO NJ (FASE 0 de 03/10): a Venda 17,68 t da NF 9297983 (a8559a41, 9.356,26, competência 26/08/2026) está em
 *   25/26-Lav; abrir o "Editar Lançamento" mostrava 26/27-Lav "sugerida", e salvar sem tocar gravava 26/27. Assim 19
 *   lançamentos de mandioca foram para 26/27 e 5 caíram para 24/25. O efeito de sugestão de um bloco montado com o estado
 *   do RESET mandava `c => ({...c, safra_id: ''})`, e o updater vale sobre o estado VIVO — o da hidratação.
 * ⚠ O DIALOG É MONTADO DE VERDADE, como na tela: fechado e sem lançamento, depois aberto com ele (o `FinanceiroV2Tab`
 *   faz `setEditingLanc` + `setDialogOpen` no mesmo clique). O que se prova é o select da Safra e o PAYLOAD do `onSave`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
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
import { esquecerAtividade, lembrarAtividade } from '@/lib/financeiro/ultimaAtividade';

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Pureza' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{
  id: 'sic', nome_conta: 'Sicredi Lavoura', banco: 'Sicredi', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Sicredi Lavoura', agencia: null, numero_conta: null, conta_digito: null,
}];
const FORNECEDORES = [{ id: 'ind', nome: 'Indústria de Fécula', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-venda', subcentro: 'Venda de Mandioca', centro_custo: 'Venda Produção', grupo_custo: 'Receita Agricultura',
    macro_custo: 'Receita Operacional', tipo_operacao: '1-Entradas', escopo_negocio: 'agricultura' },
  { id: 'pl-tel', subcentro: 'Telefonia e Internet', centro_custo: 'Administração', grupo_custo: 'Despesas Administrativas',
    macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
];
/* As safras do NJ que importam: as duas lavouras vizinhas e a pecuária da mesma temporada. */
const L2526 = '55d99920-add0-4091-b1a7-0b0ce3faaedb';
const L2627 = '5c9e3439-0000-0000-0000-000000000000';
const SAFRAS: Safra[] = [
  { id: L2526, nome: 'Safra 25/26 Lavoura', codigo: '25/26-Lav', escopo_negocio: 'agricultura', ativa: true },
  { id: L2627, nome: 'Safra 26/27 Lavoura', codigo: '26/27-Lav', escopo_negocio: 'agricultura', ativa: true },
  { id: 'p2627', nome: 'Safra 26/27 Pecuária', codigo: '26/27-Pec', escopo_negocio: 'pecuaria', ativa: true },
] as Safra[];

const VENDA: LancamentoV2 = {
  id: 'a8559a41-f001-4958-bab9-09aaf70c3852', cliente_id: 'nj', fazenda_id: 'f-pur', conta_bancaria_id: null,
  conta_destino_id: 'sic', data_competencia: '2026-08-26', data_vencimento: '2026-08-26', data_pagamento: null,
  ano_mes: '2026-08', valor: 9356.26, sinal: 1, tipo_operacao: '1-Entradas', status_transacao: 'previsto',
  descricao: 'Venda 17,68 t Mandioca · NF 9297983', macro_custo: 'Receita Operacional', grupo_custo: 'Receita Agricultura',
  centro_custo: 'Venda Produção', subcentro: 'Venda de Mandioca', escopo_negocio: 'agricultura', observacao: null,
  numero_documento: '9297983', tipo_documento: null, favorecido_id: 'ind', forma_pagamento: null, dados_pagamento: null,
  origem_lancamento: 'carga_mandioca', recorrencia_id: null, plano_conta_id: 'pl-venda', safra_id: L2526,
  cultura: 'mandioca', fase: null, cancelado: false, editado_manual: false,
} as LancamentoV2;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  /* a atividade da sessão começa vazia em todo caso: o reset herda a ÚLTIMA, e é o reset que suja o bloco antigo */
  esquecerAtividade();
});

type Props = Partial<React.ComponentProps<typeof LancamentoV2Dialog>>;
function montar(inicial: Props) {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string) => true);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: Props) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LancamentoV2Dialog open={false} onClose={() => {}} onSave={onSave} lancamento={null}
          fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS}
          onCriarFornecedor={async () => null} {...p} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(tree(inicial));
  return { onSave, abrir: (p: Props) => r.rerender(tree(p)) };
}

/** O gatilho do select da Safra e o "sugerida" logo abaixo dele (o rótulo "Safra" é o dono do bloco). */
function campoSafra() {
  const rotulo = screen.getAllByText('Safra').find((el) => el.tagName === 'LABEL');
  if (!rotulo?.parentElement) throw new Error('sem o campo Safra');
  const bloco = rotulo.parentElement;
  return { gatilho: within(bloco).getByRole('combobox'), sugerida: within(bloco).queryByText('sugerida') };
}
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;
/* deixa rodar todos os efeitos e as resoluções pendentes (consultas falsas) */
const assentar = () => new Promise((r) => setTimeout(r, 30));

describe('T1 — editar um lançamento com safra gravada (a NF 9297983)', () => {
  it('abre com 25/26, sem "sugerida", e salvar sem tocar leva 25/26 no payload', async () => {
    const { abrir, onSave } = montar({});
    abrir({ open: true, lancamento: VENDA });
    await screen.findByDisplayValue('Venda 17,68 t Mandioca · NF 9297983');
    await assentar();
    const { gatilho, sugerida } = campoSafra();
    expect(gatilho.textContent).toBe('Safra 25/26 Lavoura');
    expect(sugerida).toBeNull();
    await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [form, id] = onSave.mock.calls[0];
    expect(id).toBe(VENDA.id);
    expect(form.safra_id).toBe(L2526);
  });
});

describe('T1b — o caso da tela: a sessão já vinha de Lavoura (o reset monta o bloco com ela)', () => {
  it('abre com 25/26 e sem "sugerida", também com a última atividade = Lavoura', async () => {
    lembrarAtividade('agricultura');
    const { abrir } = montar({});
    abrir({ open: true, lancamento: VENDA });
    await screen.findByDisplayValue('Venda 17,68 t Mandioca · NF 9297983');
    await assentar();
    expect(campoSafra().gatilho.textContent).toBe('Safra 25/26 Lavoura');
    expect(campoSafra().sugerida).toBeNull();
  });
});

describe('T2 — lançamento NOVO: campo vazio continua sendo sugerido', () => {
  it('com atividade Lavoura e competência 26/08/2026, a safra vem 26/27 "sugerida"', async () => {
    const { abrir } = montar({});
    abrir({ open: true, lancamento: null, prefill: { data_competencia: '2026-08-26', subcentro: 'Venda de Mandioca', plano_conta_id: 'pl-venda', escopo_negocio: 'agricultura', tipo_operacao: '1-Entradas' } as React.ComponentProps<typeof LancamentoV2Dialog>['prefill'] });
    await assentar();
    await waitFor(() => expect(campoSafra().gatilho.textContent).toBe('Safra 26/27 Lavoura'));
    expect(campoSafra().sugerida).not.toBeNull();
  });
});

describe('T3 — cultura e atividade num lançamento com safra gravada', () => {
  it('trocar a CULTURA mantém a safra', async () => {
    const { abrir } = montar({});
    abrir({ open: true, lancamento: { ...VENDA, cultura: 'amendoim' } as LancamentoV2 });
    await screen.findByDisplayValue('Venda 17,68 t Mandioca · NF 9297983');
    await assentar();
    const rotulo = screen.getAllByText('Cultura').find((el) => el.tagName === 'LABEL');
    if (!rotulo?.parentElement) throw new Error('sem o campo Cultura');
    fireEvent.click(within(rotulo.parentElement).getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: /Mandioca/ }));
    await assentar();
    expect(campoSafra().gatilho.textContent).toBe('Safra 25/26 Lavoura');
    expect(campoSafra().sugerida).toBeNull();
  });

  it('trocar a ATIVIDADE para Pecuária limpa a safra de lavoura e volta a sugerir (PR-FIN-SAFRA-ESCOPO-01)', async () => {
    const { abrir } = montar({});
    abrir({ open: true, lancamento: VENDA });
    await screen.findByDisplayValue('Venda 17,68 t Mandioca · NF 9297983');
    await assentar();
    fireEvent.click(screen.getByRole('button', { name: /Pecuária/ }));
    await assentar();
    await waitFor(() => expect(campoSafra().gatilho.textContent).toBe('Safra 26/27 Pecuária'));
    expect(campoSafra().sugerida).not.toBeNull();
  });
});

describe('T4 — dois lançamentos em sequência (reset → hidratação)', () => {
  it('o segundo abre com a PRÓPRIA safra, depois de um novo e de outro gravado', async () => {
    const { abrir } = montar({});
    /* 1º: um lançamento novo de lavoura (a sugestão põe 26/27 e o bloco guarda que ela é dele) */
    abrir({ open: true, lancamento: null, prefill: { data_competencia: '2026-08-26', subcentro: 'Venda de Mandioca', plano_conta_id: 'pl-venda', escopo_negocio: 'agricultura', tipo_operacao: '1-Entradas' } as React.ComponentProps<typeof LancamentoV2Dialog>['prefill'] });
    await assentar();
    await waitFor(() => expect(campoSafra().gatilho.textContent).toBe('Safra 26/27 Lavoura'));
    abrir({ open: false, lancamento: null });
    await assentar();
    /* 2º: o gravado em 25/26 */
    abrir({ open: true, lancamento: VENDA });
    await screen.findByDisplayValue('Venda 17,68 t Mandioca · NF 9297983');
    await assentar();
    expect(campoSafra().gatilho.textContent).toBe('Safra 25/26 Lavoura');
    expect(campoSafra().sugerida).toBeNull();
    abrir({ open: false, lancamento: null });
    await assentar();
    /* 3º: outro gravado, agora JUSTAMENTE na safra que o 1º sugeriu (26/27) e com competência da 25/26 */
    abrir({ open: true, lancamento: { ...VENDA, id: 'outro', descricao: 'Frete 26/27 gravado', safra_id: L2627, data_competencia: '2026-03-10' } as LancamentoV2 });
    await screen.findByDisplayValue('Frete 26/27 gravado');
    await assentar();
    expect(campoSafra().gatilho.textContent).toBe('Safra 26/27 Lavoura');
    expect(campoSafra().sugerida).toBeNull();
  });
});
