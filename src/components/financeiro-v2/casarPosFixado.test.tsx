/**
 * FIN-POS-FIXADO-01b — a parcela de contrato pós-fixado se casa pelo dono (`fn_financiamento_parcela_pos_pagar`), que grava o juro
 * real; o modal não reescreve o juro por fora. O bloco recusa com a frase do banco. Banco falso, valores do 8.233.040 (sintéticos).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const B = vi.hoisted(() => ({
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  estimados: [] as unknown[],
  parcelas: [] as unknown[],
  pos: null as unknown,
  bloco: { data: null, error: null } as { data: unknown; error: unknown },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      B.chamadas.push({ fn, args });
      if (fn === 'fn_juros_estimados_do_cliente') return Promise.resolve({ data: B.estimados, error: null });
      if (fn === 'fn_financiamento_parcela_pos_pagar') return Promise.resolve({ data: B.pos, error: null });
      if (fn === 'fn_conciliar_bloco') return Promise.resolve(B.bloco);
      if (fn === 'fn_espelho_casar') return Promise.resolve({ data: { ok: false, motivo: 'soma_nao_bate', no_extrato: -160000, soma: -155669.84, diferenca: 4330.16 }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: B.parcelas, error: null }) }) }),
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));

import { CasarComBancoModal, CasarBlocoModal } from './CasarComBancoModal';
import { FRASE_LEVE_O_PAR, fraseDoJuroReal, lerRespostaPosPagar, levadosSaoOPar, mapaDaParcelaPos, parcelaPosDosLevados } from '@/lib/financiamentos/parcelaPosPagar';

const EXTRATO = { extrato_id: 'e160', data: '2027-08-15', historico: 'DEBITO PARCELA SINTETICA', valor: -160000 };
const PRINCIPAL = { lancamento_id: 'lp', descricao: 'Amortização 2/5 · 8.233.040', fornecedor: 'Banco Sintético', valor_assinado: -120004.5 };
const JUROS = { lancamento_id: 'lj', descricao: 'Juros 2/5 · 8.233.040', fornecedor: 'Banco Sintético', valor_assinado: -35665.34 };
const OK = { ok: true, simulado: true, no_extrato: -160000, soma: -160000,
  parcela: { id: 'p2', numero: 2, principal_id: 'lp', juros_id: 'lj', principal: 120004.5, juros_estimado: 35665.34, encargos: 0, juro_real: 39995.5 } };

const montar = (iniciais = [PRINCIPAL, JUROS], clienteId: string | null = 'cli') =>
  render(<CasarComBancoModal open onClose={() => {}} extrato={EXTRATO} iniciais={iniciais} contaBancariaId="c1" onConciliado={() => {}} clienteId={clienteId} />);

beforeEach(() => {
  B.chamadas = [];
  B.estimados = [{ lancamento_id: 'lj', financiamento_id: 'f', parcela_id: 'p2' }];
  B.parcelas = [{ id: 'p2', lancamento_id: 'lp' }];
  B.pos = OK;
});

describe('o leitor', () => {
  it('liga principal e juros à parcela, e peça torta invalida', () => {
    const m = mapaDaParcelaPos(B.estimados, B.parcelas);
    expect(m?.get('lj')).toBe('p2');
    expect(m?.get('lp')).toBe('p2');
    expect(parcelaPosDosLevados(['x', 'lp'], m)).toBe('p2');
    expect(parcelaPosDosLevados(['x'], m)).toBeNull();
    expect(mapaDaParcelaPos([{ lancamento_id: 'lj' }], [])).toBeNull();
  });
  it('a resposta do dono e a frase do juro real', () => {
    const r = lerRespostaPosPagar(OK);
    expect(r && levadosSaoOPar(['lj', 'lp'], r)).toBe(true);
    expect(r && levadosSaoOPar(['lj'], r)).toBe(false);
    expect(r && fraseDoJuroReal(r)).toBe('Juro real pelo extrato: R$ 39.995,50 · estimado R$ 35.665,34 · o principal não muda');
    expect(lerRespostaPosPagar({ ok: false, recusa: { motivo: 'extrato_menor', frase: 'o extrato é menor que o principal da parcela; case como pagamento parcial' } })?.frase)
      .toBe('o extrato é menor que o principal da parcela; case como pagamento parcial');
    expect(lerRespostaPosPagar({ ok: false })).toBeNull();
  });
});

describe('o modal no caso pós', () => {
  it('simula e concilia PELO DONO, nunca pela fn_espelho_casar; o juro real escrito', async () => {
    montar();
    await screen.findByTestId('juro-real');
    expect(screen.getByTestId('juro-real').textContent).toContain('R$ 39.995,50');
    expect(screen.getByLabelText('Valor de Juros 2/5 · 8.233.040')).toBe(screen.getByDisplayValue('39995,50'));
    expect(screen.getByLabelText('Valor de Amortização 2/5 · 8.233.040')).toBe(screen.getByDisplayValue('120004,50'));
    const conciliar = screen.getByRole('button', { name: 'Conciliar' });
    await waitFor(() => expect(conciliar).not.toBeDisabled());
    fireEvent.click(conciliar);
    await waitFor(() => expect(B.chamadas.some((c) => c.fn === 'fn_financiamento_parcela_pos_pagar' && c.args.p_simular === false)).toBe(true));
    const gravacao = B.chamadas.find((c) => c.fn === 'fn_financiamento_parcela_pos_pagar' && c.args.p_simular === false);
    expect(gravacao?.args).toEqual({ p_extrato_id: 'e160', p_parcela_id: 'p2', p_simular: false });
    expect(B.chamadas.some((c) => c.fn === 'fn_espelho_casar')).toBe(false);
    expect(screen.queryByTestId('absorver-diferenca')).toBeNull();
  });
  it('a recusa do banco fica escrita e o Conciliar apagado', async () => {
    B.pos = { ok: false, simulado: true, recusa: { motivo: 'extrato_menor', frase: 'o extrato é menor que o principal da parcela; case como pagamento parcial' } };
    montar();
    await screen.findByText('o extrato é menor que o principal da parcela; case como pagamento parcial');
    expect(screen.getByRole('button', { name: 'Conciliar' })).toBeDisabled();
  });
  it('só os juros levados: a frase do par, sem gravar', async () => {
    montar([JUROS]);
    await screen.findByText(FRASE_LEVE_O_PAR);
    expect(screen.getByRole('button', { name: 'Conciliar' })).toBeDisabled();
  });
  it('sem o cliente, o caminho de sempre (a fn_espelho_casar)', async () => {
    montar([PRINCIPAL, JUROS], null);
    await waitFor(() => expect(B.chamadas.some((c) => c.fn === 'fn_espelho_casar')).toBe(true));
    expect(B.chamadas.some((c) => c.fn === 'fn_financiamento_parcela_pos_pagar')).toBe(false);
  });
});

describe('o bloco', () => {
  it('recusa com a frase da parcela pós, sem o código', async () => {
    B.bloco = { data: null, error: { code: 'CBLOC', message: 'parcela_pos: Parcela de contrato pós-fixado: case pelo modal da linha do extrato para gravar o juro real.' } };
    render(<CasarBlocoModal open onClose={() => {}} onConciliado={() => {}}
      extratos={[{ extrato_id: 'e160', data: '2027-08-15', historico: 'DEBITO PARCELA SINTETICA', valor: -160000 }]}
      lancamentos={[{ ...PRINCIPAL, data: '2027-08-15' }, { ...JUROS, data: '2027-08-15' }]} />);
    await waitFor(() => expect(screen.getByTestId('recusa-bloco').textContent)
      .toBe('Parcela de contrato pós-fixado: case pelo modal da linha do extrato para gravar o juro real.'));
  });
});
