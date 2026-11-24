// APROVAR-PAGAMENTOS-V3 — a tela própria do aprovador: uma ida ao banco (`fn_aprovacao_lista_v3`), as abas com N e o total, o filtro, a coluna
// Pronto em texto humano, a barra SEMPRE com "Aprovar N", e o painel: a NF em PDF + XML = UMA aba, e a aba Pagamento do Pix com o "confere".
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const banco = vi.hoisted(() => ({ rpc: vi.fn(), tabelas: {} as Record<string, unknown[]>, pedidos: [] as string[] }));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (t: string) => {
    const c: Record<string, unknown> = {};
    for (const k of ['select', 'eq', 'in', 'neq', 'order', 'limit', 'is', 'lt']) c[k] = () => c;
    c.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => ok({ data: banco.tabelas[t] ?? [], error: null });
    return c;
  };
  return { supabase: { rpc: banco.rpc, from: (t: string) => { banco.pedidos.push(t); return cadeia(t); }, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli', nome: 'Cliente Sintético' }, clientes: [] }) }));
vi.mock('@/hooks/useLarguraDaJanela', () => ({ useLarguraDaJanela: () => 1280 }));
vi.mock('@/hooks/useAlturaAteOFim', () => ({ useAlturaAteOFim: () => ({ ref: () => {}, altura: 500 }) }));
vi.mock('@/hooks/useParcelasDosLancamentos', () => ({ useParcelasDosLancamentos: () => ({ data: new Map([['b', { numero: 3, total: 8 }]]) }) }));
vi.mock('@/components/financeiro-v2/VisualizadorDeDocumento', () => ({ VisualizadorDeDocumento: () => <div data-testid="visualizador" /> }));
const docs = vi.hoisted(() => ({ lista: [] as Record<string, unknown>[] }));
vi.mock('@/hooks/useLancamentoDocumentos', () => ({
  useLancamentoDocumentos: () => ({ documentos: docs.lista, confronto: { docsAtivos: 2, confere: true, diferenca: 0 }, urlAssinada: async () => null }),
}));

import { AprovarPagamentosV3 } from './AprovarPagamentosV3';

const linha = (o: Record<string, unknown>) => ({
  lancamento_id: 'a', vencimento: '2026-12-04', status: 'programado', aba: 'aprovar', fornecedor: 'Aguimar Sintético Ltda', favorecido_id: 'f1',
  descricao: 'Eixo interno', valor: -1176, forma: 'PIX', nf: '78728', conta: 'Banco Alfa', subcentro: 'Manutenção', financiamento_id: null,
  recorrencia_id: null, estado: 'aguardando', motivo: null, posso_decidir: true, lancado_por: 'u2', lancado_em: '2026-10-19T12:00:00Z',
  documento_pedido: 'nota', pronto: 'pronto',
  pagamento: { forma: 'PIX', chave: '00196816000132', tipo_chave: 'CNPJ', titular: 'Aguimar Sintético Ltda', doc_pagamento: '00196816000132',
    doc_fornecedor: '00196816000132', boleto_anexado: false, emitente_nf_doc: '00196816000132' },
  ...o,
});
const LISTA = [
  linha({}),
  linha({ lancamento_id: 'b', vencimento: '2026-12-05', fornecedor: 'Repro Sintética', descricao: 'Sêmen Bovino 3/8', valor: -3006.5, forma: 'Boleto',
    nf: '18112', pronto: 'pronto', pagamento: { forma: 'Boleto', boleto_anexado: true } }),
  linha({ lancamento_id: 'c', vencimento: '2026-12-05', fornecedor: 'Contador Sintético', descricao: 'Contabilidade', valor: -437.67, nf: null,
    pronto: 'falta_recibo', recorrencia_id: 'r1', posso_decidir: false }),
  linha({ lancamento_id: 'd', vencimento: '2026-12-06', aba: 'aprovados', estado: 'aprovado', posso_decidir: false }),
];

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AprovarPagamentosV3 /></QueryClientProvider>);
}

beforeEach(() => {
  banco.rpc.mockReset(); banco.pedidos.length = 0;
  banco.tabelas = { financeiro_bpo_config: [{ ativo: true }], financeiro_lancamentos_v2: [] };
  banco.rpc.mockImplementation(async (fn: string) => (fn === 'fn_aprovacao_lista_v3' ? { data: LISTA, error: null }
    : fn === 'fn_nomes_dos_autores' ? { data: [{ user_id: 'u2', nome: 'Amanda Exemplo', email: null, situacao: 'membro ativo' }], error: null }
      : { data: { ok: true, n: 1, total: 1176 }, error: null }));
  docs.lista = [];
});

describe('AprovarPagamentosV3', () => {
  it('uma ida: fn_aprovacao_lista_v3 com o mês; as abas com N e o total; o Pronto em texto humano', async () => {
    montar();
    await screen.findByText('Aguimar Sintético Ltda');
    const pedido = banco.rpc.mock.calls.find((c) => c[0] === 'fn_aprovacao_lista_v3');
    expect(pedido?.[1]).toMatchObject({ p_cliente: 'cli' });
    expect(String(pedido?.[1].p_de)).toMatch(/^\d{4}-\d{2}-01$/);
    const abaAprovar = screen.getByRole('button', { name: /Para aprovar/ });
    expect(abaAprovar.textContent).toContain('3');
    expect(abaAprovar.textContent).toContain('4.620,17');
    const linhas = screen.getAllByTestId('v3-linha');
    expect(linhas).toHaveLength(3);
    expect(within(linhas[0]).getByTestId('v3-pronto').textContent).toBe('pronto ✓');
    expect(within(linhas[2]).getByTestId('v3-pronto').textContent).toBe('falta recibo');
    expect(document.body.textContent).not.toContain('falta_');
    expect(screen.getAllByTestId('v3-dia').map((d) => d.textContent)).toEqual([
      expect.stringContaining('sex · 04/12 · 1 conta'), expect.stringContaining('sáb · 05/12 · 2 contas')]);
  });

  it('a linha: valor negativo em negrito, sigla da forma, NF com milhar ou "—", selo da parcela e do R', async () => {
    montar();
    const linhas = await screen.findAllByTestId('v3-linha');
    expect(linhas[1].textContent).toContain('−R$ 3.006,50');
    expect(linhas[1].textContent).toContain('Bol');
    expect(linhas[1].textContent).toContain('18.112');
    expect(linhas[1].textContent).toContain('3/8');
    expect(linhas[1].textContent).toContain('Sêmen Bovino');
    expect(within(linhas[2]).getByTitle('Recorrência').textContent).toBe('R');
    expect(within(linhas[2]).getAllByRole('cell')[6].textContent).toBe('—');
  });

  it('a barra fica SEMPRE à vista com "Aprovar" e "Recusar…" (sem nada marcado: desligados); marcar soma o total', async () => {
    montar();
    await screen.findAllByTestId('v3-linha');
    expect(screen.getByTestId('bpo-aprovar')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('bpo-recusar')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('v3-legenda').textContent).toContain('Bol boleto');
    const caixas = screen.getAllByRole('checkbox', { name: /Selecionar (Aguimar|Repro)/ });
    fireEvent.click(caixas[0]); fireEvent.click(caixas[1]);
    expect(screen.getByTestId('bpo-aprovar').textContent).toBe('Aprovar 2');
    expect(screen.getByTestId('bpo-barra-total').textContent).toContain('4.182,50');
    expect(screen.getByRole('checkbox', { name: 'Selecionar Contador Sintético' })).toHaveProperty('disabled', true);
  });

  it('o filtro Faltando mostra só o que falta; a aba Aprovados não tem caixa', async () => {
    montar();
    await screen.findAllByTestId('v3-linha');
    fireEvent.click(screen.getByRole('button', { name: /^Faltando/ }));
    expect(screen.getAllByTestId('v3-linha')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Aprovados/ }));
    await waitFor(() => expect(screen.getAllByTestId('v3-linha')).toHaveLength(1));
  });

  it('o painel: a NF em PDF + XML = UMA aba; a aba Pagamento do Pix mostra a chave e o "confere"', async () => {
    const base = { origem: 'lancamento', operacaoId: null, especieOC: null, serie: null, dataEmissao: null, valorDocumento: 1176, tamanhoBytes: 1,
      observacao: null, emitenteId: null, emitenteNome: null, emitenteDocumento: '00196816000132', cancelado: false, canceladoMotivo: null, versao: 1, ligadoAQtd: 1 };
    docs.lista = [
      { ...base, id: 'p', especie: 'nf', nome: 'NF 78728.pdf', numero: '78728', chaveAcesso: null, url: 'x/a.pdf', tipo: 'application/pdf' },
      { ...base, id: 'x', especie: 'nf', nome: 'NFe78728.xml', numero: '000078728', chaveAcesso: null, url: 'x/a.xml', tipo: 'text/xml' },
    ];
    montar();
    const linhas = await screen.findAllByTestId('v3-linha');
    fireEvent.click(linhas[0]);
    const painel = await screen.findByTestId('v3-painel');
    const abas = within(within(painel).getByTestId('v3-abas-documento')).getAllByRole('button').map((b) => b.textContent);
    expect(abas).toEqual(['NF 78.728', 'Pagamento']);
    fireEvent.click(within(painel).getByTestId('v3-aba-pagamento-botao'));
    const pg = within(painel).getByTestId('v3-aba-pagamento');
    expect(pg.textContent).toContain('Pix · chave CNPJ');
    expect(pg.textContent).toContain('00196816000132');
    expect(pg.textContent).toContain('confere ✓ igual ao fornecedor da NF 78.728');
    expect(within(painel).getByText('1 de 3')).toBeTruthy();
  });

  it('DÉBITO AUTOMÁTICO: sai de Para aprovar (nem no total) e aparece em Aprovados como "aprovado · DA", com o aviso de > 20%', async () => {
    banco.rpc.mockImplementation(async (fn: string) => (fn === 'fn_aprovacao_lista_v3'
      ? { data: [...LISTA, linha({ lancamento_id: 'e', fornecedor: 'Energia Sintética', favorecido_id: 'f9', forma: 'Débito Automático', valor: -1300, nf: null,
          pagamento: { forma: 'Débito Automático' } })], error: null }
      : { data: [], error: null }));
    banco.tabelas.financeiro_lancamentos_v2 = [{ favorecido_id: 'f9', data_pagamento: '2026-11-07', valor: -1000 }];
    montar();
    await screen.findByText('Aguimar Sintético Ltda');
    const abaAprovar = screen.getByRole('button', { name: /Para aprovar/ });
    expect(abaAprovar.textContent).toContain('4.620,17');
    expect(screen.queryByText('Energia Sintética')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Aprovados/ }));
    const linhaDa = (await screen.findAllByTestId('v3-linha')).find((l) => (l.textContent ?? '').includes('Energia Sintética'));
    if (!linhaDa) throw new Error('a linha do DA não está em Aprovados');
    expect(within(linhaDa).getByTestId('v3-pronto').textContent).toBe('aprovado · DA');
    expect(within(linhaDa).getByTestId('v3-variacao').textContent).toBe('+30%');
    expect(within(linhaDa).getByTestId('v3-variacao').getAttribute('title')).toContain('R$ 1.000,00');
    expect(within(linhaDa).queryByRole('checkbox')).toBeNull();
  });

  it('BPO desligado: a tela diz, e a lista nem é pedida', async () => {
    banco.tabelas.financeiro_bpo_config = [];
    montar();
    await screen.findByTestId('v3-desligado');
    expect(banco.rpc.mock.calls.some((c) => c[0] === 'fn_aprovacao_lista_v3')).toBe(false);
  });
});
