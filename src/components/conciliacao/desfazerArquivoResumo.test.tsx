/**
 * PR-CONC-IMPORT-BANCO-01B — o `DesfazerArquivoModal` escreve o que a SIMULAÇÃO da RPC devolve, e a RECUSA dela.
 *
 * ⚠ O CASO REAL: o desfazer de 03/10 do Agnaldo (95c641a0, "AGO26 …csv"). A simulação devolvida aqui é a que a função nova
 *   dá para aquele estado (provada em `supabase/tests/conc_import_banco_01b_test.sql`, P4): 100 movimentos de 03/08 a 02/09,
 *   93 de agosto e 7 de setembro, 108 conciliações, 80 crus (79 com conta do plano — o 80º é Dividendos por texto —, 17
 *   editados à mão), 1 volta a programado, 2 liquidações de OC — e a RECUSA pelo f1b7f361, ligado à OC dbda3338.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DesfazerArquivoModal } from '@/components/conciliacao/DesfazerArquivoModal';
import { partesDoResumoDoDesfazer, type SimulacaoDesfazer } from '@/lib/conciliacao/desfazerArquivoTexto';

const FRASE = 'O lançamento "Compra XXX DM - Frete" (R$ 5.943,00, 03/08/2026) está ligado à OC de 31/07/2026: desfaça o vínculo na OC antes.';
const SIM_REAL: SimulacaoDesfazer & Record<string, unknown> = {
  ok: false, motivo: 'oc_viva', frase: FRASE, arquivo: 'AGO26 -b7e4052e-a3cc-43ea-b199-2f3aa2b545a1.csv', meses: ['2026-08', '2026-09'],
  extratos: 100, sem_par: 7, periodo_inicio: '2026-08-03', periodo_fim: '2026-09-02',
  por_mes: [{ mes: '2026-08', qtde: 93 }, { mes: '2026-09', qtde: 7 }],
  conciliacoes_desfeitas: 108, crus_cancelados: 80, crus_classificados: 79, crus_enriquecidos: 17, voltam_a_programado: 1,
  liquidacoes_oc_estornadas: [{ valor: 5943 }, { valor: 3100 }], substituidos_restaurados: 1, substituidos_com_audit: 1,
  vinculos_manuais_desfeitos: 27,
};

const resposta = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: () => Promise.resolve({ data: resposta.data, error: null }) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DesfazerArquivoModal alvo={{ id: '95c641a0', nome_arquivo: 'AGO26.csv' }} onClose={() => {}} onDesfeito={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => { resposta.data = {}; });

describe('o resumo do desfazer', () => {
  it('o caso real, parte a parte (só as com contagem > 0)', () => {
    expect(partesDoResumoDoDesfazer(SIM_REAL)).toEqual([
      '100 movimentos de 03/08 a 02/09',
      '93 de agosto, 7 de setembro',
      '108 conciliações serão desfeitas',
      '80 lançamentos serão cancelados (79 classificados, 17 editados à mão)',
      '1 volta a programado',
      '2 liquidações de OC serão estornadas',
    ]);
  });
  it('todos classificados: a frase do briefing', () => {
    expect(partesDoResumoDoDesfazer({ ...SIM_REAL, crus_classificados: 80 })[3])
      .toBe('80 lançamentos classificados serão cancelados (17 editados à mão)');
  });
  it('nada conciliado nem classificado: só o período (a confirmação de hoje)', () => {
    expect(partesDoResumoDoDesfazer({ extratos: 12, periodo_inicio: '2026-09-01', periodo_fim: '2026-09-30',
      por_mes: [{ mes: '2026-09', qtde: 12 }], conciliacoes_desfeitas: 0, crus_cancelados: 0, liquidacoes_oc_estornadas: [] }))
      .toEqual(['12 movimentos de 01/09 a 30/09']);
  });
});

describe('o modal', () => {
  it('a recusa: o resumo inteiro, a frase da RPC em vermelho, sem campo de motivo, botão apagado com o porquê', async () => {
    resposta.data = SIM_REAL;
    montar();
    const resumo = await screen.findByTestId('resumo-desfazer');
    expect(resumo.textContent).toBe('100 movimentos de 03/08 a 02/09 · 93 de agosto, 7 de setembro · 108 conciliações serão desfeitas · '
      + '80 lançamentos serão cancelados (79 classificados, 17 editados à mão) · 1 volta a programado · 2 liquidações de OC serão estornadas · 7 sem par');
    expect(screen.getByTestId('recusa-desfazer')).toHaveTextContent(FRASE);
    expect(screen.queryByLabelText('Motivo (obrigatório)')).toBeNull();
    const botao = screen.getByRole('button', { name: 'Desfazer arquivo' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', FRASE);
  });

  it('sem recusa: o resumo, o motivo e os dois cliques de sempre', async () => {
    resposta.data = { ...SIM_REAL, ok: true, motivo: undefined, frase: undefined, liquidacoes_oc_estornadas: [] };
    montar();
    await screen.findByTestId('resumo-desfazer');
    expect(screen.queryByTestId('recusa-desfazer')).toBeNull();
    fireEvent.change(screen.getByLabelText('Motivo (obrigatório)'), { target: { value: 'arquivo errado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer arquivo' }));
    expect(screen.getByRole('button', { name: /Confirmar — não dá para desfazer o desfazer/ })).toBeInTheDocument();
  });
});
