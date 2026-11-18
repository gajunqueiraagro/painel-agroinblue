/**
 * CONC-DESCONCILIAR-EDSON-01 (R2) — "Casar com o banco" com NF: o valor da NF nunca muda; a pergunta do banco abre os gestos.
 * ⚠ O BANCO FALSO SEGUE A `fn_espelho_casar` aplicada (115540): item de NF com diferença > R$ 1,00 e sem `destino` → na simulação ok com
 *   `pergunta_nf`; ao gravar, ok:false 'nf_diferenca'. Com destino (desconto só com motivo), ok. A NF é saída de 500,00; o banco, −480,00.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const CHAMADAS = vi.hoisted(() => [] as { p_itens: { lancamento_id: string; valor: number; destino?: string; motivo_desconto?: string }[]; p_simular?: boolean }[]);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: { p_itens: { lancamento_id: string; valor: number; destino?: string; motivo_desconto?: string }[]; p_simular?: boolean }) => {
      if (fn !== 'fn_espelho_casar') return Promise.resolve({ data: null, error: null });
      CHAMADAS.push(args);
      const i = args.p_itens[0];
      const soma = -Math.abs(i.valor);
      if (Math.abs(soma - -480) > 0.005) return Promise.resolve({ data: { ok: false, motivo: 'soma_nao_bate', no_extrato: -480, soma, diferenca: Math.round((soma + 480) * 100) / 100 }, error: null });
      const decidido = i.destino === 'parcial' || (i.destino === 'desconto' && !!i.motivo_desconto);
      if (!decidido) {
        const pergunta_nf = { lancamento_id: i.lancamento_id, frase: 'A NF nº 77 vale R$ 500,00 e o banco pagou R$ 480,00: o valor da NF não muda. Diga o que é a diferença de R$ 20,00: desconto (com o motivo) ou pagamento parcial.',
          sentido: 'a_menos', opcoes: ['desconto', 'parcial'], diferenca: -20 };
        return Promise.resolve({ data: args.p_simular ? { ok: true, no_extrato: -480, soma, pergunta_nf } : { ok: false, motivo: 'nf_diferenca', pergunta_nf, frase: pergunta_nf.frase }, error: null });
      }
      return Promise.resolve({ data: { ok: true, no_extrato: -480, soma }, error: null });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));
vi.mock('@/components/financeiro-v2/EspelhoConciliacaoTab', () => ({ MOTIVO_CASAR_LABEL: {} }));

import { CasarComBancoModal } from './CasarComBancoModal';

const EXTRATO = { extrato_id: 'e-nf', data: '2026-10-08', historico: 'PIX ENVIADO MECANICA', valor: -480 };
const NF = { lancamento_id: 'l-nf', descricao: 'Manutenção', fornecedor: 'Mecânica', valor_assinado: -500, numero_documento: '000.000.077', usarValorDoBanco: true };

function montar(onConciliado = vi.fn()) {
  CHAMADAS.length = 0;
  render(<CasarComBancoModal open onClose={() => {}} extrato={EXTRATO} iniciais={[NF]} nomeConta="BB" contaBancariaId="bb" onConciliado={onConciliado} />);
  return onConciliado;
}
const conciliar = () => screen.getByTestId('conciliar-casar');

describe('NF com diferença: a pergunta do banco e os gestos', () => {
  it('a pergunta aparece com a frase do banco e SÓ os gestos que ele aceita; Conciliar travado', async () => {
    montar();
    const caixa = await screen.findByTestId('pergunta-nf');
    expect(caixa.textContent).toContain('o valor da NF não muda');
    expect(screen.getByTestId('destino-desconto')).toBeTruthy();
    expect(screen.getByTestId('destino-parcial')).toBeTruthy();
    expect(screen.queryByTestId('destino-juros')).toBeNull();
    expect((conciliar() as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Pagamento parcial": o item vai com destino, a pergunta some e o Conciliar grava com o destino', async () => {
    const ok = montar();
    fireEvent.click(await screen.findByTestId('destino-parcial'));
    await waitFor(() => expect(screen.queryByTestId('pergunta-nf')).toBeNull());
    expect(screen.getByTestId('escolha-nf').textContent).toContain('ficam em aberto na NF');
    await waitFor(() => expect((conciliar() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(conciliar());
    await waitFor(() => expect(ok).toHaveBeenCalled());
    const gravou = CHAMADAS.filter((c) => c.p_simular === false);
    expect(gravou).toHaveLength(1);
    expect(gravou[0].p_itens[0]).toMatchObject({ lancamento_id: 'l-nf', valor: 480, destino: 'parcial' });
  });

  it('"É desconto" pede o motivo: sem ele não confirma; com ele vai motivo_desconto', async () => {
    const ok = montar();
    fireEvent.click(await screen.findByTestId('destino-desconto'));
    const confirmar = screen.getByTestId('confirmar-desconto') as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('motivo-desconto'), { target: { value: 'pagou à vista' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect((conciliar() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(conciliar());
    await waitFor(() => expect(ok).toHaveBeenCalled());
    expect(CHAMADAS.filter((c) => c.p_simular === false)[0].p_itens[0]).toMatchObject({ destino: 'desconto', motivo_desconto: 'pagou à vista' });
  });

  it('"trocar" desfaz a escolha e a pergunta volta', async () => {
    montar();
    fireEvent.click(await screen.findByTestId('destino-parcial'));
    await screen.findByTestId('escolha-nf');
    fireEvent.click(screen.getByText('trocar'));
    expect(await screen.findByTestId('pergunta-nf')).toBeTruthy();
  });
});
