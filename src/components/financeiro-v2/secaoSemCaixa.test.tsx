/**
 * FIN-V2-SEM-CAIXA-01 — o Financeiro V2 mostra so' dinheiro por padrao; o sem caixa vai para uma secao separada.
 * Aqui se trava: o filtro de caixa no plano da lista (o padrao nao traz os sem caixa, a secao so' os traz), a secao (uma
 * informacao por coluna, Cab das entregas, conta pelo nome de exibicao, OC clicavel, total em centavos, sem checkbox) e o
 * rotulo de tela das contas de adiantamento (item 6: so' rotulo, o plano nao muda).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => {
  const partes = [{ financeiro_lancamento_id: 'e1', lancamentos: { quantidade: 178 } }, { financeiro_lancamento_id: 'e2', lancamentos: { quantidade: 6 } }];
  const b: Record<string, unknown> = {};
  b.select = () => b; b.in = () => b; b.eq = () => b;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: partes, error: null }).then(ok);
  return { supabase: { from: () => b } };
});

import { SecaoSemCaixa, CelulaOC, totalSemCaixa, codigoOC, type LinhaSemCaixa } from './SecaoSemCaixa';
import { rotuloDaConta } from '@/lib/financeiro/rotuloConta';
import { aplicarPlanoNaView, planoDaLista, type BuilderView } from '@/lib/financeiro/listaPaginadaV2';
import type { FiltrosV2 } from '@/lib/financeiro/filtrosBaseV2';

/* Construtor falso e tipado (o molde de `listaPaginadaV2.test.ts`): registra cada chamada do plano. */
function construtor() {
  const chamadas: string[] = [];
  const r = (m: string, ...a: unknown[]) => { chamadas.push(`${m}(${a.map(String).join(',')})`); };
  const b: BuilderView = {
    eq(c, v) { r('eq', c, v); return b; },
    neq(c, v) { r('neq', c, v); return b; },
    in(c, vs) { r('in', c, vs); return b; },
    not(c, o, v) { r('not', c, o, v); return b; },
    or(f) { r('or', f); return b; },
    order(c) { r('order', c); return b; },
    range(x, y) { r('range', x, y); return b; },
    then(ok, falha) { return Promise.resolve({ data: [], count: null, error: null }).then(ok, falha); },
  };
  return { b, chamadas };
}
const FILTROS: FiltrosV2 = { ano: '2025' };

const ENTREGA: LinhaSemCaixa = { id: 'e1', data_competencia: '2025-03-19', descricao: 'Venda 178 DM', subcentro: 'Venda de Desmama Machos', valor: 565521.66, sinal: '1' };
const ENTREGA_G: LinhaSemCaixa = { id: 'e2', data_competencia: '2025-05-21', descricao: 'Venda 006 G', subcentro: 'Venda de Machos Adultos', valor: 18030.34, sinal: '1' };
const BARTER: LinhaSemCaixa = { id: 'b1', data_competencia: '2025-01-10', descricao: 'Insumo barter', subcentro: 'Fertilizantes', valor: 0.1, sinal: '-1' };

describe('filtro de caixa no plano da lista', () => {
  it("padrao 'com' so traz caixa (nulo conta como caixa); 'sem' so os sem caixa; ausente = os dois, como antes", () => {
    const base = planoDaLista('cli', FILTROS, {});
    const com = construtor(); aplicarPlanoNaView(com.b, { ...base, caixa: 'com' });
    expect(com.chamadas).toContain('or(sem_movimentacao_caixa.is.null,sem_movimentacao_caixa.eq.false)');
    const sem = construtor(); aplicarPlanoNaView(sem.b, { ...base, caixa: 'sem' });
    expect(sem.chamadas).toContain('eq(sem_movimentacao_caixa,true)');
    const nada = construtor(); aplicarPlanoNaView(nada.b, base);
    expect(nada.chamadas.some(c => c.includes('sem_movimentacao_caixa'))).toBe(false);
    /* a busca sabe achar: o plano leva o slot quando pedido pela opcao da pagina */
    expect(planoDaLista('cli', FILTROS, { caixa: 'com' }).caixa).toBe('com');
  });
});

describe('secao sem caixa', () => {
  it('uma informacao por coluna, Cab das entregas, conta pelo nome, ordem pela competencia, sem checkbox', async () => {
    const abrir = vi.fn();
    render(<SecaoSemCaixa linhas={[ENTREGA_G, BARTER, ENTREGA]} ocDe={id => (id.startsWith('e') ? { operacaoId: '232c05aa-e531-4f91', tipo: 'venda', ehBoitel: false, foraDoDre: false } : undefined)} onAbrirOC={abrir} />);
    const secao = screen.getByTestId('secao-sem-caixa');
    expect(secao.textContent).toContain('Lançamentos sem caixa');
    expect(within(secao).queryByRole('checkbox')).toBeNull();
    const linhas = secao.querySelectorAll('tbody tr[data-sem-caixa]');
    expect([...linhas].map(r => r.getAttribute('data-sem-caixa'))).toEqual(['b1', 'e1', 'e2']);
    await waitFor(() => expect(linhas[1].querySelectorAll('td')[2].textContent).toBe('178'));
    const e1 = linhas[1].querySelectorAll('td');
    expect(e1[0].textContent).toBe('19/03/25');
    expect(e1[1].textContent).toBe('Venda 178 DM');
    expect(e1[3].textContent).toBe('Venda de Desmama Machos');
    expect(linhas[0].querySelectorAll('td')[2].textContent).toBe('—');
    expect(linhas[0].querySelectorAll('td')[4].textContent).toBe('—');
    const botaoOC = linhas[1].querySelector('button');
    expect(botaoOC?.textContent).toBe('232c05aa');
    if (botaoOC) fireEvent.click(botaoOC);
    expect(abrir).toHaveBeenCalledWith('232c05aa-e531-4f91', 'venda');
    await waitFor(() => expect(secao.querySelector('tfoot')?.textContent).toContain('184'));
  });

  it('o total sem caixa soma com o sinal e em centavos inteiros (o do topo e o do rodape sao o mesmo numero)', () => {
    expect(totalSemCaixa([ENTREGA, ENTREGA_G])).toBe(583552);
    expect(totalSemCaixa([ENTREGA, BARTER])).toBe(565521.56);
    render(<SecaoSemCaixa linhas={[ENTREGA, BARTER]} ocDe={() => undefined} onAbrirOC={vi.fn()} />);
    expect(screen.getByTestId('total-sem-caixa').textContent?.replace(/ /g, ' ')).toBe('R$ 565.521,56');
  });

  it('celula OC da lista: codigo curto clicavel, e traco sem OC', () => {
    const abrir = vi.fn();
    const { container, rerender } = render(<table><tbody><tr><CelulaOC oc={{ operacaoId: '232c05aa-e531', tipo: 'venda', ehBoitel: false, foraDoDre: false }} onAbrir={abrir} /></tr></tbody></table>);
    fireEvent.click(screen.getByRole('button', { name: codigoOC('232c05aa-e531') }));
    expect(abrir).toHaveBeenCalledWith('232c05aa-e531', 'venda');
    rerender(<table><tbody><tr><CelulaOC oc={undefined} onAbrir={abrir} /></tr></tbody></table>);
    expect(container.querySelector('[data-coluna-oc]')?.textContent).toBe('—');
  });
});

describe('rotulo de tela das contas (item 6)', () => {
  /* OC-CC-CLASSIFICACAO-01 (decisao 6): o mapa esvaziou — as contas de adiantamento sairam de uso e nao tem mais apelido */
  it('toda conta aparece como esta no plano; "Recebimento de vendas" e "Pagamento de compras" sairam', () => {
    expect(rotuloDaConta('Adiantamento de Clientes')).toBe('Adiantamento de Clientes');
    expect(rotuloDaConta('Adiantamento a Fornecedores')).toBe('Adiantamento a Fornecedores');
    expect(rotuloDaConta('Devolução de Adiantamento a Fornecedores')).toBe('Devolução de Adiantamento a Fornecedores');
    expect(rotuloDaConta('Venda de Desmama Machos')).toBe('Venda de Desmama Machos');
    expect(rotuloDaConta(null)).toBeNull();
  });
});
