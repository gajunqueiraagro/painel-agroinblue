/**
 * EDITAR-SO-MUDADOS-01 (Gabriel 29/10 09:1x) — o Salvar do Editar lançamento manda SÓ os campos que a pessoa mudou: campo não tocado nunca é
 * sobrescrito. O caso que nasce: o Editar aberto pelo CAIXA (`FinanceiroCaixaTab`) recebe um lançamento montado à mão, SEM vencimento, conta
 * destino, dados de pagamento, tipo de documento, safra e cultura — e o Salvar os gravava vazios.
 *   C1 aberto pelo Caixa (agora com a LINHA DO BANCO), salvo sem mexer: nada mudou e nada se grava (o P116); a leitura que falha diz
 *   C2 o lançamento da lista, salvo sem mexer: nada mudou · C3 mudar só a descrição: só a descrição vai
 *   C4 `soOQueMudou`: a classificação vai junta; sem a lista (outro gravador), o UPDATE inteiro
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
      /* P138 — a safra da competência é do BANCO: `_fn_safra_da_competencia` responde pelas datas (o mesmo calendário das safras daqui) */
      rpc: (nome: string, a: { p_escopo?: string; p_data?: string } = {}) => Promise.resolve({ error: null,
        data: nome !== '_fn_safra_da_competencia' || !a.p_data ? null
          : a.p_escopo === 'agricultura' ? (a.p_data >= '2026-07-01' ? '5c9e3439-0000-0000-0000-000000000000' : '55d99920-add0-4091-b1a7-0b0ce3faaedb')
          : a.p_escopo === 'pecuaria' && a.p_data >= '2026-07-01' ? 'p2627' : null }),
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
import { soOQueMudou } from '@/lib/financeiro/camposMudados';
import { edicaoSemMudanca } from '@/lib/financeiro/edicaoSemMudanca';
import { lancamentoDoCaixaParaOEditar, FRASE_NAO_ABRIU } from '@/lib/financeiro/lancamentoDoCaixa';

const FAZENDAS = [{ id: 'f-exp', nome: 'Faz. Sto. Expedito' }, { id: 'f-adm', nome: 'Administrativo' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{ id: 'bb', nome_conta: 'BB', banco: 'BB', fazenda_id: 'f-exp', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'BB', agencia: null, numero_conta: null, conta_digito: null }];
const FORNECEDORES = [{ id: 'arr', nome: 'Arrendador Sintetico', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-arr', subcentro: 'Custo com Arrendamento de Pasto', centro_custo: 'Pastagem', grupo_custo: 'Custo Variável Pecuária',
    macro_custo: 'Custeio Produção', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-adm', subcentro: 'Telefonia Administrativa', centro_custo: 'Administração', grupo_custo: 'Despesas Administrativas',
    macro_custo: 'Custeio Produção', tipo_operacao: '2-Saídas', escopo_negocio: 'administrativo' },
];
const SAFRAS: Safra[] = [{ id: 'p2627', nome: 'Safra 26/27 Pecuária', codigo: '26/27-Pec', escopo_negocio: 'pecuaria', ativa: true }] as Safra[];
const ARR = { id: 'l-arr', cliente_id: 'nj', fazenda_id: 'f-exp', conta_bancaria_id: 'bb', conta_destino_id: null,
  data_competencia: '2026-08-01', data_vencimento: '2026-09-10', data_pagamento: null, ano_mes: '2026-08', valor: 40000, sinal: -1,
  tipo_operacao: '2-Saídas', status_transacao: 'previsto', descricao: 'Arrendamento Pastagem', macro_custo: 'Custeio Produção',
  grupo_custo: 'Custo Variável Pecuária', centro_custo: 'Pastagem', subcentro: 'Custo com Arrendamento de Pasto', escopo_negocio: 'pecuaria',
  observacao: null, numero_documento: null, tipo_documento: null, favorecido_id: 'arr', forma_pagamento: 'PIX', dados_pagamento: null,
  origem_lancamento: 'recorrencia', recorrencia_id: 'rec-1', plano_conta_id: 'pl-arr', safra_id: 'p2627', cultura: null, fase: null,
  cancelado: false, editado_manual: false } as LancamentoV2;
/* a linha do BANCO do lançamento que o Caixa mostra (o que ele apagava: vencimento, tipo de documento, safra, observação) */
const NO_BANCO = { ...ARR, status_transacao: 'realizado', data_pagamento: '2026-09-10', observacao: 'Pecuaria sintetica', numero_documento: '123',
  tipo_documento: 'Nota Fiscal' } as LancamentoV2;
/* a linha da VISÃO que o Caixa tem na mão (sem vencimento, tipo de documento, safra…): é dela que ele montava o lançamento */
const DA_VISAO = { id: NO_BANCO.id, movimentacao_rebanho_id: null };
/* o UPDATE inteiro que o `editarLancamento` montaria com o form (as colunas que o Caixa apagava, vazias) */
const updateDe = (f: LancamentoV2Form): Record<string, unknown> => ({ fazenda_id: f.fazenda_id, conta_bancaria_id: f.conta_bancaria_id || null,
  conta_destino_id: f.conta_destino_id || null, data_competencia: f.data_competencia, data_vencimento: f.data_vencimento || null,
  data_pagamento: f.data_pagamento || null, valor: f.valor, tipo_operacao: f.tipo_operacao, descricao: f.descricao || null,
  subcentro: f.subcentro || null, observacao: f.observacao || null, tipo_documento: f.tipo_documento || null, dados_pagamento: f.dados_pagamento || null,
  safra_id: f.safra_id || null, editado_manual: true, updated_by: 'u1' });

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
});
type Props = Partial<React.ComponentProps<typeof LancamentoV2Dialog>>;
/* o dialog montado como na tela: fechado e sem lançamento, depois aberto com ele (o `FinanceiroV2Tab` faz os dois no mesmo clique) */
function montar() {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string) => true);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: Props) => (
    <QueryClientProvider client={qc}><MemoryRouter>
      <LancamentoV2Dialog open={false} onClose={() => {}} onSave={onSave} lancamento={null} defaultFazendaId=""
        fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS}
        onCriarFornecedor={async () => null} {...p} />
    </MemoryRouter></QueryClientProvider>);
  const r = render(tree({}));
  return { onSave, abrir: (p: Props) => r.rerender(tree(p)) };
}
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;
const assentar = () => new Promise((r) => setTimeout(r, 40));
async function salvar(onSave: ReturnType<typeof vi.fn>, descricao: string, novaDescricao?: string) {
  const campo = await screen.findByDisplayValue(descricao);
  await assentar();
  if (novaDescricao) fireEvent.change(campo, { target: { value: novaDescricao } });
  await waitFor(() => expect(botaoSalvar().disabled).toBe(false));
  fireEvent.click(botaoSalvar());
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[onSave.mock.calls.length - 1][0];
}

describe('EDITAR-SO-MUDADOS-01 — o Salvar do Editar manda só o que a pessoa mudou', () => {
  it('C1 aberto pelo CAIXA e salvo sem mexer: abre com a linha do banco, nada mudou e nada se grava; a leitura que falha diz', async () => {
    const r = await lancamentoDoCaixaParaOEditar(DA_VISAO, async (id) => (id === NO_BANCO.id ? NO_BANCO : null));
    if (!('lancamento' in r)) throw new Error('o Caixa não abriu a linha do banco');
    expect([r.lancamento.data_vencimento, r.lancamento.tipo_documento, r.lancamento.safra_id]).toEqual(['2026-09-10', 'Nota Fiscal', 'p2627']);
    const m = montar();
    m.abrir({ open: true, lancamento: r.lancamento });
    const form = await salvar(m.onSave, 'Arrendamento Pastagem');
    expect(form.camposMudados).toEqual([]);
    expect(edicaoSemMudanca(soOQueMudou(updateDe(form), form.camposMudados), Object.fromEntries(Object.entries(NO_BANCO)))).toBe(true);
    expect(await lancamentoDoCaixaParaOEditar(DA_VISAO, async () => null)).toEqual({ erro: FRASE_NAO_ABRIU });
    expect(await lancamentoDoCaixaParaOEditar({ id: 'x', movimentacao_rebanho_id: 'mov-1' }, async () => NO_BANCO)).toEqual({ zoo: 'mov-1' });
  });
  it('C2 o lançamento inteiro (o da lista), salvo sem mexer: nada mudou e nada se grava (P116)', async () => {
    const m = montar();
    m.abrir({ open: true, lancamento: ARR });
    const form = await salvar(m.onSave, 'Arrendamento Pastagem');
    expect(form.camposMudados).toEqual([]);
    expect(edicaoSemMudanca(soOQueMudou(updateDe(form), form.camposMudados), Object.fromEntries(Object.entries(ARR)))).toBe(true);
  });
  it('C3 mudar só a descrição: só a descrição vai (vencimento, safra, tipo de documento e observação não vão)', async () => {
    const m = montar();
    m.abrir({ open: true, lancamento: NO_BANCO });
    const form = await salvar(m.onSave, 'Arrendamento Pastagem', 'Arrendamento sintetico novo');
    expect(form.camposMudados).toEqual(['descricao']);
    const vai = soOQueMudou(updateDe(form), form.camposMudados);
    expect(Object.keys(vai).sort()).toEqual(['descricao', 'editado_manual', 'updated_by']);
    expect(edicaoSemMudanca(vai, Object.fromEntries(Object.entries(NO_BANCO)))).toBe(false);
  });
  it('C4 a classificação vai junta (o subcentro leva macro, grupo, centro, escopo e a chave); sem a lista, o UPDATE inteiro', () => {
    const tudo = { subcentro: 's', macro_custo: 'm', grupo_custo: 'g', centro_custo: 'c', escopo_negocio: 'e', plano_conta_id: 'p', descricao: 'd',
      ano_mes: '2026-08', sinal: -1, editado_manual: true, updated_by: 'u1' };
    expect(Object.keys(soOQueMudou(tudo, ['subcentro'])).sort()).toEqual(['centro_custo', 'editado_manual', 'escopo_negocio', 'grupo_custo', 'macro_custo',
      'plano_conta_id', 'subcentro', 'updated_by']);
    expect(Object.keys(soOQueMudou(tudo, ['data_pagamento']))).toEqual(['ano_mes', 'editado_manual', 'updated_by']);
    expect(soOQueMudou(tudo, undefined)).toEqual(tudo);
    expect(Object.keys(soOQueMudou(tudo, []))).toEqual(['editado_manual', 'updated_by']);
  });
});
