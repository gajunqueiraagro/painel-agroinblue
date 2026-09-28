/**
 * OC-CRIAR-DO-LEGADO-01 — o dialogo "Criar OC a partir do legado". A regra mora no banco (`oc_criar_do_legado`, provada em
 * rollback); a RPC aqui e' MOCKADA e o arquivo trava o que a TELA faz: preenche o comprador pelo favorecido, pre-marca a
 * combinacao unica, manda a simulacao com o que esta' marcado, mostra a previa com o rotulo "Recebimento de vendas" e o sinal do
 * caixa, escreve TODAS as pendencias juntas ao lado do botao (sem toast), cria com `p_simular = false` e devolve o id.
 * Numeros do caso de prova (Santa Rita, 692f1957 + 4df4ea15, saidas 8bd25a97 e 9542dccc).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
let respostaCriar: (args: Record<string, unknown>) => unknown = () => ({ ok: false, pendencias: [] });

const SUGESTOES = {
  recebimentos: [{ id: '692f1957', data: '2026-04-16', valor: 591300.38, descricao: 'Venda 315 Desmama M - 1/2', favorecido_id: 'forn-1',
    favorecido: 'Comprador Um', fazenda_id: 'faz-sr', fazenda: 'Faz. Sta. Rita', conta: 'Venda de Desmama Machos', motivo: null }],
  irmas: [
    { id: 'outra', data: '2026-02-01', valor: 50000, descricao: 'Venda 20 Vacas', conta: 'Venda de Vacas' },
    { id: '4df4ea15', data: '2026-04-22', valor: 591300.37, descricao: 'Venda 315 Desmama M - 2/2', conta: 'Venda de Desmama Machos' },
  ],
  saidas: [
    { id: '8bd25a97', data: '2026-03-26', categoria: 'desmama_m', quantidade: 200, peso_medio_kg: 235.92, valor: 707760, origem_registro: null, fornecedor_id: null },
    { id: '9542dccc', data: '2026-03-27', categoria: 'desmama_m', quantidade: 115, peso_medio_kg: 275.27826087, valor: 474855, origem_registro: null, fornecedor_id: null },
    { id: 'x90', data: '2026-05-02', categoria: 'desmama_m', quantidade: 90, peso_medio_kg: 240, valor: 300000, origem_registro: null, fornecedor_id: null },
  ],
  janela: { de: '2026-02-15', ate: '2026-08-14' },
};

const PREVIA_OK = {
  ok: true, simulado: true, operacao_id: null, total: 1182600.75, pendencias: [],
  lotes: [
    { ordem: 1, categoria_negociada: 'desmama_m', qtd_negociada: 200, peso_medio_negociado_kg: 235.92, valor_informado: 707751.47 },
    { ordem: 2, categoria_negociada: 'desmama_m', qtd_negociada: 115, peso_medio_negociado_kg: 275.27826087, valor_informado: 474849.28 },
  ],
  conta_corrente: {
    modelo: 'conta_corrente', entregue: 1182600.75, cab_entregue: 315, recebido: 1182600.75, saldo: 0, situacao: 'quitado',
    linhas: [
      { tipo: 'entrega', data: '2026-03-26', parte_id: 'p1', lote_ordem: 1, cab: 200, descricao: 'Venda 200 DM', conta: 'Venda de Desmama Machos', mov_entrega: -707751.47, saldo: -707751.47 },
      { tipo: 'entrega', data: '2026-03-27', parte_id: 'p2', lote_ordem: 2, cab: 115, descricao: 'Venda 115 DM', conta: 'Venda de Desmama Machos', mov_entrega: -474849.28, saldo: -1182600.75 },
      { tipo: 'recebimento', data: '2026-04-16', parte_id: 'p3', descricao: 'Venda 315 Desmama M - 1/2', conta: 'Adiantamento de Clientes', mov_recebido: 591300.38, saldo: -591300.37 },
      { tipo: 'recebimento', data: '2026-04-22', parte_id: 'p4', descricao: 'Venda 315 Desmama M - 2/2', conta: 'Adiantamento de Clientes', mov_recebido: 591300.37, saldo: 0 },
    ],
  },
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, args });
      if (nome === 'oc_criar_do_legado_sugestoes') {
        const ids = Array.isArray(args.p_recebimentos) ? args.p_recebimentos : [];
        const extra = ids.includes('4df4ea15') ? [{ ...SUGESTOES.irmas[1], favorecido_id: 'forn-1', fazenda_id: 'faz-sr', fazenda: 'Faz. Sta. Rita' }] : [];
        return Promise.resolve({ data: { ...SUGESTOES, recebimentos: [...SUGESTOES.recebimentos, ...extra], irmas: ids.includes('4df4ea15') ? [SUGESTOES.irmas[0]] : SUGESTOES.irmas }, error: null });
      }
      return Promise.resolve({ data: respostaCriar(args), error: null });
    },
  },
}));

/* O seletor da casa tem Popover e busca; aqui so' interessa o id escolhido. */
vi.mock('@/components/shared/FavorecidoSelect', () => ({
  FavorecidoSelect: ({ value, onChange }: { value: string; onChange: (id: string) => void }) => (
    <select aria-label="Comprador" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">—</option><option value="forn-1">Comprador Um</option>
    </select>
  ),
}));

import { CriarOCDoLegadoDialog } from './CriarOCDoLegadoDialog';
import type { FornecedorV2 } from '@/hooks/useFinanceiroV2';

const FORNECEDORES: FornecedorV2[] = [];

const simulacoes = () => chamadas.filter(c => c.nome === 'oc_criar_do_legado' && c.args.p_simular === true);
const ultimaSimulacao = () => simulacoes()[simulacoes().length - 1]?.args;

function montar(onCriada = vi.fn()) {
  render(<CriarOCDoLegadoDialog clienteId="cli-sr" lancamentoId="692f1957" fornecedores={FORNECEDORES} onCriada={onCriada} onFechar={vi.fn()} />);
  return onCriada;
}

beforeEach(() => {
  chamadas.length = 0;
  respostaCriar = (args) => (args.p_simular ? PREVIA_OK : { ...PREVIA_OK, simulado: false, operacao_id: 'op-nova' });
});

describe('Criar OC a partir do legado', () => {
  it('preenche o comprador pelo favorecido e pre-marca a combinacao unica que fecha as 315 cabecas', async () => {
    montar();
    await waitFor(() => expect(screen.getByLabelText('Comprador')).toHaveValue('forn-1'));
    const marcada = (id: string) => screen.getByTestId('saidas').querySelector(`tr[data-saida="${id}"] button[role="checkbox"]`)?.getAttribute('data-state');
    expect(marcada('8bd25a97')).toBe('checked');
    expect(marcada('9542dccc')).toBe('checked');
    expect(marcada('x90')).toBe('unchecked');
    expect(screen.getByTestId('cab-marcadas').textContent).toBe('315');
    await waitFor(() => expect(ultimaSimulacao()).toBeDefined());
    const a = ultimaSimulacao();
    expect(a?.p_saidas).toEqual([{ lancamento_id: '8bd25a97' }, { lancamento_id: '9542dccc' }]);
    expect(a?.p_dados).toEqual({ fazenda_id: 'faz-sr', contraparte_id: 'forn-1' });
    expect(a?.p_criterio_valor).toBe('recebimentos');
    expect(a?.p_recebimentos).toEqual(['692f1957']);
  });

  it('a previa: lotes com R$/kg, "Recebimento de vendas" no lugar da conta de adiantamento, entrega negativa e saldo zero', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('previa')).toBeInTheDocument());
    const previa = screen.getByTestId('previa');
    expect(previa.textContent).toContain('Recebimento de vendas');
    expect(previa.textContent).not.toContain('Adiantamento de Clientes');
    expect(previa.textContent).toContain('Venda 200 DM');
    const entrega = previa.querySelector('tr[data-tipo="entrega"]');
    const celulaEntrega = entrega?.querySelectorAll('td')[6];
    expect(celulaEntrega?.textContent).toBe('−707.751,47');
    expect(celulaEntrega?.className).toContain('text-[#b91c1c]');
    const receb = previa.querySelector('tr[data-tipo="recebimento"] td:nth-child(8)');
    expect(receb?.className).toContain('text-[#15803d]');
    expect(screen.getByTestId('saldo-previa').textContent).toBe('0,00');
    const lotes = screen.getByTestId('lotes-previa').textContent ?? '';
    expect(lotes).toContain('707.751,47');
    expect(lotes).toContain('15,00');
    expect(screen.getByTestId('resumo-previa').textContent).toContain('mar/26');
  });

  it('as pendencias do banco aparecem TODAS juntas ao lado do botao, e o Criar OC fica travado', async () => {
    respostaCriar = () => ({ ok: false, simulado: true, pendencias: ['Informe o comprador', 'Marque ao menos uma saida de gado'] });
    montar();
    await waitFor(() => expect(screen.getByTestId('pendencias')).toBeInTheDocument());
    expect(screen.getByTestId('pendencias').textContent).toBe('Informe o compradorMarque ao menos uma saida de gado');
    expect(screen.getByRole('button', { name: 'Criar OC' })).toBeDisabled();
  });

  it('desmarcar uma saida e trocar o criterio refazem a simulacao com o que esta na tela', async () => {
    montar();
    await waitFor(() => expect(ultimaSimulacao()?.p_saidas).toHaveLength(2));
    const cb = screen.getByTestId('saidas').querySelector('tr[data-saida="9542dccc"] button[role="checkbox"]');
    if (cb) fireEvent.click(cb);
    await waitFor(() => expect(ultimaSimulacao()?.p_saidas).toEqual([{ lancamento_id: '8bd25a97' }]));
    fireEvent.click(screen.getByRole('radio', { name: /Outro total/ }));
    fireEvent.change(screen.getByLabelText('Total da venda'), { target: { value: '1.200.000,50' } });
    await waitFor(() => expect(ultimaSimulacao()?.p_valor_outro).toBe(1200000.5));
    expect(ultimaSimulacao()?.p_criterio_valor).toBe('outro');
  });

  it('Somar outro recebimento: a parcela irma vem primeiro e entra nos recebimentos da simulacao', async () => {
    montar();
    await waitFor(() => expect(screen.getByText('+ Somar outro recebimento')).toBeInTheDocument());
    fireEvent.click(screen.getByText('+ Somar outro recebimento'));
    const itens = screen.getByTestId('irmas').querySelectorAll('li');
    expect(itens[0].textContent).toContain('2/2');
    const botao = itens[0].querySelector('button');
    if (botao) fireEvent.click(botao);
    await waitFor(() => expect(ultimaSimulacao()?.p_recebimentos).toEqual(['692f1957', '4df4ea15']));
  });

  it('Criar OC grava com p_simular = false, os mesmos argumentos da previa, e devolve o id da OC', async () => {
    const onCriada = montar();
    const botao = await screen.findByRole('button', { name: 'Criar OC' });
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    await waitFor(() => expect(onCriada).toHaveBeenCalledWith('op-nova'));
    const gravou = chamadas.filter(c => c.nome === 'oc_criar_do_legado' && c.args.p_simular === false);
    expect(gravou).toHaveLength(1);
    const { p_simular: _s, ...resto } = gravou[0].args;
    const { p_simular: _t, ...daPrevia } = ultimaSimulacao() ?? {};
    expect(resto).toEqual(daPrevia);
  });

  it('recusa na gravacao fica ao lado do botao e nao chama onCriada', async () => {
    respostaCriar = (args) => (args.p_simular ? PREVIA_OK : { ok: false, pendencias: ['Saida 8bd25a97 ja esta em outra OC'] });
    const onCriada = montar();
    const botao = await screen.findByRole('button', { name: 'Criar OC' });
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByText('Saida 8bd25a97 ja esta em outra OC')).toBeInTheDocument());
    expect(onCriada).not.toHaveBeenCalled();
  });
});
