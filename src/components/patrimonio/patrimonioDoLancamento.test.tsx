/**
 * LANC-PATRIMONIO-VINCULO-01 — o "Patrimônio" do rodapé MONTADO, com a API falsa (injetada pela prop, como a bancada do gate). Prende o
 * GESTO: nada grava antes do clique; a prévia é a do banco (`simular = true`); o Criar é UMA ida (`criarELigar`); a recusa do banco
 * para o botão e é escrita; o previsto não liga (D2); a parcela de contrato leva o contrato inteiro (D4); desligar pede o motivo.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));

import { PatrimonioDoLancamento } from './PatrimonioDoLancamento';
import type { PatrimonioDoLancamentoApi } from '@/lib/patrimonio/patrimonioDoLancamentoApi';
import type { ParteDoLancamento, PatrimonioDoLancamentoLido } from '@/lib/patrimonio/patrimonioDoLancamento';
import type { BemDaLista } from '@/lib/patrimonio/patrimonio';
import type { PreviaLigar } from '@/lib/patrimonio/patrimonioApi';

const parte = (o: Partial<ParteDoLancamento> = {}): ParteDoLancamento => ({
  parte_ordem: 1, partes_total: 1, valor: 3480, plano_conta_id: 'c-inst', macro_custo: 'Investimento na Fazenda', centro_custo: 'Pecuária',
  subcentro: 'Investimento em Instalações Pecuária', escopo_negocio: 'pecuaria', status_transacao: 'realizado', cancelado: false, fazenda_id: 'f1',
  data_pagamento: '2026-11-08', data_competencia: '2026-11-08', descricao: 'Inversor', de_contrato: false, ...o,
});
const bem = (o: Partial<BemDaLista>): BemDaLista => ({
  bem_id: 'b1', fazenda_id: 'f1', fazenda_codigo: 'FAZ-A', categoria_id: 'k-ins', categoria_codigo: 'instalacoes', categoria_nome: 'Instalações', deprecia: true,
  tem_mercado: false, tem_pastos: false, codigo: 'INS-031', descricao: 'Energia solar Curral', marca: null, modelo: null, identificacao: null, numero_proprio: null,
  placa: null, chassi: null, numero_serie: null, renavam: null, situacao: 'em_uso', em_uso_desde: null, baixado_em: null, atividade: 'pecuaria',
  origem_valor: 'lancamentos', valor_extra: 0, valor_lancamentos: 0, aquisicao: 18650, a_realizar: 0, n_lancamentos: 1, n_a_realizar: 0, n_a_conferir: 0,
  n_selo: 0, n_repetidas: 0, primeira_data: null, vida_util_meses: 240, residual_pct: 0, depreciacao_acumulada: 0, depreciacao_no_ano: 0, valor_contabil: 0,
  mercado_valor: null, mercado_data: null, mercado_base: null, area_pastos_ha: null, versao: 1, ...o,
});
const previa = (o: Partial<PreviaLigar> = {}): PreviaLigar => ({ ok: true, soma: 3480, n_ligar: 1, n_recusas: 0, n_repetidas: 0, itens: [], contratos: [], ...o });

let lido: PatrimonioDoLancamentoLido;
let api: { [K in keyof PatrimonioDoLancamentoApi]: Mock<PatrimonioDoLancamentoApi[K]> };
beforeEach(() => {
  lido = { partes: [parte()], vinculos: [] };
  api = {
    ler: vi.fn<PatrimonioDoLancamentoApi['ler']>(async () => ({ ok: true, dados: lido })),
    bens: vi.fn<PatrimonioDoLancamentoApi['bens']>(async () => ({ ok: true, dados: [bem({}), bem({ bem_id: 'b2', codigo: 'EQP-007', categoria_id: 'k-eqp', fazenda_id: 'f2', descricao: 'Inversor reserva' })] })),
    categorias: vi.fn<PatrimonioDoLancamentoApi['categorias']>(async () => [
      { id: 'k-ins', cliente_id: null, codigo: 'instalacoes', nome: 'Instalações', vida_util_anos: 20, residual_pct: 0, deprecia: true, tem_mercado: false,
        base_mercado: null, tem_pastos: false, ordem: 1, ativo: true, prefixo: 'INS', contas_sugeridas: ['c-inst'] },
    ]),
    ligar: vi.fn<PatrimonioDoLancamentoApi['ligar']>(async () => ({ ok: true, dados: previa() })),
    desligar: vi.fn<PatrimonioDoLancamentoApi['desligar']>(async () => ({ ok: true, dados: {} })),
    criarELigar: vi.fn<PatrimonioDoLancamentoApi['criarELigar']>(async (_b, _i, _c, simular) => ({ ok: true, dados: {
      ok: true, codigo: 'INS-032', id: simular ? null : 'novo', ligar: previa(), vida_util_meses: 240, residual_pct: 0 } })),
  };
});
const montar = () => render(<PatrimonioDoLancamento lancamentoId="L1" clienteId="C1" descricao="Inversor 2000W" valor={3480} fornecedor="Fornecedor X" api={api} />);
const gravacoes = () => [...api.ligar.mock.calls, ...api.criarELigar.mock.calls].filter((c) => c[3] === false).length;

describe('o rodapé', () => {
  it('(a) investimento sem bem: "Patrimônio" com o selo e o title do crédito de IBS/CBS', async () => {
    montar();
    const b = await screen.findByTestId('acao-patrimonio');
    expect(b.textContent).toContain('sem bem');
    expect(b.getAttribute('title')).toContain('crédito de IBS/CBS');
    expect(screen.getByTestId('selo-sem-bem').classList.contains('invisible')).toBe(false);
  });
  it('(b) já ligado: "↔ código nome" + desligar (com motivo, pela RPC de desligar)', async () => {
    lido = { partes: [parte()], vinculos: [{ bem_id: 'b9', codigo: 'IMP-014', descricao: 'Roçadeira hidráulica', parte_ordem: 1 }] };
    montar();
    const link = await screen.findByTestId('abrir-bem-do-lancamento');
    expect(link.textContent).toBe('↔ IMP-014');
    expect(link.getAttribute('title')).toBe('Patrimônio: IMP-014 Roçadeira hidráulica · abrir o bem');
    expect(screen.queryByTestId('acao-patrimonio')).toBeNull();
    fireEvent.click(screen.getByTestId('desligar-bem'));
    fireEvent.change(await screen.findByPlaceholderText('motivo'), { target: { value: 'era de outro bem' } });
    fireEvent.click(screen.getByText('Desligar'));
    await waitFor(() => expect(api.desligar).toHaveBeenCalledWith('b9', [{ lancamento_id: 'L1', parte_ordem: 1 }], 'era de outro bem'));
  });
  it('(d)/(e) conta que não é investimento, RH ou cancelado: nada', async () => {
    lido = { partes: [parte({ centro_custo: 'RH' })], vinculos: [] };
    const { container } = montar();
    await waitFor(() => expect(api.ler).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="patrimonio-do-lancamento"]')).toBeNull();
  });
});

describe('Ligar a um bem', () => {
  it('a lista começa pela categoria sugerida e fazenda; a prévia é simulada; só o clique grava, com os itens do lançamento', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('acao-patrimonio'));
    const linhas = await screen.findAllByTestId('bem-para-ligar');
    expect(linhas[0].textContent).toContain('INS-031');
    fireEvent.click(linhas[0]);
    await waitFor(() => expect(screen.getByTestId('previa-do-patrimonio').textContent).toContain('INS-031 passa de 18.650,00 para 22.130,00'));
    expect(api.ligar).toHaveBeenCalledWith('b1', [{ lancamento_id: 'L1', parte_ordem: 1 }], false, true);
    expect(gravacoes()).toBe(0);
    fireEvent.click(screen.getByTestId('gravar-patrimonio'));
    await waitFor(() => expect(api.ligar).toHaveBeenCalledWith('b1', [{ lancamento_id: 'L1', parte_ordem: 1 }], false, false));
  });
  it('a recusa do banco para o Ligar e aparece escrita', async () => {
    api.ligar.mockResolvedValue({ ok: true, dados: previa({ ok: false, n_recusas: 1, itens: [{ lancamento_id: 'L1', parte_ordem: 1, situacao: 'recusa',
      motivo: 'Já está em EQP-007 desde 02/10/2026 — desligue lá primeiro.', repetida: false, valor: null, descricao: null }] }) });
    montar();
    fireEvent.click(await screen.findByTestId('acao-patrimonio'));
    fireEvent.click((await screen.findAllByTestId('bem-para-ligar'))[0]);
    await waitFor(() => expect(screen.getByTestId('motivo-do-patrimonio').textContent).toBe('Já está em EQP-007 desde 02/10/2026 — desligue lá primeiro.'));
    expect(screen.getByTestId('gravar-patrimonio').hasAttribute('disabled')).toBe(true);
  });
  it('D2: previsto comum não liga ("Liga quando for pago.")', async () => {
    lido = { partes: [parte({ status_transacao: 'previsto' })], vinculos: [] };
    montar();
    fireEvent.click(await screen.findByTestId('acao-patrimonio'));
    fireEvent.click((await screen.findAllByTestId('bem-para-ligar'))[0]);
    await waitFor(() => expect(screen.getByTestId('motivo-do-patrimonio').textContent).toBe('Liga quando for pago.'));
    expect(screen.getByTestId('gravar-patrimonio').hasAttribute('disabled')).toBe(true);
  });
  it('D4: a parcela de compra parcelada leva o contrato inteiro (a prévia de novo com as que faltam)', async () => {
    lido = { partes: [parte({ status_transacao: 'previsto', de_contrato: true })], vinculos: [] };
    api.ligar.mockImplementation(async (_b, itens) => ({ ok: true, dados: itens.length === 1
      ? previa({ contratos: [{ financiamento_id: 'f', descricao: 'Compra', n_parcelas: 2, n_faltam: 1, valor_total: 6960, faltam: [{ lancamento_id: 'L2', parte_ordem: 1 }] }] })
      : previa({ soma: 6960, n_ligar: 2 }) }));
    montar();
    fireEvent.click(await screen.findByTestId('acao-patrimonio'));
    fireEvent.click((await screen.findAllByTestId('bem-para-ligar'))[0]);
    await waitFor(() => expect(api.ligar).toHaveBeenCalledWith('b1', [{ lancamento_id: 'L1', parte_ordem: 1 }, { lancamento_id: 'L2', parte_ordem: 1 }], false, true));
    await waitFor(() => expect(screen.getByTestId('gravar-patrimonio').hasAttribute('disabled')).toBe(false));
  });
});

describe('Criar o bem', () => {
  it('nome da descrição, categoria sugerida; a prévia diz o código; o Criar é UMA ida (criarELigar, não salvar + ligar)', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('acao-patrimonio'));
    fireEvent.click(screen.getByText('Criar o bem'));
    expect(screen.getByDisplayValue('Inversor 2000W').getAttribute('data-testid')).toBe('nome-do-bem');
    await waitFor(() => expect(screen.getByTestId('codigo-do-bem').textContent).toBe('INS-032'), { timeout: 2000 });
    expect(api.criarELigar).toHaveBeenCalledWith({ cliente_id: 'C1', fazenda_id: 'f1', categoria_id: 'k-ins', descricao: 'Inversor 2000W', atividade: 'pecuaria' },
      [{ lancamento_id: 'L1', parte_ordem: 1 }], false, true);
    expect(screen.getByTestId('previa-do-patrimonio').textContent).toContain('Nasce INS-032 já ligado a 1 lançamento');
    expect(gravacoes()).toBe(0);
    fireEvent.click(screen.getByTestId('gravar-patrimonio'));
    await waitFor(() => expect(api.criarELigar.mock.calls.some((c) => c[3] === false)).toBe(true));
    expect(api.ligar).not.toHaveBeenCalled();
  });
  it('conta sem categoria sugerida: categoria vazia e o motivo "Escolha a categoria" (nunca chutada)', async () => {
    lido = { partes: [parte({ plano_conta_id: 'c-solo' })], vinculos: [] };
    montar();
    fireEvent.click(await screen.findByTestId('acao-patrimonio'));
    fireEvent.click(screen.getByText('Criar o bem'));
    await waitFor(() => expect(screen.getByTestId('motivo-do-patrimonio').textContent).toBe('Escolha a categoria'));
    expect(api.criarELigar).not.toHaveBeenCalled();
  });
});
