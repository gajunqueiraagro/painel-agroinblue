/**
 * DRE-PAINEL-01 · PR-B — a tela: a referência "Média 12m" na grade, o modo "O que mudou" (só as sublinhas com desvio, o ponto laranja e
 * "+ N itens sem desvio" com a soma), os anos 2–5 no "Mais ▾" e o painel da direita (selo, "No mês", ponte, leitura e os links).
 * As REGRAS têm prova própria em `src/lib/dre/leitura.test.ts`; aqui se prova que a tela as usa e mostra o que elas dizem.
 * Números: o fixture real do NJ (out/26 × out/25), o mesmo do PR-A.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
/* DRE-PAINEL-03b: o painel abre na Cascata; a ponte é a aba "O que mudou" ao lado */
const abrirOQueMudou = () => fireEvent.click(within(screen.getByTestId('dre-painel-abas')).getByRole('button', { name: 'O que mudou' }));
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
    if (base) abrirOQueMudou();
    return onDestino;
  };

  it('NJ out/26 × out/25: o selo e o que falta, "No mês" por ha, a ponte em 8 linhas e as 5 da leitura na ordem', () => {
    const onDestino = montar(NJ25);
    expect(screen.getByTestId('dre-selo-confianca').textContent).toBe('Confiança média');
    expect(screen.getByTestId('dre-selo-falta').textContent).toContain('O preço do rebanho não mudou no mês');
    expect(screen.getByText('Custo total').closest('tr')?.textContent).toBe('Custo total553.193,79113,42−43,2 %'); // DRE-PAINEL-03b: R$ · R$/ha · Δ %
    /* DRE-PAINEL-02: a ponte é uma LISTA de 8 linhas (as duas pontas e os 6 passos), em R$ mi */
    const ponte = screen.getByTestId('dre-ponte');
    expect(ponte.querySelectorAll('tr[data-ponte-linha]').length).toBe(8);
    expect(ponte.textContent).toContain('Lucro operacional out/25−0,23');
    expect(ponte.textContent).toContain('Lucro operacional out/262,10');
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
    expect(screen.getByText('Lucro operacional').closest('tr')?.textContent).toContain('—');
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

/* ══════════════ DRE-PAINEL-02 (Gabriel 23/11 07:41) ══════════════ */

describe('DRE-PAINEL-02 (2): a ponte em lista — rótulo · barra · valor, barra e número na mesma cor', () => {
  const montar = (base: DrePecLinhas = NJ25) => {
    render(<PecPainelLeitura atual={NJ26} base={base} comparacao="ano_anterior" rotuloAtual="out/26"
      rotuloBase="out/25" rotuloBaseFrase="out/25" carregandoBase={false} notasALancar={0} selo={{ grau: 'alta', falta: [] }} altura={600}
      onDestino={vi.fn()} />);
    abrirOQueMudou();
  };
  const linha = (chave: string) => {
    const tr = screen.getByTestId('dre-ponte').querySelector(`tr[data-ponte-linha="${chave}"]`);
    if (!(tr instanceof HTMLTableRowElement)) throw new Error(`sem a linha ${chave}`);
    const barra = tr.querySelector('[data-ponte-barra]');
    if (!(barra instanceof HTMLElement)) throw new Error(`sem a barra de ${chave}`);
    return { tr, rotulo: tr.cells[0].textContent, valor: tr.cells[2], barra };
  };
  it('a ordem: lucro de out/25, os 6 passos com o fato, lucro de out/26', () => {
    montar();
    const rotulos = [...screen.getByTestId('dre-ponte').querySelectorAll('tr')].map(tr => tr.cells[0].textContent);
    expect(rotulos).toEqual(['Lucro operacional out/25', 'Receita menor (−25%)', 'Produção maior (+3.168,9%)', 'Reposição igual',
      'Custo variável menor (−62,8%)', 'Custo fixo maior (+23,5%)', 'Rateio menor (−20,3%)', 'Lucro operacional out/26']);
  });
  it('verde = ajuda o lucro, vermelho = tira — a barra E o número; o efeito vem com sinal', () => {
    montar();
    const cv = linha('custo_variavel');
    expect(cv.valor.textContent).toBe('+0,45');
    expect(cv.valor.className).toContain('text-green-700');
    expect(cv.barra.className).toContain('bg-green-600');
    const rl = linha('receita_liquida');
    expect(rl.valor.textContent).toBe('−0,20');
    expect(rl.valor.className).toContain('text-red-600');
    expect(rl.barra.className).toContain('bg-red-500');
    const cf = linha('custo_fixo');
    expect(cf.valor.className).toContain('text-red-600');
    expect(cf.barra.className).toContain('bg-red-500');
  });
  it('barras proporcionais numa escala só, com o mínimo visível (o passo de R$ 14 mil não é um risco)', () => {
    montar();
    /* o maior |valor| é a produção (+2,11 mi): ela enche; o lucro de out/26 (2,10 mi) quase; o rateio (+0,01 mi) fica no mínimo de 6px */
    const largura = (chave: string) => parseFloat(linha(chave).barra.style.width);
    expect(largura('vpb_operacional')).toBe(100);
    expect(largura('fim')).toBeCloseTo((2099005.63 / 2110704.6) * 100, 0);
    expect(largura('rateio_adm')).toBeLessThan(1);
    for (const c of ['inicio', 'receita_liquida', 'vpb_operacional', 'reposicao', 'custo_variavel', 'custo_fixo', 'rateio_adm', 'fim']) {
      expect(linha(c).barra.style.minWidth, c).toBe('6px');
    }
  });
  it('contra a Meta: "Lucro da meta" → "Lucro realizado"; "Produção: sem meta" com o resto, a barra tracejada e o número cinza', () => {
    render(<PecPainelLeitura atual={NJ26} base={F('nj-2026-10-meta')} comparacao="meta" rotuloAtual="out/26" rotuloBase="Meta"
      rotuloBaseFrase="a Meta" carregandoBase={false} notasALancar={0} selo={{ grau: 'alta', falta: [] }} altura={600} onDestino={vi.fn()} />);
    abrirOQueMudou();
    const vpb = linha('vpb_operacional');
    expect(vpb.rotulo).toBe('Produção: sem meta');
    expect(vpb.valor.textContent).toBe('−0,88');
    expect(linha('inicio').rotulo).toBe('Lucro da meta');
    expect(linha('fim').rotulo).toBe('Lucro realizado');
    expect(linha('custo_fixo').rotulo).toBe('Custo fixo acima da meta (+25,8%)');
    expect(vpb.valor.className).toContain('text-muted-foreground');
    expect(vpb.barra.className).toContain('border-dashed');
  });
});

describe('DRE-PAINEL-02 (3): "No mês" vira "No período" com mais de um mês na tela', () => {
  const montar = (horizonte?: 'mes' | 'periodo') => render(<PecPainelLeitura atual={NJ26} base={NJ25} comparacao="ano_anterior"
    rotuloAtual="jan–out/26" rotuloBase="jan–out/25" rotuloBaseFrase="jan–out/25" carregandoBase={false} notasALancar={0}
    selo={{ grau: 'alta', falta: [] }} altura={600} onDestino={vi.fn()} {...(horizonte ? { horizonte } : {})} />);
  it('período: o título e a leitura dizem "período"; as frases também', () => {
    montar('periodo');
    expect(screen.getByTestId('dre-painel-titulo').textContent).toBe('No período');
    expect(screen.getByTestId('dre-leitura-titulo').textContent).toBe('Leitura do período');
    const leitura = screen.getByTestId('dre-leitura-mes').textContent ?? '';
    expect(leitura).toContain('no período');
    expect(leitura).not.toContain('no mês');
  });
  it('um mês só (o padrão): "No mês" e "Leitura do mês"', () => {
    montar();
    expect(screen.getByTestId('dre-painel-titulo').textContent).toBe('No mês');
    expect(screen.getByTestId('dre-leitura-titulo').textContent).toBe('Leitura do mês');
  });
});

/* ══════════════ DRE-PAINEL-03b (Gabriel 23/11): o PAINEL abre na CASCATA (a mesma peça da "Cascata do ano", até o Lucro operacional) e
   "O que mudou" é a aba ao lado ══════════════ */
import { CascataDesenho, colunaPadraoDaCascata, montarBarras, precisaAlternar, ROTULO_CURTO } from '@/components/agri/PecCascataView';
import { valorDaLinha } from '@/pages/PecDrePanel';
import { LINHAS_PEC_RESUMIDO } from '@/components/agri/drePecRegua';
describe('DRE-PAINEL-03b: o painel abre na Cascata até o Lucro operacional; "O que mudou" ao lado', () => {
  const COLS = colunasDaVisao(entrada({}));
  const COL = colunaPadraoDaCascata(COLS);
  const montar = (base: DrePecLinhas | null, coluna = COL) => render(<PecPainelLeitura atual={NJ26} base={base} comparacao="ano_anterior"
    rotuloAtual="out/26" rotuloBase="out/25" rotuloBaseFrase="out/25" carregandoBase={false} notasALancar={0}
    selo={{ grau: 'alta', falta: [] }} altura={600} onDestino={vi.fn()} colunaCascata={coluna} />);

  it('a coluna é a do período (a MESMA que a janela do Gráfico abre)', () => {
    expect(COL?.atual).toBe(true);
    expect(COL?.linhas).toBe(NJ26);
  });
  it('a cascata do painel = as barras da janela, cortadas no Lucro operacional (o mesmo número da grade)', () => {
    const inteira = montarBarras(COL);
    const painel = montarBarras(COL, 'resultado_operacional');
    if (!inteira || !painel || !COL) throw new Error('sem barras');
    expect(painel.barras.map(b => b.chave)).toEqual(['receita_bruta', 'deducoes', 'receita_liquida', 'vpb_operacional', 'vbp',
      'custo_variavel', 'margem', 'custo_fixo', 'resultado_operacional']);
    expect(painel.barras).toEqual(inteira.barras.slice(0, painel.barras.length));
    const def = LINHAS_PEC_RESUMIDO.find(d => d.chave === 'resultado_operacional');
    if (!def) throw new Error('sem a linha');
    expect(painel.lucro).toBe(valorDaLinha(COL, def));
  });
  it('abre na Cascata (nunca na ponte), com o título do período', () => {
    montar(NJ25);
    expect(screen.getByTestId('dre-painel-aba-cascata')).toBeTruthy();
    expect(screen.queryByTestId('dre-ponte')).toBeNull();
    expect(screen.getByTestId('dre-painel-abas').textContent).toContain('Da receita bruta ao lucro operacional de out/26');
    abrirOQueMudou();
    expect(screen.getByTestId('dre-ponte')).toBeTruthy();
    expect(screen.getByTestId('dre-painel-abas').textContent).toContain('Do lucro operacional de out/25 ao de out/26');
  });
  it('sem comparação: "O que mudou" apagada com o motivo; desligar a comparação com a aba aberta volta à Cascata', () => {
    const { rerender } = montar(NJ25);
    abrirOQueMudou();
    expect(screen.getByTestId('dre-painel-aba-ponte')).toBeTruthy();
    rerender(<PecPainelLeitura atual={NJ26} base={null} comparacao="ano_anterior" rotuloAtual="out/26" rotuloBase="out/25"
      rotuloBaseFrase="out/25" carregandoBase={false} notasALancar={0} selo={{ grau: 'alta', falta: [] }} altura={600} onDestino={vi.fn()}
      colunaCascata={COL} />);
    expect(screen.getByTestId('dre-painel-aba-cascata')).toBeTruthy();
    const aba = within(screen.getByTestId('dre-painel-abas')).getByRole('button', { name: 'O que mudou' });
    expect(aba.hasAttribute('disabled')).toBe(true);
    expect(aba.getAttribute('title')).toBe('Escolha com o que comparar (o "Comparar com" no topo)');
  });
  it('o desenho é a CascataDesenho na largura do painel: 9 barras, a última o Lucro operacional', () => {
    const antes = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 435 });
    try {
      montar(NJ25);
      const svg = within(screen.getByTestId('dre-painel-aba-cascata')).getByRole('img', { name: 'Cascata do resultado' });
      expect(svg.getAttribute('width')).toBe('435');
      const barras = svg.querySelectorAll('rect');
      expect(barras.length).toBe(9);
      expect(barras[8].querySelector('title')?.textContent).toMatch(/^= Lucro operacional: /);
      /* DRE-PAINEL-03b (Gabriel 16:30, D-P3 = 2 alturas): os 9 nomes curtos, UMA linha cada, 9,5px, o inteiro no title; a 435px (~1280) as
         barras têm 42px e os nomes alternam: a 1ª fila nas ímpares, a 2ª nas pares */
      const nomes = [...svg.querySelectorAll('text[data-rotulo-curto]')];
      expect(nomes.map(t => t.lastChild?.textContent)).toEqual(['Rec. bruta', 'Deduções', 'Rec. líquida', 'Var. estoque', 'VBP', 'C. variável',
        'Margem', 'C. fixo', 'Lucro oper.']);
      expect(nomes.map(t => t.querySelector('title')?.textContent)).toEqual(['Receita bruta', 'Deduções', 'Receita líquida', 'Variação do estoque',
        'VBP', 'Custo variável', 'Margem de contribuição', 'Custo fixo', 'Lucro operacional']);
      expect(new Set(nomes.map(t => t.getAttribute('font-size')))).toEqual(new Set(['9.5']));
      const ys = nomes.map(t => Number(t.getAttribute('y')));
      expect(ys.filter((_, i) => i % 2 === 0).every(y => y === ys[0])).toBe(true);
      expect(ys.filter((_, i) => i % 2 === 1).every(y => y === ys[0] + 11)).toBe(true);
    } finally {
      if (antes) Object.defineProperty(HTMLElement.prototype, 'clientWidth', antes);
    }
  });
  it('DRE-PAINEL-03b: a 1920 (painel de 701px) os nomes curtos cabem lado a lado — uma fila só; a regra das 2 alturas', () => {
    const antes = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 701 });
    try {
      montar(NJ25);
      const ys = [...screen.getByTestId('dre-painel-aba-cascata').querySelectorAll('text[data-rotulo-curto]')].map(t => t.getAttribute('y'));
      expect(ys.length).toBe(9);
      expect(new Set(ys).size).toBe(1);
    } finally {
      if (antes) Object.defineProperty(HTMLElement.prototype, 'clientWidth', antes);
    }
    const nomes = Object.values(ROTULO_CURTO);
    expect(precisaAlternar(nomes, 35)).toBe(true);   // 1126
    expect(precisaAlternar(nomes, 42)).toBe(true);   // 1280
    expect(precisaAlternar(nomes, 72)).toBe(false);  // 1920
    expect(precisaAlternar(['VBP', 'Margem'], 30)).toBe(false);
    /* a regra é do PAR de vizinhos, não de um nome sozinho: 'Margem' (30px) e 'C. fixo' (35px) cabem cada um em 36px, mas juntos encostam */
    expect(precisaAlternar(['Margem', 'C. fixo'], 36)).toBe(true);
  });
  it('DRE-PAINEL-03b: a janela do Gráfico ("Cascata do ano", 960px) segue com os nomes INTEIROS, sem os curtos', () => {
    render(<CascataDesenho grafico={montarBarras(COL)} largura={960} altura={310} />);
    const svg = screen.getByRole('img', { name: 'Cascata do resultado' });
    expect(svg.querySelectorAll('text[data-rotulo-curto]').length).toBe(0);
    const textos = [...svg.querySelectorAll('text')].map(t => t.textContent);
    expect(textos).toContain('Receita');
    expect(textos).not.toContain('Rec. bruta');
  });
  it('sem a coluna do período: a frase, nunca um gráfico vazio', () => {
    montar(NJ25, null);
    expect(screen.getByTestId('dre-painel-aba-cascata').textContent).toBe('Sem a coluna do período: não há cascata.');
  });
});

/* DRE-PAINEL-02 cor do "por hectare" (Gabriel 09:29, FILA 11:41): Lucro operacional/ha e Resultado econômico/ha POSITIVO = verde, negativo =
   vermelho; Custo total/ha pela regra de custo (custo é vermelho). O Δ: verde = melhorou, vermelho = piorou (custo que SOBE piorou). */
import { noMes, type IndicadorNoMes } from '@/lib/dre/leitura';
describe('DRE-PAINEL-02: a cor do bloco "por hectare" segue o SINAL (lucro) e a regra de custo', () => {
  const VERDE = 'text-green-700';
  const VERMELHO = 'text-red-600';
  const celulas = (rotulo: string) => {
    const tr = screen.getByText(rotulo).closest('tr');
    if (!(tr instanceof HTMLTableRowElement)) throw new Error(rotulo);
    /* DRE-PAINEL-03b: Indicador | R$ | R$/ha | Δ % */
    return { total: tr.cells[1], valor: tr.cells[2], pct: tr.cells[3] };
  };
  const montar = (atual: DrePecLinhas, base: DrePecLinhas) => render(<PecPainelLeitura atual={atual} base={base} comparacao="ano_anterior"
    rotuloAtual="out" rotuloBase="ref" rotuloBaseFrase="ref" carregandoBase={false} notasALancar={0}
    selo={{ grau: 'alta', falta: [] }} altura={600} onDestino={vi.fn()} />);
  const corEsperada = (v: number | null | undefined, custo: boolean) =>
    (v == null || v === 0 ? null : (custo ? v > 0 : v < 0) ? VERMELHO : VERDE);

  it('NJ out/26 (lucro POSITIVO) × out/25: lucro e resultado/ha em VERDE; custo/ha em vermelho', () => {
    const n = noMes(NJ25, NJ26);
    expect(n.lucroOpHa.valor ?? 0).toBeGreaterThan(0);
    expect(n.resEconHa.valor ?? 0).toBeGreaterThan(0);
    montar(NJ26, NJ25);
    expect(celulas('Lucro operacional').valor.className).toContain(VERDE);
    expect(celulas('Resultado econômico').valor.className).toContain(VERDE);
    expect(celulas('Custo total').valor.className).toContain(VERMELHO);
  });

  it('NJ out/25 (lucro NEGATIVO) × out/26: lucro/ha em VERMELHO, com o sinal no número; nunca verde', () => {
    const n = noMes(NJ26, NJ25);
    expect(n.lucroOpHa.valor ?? 0).toBeLessThan(0);
    montar(NJ25, NJ26);
    const lucro = celulas('Lucro operacional').valor;
    expect(lucro.className).toContain(VERMELHO);
    expect(lucro.className).not.toContain(VERDE);
    expect(lucro.textContent).toMatch(/^−/);
    expect(celulas('Lucro operacional').total.textContent).toMatch(/^−/);
  });

  it('DRE-PAINEL-03b: R$ = a linha da grade (absoluto), R$/ha, Δ % = Δ ÷ |comparada| da grade; comparada zero = "—"', () => {
    const n = noMes(NJ25, NJ26);
    montar(NJ26, NJ25);
    const lucro = celulas('Lucro operacional');
    expect(NJ26.resultado_operacional).not.toBeNull();
    expect(n.lucroOpHa.total).toBe(NJ26.resultado_operacional);
    expect(lucro.total.textContent).toBe('2.098.805,63');
    expect(lucro.valor.textContent).toBe((2098805.63 / 4877.6).toFixed(2).replace('.', ','));
    const esperado = ((2098805.63 - -230136.68) / 230136.68) * 100;
    expect(n.lucroOpHa.pct).toBeCloseTo(esperado / 100, 9);
    expect(lucro.pct.textContent).toBe(`+${esperado.toFixed(1).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')} %`);
    expect([...screen.getByTestId('dre-painel-indicadores').querySelectorAll('col')].map(c => c.style.width)).toEqual(['', '82px', '62px', '58px']);
    expect(noMes(lerLinhas({ resultado_operacional: 0 }), NJ26).lucroOpHa.pct).toBeNull();
  });

  it('o Δ: lucro que sobe é verde, custo que sobe é vermelho (melhorou × piorou), nos dois sentidos', () => {
    const sentidos: [DrePecLinhas, DrePecLinhas][] = [[NJ26, NJ25], [NJ25, NJ26]];
    for (const [atual, base] of sentidos) {
      const n = noMes(base, atual);
      montar(atual, base);
      const linhas: [string, IndicadorNoMes, boolean][] = [['Lucro operacional', n.lucroOpHa, false], ['Resultado econômico', n.resEconHa, false],
        ['Custo total', n.custoTotalHa, true]];
      for (const [rotulo, ind, custo] of linhas) {
        const cor = corEsperada(ind.pct, custo);
        expect(cor, rotulo).not.toBeNull();
        expect(celulas(rotulo).pct.className, rotulo).toContain(cor ?? '');
        expect(celulas(rotulo).valor.className, rotulo).toContain(corEsperada(ind.valor, custo) ?? '');
        expect(celulas(rotulo).total.className, rotulo).toContain(corEsperada(ind.total, custo) ?? '');
      }
      cleanup();
    }
  });
});

/* ══════════════ DRE-PAINEL-03 (Gabriel 23/11 09:34): a aba "O que mudou" na janela do Gráfico ══════════════ */
import { PecGraficoModal, TITULO_SEM_COMPARACAO } from '@/components/agri/PecGraficoModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('DRE-PAINEL-03: a aba "O que mudou" do Gráfico segue o "Comparar com"', () => {
  const montar = (base: DrePecLinhas | null, comparacao: 'ano_anterior' | 'meta' = 'ano_anterior') => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>
      <PecGraficoModal aberto onFechar={() => {}} colunas={[]} clienteId={null}
        ponte={{ atual: NJ26, base, comparacao, rotuloBase: comparacao === 'meta' ? 'Meta' : 'out/25', rotuloAtual: 'out/26' }} />
    </QueryClientProvider>);
  const aba = (rotulo: string) => {
    const b = screen.getAllByRole('button').find(x => x.textContent === rotulo);
    if (!(b instanceof HTMLButtonElement)) throw new Error(`sem a aba ${rotulo}`);
    return b;
  };
  it('abre na Cascata (o padrão); "O que mudou" mostra a MESMA ponte do painel: lucro comparado → passos → lucro do período', () => {
    montar(NJ25);
    expect(screen.queryByTestId('grafico-ponte')).toBeNull();
    expect(aba('O que mudou').disabled).toBe(false);
    fireEvent.click(aba('O que mudou'));
    const linhas = [...screen.getByTestId('grafico-ponte').querySelectorAll('tr[data-ponte-linha]')].map(tr => tr instanceof HTMLTableRowElement ? tr.cells[0].textContent : '');
    expect(linhas[0]).toBe('Lucro operacional out/25');
    expect(linhas[7]).toBe('Lucro operacional out/26');
    expect(linhas).toHaveLength(8);
  });
  it('reabrir a janela volta à Cascata (o padrão ao abrir), mesmo tendo saído em "O que mudou"', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    const tree = (aberto: boolean) => (
      <QueryClientProvider client={qc}>
        <PecGraficoModal aberto={aberto} onFechar={() => {}} colunas={[]} clienteId={null}
          ponte={{ atual: NJ26, base: NJ25, comparacao: 'ano_anterior', rotuloBase: 'out/25', rotuloAtual: 'out/26' }} />
      </QueryClientProvider>);
    const r = render(tree(true));
    fireEvent.click(aba('O que mudou'));
    expect(screen.getByTestId('grafico-ponte')).toBeTruthy();
    r.rerender(tree(false));
    r.rerender(tree(true));
    expect(screen.queryByTestId('grafico-ponte')).toBeNull();
  });
  it('contra a Meta: "Lucro da meta" → "Lucro realizado"', () => {
    montar(F('nj-2026-10-meta'), 'meta');
    fireEvent.click(aba('O que mudou'));
    const t = screen.getByTestId('grafico-ponte').textContent ?? '';
    expect(t).toContain('Lucro da meta');
    expect(t).toContain('Lucro realizado');
    expect(t).toContain('abaixo da meta');
  });
  it('sem comparação ligada: a aba fica apagada, com o title, e não abre', () => {
    montar(null);
    const b = aba('O que mudou');
    expect(b.disabled).toBe(true);
    expect(b.title).toBe(TITULO_SEM_COMPARACAO);
    fireEvent.click(b);
    expect(screen.queryByTestId('grafico-ponte')).toBeNull();
  });
});
