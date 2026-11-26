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

  /* CONC-CASAR-1X1-TABELA-01 (Gabriel 19/11 07:23): o Extrato × Sistema em duas colunas foi REPROVADO — o 1:1 é a tabela do Casar N */
  it('o modal: o extrato na faixa de cima (Data · Histórico · Conta · Valor), o lançamento numa linha da tabela, a faixa do pagamento', async () => {
    render(<CasarComBancoModal open onClose={() => {}} contaBancariaId="bb" nomeConta="Banco do Brasil"
      extrato={{ extrato_id: 'x1', data: '2026-10-13', historico: 'PIX AGENDAMENTO 10/10 · AZULAO PARAFUSOS E FERRAM', valor: -2903 }}
      iniciais={[{ lancamento_id: 'l1', descricao: 'Jogo de chaves · 14 itens', fornecedor: 'Azulão Parafusos e Ferramentas', valor_assinado: -2903,
        data_vencimento: '2026-11-10', status_transacao: 'programado', numero_documento: '000077066' }]}
      onConciliado={() => {}} />);
    const ext = [...screen.getByTestId('levados-extrato').querySelectorAll('td')].map((td) => td.textContent);
    /* CONC-SUGESTOES-V2 C: o extrato é a 1ª linha DA MESMA grade — "Banco" · Pgto. · nome sem caixa alta (o cru no title) · Valor sob Valor */
    expect(ext).toHaveLength(13);
    expect([ext[0], ext[1], ext[3], ext[10]]).toEqual(['Banco', '13/10/2026', 'Azulao Parafusos e Ferram', '-2.903,00']);
    expect(screen.getByTestId('levados-extrato-historico').getAttribute('title')).toBe('PIX AGENDAMENTO 10/10 · AZULAO PARAFUSOS E FERRAM');
    const linha = screen.getByTestId('levado-linha');
    expect(linha.querySelectorAll('td')[0].textContent).toBe('10/11/2026');
    expect(screen.getByTestId('levado-linha-nf').textContent).toBe('000.077.066');
    /* CONC-SUGESTOES-V2 C (mock): a frase é uma linha pequena com ⓘ */
    expect(screen.getByTestId('casar-faixa-pagamento-texto').textContent).toBe('Pago 28 dias ANTES do vencimento (venc. 10/11 · banco 13/10)');
    expect(screen.getByTestId('casar-faixa-pagamento').className).toContain('h-[18px]');
    /* NF de saída no 1:1: o aplicado é o valor da NF, travado (R2) */
    const aplicado = screen.getByTestId('levado-linha-aplicado');
    expect(aplicado.getAttribute('data-travado')).toBe('nf');
    expect(aplicado.hasAttribute('readonly')).toBe(true);
  });
});
