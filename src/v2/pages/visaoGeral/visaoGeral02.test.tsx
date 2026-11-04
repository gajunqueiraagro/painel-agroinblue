import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { totalDasFazendas, situacaoDoFechamento, atividadesDaArea, rotuloDaFazenda, type LinhaFazendaVG } from './fazendasDaVisao';
import { lerAtividades, blocosDaVisao, type AtividadeDoCliente } from './atividadesDaVisao';
import { semCasarDoResumo } from './conciliacaoSemCasar';
import { TabelaFazendasVG } from './TabelaFazendasVG';
import { CartoesDoTopo } from './CartoesDoTopo';
import { PrecisaDeAtencao } from './AtencaoEAtalhos';
import type { LinhaResumo } from '@/lib/conciliacao/resumoDoDono';
import type { SnapshotAreaFazendaMes } from '@/hooks/useFechamentoArea';

vi.mock('@/hooks/useAreaPlantada', () => ({ useSafrasLavoura: () => ({ safras: [] }), useTalhoesDaSafra: () => ({ talhoes: [] }) }));
vi.mock('@/hooks/useEstoqueGraos', () => ({ useEstoqueGraosResumo: () => ({ culturas: [] }) }));
vi.mock('@/hooks/useDreLavoura', () => ({ useDreLavoura: () => ({ dre: null }) }));
const { BlocosPorAtividade } = await import('./BlocosPorAtividade');
const { safraDoMes } = await import('./agriculturaDaVisao');

/* VISAO-GERAL-02 (mock aprovado, Gabriel 03/11/2026) — as peças novas da Visão Geral. */
const linha = (o: Partial<LinhaFazendaVG> & { id: string }): LinhaFazendaVG => ({
  rotulo: o.id, atividades: [], areaTotal: null, areaProdutiva: null, areaPecuaria: null, cabecas: null, ua: null, uaHa: null,
  chuvaMm: null, fechamento: 'sem_dado', ...o,
});

describe('a linha de total da tabela Fazendas (regra 17)', () => {
  const linhas = [
    linha({ id: 'A', areaTotal: 1000, areaProdutiva: 800, areaPecuaria: 800, cabecas: 1000, ua: 800, uaHa: 1, fechamento: 'fechado' }),
    linha({ id: 'B', areaTotal: 200, areaProdutiva: 100, areaPecuaria: 100, cabecas: 300, ua: 300, uaHa: 3, fechamento: 'falta' }),
    linha({ id: 'C', areaTotal: 500, areaProdutiva: 400, areaPecuaria: null, fechamento: 'sem_gado' }),
  ];
  it('soma as aditivas e PONDERA a UA/ha pela área (ΣUA ÷ Σárea), nunca a média simples', () => {
    const t = totalDasFazendas(linhas);
    expect(t.areaTotal).toBe(1700);
    expect(t.areaProdutiva).toBe(1300);
    expect(t.cabecas).toBe(1300);
    expect(t.uaHa).toBeCloseTo(1100 / 900, 6);
    expect(t.uaHa).not.toBeCloseTo(2, 2);
  });
  it('fechamento "x de y" só entre as fazendas com gado', () => {
    const t = totalDasFazendas(linhas);
    expect([t.fechadas, t.comGado]).toEqual([1, 2]);
  });
  it('sem nenhum valor, o total é nulo (vira "—"), nunca zero', () => {
    expect(totalDasFazendas([linha({ id: 'X' })])).toMatchObject({ areaTotal: null, cabecas: null, uaHa: null });
  });
  it('a tabela desenha o total no pé, a fazenda pelo CÓDIGO, e o clique escolhe a fazenda', () => {
    const escolher = vi.fn();
    render(<TabelaFazendasVG mesCurto="set" onEscolher={escolher} linhas={[
      { ...linhas[0], rotulo: rotuloDaFazenda({ id: 'A', nome: 'Faz. Pureza', codigo: 'PUR' }) }, linhas[1], linhas[2]]} />);
    const total = screen.getByTestId('vg-fazendas-total');
    expect(total.textContent).toContain('1.700 ha');
    expect(total.textContent).toContain('1 de 2 fechadas');
    expect(total.textContent).toContain('1,22');
    fireEvent.click(screen.getByRole('button', { name: 'PUR · Faz. Pureza' }));
    expect(escolher).toHaveBeenCalledWith('A');
    expect(within(screen.getByTestId('vg-fazenda-A')).getByText('set ✓')).toBeTruthy();
    expect(within(screen.getByTestId('vg-fazenda-B')).getByText('falta set')).toBeTruthy();
  });
});

describe('situação do fechamento e atividades da fazenda', () => {
  it('pendente em P1 ou P2 = falta; os dois não-aplicáveis = sem gado; sem célula = sem dado; resto = fechado', () => {
    expect(situacaoDoFechamento('pendente', 'oficial')).toBe('falta');
    expect(situacaoDoFechamento('oficial', 'pendente')).toBe('falta');
    expect(situacaoDoFechamento('nao_aplicavel', 'nao_aplicavel')).toBe('sem_gado');
    expect(situacaoDoFechamento(undefined, undefined)).toBe('sem_dado');
    expect(situacaoDoFechamento('oficial', 'nao_aplicavel')).toBe('fechado');
  });
  it('as atividades saem das famílias com área > 0 na foto de área', () => {
    const a: SnapshotAreaFazendaMes = { fazenda_id: 'A', mes: 9, area_total_ha: 10, area_produtiva_ha: 8, area_pecuaria_ha: 5, area_agricultura_ha: 3,
      area_silvicultura_ha: 0, area_reserva_ha: 2, area_app_ha: 0, area_benfeitorias_ha: 0, area_outras_ha: 0 };
    expect(atividadesDaArea(a)).toEqual(['Pecuária', 'Agricultura']);
    expect(atividadesDaArea(undefined)).toEqual([]);
  });
});

describe('os blocos vêm das atividades LIGADAS do cliente (Code 6), nunca de lista fixa', () => {
  const resposta = { cadastrado: true, atividades: [
    { id: 'a2', nome: 'Lavoura', familia: 'lavoura_anual', grupo_menu: 'agricultura', ordem: 2, ativo: true },
    { id: 'a1', nome: 'Pecuária de corte', familia: 'pecuaria', grupo_menu: 'pecuaria', ordem: 1, ativo: true },
    { id: 'a3', nome: 'Eucalipto', familia: 'silvicultura', grupo_menu: 'silvicultura', ordem: 3, ativo: false },
    { id: 'a4', nome: 'Outra', familia: 'outra', grupo_menu: null, ordem: 4, ativo: true },
  ] };
  it('só as ligadas e com grupo, na ordem do cadastro', () => {
    expect(lerAtividades(resposta).atividades.map((a) => a.nome)).toEqual(['Pecuária de corte', 'Lavoura']);
  });
  it('cliente sem cadastro (ou leitura que falhou): as famílias com área, com o nome padrão', () => {
    expect(blocosDaVisao({ cadastrado: false, atividades: [] }, ['silvicultura', 'pecuaria']).map((a) => a.nome)).toEqual(['Pecuária', 'Silvicultura']);
    expect(blocosDaVisao(null, ['agricultura']).map((a) => a.grupo)).toEqual(['agricultura']);
    expect(blocosDaVisao(lerAtividades(resposta), ['silvicultura']).map((a) => a.grupo)).toEqual(['pecuaria', 'agricultura']);
  });
  it('as pílulas são as atividades do cliente; filtrar mostra só a escolhida; silvicultura diz "em breve" e sem dado é "—"', () => {
    const silvicultura: AtividadeDoCliente = { id: 's', nome: 'Eucalipto', grupo: 'silvicultura', ordem: 9 };
    const atividades: AtividadeDoCliente[] = [...lerAtividades(resposta).atividades, silvicultura];
    const nulo = { valor: null };
    render(<BlocosPorAtividade atividades={atividades} clienteId="c1" anoMes="2026-09" silviculturaHa={823} onAbrir={vi.fn()}
      pecuaria={{ cabecas: { valor: '7.259' }, lotacao: nulo, gmd: nulo, arrobas: nulo, custoMargemArroba: nulo }} />);
    const pilulas = within(screen.getByTestId('vg-atividades')).getAllByRole('button', { pressed: false }).map((b) => b.textContent);
    expect(pilulas).toEqual(['Pecuária de corte', 'Lavoura', 'Eucalipto']);
    expect(screen.getByTestId('vg-bloco-pecuaria').textContent).toContain('7.259');
    expect(screen.getByTestId('vg-bloco-pecuaria').textContent).toContain('—');
    expect(screen.getByTestId('vg-bloco-silvicultura').textContent).toContain('823 ha');
    expect(screen.getByTestId('vg-bloco-silvicultura').textContent).toContain('em breve');
    expect(screen.getByTestId('vg-bloco-agricultura')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eucalipto' }));
    expect(screen.queryByTestId('vg-bloco-pecuaria')).toBeNull();
    expect(screen.getByTestId('vg-bloco-silvicultura')).toBeTruthy();
  });
  it('filtrar uma atividade NÃO encolhe a área: ela guarda a altura de "Todas" (espaço reservado, nada pula)', () => {
    const alto = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 640 });
    try {
      const nulo = { valor: null };
      render(<BlocosPorAtividade atividades={lerAtividades(resposta).atividades} clienteId="c1" anoMes="2026-09" silviculturaHa={null} onAbrir={vi.fn()}
        pecuaria={{ cabecas: nulo, lotacao: nulo, gmd: nulo, arrobas: nulo, custoMargemArroba: nulo }} />);
      const areaDosBlocos = screen.getByTestId('vg-atividades');
      expect(areaDosBlocos.style.minHeight).toBe('');
      fireEvent.click(screen.getByRole('button', { name: 'Lavoura' }));
      expect(areaDosBlocos.style.minHeight).toBe('640px');
    } finally {
      if (alto) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', alto);
    }
  });
  it('sem atividade nenhuma, a seção não aparece', () => {
    const nulo = { valor: null };
    const { container } = render(<BlocosPorAtividade atividades={[]} clienteId="c1" anoMes="2026-09" silviculturaHa={null} onAbrir={vi.fn()}
      pecuaria={{ cabecas: nulo, lotacao: nulo, gmd: nulo, arrobas: nulo, custoMargemArroba: nulo }} />);
    expect(container.innerHTML).toBe('');
  });
  it('a safra do mês: a que contém o mês; sem nenhuma, a de início mais recente', () => {
    const s = (id: string, ini: string | null, fim: string | null) => ({ id, nome: id, codigo: id, ciclo: 'anual', data_inicio: ini, data_fim: fim });
    const safras = [s('24/25', '2024-07-01', '2025-06-30'), s('25/26', '2025-07-01', '2026-06-30'), s('26/27', '2026-07-01', '2027-06-30')];
    expect(safraDoMes(safras, '2026-09')?.id).toBe('26/27');
    expect(safraDoMes(safras, '2026-03')?.id).toBe('25/26');
    expect(safraDoMes(safras, '2030-01')?.id).toBe('26/27');
    expect(safraDoMes([], '2026-01')).toBeNull();
  });
});

describe('conciliação sem casar: só a linha TOTAL do resumo do dono', () => {
  const l = (nivel: 'conta' | 'total', a: number, b: number): Pick<LinhaResumo, 'nivel' | 'extratos_sem_par' | 'lancamentos_sem_par'> =>
    ({ nivel, extratos_sem_par: { qtde: a, valor: 0 }, lancamentos_sem_par: { qtde: b, valor: 0 } });
  it('soma os dois lados da linha total e ignora as contas (somar contaria duas vezes)', () => {
    expect(semCasarDoResumo([l('conta', 5, 5), l('total', 3, 4)])).toBe(7);
    expect(semCasarDoResumo([l('conta', 5, 5)])).toBeNull();
    expect(semCasarDoResumo(undefined)).toBeNull();
  });
});

describe('cartões do topo e "Precisa de atenção"', () => {
  it('cada cartão abre a tela dona; sem valor é "—", nunca zero', () => {
    const abrir = vi.fn();
    render(<CartoesDoTopo cartoes={[{ id: 'chuva', titulo: 'Chuva no mês', valor: null, detalhe: 'média: em breve', abrir: 'Abrir chuvas', onAbrir: abrir }]} />);
    const c = screen.getByTestId('vg-cartao-chuva');
    expect(c.textContent).toContain('—');
    expect(c.textContent).not.toMatch(/\b0\b/);
    fireEvent.click(c);
    expect(abrir).toHaveBeenCalled();
  });
  it('sem pendência, a frase; com pendência, o link direto', () => {
    const { rerender } = render(<PrecisaDeAtencao itens={[]} />);
    expect(screen.getByText('Nada pendente neste mês.')).toBeTruthy();
    const ir = vi.fn();
    rerender(<PrecisaDeAtencao itens={[{ id: 'fech-A', texto: 'Fechamento de set faltando — RET · Retiro', acao: 'Fechar', onIr: ir }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar ›' }));
    expect(ir).toHaveBeenCalled();
  });
});
