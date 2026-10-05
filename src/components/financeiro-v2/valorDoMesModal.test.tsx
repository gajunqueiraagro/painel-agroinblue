/**
 * REC-VALOR-DO-MES-MODAL-01 — editar UMA ocorrência de recorrência marca o valor do mês; "Voltar ao previsto" desfaz.
 *
 * ⚠ O `LancamentoV2Dialog` É MONTADO DE VERDADE; só as bordas são falsas (banco, cliente, modais filhos). O banco falso
 *   responde UMA coisa: a regra da recorrência (`financeiro_recorrencias` por id) — e CONTA quantas vezes foi perguntado.
 * ⚠ O que o modal manda gravar é o `form` do `onSave` (a chave `valor_do_mes`); o que vira coluna no UPDATE é provado no
 *   `useFinanceiroV2.valorDoMes.test.ts`. O lançamento COMUM é provado pela foto do `valorComConta.test.tsx` (o HTML do
 *   commit publicado) e, aqui, pelo payload sem a chave e por zero consultas à regra.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';

const banco = vi.hoisted(() => ({
  consultasDaRegra: 0,
  regra: { valor_base: -888.49, dia_vencimento: 5, data_inicio: '2026-01-01', primeiro_vencimento: '2026-02-05' } as Record<string, unknown> | null,
}));
vi.mock('@/integrations/supabase/client', () => {
  const construtor = (tabela: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'ilike', 'or', 'match', 'contains', 'update']) b[m] = () => b;
    b.maybeSingle = () => {
      if (tabela === 'financeiro_recorrencias') { banco.consultasDaRegra += 1; return Promise.resolve({ data: banco.regra, error: null }); }
      return Promise.resolve({ data: null, error: null });
    };
    b.single = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (x: { data: unknown[]; error: null; count: number }) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => construtor(t),
      rpc: async () => ({ data: null, error: null }),
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), upload: async () => ({ data: {}, error: null }), remove: async () => ({ error: null }) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente' } }) }));
vi.mock('@/v2/components/edicao/LancamentoZooModal', () => ({ LancamentoZooModal: () => null }));
vi.mock('@/components/financeiro-v2/AbaAuditoriaLancamento', () => ({ AbaAuditoriaLancamento: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Pureza' }] as Fazenda[];
const CONTAS: ContaBancariaV2[] = [{ id: 'bb', nome_conta: 'Banco do Brasil', banco: 'BB', fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: 'Banco do Brasil', agencia: null, numero_conta: null, conta_digito: null }];
const FORN = { id: 'forn', nome: 'Funcionario Exemplo', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null } as FornecedorV2;
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-sal', subcentro: 'Salários Pecuária', centro_custo: 'Folha', grupo_custo: 'Pessoal', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
];
/** A ocorrência de outubro de uma recorrência de 888,49 que vence no dia 5 do mês seguinte. */
const ocorrencia = (extra: Record<string, unknown> = {}) => ({
  id: 'lanc-rec', cliente_id: 'cli', fazenda_id: 'f-pur', conta_bancaria_id: 'bb', data_competencia: '2026-10-01', data_pagamento: null,
  data_vencimento: '2026-11-05', valor: 888.49, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'programado',
  descricao: 'Folha', macro_custo: 'Custeio Produtivo', grupo_custo: 'Pessoal', centro_custo: 'Folha',
  subcentro: 'Salários Pecuária', escopo_negocio: 'pecuaria', observacao: null, ano_mes: '2026-10', documento: null, historico: null,
  numero_documento: null, favorecido_id: 'forn', conta_destino_id: null, origem_lancamento: 'recorrencia', lote_importacao_id: null,
  forma_pagamento: 'Boleto', dados_pagamento: null, cancelado: false, conciliado_em: null, editado_manual: false,
  created_by: 'u1', created_at: '2026-09-10T12:00:00Z', updated_at: '2026-09-10T12:00:00Z', plano_conta_id: 'pl-sal',
  recorrencia_id: 'rec-1', valor_do_mes_em: null, valor_do_mes_origem: null, ...extra,
}) as unknown as LancamentoV2;
const marcada = (origem: 'manual' | 'planilha', extra: Record<string, unknown> = {}) =>
  ocorrencia({ valor: 958.6, valor_do_mes_em: '2026-10-05T13:36:03+00:00', valor_do_mes_origem: origem, ...extra });

function montar(lancamento: LancamentoV2 | null) {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string): Promise<boolean | string> => true);
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = render(
    <QueryClientProvider client={qc}><MemoryRouter>
      <LancamentoV2Dialog open onClose={onClose} onSave={onSave} lancamento={lancamento}
        fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={[FORN]} safras={[]}
        onCriarFornecedor={async () => null} />
    </MemoryRouter></QueryClientProvider>,
  );
  return { ...r, onSave, onClose };
}
const campo = () => document.querySelector('input[tabindex="10"]') as HTMLInputElement;
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;
const linha = () => screen.queryByTestId('valor-do-mes');
/** `formatMoeda` separa o R$ com espaço duro; a comparação é com espaço comum. */
const semDuro = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');
const titulo = () => semDuro(linha()?.getAttribute('title'));
const gesto = () => screen.queryByTestId('acao-voltar-ao-previsto') as HTMLButtonElement | null;
const assentar = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const digitar = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });
async function aberto(valor: string) {
  await waitFor(() => expect(campo().value).toBe(valor));
  await waitFor(() => expect(botaoSalvar().hasAttribute('disabled')).toBe(false));
  await assentar();
}
const formSalvo = (m: { onSave: ReturnType<typeof vi.fn> }) => m.onSave.mock.calls[0][0] as LancamentoV2Form;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T12:00:00') });
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  banco.consultasDaRegra = 0;
  banco.regra = { valor_base: -888.49, dia_vencimento: 5, data_inicio: '2026-01-01', primeiro_vencimento: '2026-02-05' };
});

describe('prova 2 — ocorrência NÃO marcada: a intenção antes de salvar, e o salvar marca', () => {
  it('sem mexer no valor não há linha nem gesto; a regra foi lida uma vez', async () => {
    montar(ocorrencia());
    await aberto('888,49');
    expect(linha()).toBeNull();
    expect(gesto()).toBeNull();
    expect(banco.consultasDaRegra).toBe(1);
  });
  it('mudar o valor mostra a intenção com o previsto; voltar ao valor gravado a tira', async () => {
    montar(ocorrencia());
    await aberto('888,49');
    digitar('95860');
    expect(campo().value).toBe('958,60');
    await waitFor(() => expect(linha()).not.toBeNull());
    expect(linha()?.getAttribute('data-estado')).toBe('intencao');
    expect(titulo()).toBe('Ao salvar, fica como valor do mês (previsto R$ 888,49); o Propagar não altera esta conta.');
    /* na tela vai a curta, e o número é a parte que não encolhe */
    expect(semDuro(linha()?.textContent)).toBe('Ao salvar, fica como valor do mês ·previsto R$ 888,49');
    expect(linha()?.querySelector('.shrink-0')?.textContent?.replace(/\u00a0/g, ' ')).toBe('previsto R$ 888,49');
    /* o gesto de voltar é só da MARCADA */
    expect(gesto()).toBeNull();
    digitar('88849');
    await waitFor(() => expect(linha()).toBeNull());
  });
  it('a conta no campo ("/2"): durante a conta nada; aplicada, a intenção aparece e o salvar leva o resultado e o pedido', async () => {
    const m = montar(ocorrencia());
    await aberto('888,49');
    digitar('888,49/2');
    expect(linha()).toBeNull();
    fireEvent.blur(campo());
    expect(campo().value).toBe('444,25');
    await waitFor(() => expect(linha()?.getAttribute('data-estado')).toBe('intencao'));
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(formSalvo(m)).toMatchObject({ valor: 444.25, data_vencimento: '2026-11-05', valor_do_mes: 'marcar_manual' });
    expect(m.onSave.mock.calls[0][1]).toBe('lanc-rec');
  });
  it('reabrir depois de marcada: "Valor do mês ajustado · previsto R$ 888,49" e o gesto aceso', async () => {
    montar(marcada('manual'));
    await aberto('958,60');
    await waitFor(() => expect(titulo()).toBe('Valor do mês ajustado · previsto R$ 888,49'));
    expect(linha()?.getAttribute('data-estado')).toBe('marcada');
    expect(gesto()?.disabled).toBe(false);
    expect(screen.queryByTestId('acao-voltar-ao-previsto-motivo')).toBeNull();
  });
  it('marcada pela planilha: a linha diz de onde veio', async () => {
    montar(marcada('planilha'));
    await aberto('958,60');
    await waitFor(() => expect(titulo()).toBe('Valor do mês ajustado · previsto R$ 888,49 · pela planilha'));
  });
  it('marcada pela planilha e o operador muda o valor: o salvar pede "marcar_manual"', async () => {
    const m = montar(marcada('planilha'));
    await aberto('958,60');
    digitar('100000');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(formSalvo(m)).toMatchObject({ valor: 1000, valor_do_mes: 'marcar_manual' });
  });
});

describe('prova 3 — salvar sem mudar valor nem vencimento não fala da marca', () => {
  it('não marcada: o form não leva a chave', async () => {
    const m = montar(ocorrencia());
    await aberto('888,49');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    /* o detector sabe achar: o form tem o valor */
    expect(formSalvo(m).valor).toBe(888.49);
    expect('valor_do_mes' in formSalvo(m)).toBe(false);
  });
  it('marcada: idem — a marca fica intacta', async () => {
    const m = montar(marcada('planilha'));
    await aberto('958,60');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(formSalvo(m).valor).toBe(958.6);
    expect('valor_do_mes' in formSalvo(m)).toBe(false);
  });
});

describe('prova 4 — "Voltar ao previsto"', () => {
  it('confirma dizendo os dois valores e as duas datas; o salvar leva o valor base, o vencimento da regra e "limpar"', async () => {
    const m = montar(marcada('manual', { data_vencimento: '2026-11-12' }));
    await aberto('958,60');
    await waitFor(() => expect(gesto()?.disabled).toBe(false));
    fireEvent.click(gesto() as HTMLButtonElement);
    const texto = semDuro((await screen.findByTestId('confirmar-voltar-ao-previsto')).textContent);
    expect(texto).toContain('R$ 958,60');
    expect(texto).toContain('R$ 888,49');
    expect(texto).toContain('12/11/2026');
    expect(texto).toContain('05/11/2026');
    expect(m.onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirmar-voltar-ao-previsto-ok'));
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(formSalvo(m)).toMatchObject({ valor: 888.49, data_vencimento: '2026-11-05', valor_do_mes: 'limpar' });
  });
  it('"Não voltar" não grava', async () => {
    const m = montar(marcada('manual'));
    await aberto('958,60');
    await waitFor(() => expect(gesto()?.disabled).toBe(false));
    fireEvent.click(gesto() as HTMLButtonElement);
    await screen.findByTestId('confirmar-voltar-ao-previsto');
    fireEvent.click(screen.getByText('Não voltar'));
    await assentar();
    expect(m.onSave).not.toHaveBeenCalled();
  });
  it('conta paga: o gesto fica APAGADO com o motivo escrito, e o clique não abre nada', async () => {
    montar(marcada('manual', { status_transacao: 'realizado', data_pagamento: '2026-11-05' }));
    await waitFor(() => expect(campo().value).toBe('958,60'));
    await assentar();
    expect(gesto()).not.toBeNull();
    expect(gesto()?.disabled).toBe(true);
    expect(gesto()?.getAttribute('title')).toBe('Conta já paga.');
    expect(screen.getByTestId('acao-voltar-ao-previsto-motivo').textContent).toBe('Conta já paga.');
    fireEvent.click(gesto() as HTMLButtonElement);
    expect(screen.queryByTestId('confirmar-voltar-ao-previsto')).toBeNull();
    /* a linha da marcada continua lá */
    expect(linha()?.getAttribute('data-estado')).toBe('marcada');
  });
  it('conta que vai ser gravada como realizada não é marcada, mesmo com o valor mudado', async () => {
    const m = montar(ocorrencia({ status_transacao: 'realizado', data_pagamento: '2026-11-05' }));
    await aberto('888,49');
    digitar('95860');
    await assentar();
    expect(linha()).toBeNull();
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(formSalvo(m).valor).toBe(958.6);
    expect('valor_do_mes' in formSalvo(m)).toBe(false);
  });
});

describe('prova 5 — lançamento comum: nada muda', () => {
  it('edição com o valor mudado: sem linha, sem gesto, sem consulta à regra, e o form sem a chave', async () => {
    const m = montar(ocorrencia({ recorrencia_id: null, origem_lancamento: 'manual' }));
    await aberto('888,49');
    digitar('95860');
    await assentar();
    expect(linha()).toBeNull();
    expect(gesto()).toBeNull();
    expect(banco.consultasDaRegra).toBe(0);
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(formSalvo(m).valor).toBe(958.6);
    expect('valor_do_mes' in formSalvo(m)).toBe(false);
  });
  it('lançamento novo: sem consulta à regra, sem linha', async () => {
    montar(null);
    await waitFor(() => expect(campo().value).toBe('0,00'));
    await assentar();
    expect(linha()).toBeNull();
    expect(banco.consultasDaRegra).toBe(0);
  });
});
