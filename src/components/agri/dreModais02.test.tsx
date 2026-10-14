/**
 * DRE-MODAIS-02a — acabamento do modal de valor do DRE (mock docs/mocks/dre_modal_reposicao_mock_v4.html).
 *
 * ⚠ O QUE SE PROVA: a linha de filtro é FIXA (existe filtrada ou não) e o selo mora nela, não no cabeçalho da
 *   Descrição; filtrada, a coluna da classificação mostra o CENTRO; o R$/cab/mês só nos blocos de custo, e sem rateio
 *   não há cartões; nenhuma célula da lista quebra linha e todo texto cortável tem `title`; a ordem da casa.
 * ⚠ O que é medida de pixel (18px, nada cortado) só o navegador prova — fica no relatório, não aqui.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ModalValorDre, valorDaPecuaria, type ValorDre } from '@/components/agri/RateioDetalheModal';
import type { LancamentoPec, RateioAdmPec, RecortePec } from '@/hooks/useDrePecuaria';

const lanc = (id: string, subcentro: string | null, centro: string | null, valor: number, bloco = 'fixo'): LancamentoPec => ({
  origem: 'lancamento', id, data: '2026-09-10', pagamento: '2026-09-12', descricao: `Lanc ${id}`, favorecido: `Fornecedor ${id}`,
  valor, status: 'realizado', fazenda: 'Faz. Teste', fazenda_id: 'f1', centro, subcentro, bloco, documento: null,
});
const DIRETOS = [
  lanc('d1', 'Salários e Encargos Pecuária', 'Mão de Obra', 500),
  lanc('d2', 'Rescisões e Acertos Pecuária', 'Mão de Obra', 120),
];
const RATEIO: RateioAdmPec = {
  lancamentos: [
    { id: 'r1', data: '2026-09-10', pagamento: '2026-09-10', descricao: 'Folha escritório', favorecido: 'Escritório',
      fazenda: 'Administrativo', status: 'realizado', valor: 500, grupo: 'Mão de Obra',
      subcentro: 'Salários e Encargos Administrativo', pct: 40, parte: 200, origem: 'lancamento' },
  ],
  grupos: [{ grupo: 'Mão de Obra', bruto: 500, parte: 200 }],
};
const recorte = (o: Partial<RecortePec>): RecortePec => ({
  fazendaId: null, fazendaNome: 'Total', bloco: 'fixo', centro: 'Mão de Obra', rotulo: 'Mão de Obra',
  de: '2026-09', ate: '2026-09', cenario: 'realizado',
  celula: { direto: 620, rateio: 200, grupo: 'Mão de Obra', comRateio: true, cabMedia: 10, meses: 1 }, ...o,
});
const custoFixo = (): ValorDre =>
  valorDaPecuaria({ recorte: recorte({}), lancamentos: DIRETOS, rateio: RATEIO, dre: null, periodoRotulo: 'set/26' });
const REPOSICAO = [
  lanc('p1', 'Compra de Bezerros', 'Reposição de Bovinos', 9000, 'reposicao'),
  lanc('p2', 'Compra de Garrotes', 'Reposição de Bovinos', 3000, 'reposicao'),
];
const reposicao = (): ValorDre => valorDaPecuaria({
  recorte: recorte({ bloco: 'reposicao', centro: 'Reposição de Bovinos', rotulo: 'Reposição',
    celula: { direto: 12000, rateio: null, grupo: null, comRateio: false, cabMedia: 10, meses: 1 } }),
  lancamentos: REPOSICAO, rateio: null, dre: null, periodoRotulo: 'set/26',
});

const montar = (v: ValorDre) =>
  render(<ModalValorDre aberto onFechar={() => {}} valor={v} comRateioInicial onAbrirLancamento={() => {}} />);
const quadro = () => screen.getByTestId('quadro-subcentro');
const tabelaLista = () => {
  const t = [...document.querySelectorAll('table')].find(x => !x.closest('[data-testid="quadro-subcentro"]'));
  if (!t) throw new Error('a tabela da lista nao foi achada');
  return t;
};
const cabecalhoLista = () => [...tabelaLista().querySelectorAll('thead th')].map(th => th.textContent?.trim() ?? '');
const linhasLista = () => [...tabelaLista().querySelectorAll('tbody tr')];

describe('DRE-MODAIS-02a — a linha de filtro fixa', () => {
  it('existe sem e com filtro; o selo vive nela, e o cabeçalho da Descrição nunca o tem', () => {
    montar(custoFixo());
    const linha = () => screen.getByTestId('filtro-subcentro-linha');
    expect(linha().textContent).toBe('todos os subcentros');
    fireEvent.click(within(quadro()).getByText('Salários e Encargos Pecuária'));
    expect(linha()).toBeTruthy();
    expect(within(linha()).getByTestId('selo-filtro-subcentro').textContent).toContain('filtrando: Salários e Encargos Pecuária');
    const thDesc = [...tabelaLista().querySelectorAll('thead th')].find(th => th.textContent?.includes('Descrição'));
    expect(thDesc?.querySelector('[data-testid="selo-filtro-subcentro"]')).toBeNull();
  });
});

describe('DRE-MODAIS-02a — filtrada, a classificação mostra o centro', () => {
  it('com filtro o cabeçalho diz "Centro" e a célula o centro; sem filtro, "Subcentro"', () => {
    montar(custoFixo());
    expect(cabecalhoLista()[4]).toBe('Subcentro');
    expect(linhasLista().map(tr => tr.querySelectorAll('td')[4]?.textContent)).toContain('Salários e Encargos Pecuária');
    fireEvent.click(within(quadro()).getByText('Salários e Encargos Pecuária'));
    expect(cabecalhoLista()[4]).toBe('Centro');
    expect(linhasLista().map(tr => tr.querySelectorAll('td')[4]?.textContent)).toEqual(['Mão de Obra']);
  });
});

describe('DRE-MODAIS-02a — R$/cab/mês só no custo; sem rateio, sem cartões', () => {
  it('Reposição: h2 sem "/cab", quadro sem a coluna R$/cab/mês, sem cartões', () => {
    montar(reposicao());
    expect(screen.getByRole('heading', { level: 2 }).textContent).not.toContain('/cab');
    expect(within(quadro()).getAllByRole('columnheader').map(h => h.textContent)).not.toContain('R$/cab/mês');
    expect(screen.queryByText('Total do grupo', { selector: 'div' })).toBeNull();
    expect(screen.queryByText('Direto da fazenda', { selector: 'div' })).toBeNull();
  });
  it('custo fixo com rateio: h2 com "/cab", a coluna no quadro e os três cartões', () => {
    montar(custoFixo());
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('/cab/mês');
    expect(within(quadro()).getAllByRole('columnheader').map(h => h.textContent)).toContain('R$/cab/mês');
    expect(screen.getByText('Total do grupo', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText('Direto da fazenda', { selector: 'div' })).toBeTruthy();
  });
});

describe('DRE-MODAIS-02a — linha única na lista', () => {
  it('nenhuma célula quebra linha, e toda célula de texto (descrição, favorecido, classificação, fazenda) tem title', () => {
    montar(custoFixo());
    const linhas = linhasLista();
    expect(linhas.length).toBe(3);
    for (const tr of linhas) {
      const tds = [...tr.querySelectorAll('td')];
      for (const td of tds) expect(td.className).not.toContain('break-words');
      for (const i of [2, 3, 4, 5]) expect(tds[i]?.getAttribute('title') ?? '').not.toBe('');
      expect(tds[2]?.getAttribute('title')).toBe(tds[2]?.querySelector('span')?.textContent);
    }
  });
});

describe('DRE-MODAIS-02a — a ordem da casa', () => {
  it('Comp. · Pgto · Descrição · Favorecido · Subcentro · Fazenda · Valor · Status', () => {
    montar(custoFixo());
    expect(cabecalhoLista().slice(0, 8).map(t => t.replace(/[▲▼↑↓⇅]/g, '').trim()))
      .toEqual(['Comp.', 'Pgto', 'Descrição', 'Favorecido', 'Subcentro', 'Fazenda', 'Valor', 'Status']);
  });
});

describe('DRE-MODAIS-02a — fonte: o quadro tem a largura do colgroup', () => {
  it('a table do quadro não leva w-full', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/agri/RateioDetalheModal.tsx'), 'utf8');
    const ini = src.indexOf('function QuadroSubcentro(');
    const fim = src.indexOf('</table>', ini);
    expect(ini).toBeGreaterThan(-1);
    const trecho = src.slice(ini, fim);
    expect(trecho).toContain('<table');
    expect(trecho).not.toMatch(/<table[^>]*w-full/);
  });
});
