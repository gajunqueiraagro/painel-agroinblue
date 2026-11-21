/**
 * DRE-PAINEL-01 · PR-B — a tela: a referência "Média 12m" na grade, o modo "O que mudou" (só as sublinhas com desvio, o ponto laranja e
 * "+ N itens sem desvio" com a soma), os anos 2–5 no "Mais ▾" e o painel da direita (selo, "No mês", ponte, leitura e os links).
 * As REGRAS têm prova própria em `src/lib/dre/leitura.test.ts`; aqui se prova que a tela as usa e mostra o que elas dizem.
 * Números: o fixture real do NJ (out/26 × out/25), o mesmo do PR-A.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PecDrePanel, MaisPec, colunasDaVisao, largurasQueEnchem, type EntradaVisoes } from '@/pages/PecDrePanel';
import { PecPainelLeitura } from '@/components/agri/PecPainelLeitura';
import { LINHAS_DO_MODO } from '@/components/agri/drePecRegua';
import { lerLinhas, type DrePecLinhas, type DrePecuaria } from '@/hooks/useDrePecuaria';
import type { Selo } from '@/lib/dre/leitura';

const BRUTO: Record<string, unknown> = JSON.parse(readFileSync(`${process.cwd()}/src/lib/dre/leitura.fixture.json`, 'utf-8'));
const F = (k: string): DrePecLinhas => lerLinhas(BRUTO[k]);
const NJ25 = F('nj-2025-10');
const NJ26 = F('nj-2026-10');
const dre = (de: string, total: DrePecLinhas): DrePecuaria => ({
  periodo: { de, ate: de, p0: de, meses: 1 },
  rateio_adm: { pool: 0, bruto: 0, criterio: 'cabecas medias no periodo' },
  fazendas: [{ fazenda_id: 'f1', nome: 'Pureza', linhas: total }],
  total,
});
const entrada = (o: Partial<EntradaVisoes>): EntradaVisoes => ({
  visao: 'comparacao', de: '2026-10', ate: '2026-10', real: dre('2026-10', NJ26), meta: null, carregandoMeta: false,
  anos: [{ de: '2025-10', ate: '2025-10', dre: dre('2025-10', NJ25), carregando: false }], referencia: 1, ...o,
});
const todosAbertos = () => Object.fromEntries(LINHAS_DO_MODO('detalhado').filter(d => d.expande || d.agrupa).map(d => [d.id ?? d.chave, true]));
const linhaDe = (rotulo: string) => screen.getAllByRole('row').find((r): r is HTMLTableRowElement => r instanceof HTMLTableRowElement && r.cells[0]?.textContent === rotulo);

describe('a referência "Média 12m" na grade', () => {
  it('a coluna da média vem antes do mês, não abre lista (semLista) e o Δ é contra ela', () => {
    const cols = colunasDaVisao(entrada({ referencia: 'media12', deltas: ['rs'], media12: { linhas: NJ25, carregando: false, motivo: null } }));
    expect(cols.map(c => c.chave)).toEqual(['__media12__', '__total__', '__delta__']);
    expect(cols[0]).toMatchObject({ nome: 'Média 12m', semLista: true, comparacao: true, semDado: false });
    expect(cols[2].ref).toBe(NJ25);
  });
  it('sem a média (período de vários meses), a coluna é "—" com o motivo, nunca o mês emprestado', () => {
    const cols = colunasDaVisao(entrada({ referencia: 'media12', media12: { linhas: null, carregando: false, motivo: 'um mês só' } }));
    expect(cols[0]).toMatchObject({ semDado: true, sub: 'sem média', subLongo: 'um mês só' });
  });
});

describe('"O que mudou" na grade', () => {
  const montar = (oQueMudou: boolean) => render(
    <PecDrePanel colunas={colunasDaVisao(entrada({}))} alturaCartao={null} cartaoRef={{ current: null }} unidades={['rs']}
      modo="detalhado" abertos={todosAbertos()} onAbertos={() => {}} oQueMudou={oQueMudou} />);

  it('NJ out/26 × out/25, Custo variável: abre Nutrição, Pastagem, Reprodução e Sanidade com o ponto; o resto soma em "+ 3 itens sem desvio"', () => {
    montar(true);
    for (const c of ['Nutrição', 'Pastagem', 'Reprodução', 'Sanidade']) {
      const tr = linhaDe(c);
      expect(tr, c).toBeTruthy();
      expect(tr?.cells[0].querySelector('.bg-orange-500'), c).toBeTruthy();
    }
    expect(linhaDe('Comercial')).toBeUndefined();
    expect(linhaDe('Identificação')).toBeUndefined();
    const mais = linhaDe('+ 3 itens sem desvio');
    expect(mais).toBeTruthy();
    const textos = [...(mais?.cells ?? [])].map(td => td.textContent);
    expect(textos).toContain('3.332,00');
    expect(textos).toContain('1.341,13');
    /* Custo fixo: abre 4, junta Administração e Outros (os números do mock) */
    expect(linhaDe('+ 2 itens sem desvio')?.textContent).toContain('19.582,53');
  });

  it('"Tudo aberto" (sem o filtro) mostra todas as sublinhas e nenhum ponto', () => {
    montar(false);
    expect(linhaDe('Comercial')).toBeTruthy();
    expect(linhaDe('+ 3 itens sem desvio')).toBeUndefined();
    expect(document.querySelector('.bg-orange-500')).toBeNull();
  });

  it('sem coluna de comparação (por fazenda), nada se esconde', () => {
    render(<PecDrePanel colunas={colunasDaVisao(entrada({ visao: 'fazenda' }))} alturaCartao={null} cartaoRef={{ current: null }}
      unidades={['rs']} modo="detalhado" abertos={todosAbertos()} onAbertos={() => {}} oQueMudou />);
    expect(linhaDe('Comercial')).toBeTruthy();
  });
});

describe('o "Mais ▾": os anos anteriores na grade', () => {
  it('2–5 anos moram aqui; escolher chama a referência numérica', () => {
    const onReferencia = vi.fn();
    render(<MaisPec rateioNosGrupos={false} onRateioNosGrupos={() => {}} deltas={[]} onDeltas={() => {}} deltaIndisponivel={false}
      visao="comparacao" onVisao={() => {}} nFazendas={2} referencia={1} onReferencia={onReferencia} />);
    fireEvent.keyDown(screen.getByTestId('dre-mais'), { key: 'Enter' });
    expect(screen.getByText('Anos anteriores na grade')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onReferencia).toHaveBeenCalledWith(3);
  });
});

describe('o painel da direita', () => {
  const selo: Selo = { grau: 'media', falta: [{ motivo: 'O preço do rebanho não mudou no mês', destino: 'valor_rebanho' }] };
  const montar = (base: DrePecLinhas | null, onDestino = vi.fn()) => {
    render(<PecPainelLeitura atual={NJ26} base={base} comparacao="ano_anterior" rotuloAtual="out/26" rotuloBase="out/25"
      rotuloBaseFrase="out/25" carregandoBase={false} notasALancar={91} selo={selo} altura={600} onDestino={onDestino} />);
    return onDestino;
  };

  it('NJ out/26 × out/25: o selo e o que falta, "No mês" por ha, a ponte em 8 colunas e as 5 da leitura na ordem', () => {
    const onDestino = montar(NJ25);
    expect(screen.getByTestId('dre-selo-confianca').textContent).toBe('Confiança média');
    expect(screen.getByTestId('dre-selo-falta').textContent).toContain('O preço do rebanho não mudou no mês');
    expect(screen.getByText('Custo total/ha').closest('tr')?.textContent).toContain('R$ 113,42');
    const ponte = screen.getByTestId('dre-ponte');
    expect(ponte.children.length).toBe(8);
    expect(ponte.textContent).toContain('−230');
    expect(ponte.textContent).toContain('2.099');
    const itens = within(screen.getByTestId('dre-leitura-mes')).getAllByRole('listitem');
    expect(itens.map(li => li.querySelector('.font-medium')?.textContent)).toEqual([
      'Variação por produção subiu R$ 2,11 mi', 'Custo variável R$ 450 mil menor', 'Vendas 25% menores', 'Custo fixo 23,5% maior',
      'Despesas financeiras zeradas',
    ]);
    fireEvent.click(within(itens[1]).getByRole('button', { name: 'Ver notas →' }));
    expect(onDestino).toHaveBeenCalledWith({ tipo: 'notas_a_lancar' });
    fireEvent.click(within(itens[2]).getByRole('button', { name: 'Ver abates →' }));
    expect(onDestino).toHaveBeenCalledWith({ tipo: 'abates' });
    fireEvent.click(within(itens[0]).getByRole('button', { name: 'Ver variação do rebanho →' }));
    expect(onDestino).toHaveBeenCalledWith({ tipo: 'valor_rebanho' });
  });

  it('sem comparação: nem ponte nem leitura, e o painel diz por quê (nunca zero)', () => {
    montar(null);
    expect(screen.queryByTestId('dre-ponte')).toBeNull();
    expect(screen.queryByTestId('dre-leitura-mes')).toBeNull();
    expect(screen.getAllByText(/Sem comparação/).length).toBeGreaterThan(0);
    expect(screen.getByText('Lucro operacional/ha').closest('tr')?.textContent).toContain('—');
  });
});

describe('D-B2: a grade enche a coluna de 58fr em proporção fixa (UI-LARGURA-FIXA-01)', () => {
  it('rótulo e colunas de valor crescem pelo mesmo fator; as de valor são iguais; a soma é a largura disponível', () => {
    const r = largurasQueEnchem([200, 98, 120, 70], 800);
    if (!r) throw new Error('sem larguras');
    expect(r.cols.slice(1)).toEqual([r.valor, r.valor, r.valor]);
    expect(r.cols.reduce((a, b) => a + b, 0)).toBe(800);
    /* fator = 800 / (200 + 3 × 120) = 1,43 → valor 171, rótulo o que sobra (287): a proporção 200:120 se mantém */
    expect(r.valor).toBe(171);
    expect(r.cols[0]).toBe(287);
  });
  it('a proporção só depende das colunas: dois clientes com as mesmas colunas têm o mesmo colgroup', () => {
    expect(largurasQueEnchem([200, 98, 120, 70], 1000)).toEqual(largurasQueEnchem([200, 98, 120, 70], 1000));
  });
  it('sem espaço (fator < 1), as larguras da régua com as de valor iguais à maior — o cartão rola por dentro', () => {
    expect(largurasQueEnchem([200, 98, 120], 300)).toEqual({ cols: [200, 120, 120], valor: 120 });
  });
});

describe('D-B1: a ponte reserva a faixa dos rótulos acima das barras', () => {
  it('a área das barras começa 12px abaixo do topo, em todas as 8 colunas', () => {
    render(<PecPainelLeitura atual={NJ26} base={NJ25} comparacao="ano_anterior" rotuloAtual="out/26" rotuloBase="out/25"
      rotuloBaseFrase="out/25" carregandoBase={false} notasALancar={0} selo={{ grau: 'alta', falta: [] }} altura={600} onDestino={vi.fn()} />);
    const areas = screen.getByTestId('dre-ponte').querySelectorAll('[data-ponte-area]');
    expect(areas.length).toBe(8);
    for (const a of areas) expect(a.className).toContain('top-[12px]');
  });
});
