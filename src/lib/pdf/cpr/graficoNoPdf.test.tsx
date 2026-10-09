/**
 * CPR-TRANSFERENCIAS-NO-FLUXO-01 (commit B) — o gráfico do Fluxo e as cores de status na folha do PDF.
 * O que prende: (1) o leitor descreve o SVG que a tela desenhou, sem recalcular; (2) sem desenho pronto, nulo (a folha sai sem
 * o gráfico, com aviso); (3) o status no PDF lê a cor do DONO da lista, sem segunda paleta; (4) a ponta de transferência chega
 * escrita ao PDF e ao Excel; (5) a tela monta o MESMO nó do gráfico para a folha (lido da fonte).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lerGraficoDoDom, esperarGraficoNoDom } from '@/lib/pdf/cpr/graficoDoDom';
import { hexDoStatus, STATUS_PALETA } from '@/lib/financeiro/statusFinanceiro';
import { escalaPeloDado, escalaSimetrica } from '@/lib/financeiro/fluxoPrevisto';
import { passoDoEixoNaFolha } from '@/components/financeiro-v2/CprFluxoPrevisto';
import { contaDaFolha, montarModeloCpr, type EntradaDoModelo, type GrupoDaTela } from '@/lib/pdf/cpr/modeloCpr';
import { montarPayloadExcelCpr } from '@/lib/financeiro/cprExcel';
import { recortarCpr, serieDoSaldoCpr, chaveDaLinhaCpr, ehReceberCpr, ehTransferenciaCpr, type ContaCpr } from '@/lib/financeiro/cprRecorte';

const SVG = `
  <svg class="recharts-surface" width="798" height="250">
    <title>fora</title><defs><clipPath id="c"><rect x="0" y="0" width="1" height="1"/></clipPath></defs>
    <g class="grade"><line x1="60" y1="20" x2="700" y2="20" stroke="#ded6c9" stroke-dasharray="3 3" fill="none"/></g>
    <g transform="translate(100,200)">
      <text x="0" y="0" dy="11" text-anchor="middle" fill="#3a3a3a" font-size="9.5">05</text>
      <line x1="0" y1="17" x2="0" y2="32" stroke="#3a3a3a" stroke-width="1" opacity="0.45"/>
      <g transform="translate(4, 0)"><text x="0" y="0" dy="29" fill="#3a3a3a" font-size="12" font-weight="700">out/26</text></g>
    </g>
    <text x="52" y="60" text-anchor="end" fill="#3a3a3a" font-size="10"><tspan x="52" dy="0.355em">200</tspan><tspan x="52" dy="1em">mil</tspan></text>
    <path d="M60,100L700,100" fill="#3d8f5f" fill-opacity="0.1" stroke="none"/>
    <path d="M60,100C200,100,300,180,700,180" fill="none" stroke="#e8973a" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>
    <circle cx="700" cy="180" r="3.4" fill="#e8973a" stroke="#fff" stroke-width="1.3"/>
    <rect x="300" y="100" width="12" height="40" fill="#c0392b"/>
  </svg>`;
function montar(svg: string): HTMLElement {
  const raiz = document.createElement('div');
  raiz.innerHTML = `<div data-grafico="#f6f1e7"><h2>Fluxo de caixa previsto</h2><p>conciliado até 09/out ·   * de hoje em diante</p>
    <div data-grafico-legenda>
      <span><svg><line stroke="#3d8f5f" x1="0" x2="18"/></svg>Conciliado</span>
      <span><svg><line stroke="#e8973a" stroke-dasharray="4 3"/></svg>Previsto</span>
      <span><svg><circle fill="#3b6ea5" r="3"/></svg>Em conta hoje</span>
    </div><div data-grafico-plot>${svg}</div></div>`;
  return raiz;
}

describe('o leitor do gráfico — descreve o que a tela desenhou', () => {
  const g = lerGraficoDoDom(montar(SVG));
  it('tamanho, fundo, título, frase (numa linha) e legenda (traço, tracejado, ponto)', () => {
    expect(g).not.toBeNull();
    expect([g?.largura, g?.altura, g?.fundo, g?.titulo]).toEqual([798, 250, '#f6f1e7', 'Fluxo de caixa previsto']);
    expect(g?.subtitulo).toBe('conciliado até 09/out · * de hoje em diante');
    expect(g?.legenda).toEqual([
      { rotulo: 'Conciliado', cor: '#3d8f5f', tracejado: false, ponto: false },
      { rotulo: 'Previsto', cor: '#e8973a', tracejado: true, ponto: false },
      { rotulo: 'Em conta hoje', cor: '#3b6ea5', tracejado: false, ponto: true },
    ]);
  });
  it('cada nó como está: caminho, linha, retângulo e círculo, com cor, traço e opacidade; <title> e <defs> ficam fora', () => {
    const nos = g?.nos ?? [];
    expect(nos.filter((n) => n.t === 'path')).toEqual([
      { t: 'path', d: 'M60,100L700,100', tx: 0, ty: 0, fill: '#3d8f5f', stroke: 'none', sw: 1, dash: null, fo: 0.1, so: 1, cap: null },
      { t: 'path', d: 'M60,100C200,100,300,180,700,180', tx: 0, ty: 0, fill: 'none', stroke: '#e8973a', sw: 2, dash: '5 4', fo: 1, so: 1, cap: 'round' },
    ]);
    expect(nos.find((n) => n.t === 'circle')).toEqual({ t: 'circle', cx: 700, cy: 180, r: 3.4, fill: '#e8973a', stroke: '#fff', sw: 1.3, fo: 1 });
    expect(nos.find((n) => n.t === 'rect')).toEqual({ t: 'rect', x: 300, y: 100, w: 12, h: 40, fill: '#c0392b', stroke: 'none', sw: 1, fo: 1 });
    expect(nos.filter((n) => n.t === 'rect').length).toBe(1);                     // o rect do clipPath não entra
    expect(nos.some((n) => n.t === 'text' && n.texto === 'fora')).toBe(false);
  });
  it('o `translate` dos grupos (aninhados) entra na posição; a opacidade do nó vale no traço', () => {
    const nos = g?.nos ?? [];
    expect(nos.filter((n) => n.t === 'line')).toEqual([
      { t: 'line', x1: 60, y1: 20, x2: 700, y2: 20, stroke: '#ded6c9', sw: 1, dash: '3 3', so: 1, cap: null },
      { t: 'line', x1: 100, y1: 217, x2: 100, y2: 232, stroke: '#3a3a3a', sw: 1, dash: null, so: 0.45, cap: null },
    ]);
    expect(nos.filter((n) => n.t === 'text').map((n) => (n.t === 'text' ? [n.texto, n.x, n.y, n.ancora, n.tamanho, n.peso] : null))).toEqual([
      ['05', 100, 211, 'middle', 9.5, 400],
      ['out/26', 104, 229, 'start', 12, 700],
      ['200', 52, 63.55, 'end', 10, 400],      // dy em "em" é relativo à letra: 60 + 0,355 × 10
      ['mil', 52, 73.55, 'end', 10, 400],      // a linha seguinte desce 1em
    ]);
  });
  it('sem a linha do saldo desenhada (ou sem SVG, ou sem tamanho) devolve NULO — nunca um desenho pela metade', () => {
    expect(lerGraficoDoDom(montar('<svg width="798" height="250"><g><line x1="0" y1="0" x2="1" y2="1" stroke="#000"/></g></svg>'))).toBeNull();
    expect(lerGraficoDoDom(montar(''))).toBeNull();
    expect(lerGraficoDoDom(montar(SVG.replace('width="798"', 'width="0"')))).toBeNull();
    expect(lerGraficoDoDom(document.createElement('div'))).toBeNull();
  });
  it('a espera: devolve o gráfico quando duas leituras seguidas são iguais; passado o prazo, nulo', async () => {
    const vazio = document.createElement('div');
    expect(await esperarGraficoNoDom(() => vazio, { prazoMs: 40, passoMs: 10 })).toBeNull();
    expect(await esperarGraficoNoDom(() => null, { prazoMs: 20, passoMs: 10 })).toBeNull();
    const pronto = montar(SVG);
    expect((await esperarGraficoNoDom(() => pronto, { prazoMs: 200, passoMs: 10 }))?.nos.length).toBe(g?.nos.length);
    /* o desenho que ainda muda não é entregue: a leitura só vale quando repete */
    let i = 0;
    const mudando = () => montar(SVG.replace('cx="700"', `cx="${700 + (i++)}"`));
    expect(await esperarGraficoNoDom(mudando, { prazoMs: 60, passoMs: 10 })).toBeNull();
  });
});

describe('CPR-PDF-ACABAMENTO-01 — o desenho da FOLHA: escala pelo dado e eixo por dia', () => {
  const pt = (saldo: number) => ({ chave: 'x', rotulo: 'x', entradas: 0, saidas: 0, saldo, saldoPos: Math.max(saldo, 0), saldoNeg: Math.min(saldo, 0), faixa: '', abreFaixa: false });
  it('do menor ao maior saldo, sempre com o zero, em passos redondos, com no máximo 10 linhas — e sem faixa negativa vazia', () => {
    const e = escalaPeloDado([pt(296679.54), pt(430000), pt(504.52)]);
    expect(e.dominio).toEqual([0, 450000]);
    expect(e.passo).toBe(50000);
    expect(e.ticks.length).toBe(10);
    expect(Math.min(...e.ticks)).toBe(0);
    /* a da tela (simétrica) abre faixa negativa mesmo sem valor negativo; a da folha não */
    expect(escalaSimetrica([pt(296679.54), pt(430000), pt(504.52)]).dominio[0]).toBeLessThan(0);
  });
  it('com saldo negativo a faixa desce até ele; a barra de movimento não alarga a escala', () => {
    const e = escalaPeloDado([pt(430000), pt(-318810.98), { ...pt(0), saidas: -5_000_000, entradas: 9_000_000 }]);
    expect(e.dominio[0]).toBeLessThanOrEqual(-318810.98);
    expect(e.dominio[1]).toBeGreaterThanOrEqual(430000);
    expect(e.dominio[1]).toBeLessThan(1_000_000);
    expect(e.ticks).toContain(0);
    expect(e.ticks.length).toBeGreaterThanOrEqual(8);
    expect(e.ticks.length).toBeLessThanOrEqual(10);
  });
  it('tudo zero, e um só valor', () => {
    expect(escalaPeloDado([pt(0)]).ticks).toEqual([0, 1]);
    const e = escalaPeloDado([pt(505)]);
    expect([e.dominio[0], e.ticks.length <= 10, e.dominio[1] >= 505]).toEqual([0, true, true]);
  });
  it('eixo X da folha: até 31 dias uma marca por dia; acima, semanas inteiras, sem rótulo encostando', () => {
    expect(passoDoEixoNaFolha(31, 37)).toBe(1);
    expect(passoDoEixoNaFolha(32, 37)).toBe(1);
    expect(passoDoEixoNaFolha(92, 37)).toBe(7);
    expect(passoDoEixoNaFolha(180, 37)).toBe(7);
    expect(passoDoEixoNaFolha(180, 10)).toBe(21);
  });
  it('lido da fonte: a tela desenha com as medidas de sempre; só a folha recebe `folha`, e o leitor não mudou de dono', () => {
    const comp = readFileSync(resolve(__dirname, '../../../components/financeiro-v2/CprFluxoPrevisto.tsx'), 'utf8');
    expect(comp).toContain('const M = folha ? MEDIDAS_DA_FOLHA : MEDIDAS_DA_TELA;');
    expect(comp).toContain("eixoY: 10, larguraEixoY: 56, dia: 9.5, larguraDia: LARGURA_ROTULO_DIA, mes: 12, dyDia: 11, dyMes: 29, riscoDe: 17, riscoAte: 32,");
    expect(comp).toContain('alturaEixoX: 38, topo: 22, base: 30, margemDir: 96, offsetRotulo: OFFSET_ROTULO, alturaFaixa: ALTURA_FAIXA,');
    expect(comp).toContain('(folha ? escalaPeloDado(pontos) : escalaSimetrica(pontos))');
    const tela = readFileSync(resolve(__dirname, '../../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
    expect(tela).toContain('graficoDoFluxo(false)');
    expect(tela).toContain('{graficoDoFluxo(true)}');
    expect(tela.match(/graficoDoFluxo\(true\)/g)?.length).toBe(1);
  });
});

describe('status no PDF — a cor é a do dono da lista', () => {
  it('`hexDoStatus` lê o `texto` da paleta: os cinco status, todos diferentes', () => {
    const cores = ['previsto', 'programado', 'agendado', 'realizado', 'conciliado'].map((s) => hexDoStatus(s));
    expect(cores).toEqual(['#c2410c', '#1d4ed8', '#14532d', '#15803d', '#166534']);
    expect(new Set(cores).size).toBe(5);
    for (const [k, v] of Object.entries(STATUS_PALETA)) expect(v.texto, k).toContain(hexDoStatus(k));
    expect(hexDoStatus('REALIZADO')).toBe('#15803d');
    expect([hexDoStatus('meta'), hexDoStatus(null), hexDoStatus('')]).toEqual([null, null, null]);
  });
  it('lido da fonte: a folha não tem paleta própria de status, e o gráfico é um bloco inteiro', () => {
    const doc = readFileSync(resolve(__dirname, 'DocumentoCpr.tsx'), 'utf8');
    expect(doc).not.toMatch(/COR_STATUS/);
    expect(doc).toContain('color: hexDoStatus(c.statusChave) ?? COR.cinzaMedio');
    for (const hex of ['#22784a', '#2563eb', '#d77706']) expect(doc, hex).not.toContain(hex);   // as cores da paleta antiga da folha
    expect('const COR_STATUS = {}').toMatch(/COR_STATUS/);                                      // o detector sabe achar
    expect(doc).toMatch(/function GraficoDoFluxo[\s\S]*?<View wrap=\{false\}/);
    expect(doc).toContain('{m.grafico ? <GraficoDoFluxo g={m.grafico} /> : null}');
    expect(doc.indexOf('<GraficoDoFluxo g={m.grafico}')).toBeLessThan(doc.indexOf('<CabecalhoDaTabela comConta={m.comColunaConta} fixo />'));
    /* a folha e o leitor não fazem conta de série: nenhuma escala, nenhum ponto nasce neles */
    for (const p of ['DocumentoCpr.tsx', 'graficoDoDom.ts']) {
      const fonte = readFileSync(resolve(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(fonte, p).not.toMatch(/montarFluxoPrevisto|serieDoSaldoCpr|recortarCpr|\.reduce\(/);
    }
  });
  it('lido da fonte: a tela monta o MESMO nó do gráfico para a folha, fora da vista, e avisa quando ele não sai', () => {
    const tela = readFileSync(resolve(__dirname, '../../../components/financeiro-v2/ContasPagarReceberTab.tsx'), 'utf8');
    expect(tela.match(/<CprFluxoPrevisto\b/g)?.length).toBe(1);
    expect(tela.match(/\{?graficoDoFluxo\}?/g)?.length).toBeGreaterThanOrEqual(3);          // a definição, a aba Fluxo e a folha
    expect(tela).toContain('const grafico = await esperarGraficoNoDom(() => refGraficoPdf.current);');
    expect(tela).toContain('...identidadeDoArquivo, grafico,');
    expect(tela).toContain('AVISO_PDF_SEM_GRAFICO');
    expect(tela).toMatch(/\{graficoParaPdf && \(\s*<div ref=\{refGraficoPdf\} aria-hidden/);
  });
});

describe('a ponta de transferência chega escrita ao PDF e ao Excel', () => {
  interface Linha extends ContaCpr { descricao: string; data_competencia: string }
  const HOJE = '2026-10-05', P = { de: '2026-10-05', ate: '2026-11-04' };
  const linhas: Linha[] = [
    { id: 't1', data_vencimento: '2026-10-09', data_pagamento: null, status_transacao: 'programado', tipo_operacao: '3-Transferências', valor: 290000, conta_bancaria_id: 'A', conta_destino_id: 'C', descricao: 'Aplicação', data_competencia: '2026-10-09' },
    { id: 'c1', data_vencimento: '2026-10-09', data_pagamento: null, status_transacao: 'agendado', tipo_operacao: '2-Saídas', valor: 40, conta_bancaria_id: 'A', descricao: 'Conta', data_competencia: '2026-10-01' },
  ];
  const recorte = recortarCpr(linhas, { periodo: P, hoje: HOJE, incluirVencidos: true, ancoras: new Map([['A', '2026-09-30']]) });
  const serie = serieDoSaldoCpr(recorte, 300000);
  const fora = new Set(recorte.foraDoCaixa.map(chaveDaLinhaCpr));
  const de: EntradaDoModelo<Linha>['de'] = {
    fornecedor: () => 'F', conta: () => 'Banco', nomeDaConta: (id) => id, subcentro: () => 'S', centro: () => '', macro: () => '', safra: () => '—', faz: () => 'ADM',
    status: (l) => ({ chave: l.status_transacao ?? '', rotulo: l.status_transacao ?? '' }), origem: () => 'Manual', doc: () => '',
    receber: (l) => ehReceberCpr(l), paga: () => false, transferencia: (l) => ehTransferenciaCpr(l), foraDoCaixa: (l) => fora.has(chaveDaLinhaCpr(l)),
  };
  const noDia = [...recorte.periodoSoma.linhas, ...recorte.foraDoCaixa];
  const grupos: GrupoDaTela<Linha>[] = [{ tipo: 'dia', titulo: 'Sexta', quando: '', linhas: noDia, pagar: serie.dias[0].pagar.valor, receber: serie.dias[0].receber.valor, saldo: serie.dias[0].saldo }];
  it('a descrição leva "Transf. · "; a saída cai em A pagar, a entrada em A receber; a ponta fora do caixa vem marcada', () => {
    const folhas = noDia.map((l) => contaDaFolha(l, de));
    expect(folhas.map((c) => [c.descricao, c.pagar !== '', c.receber !== '', c.foraDoCaixa])).toEqual([
      ['Conta', true, false, false],
      ['Transf. · Aplicação', true, false, false],
      ['Transf. · Aplicação', false, true, true],
    ]);
  });
  it('o modelo leva o gráfico como recebeu (ou nulo), e o saldo do fim é o da série com a ponta', () => {
    const base = { clienteNome: 'C', contaNome: 'Todas as contas', todasAsContas: true, periodo: P, segmento: 'ambos' as const, incluirVencidos: true, emitidoEm: 'x',
      serie, grupos, cartoes: { vencidosContamPagar: recorte.cartoes.vencidosContam.pagar, vencidosContamReceber: recorte.cartoes.vencidosContam.receber, pagarNoPeriodo: recorte.cartoes.periodo.pagar, receberNoPeriodo: recorte.cartoes.periodo.receber,
        porStatus: recorte.cartoes.porStatus, transferencias: recorte.cartoes.transferencias, hoje: HOJE, conciliadoAte: '2026-09-30' },
      rodape: { pagar: recorte.total.pagar.valor, receber: recorte.total.receber.valor, contas: recorte.total.ambos.contas }, semanas: [], porConta: null, motivoSemSaldo: '', de };
    expect(montarModeloCpr<Linha>(base).grafico).toBeNull();
    const g = lerGraficoDoDom(montar(SVG));
    const m = montarModeloCpr<Linha>({ ...base, grafico: g });
    expect(m.grafico).toBe(g);
    expect(m.fim.saldo?.texto).toBe('R$ 9.960,00');
    expect(m.numeros.find((x) => x.rotulo === 'A pagar no período')?.valor).toBe('R$ 40,00');   // o cartão segue só com contas
    expect(m.fim.pagar?.texto).toBe('R$ 290.040,00');
  });
  it('o Excel diz o grupo da ponta fora do caixa e traz o mesmo saldo do fim', () => {
    const x = montarPayloadExcelCpr<Linha>({ arquivo: 'a', grupos, serie, de, incluirVencidos: true, hoje: HOJE });
    const contas = x.sheets[0].rows;
    expect(Array.isArray(contas) ? contas.length : 0).toBe(3);
    expect(JSON.stringify(contas)).toContain('transferência · conta fora do caixa (não soma)');
    const dias = x.sheets[1].rows;
    expect(JSON.stringify(dias[dias.length - 1])).toContain('9960');
  });
});
