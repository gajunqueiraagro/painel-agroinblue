/**
 * CONC-SUGESTOES-V2 — REGRA DE FINANCIAMENTO (Gabriel 26/11 07:07/07:09) e os ajustes das 07:45 no modal único "Sugestões para casar".
 * A parcela aberta do credor (amortização + juros, o mesmo `parcela_id` do motor) é UMA linha: "contrato · k/N · venc." na Descrição, o
 * credor no Fornecedor, o nº do CONTRATO na coluna NF/DOC, selo âmbar quando o valor difere e o prazo ("adiantado N dias úteis").
 * Casar = os DOIS lançamentos ao "Casar com o banco". O clique na Descrição abre o mini-modal SÓ LEITURA (Casar · Fechar).
 * Nomes e números SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const DB = vi.hoisted(() => ({ tabelas: {} as Record<string, unknown[]>, motor: [] as unknown[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => {
      const q = { select: () => q, eq: () => q, in: () => Promise.resolve({ data: DB.tabelas[t] ?? [], error: null }),
        maybeSingle: () => Promise.resolve({ data: (DB.tabelas[t] ?? [])[0] ?? null, error: null }) };
      return q;
    },
    rpc: (fn: string) => {
      if (fn === 'fn_candidatos_conciliacao') return Promise.resolve({ data: DB.motor, error: null });
      if (fn === 'fn_vencimentos_declarados') return Promise.resolve({ data: [], error: null });
      if (fn === 'fn_financiamento_situacao') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  },
}));
vi.mock('@/components/conciliacao/CriarLancamentoDaLinha', () => ({ CriarLancamentoDaLinha: () => null }));

import { SugestoesCasarModal, type Marcado } from './SugestoesCasarModal';

const linhaDoMotor = (id: string, valor: string, x: Record<string, unknown> = {}) => ({
  id, descricao: id === 'am' ? 'FCO Curral - amortização 1/12' : 'FCO Curral - juros 1/12', favorecido: 'Banco Cooperativo Teste',
  numero_documento: null, data_referencia: '2026-11-01', valor, status: 'programado', ja_conciliado: '0', saldo: valor, delta_valor: '0',
  delta_dias: 2, score: 60, pre_marcado: false, ambiguo: false, indisponivel: false, motivo_indisponivel: null, vencimento: '2026-11-01',
  conta_bancaria_id: 'cc-outra', conta_nome: 'Cooperativa Pecuária', outra_conta: true, documento_casa: null, exata: false, origem: 'lancamento',
  parcela_id: 'p1', parcela_rotulo: 'FCO - Curral · 1/12 · venc. 01/11', dias_uteis: 1, ...x,
});
const EXT = { data: '2026-11-03', historico: 'LIQUIDACAO DE PARCELA OPER CREDITO', valor: -16831.69 };

beforeEach(() => {
  DB.motor = [linhaDoMotor('am', '9000.00'), linhaDoMotor('ju', '8484.93')];
  DB.tabelas = {
    financiamento_parcelas: [{ id: 'p1', financiamento_id: 'f1', numero_parcela: 1, data_vencimento: '2026-11-01', valor_principal: 9000, valor_juros: 8484.93 }],
    financiamentos: [{ id: 'f1', descricao: 'FCO - Curral', numero_contrato: 'C11122233-0', total_parcelas: 12, credor_id: 'cr' }],
    financeiro_fornecedores: [{ id: 'cr', nome: 'Banco Cooperativo Teste' }],
  };
});

function abrir(onCasarSelecionados = vi.fn()) {
  render(<SugestoesCasarModal open onClose={() => {}} extrato={EXT} nomeConta="Cooperativa Lavoura" sugestoes={[]} onCasar={vi.fn()}
    clienteId="cli" extratoId="e1" onCasarSelecionados={onCasarSelecionados} />);
  return { modal: screen.getByTestId('sugestoes-casar'), onCasarSelecionados };
}

describe('a parcela de financiamento nas Sugestões', () => {
  it('amortização + juros = UMA linha: rótulo da parcela, credor, nº do contrato no NF/DOC, selo âmbar "valor difere" + o prazo', async () => {
    const { modal } = abrir();
    const linha = await within(modal).findByTestId('parcela');
    expect(within(modal).getAllByTestId('parcela')).toHaveLength(1);
    expect(within(modal).queryByTestId('do-motor')).toBeNull();
    expect(linha.textContent).toContain('FCO - Curral · 1/12 · venc. 01/11');
    await waitFor(() => expect(linha.textContent).toContain('C11122233-0'));
    expect(linha.textContent).toContain('17.484,93');
    const selo = within(linha).getByTestId('parcela-motivo');
    expect(selo.textContent).toBe('parcela · valor difere · 1 dia útil de atraso');
    expect(selo.className).toContain('amber');
    expect(within(modal).getByTestId('faixa-possiveis').textContent).toContain('· 1');
  });

  it('Casar leva os DOIS lançamentos (de outra conta) ao "Casar com o banco"; marcar a linha marca os dois', async () => {
    const { modal, onCasarSelecionados } = abrir();
    const linha = await within(modal).findByTestId('parcela');
    fireEvent.click(within(linha).getByRole('checkbox'));
    expect(within(modal).getByTestId('selecionados-n').textContent).toBe('Selecionados 2');
    fireEvent.click(within(linha).getByTestId('parcela-casar'));
    const levados: Marcado[] = onCasarSelecionados.mock.calls[0][0];
    expect(levados.map((m) => (m.de === 'motor' ? m.c.id : '?'))).toEqual(['am', 'ju']);
  });

  it('o clique na Descrição abre o mini-modal SÓ LEITURA: contrato, credor, cédula, k/N, previstos; Casar · Fechar', async () => {
    const { modal, onCasarSelecionados } = abrir();
    const linha = await within(modal).findByTestId('parcela');
    await waitFor(() => expect(linha.textContent).toContain('C11122233-0'));
    fireEvent.click(within(linha).getByTestId('parcela-abrir'));
    const d = await screen.findByTestId('detalhe-sugestao');
    expect(within(d).getByTestId('detalhe-contrato').textContent).toContain('FCO - Curral');
    expect(within(d).getByTestId('detalhe-cedula').textContent).toContain('C11122233-0');
    expect(d.textContent).toContain('1/12');
    expect(d.textContent).toContain('Banco Cooperativo Teste');
    expect(d.textContent).toContain('9.000,00');
    expect(d.textContent).toContain('8.484,93');
    expect(d.querySelector('input, textarea, select')).toBeNull();
    fireEvent.click(within(d).getByTestId('detalhe-casar'));
    expect(onCasarSelecionados).toHaveBeenCalledTimes(1);
  });
});
