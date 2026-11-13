import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { Kpi, MiniaturaDaFazenda } from '@/components/mapa-geo/GeoPastosGlobal';
import type { LinhaDaFazenda } from '@/lib/mapa/resumoGlobal';
import { CartoesDoTopo } from './CartoesDoTopo';
import { PrecisaDeAtencao } from './AtencaoEAtalhos';
import { comDado, comparacoes, indicadoresAgricultura, indicadoresPecuaria, indicadoresSilvicultura, variacao, type DreLavouraLida, type DrePecLida } from './indicadoresDaAtividade';
import { safraAnterior } from './agriculturaDaVisao';

/* VISAO-GERAL-03 (Gabriel 04/11 06:28): "fontes, números e cards enormes" — a Visão Geral passa à escala da Geo pastos › Global, pelas
   MESMAS peças de lá (o `Kpi`, o `Card` e a miniatura do "Mapa das fazendas"). Nada de tamanho novo. */

const PASTA = __dirname;
const V2HOME = readFileSync(path.resolve(PASTA, '..', 'V2Home.tsx'), 'utf8');
const DA_VISAO = readdirSync(PASTA).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
  .map((f) => ({ f, fonte: readFileSync(path.join(PASTA, f), 'utf8') }));

describe('VISAO-GERAL-03 — a escala da Geo pastos', () => {
  it('nenhum texto acima dos 14 px do número do Kpi (nem text-sm/base/lg/xl) na Visão Geral', () => {
    /* VISAO-GERAL-05: o único número grande (24 px) é o do Kpi, que mora na Geo pastos; a Visão Geral não tem tamanho próprio acima de 14 */
    const GRANDE = /\btext-(sm|base|lg|xl|[2-9]xl)\b|\btext-\[(1[5-9]|[2-9]\d)(\.\d+)?px\]/;
    for (const { f, fonte } of [{ f: 'V2Home.tsx', fonte: V2HOME }, ...DA_VISAO]) expect(fonte, f).not.toMatch(GRANDE);
  });

  it('o cartão é o Kpi de lá (VISAO-GERAL-05): número 24 px em negrito com a unidade menor ao lado; o rótulo 11 px embaixo; a comparação embaixo do rótulo; uma faixa só; o clique abre a tela dona', () => {
    const abrir = vi.fn();
    render(<CartoesDoTopo cartoes={[
      { id: 'rebanho', titulo: 'Rebanho', valor: '5.269', unidade: 'cab', meta: 2.5, anoAnt: -1.2, abrir: 'Abrir fechamento', onAbrir: abrir },
      { id: 'caixa', titulo: 'Caixa no fim do mês', valor: null, unidade: 'R$', abrir: 'Abrir fluxo' },
    ]} />);
    const cartao = screen.getByTestId('vg-cartao-rebanho');
    const [valor, rotulo, comparacao] = [...cartao.querySelectorAll(':scope > div > div')];
    expect(valor.className).toContain('text-[24px]');
    expect(valor.className).toContain('font-bold');
    expect(valor.textContent).toBe('5.269cab');
    expect(valor.querySelector('span')?.className).toContain('text-[12px]');
    expect(rotulo.className).toContain('text-[11px]');
    expect(rotulo.textContent).toContain('Rebanho');
    /* VISAO-GERAL-03 (08/11): a comparação MENOR (9,5, o piso) e os cinco numa grade de 5 colunas iguais */
    expect(comparacao.className).toContain('text-[9.5px]');
    expect(comparacao.textContent).toBe('▲ 2,5% meta · ▼ 1,2% ano ant.');
    expect(screen.getByTestId('vg-cartoes').className).toMatch(/\bgrid\b.*\bgrid-cols-5\b/);
    fireEvent.click(cartao);
    expect(abrir).toHaveBeenCalled();
    expect(screen.getByTestId('vg-cartao-caixa').textContent).toContain('—');
    expect(screen.getByTestId('vg-cartao-caixa').textContent).not.toContain('R$'); // sem valor, sem unidade
  });

  it('os quadros são o Card de lá: título a 11 px', () => {
    render(<PrecisaDeAtencao itens={[]} />);
    expect(screen.getByText('Precisa de atenção').className).toContain('text-[11px]');
  });

  it('o "Mapa das fazendas" é a MESMA peça da Geo pastos (miniatura, sigla, "cab sem mapa"), e o clique abre a fazenda', () => {
    expect(V2HOME).toMatch(/<Card titulo="Mapa das fazendas"[\s\S]{0,900}<MiniaturaDaFazenda/);
    const zero = { carga_alta: 0, sublotado: 0, ideal: 0, vazio: 0, sem_fechamento: 0 };
    const linha: LinhaDaFazenda = {
      fazenda: { id: 'fa', codigo: 'AA', nome: 'Faz. Alfa' }, temMapa: false, pastos: 0, area: null, cabecas: 66, pesoMedio: 300, kgHa: null, uaHa: null,
      semFechamento: 0, contagem: zero, areaPorSituacao: zero, serie: [], cabecasPorAtividade: new Map(), cabecasSemMapa: 66,
    };
    const abrir = vi.fn();
    render(<MiniaturaDaFazenda linha={linha} geometrias={[]} situacaoDoPasto={() => 'ideal'} onAbrir={abrir} />);
    expect(screen.getByText('AA')).toBeTruthy();
    expect(screen.getByText('66 cab sem mapa')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Importar' })).toBeNull(); // na Visão Geral não importa: só a Geo pastos
    fireEvent.click(screen.getByTestId('global-miniatura'));
    expect(abrir).toHaveBeenCalled();
  });

  it('cabeçalho pequeno: o cumprimento numa linha de 11 px; "No mês | No ano" é o Segmentado de lá; os meses em chip de 20 px', () => {
    expect(V2HOME).toMatch(/<h2 className="whitespace-nowrap text-\[11px\] font-semibold text-foreground">\s*\{g\}/);
    expect(V2HOME).toMatch(/<Segmentado valor=\{viewMode\}[^>]*altura=\{22\}/);
    expect(V2HOME).toContain("const CELULA_MES = 'inline-flex h-[20px] w-[34px]");
  });
});

/* VISAO-GERAL-04 (Gabriel 04/11 07:04): "espaço sobrando" — nenhum card mais largo que o conteúdo, nenhum buraco branco, a grade fecha nas
   duas colunas. A prova da medida (vão ≤ 24 px) é o print inteiro a 1.280 e 1.440; aqui, a forma que a garante. */
describe('VISAO-GERAL-04 — sem espaço sobrando', () => {
  it('a faixa de cima: Área produtiva · Rebanho · Lotação · Caixa · Resultado, todos com número; a chuva saiu da faixa', () => {
    const ids = [...V2HOME.slice(V2HOME.indexOf('const cartoesVG: CartaoVG[] = ['), V2HOME.indexOf('  ];', V2HOME.indexOf('const cartoesVG')))
      .matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(['area', 'rebanho', 'uaha', 'caixa', 'resultado']);
    expect(V2HOME).toContain('<CartoesDoTopo cartoes={cartoesVG} carregando={loadingPainel} />');
  });

  it('os Atalhos saíram da Visão Geral', () => {
    expect(V2HOME).not.toMatch(/<AtalhosVG|ATALHOS_VG/);
    expect(DA_VISAO.some(({ fonte }) => /function AtalhosVG/.test(fonte))).toBe(false);
  });

  it('Área ao lado do Caixa (1 : 1,6 — VISAO-GERAL-04 de 08/11), na mesma altura', () => {
    expect(V2HOME).toContain('<div className="grid grid-cols-1 items-stretch gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">');
    expect(V2HOME).toMatch(/title=\{isPeriodo \? 'Área média no período' : 'Área no mês'\}\s*className="h-full"/);
    expect(V2HOME).toMatch(/subtitle="regime de caixa · sem transferências"\s*className="h-full"/);
  });

  it('VISAO-GERAL-04 (08/11, V2): logo abaixo dos cartões, o mapa das fazendas (maior) e, ao lado, a atenção; os blocos por atividade no fim', () => {
    const linha = V2HOME.indexOf('data-testid="vg-linha-mapa"');
    expect(linha).toBeGreaterThan(V2HOME.indexOf('<CartoesDoTopo'));
    expect(V2HOME).toContain('lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" data-testid="vg-linha-mapa"');
    const depois = V2HOME.slice(linha);
    expect(depois.indexOf('<MiniaturaDaFazenda')).toBeLessThan(depois.indexOf('<PrecisaDeAtencao'));
    expect(depois.indexOf('<PrecisaDeAtencao')).toBeLessThan(depois.indexOf("'Área no mês'"));
    expect(V2HOME).not.toContain('vg-coluna-dir');
    expect(V2HOME.indexOf('<BlocosPorAtividade')).toBeGreaterThan(V2HOME.indexOf('<TabelaFazendasVG'));
  });

  it('o quadro de atenção aceita a classe (para esticar)', () => {
    render(<PrecisaDeAtencao itens={[]} className="xl:flex-1" />);
    expect(screen.getByTestId('vg-atencao').className).toContain('xl:flex-1');
  });
});

/* VISAO-GERAL-05 (Gabriel 04/11 07:29 e 07:31): atividade numa linha com os indicadores pedidos, a comparação, a tabela por uso da área */
describe('VISAO-GERAL-05 — indicadores das atividades e a tabela por uso', () => {
  it('a comparação: só os pedaços que existem; verde quando é bom (custo: subir é ruim)', () => {
    expect(comparacoes({ meta: 3.21, anoAnt: -1, menorMelhor: false })).toEqual([{ texto: '▲ 3,2% meta', bom: true }, { texto: '▼ 1,0% ano ant.', bom: false }]);
    expect(comparacoes({ meta: 5, anoAnt: null, menorMelhor: true })).toEqual([{ texto: '▲ 5,0% meta', bom: false }]);
    expect(comparacoes({ meta: null, anoAnt: null })).toEqual([]);
    expect(variacao(110, 100)).toBeCloseTo(10, 6);
    expect(variacao(-50, -100)).toBeCloseTo(50, 6); // margem negativa: o módulo da referência não inverte o sinal
    expect(variacao(5, 0)).toBeNull();
  });

  it('Pecuária, na ordem: @ no ano · @/ha · GMD · custo/@ · margem/@ (a Lotação saiu: VISAO-GERAL-04, V7); sem meta o pedaço some', () => {
    const l = (at: number, ha: number, custo: number, margem: number): DrePecLida => ({ custo_variavel: custo, margem, producao: { at_produzida: at, ha_medio: ha } });
    const ind = indicadoresPecuaria({
      real: l(1000, 100, 50000, 100000), meta: l(900, 100, 45000, 90000), anoAnt: l(800, 100, 40000, 120000),
      gmd: { valor: 0.5, deltaMeta: 4, deltaAno: -2 }, podeVerMeta: false,
    });
    expect(ind.map((i) => i.id)).toEqual(['arrobas', 'arrobaHa', 'gmd', 'custoArroba', 'margemArroba']);
    expect(ind.map((i) => [i.valor, i.unidade])).toEqual([['1.000', '@'], ['10,00', '@/ha'], ['0,500', 'kg/dia'], ['R$ 50,00', '/@'], ['R$ 100,00', '/@']]);
    expect(ind.every((i) => i.meta === null)).toBe(true);
    expect(ind[0].anoAnt).toBeCloseTo(25, 6);                       // 1.000 @ contra 800
    expect(ind[4].anoAnt).toBeCloseTo((100 - 150) / 150 * 100, 6);   // margem/@: 100 contra 150
    expect(ind.every((i) => i.fonte.length > 0)).toBe(true);
  });

  it('Agricultura: produtividade · área plantada · colhido · custo/ha · margem/ha; ano anterior = a safra anterior', () => {
    const dre = (prod: number, custoHa: number, margemHa: number): DreLavouraLida => ({
      culturas: [{ cultura: 'soja', producao: prod * 100, produtividade: prod }],
      total: { linhas: { custo_variavel: { por_ha: custoHa }, margem_contribuicao: { por_ha: margemHa } } },
    });
    const ind = indicadoresAgricultura({
      dre: dre(60, 3000, 1500), dreAnt: dre(50, 2500, 2000), areaPlantada: 300, areaPlantadaAnt: 250, colhido: [{ cultura: 'soja', v: 18000 }],
    });
    expect(ind.map((i) => i.id)).toEqual(['produtividade', 'areaPlantada', 'colhido', 'custoHa', 'margemHa']);
    expect(ind[0].anoAnt).toBeCloseTo(20, 6);
    expect(ind[3].menorMelhor).toBe(true);
    expect(ind[3].anoAnt).toBeCloseTo(20, 6);
    expect(ind.every((i) => i.meta === null)).toBe(true);
  });

  it('dinheiro negativo com o sinal antes do R$ ("−R$ 1.107,00"), nunca "R$ -1.107,00"', () => {
    const dre = (m: number): DreLavouraLida => ({ culturas: [], total: { linhas: { custo_variavel: { por_ha: 10 }, margem_contribuicao: { por_ha: m } } } });
    const margem = indicadoresAgricultura({ dre: dre(-1107), dreAnt: null, areaPlantada: null, areaPlantadaAnt: null, colhido: [] }).find((i) => i.id === 'margemHa');
    expect(margem?.valor).toBe('−R$ 1.107,00');
  });

  it('o Kpi compartilhado: o aviso (âmbar) vai para a linha de baixo do rótulo, não para o lado dele', () => {
    render(<Kpi rotulo="Fazendas · pastos" valor="5" aviso="1 pasto sem desenho" testid="k" />);
    const linhas = [...screen.getByTestId('k').children];
    expect(linhas).toHaveLength(3);
    expect(linhas[1].textContent).toBe('Fazendas · pastos');
    expect(linhas[2].textContent).toBe('1 pasto sem desenho');
  });

  it('Silvicultura: só a área (idade e volume não têm cadastro e não aparecem); sem área, nada', () => {
    expect(comDado(indicadoresSilvicultura(820)).map((i) => i.rotulo)).toEqual(['Área']);
    expect(comDado(indicadoresSilvicultura(null))).toEqual([]);
  });

  it('a safra anterior é a de início mais recente antes da do mês', () => {
    const s = (id: string, ini: string) => ({ id, nome: id, codigo: id, ciclo: 'anual', data_inicio: ini, data_fim: null });
    expect(safraAnterior([s('24/25', '2024-07-01'), s('26/27', '2026-07-01'), s('25/26', '2025-07-01')], s('26/27', '2026-07-01'))?.id).toBe('25/26');
    expect(safraAnterior([s('26/27', '2026-07-01')], s('26/27', '2026-07-01'))).toBeNull();
  });

  it('a tabela Fazendas: as áreas por uso (somam o total), sem as colunas "Atividades" e "Produtiva"', () => {
    const fonte = readFileSync(path.join(PASTA, 'TabelaFazendasVG.tsx'), 'utf8');
    const cab = [...fonte.matchAll(/<th className=\{th(?:Num)?\}>([^<]+)<\/th>/g)].map((m) => m[1]);
    expect(cab).toEqual(['Fazenda', 'Total ha', 'Cabeças', 'UA/ha', 'Chuva mm', 'Fechamento']);
    /* VISAO-GERAL-04 (V6): as áreas por uso vêm de COLUNAS_DE_AREA (a que nenhuma fazenda tem sai) */
    const usos = [...fonte.matchAll(/\{ k: '\w+', rotulo: '([^']+)' \}/g)].map((m) => m[1]);
    expect(usos).toEqual(['Pecuária ha', 'Agricultura ha', 'Silvicultura ha', 'Reserva/APP/benf. ha']);
    expect(V2HOME).toContain('areaReservaAppBenf: a ? a.area_reserva_ha + a.area_app_ha + a.area_benfeitorias_ha + a.area_outras_ha : null');
  });

  it('"Precisa de atenção": cada item numa linha (o texto curto; o inteiro no title)', () => {
    render(<PrecisaDeAtencao itens={[{ id: 'f', texto: 'Fechamento de out faltando · EXN', title: 'Fechamento de out faltando — EXN · Faz. Exemplo Norte', acao: 'Fechar', onIr: vi.fn() }]} />);
    const li = screen.getByTestId('vg-atencao-f');
    expect(li.className).toContain('whitespace-nowrap');
    expect(li.title).toContain('Faz. Exemplo Norte');
  });
});
