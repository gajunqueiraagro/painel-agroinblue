/**
 * CONC-CRIAR-COM-NOTA-02 D-g / D-h (Gabriel 18/11, caso Azulão: NF 77.066 vence 10/11, paga no BB 13/10).
 * D-g — as listas de casar ganham "Δ valor" (banco − lançamento) e "Δ dias" (pgto. no banco − vencimento), com cor.
 * D-h — o "Casar com o banco": Extrato × Sistema numa tabela e a faixa "Pago N dias ANTES do vencimento (venc. · banco)".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string) => Promise.resolve({ data: fn === 'fn_espelho_casar' ? { ok: true, no_extrato: -2903, soma: -2903 } : null, error: null }),
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }), eq: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));

import { deltasDoMovimento, textoDoDelta } from '@/components/conciliacao/TabelaParaCasar';
import { CasarComBancoModal, fraseDoPagamento } from './CasarComBancoModal';

describe('D-g — os dois Δ contra o movimento do banco', () => {
  it('Azulão: banco 13/10 −2.903,00 × lançamento venc. 10/11 2.903,00 → Δ valor 0, Δ dias −28 (antes)', () => {
    expect(deltasDoMovimento({ data: '2026-10-13', valor: -2903 }, { valor: -2903, venc: '2026-11-10' })).toEqual({ deltaValor: 0, deltaDias: -28 });
    expect(deltasDoMovimento({ data: '2026-10-13', valor: -2903 }, { valor: -2900.5, venc: '2026-10-10' })).toEqual({ deltaValor: 2.5, deltaDias: 3 });
    expect(deltasDoMovimento({ data: null, valor: -1 }, { valor: -1, venc: '2026-10-10' }).deltaDias).toBeNull();
  });
  it('a cor: zero verde; valor diferente âmbar; antes do vencimento azul, depois âmbar; sem dado "—"', () => {
    expect(textoDoDelta('valor', 0)).toEqual({ texto: '0,00', classe: 'text-emerald-700' });
    expect(textoDoDelta('valor', -1234.5)).toEqual({ texto: '−1.234,50', classe: 'text-amber-700' });
    expect(textoDoDelta('dias', -28)).toEqual({ texto: '−28', classe: 'text-sky-700' });
    expect(textoDoDelta('dias', 5)).toEqual({ texto: '+5', classe: 'text-amber-700' });
    expect(textoDoDelta('dias', 0).classe).toBe('text-emerald-700');
    expect(textoDoDelta('dias', null).texto).toBe('—');
  });
});

describe('D-h — a faixa do pagamento contra o vencimento', () => {
  it('antes, depois, no dia, vários vencimentos e sem dado', () => {
    expect(fraseDoPagamento('2026-10-13', ['2026-11-10'])?.texto).toBe('Pago 28 dias ANTES do vencimento (venc. 10/11 · banco 13/10)');
    expect(fraseDoPagamento('2026-10-13', ['2026-10-12'])?.texto).toBe('Pago 1 dia DEPOIS do vencimento (venc. 12/10 · banco 13/10)');
    expect(fraseDoPagamento('2026-10-13', ['2026-10-13'])?.texto).toBe('Pago no vencimento (venc. 13/10 · banco 13/10)');
    expect(fraseDoPagamento('2026-10-13', ['2026-10-13', '2026-11-10'])?.texto).toMatch(/^Vencimentos diferentes/);
    expect(fraseDoPagamento('2026-10-13', [null])).toBeNull();
    expect(fraseDoPagamento(null, ['2026-11-10'])).toBeNull();
  });

  it('o modal: Extrato × Sistema numa tabela, valor sob valor à direita, a faixa e o "valor aplicado"', async () => {
    render(<CasarComBancoModal open onClose={() => {}} contaBancariaId="bb" nomeConta="Banco do Brasil"
      extrato={{ extrato_id: 'x1', data: '2026-10-13', historico: 'PIX AGENDAMENTO 10/10 · AZULAO PARAFUSOS E FERRAM', valor: -2903 }}
      iniciais={[{ lancamento_id: 'l1', descricao: 'Jogo de chaves · 14 itens', fornecedor: 'Azulão Parafusos e Ferramentas', valor_assinado: -2903,
        data_vencimento: '2026-11-10', status_transacao: 'programado', numero_documento: '000077066' }]}
      onConciliado={() => {}} />);
    const tabela = screen.getByTestId('casar-colunas');
    expect(tabela.tagName).toBe('TABLE');
    expect(screen.getByTestId('casar-coluna-extrato').textContent).toBe('Extrato');
    expect(screen.getByTestId('casar-coluna-sistema').textContent).toBe('Sistema');
    /* valor do banco e do sistema na MESMA linha, à direita */
    const vb = screen.getByTestId('casar-valor-banco');
    const vs = screen.getByTestId('casar-valor-sistema');
    expect(vb.closest('tr')).toBe(vs.closest('tr'));
    expect(vb.parentElement?.className).toContain('text-right');
    expect(vs.parentElement?.className).toContain('text-right');
    expect(screen.getByTestId('casar-sis-venc').textContent).toBe('10/11/2026');
    expect(screen.getByTestId('levado-nf').textContent).toBe('000.077.066');
    expect(screen.getByTestId('casar-faixa-pagamento').textContent).toBe('Pago 28 dias ANTES do vencimento (venc. 10/11 · banco 13/10)');
    expect(screen.getByTestId('casar-faixa-pagamento').className).toContain('h-[22px]');
    expect(screen.getByTestId('valor-aplicado-rotulo').textContent).toBe('valor aplicado');
    /* homologação 09:37: o histórico do banco na linha própria, com a largura toda (as 4 colunas do lado de lá do rótulo) */
    const h = screen.getByTestId('casar-historico');
    expect(h.textContent).toBe('PIX AGENDAMENTO 10/10 · AZULAO PARAFUSOS E FERRAM');
    expect(h.getAttribute('colspan')).toBe('4');
    expect(h.getAttribute('title')).toBe('PIX AGENDAMENTO 10/10 · AZULAO PARAFUSOS E FERRAM');
  });
});
