/**
 * CONC-DESCONCILIAR-EDSON-01 (FILA 18/11 09:22) — NF paga A MAIS: "É juros/multa" ou "Outra despesa sem nota (taxa)" com a conta escolhida.
 * Caso do Gabriel: o cartão pagou 109,00 por uma NF de 87,20 (taxa da plataforma de 21,80). O banco falso segue a 115550: sem destino (ou
 * taxa sem conta) → pergunta; 'juros' ou 'taxa' com `plano_conta_id` → ok. O seletor da conta é trocado por um botão com uma conta.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const CHAMADAS = vi.hoisted(() => [] as { p_itens: { lancamento_id: string; valor: number; destino?: string; plano_conta_id?: string }[]; p_simular?: boolean }[]);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: { p_itens: { lancamento_id: string; valor: number; destino?: string; plano_conta_id?: string }[]; p_simular?: boolean }) => {
      if (fn !== 'fn_espelho_casar') return Promise.resolve({ data: null, error: null });
      CHAMADAS.push(args);
      const i = args.p_itens[0];
      const soma = -Math.abs(i.valor);
      if (Math.abs(soma - -109) > 0.005) return Promise.resolve({ data: { ok: false, motivo: 'soma_nao_bate', no_extrato: -109, soma, diferenca: Math.round((soma + 109) * 100) / 100 }, error: null });
      const decidido = i.destino === 'juros' || (i.destino === 'taxa' && !!i.plano_conta_id);
      if (!decidido) {
        const pergunta_nf = { lancamento_id: i.lancamento_id, frase: 'A NF nº 1257 vale R$ 87,20 e o banco pagou R$ 109,00: o valor da NF não muda. Diga o que é a diferença de R$ 21,80: juros/multa ou outra despesa sem nota (taxa).',
          sentido: 'a_mais', opcoes: ['juros', 'taxa'], diferenca: 21.8 };
        return Promise.resolve({ data: args.p_simular ? { ok: true, no_extrato: -109, soma, pergunta_nf } : { ok: false, motivo: 'nf_diferenca', pergunta_nf, frase: pergunta_nf.frase }, error: null });
      }
      return Promise.resolve({ data: { ok: true, no_extrato: -109, soma }, error: null });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));
vi.mock('@/components/conciliacao/EscolherContaDaTaxa', () => ({
  EscolherContaDaTaxa: ({ onEscolher }: { onEscolher: (c: { id: string; subcentro: string }) => void }) => (
    <button type="button" data-testid="conta-da-taxa" onClick={() => onEscolher({ id: 'pc-tarifas', subcentro: 'Tarifas Bancárias' })}>Tarifas Bancárias</button>
  ),
}));

import { CasarComBancoModal } from './CasarComBancoModal';

const EXTRATO = { extrato_id: 'e-visa', data: '2026-09-08', historico: 'PG *SER COMUNICACAO LT PAULINIA', valor: -109 };
const NF = { lancamento_id: 'l-ser', descricao: 'Oferta Lançamento Comunidade Crescer', fornecedor: 'SER COMUNICACAO', valor_assinado: -87.2, numero_documento: '000.001.257', usarValorDoBanco: true };

function montar() {
  CHAMADAS.length = 0;
  const ok = vi.fn();
  render(<CasarComBancoModal open onClose={() => {}} extrato={EXTRATO} iniciais={[NF]} nomeConta="Visa BB" contaBancariaId="visa" onConciliado={ok} />);
  return ok;
}
const conciliar = () => screen.getByTestId('conciliar-casar') as HTMLButtonElement;

describe('NF paga a mais: juros/multa ou taxa', () => {
  it('a pergunta oferece os dois gestos do banco (e não desconto/parcial)', async () => {
    montar();
    await screen.findByTestId('pergunta-nf');
    expect(screen.getByTestId('destino-juros').textContent).toBe('É juros/multa');
    expect(screen.getByTestId('destino-taxa').textContent).toBe('Outra despesa sem nota (taxa)');
    expect(screen.queryByTestId('destino-desconto')).toBeNull();
    expect(conciliar().disabled).toBe(true);
  });

  it('"taxa": abre a escolha da conta; sem conta nada muda; com a conta o item vai com destino + plano_conta_id e grava', async () => {
    const ok = montar();
    fireEvent.click(await screen.findByTestId('destino-taxa'));
    expect(screen.getByTestId('conta-da-taxa')).toBeTruthy();
    expect(conciliar().disabled).toBe(true);
    fireEvent.click(screen.getByTestId('conta-da-taxa'));
    await waitFor(() => expect(screen.queryByTestId('pergunta-nf')).toBeNull());
    expect(screen.getByTestId('escolha-nf').textContent).toContain('viram "Taxa (sem nota) da NF" em Tarifas Bancárias');
    await waitFor(() => expect(conciliar().disabled).toBe(false));
    fireEvent.click(conciliar());
    await waitFor(() => expect(ok).toHaveBeenCalled());
    expect(CHAMADAS.filter((c) => c.p_simular === false)[0].p_itens[0]).toMatchObject({ lancamento_id: 'l-ser', valor: 109, destino: 'taxa', plano_conta_id: 'pc-tarifas' });
  });

  it('"juros": vai direto, sem conta', async () => {
    const ok = montar();
    fireEvent.click(await screen.findByTestId('destino-juros'));
    await waitFor(() => expect(conciliar().disabled).toBe(false));
    fireEvent.click(conciliar());
    await waitFor(() => expect(ok).toHaveBeenCalled());
    expect(CHAMADAS.filter((c) => c.p_simular === false)[0].p_itens[0]).toMatchObject({ destino: 'juros' });
  });
});
