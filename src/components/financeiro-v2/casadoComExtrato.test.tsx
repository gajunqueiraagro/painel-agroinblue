/**
 * FIN-CONCILIADO-NAO-REBAIXA-01 — lançamento casado com o extrato não sai do estado em que o banco o pôs.
 *
 * ⚠ O `LancamentoV2Dialog` É MONTADO DE VERDADE; só as bordas são falsas. O banco falso responde UMA pergunta — "está casado?"
 *   (`fn_lancamento_casado_com_extrato`) — e CONTA quantas vezes foi perguntado. A recusa do gatilho é provada no teste SQL
 *   (`supabase/tests/fin_conciliado_nao_rebaixa_01_test.sql`); aqui, o que a TELA oferece e o que ela escreve.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LancamentoV2, LancamentoV2Form, ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import {
  camposTravadosDoCasado, saiDoEstadoDoBanco, FRASE_CASADO_COM_EXTRATO, NADA_TRAVADO, type EstadoDoBanco,
} from '@/lib/financeiro/casadoComExtrato';

const banco = vi.hoisted(() => ({ casado: false, perguntas: [] as string[] }));
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
      rpc: async (nome: string, args: { p_lancamento_id?: string }) => {
        if (nome === 'fn_lancamento_casado_com_extrato') { banco.perguntas.push(args.p_lancamento_id ?? ''); return { data: banco.casado, error: null }; }
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { LancamentoV2Dialog } from './LancamentoV2Dialog';

const FAZENDAS = [{ id: 'f-pur', nome: 'Faz. Pureza' }] as Fazenda[];
const conta = (id: string, nome: string): ContaBancariaV2 => ({ id, nome_conta: nome, banco: nome, fazenda_id: 'f-pur', tipo_conta: null, codigo_conta: null, nome_exibicao: nome, agencia: null, numero_conta: null, conta_digito: null });
const CONTAS = [conta('bb', 'Banco do Brasil'), conta('itau', 'Itau')];
const FORN = { id: 'forn', nome: 'Fornecedor Exemplo', cpf_cnpj: null, fazenda_id: null, ativo: true, tipo_recebimento: null } as FornecedorV2;
const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-sai', subcentro: 'Salários Pecuária', centro_custo: 'Folha', grupo_custo: 'Pessoal', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-ent', subcentro: 'Venda de Bezerros', centro_custo: 'Vendas', grupo_custo: 'Receita', macro_custo: 'Receita Operacional', tipo_operacao: '1-Entradas', escopo_negocio: 'pecuaria' },
];
/** Uma saída REALIZADA em 02/10, de 500,00, na conta Banco do Brasil. */
const saida = (extra: Record<string, unknown> = {}) => ({
  id: 'lanc-1', cliente_id: 'cli', fazenda_id: 'f-pur', conta_bancaria_id: 'bb', data_competencia: '2026-10-01', data_pagamento: '2026-10-02',
  data_vencimento: '2026-10-02', valor: 500, sinal: -1, tipo_operacao: '2-Saídas', status_transacao: 'realizado',
  descricao: 'Folha', macro_custo: 'Custeio Produtivo', grupo_custo: 'Pessoal', centro_custo: 'Folha',
  subcentro: 'Salários Pecuária', escopo_negocio: 'pecuaria', observacao: null, ano_mes: '2026-10', documento: null, historico: null,
  numero_documento: null, favorecido_id: 'forn', conta_destino_id: null, origem_lancamento: 'manual', lote_importacao_id: null,
  forma_pagamento: 'Boleto', dados_pagamento: null, cancelado: false, conciliado_em: null, editado_manual: false,
  created_by: 'u1', created_at: '2026-09-10T12:00:00Z', updated_at: '2026-09-10T12:00:00Z', plano_conta_id: 'pl-sai', ...extra,
}) as unknown as LancamentoV2;
const entrada = () => saida({
  tipo_operacao: '1-Entradas', sinal: 1, conta_bancaria_id: null, conta_destino_id: 'bb', plano_conta_id: 'pl-ent',
  subcentro: 'Venda de Bezerros', centro_custo: 'Vendas', grupo_custo: 'Receita', macro_custo: 'Receita Operacional',
});

function montar(lancamento: LancamentoV2 | null) {
  const onSave = vi.fn(async (_form: LancamentoV2Form, _id?: string): Promise<boolean | string> => true);
  const r = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>
      <LancamentoV2Dialog open onClose={() => {}} onSave={onSave} lancamento={lancamento}
        fazendas={FAZENDAS} contas={CONTAS} classificacoes={CLASSIF} fornecedores={[FORN]} safras={[]}
        onCriarFornecedor={async () => null} />
    </MemoryRouter></QueryClientProvider>,
  );
  return { ...r, onSave };
}
const campoValor = () => document.querySelector('input[tabindex="10"]') as HTMLInputElement;
const campoPagamento = () => document.querySelector('input[tabindex="3"]') as HTMLInputElement;
const campoStatus = () => document.querySelector('button[tabindex="4"]') as HTMLButtonElement;
const botaoSalvar = () => document.querySelector('button[tabindex="17"]') as HTMLButtonElement;
const campoConta = (rotulo: string) => {
  const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent === rotulo);
  return label?.parentElement?.querySelector('button[role="combobox"]') as HTMLButtonElement | null;
};
const frase = () => screen.queryByTestId('casado-com-extrato');
const assentar = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
async function aberto(valor: string) {
  await waitFor(() => expect(campoValor().value).toBe(valor));
  await waitFor(() => expect(botaoSalvar().hasAttribute('disabled')).toBe(false));
  await assentar();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T12:00:00') });
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  banco.casado = false;
  banco.perguntas = [];
});

describe('a regra (espelho da condição do gatilho)', () => {
  const g: EstadoDoBanco = { status_transacao: 'realizado', data_pagamento: '2026-10-02', valor: 500, tipo_operacao: '2-Saídas', conta_bancaria_id: 'bb', conta_destino_id: null };
  it('regravar os mesmos valores não sai do estado; a conta vem pela direção, como o banco grava', () => {
    expect(saiDoEstadoDoBanco(g, { ...g })).toBe(false);
    expect(saiDoEstadoDoBanco(g, { ...g, status_transacao: 'conciliado', data_pagamento: '2026-10-02T00:00:00' })).toBe(false);
    /* saída mandada só com a conta no destino: o banco a leva para a origem */
    expect(saiDoEstadoDoBanco(g, { ...g, conta_bancaria_id: null, conta_destino_id: 'bb' })).toBe(false);
  });
  it('cada saída do estado é vista: status, pagamento nulo, outra data, valor (um centavo), conta', () => {
    expect(saiDoEstadoDoBanco(g, { ...g, status_transacao: 'previsto' })).toBe(true);
    expect(saiDoEstadoDoBanco(g, { ...g, data_pagamento: null })).toBe(true);
    expect(saiDoEstadoDoBanco(g, { ...g, data_pagamento: '2026-10-03' })).toBe(true);
    expect(saiDoEstadoDoBanco(g, { ...g, valor: 500.01 })).toBe(true);
    expect(saiDoEstadoDoBanco(g, { ...g, conta_bancaria_id: 'itau' })).toBe(true);
    expect(saiDoEstadoDoBanco(g, { ...g, conta_bancaria_id: null })).toBe(true);
    /* trocar o tipo para entrada tira a conta da origem */
    expect(saiDoEstadoDoBanco(g, { ...g, tipo_operacao: '1-Entradas' })).toBe(true);
  });
  it('a PROMOÇÃO não é saída: programado sem data -> realizado com data', () => {
    const parcial: EstadoDoBanco = { ...g, status_transacao: 'programado', data_pagamento: null };
    expect(saiDoEstadoDoBanco(parcial, { ...parcial, status_transacao: 'realizado', data_pagamento: '2026-10-09' })).toBe(false);
    expect(saiDoEstadoDoBanco(parcial, { ...parcial, status_transacao: 'agendado' })).toBe(false);
    expect(saiDoEstadoDoBanco(parcial, { ...parcial, valor: 400 })).toBe(true);
  });
  it('entrada e transferência: a conta protegida é a que está gravada', () => {
    const e: EstadoDoBanco = { ...g, tipo_operacao: '1-Entradas', conta_bancaria_id: null, conta_destino_id: 'bb' };
    expect(saiDoEstadoDoBanco(e, { ...e })).toBe(false);
    expect(saiDoEstadoDoBanco(e, { ...e, conta_destino_id: 'itau' })).toBe(true);
    const t: EstadoDoBanco = { ...g, tipo_operacao: '3-Transferências', conta_bancaria_id: 'bb', conta_destino_id: 'itau' };
    expect(saiDoEstadoDoBanco(t, { ...t })).toBe(false);
    expect(saiDoEstadoDoBanco(t, { ...t, conta_destino_id: null })).toBe(true);
  });
  it('campos em leitura: nada sem estar casado; casado, só o que o banco recusa mudar', () => {
    expect(camposTravadosDoCasado(false, g)).toEqual(NADA_TRAVADO);
    expect(camposTravadosDoCasado(true, null)).toEqual(NADA_TRAVADO);
    expect(camposTravadosDoCasado(true, g)).toEqual({ status: true, pagamento: true, valor: true, contaOrigem: true, contaDestino: false });
    expect(camposTravadosDoCasado(true, { ...g, status_transacao: 'programado', data_pagamento: null }))
      .toEqual({ status: false, pagamento: false, valor: true, contaOrigem: true, contaDestino: false });
  });
});

describe('o modal — lançamento CASADO', () => {
  it('status, pagamento, valor e a conta ficam em leitura, com a frase no rodapé; UMA pergunta ao banco', async () => {
    banco.casado = true;
    montar(saida());
    await aberto('500,00');
    await waitFor(() => expect(frase()).not.toBeNull());
    expect(frase()?.textContent).toBe(FRASE_CASADO_COM_EXTRATO);
    expect(frase()?.getAttribute('title')).toBe(FRASE_CASADO_COM_EXTRATO);
    expect(frase()?.className).toContain('truncate');
    expect(campoStatus().disabled).toBe(true);
    expect(campoPagamento().disabled).toBe(true);
    expect(campoValor().disabled).toBe(true);
    expect(campoConta('Conta Origem *')?.disabled).toBe(true);
    expect(banco.perguntas).toEqual(['lanc-1']);
  });
  it('salvar sem tocar no que é do banco GRAVA, sem segunda pergunta', async () => {
    banco.casado = true;
    const m = montar(saida());
    await aberto('500,00');
    await waitFor(() => expect(frase()).not.toBeNull());
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(m.onSave.mock.calls[0][0]).toMatchObject({ status_transacao: 'realizado', data_pagamento: '2026-10-02', valor: 500, conta_bancaria_id: 'bb' });
    expect(screen.queryByTestId('erro-antes-de-salvar')).toBeNull();
    expect(banco.perguntas).toHaveLength(1);
  });
  it('parcial casado ainda programado: status e pagamento seguem a regra de sempre; valor e conta em leitura', async () => {
    banco.casado = true;
    montar(saida({ status_transacao: 'programado', data_pagamento: null }));
    await aberto('500,00');
    await waitFor(() => expect(frase()).not.toBeNull());
    expect(campoStatus().disabled).toBe(false);
    expect(campoValor().disabled).toBe(true);
    expect(campoConta('Conta Origem *')?.disabled).toBe(true);
  });
  it('entrada casada: a conta em leitura é a de destino', async () => {
    banco.casado = true;
    montar(entrada());
    await aberto('500,00');
    await waitFor(() => expect(frase()).not.toBeNull());
    expect(campoConta('Conta Destino *')?.disabled).toBe(true);
    expect(campoValor().disabled).toBe(true);
  });
});

describe('o modal — lançamento NÃO casado', () => {
  it('tudo livre e nenhuma frase', async () => {
    montar(saida());
    await aberto('500,00');
    expect(frase()).toBeNull();
    expect(campoStatus().disabled).toBe(false);
    expect(campoPagamento().disabled).toBe(false);
    expect(campoValor().disabled).toBe(false);
    expect(campoConta('Conta Origem *')?.disabled).toBe(false);
    expect(banco.perguntas).toEqual(['lanc-1']);
  });
  it('mudar o valor e salvar: o banco é perguntado de novo, segue não casado, e GRAVA', async () => {
    const m = montar(saida());
    await aberto('500,00');
    fireEvent.change(campoValor(), { target: { value: '48000' } });
    expect(campoValor().value).toBe('480,00');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(m.onSave.mock.calls[0][0]).toMatchObject({ valor: 480 });
    expect(banco.perguntas).toHaveLength(2);
  });
  it('salvar sem mexer em status, pagamento, valor nem conta não pergunta de novo', async () => {
    const m = montar(saida());
    await aberto('500,00');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(m.onSave).toHaveBeenCalledTimes(1));
    expect(banco.perguntas).toHaveLength(1);
  });
  it('lançamento NOVO não pergunta nada', async () => {
    montar(null);
    await assentar();
    expect(banco.perguntas).toEqual([]);
    expect(frase()).toBeNull();
  });
});

describe('casou em outra aba depois de o modal abrir', () => {
  it('o salvar que tiraria o lançamento do estado NÃO grava e escreve a frase ao lado do botão', async () => {
    const m = montar(saida());
    await aberto('500,00');
    expect(frase()).toBeNull();
    banco.casado = true;
    fireEvent.change(campoValor(), { target: { value: '48000' } });
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(screen.queryByTestId('erro-antes-de-salvar')).not.toBeNull());
    expect(screen.getByTestId('erro-antes-de-salvar').textContent).toBe(FRASE_CASADO_COM_EXTRATO);
    expect(m.onSave).not.toHaveBeenCalled();
    /* e a tela passa a saber: os campos fecham */
    await waitFor(() => expect(campoValor().disabled).toBe(true));
    expect(frase()).not.toBeNull();
  });
});

describe('a ligação (fonte)', () => {
  const fonte = (arq: string) => readFileSync(resolve(__dirname, arq), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');
  const modal = fonte('./LancamentoV2Dialog.tsx');
  it('"está casado?" só é perguntado ao dono, pela lib; o modal não lê a tabela de vínculos', () => {
    expect(modal).not.toContain('conciliacao_bancaria_itens');
    expect(modal).not.toContain('fn_lancamento_casado_com_extrato');
    expect(fonte('../../lib/financeiro/casadoComExtrato.ts').match(/fn_lancamento_casado_com_extrato/g)).toHaveLength(1);
  });
  it('a frase é a do dono, escrita pela tela (não depende da mensagem do banco)', () => {
    expect(modal).toContain('setErroAntesDeSalvar(FRASE_CASADO_COM_EXTRATO);');
    expect(modal.match(/data-testid="casado-com-extrato"/g)).toHaveLength(1);
  });
});
