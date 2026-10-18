/**
 * FIN-CONTRATO-JUNTAR-01 — o diálogo "Juntar", o "Desfazer" do Histórico e o selo "juntado" da lista.
 * O banco é de mentira: a tela só desenha o que ele devolve (antes × depois) e grava pela RPC depois da confirmação.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/ui/searchable-select', () => ({
  SearchableSelect: ({ value, onValueChange, options, semTodos }:
    { value: string; onValueChange: (v: string) => void; options: { value: string; label: string }[]; semTodos?: boolean }) => (
    <select value={value} data-testid="select-fake" onChange={e => onValueChange(e.target.value)}>
      {!semTodos && <option value="">todos</option>}
      <option value="">—</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

import { BotaoJuntar, JuntarContratoDialog } from '@/components/financiamentos/JuntarContrato';
import { TabelaDoHistorico } from '@/components/financiamentos/TelaDoContratoV3';
import { SeloDoContrato } from '@/components/financiamentos/ListaDeFinanciamentos';
import { lerResultadoDaJuncao, liberadoDiverge, type ResultadoDaJuncao } from '@/lib/financiamentos/juntarContratos';
import { lerTelaDoContrato } from '@/lib/financiamentos/telaDoContrato';

const resumo = (id: string, numero: string, contratado: number, liberado: number, parcelas: number) =>
  ({ id, numero_contrato: numero, status: 'ativo', contratado, liberado, saldo: liberado, parcelas, cronograma: [] });
const SIMULACAO = {
  simulado: true, recusa: null,
  antes: { mantido: resumo('m', 'PR-78.192', 318465, 318465, 10), absorvido: resumo('a', 'PR-78.192', 636930, 636939, 10) },
  depois: resumo('m', 'PR-78.192', 955395, 955404, 10),
  lancamentos: { cancelados: 36, criados: 18 },
};

function apiFalsa(juntar: (id: string, simular: boolean) => Promise<unknown>) {
  return {
    lerJuntaveis: vi.fn(async () => [{ id: 'a', numero: 'PR-78.192', descricao: 'Recuperação de Solo', valor: 636930 }]),
    juntar: vi.fn(async (id: string, simular: boolean): Promise<ResultadoDaJuncao | string> => {
      const raw = await juntar(id, simular);
      return typeof raw === 'string' ? raw : lerResultadoDaJuncao(raw) ?? 'torta';
    }),
  };
}

describe('FIN-CONTRATO-JUNTAR-01 · diálogo Juntar', () => {
  it('simula ao escolher, mostra antes × depois do banco e a divergência liberado × contratado', async () => {
    const api = apiFalsa(async () => SIMULACAO);
    render(<JuntarContratoDialog api={api} numero="PR-78.192" aoFechar={() => {}} />);
    await waitFor(() => expect(api.lerJuntaveis).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('option', { name: /Recuperação de Solo/ })).toBeTruthy());
    expect(screen.getByTestId('gravar-juncao')).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByTestId('select-fake'), { target: { value: 'a' } });
    await waitFor(() => expect(screen.getByTestId('depois-contratado').textContent).toBe('955.395,00'));
    expect(api.juntar).toHaveBeenCalledWith('a', true);
    expect(screen.getByTestId('depois-liberado').textContent).toBe('955.404,00');
    expect(screen.getByTestId('depois-liberado').className).toContain('text-amber-700');
    expect(screen.getByTestId('depois-contratado').className).not.toContain('text-amber-700');
    expect(screen.getByTestId('previa-da-juncao').textContent).toContain('36 lançamento(s)');
    expect(screen.getByTestId('gravar-juncao')).toHaveProperty('disabled', false);
  });

  it('grava só depois da confirmação, pela RPC com simular = false', async () => {
    const api = apiFalsa(async (_id, simular) => (simular ? SIMULACAO : { ...SIMULACAO, simulado: false, juncao_id: 'j1' }));
    const fechar = vi.fn();
    render(<JuntarContratoDialog api={api} numero="PR-78.192" aoFechar={fechar} />);
    await waitFor(() => expect(screen.getByRole('option', { name: /Recuperação de Solo/ })).toBeTruthy());
    fireEvent.change(screen.getByTestId('select-fake'), { target: { value: 'a' } });
    await waitFor(() => expect(screen.getByTestId('gravar-juncao')).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByTestId('gravar-juncao'));
    expect(api.juntar).not.toHaveBeenCalledWith('a', false);
    expect(screen.getByTestId('confirmacao-da-juncao').textContent).toContain('juntado ao PR-78.192');
    fireEvent.click(screen.getByTestId('confirmar-juncao'));
    await waitFor(() => expect(api.juntar).toHaveBeenCalledWith('a', false));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
  });

  it('a recusa do banco fica escrita no diálogo e o Juntar fica apagado', async () => {
    const api = apiFalsa(async () => ({ simulado: true, recusa: { motivo: 'banco', frase: 'Não dá para juntar: PR-1 (absorvido): A parcela 1 já está paga.' } }));
    render(<JuntarContratoDialog api={api} numero="PR-78.192" aoFechar={() => {}} />);
    await waitFor(() => expect(screen.getByRole('option', { name: /Recuperação de Solo/ })).toBeTruthy());
    fireEvent.change(screen.getByTestId('select-fake'), { target: { value: 'a' } });
    await waitFor(() => expect(screen.getByTestId('previa-da-juncao').textContent).toContain('já está paga'));
    expect(screen.getByTestId('previa-da-juncao').className).toContain('text-destructive');
    expect(screen.getByTestId('gravar-juncao')).toHaveProperty('disabled', true);
  });

  it('o botão só acende em contrato vigente', () => {
    const { rerender } = render(<BotaoJuntar status="ativo" onAbrir={() => {}} />);
    expect(screen.getByTestId('botao-juntar')).toHaveProperty('disabled', false);
    rerender(<BotaoJuntar status="quitado" onAbrir={() => {}} />);
    expect(screen.getByTestId('botao-juntar')).toHaveProperty('disabled', true);
  });

  it('peça torta = leitura nula; liberado ≠ contratado compara ao centavo', () => {
    expect(lerResultadoDaJuncao({ simulado: true, recusa: null, antes: {} })).toBeNull();
    const r = lerResultadoDaJuncao(SIMULACAO);
    expect(r?.depois && liberadoDiverge(r.depois)).toBe(true);
    expect(r?.antes && liberadoDiverge(r.antes.mantido)).toBe(false);
  });
});

describe('FIN-CONTRATO-JUNTAR-01 · Histórico e lista', () => {
  const tela = lerTelaDoContrato({
    condicoes: { taxa: null, unidade: null, taxa_aa: null, sistema: null, carencia_ate: null, tipo_taxa: null, periodicidade: null },
    contrato: { data_contrato: null, vencimento_final: null, atividade: null, credor: null, credor_documento: null, primeira_liberacao: null, ultima_liberacao: null, vencidas: 0 },
    liberacoes: [], liberacoes_total: { qtde: 0, liberado: 0, entrou: 0, a_identificar: 0, excedente: 0 },
    pagamentos: [], pagamentos_total: { qtde: 0, principal: 0, juros: 0, encargos: 0, total: 0 },
    historico: [
      { data: '2026-10-18', evento: 'Juntado com PR-78.192', valor: null, juncao_id: 'j1', desfazivel: true },
      { data: '2026-10-17', evento: 'Juntado com PR-1 · desfeito em 17/10/2026', valor: null, juncao_id: 'j0', desfazivel: false },
      { data: '2025-11-21', evento: 'Liberação · em conta', valor: 318465 },
    ],
    a_resolver: [],
  });

  it('só a junção viva tem Desfazer, e ele leva o id e o evento', () => {
    const desfazer = vi.fn();
    render(<TabelaDoHistorico tela={tela} onDesfazerJuncao={desfazer} />);
    const botoes = screen.getAllByTestId('desfazer-juncao');
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]);
    expect(desfazer).toHaveBeenCalledWith('j1', 'Juntado com PR-78.192');
  });

  it('o absorvido aparece com o selo "juntado"', () => {
    render(<SeloDoContrato status="cancelado" juntado />);
    expect(screen.getByTestId('selo-juntado').textContent).toBe('juntado');
  });
});
