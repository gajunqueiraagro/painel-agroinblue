/**
 * CARTAO-LANCAMENTO-01 (Gabriel 30/10, decisões 2–5 e o mock v2) — o Novo lançamento pago numa conta de CARTÃO. Cadastros SINTÉTICOS.
 *   C1 com os dias digitados (fecha 3, vence 10): o vencimento é a fatura onde a compra cai, com 💳 e a frase; a forma vem "Cartão de
 *      crédito" com o selo "auto"; o pagamento fica vazio · C2 sem dia digitado: o dia das faturas, e a frase diz de onde veio
 *   C3 a forma e o vencimento que a nota (prefill) trouxe ficam · C4 vindo do extrato e na edição: nada é sugerido
 *   C1b o cadastro manda sobre as faturas e o fechamento muda a fatura · C5 o operador troca a forma: o selo some · C6 trocar para conta comum tira a forma automática
 * FIN-FORMA-CARTAO-AUTO-01 (Gabriel 17/11, D1/D2) — a FORMA mudou de regra (o espelho do gatilho do banco): saída em conta de cartão é SEMPRE
 *   "Cartão de crédito", com o campo TRAVADO e a frase "pela conta (cartão)" — na nota (C3), no extrato (C4), na edição (C4b) e com o
 *   operador (C5); sair do cartão zera a forma de cartão (C6). O vencimento da fatura segue a regra de antes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ClassificacaoItem, ContaBancariaV2, LancamentoV2 } from '@/hooks/useFinanceiroV2';
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
const cartaoNoBanco = vi.hoisted(() => ({
  diasDoCartao: vi.fn(async (_c: string) => [{ dia: 10, lancamentos: 9, ultimo: '2026-10-10' }]),
  diasCadastradosDoCartao: vi.fn(async (_c: string): Promise<{ fechamento: number | null; vencimento: number | null }> => ({ fechamento: 3, vencimento: 10 })),
}));
vi.mock('@/lib/financeiro/diasDoCartao', () => cartaoNoBanco);
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'teste', nome: 'Teste' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaDocumentosLancamento', () => ({ AbaDocumentosLancamento: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';
import { esquecerAtividade } from '@/lib/financeiro/ultimaAtividade';

const FAZENDAS: Fazenda[] = [{ id: 'sm', nome: 'Faz Santa Maria', owner_id: 'u1', cliente_id: 'teste' }];
const conta = (id: string, nome: string, tipo: ContaBancariaV2['tipo_conta']): ContaBancariaV2 => ({
  id, nome_conta: nome, banco: null, fazenda_id: 'sm', tipo_conta: tipo, codigo_conta: null, nome_exibicao: nome, agencia: null, numero_conta: null, conta_digito: null,
});
const CONTAS = [conta('elo', 'Cartão Elo', 'cartao'), conta('itau', 'Itaú Corrente', 'cc')];
const CLASSIF: ClassificacaoItem[] = [];
const PREFILL = { tipo_operacao: '2-Saídas', status_transacao: 'previsto', data_competencia: '2026-10-30', valor: 312.4, descricao: 'Combustível posto', conta_bancaria_id: 'elo' };

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  esquecerAtividade();
  cartaoNoBanco.diasDoCartao.mockClear(); cartaoNoBanco.diasCadastradosDoCartao.mockClear();
  cartaoNoBanco.diasCadastradosDoCartao.mockResolvedValue({ fechamento: 3, vencimento: 10 });
});

async function abrir(p: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (q: Partial<React.ComponentProps<typeof LancamentoV2Dialog>>) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LancamentoV2Dialog open={false} onClose={() => {}} onSave={async () => true} lancamento={null}
          fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={[]} safras={[]}
          onCriarFornecedor={async () => null} {...q} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const r = render(tree({}));
  r.rerender(tree({ open: true, ...p }));
  await screen.findByDisplayValue('312,40');
  await new Promise((ok) => setTimeout(ok, 30));
}
/** os pares (rótulo, valor) do bloco Pagamento do resumo */
const pagamentoNoResumo = () => Object.fromEntries([...screen.getByTestId('resumo-pagamento').querySelectorAll('tr')].flatMap((tr) => {
  /* RESUMO-LATERAL-FORMA-01 — a Forma aparece CURTA ("Cartão"); a gravada inteira está no title da célula: é ela que este teste confere */
  const cel = [...tr.querySelectorAll('td')];
  const td = cel.map((c, k) => (k % 2 === 1 && cel[k - 1]?.textContent === 'Forma' && c.getAttribute('title') ? c.getAttribute('title') ?? '' : c.textContent ?? ''));
  return [[td[0], td[1]], [td[2], td[3]]];
}));
const irParaPagamento = () => {
  const aba = screen.getAllByRole('tab').find((t) => /Pagamento/.test(t.textContent ?? ''));
  if (!aba) throw new Error('sem a aba Pagamento');
  fireEvent.mouseDown(aba); fireEvent.click(aba);
};

describe('CARTAO-LANCAMENTO-01 — o Novo lançamento numa conta de cartão', () => {
  it('C1 dias digitados (fecha 3, vence 10): o vencimento da fatura com 💳 e a frase; forma "Cartão de crédito" pela conta; pagamento vazio', async () => {
    await abrir({ prefill: PREFILL });
    await waitFor(() => expect(pagamentoNoResumo()['Venc.']).toBe('10/11/2026'));
    expect(cartaoNoBanco.diasCadastradosDoCartao).toHaveBeenCalledWith('elo');
    expect(screen.getByTestId('vencimento-da-fatura').textContent).toBe('Venc. * · pela fatura ⓘ');
    expect(screen.getByTestId('vencimento-da-fatura').getAttribute('title')).toBe('Por que 10/11? A compra é de 30/10, depois do fechamento de 03/10 → entra na fatura que fecha em 03/11 e vence em 10/11.');
    expect(screen.queryByTestId('frase-da-fatura')).toBeNull();   // o ciclo mora no ⓘ, nunca bloco na tela (mock 23/11)
    expect(pagamentoNoResumo()).toMatchObject({ Forma: 'Cartão de crédito', 'Pgto.': '—' });
    irParaPagamento();
    expect((await screen.findByTestId('forma-pela-conta')).textContent).toBe('pela conta (cartão): saída em cartão é sempre Cartão de crédito');
    const forma = screen.getAllByRole('combobox').find((c) => (c.textContent ?? '').includes('Cartão de crédito'));
    expect(forma?.hasAttribute('disabled') || forma?.getAttribute('data-disabled') != null).toBe(true);
  });

  it('C1b o cadastro manda sobre as faturas: fecha 28, vence 5 (as faturas diriam dia 10) — a compra de 30/10 vai na que vence 05/12', async () => {
    cartaoNoBanco.diasCadastradosDoCartao.mockResolvedValue({ fechamento: 28, vencimento: 5 });
    await abrir({ prefill: PREFILL });
    await waitFor(() => expect(pagamentoNoResumo()['Venc.']).toBe('05/12/2026'));
    expect(screen.getByTestId('vencimento-da-fatura').getAttribute('title')).toBe('Por que 05/12? A compra é de 30/10, depois do fechamento de 28/10 → entra na fatura que fecha em 28/11 e vence em 05/12.');
  });

  it('C2 sem dia digitado: o dia das faturas (sem fechamento, o mês seguinte), e a frase diz de onde veio', async () => {
    cartaoNoBanco.diasCadastradosDoCartao.mockResolvedValue({ fechamento: null, vencimento: null });
    await abrir({ prefill: { ...PREFILL, data_competencia: '2026-11-03' } });
    await waitFor(() => expect(pagamentoNoResumo()['Venc.']).toBe('10/12/2026'));
    expect(screen.getByTestId('vencimento-da-fatura').getAttribute('title'))
      .toBe('Por que 10/12? Sem dia de fechamento no cadastro: vence no dia 10 (sugerido pelas faturas) do mês seguinte à compra de 03/11.');
  });

  it('C3 a nota traz PIX e um vencimento numa conta de cartão: a forma é a do cartão (D1) e o vencimento é o da FATURA (CARTAO-VENC-FATURA-01)', async () => {
    await abrir({ prefill: { ...PREFILL, forma_pagamento: 'PIX', data_vencimento: '2026-11-20' } });
    await waitFor(() => expect(pagamentoNoResumo()['Venc.']).toBe('10/11/2026'));
    expect(pagamentoNoResumo()).toMatchObject({ Forma: 'Cartão de crédito' });
    expect(screen.getByTestId('vencimento-da-fatura').getAttribute('title')).toContain('vence em 10/11');
    irParaPagamento();
    expect(screen.getByTestId('forma-pela-conta')).toBeTruthy();
  });

  it('C4 vindo do extrato (sem parcelamento): o vencimento não é sugerido, mas a forma é a do cartão (D1)', async () => {
    await abrir({ prefill: PREFILL, ocultarParcelamento: true });
    expect(cartaoNoBanco.diasDoCartao).not.toHaveBeenCalled();
    expect(pagamentoNoResumo()).toMatchObject({ Forma: 'Cartão de crédito', 'Venc.': '—' });
    expect(screen.queryByTestId('frase-da-fatura')).toBeNull();
  });

  it('C4b edição de um lançamento do cartão gravado sem forma: o vencimento não é sugerido; a forma é a do cartão (D1)', async () => {
    const LANC: LancamentoV2 = {
      id: 'l1', cliente_id: 'teste', fazenda_id: 'sm', conta_bancaria_id: 'elo', data_competencia: '2026-10-30', data_pagamento: null,
      data_vencimento: null, valor: 312.4, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'previsto', descricao: 'Combustível posto',
      macro_custo: null, grupo_custo: null, centro_custo: null, subcentro: null, escopo_negocio: 'pecuaria', observacao: null, ano_mes: '2026-10',
      documento: null, historico: null, numero_documento: null, favorecido_id: null, conta_destino_id: null, origem_lancamento: 'manual',
      lote_importacao_id: null, forma_pagamento: null, dados_pagamento: null, cancelado: false, conciliado_em: null, editado_manual: false,
      created_by: null, created_at: '2026-10-30T12:00:00Z', updated_at: '2026-10-30T12:00:00Z', movimentacao_rebanho_id: null, recorrencia_id: null,
    };
    await abrir({ lancamento: LANC });
    expect(cartaoNoBanco.diasDoCartao).not.toHaveBeenCalled();
    expect(pagamentoNoResumo()).toMatchObject({ Forma: 'Cartão de crédito', 'Venc.': '—' });
  });

  it('C5 o operador NÃO troca a forma numa conta de cartão: o campo é travado (D1)', async () => {
    await abrir({ prefill: PREFILL });
    irParaPagamento();
    await screen.findByTestId('forma-pela-conta');
    const forma = screen.getAllByRole('combobox').find((c) => (c.textContent ?? '').includes('Cartão de crédito'));
    if (!forma) throw new Error('sem o seletor da forma');
    forma.focus(); fireEvent.keyDown(forma, { key: 'ArrowDown' });
    await new Promise((ok) => setTimeout(ok, 50));
    expect(screen.queryByRole('option', { name: 'Boleto' })).toBeNull();
    expect(pagamentoNoResumo().Forma).toBe('Cartão de crédito');
  });

  it('C9 ENTRADA numa conta de cartão (estorno): a forma fica como veio e o campo não trava (D5)', async () => {
    await abrir({ prefill: { ...PREFILL, tipo_operacao: '1-Entradas', forma_pagamento: 'PIX' } });
    await new Promise((ok) => setTimeout(ok, 30));
    expect(pagamentoNoResumo().Forma).toBe('PIX');
    irParaPagamento();
    expect(screen.queryByTestId('forma-pela-conta')).toBeNull();
  });

  it('C6 trocar para uma conta comum zera a forma de cartão (D2) e tira a frase da fatura', async () => {
    await abrir({ prefill: PREFILL });
    await waitFor(() => expect(pagamentoNoResumo().Forma).toBe('Cartão de crédito'));
    /* medido: rodando o arquivo inteiro, sem esta espera o clique no seletor não abre o painel (logo depois do C5 fechar o menu da forma);
       sozinho, abre. A causa não foi isolada — a espera só tira o teste da janela. */
    await new Promise((ok) => setTimeout(ok, 400));
    fireEvent.click(screen.getByRole('button', { name: /Cartão Elo/ }));
    const painel = await screen.findByTestId('searchable-select-painel');
    fireEvent.click(within(painel).getByText('Itaú Corrente'));
    await new Promise((ok) => setTimeout(ok, 50));
    await waitFor(() => expect(pagamentoNoResumo().Forma).toBe('—'));
    expect(pagamentoNoResumo()['Venc.']).toBe('10/11/2026');   // a data fica: só a forma era automática
    expect(screen.queryByTestId('vencimento-da-fatura')).toBeNull();
  });
});

/* FIN-FORMA-CARTAO-AUTO-01 — o fornecedor SUGERE a forma do cadastro, menos em conta de cartão (o campo é travado pela conta); e o que se
   GRAVA é a forma efetiva (a do cartão quando travada), nos cinco caminhos de gravar do modal */
describe('FIN-FORMA-CARTAO-AUTO-01 — o fornecedor e a gravação', () => {
  const FONTE = readFileSync(resolve(__dirname, 'LancamentoV2Dialog.tsx'), 'utf8');
  it('C7 o fornecedor não troca a forma numa conta de cartão', () => {
    expect(FONTE).toContain('if (f.tipo_recebimento && !contaPedeFormaDoCartao(contaOrigemId, tipoOperacao)) {');
  });
  it('C8 grava a forma efetiva (nunca a do estado cru)', () => {
    expect(FONTE).toContain('const formaParaGravar = formaTravada ? FORMA_CARTAO_CREDITO : formaPgto;');
    /* a "edição pendente" (trocar de parcela pergunta antes) compara o que a PESSOA mexeu: ela fica de fora, de propósito */
    const gravar = FONTE.replace(/const temEdicaoPendente = \(\): boolean => \{[\s\S]*?\n {2}\};/, '');
    expect(gravar).not.toBe(FONTE);
    expect(gravar).not.toMatch(/forma(_pagamento|Pagamento)?: formaPgto \|\| null/);
  });
});

/* CARTAO-VENC-FATURA-01 (Gabriel 23/11) — o caso: a NF de supermercado de 17/11 no cartão que fecha 05 e vence 16 nascia vencendo 17/11
   (a emissão da nota sem duplicata). Dado SINTÉTICO com os dias do caso. */
describe('CARTAO-VENC-FATURA-01 — o lançamento no cartão nasce na fatura, Programado, sem pagamento', () => {
  const NOTA = { ...PREFILL, status_transacao: 'programado', data_competencia: '2026-11-17', data_vencimento: '2026-11-17', tipo_documento: 'Nota Fiscal' };
  const LANC_ITAU: LancamentoV2 = {
    id: 'l2', cliente_id: 'teste', fazenda_id: 'sm', conta_bancaria_id: 'itau', data_competencia: '2026-11-17', data_pagamento: '2026-11-17',
    data_vencimento: '2026-11-17', valor: 312.4, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'realizado', descricao: 'Combustível posto',
    macro_custo: null, grupo_custo: null, centro_custo: null, subcentro: null, escopo_negocio: 'pecuaria', observacao: null, ano_mes: '2026-11',
    documento: null, historico: null, numero_documento: null, favorecido_id: null, conta_destino_id: null, origem_lancamento: 'manual',
    lote_importacao_id: null, forma_pagamento: 'PIX', dados_pagamento: null, cancelado: false, conciliado_em: null, editado_manual: false,
    created_by: null, created_at: '2026-11-17T12:00:00Z', updated_at: '2026-11-17T12:00:00Z', movimentacao_rebanho_id: null, recorrencia_id: null,
  };

  it('V1 "+ Da nota": a emissão 17/11 cede à fatura (fecha 05, vence 16) → 16/12/2026; Programado e sem data de pagamento', async () => {
    cartaoNoBanco.diasCadastradosDoCartao.mockResolvedValue({ fechamento: 5, vencimento: 16 });
    await abrir({ prefill: NOTA });
    await waitFor(() => expect(pagamentoNoResumo()['Venc.']).toBe('16/12/2026'));
    expect(pagamentoNoResumo()['Pgto.']).toBe('—');
    expect(screen.getByTestId('resumo-pagamento').textContent).toContain('Programado');
    expect(screen.getByTestId('vencimento-da-fatura').getAttribute('title')).toBe('Por que 16/12? A compra é de 17/11, depois do fechamento de 05/11 → entra na fatura que fecha em 05/12 e vence em 16/12.');
    expect(screen.queryByTestId('aviso-cadastro-do-cartao')).toBeNull();
  });

  it('V2 o que veio REALIZADO com pagamento numa conta de cartão nasce Programado e sem pagamento', async () => {
    cartaoNoBanco.diasCadastradosDoCartao.mockResolvedValue({ fechamento: 5, vencimento: 16 });
    await abrir({ prefill: { ...NOTA, status_transacao: 'realizado', data_pagamento: '2026-11-17' } });
    await waitFor(() => expect(pagamentoNoResumo()['Venc.']).toBe('16/12/2026'));
    expect(pagamentoNoResumo()['Pgto.']).toBe('—');
    expect(screen.getByTestId('resumo-pagamento').textContent).toContain('Programado');
  });

  it('V3 Editar: trocar a conta de um corrente para o cartão leva à fatura, Programado e sem pagamento; abrir sem trocar não mexe', async () => {
    cartaoNoBanco.diasCadastradosDoCartao.mockResolvedValue({ fechamento: 5, vencimento: 16 });
    await abrir({ lancamento: LANC_ITAU });
    await new Promise((ok) => setTimeout(ok, 30));
    expect(cartaoNoBanco.diasDoCartao).not.toHaveBeenCalled();
    expect(pagamentoNoResumo()).toMatchObject({ 'Venc.': '17/11/2026', 'Pgto.': '17/11/2026' });
    await new Promise((ok) => setTimeout(ok, 400));
    fireEvent.click(screen.getByRole('button', { name: /Itaú Corrente/ }));
    const painel = await screen.findByTestId('searchable-select-painel');
    fireEvent.click(within(painel).getByText('Cartão Elo'));
    await waitFor(() => expect(pagamentoNoResumo()['Venc.']).toBe('16/12/2026'));
    expect(pagamentoNoResumo()['Pgto.']).toBe('—');
    expect(screen.getByTestId('resumo-pagamento').textContent).toContain('Programado');
  });

  it('V4 o cartão sem dia de fechamento no cadastro: o aviso pequeno com o link para o cadastro (numa aba nova)', async () => {
    cartaoNoBanco.diasCadastradosDoCartao.mockResolvedValue({ fechamento: null, vencimento: 16 });
    await abrir({ prefill: NOTA });
    const aviso = await screen.findByTestId('aviso-cadastro-do-cartao');
    expect(aviso.textContent).toContain('Cartão sem dia de fechamento no cadastro');
    const link = screen.getByTestId('link-cadastro-do-cartao');
    expect([link.getAttribute('href'), link.getAttribute('target')]).toEqual(['/?secao=contas-bancarias', '_blank']);
    expect(pagamentoNoResumo()['Venc.']).toBe('16/12/2026');   // sem fechamento: o dia 16 do mês seguinte (a regra de antes)
  });

  it('V5 só a data DIGITADA pelo operador fica: o campo de vencimento marca a digitação (o resto cede à fatura)', () => {
    const FONTE = readFileSync(resolve(__dirname, 'LancamentoV2Dialog.tsx'), 'utf8');
    expect(FONTE).toContain('<DatePicker value={dataVencimento} onChange={digitarVencimento}');
    expect(FONTE).toContain("const digitarVencimento = (v: string) => { vencimentoDigitadoRef.current = true; setDataVencimento(v); };");
  });

  it('V6 UMA regra para toda porta: Novo, prévia da nota, Parcelar este lançamento e importação leem os dias por `useDiasDaFatura`/`lerDiasDaFatura` e a fatura por `faturaDaCompra`; a regra velha (dia mais frequente sem fechamento) não volta', () => {
    const ler = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');
    const portas = {
      novo: ler('src/components/financeiro-v2/LancamentoV2Dialog.tsx'),
      nota: ler('src/components/financeiro-v2/NotaFiscalDialog.tsx'),
      parcelar: ler('src/components/financeiro-v2/ParcelarEsteLancamento.tsx'),
    };
    for (const [nome, f] of Object.entries(portas)) {
      expect({ nome, dias: f.includes('useDiasDaFatura('), fatura: f.includes('faturaDaCompra('), velha: /primeiraFatura\(|diaMaisFrequente\(/.test(f) })
        .toEqual({ nome, dias: true, fatura: true, velha: false });
    }
    expect(portas.nota).toContain('faturaDaCompra(n.emissao, diasDoCartaoAVista.vencimento.dia, diasDoCartaoAVista.fechamento)');
    const importacao = ler('src/v2/hooks/useImportLancamentosExcel.ts');
    expect(importacao).toContain('await lerDiasDaFatura(id)');
    expect(importacao).toContain('vencimentoDaImportacaoNoCartao(l.row.data_vencimento, l.row.data_competencia, diasPorCartao.get(l.contaBancariaId ?? \'\') ?? null)');
  });
});
