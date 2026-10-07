/**
 * PARC-CADEIA-01 passo 4 — a tela do contrato: excluir a compra parcelada numa gravação (com a simulação no diálogo), a parcela
 * viva sem lançamento deixa de ser muda, e os dois gestos da linha (recriar o lançamento, retirar a parcela).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dadosDoRecriar, fraseDoExcluir, fraseDoMolde, lerPreviaExcluirCompra, lerPreviaRecriar,
} from '@/lib/financiamentos/cancelarParcela';
import {
  lerSituacaoDoContrato, porQueSemLancamento, semLancamento, MOTIVO_PARCELA_SEM_LANCAMENTO, ROTULO_SEM_LANCAMENTO,
} from '@/lib/financiamentos/situacaoDoContrato';

const banco = vi.hoisted(() => ({
  simularExcluir: vi.fn(), gravarExcluir: vi.fn(), simularRecriar: vi.fn(), gravarRecriar: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/financiamentos/cancelarParcelaBanco', () => ({
  simularExcluirCompra: banco.simularExcluir, gravarExcluirCompra: banco.gravarExcluir,
  simularRecriarLancamento: banco.simularRecriar, gravarRecriarLancamento: banco.gravarRecriar,
}));
vi.mock('sonner', () => ({ toast: banco.toast }));

import { ExcluirCompraDialog, RecriarLancamentoDialog } from './GestosDoContratoDialogs';

const txt = (id: string) => screen.getByTestId(id).textContent ?? '';
beforeEach(() => { vi.clearAllMocks(); });

describe('o dono: o que o banco devolve, só escrito', () => {
  it('excluir: quantos lançamentos e parcelas saem (os números do banco), no singular e no plural', () => {
    const p = lerPreviaExcluirCompra({ ok: true, lancamentos: 3, parcelas: 4, recusa: null });
    expect(p).toEqual({ lancamentos: 3, parcelas: 4, recusa: null });
    expect(fraseDoExcluir(p!)).toBe('Serão cancelados 3 lançamentos e 4 parcelas. O contrato fica como cancelado; nada é apagado.');
    expect(fraseDoExcluir({ lancamentos: 1, parcelas: 1, recusa: null })).toBe('Será cancelado 1 lançamento e 1 parcela. O contrato fica como cancelado; nada é apagado.');
    expect(lerPreviaExcluirCompra({ lancamentos: 3 })).toBeNull();
    expect(lerPreviaExcluirCompra({ lancamentos: 0, parcelas: 2, recusa: { motivo: 'ha_paga', frase: 'A parcela 1 já está paga: desfaça o pagamento antes de cancelar a compra.' } })?.recusa?.frase)
      .toContain('já está paga');
  });
  it('recriar: o lançamento que vai nascer e de onde vem a classificação', () => {
    const p = lerPreviaRecriar({ ok: true, parcela: { id: 'p', numero: 3, total: 4, valor: 341.35, vencimento: '2026-10-06' }, descricao: 'Compra X 3/4', molde: 'cancelado', lancamento_id: null, recusa: null });
    expect(p).toMatchObject({ descricao: 'Compra X 3/4', molde: 'cancelado', parcela: { numero: 3, total: 4 } });
    expect(fraseDoMolde(p!)).toBe('Classificação, conta e fornecedor copiados do lançamento cancelado desta parcela.');
    expect(fraseDoMolde({ ...p!, molde: 'vizinha' })).toBe('Classificação, conta e fornecedor copiados da parcela vizinha.');
    expect(dadosDoRecriar(p!)).toEqual({ vencimento: '06/10/2026', valor: expect.stringContaining('341,35') });
    expect(lerPreviaRecriar({ parcela: { numero: 3 }, descricao: 'x' })).toBeNull();
  });
});

describe('a parcela viva sem lançamento vivo', () => {
  const parcela = (extra: Record<string, unknown>) => ({
    id: 'par-3', numero: 3, data_vencimento: '2026-10-06', valor_principal: 341.35, valor_juros: 0, valor_total: 341.35,
    situacao: 'vencida', pago_em: null, valor_pago: 0, lancamento_id: null, lancamento_juros_id: null, fonte: 'parcela', diverge: false,
    competencia: null, conta_id: null, conta_nome: null, tipo_documento: null, numero_documento: null, prazo: null, documentos: [], boletos: 0, ...extra,
  });
  const cartoes = { valor_contrato: 341.35, pago: 0, a_vencer: 0, vencido: 341.35, pagas: 0, parcelas: 1, juros_previstos: 0, soma_principal: 341.35, soma_total: 341.35, divergentes: 0,
    a_vencer_qtde: 0, vencido_qtde: 1, notas_qtde: 0, notas_valor: null, notas_diferenca: null, boletos: 0 };
  const ler = (extra: Record<string, unknown>) => lerSituacaoDoContrato({ parcelas: [parcela(extra)], cartoes })!.parcelas[0];

  it('é "sem lançamento", e o title diz quando e por que o lançamento foi cancelado (o que o banco registrou)', () => {
    const p = ler({ lancamento_cancelado: { em: '2026-10-07T15:00:00+00:00', motivo: 'legado' } });
    expect(semLancamento(p)).toBe(true);
    expect(ROTULO_SEM_LANCAMENTO).toBe('sem lançamento');
    expect(porQueSemLancamento(p)).toMatch(/^lançamento cancelado em \d{2}\/10\/26 · legado$/);
  });
  it('sem registro do cancelamento (parcela que nunca teve lançamento): a frase de sempre; sem motivo: diz que não há', () => {
    expect(porQueSemLancamento(ler({ lancamento_cancelado: null }))).toBe(MOTIVO_PARCELA_SEM_LANCAMENTO);
    expect(porQueSemLancamento(ler({}))).toBe(MOTIVO_PARCELA_SEM_LANCAMENTO);
    expect(porQueSemLancamento(ler({ lancamento_cancelado: { em: null, motivo: null } }))).toBe('lançamento cancelado · sem motivo registrado');
  });
  it('com lançamento vivo, ou paga pela parcela: NÃO é "sem lançamento"', () => {
    expect(semLancamento(ler({ lancamento_id: 'lan-3', fonte: 'lancamento' }))).toBe(false);
    expect(semLancamento(ler({ situacao: 'paga' }))).toBe(false);
  });
});

describe('ExcluirCompraDialog', () => {
  const montar = () => {
    const aoVoltar = vi.fn(); const aoExcluir = vi.fn();
    render(<ExcluirCompraDialog financiamentoId="fin-1" descricao="Compra X" aoVoltar={aoVoltar} aoExcluir={aoExcluir} />);
    return { aoVoltar, aoExcluir };
  };
  it('mostra a simulação do banco, exige o motivo e grava pela função única', async () => {
    banco.simularExcluir.mockResolvedValue({ previa: { lancamentos: 4, parcelas: 4, recusa: null }, erro: null });
    banco.gravarExcluir.mockResolvedValue(null);
    const { aoExcluir } = montar();
    await waitFor(() => expect(txt('excluir-compra-previa')).toBe('Serão cancelados 4 lançamentos e 4 parcelas. O contrato fica como cancelado; nada é apagado.'));
    expect(banco.simularExcluir).toHaveBeenCalledWith('fin-1');
    expect(screen.getByTestId('excluir-compra-gravar')).toBeDisabled();
    expect(txt('excluir-compra-recado')).toBe('Informe o motivo do cancelamento.');
    fireEvent.change(screen.getByTestId('excluir-compra-motivo'), { target: { value: ' compra desfeita ' } });
    fireEvent.click(screen.getByTestId('excluir-compra-gravar'));
    await waitFor(() => expect(aoExcluir).toHaveBeenCalledWith({ lancamentos: 4, parcelas: 4, recusa: null }));
    expect(banco.gravarExcluir).toHaveBeenCalledWith('fin-1', 'compra desfeita');
  });
  it('com parcela paga: a frase da recusa no lugar da prévia, botão apagado mesmo com motivo, nada grava', async () => {
    banco.simularExcluir.mockResolvedValue({ previa: { lancamentos: 3, parcelas: 4, recusa: { motivo: 'ha_paga', frase: 'As parcelas 1 e 2 já estão pagas: desfaça o pagamento delas antes de cancelar a compra.' } }, erro: null });
    montar();
    await waitFor(() => expect(txt('excluir-compra-previa')).toContain('As parcelas 1 e 2 já estão pagas'));
    fireEvent.change(screen.getByTestId('excluir-compra-motivo'), { target: { value: 'm' } });
    expect(screen.getByTestId('excluir-compra-gravar')).toBeDisabled();
    fireEvent.click(screen.getByTestId('excluir-compra-gravar'));
    expect(banco.gravarExcluir).not.toHaveBeenCalled();
  });
  it('recusa do banco na gravação: escrita ao lado do botão, o diálogo fica, nenhum toast', async () => {
    banco.simularExcluir.mockResolvedValue({ previa: { lancamentos: 4, parcelas: 4, recusa: null }, erro: null });
    banco.gravarExcluir.mockResolvedValue('Há parcela com competência em mês fechado: reabra o mês antes. Nada foi gravado.');
    const { aoExcluir } = montar();
    await waitFor(() => expect(txt('excluir-compra-previa')).toContain('4 lançamentos'));
    fireEvent.change(screen.getByTestId('excluir-compra-motivo'), { target: { value: 'm' } });
    fireEvent.click(screen.getByTestId('excluir-compra-gravar'));
    await waitFor(() => expect(txt('excluir-compra-recado')).toContain('mês fechado'));
    expect(aoExcluir).not.toHaveBeenCalled();
    for (const f of Object.values(banco.toast)) expect(f).not.toHaveBeenCalled();
    expect(screen.getByTestId('excluir-compra').className).toContain('h-[210px]');
  });
});

describe('RecriarLancamentoDialog', () => {
  const PREVIA = { parcela: { numero: 3, total: 4, valor: 100, vencimento: '2026-12-20' }, descricao: 'Compra X 3/4', molde: 'vizinha' as const, recusa: null };
  it('diz o lançamento que vai nascer antes de gravar, e grava pela função única', async () => {
    banco.simularRecriar.mockResolvedValue({ previa: PREVIA, erro: null });
    banco.gravarRecriar.mockResolvedValue(null);
    const aoRecriar = vi.fn();
    render(<RecriarLancamentoDialog parcelaId="par-3" aoVoltar={vi.fn()} aoRecriar={aoRecriar} />);
    await waitFor(() => expect(txt('recriar-previa')).toBe('Compra X 3/4'));
    expect(txt('recriar-dados')).toContain('20/12/2026');
    expect(txt('recriar-molde')).toBe('Classificação, conta e fornecedor copiados da parcela vizinha.');
    fireEvent.click(screen.getByTestId('recriar-gravar'));
    await waitFor(() => expect(aoRecriar).toHaveBeenCalled());
    expect(banco.gravarRecriar).toHaveBeenCalledWith('par-3');
  });
  it('recusa da simulação: a frase no lugar da prévia e o botão apagado', async () => {
    banco.simularRecriar.mockResolvedValue({ previa: { ...PREVIA, recusa: { motivo: 'tem_lancamento', frase: 'A parcela 3 já tem lançamento no Financeiro.' } }, erro: null });
    render(<RecriarLancamentoDialog parcelaId="par-3" aoVoltar={vi.fn()} aoRecriar={vi.fn()} />);
    await waitFor(() => expect(txt('recriar-previa')).toBe('A parcela 3 já tem lançamento no Financeiro.'));
    expect(screen.getByTestId('recriar-gravar')).toBeDisabled();
    expect(txt('recriar-molde')).toBe('');
  });
});

describe('a tela do contrato, lida da FONTE', () => {
  const tela = readFileSync(resolve(__dirname, '../../pages/FinanciamentoDetalhe.tsx'), 'utf8');
  it('compra parcelada: o Excluir abre o diálogo da função única; o caminho antigo (três idas) só para financiamento e empréstimo', () => {
    expect(tela).toContain('{ehParcelamento && confirmDelete && id && (\n        <ExcluirCompraDialog');
    expect(tela).toContain('<AlertDialog open={confirmDelete && !ehParcelamento} onOpenChange={setConfirmDelete}>');
  });
  it('a linha sem lançamento tem situação própria e os dois gestos; o resto da linha é o de antes', () => {
    expect(tela).toContain('const orfa = ehParcelamento && semLancamento(p);');
    expect(tela).toContain('{orfa ? ROTULO_SEM_LANCAMENTO : ROTULO_SITUACAO[p.situacao]}');
    expect(tela).toContain('title={orfa ? porQueSemLancamento(p) : origemDaSituacao(p)}');
    expect(tela).toContain('data-testid="recriar-da-linha"');
    expect(tela).toContain('data-testid="retirar-da-linha"');
    expect(tela).toContain("const r = await simularCancelarParcela({ parcelaId }, 'so_esta');");
  });
  it('depois de mexer na cadeia a tela avisa o Financeiro e relê (sem F5)', () => {
    expect(tela).toContain('if (clienteId) notificarLancamentosMudaram(clienteId);');
    expect(tela).toContain("aoRecriar={() => { setRecriarParcela(null); aposMexerNaCadeia(); }}");
  });
});
