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

describe('tabela dos levados — abaixo de 1100px (gate 26/11; era 1000)', () => {
  it('a 1099px saem Fornecedor, NF, Faz., Ativ. e Plano (gate 26/11: a NF vai ao title); o title da Descrição leva os quatro; colgroup e cabeçalho batem com a linha', () => {
    largura(1099);
    const { container } = tabela();
    for (const id of ['levado-linha-fornecedor', 'levado-linha-fazenda', 'levado-linha-atividade', 'levado-linha-plano']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId('levado-linha-descricao').getAttribute('title'))
      .toBe('Sal mineral · NF: 000.000.270 · Fornecedor: Casa do Campo · Fazenda: Faz. Pureza · Atividade: Pec. · Plano: Sal e minerais');
    const t = container.querySelector('[data-testid="levados-tabela"]');
    const cols = t?.querySelectorAll('colgroup col').length;
    expect(cols).toBe(8); /* CONC-SUGESTOES-V2 C: + Pgto. e Δ dias; a NF só na larga (gate 26/11: a Descrição pede os 76px a 750) */
    expect(screen.queryByTestId('levado-linha-nf')).toBeNull();
    /* o extrato é a 1ª linha da MESMA grade: as mesmas células */
    expect(screen.getByTestId('levados-extrato').querySelectorAll('td').length).toBe(cols);
    expect(t?.querySelectorAll('thead th').length).toBe(cols);
    expect(screen.getByTestId('levado-linha').querySelectorAll('td').length).toBe(cols);
  });

  it('a 1100px as 13 colunas (CONC-SUGESTOES-V2 C: + Pgto. e Δ dias), e o title da Descrição é só a descrição', () => {
    largura(1100);
    const { container } = tabela();
    expect(screen.getByTestId('levado-linha-fornecedor').textContent).toBe('Casa do Campo');
    expect(screen.getByTestId('levado-linha-fazenda').textContent).toBe('PUR');
    expect(screen.getByTestId('levado-linha-atividade').textContent).toBe('Pec.');
    expect(screen.getByTestId('levado-linha-plano').textContent).toBe('Sal e minerais');
    expect(screen.getByTestId('levado-linha-descricao').getAttribute('title')).toBe('Sal mineral');
    const t = container.querySelector('[data-testid="levados-tabela"]');
    expect(t?.querySelectorAll('colgroup col').length).toBe(13);
    expect(t?.querySelectorAll('thead th').length).toBe(13);
    expect(screen.getByTestId('levados-extrato').querySelectorAll('td').length).toBe(13);
  });
});
