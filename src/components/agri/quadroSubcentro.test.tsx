/**
 * DRE-MODAL-SUBCENTRO-01 — o quadro "Por subcentro" do modal de valor do DRE.
 *
 * ⚠ A LEI DO QUADRO: ele agrupa AS MESMAS linhas da lista, e a soma dele e' a dos cartoes, ao centavo, nos dois modos do
 *   segmentado. Medido na FASE 0 com os numeros reais (NJ jul/25-jun/26, Mao de Obra 1.106.988,24 + 467.256,90; Lavoura
 *   NJ 25/26, Operacoes Mecanizadas do Amendoim 426.301,60 + 429.815,41). Os fixtures daqui tem a MESMA forma: na
 *   Pecuaria o direto e' "... Pecuaria" e o rateio e' "... Administrativo" (subcentros diferentes do plano — decisao do
 *   Gabriel: uma linha por subcentro, sem juntar por nome); na Lavoura o MESMO subcentro tem direto e rateio.
 * ⚠ UM SUBCENTRO NULO ESTA' NO FIXTURE DE PROPOSITO: uma soma que ignorasse o nulo sairia a menos do cartao, e e' o
 *   caso que a mutacao derruba.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  ModalValorDre, valorDaPecuaria, valorDaLavoura, quadroPorSubcentro, corDoSinal, ROTULO_SEM_SUBCENTRO,
  type RateioDetalhe, type ValorDre,
} from '@/components/agri/RateioDetalheModal';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { LancamentoPec, RateioAdmPec, RecortePec } from '@/hooks/useDrePecuaria';

/* ── Pecuaria: Mao de Obra, coluna Total ── */
const lanc = (id: string, subcentro: string | null, valor: number, descricao = `Lanc ${id}`): LancamentoPec => ({
  origem: 'lancamento', id, data: '2026-03-10', pagamento: '2026-03-10', descricao, favorecido: 'Fornecedor',
  valor, status: 'realizado', fazenda: 'Pureza', fazenda_id: 'f1', centro: 'Mão de Obra', subcentro,
  bloco: 'fixo', documento: null,
});
const DIRETOS: LancamentoPec[] = [
  lanc('d1', 'Salários e Encargos Pecuária', 500.10),
  lanc('d2', 'Salários e Encargos Pecuária', 438.25),
  lanc('d3', 'Rescisões e Acertos Pecuária', 117.05),
  lanc('d4', 'Benefícios e Premiações Pecuária', 51.29),
  lanc('d5', null, 3.33, 'Lançamento antigo sem plano'),
];
const SOMA_DIRETOS = 1110.02;
const RATEIO: RateioAdmPec = {
  lancamentos: [
    { id: 'r1', data: '2026-03-10', pagamento: '2026-03-10', descricao: 'Folha escritório', favorecido: 'Escritório',
      fazenda: 'Administrativo', status: 'realizado', valor: 700, grupo: 'Mão de Obra', subcentro: 'Salários e Encargos Administrativo',
      pct: 40, parte: 280, origem: 'lancamento' },
    { id: 'r2', data: '2026-03-12', pagamento: '2026-03-12', descricao: 'Plano de saúde escritório', favorecido: 'Operadora',
      fazenda: 'Administrativo', status: 'realizado', valor: 55, grupo: 'Mão de Obra', subcentro: 'Benefícios e Premiações Administrativo',
      pct: 40, parte: 22, origem: 'lancamento' },
    { id: 'r3', data: '2026-03-12', pagamento: '2026-03-12', descricao: 'Aluguel', favorecido: 'Imobiliária',
      fazenda: 'Administrativo', status: 'realizado', valor: 900, grupo: 'Administração', subcentro: 'Aluguel de Escritório',
      pct: 40, parte: 360, origem: 'lancamento' },
  ],
  grupos: [{ grupo: 'Mão de Obra', bruto: 755, parte: 302 }, { grupo: 'Administração', bruto: 900, parte: 360 }],
};
/* O rateio da CELULA (o do DRE) nao e' a soma das partes: a reparticao ate' ele e' o `ratearNoAlvo` do modal. */
const RATEIO_CELULA = 311.47;
const recorte = (): RecortePec => ({
  fazendaId: null, fazendaNome: 'Total', bloco: 'fixo', centro: 'Mão de Obra', rotulo: 'Mão de Obra',
  de: '2025-07', ate: '2026-06', cenario: 'realizado',
  celula: { direto: SOMA_DIRETOS, rateio: RATEIO_CELULA, grupo: 'Mão de Obra', comRateio: true, cabMedia: 10, meses: 12 },
});
const valorPec = (diretos: LancamentoPec[] = DIRETOS): ValorDre =>
  valorDaPecuaria({ recorte: recorte(), lancamentos: diretos, rateio: RATEIO, dre: null, periodoRotulo: 'jul/25 → jun/26' });

/* ── Lavoura: Operacoes Mecanizadas do Amendoim ── */
const LAVOURA: RateioDetalhe = {
  pool: 1000, direto_cultura: 600, pct_agricultura: null,
  fatias: [
    { cultura: 'amendoim', area_ha: 185, peso: 78.8, valor: 788, atual: true },
    { cultura: 'mandioca', area_ha: 49.8, peso: 21.2, valor: 212, atual: false },
  ],
  lancamentos: [
    { id: 'l1', data: '2025-08-01', descricao: 'Diesel', favorecido: 'Posto', valor: 400, compartilhado: false, subcentro: 'Combustível Máquinas Agricultura' },
    { id: 'l2', data: '2025-08-02', descricao: 'Peça', favorecido: 'Loja', valor: 200, compartilhado: false, subcentro: 'Manutenção Máquinas Agricultura' },
    { id: 'l3', data: '2025-09-01', descricao: 'Diesel pool', favorecido: 'Posto', valor: 300, compartilhado: true, subcentro: 'Combustível Máquinas Agricultura' },
    { id: 'l4', data: '2025-09-02', descricao: 'Revisão pool', favorecido: 'Oficina', valor: 700, compartilhado: true, subcentro: 'Manutenção Máquinas Agricultura' },
  ],
};
const valorLav = (): ValorDre => valorDaLavoura(LAVOURA, 'natureza', {
  rotulo: 'Operações Mecanizadas', cultura: 'amendoim', safra: '25/26', area: 185, pool: false,
});

const centavos = (v: number) => Math.round(v * 100);
const linhasDoModo = (v: ValorDre, comRateio: boolean) => v.linhas.filter(l => comRateio || l.rateioPct == null);

describe('a lei do quadro: soma = cartoes, ao centavo, nos dois modos', () => {
  it('Pecuaria, com rateio: direto, rateio e total do quadro sao os dos cartoes', () => {
    const v = valorPec();
    const q = quadroPorSubcentro(linhasDoModo(v, true));
    expect(centavos(q.direto)).toBe(centavos(v.direto ?? NaN));
    expect(centavos(q.rateio)).toBe(centavos(v.rateio ?? NaN));
    expect(centavos(q.total)).toBe(centavos((v.direto ?? 0) + (v.rateio ?? 0)));
    // e cada linha e' um subcentro do plano — Pecuaria e Administrativo NAO se juntam por nome
    const nomes = q.linhas.map(l => l.subcentro);
    expect(nomes).toContain('Salários e Encargos Pecuária');
    expect(nomes).toContain('Salários e Encargos Administrativo');
    expect(nomes).toContain(null);
    const sal = q.linhas.find(l => l.subcentro === 'Salários e Encargos Pecuária');
    expect(sal).toMatchObject({ direto: 938.35, rateio: 0, total: 938.35, n: 2, nDireto: 2, nRateio: 0 });
  });

  it('Pecuaria, so o direto: o total e\' o direto e o subcentro so de rateio some', () => {
    const v = valorPec();
    const q = quadroPorSubcentro(linhasDoModo(v, false));
    expect(centavos(q.total)).toBe(centavos(v.direto ?? NaN));
    expect(q.rateio).toBe(0);
    expect(q.linhas.map(l => l.subcentro)).not.toContain('Salários e Encargos Administrativo');
  });

  it('Lavoura: o MESMO subcentro com direto e rateio fica numa linha so\', e fecha com os cartoes', () => {
    const v = valorLav();
    const q = quadroPorSubcentro(linhasDoModo(v, true));
    expect(q.linhas).toHaveLength(2);
    const comb = q.linhas.find(l => l.subcentro === 'Combustível Máquinas Agricultura');
    expect(comb?.direto).toBe(400);
    expect(comb?.rateio).toBeGreaterThan(0);
    expect(centavos(q.direto)).toBe(centavos(v.direto ?? NaN));
    expect(centavos(q.rateio)).toBe(centavos(v.rateio ?? NaN));
  });

  it('ordena pelo Total, do maior para o menor', () => {
    const q = quadroPorSubcentro(linhasDoModo(valorPec(), true));
    const totais = q.linhas.map(l => l.total);
    expect([...totais].sort((a, b) => b - a)).toEqual(totais);
  });

  it('a regra do sinal: saida em vermelho, o estorno inverte; entrada so\' o negativo', () => {
    expect(corDoSinal(10, true)).toBe('text-destructive');
    expect(corDoSinal(-10, true)).toBeUndefined();
    expect(corDoSinal(10, false)).toBeUndefined();
    expect(corDoSinal(-10, false)).toBe('text-destructive');
    expect(valorPec().saida).toBe(true);
    expect(valorLav().saida).toBe(true);
  });
});

describe('o quadro no modal', () => {
  const montar = (v: ValorDre, comRateio = true) =>
    render(<ModalValorDre aberto onFechar={() => {}} valor={v} comRateioInicial={comRateio} onAbrirLancamento={() => {}} />);
  const quadro = () => screen.getByTestId('quadro-subcentro');
  const listaDescricoes = () => [...document.querySelectorAll('tbody tr')]
    .filter(tr => !tr.closest('[data-testid="quadro-subcentro"]'))
    .map(tr => tr.querySelector('td:nth-child(3) span')?.textContent ?? '');
  const rodape = () => screen.getByTestId('rodape-lista').textContent ?? '';

  it('a linha de Total do quadro mostra os numeros dos cartoes (com rateio)', () => {
    const v = valorPec();
    montar(v);
    const total = within(screen.getByTestId('total-quadro')).getAllByRole('cell').map(c => c.textContent);
    expect(total[0]).toBe('Total do grupo');
    expect(total[1]).toBe('1.110,02');
    expect(total[2]).toBe('311,47');
    expect(total[3]).toBe('1.421,49');
    expect(total[5]).toBe('100,0%');
    // o subcentro nulo tem nome dito, nunca vazio
    expect(within(quadro()).getByText(ROTULO_SEM_SUBCENTRO)).toBeTruthy();
    // subcentro sem linha de rateio: "—" na coluna Rateio (ausencia), nunca 0,00; e o direto dele aparece
    const sal = within(quadro()).getByText('Salários e Encargos Pecuária').closest('tr');
    const cels = sal ? [...sal.querySelectorAll('td')].map(c => c.textContent) : [];
    expect(cels.slice(1, 4)).toEqual(['938,35', '—', '938,35']);
  });

  it('clique numa linha filtra a lista, com o selo e o rodape do filtro; o x volta a todos', () => {
    const v = valorPec();
    montar(v);
    const antes = listaDescricoes().length;
    expect(antes).toBe(7); // 5 diretos + 2 de rateio do grupo
    fireEvent.click(within(quadro()).getByText('Salários e Encargos Pecuária'));
    expect(listaDescricoes().sort()).toEqual(['Lanc d1', 'Lanc d2']);
    expect(screen.getByTestId('selo-filtro-subcentro').textContent).toContain('Salários e Encargos Pecuária');
    expect(rodape()).toBe('2 lançamentos em “Salários e Encargos Pecuária” · de 7 no grupo');
    expect(document.body.textContent).toContain(formatMoeda(938.35));
    fireEvent.click(screen.getByTestId('selo-filtro-subcentro'));
    expect(listaDescricoes()).toHaveLength(7);
    expect(screen.queryByTestId('selo-filtro-subcentro')).toBeNull();
  });

  it('clicar de novo na mesma linha tambem volta a todos', () => {
    montar(valorPec());
    fireEvent.click(within(quadro()).getByText('Rescisões e Acertos Pecuária'));
    expect(listaDescricoes()).toEqual(['Lanc d3']);
    fireEvent.click(within(quadro()).getByText('Rescisões e Acertos Pecuária'));
    expect(listaDescricoes()).toHaveLength(7);
  });

  it('a coluna de rateio leva o selo do modal: "Rateio adm." na pecuaria, "Rateio" no pool da lavoura', () => {
    const r = montar(valorPec());
    expect(within(quadro()).getAllByRole('columnheader').map(h => h.textContent)).toContain('Rateio adm.');
    r.unmount();
    montar(valorLav());
    const cab = within(quadro()).getAllByRole('columnheader').map(h => h.textContent);
    expect(cab).toContain('Rateio');
    expect(cab).not.toContain('Rateio adm.');
    expect(cab).toContain('R$/ha');
  });

  it('em "Direto da fazenda" a coluna Rateio adm. some do quadro', () => {
    montar(valorPec(), false);
    const cab = within(quadro()).getAllByRole('columnheader').map(h => h.textContent);
    expect(cab).not.toContain('Rateio adm.');
    expect(cab).toContain('Direto');
    expect(cab).toContain('R$/cab/mês');
  });

  it('a coluna Subcentro da lista ordena', () => {
    montar(valorPec());
    fireEvent.click(screen.getByTitle('Ordenar por Subcentro'));
    const subs = [...document.querySelectorAll('tbody tr')]
      .filter(tr => !tr.closest('[data-testid="quadro-subcentro"]'))
      .map(tr => tr.querySelector('td:nth-child(4)')?.textContent ?? '');
    // alfabetica, e a ausencia vai para o fim (a regra do `useOrdenacaoTabela`), nunca para o topo
    expect(subs).toEqual([
      'Benefícios e Premiações Administrativo', 'Benefícios e Premiações Pecuária', 'Rescisões e Acertos Pecuária',
      'Salários e Encargos Administrativo', 'Salários e Encargos Pecuária', 'Salários e Encargos Pecuária',
      ROTULO_SEM_SUBCENTRO,
    ]);
  });

  it('refresh apos salvar: o quadro se refaz, e o filtro que ficou sem lancamento volta a todos', () => {
    const r = montar(valorPec());
    fireEvent.click(within(quadro()).getByText('Rescisões e Acertos Pecuária'));
    expect(listaDescricoes()).toEqual(['Lanc d3']);
    // o lancamento d3 foi reclassificado pelo modal e saiu do grupo: a lista relida nao o tem mais
    const semRescisao = DIRETOS.filter(l => l.id !== 'd3');
    r.rerender(<ModalValorDre aberto onFechar={() => {}} valor={valorPec(semRescisao)} comRateioInicial onAbrirLancamento={() => {}} />);
    expect(screen.queryByTestId('selo-filtro-subcentro')).toBeNull();
    expect(listaDescricoes()).toHaveLength(6);
    expect(within(quadro()).queryByText('Rescisões e Acertos Pecuária')).toBeNull();
  });
});
