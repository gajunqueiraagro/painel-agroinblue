/**
 * FIN-CLASSIF-DIVIDIDA-01b — o "Editar lançamento" com a classificação dividida (o modal MONTADO DE VERDADE; o banco e as RPCs da divisão
 * são falsos). Molde SINTÉTICO do mock: R$ 9.583,00 = R$ 8.528,00 Investimento em Instalações + R$ 1.055,00 Manutenção de Instalações.
 *   · dividido: a Geral mostra as PARTES no lugar do seletor de conta, e "Dividir… / Voltar para 1 conta / Desfazer" no título do bloco;
 *   · "Voltar para 1 conta" pede o motivo e chama a RPC; depois a classificação do modal é RELIDA do banco — o Salvar seguinte manda o
 *     que ficou gravado (a trava do banco recusa reclassificar direto);
 *   · a aba Itens da nota ganha a vista "Contas"; título de OC não divide; parcela divide no cadastro (sem Voltar/Desfazer).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import type { DivisaoLida, ParteGravada } from '@/lib/financeiro/divisaoDaClassificacao';

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
const div = vi.hoisted(() => ({
  lerDivisao: vi.fn(async (_id: string): Promise<DivisaoLida | null> => null),
  voltarUmaConta: vi.fn(async (..._a: unknown[]) => ({ ok: true, valor: { frase: 'Volta inteiro para "Investimento em Instalações".', fraseNota: null, operacaoId: 'op2', partes: [] } })),
  classificacaoGravada: vi.fn(async (_id: string): Promise<Record<string, string | null> | null> => null),
}));
vi.mock('@/lib/financeiro/divisaoDaClassificacao', async (orig) => ({ ...(await orig<object>()), ...div }));
const ITENS = vi.hoisted(() => [154000, 100000, 105500].map((liquidoCent, k) => ({ nItem: k + 1, codigo: `C${k + 1}`, descricao: `Item ${k + 1}`, liquidoCent })));
vi.mock('@/hooks/useItensDaNota', () => ({
  useItensDaNota: () => ({ cabecalho: { chave: '5'.repeat(44), origem: 'xml', numero: '3241', serie: '1', emissao: '2026-09-29', natureza: null, regime: '3',
    emitenteDocumento: '11222333000181', emitenteNome: 'Emitente Exemplo' },
    lidos: { origem: 'xml', regime: '3', itens: ITENS.map((i) => ({ ...i, ean: null, ncm: null, cest: null, cfop: null, cst: null, csosn: null, unidade: 'UN', quantidade: '1',
      unitario: '1', unidadeTrib: null, quantidadeTrib: null, unitarioTrib: null, produtoCent: i.liquidoCent, descontoCent: 0, freteCent: 0, seguroCent: 0, outrasCent: 0,
      rateado: false, icms: null, icmsSt: null, fcp: null, fcpSt: null, ipi: null, pis: null, cofins: null, ibsCbs: null, rastro: [], infoAdicional: null })),
    totais: { produtosCent: 359500, descontoCent: 0, freteCent: 0, seguroCent: 0, outrasCent: 0, ipiCent: 0, stCent: 0, fcpStCent: 0, icmsCent: 0, pisCent: 0, cofinsCent: 0, notaCent: 359500, tributosAproxCent: null } },
  }),
  useChavesComItens: () => new Set(),
}));
vi.mock('@/lib/financeiro/sugestaoDeContaDosItens', async (orig) => ({ ...(await orig<object>()), historicoDoEmitente: async () => [] }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'nj', nome: 'NJ' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Pureza' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{ id: 'bb', nome_conta: 'Banco', banco: 'BB', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Banco', agencia: null, numero_conta: null, conta_digito: null }];
const FORN = [{ id: 'sel', nome: 'Emitente Exemplo', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null }] as FornecedorV2[];
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-cer', subcentro: 'Investimento em Cercas Pecuária', centro_custo: 'Infraestrutura', grupo_custo: 'Investimentos', macro_custo: 'Investimento na Fazenda', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-inv', subcentro: 'Investimento em Instalações Pecuária', centro_custo: 'Infraestrutura', grupo_custo: 'Investimentos', macro_custo: 'Investimento na Fazenda', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-man', subcentro: 'Manutenção de Instalações Pecuária', centro_custo: 'Infraestrutura', grupo_custo: 'Manutenção', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
];
const LANC = {
  id: 'lanc-sel', cliente_id: 'nj', fazenda_id: 'f-pur', conta_bancaria_id: 'bb', conta_destino_id: null, data_competencia: '2026-09-29', data_vencimento: '2026-10-09',
  data_pagamento: null, ano_mes: '2026-09', valor: 9583, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'programado', descricao: 'Material elétrico',
  macro_custo: 'Investimento na Fazenda', grupo_custo: 'Investimentos', centro_custo: 'Infraestrutura', subcentro: 'Investimento em Instalações Pecuária',
  escopo_negocio: 'pecuaria', observacao: null, numero_documento: '3241', tipo_documento: null, favorecido_id: 'sel', forma_pagamento: null, dados_pagamento: null,
  origem_lancamento: 'manual', recorrencia_id: null, plano_conta_id: 'pl-inv', safra_id: null, cultura: null, fase: null, cancelado: false, editado_manual: false,
} as LancamentoV2;
const parte = (ordem: number, plano: string, sub: string, valor: number, percentual: number, notaItens: number[]): ParteGravada => ({
  ordem, valor, percentual, plano_conta_id: plano, subcentro: sub, centro_custo: 'Infraestrutura', escopo_negocio: 'pecuaria', origem: 'nota', itens: notaItens.length, notaItens });
const DIVIDIDO: DivisaoLida = { partes: [parte(1, 'pl-inv', 'Investimento em Instalações Pecuária', 8528, 88.99, [1, 2]), parte(2, 'pl-man', 'Manutenção de Instalações Pecuária', 1055, 11.01, [3])], ultimaOperacaoId: 'op1' };

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  div.lerDivisao.mockReset(); div.lerDivisao.mockImplementation(async () => null);
  div.voltarUmaConta.mockClear(); div.classificacaoGravada.mockReset(); div.classificacaoGravada.mockImplementation(async () => null);
});

function montar(lancamento: LancamentoV2) {
  const onSave = vi.fn(async (_f: LancamentoV2Form, _id?: string) => true);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter>
    <LancamentoV2Dialog open onClose={() => {}} onSave={onSave} lancamento={lancamento} fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF}
      fornecedores={FORN} safras={[]} onCriarFornecedor={async () => null} />
  </MemoryRouter></QueryClientProvider>);
  return { onSave };
}
const n = (t: string | null | undefined) => (t ?? '').replace(/\s/g, ' ');
const assentar = () => new Promise((r) => setTimeout(r, 30));
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;

describe('Geral — a classificação dividida', () => {
  it('dividido: as partes no lugar do seletor de conta, "dividida em 2 contas" e as três ações no título', async () => {
    div.lerDivisao.mockImplementation(async () => DIVIDIDO);
    montar(LANC);
    const tabela = await screen.findByTestId('partes-da-classificacao');
    expect(div.lerDivisao).toHaveBeenCalledWith('lanc-sel');
    expect(within(tabela).getAllByTestId('parte-linha').map((l) => n(l.textContent))).toEqual([
      'Investimento em Instalações PecuáriaInfraestruturaR$ 8.528,0089,0%2 itens da nota',
      'Manutenção de Instalações PecuáriaInfraestruturaR$ 1.055,0011,0%1 item da nota']);
    expect(n(within(tabela).getByTestId('partes-total').textContent)).toContain('R$ 9.583,00100%✓ = lançamento');
    const bloco = screen.getByTestId('bloco-classificacao');
    expect(bloco.textContent).toContain('dividida em 2 contas');
    expect(within(bloco).queryByText('Subcentro')).toBeNull();
    expect(within(screen.getByTestId('acoes-da-divisao')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dividir…', 'Voltar para 1 conta', 'Desfazer']);
  });

  it('"Voltar para 1 conta": motivo, a RPC e a classificação RELIDA do banco — o Salvar seguinte manda o que ficou gravado', async () => {
    div.lerDivisao.mockImplementation(async () => DIVIDIDO);
    div.classificacaoGravada.mockImplementation(async () => ({ plano_conta_id: 'pl-man', subcentro: 'Manutenção de Instalações Pecuária', macro_custo: 'Custeio Produtivo',
      grupo_custo: 'Manutenção', centro_custo: 'Infraestrutura', escopo_negocio: 'pecuaria', safra_id: null, cultura: null, fase: null }));
    const { onSave } = montar(LANC);
    await screen.findByTestId('partes-da-classificacao');
    fireEvent.click(screen.getByTestId('divisao-voltar'));
    await screen.findByTestId('divisao-motivo');
    await waitFor(() => expect(screen.getByTestId('divisao-previa').textContent).toBe('Volta inteiro para "Investimento em Instalações".'));
    expect((screen.getByTestId('divisao-confirmar') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('divisao-motivo-texto'), { target: { value: 'manutenção é tudo' } });
    div.lerDivisao.mockImplementation(async () => ({ partes: [], ultimaOperacaoId: 'op2' }));
    fireEvent.click(screen.getByTestId('divisao-confirmar'));
    await waitFor(() => expect(div.voltarUmaConta).toHaveBeenLastCalledWith('nj', 'lanc-sel', null, 'manutenção é tudo', false));
    await waitFor(() => expect(div.classificacaoGravada).toHaveBeenCalledWith('lanc-sel'));
    await waitFor(() => expect(screen.queryByTestId('partes-da-classificacao')).toBeNull());
    await assentar();
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].plano_conta_id).toBe('pl-man');
    expect(onSave.mock.calls[0][0].subcentro).toBe('Manutenção de Instalações Pecuária');
  });

  it('sem divisão: o seletor de conta de sempre e só "Dividir…"', async () => {
    montar(LANC);
    await waitFor(() => expect(div.lerDivisao).toHaveBeenCalled());
    await assentar();
    expect(screen.queryByTestId('partes-da-classificacao')).toBeNull();
    expect(within(screen.getByTestId('acoes-da-divisao')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dividir…']);
  });

  it('título de OC: a classificação é da operação — nada de dividir', async () => {
    montar({ ...LANC, origem_lancamento: 'operacao_comercial' } as LancamentoV2);
    await assentar();
    expect(screen.queryByTestId('acoes-da-divisao')).toBeNull();
  });

  it('parcela de compra parcelada: só "Dividir…" (no cadastro); o modal avisa que todas as parcelas recebem a mesma proporção', async () => {
    div.lerDivisao.mockImplementation(async () => DIVIDIDO);
    montar({ ...LANC, financiamento_id: 'fin-1' } as LancamentoV2);
    await screen.findByTestId('partes-da-classificacao');
    expect(within(screen.getByTestId('acoes-da-divisao')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dividir…']);
    fireEvent.click(screen.getByTestId('divisao-dividir'));
    expect((await screen.findByTestId('dividir-aviso-parcelas')).textContent).toBe('Compra parcelada: a divisão é do cadastro — todas as parcelas recebem a mesma proporção.');
  });
});

describe('Itens da nota — a vista "Contas"', () => {
  it('a vista existe no lançamento salvo; tudo na conta de hoje = nada a dividir (botão apagado, a frase)', async () => {
    montar(LANC);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Itens da nota/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Contas' }));
    const v = await screen.findByTestId('contas-dos-itens');
    expect(within(v).getAllByTestId('contas-linha')).toHaveLength(3);
    expect(within(v).getByTestId('contas-frase').textContent).toBe('Todos os itens estão na mesma conta: não há o que dividir.');
    expect((within(v).getByTestId('contas-dividir') as HTMLButtonElement).disabled).toBe(true);
  });
  it('dividido pelos itens: cada item abre na conta em que ficou', async () => {
    div.lerDivisao.mockImplementation(async () => DIVIDIDO);
    montar(LANC);
    await screen.findByTestId('partes-da-classificacao');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Itens da nota/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Contas' }));
    const v = await screen.findByTestId('contas-dos-itens');
    expect(within(v).getAllByTestId('contas-resumo-conta').map((c) => c.textContent)).toEqual([
      'Investimento em Instalações PecuáriaR$ 2.540,00 · 70,7%', 'Manutenção de Instalações PecuáriaR$ 1.055,00 · 29,3%']);
    expect((within(v).getByTestId('contas-dividir') as HTMLButtonElement).textContent).toBe('Dividir o lançamento em 2 contas');
  });
});
