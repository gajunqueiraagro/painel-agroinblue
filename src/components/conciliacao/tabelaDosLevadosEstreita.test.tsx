/**
 * CASAR-1X1 abaixo de 1000px — a tabela dos levados perde Fornecedor · Faz. · Ativ. · Plano (a regra do P101) e o `title` da Descrição
 * leva os quatro; de 1000px para cima, as colunas de sempre. Nasce do gate de 19/11 15:20 (casar-1x1-levado a 750 e 814: a tabela mais
 * larga que o modal rolava de lado e o foco no Aplicado deslocava tudo).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TabelaDosLevados, type LinhaDoLevado } from '@/components/conciliacao/TabelaDosLevados';

const LEVADO: LinhaDoLevado = {
  lancamento_id: 'l1', data_vencimento: '2026-11-10', descricao: 'Sal mineral', fornecedor: 'Casa do Campo',
  numero_documento: '270', status_transacao: 'programado', valor_assinado: -1404, valorTexto: '1.404,00',
  fazendaCodigo: 'PUR', fazendaNome: 'Faz. Pureza', escopoNegocio: 'pecuaria', subcentro: 'Sal e minerais',
};
const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: px });
const tabela = () => render(
  <TabelaDosLevados extrato={{ data: '2026-11-10', historico: 'PIX', valor: -1404 }} levados={[LEVADO]} onValor={() => {}} onRemover={() => {}} />,
);

afterEach(() => { cleanup(); largura(1024); });

describe('tabela dos levados — abaixo de 1000px', () => {
  it('a 999px saem Fornecedor, Faz., Ativ. e Plano; o title da Descrição leva os quatro; colgroup e cabeçalho batem com a linha', () => {
    largura(999);
    const { container } = tabela();
    for (const id of ['levado-linha-fornecedor', 'levado-linha-fazenda', 'levado-linha-atividade', 'levado-linha-plano']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId('levado-linha-descricao').getAttribute('title'))
      .toBe('Sal mineral · Fornecedor: Casa do Campo · Fazenda: Faz. Pureza · Atividade: Pec. · Plano: Sal e minerais');
    const t = container.querySelector('[data-testid="levados-tabela"]');
    const cols = t?.querySelectorAll('colgroup col').length;
    expect(cols).toBe(7);
    expect(t?.querySelectorAll('thead th').length).toBe(cols);
    expect(screen.getByTestId('levado-linha').querySelectorAll('td').length).toBe(cols);
  });

  it('a 1000px as 11 colunas de sempre, e o title da Descrição é só a descrição', () => {
    largura(1000);
    const { container } = tabela();
    expect(screen.getByTestId('levado-linha-fornecedor').textContent).toBe('Casa do Campo');
    expect(screen.getByTestId('levado-linha-fazenda').textContent).toBe('PUR');
    expect(screen.getByTestId('levado-linha-atividade').textContent).toBe('Pec.');
    expect(screen.getByTestId('levado-linha-plano').textContent).toBe('Sal e minerais');
    expect(screen.getByTestId('levado-linha-descricao').getAttribute('title')).toBe('Sal mineral');
    const t = container.querySelector('[data-testid="levados-tabela"]');
    expect(t?.querySelectorAll('colgroup col').length).toBe(11);
    expect(t?.querySelectorAll('thead th').length).toBe(11);
  });
});
