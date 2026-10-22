/**
 * FIN-CLASSIF-DIVIDIDA-01b/01c — as peças de tela: o "Dividir…" à mão (valor/%, simula e depois grava; parcela = no cadastro, só %), o
 * modal do motivo, a conta de cada item (o seletor do plano) e as células da lista (parte + "de R$ total", o selo). Dados SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ClassificacaoItem } from '@/hooks/useFinanceiroV2';
import type { ResultadoDaDivisao } from '@/lib/financeiro/divisaoDaClassificacao';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
const div = vi.hoisted(() => ({
  dividir: vi.fn(async (..._a: unknown[]): Promise<ResultadoDaDivisao> => ({ ok: true, valor: { frase: '"Material" fica dividido em 2 contas; continua um lançamento só (um pagamento, uma conciliação).', fraseNota: null, operacaoId: 'op1', partes: [] } })),
}));
vi.mock('@/lib/financeiro/divisaoDaClassificacao', async (orig) => ({ ...(await orig<object>()), ...div }));

import { DividirClassificacaoDialog, MotivoDaDivisaoDialog } from './DivisaoDialogs';
import { ContasDosItens } from './ContasDosItens';
import { ClassificacaoComSelo, ValorDaParte } from './CelulasDaDivisao';

const CLASSIF: ClassificacaoItem[] = [
  { id: 'pl-inv', subcentro: 'Investimento em Instalações Pecuária', centro_custo: 'Infraestrutura', grupo_custo: 'Investimentos', macro_custo: 'Investimento na Fazenda', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
  { id: 'pl-man', subcentro: 'Manutenção de Instalações Pecuária', centro_custo: 'Infraestrutura', grupo_custo: 'Manutenção', macro_custo: 'Custeio Produtivo', tipo_operacao: '2-Saídas', escopo_negocio: 'pecuaria' },
];
const n = (t: string | null | undefined) => (t ?? '').replace(/\s/g, ' ');
beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  div.dividir.mockClear();
});
/** abre o seletor de conta de dentro de `el` e escolhe a conta pelo nome */
function escolherConta(el: HTMLElement, nome: string) {
  fireEvent.click(within(el).getByRole('combobox'));
  fireEvent.click(screen.getAllByText(nome).find((x) => x.closest('[role="dialog"], [data-radix-popper-content-wrapper]'))!);
}

describe('DividirClassificacaoDialog', () => {
  const LANC = { id: 'l1', valor: -9583, tipo_operacao: '2-Saídas', financiamento_id: null, plano_conta_id: 'pl-inv' };
  it('por valor: a soma confere, o primeiro clique SIMULA (a frase do banco) e o segundo grava', async () => {
    const onDividido = vi.fn();
    render(<DividirClassificacaoDialog clienteId="cli" lancamento={LANC} classificacoes={CLASSIF} partesDeHoje={[]} onDividido={onDividido} onClose={() => {}} />);
    const [l1, l2] = screen.getAllByTestId('dividir-linha');
    expect(n(screen.getByTestId('dividir-soma').textContent)).toBe('✓ soma = valor do lançamento');
    escolherConta(within(l2).getByTestId('dividir-conta-1'), 'Manutenção de Instalações Pecuária');
    const [v1, v2] = [l1, l2].map((l) => l.querySelector('input')!);
    fireEvent.change(v1, { target: { value: '8.528,00' } }); fireEvent.blur(v1);
    expect(n(screen.getByTestId('dividir-soma').textContent)).toBe('faltam R$ 1.055,00');
    fireEvent.change(v2, { target: { value: '1.055,00' } }); fireEvent.blur(v2);
    expect(n(screen.getByTestId('dividir-soma').textContent)).toBe('✓ soma = valor do lançamento');
    const botao = screen.getByTestId('dividir-confirmar') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);                                         // sem motivo, não anda
    fireEvent.change(screen.getByTestId('dividir-motivo'), { target: { value: 'nota com material de manutenção' } });
    fireEvent.click(botao);
    await waitFor(() => expect(div.dividir).toHaveBeenCalledTimes(1));
    expect(div.dividir.mock.calls[0]).toEqual(['cli', { lancamentoId: 'l1', financiamentoId: null },
      [{ plano_conta_id: 'pl-inv', valor: 8528 }, { plano_conta_id: 'pl-man', valor: 1055 }], 'nota com material de manutenção', true]);
    await waitFor(() => expect(botao.textContent).toBe('Confirmar a divisão'));
    expect(screen.getByTestId('dividir-previa').textContent).toContain('fica dividido em 2 contas');
    expect(onDividido).not.toHaveBeenCalled();
    fireEvent.click(botao);
    await waitFor(() => expect(div.dividir).toHaveBeenCalledTimes(2));
    expect(div.dividir.mock.calls[1][4]).toBe(false);
    await waitFor(() => expect(onDividido).toHaveBeenCalledTimes(1));
  });
  it('a recusa do banco aparece pronta e nada é gravado', async () => {
    div.dividir.mockImplementationOnce(async () => ({ ok: false, frase: 'Setembro de 2026 está fechado no Financeiro para Faz. Pureza. Reabra o mês para dividir.' }));
    render(<DividirClassificacaoDialog clienteId="cli" lancamento={LANC} classificacoes={CLASSIF}
      partesDeHoje={[{ plano_conta_id: 'pl-inv', valor: 8528, percentual: 88.99 }, { plano_conta_id: 'pl-man', valor: 1055, percentual: 11.01 }]} onDividido={vi.fn()} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('dividir-motivo'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('dividir-confirmar'));
    await waitFor(() => expect(screen.getByTestId('dividir-erro').textContent).toBe('⚠ Setembro de 2026 está fechado no Financeiro para Faz. Pureza. Reabra o mês para dividir.'));
    expect(div.dividir).toHaveBeenCalledTimes(1);
  });
  it('parcela: só por %, no CADASTRO, com o aviso das parcelas', async () => {
    render(<DividirClassificacaoDialog clienteId="cli" lancamento={{ ...LANC, financiamento_id: 'fin-1' }} classificacoes={CLASSIF}
      partesDeHoje={[{ plano_conta_id: 'pl-inv', valor: 8528, percentual: 89 }, { plano_conta_id: 'pl-man', valor: 1055, percentual: 11 }]} onDividido={vi.fn()} onClose={() => {}} />);
    expect(screen.getByTestId('dividir-aviso-parcelas')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Por valor' })).toBeNull();
    fireEvent.change(screen.getByTestId('dividir-motivo'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('dividir-confirmar'));
    await waitFor(() => expect(div.dividir).toHaveBeenCalledTimes(1));
    expect(div.dividir.mock.calls[0][1]).toEqual({ lancamentoId: 'l1', financiamentoId: 'fin-1' });
    expect(div.dividir.mock.calls[0][2]).toEqual([{ plano_conta_id: 'pl-inv', percentual: 89 }, { plano_conta_id: 'pl-man', percentual: 11 }]);
  });
});

describe('MotivoDaDivisaoDialog', () => {
  it('motivo obrigatório; a recusa do banco fica no modal (que não fecha)', async () => {
    const onClose = vi.fn();
    const confirmar = vi.fn(async (_m: string) => undefined);
    render(<MotivoDaDivisaoDialog titulo="Desfazer" explicacao="x" botao="Desfazer" confirmar={async (m) => { await confirmar(m); return { ok: false, frase: 'Houve outra divisão depois desta: desfaça a mais recente antes.' }; }} onClose={onClose} />);
    const botao = screen.getByTestId('divisao-confirmar') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('divisao-motivo-texto'), { target: { value: 'errei' } });
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByTestId('divisao-erro').textContent).toBe('⚠ Houve outra divisão depois desta: desfaça a mais recente antes.'));
    expect(confirmar).toHaveBeenCalledWith('errei');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ContasDosItens — a conta de cada item', () => {
  const ITENS = [154000, 100000, 105500].map((liquidoCent, k) => ({ nItem: k + 1, codigo: null, descricao: `Item ${k + 1}`, liquidoCent }));
  const props = { itens: ITENS, classificacoes: CLASSIF, tipoOperacao: '2-Saídas', gravando: false };
  it('troca a conta de um item: o resumo soma por conta e o "Dividir" leva a conta de CADA item', () => {
    const onDividir = vi.fn();
    render(<ContasDosItens {...props} contaDeHoje="pl-inv" sugeridas={new Map()} onDividir={onDividir} />);
    escolherConta(screen.getByTestId('conta-do-item-3'), 'Manutenção de Instalações Pecuária');
    expect(screen.getAllByTestId('contas-resumo-conta').map((c) => n(c.textContent))).toEqual([
      'Investimento em Instalações PecuáriaR$ 2.540,00 · 70,7%', 'Manutenção de Instalações PecuáriaR$ 1.055,00 · 29,3%']);
    fireEvent.click(screen.getByTestId('contas-dividir'));
    expect([...onDividir.mock.calls[0][0]]).toEqual([[1, 'pl-inv'], [2, 'pl-inv'], [3, 'pl-man']]);
  });
  it('item sem conta impede, com a frase; a sugestão aprendida vence a conta de hoje', () => {
    render(<ContasDosItens {...props} contaDeHoje={null} sugeridas={new Map([[1, 'pl-inv'], [3, 'pl-man']])} onDividir={vi.fn()} />);
    expect(screen.getByTestId('contas-frase').textContent).toBe('Faltam 1 de 3 itens sem conta. Escolha a conta de cada item.');
    expect((screen.getByTestId('contas-dividir') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Células da lista (01c)', () => {
  it('o filtro pega parte: "1 de 2 contas" e a parte com "de R$ 9.583,00"; sem filtro: "dividido"', () => {
    const { rerender } = render(<ClassificacaoComSelo texto="Manutenção de Instalações Pecuária" dividida={{ parte: 1055, total: 9583, casadas: 1, partes: 2 }} />);
    expect(screen.getByTestId('selo-divisao').textContent).toBe('1 de 2 contas');
    rerender(<ClassificacaoComSelo texto="Investimento" dividida={{ parte: null, total: 9583, casadas: 2, partes: 2 }} />);
    expect(screen.getByTestId('selo-divisao').textContent).toBe('dividido');
    render(<ValorDaParte textoDaParte="-R$ 1.055,00" total={9583} />);
    expect(screen.getByTestId('valor-da-parte').textContent).toBe('-R$ 1.055,00');
    expect(n(screen.getByTestId('valor-de-total').textContent)).toBe('de R$ 9.583,00');
    expect(screen.getByTestId('valor-de-total').className).toContain('valor-de-total');
  });
});
