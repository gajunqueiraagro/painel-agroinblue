/**
 * P159b (CONC-TELAS-02, mock `mock-sistema-evolucao-v1.html`) — as abas Sistema e Evolução do saldo do Casar lançamentos. Dado sintético.
 *  Sistema: a lista do mês por dia (`ListaDoMesPorDia`), Centro · Subcentro numa coluna, ✓ no conciliado e ○ âmbar com o status no title (D3).
 *  Evolução: a Dif. do dia (a subtração das duas colunas do mesmo dia), o âmbar e o link no dia em que ela muda, "a diferença nasce aqui",
 *  os dias SEM NENHUMA linha escondidos (D4) e a caixinha que os mostra.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { AbaSistemaReal, AbaEvolucaoReal, montarEvolucao, type EspelhadosReais } from './EspelhoConciliacaoTab';
import { lerLinhaResumo } from '@/lib/conciliacao/resumoDoDono';
import { comProprio } from '@/lib/conciliacao/resumoDoDono.fixture';

const L = (data: string, valor: number, saldo: number, status: 'conciliado' | 'parcial' | 'realizado', o: Record<string, unknown> = {}) => ({
  tipo: 'lancamento', data, valor, lancamento_id: `l-${data}-${valor}`, extrato_id: null, parcial: status === 'parcial', falta: status === 'parcial' ? 300 : null,
  descricao: `Descrição ${valor}`, fornecedor: 'Fornecedor Sintético', centro: 'Pecuária', subcentro: 'Nutrição', status_exibicao: status,
  saldo_apos: saldo, saldo_apos_proprio: saldo, ...o,
});
const LINHA = lerLinhaResumo(comProprio({
  nivel: 'conta', conta_id: 'c1', conta_nome: 'Conta Sintética', tipo_conta: 'cc', consolida_em_conta_id: null, tem_extrato: true,
  saldo_inicial: 1000, saldo_inicial_origem: 'informado', entradas: 50, saidas: -310, entradas_terceiros: 50, entradas_transferencias: 0,
  saidas_terceiros: -310, saidas_transferencias: 0, saldo_sistema: 740, saldo_extrato: null, saldo_extrato_data: null, diferenca: null,
  diferenca_entradas: 0, diferenca_saidas: 0, banco: { entradas: 0, saidas: 0 }, extratos_sem_par: { qtde: 0, valor: 0 },
  lancamentos_sem_par: { qtde: 0, valor: 0 }, retido_em_depositos: { qtde: 0, valor: 0 }, status: 'pendente', motivos: [], avisos: [],
  posicao: null, sem_conta: null,
  /* na ORDEM DO DONO: 01/10 −10 (990), −300 parcial (690), +50 sem par (740) */
  linhas_sistema: [L('2031-10-01', -10, 990, 'conciliado'), L('2031-10-01', -300, 690, 'parcial'), L('2031-10-01', 50, 740, 'realizado', { centro: null })],
}));

describe('P159b — a aba Sistema', () => {
  it('a régua do mock; o maior |valor| primeiro; o saldo só no fim do dia (o do dono, 740)', () => {
    if (!LINHA) throw new Error('linha do dono não lida');
    const { container } = render(<AbaSistemaReal linha={LINHA} />);
    expect([...container.querySelectorAll('col')].map((c) => c.style.width)).toEqual(['44px', '220px', '200px', '', '96px', '100px', '22px']);
    const linhas = screen.getAllByTestId('sistema-linha');
    expect(linhas.map((tr) => tr.children[1].textContent)).toEqual(['Descrição -300', 'Descrição 50', 'Descrição -10']);
    expect(linhas.map((tr) => tr.children[5].textContent)).toEqual(['', '', '740,00']);
    expect(screen.getByTestId('sistema-saldo-final').textContent).toBe('740,00');
  });
  it('D3: ✓ no conciliado; ○ âmbar com o status no title (parcial com a falta; realizado sem par)', () => {
    if (!LINHA) throw new Error('linha do dono não lida');
    render(<AbaSistemaReal linha={LINHA} />);
    const sinais = screen.getAllByTestId('sistema-sinal').map((td) => td.firstElementChild);
    expect(sinais.map((s) => s?.textContent)).toEqual(['○', '○', '✓']);
    expect(sinais[0]?.getAttribute('title')).toMatch(/^parcial · falta R\$\s300,00: /);
    expect(sinais[1]?.getAttribute('title')).toBe('realizado sem par no extrato');
    expect(sinais[0]?.className).toContain('text-amber-600');
  });
  it('Centro · Subcentro numa coluna: o centro em cinza na frente, o title com o mesmo texto', () => {
    if (!LINHA) throw new Error('linha do dono não lida');
    render(<AbaSistemaReal linha={LINHA} />);
    const [comCentro, semCentro] = screen.getAllByTestId('sistema-centro');
    expect(comCentro.textContent).toBe('Pecuária · Nutrição');
    expect(comCentro.getAttribute('title')).toBe('Pecuária · Nutrição');
    expect(comCentro.querySelector('.text-muted-foreground')?.textContent).toBe('Pecuária · ');
    expect(semCentro.textContent).toBe('Nutrição');
  });
});

/* Outubro de 5 dias: 01 casado (−100 × −100); 02 sem par do banco (−50); 03 nada; 04 nada; 05 +100 e −100 sem par (soma 0, COM linha). */
const ofx = (extrato_id: string, data: string, valor: number, status: 'conciliado' | 'sem_vinculo') =>
  ({ extrato_id, data, historico: extrato_id, documento: null, valor, status, flag_dup: false, flag_investimento: false });
const ESP: EspelhadosReais = {
  escopo: { cliente_id: 'c', conta_id: 'c1', ano_mes: '2031-10', nome_conta: 'Conta Sintética' },
  saldos: { inicial: 1000, final_oficial: 850, periodo_ini: '2031-10-01', periodo_fim: '2031-10-05', extrato_ini: '2031-10-01', extrato_fim: '2031-10-05' },
  ofx_completo: [ofx('e1', '2031-10-01', -100, 'conciliado'), ofx('e2', '2031-10-02', -50, 'sem_vinculo'),
    ofx('e3', '2031-10-05', 100, 'sem_vinculo'), ofx('e4', '2031-10-05', -100, 'sem_vinculo')],
  sistema_completo: [{ lancamento_id: 's1', data: '2031-10-01', descricao: 'x', centro: null, subcentro: null, valor_assinado: -100, sinal: '-1', status: 'conciliado' }],
  vinculos: [{ extrato_id: 'e1', lancamento_id: 's1', valor_aplicado: 100, tipo_aprovacao: 'manual', grupo_id: null }],
  versao: 't', gerado_em: 't',
};

describe('P159b — a Evolução do saldo', () => {
  it('montarEvolucao: Dif. do dia = Mov. banco − Mov. sistema; a soma delas é a acumulada; o dia com linha (mesmo somando 0) é marcado', () => {
    const r = montarEvolucao(ESP, new Set());
    expect(r.map((x) => x.difDia)).toEqual([0, -50, 0, 0, 0]);
    expect(r.map((x) => x.temLinha)).toEqual([true, true, false, false, true]);
    expect(r.reduce((a, x) => a + x.difDia, 0)).toBeCloseTo(r[r.length - 1].dif, 6);
  });
  it('D4: os dias sem nenhuma linha somem; a caixinha diz quantos e os traz de volta', () => {
    render(<AbaEvolucaoReal data={ESP} internos={new Set()} />);
    const dias = () => screen.getAllByTestId('evolucao-dia').map((tr) => tr.children[0].textContent);
    expect(dias()).toEqual(['01/10', '02/10', '05/10']);
    expect(screen.getByText('mostrar dias sem movimento (2)')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('evolucao-mostrar-vazios'));
    expect(dias()).toEqual(['01/10', '02/10', '03/10', '04/10', '05/10']);
  });
  it('o dia em que a diferença muda: âmbar, Dif. do dia em negrito, "a diferença nasce aqui" e o link que pede o dia', () => {
    const onVerDia = vi.fn();
    render(<AbaEvolucaoReal data={ESP} internos={new Set()} onVerDia={onVerDia} />);
    const [d1, d2] = screen.getAllByTestId('evolucao-dia');
    expect(d1.hasAttribute('data-muda')).toBe(false);
    expect(within(d1).getByTestId('evolucao-dif-dia').textContent).toBe('—');
    expect(d2.getAttribute('data-muda')).toBe('sim');
    expect(within(d2).getByTestId('evolucao-dif-dia').textContent).toBe('-50,00');
    expect(within(d2).getByTestId('evolucao-nasce').textContent).toBe('a diferença nasce aqui');
    expect(within(d1).queryByTestId('evolucao-ver-dia')).toBeNull();
    fireEvent.click(within(d2).getByTestId('evolucao-ver-dia'));
    expect(onVerDia).toHaveBeenCalledWith('2031-10-02');
  });
  it('a régua do mock: colunas fixas e juntas; o rodapé com a data do extrato e o saldo oficial', () => {
    const { container } = render(<AbaEvolucaoReal data={ESP} internos={new Set()} />);
    expect([...container.querySelectorAll('col')].map((c) => c.style.width)).toEqual(['52px', '104px', '104px', '104px', '104px', '96px', '104px', '']);
    expect(screen.getByTestId('evolucao-rodape').textContent).toContain('Data do extrato 05/10 · saldo final oficial (extrato) 850,00');
  });
});
