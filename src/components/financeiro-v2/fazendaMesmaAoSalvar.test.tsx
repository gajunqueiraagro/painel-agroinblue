/**
 * P155 (Gabriel 28/10/2026, prioridade alta: "corrompe classificação em silêncio") — o Salvar do "Editar lançamento" trocava a FAZENDA para
 * "Administrativo" sem a pessoa pedir. Os casos do NJ (28/10): o 4b41746d (realizar: status + pagamento) e o "Desconto Arrendamento" (só a
 * descrição) — ambos de pecuária em Faz. Sto. Expedito, gravados em Administrativo.
 * ⚠ A CAUSA: no render de transição da abertura o estado da classificação ainda é o do RESET, com a "última atividade" da sessão; se ela é
 *   administrativo, a trava do `FazendaSelect` escrevia "Administrativo" na fazenda que a hidratação já tinha posto. O conserto: a trava só age
 *   com a classificação do lançamento ABERTO (`classificacaoDe`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
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
import { esquecerAtividade, lembrarAtividade } from '@/lib/financeiro/ultimaAtividade';


/* Sintético, no molde dos dois casos do NJ de 28/10 (o 4b41746d e o "Desconto Arrendamento"): um lançamento de PECUÁRIA em Sto. Expedito e
   um ADMINISTRATIVO para sujar a "última atividade" da sessão. */
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
const ADM = { ...ARR, id: 'l-adm', fazenda_id: 'f-adm', descricao: 'Telefone sintetico', subcentro: 'Telefonia Administrativa',
  centro_custo: 'Administração', grupo_custo: 'Despesas Administrativas', escopo_negocio: 'administrativo', plano_conta_id: 'pl-adm',
  safra_id: null, recorrencia_id: null, origem_lancamento: 'manual' } as LancamentoV2;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  esquecerAtividade();
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

describe('P155 — salvar o Editar nunca troca a fazenda que a pessoa não trocou', () => {
  it('o caso do print: a última atividade da sessão = administrativo; mudar SÓ a descrição mantém Sto. Expedito (a classificação também)', async () => {
    lembrarAtividade('administrativo');
    const m = montar();
    m.abrir({ open: true, lancamento: ARR });
    const form = await salvar(m.onSave, 'Arrendamento Pastagem', 'Desconto Arrendamento sintetico');
    expect([form.fazenda_id, form.escopo_negocio, form.safra_id, form.descricao]).toEqual(['f-exp', 'pecuaria', 'p2627', 'Desconto Arrendamento sintetico']);
    expect(document.getElementById('campo-fazenda-financeiro')?.textContent).toContain('Faz. Sto. Expedito');
  });
  it('as outras aberturas: direto, depois de abrir e fechar um administrativo, e trocando sem fechar — Sto. Expedito', async () => {
    const a = montar(); a.abrir({ open: true, lancamento: ARR });
    expect((await salvar(a.onSave, 'Arrendamento Pastagem')).fazenda_id).toBe('f-exp');
    cleanup();
    const b = montar(); b.abrir({ open: true, lancamento: ADM }); await screen.findByDisplayValue('Telefone sintetico'); await assentar();
    b.abrir({ open: false, lancamento: null }); await assentar(); b.abrir({ open: true, lancamento: ARR });
    expect((await salvar(b.onSave, 'Arrendamento Pastagem')).fazenda_id).toBe('f-exp');
    cleanup();
    const c = montar(); c.abrir({ open: true, lancamento: ADM }); await screen.findByDisplayValue('Telefone sintetico'); await assentar();
    c.abrir({ open: true, lancamento: ARR });
    expect((await salvar(c.onSave, 'Arrendamento Pastagem')).fazenda_id).toBe('f-exp');
  });
  it('o administrativo DE VERDADE continua forçado: gravado numa fazenda específica, salva em Administrativo (FIN-FAZENDA-ADM-01)', async () => {
    const m = montar();
    m.abrir({ open: true, lancamento: { ...ADM, fazenda_id: 'f-exp' } as LancamentoV2 });
    const form = await salvar(m.onSave, 'Telefone sintetico');
    expect(form.fazenda_id).toBe('f-adm');
    /* e a tela mostra o que vai ser gravado (a trava do campo, não só o Salvar) */
    expect(document.getElementById('campo-fazenda-financeiro')?.textContent).toContain('Administrativo');
  });
});
