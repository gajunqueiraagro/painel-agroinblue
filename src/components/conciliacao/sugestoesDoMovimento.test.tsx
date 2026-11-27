/**
 * CONC-SUGESTOES-V2 MODAL ÚNICO (Gabriel 26/11 06:56) — o painel da conta e o palco do mês abrem o MESMO "Sugestões para casar"; sem a lista
 * da Conferência, o motor ampliado é a lista inteira (`soMotor`): o candidato da própria conta aparece ("valor igual") e o Casar abre o
 * "Casar com o banco" com ele levado. Nomes e números SINTÉTICOS.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => { const q = { select: () => q, eq: () => q, or: () => Promise.resolve({ data: [], error: null }), in: () => Promise.resolve({ data: [], error: null }) }; return q; },
    rpc: (fn: string) => {
      if (fn === 'fn_candidatos_conciliacao') return Promise.resolve({ data: [{ id: 'l1', descricao: 'Energia', favorecido: 'Cia Luz', numero_documento: null,
        data_referencia: '2026-11-05', valor: '320.00', status: 'programado', ja_conciliado: '0', saldo: '320.00', delta_valor: '0', delta_dias: 1, score: 50,
        pre_marcado: false, ambiguo: false, indisponivel: false, motivo_indisponivel: null, vencimento: '2026-11-05', conta_bancaria_id: 'cc', conta_nome: 'Conta X',
        outra_conta: false, documento_casa: null, exata: false, origem: 'lancamento', parcela_id: null, parcela_rotulo: null, dias_uteis: null }], error: null });
      return Promise.resolve({ data: fn === 'fn_espelho_casar' ? { ok: true, no_extrato: -320, soma: -320 } : [], error: null });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));

import { SugestoesDoMovimento } from './SugestoesDoMovimento';

describe('o modal único fora da Conferência', () => {
  it('o motor é a lista: o da própria conta aparece com "valor igual"; Casar abre o Casar com o banco com ele', async () => {
    render(<SugestoesDoMovimento movimento={{ id: 'e1', data: '2026-11-06', historico: 'PAGAMENTO DE BOLETO CIA LUZ', valor: -320 }}
      clienteId="cli" contaId="cc" nomeConta="Conta X" aoFechar={() => {}} aoMudar={() => {}} />);
    const linha = await screen.findByTestId('do-motor');
    expect(within(linha).getByTestId('motor-motivo').textContent).toBe('valor igual');
    fireEvent.click(within(linha).getByTestId('motor-casar'));
    await waitFor(() => expect(screen.getByLabelText('Valor de Energia')).toBeTruthy());
    expect(screen.queryByTestId('sugestoes-casar')).toBeNull();
  });
});
