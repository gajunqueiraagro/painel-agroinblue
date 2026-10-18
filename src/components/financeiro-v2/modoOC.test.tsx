/**
 * OC-CC-MODAL-FINANCEIRO-01 — a OC lança pelo modal do Financeiro (modo OC).
 *
 * ⚠ O `LancamentoV2Dialog` É MONTADO DE VERDADE; só as bordas são falsas. O banco falso responde `oc_lancar_pelo_modal` e GUARDA
 *   cada chamada (com `p_simular`), para provar o que trava, o que sugere, o aviso âmbar e que o Salvar NUNCA passa pelo `onSave`
 *   nem pelo parcelamento do Financeiro. As regras do banco (base, saldo, DRE, atomicidade) estão em
 *   `supabase/tests/oc_cc_modal_financeiro_01_test.sql`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import {
  TRAVAS_DO_MODO_OC, tipoDoLancamentoOC, parcelasParaRpc, lerRetornoLancarPeloModal, fraseAcimaDoSaldo, argsDoLancar,
  classificacoesDaDespesa, fraseDoErroAoLancar, lancarPeloModal, saldoAProgramar, tituloDoModoOC,
  MOTIVO_CLASSIFICACAO_DA_OC, MOTIVO_ITEM_OBRIGATORIO, MOTIVO_VENCIMENTO_OBRIGATORIO,
  type OrigemOC, type NaturezaDoModalOC, type RpcLancarPeloModal,
} from '@/lib/oc/lancarPeloModal';
import { fraseDoBancoOC, FRASES_DO_BANCO_OC } from '@/lib/oc/frasesDoBancoOC';

const OP = 'e8fec78b-1111-4111-8111-111111111111';
const retornoDoBanco = (extra: Record<string, unknown> = {}) => ({
  ok: true, simulado: false, natureza: 'principal', componente: 'recebimento', compromisso_id: 'comp-1', programacao_id: 'prog-1',
  parcelas: [{ sequencia: 1, parcela_id: 'pa-1', titulo_id: 't-1', valor: 5000, vencimento: '2026-11-10' }], total: 5000, avisos: [],
  classificacao: { subcentro: 'Venda de Bezerros', plano_conta_id: 'pl-ent' }, operacao_id: OP, operacao_versao: 9, ...extra,
});
const banco = vi.hoisted(() => ({
  chamadas: [] as Array<{ nome: string; args: Record<string, unknown> }>,
  resposta: null as null | ((args: Record<string, unknown>) => { data: unknown; error: { code: string; message: string } | null }),
}));
vi.mock('@/integrations/supabase/client', () => {
  const construtor = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains', 'update']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: () => construtor(),
      rpc: async (nome: string, args: Record<string, unknown>) => {
        banco.chamadas.push({ nome, args });
        if (nome === 'oc_lancar_pelo_modal' && banco.resposta) return banco.resposta(args);
        return { data: null, error: null };
      },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), upload: async () => ({ data: {}, error: null }), remove: async () => ({ error: null }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { definirFornecedoresDoLeitor } from '@/test/leitorDeFornecedoresFake';

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Pureza' }] as Fazenda[];
const conta = (id: string, nome: string) => ({ id, nome_conta: nome, banco: nome, fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: nome, agencia: null, numero_conta: null }) as unknown as ContaBancariaV2;
const CONTAS = [conta('bb', 'Banco do Brasil')];
const FORN = { id: 'forn', nome: 'Comprador Exemplo', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null } as FornecedorV2;
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-sai', subcentro: 'Impostos e Despesas de Abates e Vendas', centro_custo: 'Vendas', grupo_custo: 'Deduções', macro_custo: 'Deduções de Receitas', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-cmp', subcentro: 'Investimento Frete/Comissão Compra Bovinos', centro_custo: 'Compra de Bovinos', grupo_custo: 'Investimento', macro_custo: 'Investimento em Bovinos', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-ent', subcentro: 'Venda de Bezerros', centro_custo: 'Vendas', grupo_custo: 'Receita', macro_custo: 'Receita Operacional', tipo_operacao: '1-Entradas', escopo_negocio: 'pecuaria' },
];
const ITENS = [{ codigo: 'frete', nome: 'Frete' }, { codigo: 'comissao', nome: 'Comissão' }];

function origem(natureza: NaturezaDoModalOC, extra: Partial<OrigemOC> = {}): OrigemOC {
  return { operacaoId: OP, versao: 8, natureza, tipoOperacao: 'venda', rotulo: 'OC #e8fec78b · Venda 140 Novilhas', itens: ITENS,
    onVoltar: vi.fn(), aoLancar: vi.fn(async () => {}), ...extra };
}
const PREFILL_PRINCIPAL = {
  fazenda_id: 'f-pur', tipo_operacao: '1-Entradas', status_transacao: 'programado', data_competencia: '2026-10-05', valor: 5000,
  descricao: 'Venda 140 Novilhas · Recebimento', favorecido_id: 'forn', subcentro: 'Venda de Bezerros', macro_custo: 'Receita Operacional',
  grupo_custo: 'Receita', centro_custo: 'Vendas', plano_conta_id: 'pl-ent', escopo_negocio: 'pecuaria', cultura: '', fase: '', conta_bancaria_id: 'bb',
};
const PREFILL_DESPESA = {
  fazenda_id: 'f-pur', tipo_operacao: '2-Saídas', status_transacao: 'programado', data_competencia: '2026-10-05', valor: 300,
  descricao: 'Frete da venda', subcentro: 'Impostos e Despesas de Abates e Vendas', macro_custo: 'Deduções de Receitas', grupo_custo: 'Deduções',
  centro_custo: 'Vendas', plano_conta_id: 'pl-sai', escopo_negocio: 'pecuaria', cultura: '', fase: '', conta_bancaria_id: 'bb',
};

function montar(o: OrigemOC | null, prefill?: Record<string, unknown>) {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string): Promise<boolean | string> => true);
  const onClose = vi.fn();
  const travas = o ? [...TRAVAS_DO_MODO_OC[o.natureza]] : undefined;
  const r = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>
      <LancamentoV2Dialog open onClose={onClose} onSave={onSave} origemOC={o} prefill={prefill} lockedFields={travas}
        fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={[FORN]} safras={[]}
        onCriarFornecedor={async () => null} />
    </MemoryRouter></QueryClientProvider>,
  );
  return { ...r, onSave, onClose };
}
const porTab = (n: number) => document.querySelector(`[tabindex="${n}"]`) as HTMLButtonElement | HTMLInputElement | null;
const campoValor = () => document.querySelector('input[tabindex="10"]') as HTMLInputElement;
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;
const campoFazenda = () => document.querySelector('#campo-fazenda-financeiro button') as HTMLButtonElement;
const rotulos = () => Array.from(document.querySelectorAll('label')).map(l => l.textContent ?? '');
const campoDoRotulo = (texto: string) => {
  const label = Array.from(document.querySelectorAll('label')).find(l => (l.textContent ?? '').startsWith(texto));
  return label?.parentElement?.querySelector('button[role="combobox"]') as HTMLButtonElement | null;
};
const lancar = () => banco.chamadas.filter(c => c.nome === 'oc_lancar_pelo_modal');
const assentar = (ms = 60) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function aberto(valor: string) {
  await waitFor(() => expect(campoValor().value).toBe(valor));
  await assentar();
}
function informarVencimento(data: string) {
  const campo = screen.getByPlaceholderText('dd/mm/aaaa');
  fireEvent.change(campo, { target: { value: data } });
  fireEvent.keyDown(campo, { key: 'Enter' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T12:00:00') });
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  banco.chamadas = [];
  definirFornecedoresDoLeitor([{ id: 'forn', nome: 'Comprador Exemplo', cpf_cnpj: null, ativo: true }]);
  banco.resposta = (args) => ({ data: retornoDoBanco({ simulado: args.p_simular === true }), error: null });
});

describe('o dono do modo OC (puro)', () => {
  it('o que trava: principal = tipo, fazenda, favorecido, classificação e status; despesa = tipo, fazenda e status', () => {
    expect([...TRAVAS_DO_MODO_OC.principal].sort()).toEqual(['classificacao', 'favorecido_id', 'fazenda_id', 'status_transacao', 'tipo_operacao']);
    expect([...TRAVAS_DO_MODO_OC.obrigacao].sort()).toEqual(['fazenda_id', 'status_transacao', 'tipo_operacao']);
    for (const n of ['principal', 'obrigacao'] as const) expect(TRAVAS_DO_MODO_OC[n]).not.toContain('valor');
  });

  it('a direção: venda e abate recebem o principal, a compra paga; despesa é sempre saída', () => {
    expect(tipoDoLancamentoOC('principal', 'venda')).toBe('1-Entradas');
    expect(tipoDoLancamentoOC('principal', 'abate')).toBe('1-Entradas');
    expect(tipoDoLancamentoOC('principal', 'compra')).toBe('2-Saídas');
    for (const t of ['venda', 'compra', 'abate'] as const) expect(tipoDoLancamentoOC('obrigacao', t)).toBe('2-Saídas');
    expect(tituloDoModoOC('principal', 'compra')).toBe('Programar pagamento');
    expect(tituloDoModoOC('principal', 'venda')).toBe('Programar recebimento');
    expect(tituloDoModoOC('obrigacao', 'venda')).toBe('Nova despesa da operação');
  });

  it('o que sugere: o saldo em aberto (acordado − recebido − programado), nunca zero nem negativo', () => {
    expect(saldoAProgramar({ valorAcordado: 524750.8, recebido: 329762, programado: 0 })).toBe(194988.8);
    expect(saldoAProgramar({ valorAcordado: 100, recebido: 60, programado: 40 })).toBeNull();
  });

  it('as parcelas vão com duas casas, o vencimento e a conta do modal em todas', () => {
    expect(parcelasParaRpc([{ valor: 33.333, vencimento: '2026-11-10' }, { valor: -66.67, vencimento: null }], 'bb'))
      .toEqual([{ valor: 33.33, vencimento: '2026-11-10', conta_id: 'bb' }, { valor: 66.67, vencimento: '', conta_id: 'bb' }]);
    expect(parcelasParaRpc([{ valor: 1, vencimento: '2026-11-10' }], '')[0].conta_id).toBeNull();
  });

  it('no principal o banco decide item, classificação e favorecido: os três vão NULOS; na despesa vão os do modal', () => {
    const base = { operacaoId: OP, versao: 8, componente: 'frete', planoContaId: 'pl-sai', favorecidoId: 'forn', parcelas: [], forma: 'PIX',
      dadosPagamento: null, documento: '123', observacao: null, descricao: 'x', simular: true };
    const p = argsDoLancar({ ...base, natureza: 'principal' });
    expect([p.p_componente, p.p_plano_conta_id, p.p_favorecido_id]).toEqual([null, null, null]);
    expect(p).toMatchObject({ p_operacao_id: OP, p_versao: 8, p_natureza: 'principal', p_forma: 'PIX', p_documento: '123', p_simular: true });
    const d = argsDoLancar({ ...base, natureza: 'obrigacao' });
    expect([d.p_componente, d.p_plano_conta_id, d.p_favorecido_id]).toEqual(['frete', 'pl-sai', 'forn']);
  });

  it('o retorno é lido sem cast: o aviso de saldo, a classificação, a versão; peça torta = nulo', () => {
    const r = lerRetornoLancarPeloModal(retornoDoBanco({ avisos: [{ codigo: 'acima_do_saldo', excesso: 2000, base: 10000, recebido: 7000, programado: 5000 }] }));
    expect(r?.acimaDoSaldo).toEqual({ excesso: 2000, base: 10000, recebido: 7000, programado: 5000 });
    expect(r?.classificacao).toEqual({ subcentro: 'Venda de Bezerros', planoContaId: 'pl-ent' });
    expect(r?.versao).toBe(9);
    expect(lerRetornoLancarPeloModal(retornoDoBanco())?.acimaDoSaldo).toBeNull();
    expect(lerRetornoLancarPeloModal(retornoDoBanco({ avisos: [{ codigo: 'acima_do_saldo', excesso: 0 }] }))?.acimaDoSaldo).toBeNull();
    for (const torto of [null, {}, retornoDoBanco({ ok: false }), retornoDoBanco({ operacao_versao: 'x' }), retornoDoBanco({ parcelas: 'nao' }),
      retornoDoBanco({ natureza: 'outra' }), retornoDoBanco({ parcelas: [{ sequencia: 'a', valor: 1 }] })]) {
      expect(lerRetornoLancarPeloModal(torto)).toBeNull();
    }
  });

  it('as frases: o aviso diz o EXCESSO e que pode salvar; P0001 sobe do banco, o resto nunca sai cru', () => {
    const aviso = { excesso: 2000, base: 10000, recebido: 7000, programado: 5000 };
    expect(fraseAcimaDoSaldo(aviso, 'venda')).toMatch(/^R\$\s2\.000,00 acima do saldo a receber da operação — pode salvar/);
    expect(fraseAcimaDoSaldo(aviso, 'compra')).toMatch(/acima do saldo a pagar da operação/);
    expect(fraseDoErroAoLancar({ code: 'P0001', message: 'Soma dos compromissos principais excede a base da operacao' })).toBe('A programação passa do valor da operação.');
    expect(fraseDoErroAoLancar({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe('Não foi possível gravar agora. Tente de novo.');
    expect(fraseDoErroAoLancar({ code: '40001', message: 'x' })).toMatch(/A operação mudou/);
  });

  it('a chamada: erro do banco e retorno torto viram recusa; nunca sucesso inventado', async () => {
    const pedido = { operacaoId: OP, versao: 8, natureza: 'principal' as const, componente: null, planoContaId: null, favorecidoId: null,
      parcelas: [], forma: null, dadosPagamento: null, documento: null, observacao: null, descricao: null, simular: false };
    const recusa: RpcLancarPeloModal = async () => ({ data: null, error: { code: 'P0001', message: 'Informe ao menos uma parcela' } });
    expect(await lancarPeloModal(pedido, recusa)).toEqual({ ok: false, erro: 'Informe ao menos uma parcela' });
    const torto: RpcLancarPeloModal = async () => ({ data: { ok: true }, error: null });
    expect((await lancarPeloModal(pedido, torto)).ok).toBe(false);
  });

  it('as classificações da despesa: na compra, só o centro "Compra de Bovinos" (lista vazia nunca); venda e abate, como vieram', () => {
    expect(classificacoesDaDespesa(CLASSIF, 'compra').map(c => c.id)).toEqual(['pl-cmp']);
    expect(classificacoesDaDespesa(CLASSIF, 'venda')).toHaveLength(3);
    expect(classificacoesDaDespesa(CLASSIF.filter(c => c.id !== 'pl-cmp'), 'compra')).toHaveLength(2);
  });
});

describe('o mapa de frases do banco (expressão completa, nunca pedaço solto)', () => {
  const AMOSTRAS: Array<[string, string]> = [
    ['Soma dos compromissos principais excede a base da operacao', 'A programação passa do valor da operação.'],
    ['Soma dos compromissos principais excede a base da operacao (10000.01 > 10000.00)', 'A programação passa do valor da operação.'],
    ['A classificacao escolhida nao e a que o plano resolve para "Impostos e Despesas de Abates e Vendas"', 'Esta classificação não corresponde à conta desta operação.'],
    ['Classificacao nao encontrada no plano de contas deste cliente', 'Classificação não encontrada no plano de contas deste cliente.'],
    ['Estorne a liquidacao ou conciliacao financeira antes de estornar esta materializacao.', 'Este lançamento já foi pago ou conciliado. Desfaça o pagamento ou a conciliação no Financeiro antes.'],
    ['Compromisso ja cancelado', 'Este lançamento já foi cancelado.'],
  ];
  it('cada amostra do RAISE vira a frase do operador, com acento', () => {
    for (const [banco, tela] of AMOSTRAS) expect(fraseDoBancoOC(banco)).toBe(tela);
    expect(FRASES_DO_BANCO_OC).toHaveLength(5);
  });
  it('pedaço solto NÃO casa, nem a frase dentro de outra: passa como veio', () => {
    for (const solto of ['excede a base', 'Soma dos compromissos principais', 'excede a base da operacao', 'classificacao escolhida',
      'Classificacao nao encontrada', 'plano de contas deste cliente', 'Estorne a liquidacao', 'antes de estornar esta materializacao.',
      'ja cancelado', 'Compromisso ja cancelado pelo operador', 'Programacao: Compromisso ja cancelado',
      'x Soma dos compromissos principais excede a base da operacao', 'Soma dos compromissos principais excede a base da operacaoX',
      'Classificacao nao encontrada no plano de contas deste cliente e mais',
      'Estorne a liquidacao ou conciliacao financeira antes de estornar esta materializacao']) {
      expect(fraseDoBancoOC(solto)).toBe(solto);
    }
    expect(fraseDoBancoOC('Informe ao menos uma parcela')).toBe('Informe ao menos uma parcela');
  });
});

describe('o modal em modo OC — principal (venda)', () => {
  it('faixa de origem com o caminho de volta, título do gesto, e o que não se aplica some', async () => {
    const o = origem('principal');
    montar(o, PREFILL_PRINCIPAL);
    await aberto('5.000,00');
    const faixa = screen.getByTestId('faixa-origem-oc');
    expect(faixa.textContent).toContain('Origem: OC #e8fec78b · Venda 140 Novilhas');
    fireEvent.click(screen.getByTestId('voltar-para-oc'));
    expect(o.onVoltar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Programar recebimento')).toBeTruthy();
    const r = rotulos();
    expect(r).not.toContain('Data competência *');
    expect(r).not.toContain('Data pagamento *');
    expect(r.some(t => /safra/i.test(t))).toBe(false);
    expect(r).toContain('Vencimento *');
    expect(screen.queryByTestId('campo-item-oc')).toBeNull();          // o item é só da despesa
  });

  it('TRAVADOS: tipo, status (Programado), fazenda, favorecido e classificação; EDITÁVEL: o valor, sugerido com o saldo', async () => {
    montar(origem('principal'), PREFILL_PRINCIPAL);
    await aberto('5.000,00');
    expect(porTab(1)).toHaveProperty('disabled', true);
    expect(porTab(4)).toHaveProperty('disabled', true);
    expect(porTab(4)?.textContent).toBe('Programado');
    expect(campoFazenda()).toHaveProperty('disabled', true);
    expect(campoDoRotulo('Fornecedor')).toHaveProperty('disabled', true);
    expect(document.body.textContent).toContain(MOTIVO_CLASSIFICACAO_DA_OC);
    expect(campoValor()).toHaveProperty('disabled', false);
    /* a tela NAO diz "Compõe DRE: Sim" num recebimento que fica fora do DRE, nem o aviso de rateio por fase */
    expect(screen.getByTestId('dre-do-principal-oc').parentElement?.textContent).toMatch(/^Compõe DRE: Não· quem compõe o DRE é a entrega do gado$/);
    expect(document.body.textContent).not.toContain('rateia entre as fases');
    expect(porTab(6)?.textContent).toContain('Comprador Exemplo');
  });

  it('sem vencimento o Salvar NÃO grava: a pendência fica escrita em vermelho, no rótulo e ao lado do botão', async () => {
    const o = origem('principal');
    const { onSave, onClose } = montar(o, PREFILL_PRINCIPAL);
    await aberto('5.000,00');
    await waitFor(() => expect(botaoSalvar().hasAttribute('disabled')).toBe(false));
    fireEvent.click(botaoSalvar());
    await assentar();
    const rotulo = screen.getByTestId('rotulo-vencimento-oc');
    expect(rotulo.textContent).toContain(MOTIVO_VENCIMENTO_OBRIGATORIO);
    expect(rotulo.className).toContain('text-destructive');
    expect(screen.getByTestId('erro-antes-de-salvar').textContent).toBe(MOTIVO_VENCIMENTO_OBRIGATORIO);
    expect(lancar()).toHaveLength(0);
    expect(onSave).not.toHaveBeenCalled();
    expect(o.aoLancar).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('com vencimento: a SIMULAÇÃO roda sozinha, o aviso de "acima do saldo" aparece em ÂMBAR com o excesso e NÃO apaga o Salvar', async () => {
    banco.resposta = (args) => ({
      data: retornoDoBanco({ simulado: args.p_simular === true, avisos: [{ codigo: 'acima_do_saldo', excesso: 2000, base: 10000, recebido: 7000, programado: 5000 }] }),
      error: null,
    });
    montar(origem('principal'), PREFILL_PRINCIPAL);
    await aberto('5.000,00');
    informarVencimento('10/11/2026');
    const aviso = await screen.findByTestId('aviso-acima-do-saldo', undefined, { timeout: 3000 });
    expect(aviso.textContent).toMatch(/R\$\s2\.000,00 acima do saldo a receber/);
    expect(aviso.className).toContain('text-amber-700');
    expect(botaoSalvar().hasAttribute('disabled')).toBe(false);
    expect(lancar().every(c => c.args.p_simular === true)).toBe(true);
    expect(lancar()[0].args.p_parcelas).toEqual([{ valor: 5000, vencimento: '2026-11-10', conta_id: 'bb' }]);
  });

  it('a recusa da simulação (acima da BASE) fica escrita em vermelho, antes do Salvar', async () => {
    banco.resposta = () => ({ data: null, error: { code: 'P0001', message: 'Soma dos compromissos principais excede a base da operacao' } });
    montar(origem('principal'), PREFILL_PRINCIPAL);
    await aberto('5.000,00');
    informarVencimento('10/11/2026');
    const recusa = await screen.findByTestId('recusa-da-simulacao', undefined, { timeout: 3000 });
    expect(recusa.textContent).toBe('A programação passa do valor da operação.');
    expect(screen.queryByTestId('aviso-acima-do-saldo')).toBeNull();
  });

  it('SALVAR vai a `oc_lancar_pelo_modal` — nunca ao `onSave` nem ao parcelamento do Financeiro —, avisa a OC e fecha', async () => {
    const o = origem('principal');
    const { onSave, onClose } = montar(o, PREFILL_PRINCIPAL);
    await aberto('5.000,00');
    informarVencimento('10/11/2026');
    await waitFor(() => expect(lancar().length).toBeGreaterThan(0), { timeout: 3000 });
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(o.aoLancar).toHaveBeenCalledTimes(1));
    const gravacoes = lancar().filter(c => c.args.p_simular === false);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].args).toMatchObject({
      p_operacao_id: OP, p_versao: 8, p_natureza: 'principal', p_componente: null, p_plano_conta_id: null, p_favorecido_id: null,
      p_parcelas: [{ valor: 5000, vencimento: '2026-11-10', conta_id: 'bb' }], p_descricao: 'Venda 140 Novilhas · Recebimento',
    });
    expect(vi.mocked(o.aoLancar).mock.calls[0][0]).toMatchObject({ versao: 9, natureza: 'principal' });
    expect(onSave).not.toHaveBeenCalled();
    expect(banco.chamadas.some(c => c.nome === 'fn_parcelamento_cadastrar')).toBe(false);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('recusa do banco AO GRAVAR: escrita ao lado do botão, o modal fica aberto e a OC não é avisada', async () => {
    const o = origem('principal');
    const { onClose } = montar(o, PREFILL_PRINCIPAL);
    await aberto('5.000,00');
    informarVencimento('10/11/2026');
    await waitFor(() => expect(lancar().length).toBeGreaterThan(0), { timeout: 3000 });
    banco.resposta = () => ({ data: null, error: { code: '40001', message: 'versao' } });
    fireEvent.click(botaoSalvar());
    const erro = await screen.findByTestId('erro-antes-de-salvar');
    expect(erro.textContent).toMatch(/A operação mudou enquanto você trabalhava/);
    expect(o.aoLancar).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('o modal em modo OC — despesa', () => {
  it('o "Item da operação" é obrigatório: sem ele o Salvar não grava e diz por quê; classificação e favorecido ficam LIVRES', async () => {
    const o = origem('obrigacao');
    const { onSave } = montar(o, PREFILL_DESPESA);
    await aberto('300,00');
    expect(screen.getByText('Nova despesa da operação')).toBeTruthy();
    expect(screen.getByTestId('campo-item-oc')).toBeTruthy();
    expect(screen.getByTestId('rotulo-item-oc').textContent).toBe('Item da operação *');
    expect(porTab(1)).toHaveProperty('disabled', true);
    expect(porTab(4)).toHaveProperty('disabled', true);
    expect(campoFazenda()).toHaveProperty('disabled', true);
    expect(campoDoRotulo('Fornecedor')).toHaveProperty('disabled', false);
    expect(document.body.textContent).not.toContain(MOTIVO_CLASSIFICACAO_DA_OC);
    informarVencimento('10/11/2026');
    await waitFor(() => expect(botaoSalvar().hasAttribute('disabled')).toBe(false));
    fireEvent.click(botaoSalvar());
    await assentar();
    expect(screen.getByTestId('rotulo-item-oc').textContent).toContain(MOTIVO_ITEM_OBRIGATORIO);
    expect(screen.getByTestId('rotulo-item-oc').className).toContain('text-destructive');
    expect(screen.getByTestId('erro-antes-de-salvar').textContent).toBe(MOTIVO_ITEM_OBRIGATORIO);
    expect(lancar()).toHaveLength(0);                 // sem item nem a simulação vai ao banco
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('o modal NORMAL não muda', () => {
  it('sem `origemOC`: nenhuma faixa, nenhum item, competência e pagamento à vista, e nada travado', async () => {
    const { onSave } = montar(null, { ...PREFILL_DESPESA });
    await aberto('300,00');
    expect(screen.queryByTestId('faixa-origem-oc')).toBeNull();
    expect(screen.queryByTestId('campo-item-oc')).toBeNull();
    expect(screen.queryByTestId('rotulo-vencimento-oc')).toBeNull();
    expect(screen.getByText('Novo Lançamento')).toBeTruthy();
    const r = rotulos();
    expect(r).toContain('Data competência *');
    expect(r).toContain('Data pagamento *');
    expect(r).toContain('Data vencimento');
    expect(porTab(1)).toHaveProperty('disabled', false);
    expect(porTab(4)).toHaveProperty('disabled', false);
    expect(campoFazenda()).toHaveProperty('disabled', false);
    expect(campoDoRotulo('Fornecedor')).toHaveProperty('disabled', false);
    await waitFor(() => expect(botaoSalvar().hasAttribute('disabled')).toBe(false));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(lancar()).toHaveLength(0);
  });

  it('na EDIÇÃO o modo OC não existe, mesmo que a prop venha (lido da fonte, com a busca provando que sabe achar)', () => {
    const fonte = readFileSync('src/components/financeiro-v2/LancamentoV2Dialog.tsx', 'utf8');
    const guarda = /const modoOC = !isEdit && origemOC \? origemOC : null;/;
    expect(guarda.test('const modoOC = !isEdit && origemOC ? origemOC : null;')).toBe(true);
    expect(guarda.test(fonte)).toBe(true);
    /* a trava é UMA: os quatro campos novos leem `lockedFields`, não uma prop paralela */
    for (const campo of ['fazenda_id', 'favorecido_id', 'classificacao', 'status_transacao']) expect(fonte).toContain(`travado('${campo}')`);
    /* e o ramo do modo OC sai ANTES do parcelado do Financeiro */
    expect(fonte.indexOf('if (modoOC) {\n      const contaOC')).toBeGreaterThan(0);
    expect(fonte.indexOf('if (modoOC) {\n      const contaOC')).toBeLessThan(fonte.indexOf("if (!currentIsEdit && formaPagamentoParc === 'parcelada' && numParcelas >= 2) {"));
  });
});
