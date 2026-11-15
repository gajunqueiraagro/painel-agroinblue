import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MiniaturaDaFazenda } from '@/components/mapa-geo/GeoPastosGlobal';
import type { LinhaDaFazenda } from '@/lib/mapa/resumoGlobal';
import { TabelaFazendasVG } from './TabelaFazendasVG';
import { PrecisaDeAtencao } from './AtencaoEAtalhos';
import type { LinhaFazendaVG } from './fazendasDaVisao';
import { indicadoresPecuaria, type DrePecLida } from './indicadoresDaAtividade';

vi.mock('@/hooks/useAreaPlantada', () => ({ useSafrasLavoura: () => ({ safras: [] }), useTalhoesDaSafra: () => ({ talhoes: [] }) }));
vi.mock('@/hooks/useEstoqueGraos', () => ({ useEstoqueGraosResumo: () => ({ culturas: [] }) }));
vi.mock('@/hooks/useDreLavoura', () => ({ useDreLavoura: () => ({ dre: null }) }));
const { BlocosPorAtividade } = await import('./BlocosPorAtividade');

/* VISAO-GERAL-04 (mock ui-validar/visao-geral-04.html, aprovado pelo Gabriel 08/11 10:09: V1–V7 + o número do minimapa) */
const V2HOME = readFileSync(path.resolve(__dirname, '..', 'V2Home.tsx'), 'utf8');
const zero = { carga_alta: 0, sublotado: 0, ideal: 0, vazio: 0, sem_fechamento: 0 };
const daFazenda: LinhaDaFazenda = {
  fazenda: { id: 'fa', codigo: 'AA', nome: 'Faz. Alfa' }, temMapa: false, pastos: 0, area: 794, cabecas: 900, pesoMedio: 300, kgHa: 372, uaHa: null,
  semFechamento: 0, contagem: zero, areaPorSituacao: zero, serie: [], cabecasPorAtividade: new Map(), cabecasSemMapa: 0,
};
const linha = (o: Partial<LinhaFazendaVG> & { id: string }): LinhaFazendaVG => ({
  rotulo: o.id, atividades: [], areaTotal: null, areaProdutiva: null, areaPecuaria: null, areaAgricultura: null, areaSilvicultura: null,
  areaReservaAppBenf: null, cabecas: null, ua: null, uaHa: null, chuvaMm: null, fechamento: 'sem_dado', ...o,
});

describe('VISAO-GERAL-04 — o minimapa diz as cabeças da fazenda no mês', () => {
  it('com `cabecas`: "936 cab." em cor neutra, sem o kg/ha', () => {
    render(<MiniaturaDaFazenda linha={daFazenda} geometrias={[]} situacaoDoPasto={() => 'ideal'} onAbrir={vi.fn()} cabecas={936} />);
    const n = screen.getByTestId('miniatura-cabecas');
    expect(n.textContent).toBe('936cab.');
    expect(n.getAttribute('style')).toBeNull();
    expect(screen.getByTestId('global-miniatura').textContent).not.toContain('372');
  });

  it('sem cabeças no mês: "—"; sem a prop (a Geo pastos): o kg/ha na cor da situação, como antes', () => {
    const { unmount } = render(<MiniaturaDaFazenda linha={daFazenda} geometrias={[]} situacaoDoPasto={() => 'ideal'} onAbrir={vi.fn()} cabecas={null} />);
    expect(screen.getByTestId('miniatura-cabecas').textContent).toBe('—');
    unmount();
    render(<MiniaturaDaFazenda linha={daFazenda} geometrias={[]} situacaoDoPasto={() => 'ideal'} onAbrir={vi.fn()} />);
    expect(screen.queryByTestId('miniatura-cabecas')).toBeNull();
    expect(screen.getByText('372').getAttribute('style')).toContain('color');
  });

  it('a Visão Geral passa as cabeças da tabela Fazendas (rebanho oficial), no mapa maior', () => {
    expect(V2HOME).toContain('const cabecasDaFazendaVG = useMemo(() => new Map(linhasFazendasVG.map(l => [l.id, l.cabecas])), [linhasFazendasVG]);');
    expect(V2HOME).toContain('cabecas={cabecasDaFazendaVG.get(l.fazenda.id) ?? null} w={174} h={116} />');
  });
});

describe('VISAO-GERAL-04 — V3 a V7', () => {
  it('V3: a atenção mostra o mês; a revalidação de mês anterior fica (com o mês dela), a de mês posterior nunca', () => {
    render(<PrecisaDeAtencao itens={[]} mes="set/26" />);
    expect(screen.getByTestId('vg-atencao-mes').textContent).toBe('set/26');
    expect(V2HOME).toContain('const revalidarDoMes = aRevalidar.pendentes.filter(r => r.anoMes <= anoMesVG);');
    expect(V2HOME).toContain('...revalidarDoMes.map((r): ItemAtencao => {');
    expect(V2HOME).toContain('mes={mesDaAtencaoVG} />');
  });

  it('V4: a Área sem a rosca e só com as áreas que a fazenda tem', () => {
    const area = V2HOME.slice(V2HOME.indexOf("'Área no mês'"), V2HOME.indexOf("'Caixa no mês'"));
    expect(area).not.toContain('<circle');
    expect(area).toMatch(/cor: 'bg-muted-foreground\/40' \},\s*\]\.filter\(p => p\.valor > 0\);/);
    expect(area).toContain('data-testid="vg-area-barra"');
  });

  it('V5: a linha clicável do Caixa na régua da linha de detalhe (texto a 8 px, valor na borda)', () => {
    const clicavel = V2HOME.slice(V2HOME.indexOf('function LinhaCaixaClicavel'), V2HOME.indexOf('function somaLinhas'));
    expect(clicavel).toContain('-mx-1 flex w-[calc(100%+0.5rem)]');
    expect(clicavel).toContain('pl-3 pr-1');
  });

  it('V6: a coluna de área que nenhuma fazenda tem sai da tabela; a que alguma tem fica', () => {
    const { unmount } = render(<TabelaFazendasVG mesCurto="set" linhas={[
      linha({ id: 'A', areaTotal: 794, areaPecuaria: 794, areaAgricultura: 0, cabecas: 936 }),
      linha({ id: 'B', areaTotal: 964, areaPecuaria: 964, cabecas: 981 }),
    ]} />);
    const cab = () => within(screen.getByTestId('vg-fazendas')).getAllByRole('columnheader').map((th) => th.textContent);
    expect(cab()).toEqual(['Fazenda', 'Pecuária ha', 'Total ha', 'Cabeças', 'UA/ha', 'Chuva mm', 'Fechamento']);
    unmount();
    render(<TabelaFazendasVG mesCurto="set" linhas={[
      linha({ id: 'A', areaTotal: 794, areaPecuaria: 694, areaReservaAppBenf: 100 }), linha({ id: 'B', areaTotal: 964, areaPecuaria: 964 }),
    ]} />);
    expect(cab()).toEqual(['Fazenda', 'Pecuária ha', 'Reserva/APP/benf. ha', 'Total ha', 'Cabeças', 'UA/ha', 'Chuva mm', 'Fechamento']);
    expect(screen.getByTestId('vg-fazendas-total').textContent).toContain('100');
  });

  it('V7: a atividade numa linha — o nome numa coluna e os indicadores em colunas iguais', () => {
    const ind = (id: string, valor: string) => ({ id, rotulo: id, valor, meta: null, anoAnt: null, fonte: 'f' });
    render(<BlocosPorAtividade atividades={[{ id: 'p', nome: 'Pecuária', grupo: 'pecuaria', ordem: 1 }]} clienteId="c1" anoMes="2026-09" silviculturaHa={null}
      onAbrir={vi.fn()} pecuaria={[ind('a', '1'), ind('b', '2'), ind('c', '3'), ind('d', '4'), ind('e', '5')]} />);
    const bloco = screen.getByTestId('vg-bloco-pecuaria');
    expect(bloco.className.split(/\s+/)).toContain('grid');
    expect(bloco.className).toContain('lg:grid-cols-[120px_repeat(var(--n),minmax(0,1fr))]');
    expect(bloco.style.getPropertyValue('--n')).toBe('5');
  });

  it('V8 (opção A): o rótulo do GMD diz o período — "GMD no ano" no No ano, "GMD de set" no No mês; o número é o do modo (PC-100)', () => {
    const l: DrePecLida = { custo_variavel: 1, margem: 1, producao: { at_produzida: 1, ha_medio: 1 } };
    const gmd = (rotuloGmd?: string) => indicadoresPecuaria({ real: l, meta: null, anoAnt: null, gmd: { valor: 0.356, deltaMeta: null, deltaAno: null }, rotuloGmd, podeVerMeta: false })
      .find((i) => i.id === 'gmd');
    expect(gmd('GMD no ano')).toMatchObject({ rotulo: 'GMD no ano', valor: '0,356' });
    expect(gmd()?.rotulo).toBe('GMD');
    expect(V2HOME).toContain("rotuloGmd: isPeriodo ? 'GMD no ano' : `GMD de ${mesCurtoVG}`,");
  });
});
