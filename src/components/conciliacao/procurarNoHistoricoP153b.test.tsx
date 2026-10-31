/**
 * P153b (Gabriel 29/10) — o "Procurar no histórico" com TODOS os status: o EM ABERTO se casa ("Casar"; de outra conta, "Casar e trocar
 * conta"), o pago/conciliado é modelo ("Criar igual"; de outra conta, o selo "outra conta" — nunca casa); as colunas da casa
 * (Comp. · Venc. · Pgto. · Descrição · Fornecedor · Subcentro · Faz. · Conta · Valor · Status · ação), a mais recente primeiro, toda
 * coluna ordena (↑↓); o "até" = fim do mês seguinte ao extrato. SINTÉTICO — o caso da Guariroba (BB 07/10, −142,72).
 * ⚠ A RPC É FALSA AQUI: quem prova o banco é a migration 20261028115100 (ensaiada no proto, a busca com todos os status).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  lerResultado, acaoDoAchado, ordenarAchados, proximaOrdem, fimDoMesSeguinte, ORDEM_PADRAO, type AchadoDoHistorico,
} from '@/lib/conciliacao/procurarNoHistorico';

const M = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: M.rpc } }));

import { ProcurarNoHistorico } from './ProcurarNoHistorico';

const BB = 'bb';
const linha = (o: Record<string, unknown>) => ({
  lancamento_id: 'x', data_pagamento: null, data_vencimento: '2031-10-09', data_competencia: '2031-10-01', status_transacao: 'previsto',
  conciliado: false, banco: null, descricao: 'Agua e Esgoto - Escritorio', fornecedor_id: 'gua', fornecedor: 'Aguas Guariroba SA',
  plano_conta_id: 'p1', centro: 'Administração', subcentro: 'Água e Esgoto', fazenda_id: 'fz1', fazenda: 'Administrativo',
  fazenda_codigo: 'ADM', conta_bancaria_id: BB, conta: 'Banco do Brasil', valor: -500, onde: ['fornecedor'], ...o,
});
const RESPOSTA = {
  total: 4, resumo: null, achados: [
    linha({ lancamento_id: 'aberto-bb' }),
    linha({ lancamento_id: 'aberto-itau', data_vencimento: '2031-10-10', conta_bancaria_id: 'itau', conta: 'Itaú Personalité' }),
    linha({ lancamento_id: 'pago-bb', status_transacao: 'realizado', data_pagamento: '2031-09-08', data_vencimento: '2031-09-09', valor: -136.53, conciliado: true }),
    linha({ lancamento_id: 'pago-itau', status_transacao: 'realizado', data_pagamento: '2031-08-08', data_vencimento: '2031-08-09',
      conta_bancaria_id: 'itau', conta: 'Itaú Personalité', valor: -98.1 }),
  ],
};
const MOV = { data: '2031-10-07', historico: 'PAGAMENTO FATURA DE ÁGUA - AGUAS GUARIROBA SA', valor: -142.72 };
const achados = (): AchadoDoHistorico[] => lerResultado(RESPOSTA)?.achados ?? [];
const porId = (id: string) => { const a = achados().find((x) => x.lancamentoId === id); if (!a) throw new Error(id); return a; };

beforeEach(() => { M.rpc.mockReset().mockResolvedValue({ data: RESPOSTA, error: null }); });

describe('a regra pura', () => {
  it('a ação da linha: em aberto da mesma conta = Casar; de outra = Casar e trocar; pago = Criar igual; sem quem case = Criar igual', () => {
    expect(acaoDoAchado(porId('aberto-bb'), BB, true)).toBe('casar');
    expect(acaoDoAchado(porId('aberto-itau'), BB, true)).toBe('casar_trocando_conta');
    expect(acaoDoAchado(porId('pago-bb'), BB, true)).toBe('criar_igual');
    expect(acaoDoAchado(porId('pago-itau'), BB, true)).toBe('criar_igual');
    expect(acaoDoAchado(porId('aberto-bb'), BB, false)).toBe('criar_igual');
    /* sem conta no lançamento não é "outra": o casar de hoje a preenche */
    expect(acaoDoAchado({ ...porId('aberto-itau'), contaId: null }, BB, true)).toBe('casar');
  });

  it('a mais recente primeiro (pagamento, ou o vencimento de quem não foi pago); a mesma coluna inverte; o vazio vai para o fim', () => {
    expect(ordenarAchados(achados(), ORDEM_PADRAO).map((a) => a.lancamentoId)).toEqual(['aberto-itau', 'aberto-bb', 'pago-bb', 'pago-itau']);
    const porValor = proximaOrdem(ORDEM_PADRAO, 'valor');
    expect(porValor).toEqual({ coluna: 'valor', sentido: 'desc' });
    expect(ordenarAchados(achados(), porValor).map((a) => a.valor)).toEqual([-98.1, -136.53, -500, -500]);
    expect(proximaOrdem(porValor, 'valor')).toEqual({ coluna: 'valor', sentido: 'asc' });
    expect(proximaOrdem(ORDEM_PADRAO, 'fornecedor')).toEqual({ coluna: 'fornecedor', sentido: 'asc' });
    const semPgto = ordenarAchados(achados(), { coluna: 'pgto', sentido: 'asc' }).map((a) => a.lancamentoId);
    expect(semPgto.slice(2)).toEqual(['aberto-bb', 'aberto-itau']);
  });

  it('o "até" da busca: o fim do mês SEGUINTE ao extrato (inclusive na virada do ano)', () => {
    expect(fimDoMesSeguinte('2031-10-07')).toBe('2031-11-30');
    expect(fimDoMesSeguinte('2031-12-15')).toBe('2032-01-31');
    expect(fimDoMesSeguinte('2032-01-31')).toBe('2032-02-29');
    expect(fimDoMesSeguinte(null)).toBeNull();
  });
});

describe('o componente', () => {
  const montar = (onCasar = vi.fn()) => {
    render(<ProcurarNoHistorico clienteId="cli" movimento={MOV} onCriarIgual={vi.fn()} onCasar={onCasar}
      contaDoExtrato={{ id: BB, nome: 'Banco do Brasil' }} />);
    fireEvent.click(screen.getByTestId('procurar-historico-botao'));
    return onCasar;
  };

  it('as colunas da casa, na ordem; o "até" vai como o fim do mês seguinte', async () => {
    montar();
    await screen.findAllByTestId('procurar-historico-achado');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[↑↓]/g, ''))).toEqual(
      ['Comp.', 'Venc.', 'Pgto.', 'Descrição', 'Fornecedor', 'Subcentro', 'Faz.', 'Conta', 'Valor', 'Status', '']);
    expect(M.rpc.mock.calls[0][1]).toMatchObject({ p_ate: '2031-11-30', p_de: '2031-01-01' });
    /* a ordem padrão diz ↓ em lugar nenhum (é a data de referência), e a coluna clicada mostra a seta */
    fireEvent.click(screen.getByTestId('procurar-ordenar-valor'));
    expect(screen.getByTestId('procurar-ordenar-valor').textContent).toBe('Valor↓');
    fireEvent.click(screen.getByTestId('procurar-ordenar-valor'));
    expect(screen.getByTestId('procurar-ordenar-valor').textContent).toBe('Valor↑');
  });

  it('cada linha: a ação, o selo "outra conta", a fazenda pelo CÓDIGO e o status (conciliado)', async () => {
    montar();
    const linhas = await screen.findAllByTestId('procurar-historico-achado');
    expect(linhas.map((l) => l.getAttribute('data-acao'))).toEqual(['casar_trocando_conta', 'casar', 'criar_igual', 'criar_igual']);
    expect(within(linhas[0]).getByTestId('procurar-casar-trocando').getAttribute('title')).toBe('Casar e trocar a conta para Banco do Brasil');
    expect(within(linhas[0]).getByTestId('procurar-outra-conta').textContent).toBe('outra conta');
    expect(within(linhas[1]).queryByTestId('procurar-outra-conta')).toBeNull();
    expect(within(linhas[3]).getByTestId('procurar-outra-conta')).toBeInTheDocument();
    expect(within(linhas[1]).getByTitle('Administrativo').textContent).toBe('ADM');
    expect(within(linhas[2]).getByText('Conciliado')).toBeInTheDocument();
    expect(within(linhas[2]).getByText('08/09/2031')).toBeInTheDocument();
  });

  it('"Casar" e "Casar e trocar conta" entregam o achado e se é para trocar a conta', async () => {
    const onCasar = montar();
    const linhas = await screen.findAllByTestId('procurar-historico-achado');
    fireEvent.click(within(linhas[1]).getByTestId('procurar-casar'));
    expect(onCasar).toHaveBeenLastCalledWith(expect.objectContaining({ lancamentoId: 'aberto-bb' }), false);
    fireEvent.click(within(linhas[0]).getByTestId('procurar-casar-trocando'));
    expect(onCasar).toHaveBeenLastCalledWith(expect.objectContaining({ lancamentoId: 'aberto-itau' }), true);
  });

  it('sem quem case (a estação): tudo é "Criar igual", como antes', async () => {
    render(<ProcurarNoHistorico clienteId="cli" movimento={MOV} onCriarIgual={vi.fn()} />);
    fireEvent.click(screen.getByTestId('procurar-historico-botao'));
    const linhas = await screen.findAllByTestId('procurar-historico-achado');
    expect(linhas.every((l) => l.getAttribute('data-acao') === 'criar_igual')).toBe(true);
  });
});
