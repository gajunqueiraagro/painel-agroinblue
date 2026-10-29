/**
 * UI-TEXTO-LONGO-01 (Gabriel 19/10/2026, print do "Editar Lançamento" com a descrição de ~300 caracteres): o resumo lateral NÃO repete a
 * descrição (crescia 15 linhas e empurrava a Classificação), e o rodapé diz a ORIGEM CURTA ("Parcela 3/5 · Compra …"), nunca a
 * descrição do contrato com "…". O jsdom não mede: a altura igual com texto curto e longo é medida no `check:ui-cortes` (`alturasComo`);
 * aqui fica o contrato — o resumo montado é o MESMO HTML com as duas descrições. Dados sintéticos.
 * ⚠ P121 (27/10): a descrição VOLTOU ao resumo, numa linha só com "…" e o title — o contrato do MESMO HTML segue, trocada só ela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LancamentoV2, ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

vi.mock('@/integrations/supabase/client', () => {
  const vazio = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return { supabase: { from: () => vazio(), rpc: () => Promise.resolve({ data: null, error: null }),
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) }, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'agn', nome: 'Agnaldo' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { esquecerAtividade } from '@/lib/financeiro/ultimaAtividade';
import { origemCurtaDoLancamento, type OndeEsta } from '@/lib/financiamentos/buscaNoContrato';

const FAZENDAS = [{ id: 'pur', nome: 'Faz. Pureza' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{ id: 'sic', nome_conta: 'Sicredi Lavoura', banco: 'Sicredi', fazenda_id: 'pur', tipo_conta: null, codigo_conta: null,
  nome_exibicao: 'Sicredi Lavoura', agencia: null, numero_conta: null, conta_digito: null }];
const FORNECEDORES = [{ id: 'cmp', nome: 'Comprador Exemplo', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-milho', subcentro: 'Venda de Milho', centro_custo: 'Vendas Lavoura', grupo_custo: 'Receita Lavoura', macro_custo: 'Receita Operacional',
    tipo_operacao: '1-Entradas', escopo_negocio: 'agricultura' },
];
const SAFRAS: Safra[] = [{ id: 's-mil', nome: 'Safra 25/26 Milho', codigo: '25/26-Lav', escopo_negocio: 'agricultura', ativa: true }] as Safra[];
const MILHO: LancamentoV2 = {
  id: '7c1a2b3c-0000-4000-8000-000000000001', cliente_id: 'agn', fazenda_id: 'pur', conta_bancaria_id: null, conta_destino_id: 'sic',
  data_competencia: '2026-05-10', data_vencimento: '2026-05-20', data_pagamento: '2026-05-20', ano_mes: '2026-05', valor: 102000, sinal: 1,
  tipo_operacao: '1-Entradas', status_transacao: 'realizado', descricao: 'Milho Grão', macro_custo: 'Receita Operacional',
  grupo_custo: 'Receita Lavoura', centro_custo: 'Vendas Lavoura', subcentro: 'Venda de Milho', escopo_negocio: 'agricultura', observacao: null,
  numero_documento: null, tipo_documento: null, favorecido_id: 'cmp', forma_pagamento: 'PIX', dados_pagamento: null, origem_lancamento: 'manual',
  recorrencia_id: null, plano_conta_id: 'pl-milho', safra_id: 's-mil', cultura: 'milho', fase: null, cancelado: false, editado_manual: false,
} as LancamentoV2;

const LONGA = ('Sêmen Bovino - SAV EXEMPLO 1234/ 5678 · touro de teste com nome comprido · ').repeat(5).slice(0, 300).trimEnd();

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  esquecerAtividade();
});

/** o resumo lateral do modal aberto com esta descrição (o HTML inteiro) */
async function resumoCom(descricao: string): Promise<{ html: string; texto: string; descricao: { texto: string; title: string; classe: string } }> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>) => (
    <QueryClientProvider client={qc}><MemoryRouter>
      <LancamentoV2Dialog open={false} onClose={() => {}} onSave={async () => true} lancamento={null}
        fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={FORNECEDORES} safras={SAFRAS}
        onCriarFornecedor={async () => null} {...p} />
    </MemoryRouter></QueryClientProvider>
  );
  const r = render(tree({}));
  r.rerender(tree({ open: true, lancamento: { ...MILHO, descricao } }));
  await screen.findByDisplayValue(descricao);
  await new Promise((ok) => setTimeout(ok, 30));
  const aside = screen.getByTestId('resumo-pagamento').closest('aside') as HTMLElement;
  const d = screen.getByTestId('resumo-descricao');
  const res = { html: aside.innerHTML, texto: aside.textContent ?? '',
    descricao: { texto: d.textContent ?? '', title: d.getAttribute('title') ?? '', classe: d.className } };
  r.unmount();
  return res;
}

/* P121 (FIN-MODAL-RESUMO-01, mock v1.1 aprovado 27/10) — a descrição VOLTA ao resumo, mas numa linha só ("…" + o texto inteiro no
   `title`): o resto do resumo é o MESMO HTML com a descrição curta e a de 300 caracteres (nada cresce, nada empurra). */
describe('o resumo lateral do lançamento: a descrição numa linha só', () => {
  it('descrição curta e de 300 caracteres: o MESMO resumo (mesmo HTML, trocada só a descrição) e a descrição inteira no title', async () => {
    const curto = await resumoCom('Sal mineral');
    const longo = await resumoCom(LONGA);
    expect(longo.descricao).toEqual({ texto: LONGA, title: LONGA, classe: expect.stringContaining('truncate') });
    expect(curto.descricao.texto).toBe('Sal mineral');
    expect(longo.html.split(LONGA).join('§')).toBe(curto.html.split('Sal mineral').join('§'));
    expect(longo.texto).not.toMatch(/Produto/);
  });
  it('o campo Produto / descrição é um input de uma linha (o texto rola dentro dele)', async () => {
    const fonte = readFileSync(resolve(__dirname, '../shared/ProdutoAutocomplete.tsx'), 'utf8');
    expect(fonte).toMatch(/<Input/);
    expect(fonte).not.toMatch(/<textarea|<Textarea/);
  });
  it('o Editar obrigação segue sem a descrição no resumo (lido da fonte)', () => {
    const obrigacao = readFileSync(resolve(__dirname, '../financiamentos/ObrigacaoDialog.tsx'), 'utf8');
    expect(obrigacao).not.toMatch(/<Linha rotulo="Descrição"/);
  });
});

describe('o rodapé diz a origem curta, nunca a descrição do contrato', () => {
  const parcela = (numero: string | null, papel = 'principal'): OndeEsta => ({ tipo: 'parcela', financiamentoId: 'f1', contrato: numero ?? LONGA,
    numeroContrato: numero, parcela: 3, papel, vinculoId: null });
  it('parcela de compra parcelada: "Parcela 3/5 · Compra …"; sem número, "Compra parcelada"', () => {
    expect(origemCurtaDoLancamento(parcela('1234'), { numero: 3, total: 5 })).toBe('Parcela 3/5 · Compra 1234');
    expect(origemCurtaDoLancamento(parcela(null), { numero: 3, total: 5 })).toBe('Parcela 3/5 · Compra parcelada');
  });
  it('financiamento, liberação, encargo e captação: o número do contrato, nunca a descrição', () => {
    expect(origemCurtaDoLancamento(parcela('PR-78.179'))).toBe('Parcela 3 · Contrato PR-78.179');
    expect(origemCurtaDoLancamento(parcela(null, 'juros'))).toBe('Parcela 3 (juros) · Contrato');
    expect(origemCurtaDoLancamento({ tipo: 'liberacao', financiamentoId: 'f1', contrato: LONGA, numeroContrato: 'C-9', liberacaoId: 'l' })).toBe('Liberação · Contrato C-9');
    expect(origemCurtaDoLancamento({ tipo: 'encargo', financiamentoId: 'f1', contrato: LONGA, numeroContrato: null, encargoId: 'e', papel: 'iof' })).toBe('Encargo · Contrato');
    expect(origemCurtaDoLancamento({ tipo: 'captacao', financiamentoId: 'f1', contrato: LONGA, numeroContrato: 'C-9' })).toBe('Captação · Contrato C-9');
  });
  it('o botão do rodapé usa a origem curta e não corta (lido da fonte), e o modal passa a posição da parcela', () => {
    const peca = readFileSync(resolve(__dirname, '../financiamentos/FinanciamentoDoLancamento.tsx'), 'utf8');
    expect(peca).toMatch(/↔ \{origemCurtaDoLancamento\(a, parcelaDaCompra\)\}/);
    const botao = peca.slice(peca.indexOf('data-testid="abrir-contrato-do-lancamento"') - 600, peca.indexOf('data-testid="abrir-contrato-do-lancamento"'));
    expect(botao).toMatch(/className="shrink-0 whitespace-nowrap/);
    expect(botao).not.toMatch(/truncate/);
    expect(readFileSync(resolve(__dirname, 'LancamentoV2Dialog.tsx'), 'utf8')).toMatch(/<FinanciamentoDoLancamento [^>]*parcelaDaCompra=\{parcelaDaCompra\}/);
  });
});
