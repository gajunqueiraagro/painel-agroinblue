/**
 * CPR-AJUSTES-20-10 — Contas a Pagar e Receber como extrato de banco (Gabriel, 20/10/2026; mock "CPR Saldo do Dia"):
 * (1) "A receber" antes de "A pagar"; (2) o saldo do dia na ÚLTIMA linha do dia ("Saldo em dd/mm/aaaa"), a faixa de cima só com a
 * data e o quando; (3) dentro do dia, entradas e depois saídas, cada grupo do maior valor ao menor; (4) todo vencido em aberto conta
 * no saldo de HOJE, com o selo "vencido" e o aviso de quantos não apareceram no extrato já conciliado. Dado sintético.
 * A tela não se monta em teste: o desenho é lido da FONTE; as regras, do dono (`cprRecorte.ts`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ordenarDoDiaCpr, recortarCpr, serieDoSaldoCpr, totaisDeHojeCpr, rodapeDoPeriodoCpr, contagemDoRodapeCpr,
  type ContaCpr, type RealizadoCpr, type RecorteCpr, type SerieDoSaldoCpr,
} from '@/lib/financeiro/cprRecorte';
import { montarModeloCpr, type EntradaDoModelo, type GrupoDaTela } from '@/lib/pdf/cpr/modeloCpr';
import { montarPayloadExcelCpr } from '@/lib/financeiro/cprExcel';
import { formatMoeda } from '@/lib/calculos/formatters';

const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const tela = semComentario(readFileSync(resolve(__dirname, 'ContasPagarReceberTab.tsx'), 'utf8'));
const doc = semComentario(readFileSync(resolve(__dirname, '../../lib/pdf/cpr/DocumentoCpr.tsx'), 'utf8'));
const fluxo = semComentario(readFileSync(resolve(__dirname, 'CprFluxoPrevisto.tsx'), 'utf8'));

let n = 0;
const conta = (venc: string, valor: number, o: Partial<ContaCpr> = {}): ContaCpr => ({
  id: `c${++n}`, data_vencimento: venc, data_pagamento: null, status_transacao: 'programado', tipo_operacao: '2-Saídas', valor,
  conta_bancaria_id: 'IP', ...o,
});
const entra = (venc: string, valor: number) => conta(venc, valor, { tipo_operacao: '1-Entradas', conta_bancaria_id: null, conta_destino_id: 'IP' });

describe('(1) A receber ANTES de A pagar', () => {
  it('no cabeçalho, nas linhas, nas faixas (dia, Caixa inicial, Fim do período) e nos cartões', () => {
    const cab = tela.slice(tela.indexOf('data-testid="cpr-cabecalho"'), tela.indexOf('{iCaixaInicial === -1 && linhaDoCaixaInicial}'));
    expect(cab.indexOf('>A receber<')).toBeGreaterThan(0);
    expect(cab.indexOf('>A receber<')).toBeLessThan(cab.indexOf('>A pagar<'));
    /* a linha da conta */
    expect(tela).toMatch(/<span style=\{larg\(regua\.receber\)\} className="text-right">\{receber \? celValor : null\}<\/span>\n\s+<span style=\{larg\(regua\.pagar\)\} className="text-right">\{receber \? null : celValor\}<\/span>/);
    /* a faixa (o mesmo componente desenha o Caixa inicial, o "Saldo em", os vencidos e o Fim do período) */
    const faixa = tela.slice(tela.indexOf('function Faixa('), tela.indexOf('function CelValor(') > tela.indexOf('function Faixa(') ? tela.indexOf('function CelValor(') : undefined);
    expect(faixa.indexOf("tipo=\"receber\"")).toBeGreaterThan(0);
    expect(faixa.indexOf("tipo=\"receber\"")).toBeLessThan(faixa.indexOf("tipo=\"pagar\""));
    /* os cartões e a faixa recolhida do Ampliado */
    expect(tela.indexOf('testId="cpr-card-receber"')).toBeLessThan(tela.indexOf('testId="cpr-card-pagar"'));
    expect(tela.indexOf('<CelRecolhida rotulo="A receber"')).toBeLessThan(tela.indexOf('<CelRecolhida rotulo="A pagar"'));
  });
  it('no PDF: cabeçalho, linha, faixa, "Saldo em", Fim do período e os dois resumos', () => {
    const cab = doc.slice(doc.indexOf('function CabecalhoDaTabela('), doc.indexOf('function LinhaDaConta('));
    expect(cab.indexOf('>A receber<')).toBeLessThan(cab.indexOf('>A pagar<'));
    for (const trecho of ['function LinhaDaConta(', 'function LinhaDaFaixa(', 'function LinhaDoFecho(', 'function LinhaResumo(']) {
      const ini = doc.indexOf(trecho);
      const corpo = doc.slice(ini, doc.indexOf('\nfunction ', ini + 10));
      expect(corpo.indexOf('receber'), trecho).toBeGreaterThan(0);
      expect(corpo.lastIndexOf('largura={W.receber}') < 0 || corpo.indexOf('W.receber') < corpo.indexOf('W.pagar'), trecho).toBe(true);
    }
    expect(doc.indexOf('c={m.fim.receber}')).toBeLessThan(doc.indexOf('c={m.fim.pagar}'));
    expect(doc).toContain("colunas={['A receber', 'A pagar', 'Saldo no fim da semana']}");
    expect(doc).toContain("colunas={['Caixa hoje', 'A receber', 'A pagar', 'Saldo no fim']}");
  });
});

describe('(2) o saldo do dia na ÚLTIMA linha do dia', () => {
  it('a faixa de cima do dia só tem a data e o quando — nenhum valor', () => {
    const fd = tela.slice(tela.indexOf('function FaixaDoDia('), tela.indexOf('function Faixa('));
    expect(fd).not.toMatch(/pagar|receber|saldo|CelValor/);
    expect(tela).toContain("g.tipo === 'dia' ? (");
    /* a data completa e o dia da semana por extenso */
    expect(tela).toContain('"EEEE · dd/MM/yyyy"');
  });
  it('depois das linhas do dia vem "Saldo em dd/mm/aaaa", com a receber, a pagar e o saldo do grupo, fundo azul claro e negrito', () => {
    const ini = tela.indexOf('{g.linhas.map((l) => {');
    const fecho = tela.slice(tela.indexOf("{g.tipo === 'dia' && (", ini));
    expect(tela.indexOf("{g.tipo === 'dia' && (", ini)).toBeGreaterThan(ini);
    expect(fecho).toContain("titulo={`Saldo em ${format(parseISO(g.chave), 'dd/MM/yyyy')}`}");
    expect(fecho).toContain('pagar={g.pagar} receber={g.receber} saldo={g.saldo}');
    expect(fecho).toContain('font-bold text-primary');
    expect(fecho).toContain('FUNDO_DIA');
    expect(fecho).toContain('fundoNegativo');
  });
  it('o "Saldo em" de cada dia é o saldo CORRIDO da série: anterior + a receber − a pagar', () => {
    const hoje = '2026-10-20';
    const r = recortarCpr([conta('2026-10-21', 1896.83), entra('2026-11-05', 21000), conta('2026-11-05', 8119)],
      { periodo: { de: '2026-10-01', ate: '2026-11-30' }, hoje, ancoras: new Map([['IP', '2026-10-09']]) });
    const s = serieDoSaldoCpr(r, 10000);
    expect(s.dias.map((d) => [d.data, d.saldo])).toEqual([['2026-10-21', 8103.17], ['2026-11-05', 20984.17]]);
    expect(s.dias[1].saldo).toBe(Math.round((8103.17 + 21000 - 8119) * 100) / 100);
  });
});

describe('(3) dentro do dia: entradas, depois saídas, cada grupo do maior valor ao menor', () => {
  it('05/11: a entrada de 21.000 primeiro; depois as saídas, 12.000 antes de 8.119', () => {
    const iatf = conta('2026-11-05', 8119.4, { descricao: 'Protocolo IATF' } as Partial<ContaCpr>);
    const gf = conta('2026-11-05', 12000);
    const pontero = entra('2026-11-05', 21000);
    const peq = entra('2026-11-05', 50);
    expect(ordenarDoDiaCpr([iatf, peq, gf, pontero]).map((l) => l.valor)).toEqual([21000, 50, 12000, 8119.4]);
  });
  it('empate de valor: a ordem é estável (pela chave da linha), qualquer que seja a entrada', () => {
    const a = conta('2026-11-05', 100, { id: 'a' }), b = conta('2026-11-05', 100, { id: 'b' });
    expect(ordenarDoDiaCpr([b, a]).map((l) => l.id)).toEqual(ordenarDoDiaCpr([a, b]).map((l) => l.id));
  });
  it('a tela ordena todo dia (hoje inclusive) pelo dono', () => {
    expect(Array.from(tela.matchAll(/ordenarDoDiaCpr\(/g)).length).toBeGreaterThanOrEqual(3);
  });
});

describe('(4) o vencido conta no saldo de HOJE, com o selo e o aviso', () => {
  it('Vera · Itaú Personalite: conciliado até 09/10, a Transf. Aplicação CDB de 290.000 vencida em 09/10 entra hoje', () => {
    const hoje = '2026-10-20';
    const cdb = conta('2026-10-09', 290000, { tipo_operacao: '3-Transferências', conta_bancaria_id: 'IP', conta_destino_id: 'CDB' });
    const fgts = conta('2026-10-21', 1896.83, { status_transacao: 'agendado' });
    const r = recortarCpr([cdb, fgts], { periodo: { de: '2026-10-01', ate: '2026-11-30' }, hoje, conta: 'IP', ancoras: new Map([['IP', '2026-10-09']]) });
    expect(r.vencidos.anteriores.linhas.map((l) => l.id)).toEqual([cdb.id]);
    const s = serieDoSaldoCpr(r, 293896.08);
    const th = totaisDeHojeCpr(s);
    expect(th.pagar).toEqual({ valor: 290000, contas: 1 });
    expect(s.partida.saldo).toBe(3896.08);
    expect(s.dias.find((d) => d.data === '2026-10-21')?.saldo).toBe(1999.25);
  });
  it('a tela: hoje é um dia com os vencidos dentro, o selo "vencido" na linha e o aviso na faixa; o grupo "fora do saldo" não existe', () => {
    expect(tela).toContain('data-testid="cpr-selo-vencido"');
    expect(tela).toContain('data-testid="cpr-aviso-hoje"');
    expect(tela).toContain("entra' : 'entram'} hoje · confirme se ainda vai acontecer");
    expect(tela).toContain('const th = totaisDeHojeCpr(serie);');
    expect(tela).not.toMatch(/anteriores à conciliação[^`]*fora do saldo/);
    expect(tela).not.toContain('MOTIVO_ANTERIORES');
    expect(tela).not.toContain("tipo: 'vencidos_anteriores'");
    /* a tela não soma o dia de hoje: lê do dono */
    const grupos = tela.slice(tela.indexOf('const grupos = useMemo((): Grupo[] => {'), tela.indexOf('// ── Abrir o lançamento'));
    expect(grupos).not.toMatch(/Math\.round\(/);
    /* o Fluxo não diz mais "anterior à conciliação, fora do saldo" */
    expect(fluxo).not.toContain('vencidosForaDoSaldo');
  });
  it('CPR-AJUSTES-20-10b: o vencido que entra no saldo aparece SEMPRE no dia de hoje — a caixa não o esconde', () => {
    expect(tela).toContain('const listados = ordenarDoDiaCpr([...doSeg(vencidos.linhas), ...(mapa.get(chave) ?? [])]);');
    expect(tela).not.toContain('fora da lista');
  });
});

describe('CPR-SEM-CORTE-01 — nada de "…" na CPR (P152: só nas 3 células declaradas)', () => {
  it('nenhum truncate, text-ellipsis ou line-clamp na tela nem no Fluxo — fora as 3 células do P152, com o title e a exceção do gate', () => {
    /* P152 (D6, Gabriel 28/10 16:04): Descrição, Fornecedor e Subcentro terminam em "…" com o texto inteiro no `title` e
       `data-reticencias-com-title`; nenhum outro lugar */
    const truncados = tela.split('\n').filter((l) => /\btruncate\b/.test(l) && !l.trim().startsWith('/*') && !l.trim().startsWith('*'));
    expect(truncados).toHaveLength(3);
    for (const l of truncados) expect(l).toMatch(/title=\{[^}]+\} data-reticencias-com-title="">/);
    expect(tela).not.toMatch(/text-ellipsis|line-clamp/);
    expect(fluxo).not.toMatch(/\btruncate\b|text-ellipsis|line-clamp/);
  });
});

/* ─── CPR-AJUSTES-20-10b — período que não inclui hoje, e vencido que entra no saldo aparece sempre ─────────────────────── */
describe('CPR-AJUSTES-20-10b — período futuro', () => {
  const hoje = '2026-10-20';
  const NOV = { de: '2026-11-01', ate: '2026-11-30' };
  /* o caso da Vera (sintético): os 3 vencidos em aberto de R$ 160,83, nada entre 21/10 e 31/10, contas em novembro; e uma conta PAGA
     hoje (com a pílula Realizado ligada a busca a traz) — ela não pode abrir um dia "hoje" num período de novembro */
  const linhas = [
    conta('2025-12-15', 38.63, { status_transacao: 'previsto' }), conta('2026-09-15', 112.82, { status_transacao: 'previsto' }),
    conta('2026-10-15', 9.38, { status_transacao: 'previsto' }),
    conta('2026-11-05', 21000, { status_transacao: 'agendado' }), entra('2026-11-12', 212449.03),
    conta(hoje, 500, { status_transacao: 'realizado', data_pagamento: hoje }),
  ];
  const rec = () => recortarCpr(linhas, { periodo: NOV, hoje, ancoras: new Map([['IP', '2026-10-09']]) });
  it('o Caixa inicial da véspera = caixa de hoje − os vencidos em aberto + o que vence de amanhã até a véspera', () => {
    const s = serieDoSaldoCpr(rec(), 1450296.76);
    expect(s.inicial).toEqual({ data: '2026-10-31', saldo: 1450135.93 });
    expect(s.partida.pagar).toEqual({ valor: 160.83, contas: 3 });
    expect(s.dias.map((d) => d.data)).toEqual(['2026-11-05', '2026-11-12']);
    expect(s.fim).toBe(Math.round((1450135.93 - 21000 + 212449.03) * 100) / 100);
  });
  it('nada de hoje entra na lista: a paga de hoje fica fora das pagas do período', () => {
    const r = rec();
    expect(r.pagas.map((l) => l.data_vencimento)).toEqual([hoje]);
    expect(r.pagasNoPeriodo).toEqual([]);
    expect(tela).toContain('...recorte.pagasNoPeriodo,');
    expect(tela).not.toMatch(/\.\.\.recorte\.pagas,/);
  });
  it('os vencidos aparecem SEMPRE e NÃO entram no rodapé: já estão dentro do Caixa inicial', () => {
    const r = rec();
    expect(r.vencidosNaLista).toBe(true);
    expect(r.vencidosNoRodape).toBe(false);
    expect(r.vencidos.pagar).toEqual({ valor: 160.83, contas: 3 });
    expect(r.total.pagar).toEqual({ valor: 21000, contas: 1 });
    expect(r.saemHoje.linhas).toEqual([]);
  });
  it('a tela: o bloco "Vencidos em aberto · entram no saldo" vem ANTES da linha do Caixa inicial', () => {
    expect(tela).toContain("titulo: `Vencidos em aberto · ${contas(nVencidos)} · entram no saldo`,");
    expect(tela).toContain("chave: 'vencidos', tipo: 'vencidos', quando: '', antesDoCaixaInicial: true,");
    /* "entre hoje e de" também já está dentro do Caixa inicial previsto: vem antes dele; e o bloco prende a 22px (em 42 cobria a linha) */
    expect(tela).toContain("chave: 'entre', tipo: 'entre', quando: '', linhas: [], antesDoCaixaInicial: true,");
    expect(tela).toContain("g.antesDoCaixaInicial ? 'top-[22px]' : 'top-[42px]'");
    expect(tela).toContain('const iCaixaInicial = gruposAntesDoFim.findIndex((g) => !g.antesDoCaixaInicial);');
    expect(tela).toContain('{i === iCaixaInicial && linhaDoCaixaInicial}');
    expect(tela).toContain('if (futuro && nVencidos > 0) topo.push({');
  });
  it('o PDF e o Excel põem o bloco antes do Caixa inicial, como a tela', () => {
    const modelo = semComentario(readFileSync(resolve(__dirname, '../../lib/pdf/cpr/modeloCpr.ts'), 'utf8'));
    const excel = semComentario(readFileSync(resolve(__dirname, '../../lib/financeiro/cprExcel.ts'), 'utf8'));
    expect(modelo).toContain('if (nAntes > 0) faixas.splice(nAntes, 0, ...faixas.splice(0, 1));');
    expect(excel.indexOf('e.grupos.filter((g) => g.antesDoCaixaInicial && !g.depoisDoFim)')).toBeLessThan(excel.indexOf('`Caixa inicial'));
  });
});

describe('CPR-AJUSTES-20-10b — período que inclui hoje', () => {
  it('o vencido entra no dia de hoje e no total; no período encerrado ele não entra no total', () => {
    const hoje = '2026-10-20';
    const ls = [conta('2026-10-15', 9.38), conta('2026-10-25', 100)];
    const r = (periodo: { de: string; ate: string }) => recortarCpr(ls, { periodo, hoje });
    expect(r({ de: '2026-10-01', ate: '2026-10-31' }).total.pagar).toEqual({ valor: 109.38, contas: 2 });
    expect(r({ de: '2026-10-01', ate: '2026-10-31' }).vencidosNaLista).toBe(true);
    expect(r({ de: '2026-09-01', ate: '2026-09-30' }).vencidosNaLista).toBe(false);
    expect(r({ de: '2026-09-01', ate: '2026-09-30' }).total.pagar).toEqual({ valor: 0, contas: 0 });
  });
});

/* ───────────────────────────── CPR-AJUSTES-20-10b — correção do rodapé ───────────────────────────── */
/* INVARIANTE, em tela (o dono), PDF (o modelo) e Excel (a aba "Saldo por dia"): Caixa inicial + A receber do rodapé − A pagar do
   rodapé = Saldo no fim, centavo a centavo. Os grupos são montados COMO A TELA os monta (vencidos antes do Caixa inicial no futuro;
   dias realizados, hoje e os dias seguintes no período com hoje). */
type L = ContaCpr & { descricao: string; data_competencia: string };
const cent = (v: number) => Math.round(v * 100);
const comDesc = (l: ContaCpr): L => ({ ...l, descricao: `Conta ${l.id}`, data_competencia: l.data_vencimento ?? '' });
const deFolha: EntradaDoModelo<L>['de'] = {
  fornecedor: () => 'F', conta: () => 'C', nomeDaConta: (id) => id, subcentro: () => 'S', centro: () => 'C', macro: () => 'M', safra: () => '—',
  faz: () => 'X', status: (l) => ({ chave: l.status_transacao ?? '', rotulo: l.status_transacao ?? '' }), origem: () => '', doc: () => '',
  receber: (l) => (l.tipo_operacao ?? '').startsWith('1-') || l.ponta === 'entrada', paga: () => false,
  transferencia: (l) => (l.tipo_operacao ?? '').startsWith('3-'),
};
/* os grupos que a tela desenha, na ordem dela — a mesma montagem do memo `grupos` de ContasPagarReceberTab */
function gruposComoATela(r: RecorteCpr<L>, s: SerieDoSaldoCpr): GrupoDaTela<L>[] {
  const hoje = r.hoje;
  const futuro = r.periodo.de > hoje;
  const gs: GrupoDaTela<L>[] = [];
  if (futuro && r.vencidosNaLista && r.vencidos.linhas.length > 0) {
    gs.push({ tipo: 'vencidos', chave: 'vencidos', titulo: 'Vencidos em aberto · entram no saldo', quando: '', antesDoCaixaInicial: true,
      linhas: r.vencidos.linhas, pagar: r.vencidos.pagar.valor, receber: r.vencidos.receber.valor, saldo: null });
  }
  if (s.entreHojeEDe) gs.push({ tipo: 'entre', chave: 'entre', titulo: 'Entre hoje e a véspera', quando: '', antesDoCaixaInicial: true, linhas: [],
    pagar: s.entreHojeEDe.pagar.valor, receber: s.entreHojeEDe.receber.valor, saldo: null });
  for (const d of s.realizados) gs.push({ tipo: 'dia', chave: d.data, titulo: d.data, quando: 'realizado', passado: true, linhas: [],
    pagar: d.pagar.valor, receber: d.receber.valor, saldo: d.saldo });
  const hojeNoPeriodo = r.periodo.de <= hoje && hoje <= r.periodo.ate;
  if (hojeNoPeriodo) {
    const t = totaisDeHojeCpr(s);
    const dHoje = s.dias.find((d) => d.data === hoje);
    gs.push({ tipo: 'dia', chave: hoje, titulo: hoje, quando: 'hoje', hoje: true, linhas: r.vencidos.linhas,
      pagar: t.pagar.valor, receber: t.receber.valor, saldo: dHoje ? dHoje.saldo : s.partida.saldo });
  }
  for (const d of s.dias) {
    if (d.data === hoje) continue;
    gs.push({ tipo: 'dia', chave: d.data, titulo: d.data, quando: '', linhas: r.periodoSoma.linhas.filter((l) => l.data_vencimento === d.data),
      pagar: d.pagar.valor, receber: d.receber.valor, saldo: d.saldo });
  }
  /* CPR-AJUSTES-20-10c — período encerrado: o grupo "Saem hoje", DEPOIS do Fim do período */
  const sh = r.saemHoje;
  if (sh.linhas.length > 0) gs.push({ tipo: 'saem_hoje', chave: 'saem-hoje', titulo: 'Saem hoje · fora do saldo do período', quando: '', depoisDoFim: true,
    frase: 'Ainda não aconteceram; entram no saldo de hoje.', linhas: sh.linhas, pagar: sh.pagar.valor, receber: sh.receber.valor, saldo: undefined });
  return gs;
}
function asTres(r: RecorteCpr<L>, s: SerieDoSaldoCpr) {
  const f = rodapeDoPeriodoCpr(r, s);
  const rodape = { pagar: f.pagar.valor, receber: f.receber.valor, contas: f.contas, realizados: f.realizados, realizado: f.encerrado };
  const grupos = gruposComoATela(r, s);
  const z = { valor: 0, contas: 0 };
  const m = montarModeloCpr<L>({
    clienteNome: 'Vera', contaNome: 'Todas', todasAsContas: true, periodo: r.periodo, segmento: 'ambos',
    emitidoEm: '20/10/2026 10:00', serie: s, grupos,
    cartoes: { vencidosContamPagar: z, vencidosContamReceber: z, pagarNoPeriodo: z, receberNoPeriodo: z, porStatus: { pagar: {}, receber: {} },
      transferencias: { pagar: z, receber: z }, hoje: r.hoje, conciliadoAte: null },
    rodape, semanas: [], porConta: null, motivoSemSaldo: '', de: deFolha,
  });
  const x = montarPayloadExcelCpr<L>({ arquivo: 'cpr', grupos, serie: s, de: deFolha, hoje: r.hoje,
    inicio: r.periodo.de, fim: r.periodo.ate, rodape });
  return { f, m, rows: x.sheets[1].rows as (string | number | null)[][] };
}
function confereOInvariante(r: RecorteCpr<L>, s: SerieDoSaldoCpr) {
  const { f, m, rows } = asTres(r, s);
  if (!s.inicial || s.fim == null) throw new Error('o caso precisa de Caixa inicial e saldo no fim');
  /* TELA (o dono) */
  expect(cent(s.inicial.saldo) + cent(f.receber.valor) - cent(f.pagar.valor)).toBe(cent(s.fim));
  /* PDF: a faixa do Caixa inicial e o "Fim do período" escrevem os números do dono */
  const caixa = m.faixas.find((x) => x.tipo === 'saldo_hoje')!;
  expect(caixa.saldo?.texto).toBe(formatMoeda(s.inicial.saldo));
  expect(m.fim.receber?.texto).toBe(formatMoeda(f.receber.valor));
  expect(m.fim.pagar?.texto).toBe(formatMoeda(f.pagar.valor));
  expect(m.fim.saldo?.texto).toBe(formatMoeda(s.fim));
  /* EXCEL: a linha "Fim do período" fecha a aba; e as linhas DEPOIS do Caixa inicial somam exatamente o rodapé */
  const iCaixa = rows.findIndex((x) => String(x[0]).startsWith('Caixa inicial'));
  const iFim = rows.findIndex((x) => String(x[0]).startsWith('Fim do período'));
  const fimRow = rows[iFim];
  expect(String(fimRow[0])).toBe(`Fim do período · ${r.periodo.ate.slice(8, 10)}/${r.periodo.ate.slice(5, 7)}/${r.periodo.ate.slice(0, 4)}`);
  const [, rec, pag, saldo] = fimRow as [string, number, number, number];
  expect(cent(Number(rows[iCaixa][3])) + cent(rec) - cent(pag)).toBe(cent(saldo));
  const depois = rows.slice(iCaixa + 1, iFim);
  expect(depois.reduce((t, x) => t + cent(Number(x[1] ?? 0)), 0)).toBe(cent(rec));
  expect(depois.reduce((t, x) => t + cent(Number(x[2] ?? 0)), 0)).toBe(cent(pag));
  return f;
}

describe('CPR-AJUSTES-20-10b — o rodapé soma só o que está DEPOIS do Caixa inicial (invariante em tela, PDF e Excel)', () => {
  const hoje = '2026-10-20';
  it('período FUTURO (Vera, Global, nov/26): os vencidos ficam fora do rodapé; Caixa inicial + a receber − a pagar = saldo no fim', () => {
    /* o caso da Vera em sintético: 3 vencidos (160,83), saídas de novembro (186.395,93 numa conta só aqui), uma transferência entre
       duas contas do caixa (20.024,47: entra nos dois lados do rodapé e não mexe no saldo) e a entrada de 212.449,03 */
    const ls: L[] = [
      conta('2025-12-15', 38.63, { status_transacao: 'previsto' }), conta('2026-09-15', 112.82, { status_transacao: 'previsto' }),
      conta('2026-10-15', 9.38, { status_transacao: 'previsto' }),
      conta('2026-11-05', 186395.93, { status_transacao: 'agendado' }),
      conta('2026-11-20', 20024.47, { tipo_operacao: '3-Transferências', conta_bancaria_id: 'IP', conta_destino_id: 'FZ' }),
      entra('2026-11-12', 212449.03),
    ].map(comDesc);
    {
      const r = recortarCpr(ls, { periodo: { de: '2026-11-01', ate: '2026-11-30' }, hoje,
        ancoras: new Map([['IP', '2026-10-09'], ['FZ', '2026-10-09']]) });
      const s = serieDoSaldoCpr(r, 1450296.76);
      expect(s.inicial).toEqual({ data: '2026-10-31', saldo: 1450135.93 });
      const f = confereOInvariante(r, s);
      /* os números da Vera: A pagar 206.420,40 · A receber 232.473,50 · Saldo no fim 1.476.189,03 */
      expect(f.pagar).toEqual({ valor: 206420.40, contas: 2 });
      expect(f.receber).toEqual({ valor: 232473.50, contas: 2 });
      expect(s.fim).toBe(1476189.03);
      expect(contagemDoRodapeCpr(f)).toBe('4 contas');
    }
  });
  it('período COM HOJE (este mês): os dias realizados, o realizado de hoje, os vencidos e o em aberto — todos depois do Caixa inicial', () => {
    const ls: L[] = [conta('2026-10-15', 9.38), conta('2026-10-25', 100), entra('2026-10-28', 50)].map(comDesc);
    const real: RealizadoCpr = {
      inicial: { data: '2026-09-30', saldo: 1000 },
      dias: [
        { data: '2026-10-05', entradas: 500, saidas: 200, nEntradas: 1, nSaidas: 2, saldo: 1300 },
        { data: '2026-10-20', entradas: 0, saidas: 100, nEntradas: 0, nSaidas: 1, saldo: 1200 },
      ],
    };
    {
      const r = recortarCpr(ls, { periodo: { de: '2026-10-01', ate: '2026-10-31' }, hoje, ancoras: new Map([['IP', '2026-10-09']]) });
      const s = serieDoSaldoCpr(r, 1200, real);
      expect(r.vencidosNoRodape).toBe(true);
      const f = confereOInvariante(r, s);
      expect(f.pagar).toEqual({ valor: 409.38, contas: 5 });
      expect(f.receber).toEqual({ valor: 550, contas: 2 });
      expect(s.fim).toBe(1140.62);
      expect(contagemDoRodapeCpr(f)).toBe('3 contas · 4 lançamentos realizados');
    }
  });
  it('período que COMEÇA HOJE: o realizado de hoje entra no rodapé (o Caixa inicial é o fim de ontem)', () => {
    const ls: L[] = [conta('2026-10-25', 100)].map(comDesc);
    const real: RealizadoCpr = { inicial: { data: '2026-10-19', saldo: 1000 }, dias: [{ data: hoje, entradas: 0, saidas: 40, nEntradas: 0, nSaidas: 1, saldo: 960 }] };
    const r = recortarCpr(ls, { periodo: { de: hoje, ate: '2026-11-18' }, hoje });
    const s = serieDoSaldoCpr(r, 960, real);
    const f = confereOInvariante(r, s);
    expect(f.pagar).toEqual({ valor: 140, contas: 2 });
    expect(s.fim).toBe(860);
  });
  it('a tela, o PDF e o Excel leem o rodapé do MESMO dono', () => {
    expect(tela).toContain('const fimDoPeriodo = rodapeDoPeriodoCpr(recorte, serie);');
    expect(tela).toContain('${contagemDoRodapeCpr(fimDoPeriodo)}');
    expect(tela).toContain('fim: periodo.ate, rodape,');
    expect(tela).not.toContain('recorte.total.pagar.valor, receber: recorte.total.receber.valor');
  });
});

/* ───────────── CPR-AJUSTES-20-10c — a caixa dos vencidos saiu; o período ENCERRADO mostra os do período DEPOIS do Fim ───────────── */
describe('CPR-AJUSTES-20-10c — período encerrado: "Saem hoje · fora do saldo do período", depois do Fim do período', () => {
  const hoje = '2026-10-20';
  const SET = { de: '2026-09-01', ate: '2026-09-30' };
  /* o caso da Vera em sintético (set/26): um vencido de antes do período (dez/25), um a pagar e um a receber DO período, um de
     depois dele (out/26); o realizado de setembro vem do dono do caixa */
  const antigo = conta('2025-12-15', 38.63, { status_transacao: 'previsto' });
  const doPeriodoPagar = conta('2026-09-15', 112.82, { status_transacao: 'previsto' });
  const doPeriodoReceber = entra('2026-09-20', 500);
  const deOutubro = conta('2026-10-15', 9.38, { status_transacao: 'previsto' });
  const ls: L[] = [antigo, doPeriodoPagar, doPeriodoReceber, deOutubro].map(comDesc);
  const real: RealizadoCpr = { inicial: { data: '2026-08-31', saldo: 1000 },
    dias: [{ data: '2026-09-10', entradas: 300, saidas: 100, nEntradas: 1, nSaidas: 1, saldo: 1200 }] };
  const r = recortarCpr(ls, { periodo: SET, hoje, ancoras: new Map([['IP', '2026-10-09']]) });
  const s = serieDoSaldoCpr(r, 5000, real);

  it('o dono: só os vencidos em aberto com vencimento DENTRO do período, com o subtotal dos dois lados', () => {
    expect(r.saemHoje.linhas.map((l) => l.data_vencimento)).toEqual(['2026-09-15', '2026-09-20']);
    expect(r.saemHoje.pagar).toEqual({ valor: 112.82, contas: 1 });
    expect(r.saemHoje.receber).toEqual({ valor: 500, contas: 1 });
    /* o de antes do período não é dele; o cartão segue com todos */
    expect(r.saemHoje.linhas.some((l) => l.data_vencimento === '2025-12-15')).toBe(false);
    expect(r.vencidos.linhas.length).toBe(4);
  });
  it('INVARIANTE (tela = PDF = Excel): Caixa inicial + A receber − A pagar = Saldo no fim; o grupo não entra no rodapé', () => {
    const f = confereOInvariante(r, s);
    expect(f.encerrado).toBe(true);
    expect([f.pagar.valor, f.receber.valor, s.fim]).toEqual([100, 300, 1200]);
    /* o rodapé é o MESMO com ou sem o grupo */
    const semOGrupo = { ...r, saemHoje: { pagar: { valor: 0, contas: 0 }, receber: { valor: 0, contas: 0 }, linhas: [] } };
    expect(rodapeDoPeriodoCpr(semOGrupo, s)).toEqual(f);
    /* sem saldo conferido, o encerrado também não soma o grupo */
    const semCaixa = rodapeDoPeriodoCpr(r, serieDoSaldoCpr(r, null));
    expect([semCaixa.pagar.valor, semCaixa.receber.valor]).toEqual([0, 0]);
  });
  it('o PDF: o bloco "Saem hoje" com a frase, as linhas e o subtotal, depois do Fim do período', () => {
    const { m } = asTres(r, s);
    expect(m.saemHoje?.titulo).toBe('Saem hoje · fora do saldo do período');
    expect(m.saemHoje?.frase).toBe('Ainda não aconteceram; entram no saldo de hoje.');
    expect(m.saemHoje?.contas.map((c) => c.venc)).toEqual(['15/09/26', '20/09/26']);
    expect([m.saemHoje?.receber, m.saemHoje?.pagar]).toEqual([formatMoeda(500), formatMoeda(112.82)]);
    expect(m.faixas.flatMap((x) => x.contas).length).toBe(0);
    expect(doc.indexOf('{m.saemHoje ? <BlocoSimples')).toBeGreaterThan(doc.indexOf('{m.fim.titulo}'));
  });
  it('o Excel: linhas PRÓPRIAS depois da linha "Fim do período", fora da soma dela', () => {
    const { rows } = asTres(r, s);
    const iFim = rows.findIndex((x) => String(x[0]).startsWith('Fim do período'));
    expect(rows.slice(iFim + 1)).toEqual([
      ['Saem hoje · fora do saldo do período', 500, 112.82, null],
      ['Ainda não aconteceram; entram no saldo de hoje.', null, null, null],
      ['vencido em 15/09/2026 · Conta ' + doPeriodoPagar.id, null, 112.82, null],
      ['vencido em 20/09/2026 · Conta ' + doPeriodoReceber.id, 500, null, null],
    ]);
  });
  it('período COM HOJE e FUTURO: o grupo não existe (o vencido entra no saldo)', () => {
    expect(recortarCpr(ls, { periodo: { de: '2026-10-01', ate: '2026-10-31' }, hoje }).saemHoje.linhas).toEqual([]);
    expect(recortarCpr(ls, { periodo: { de: '2026-11-01', ate: '2026-11-30' }, hoje }).saemHoje.linhas).toEqual([]);
  });
  it('a tela: o grupo vem DEPOIS da linha "Fim do período", com o título, a frase e o selo vencido; sem caixa nenhuma', () => {
    expect(tela).toContain('if (serie.encerrado) return [...dias, ...fim, ...depois];');
    expect(tela).toContain("titulo: 'Saem hoje · fora do saldo do período', frase: 'Ainda não aconteceram; entram no saldo de hoje.',");
    expect(tela).toContain('const sh = recorte.saemHoje;');
    expect(tela.indexOf('{gruposDepoisDoFim.map((g) => desenharGrupo(g))}')).toBeGreaterThan(tela.indexOf('testId="cpr-total"'));
    expect(tela).toContain('data-testid="cpr-frase-do-grupo"');
    expect(tela).not.toContain('Checkbox');
  });
  it('nenhum "Incluir vencidos" no código (a caixa, o estado e o campo saíram)', () => {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const raiz = resolve(__dirname, '../..');
    const achados: string[] = [];
    const andar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = resolve(dir, nome);
        if (statSync(p).isDirectory()) { andar(p); continue; }
        if (!/\.(ts|tsx)$/.test(nome) || /\.test\.tsx?$/.test(nome)) continue;
        if (/Incluir vencidos|incluirVencidos|cpr-incluir-vencidos/.test(readFileSync(p, 'utf8'))) achados.push(p);
      }
    };
    andar(raiz);
    expect(achados).toEqual([]);
  });
});
