/**
 * CADERNO-CAMPO-01 peça 1 (Gabriel 04/11, mock v3 aprovado): o "Exportar mês" — as folhas do caderno de campo PREENCHIDAS com o que está no
 * sistema, do começo do ano até o mês escolhido. PURO: recebe o que os leitores oficiais já leem (sem segunda fonte) e devolve as folhas.
 *   - Conciliação: o rebanho mensal do Fechamento (`useZootCategoriaMensal`, a mesma conta do Fechamento do mês); "Saldo no mapa" = o
 *     fechamento de pastos do mês (`saldo_p1`).
 *   - Entradas, Saídas, Nascimentos, Mortes/Consumo, Desmamas, Engorda/reclassificação: os lançamentos do ano (`useLancamentos`).
 *   - Mapa do Rebanho: o mapa do mês (`useMapaDoMes`), uma linha por pasto e lote (D4).
 *   - Chuva: `useChuvas` (dia × mês, total, acumulado e o histórico dos anos anteriores).
 * Regra de exibição (Gabriel 09:51): zero = célula VAZIA; dado que o sistema não tem = "—" (`TRACO`). A causa da morte é lida de onde está
 * hoje (D2): `motivo`, e sem ele o campo de destino (o lançamento antigo guardava a causa ali).
 */
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import type { Lancamento } from '@/types/cattle';
import type { Chuva } from '@/hooks/useChuvas';
import type { CategoriaRebanho, Pasto } from '@/hooks/usePastos';
import type { DadosDoPastoNoMes } from '@/lib/mapa/mapaDoMes';
import { areaNoMesOuNada, type AreaDoPastoNoMes } from '@/lib/pastos/areaDoPastoNoMes';

export const TRACO = '—';
export const MESES_CURTOS: readonly string[] = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** As 9 categorias do sistema na ordem do caderno (D3): machos, depois fêmeas. */
export interface CategoriaDoCaderno { codigo: string; rotulo: string; sexo: 'M' | 'F' }
export const CATEGORIAS_DO_CADERNO: readonly CategoriaDoCaderno[] = [
  { codigo: 'mamotes_m', rotulo: 'Mamote M', sexo: 'M' },
  { codigo: 'desmama_m', rotulo: 'Desmama M', sexo: 'M' },
  { codigo: 'garrotes', rotulo: 'Garrote', sexo: 'M' },
  { codigo: 'bois', rotulo: 'Boi', sexo: 'M' },
  { codigo: 'touros', rotulo: 'Touro', sexo: 'M' },
  { codigo: 'mamotes_f', rotulo: 'Mamote F', sexo: 'F' },
  { codigo: 'desmama_f', rotulo: 'Desmama F', sexo: 'F' },
  { codigo: 'novilhas', rotulo: 'Novilha', sexo: 'F' },
  { codigo: 'vacas', rotulo: 'Vaca', sexo: 'F' },
];

const ROTULO_DA_CATEGORIA = new Map<string, string>(CATEGORIAS_DO_CADERNO.map((c) => [c.codigo, c.rotulo]));
export const rotuloDaCategoria = (codigo: string | null | undefined): string => (codigo ? ROTULO_DA_CATEGORIA.get(codigo) ?? codigo : TRACO);
export const sexoDaCategoria = (codigo: string | null | undefined): 'M' | 'F' | null =>
  codigo?.endsWith('_m') || codigo === 'garrotes' || codigo === 'bois' || codigo === 'touros' ? 'M'
    : codigo?.endsWith('_f') || codigo === 'novilhas' || codigo === 'vacas' ? 'F' : null;

/* ------------------------------------------------------------------ Conciliação ------------------------------------------------------------------ */

type CampoCab = 'cab_nascimento' | 'cab_compra' | 'cab_transf_entrada' | 'cab_venda' | 'cab_venda_pe' | 'cab_abate' | 'cab_transf_saida'
  | 'cab_consumo' | 'cab_morte';

const ENTRADAS: readonly { rotulo: string; campos: readonly CampoCab[] }[] = [
  { rotulo: 'Nascimentos', campos: ['cab_nascimento'] },
  { rotulo: 'Compras', campos: ['cab_compra'] },
  { rotulo: 'Transf. entradas', campos: ['cab_transf_entrada'] },
];
const SAIDAS: readonly { rotulo: string; campos: readonly CampoCab[] }[] = [
  { rotulo: 'Vendas em pé', campos: ['cab_venda', 'cab_venda_pe'] },
  { rotulo: 'Abates', campos: ['cab_abate'] },
  { rotulo: 'Transf. saídas', campos: ['cab_transf_saida'] },
  { rotulo: 'Consumo', campos: ['cab_consumo'] },
  { rotulo: 'Mortes', campos: ['cab_morte'] },
];

/** Uma linha da conciliação: 12 meses (null = mês fora do recorte ou sem dado) e o total do ano. */
export interface LinhaDaConciliacao { rotulo: string; meses: (number | null)[]; ano: number | null }

export interface Conciliacao {
  saldoInicial: LinhaDaConciliacao;
  entradas: LinhaDaConciliacao[];
  totalEntradas: LinhaDaConciliacao;
  saidas: LinhaDaConciliacao[];
  totalSaidas: LinhaDaConciliacao;
  saldoFinal: LinhaDaConciliacao;
  saldoNoMapa: LinhaDaConciliacao;
  diferenca: LinhaDaConciliacao;
}

const soma = (xs: readonly (number | null | undefined)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

/**
 * `ate` = o mês escolhido (1–12): os meses depois dele ficam vazios. A entrada/saída que a quebra por tipo não explica (o ajuste de
 * inventário, ou linha antiga do cache sem a quebra) vira a linha "Outras entradas/saídas" — nunca some da conta.
 */
export function conciliacaoDoAno(linhas: readonly ZootCategoriaMensal[], ate: number): Conciliacao {
  const doMes = (m: number) => linhas.filter((l) => l.mes === m);
  const noRecorte = (m: number) => m <= ate && doMes(m).length > 0;
  const porMes = (f: (ls: ZootCategoriaMensal[]) => number | null) =>
    Array.from({ length: 12 }, (_, i) => (noRecorte(i + 1) ? f(doMes(i + 1)) : null));
  const anoDe = (meses: (number | null)[]) => (meses.some((v) => v != null) ? soma(meses) : null);
  const linha = (rotulo: string, meses: (number | null)[], ano?: number | null): LinhaDaConciliacao =>
    ({ rotulo, meses, ano: ano === undefined ? anoDe(meses) : ano });

  const bloco = (defs: typeof ENTRADAS, externo: 'entradas_externas' | 'saidas_externas', outras: string) => {
    const ls = defs.map((d) => linha(d.rotulo, porMes((ms) => soma(ms.map((l) => soma(d.campos.map((c) => l[c])))))));
    const total = porMes((ms) => soma(ms.map((l) => l[externo])));
    const resto = total.map((t, i) => (t == null ? null : t - soma(ls.map((l) => l.meses[i]))));
    if (resto.some((r) => r != null && r !== 0)) ls.push(linha(outras, resto));
    return { linhas: ls, total: linha(externo === 'entradas_externas' ? 'Total entradas' : 'Total saídas', total) };
  };
  const ent = bloco(ENTRADAS, 'entradas_externas', 'Outras entradas');
  const sai = bloco(SAIDAS, 'saidas_externas', 'Outras saídas');

  const ini = porMes((ms) => soma(ms.map((l) => l.saldo_inicial)));
  const fim = porMes((ms) => soma(ms.map((l) => l.saldo_sistema ?? l.saldo_final)));
  const mapa = porMes((ms) => (ms.every((l) => l.saldo_p1 == null) ? null : soma(ms.map((l) => l.saldo_p1))));
  const dif = mapa.map((m, i) => (m == null || fim[i] == null ? null : m - (fim[i] ?? 0)));
  const primeiro = ini.findIndex((v) => v != null);
  const ultimo = (xs: (number | null)[]) => { for (let i = xs.length - 1; i >= 0; i--) if (xs[i] != null) return xs[i]; return null; };
  return {
    saldoInicial: linha('Saldo inicial', ini, primeiro >= 0 ? ini[primeiro] : null),
    entradas: ent.linhas, totalEntradas: ent.total,
    saidas: sai.linhas, totalSaidas: sai.total,
    saldoFinal: linha('Saldo final', fim, ultimo(fim)),
    saldoNoMapa: linha('Saldo no mapa', mapa, ultimo(mapa)),
    diferenca: linha('Diferença', dif, ultimo(dif)),
  };
}

/* ------------------------------------------------------------------ Listas do ano ------------------------------------------------------------------ */

export interface LinhaDaLista {
  data: string; // dd/mm/aaaa
  /** o mês da linha (1–12): a folha destaca o mês escolhido */
  mes: number;
  colunas: string[];
}
export interface ListaDoAno { titulo: string; cabecalho: string[]; linhas: LinhaDaLista[]; totalCab: number; totalCabNoMes: number; nota: string | null }

const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const inteiro = (v: number | null | undefined) => (v == null ? TRACO : v === 0 ? '' : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const kg = (v: number | null | undefined) => (v == null || v === 0 ? (v === 0 ? '' : TRACO) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const texto = (v: string | null | undefined) => (v && v.trim() ? v.trim() : '');

/** Só o realizado de fato (o cenário já vem filtrado pelo leitor; previsto/programado/agendado não entram no caderno). */
const realizado = (l: Lancamento) => l.cenario !== 'meta' && (l.statusOperacional == null || l.statusOperacional === 'realizado');

export function lancamentosDoRecorte(ls: readonly Lancamento[], ano: number, ate: number): Lancamento[] {
  return ls
    .filter((l) => realizado(l) && Number(l.data.slice(0, 4)) === ano && Number(l.data.slice(5, 7)) <= ate)
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** A causa da morte onde ela está hoje (D2): o motivo; sem ele, o campo de destino (o legado guardava a causa ali). */
export const causaDaMorte = (l: Lancamento): string => texto(l.motivo) || texto(l.fazendaDestino);

function lista(titulo: string, cabecalho: string[], ls: readonly Lancamento[], colunas: (l: Lancamento) => string[],
  mes: number, nota: string | null): ListaDoAno {
  return {
    titulo, cabecalho, nota,
    linhas: ls.map((l) => ({ data: ddmmaaaa(l.data), mes: Number(l.data.slice(5, 7)), colunas: colunas(l) })),
    totalCab: soma(ls.map((l) => l.quantidade)),
    totalCabNoMes: soma(ls.filter((l) => Number(l.data.slice(5, 7)) === mes).map((l) => l.quantidade)),
  };
}

const QTD = 'Quantidade cab.';
const ehDesmama = (l: Lancamento) => l.tipo === 'reclassificacao' && /^mamotes_/.test(l.categoria) && /^desmama_/.test(l.categoriaDestino ?? '');

export interface ListasDoAno {
  entradas: ListaDoAno; saidas: ListaDoAno; nascimentos: ListaDoAno; mortes: ListaDoAno; desmamas: ListaDoAno; engorda: ListaDoAno;
}

export function listasDoAno(todos: readonly Lancamento[], ano: number, ate: number): ListasDoAno {
  const ls = lancamentosDoRecorte(todos, ano, ate);
  const de = (...tipos: string[]) => ls.filter((l) => tipos.includes(l.tipo));
  const origem = (l: Lancamento) => (l.tipo === 'compra' ? texto(l.fornecedorNomeSnapshot) || texto(l.compradorFornecedor) || texto(l.fazendaOrigem)
    : texto(l.fazendaOrigem));
  const destino = (l: Lancamento) => (l.tipo === 'abate' ? texto(l.frigorifico) || texto(l.abateFrigorifico) || texto(l.fazendaDestino)
    : l.tipo === 'transferencia_saida' ? texto(l.fazendaDestino)
      : texto(l.fornecedorNomeSnapshot) || texto(l.compradorFornecedor) || texto(l.fazendaDestino));
  const operacao: Record<string, string> = {
    compra: 'Compra', transferencia_entrada: 'Transferência', abate: 'Abate', venda: 'Venda em pé', transferencia_saida: 'Transferência',
    morte: 'Morte', consumo: 'Consumo',
  };
  return {
    entradas: lista('Entradas', ['Data', 'Operação', QTD, 'Categoria', 'Peso kg', 'Origem', 'Obs.'], de('compra', 'transferencia_entrada'),
      (l) => [operacao[l.tipo], inteiro(l.quantidade), rotuloDaCategoria(l.categoria), kg(l.pesoMedioKg), origem(l), texto(l.observacao)], ate, null),
    saidas: lista('Saídas', ['Data', 'Operação', QTD, 'Categoria', 'Peso kg', 'Destino', 'Obs.'], de('abate', 'venda', 'transferencia_saida'),
      (l) => [operacao[l.tipo], inteiro(l.quantidade), rotuloDaCategoria(l.categoria), kg(l.pesoMedioKg), destino(l), texto(l.observacao)], ate, null),
    nascimentos: lista('Nascimentos', ['Data', QTD, 'Sexo', 'Raça', 'Lote', 'Pasto', 'Brincos / obs.'], de('nascimento'),
      (l) => [inteiro(l.quantidade), sexoDaCategoria(l.categoria) ?? TRACO, TRACO, TRACO, TRACO, texto(l.observacao)], ate,
      'Raça, lote e pasto: o sistema ainda não guarda ("—").'),
    mortes: lista('Mortes, consumo e doação', ['Data', 'Evento', QTD, 'Categoria', 'Peso kg', 'Identificação', 'Pasto', 'Causa'],
      de('morte', 'consumo'),
      (l) => [operacao[l.tipo], inteiro(l.quantidade), rotuloDaCategoria(l.categoria), kg(l.pesoMedioKg), texto(l.numeroId), TRACO,
        l.tipo === 'morte' ? causaDaMorte(l) : ''], ate, 'Pasto: o sistema ainda não guarda ("—").'),
    desmamas: lista('Desmamas', ['Data', QTD, 'Sexo', 'Peso kg', 'Raça', 'Lote', 'Safra'], ls.filter(ehDesmama),
      (l) => [inteiro(l.quantidade), sexoDaCategoria(l.categoria) ?? TRACO, kg(l.pesoMedioKg), TRACO, TRACO, TRACO], ate,
      'Desmama = mamote reclassificado para desmama. A desmama que saiu direto para outra fazenda está em Saídas. Raça, lote e safra: o sistema ainda não guarda ("—").'),
    engorda: lista('Engorda e reclassificação', ['Data', QTD, 'Categoria de origem', 'Categoria de destino', 'Peso kg', 'Lote origem', 'Lote destino'],
      ls.filter((l) => l.tipo === 'reclassificacao' && !ehDesmama(l)),
      (l) => [inteiro(l.quantidade), rotuloDaCategoria(l.categoria), rotuloDaCategoria(l.categoriaDestino), kg(l.pesoMedioKg), TRACO, TRACO], ate,
      'Lote origem/destino: o sistema ainda não guarda ("—").'),
  };
}

/* ------------------------------------------------------------------ Mapa do Rebanho ------------------------------------------------------------------ */

export interface LinhaDoMapa {
  pasto: string;
  areaHa: number | null;
  lote: string;
  /** quantidade e peso médio por código de categoria (só as que têm animais) */
  porCategoria: Record<string, { quantidade: number; pesoMedioKg: number | null }>;
  total: number;
}
export interface MapaDoRebanho { linhas: LinhaDoMapa[]; totalPorCategoria: Record<string, number>; total: number; areaHa: number }

/**
 * Os pastos de PECUÁRIA vigentes no mês, na ordem do cadastro; uma linha por lote (D4). Pasto sem fechamento ou sem animais = uma linha
 * vazia (o pasto está lá, sem gado). A área é a DO MÊS (`areaDe`, PASTO-AREA-OFICIAL-02a); sem área = null ("—"). `codigoDe` traduz o nome da categoria do mapa (o `CategoriaDoPasto.nome`) para o código.
 */
export function mapaDoRebanho(vigentes: readonly Pasto[], dados: ReadonlyMap<string, DadosDoPastoNoMes>, categorias: readonly CategoriaRebanho[],
  anoMes?: string, areaDe?: AreaDoPastoNoMes): MapaDoRebanho {
  const codigoDe = new Map(categorias.map((c) => [c.nome, c.codigo]));
  const linhas: LinhaDoMapa[] = [];
  const totalPorCategoria: Record<string, number> = {};
  for (const p of vigentes) {
    const d = dados.get(p.id);
    if (!d || !d.pecuaria) continue;
    const areaHa = areaNoMesOuNada(p, anoMes, areaDe);
    const porLote = new Map<string, LinhaDoMapa>();
    for (const c of d.categorias) {
      const codigo = codigoDe.get(c.nome) ?? c.nome;
      if (!c.quantidade) continue;
      const lote = c.lote ?? '';
      const l = porLote.get(lote) ?? { pasto: p.nome, areaHa, lote, porCategoria: {}, total: 0 };
      const atual = l.porCategoria[codigo];
      if (atual) {
        const q = atual.quantidade + c.quantidade;
        const pm = atual.pesoMedioKg != null && c.peso_medio_kg != null
          ? (atual.pesoMedioKg * atual.quantidade + c.peso_medio_kg * c.quantidade) / q : atual.pesoMedioKg ?? c.peso_medio_kg;
        l.porCategoria[codigo] = { quantidade: q, pesoMedioKg: pm };
      } else {
        l.porCategoria[codigo] = { quantidade: c.quantidade, pesoMedioKg: c.peso_medio_kg };
      }
      l.total += c.quantidade;
      totalPorCategoria[codigo] = (totalPorCategoria[codigo] ?? 0) + c.quantidade;
      porLote.set(lote, l);
    }
    if (porLote.size === 0) linhas.push({ pasto: p.nome, areaHa, lote: '', porCategoria: {}, total: 0 });
    else linhas.push(...porLote.values());
  }
  const areas = new Map<string, number>();
  for (const l of linhas) if (l.areaHa != null) areas.set(l.pasto, l.areaHa);
  return { linhas, totalPorCategoria, total: soma(linhas.map((l) => l.total)), areaHa: soma([...areas.values()]) };
}

/* ------------------------------------------------------------------ Chuva ------------------------------------------------------------------ */

export interface ChuvaDoAno {
  /** [dia 1..31][mês 0..11] em mm; null = sem chuva lançada */
  grade: (number | null)[][];
  total: (number | null)[];
  acumulado: (number | null)[];
  diasComChuva: number;
  historico: { ano: number; meses: (number | null)[]; total: number | null }[];
}

export function chuvaDoAno(chuvas: readonly Chuva[], ano: number, ate: number, anosDeHistorico = 4): ChuvaDoAno {
  const grade: (number | null)[][] = Array.from({ length: 31 }, () => Array<number | null>(12).fill(null));
  const porAnoMes = new Map<string, number>();
  let dias = 0;
  for (const c of chuvas) {
    const a = Number(c.data.slice(0, 4)), m = Number(c.data.slice(5, 7)), d = Number(c.data.slice(8, 10));
    if (!(c.milimetros > 0)) continue;
    if (a < ano || (a === ano && m <= ate)) porAnoMes.set(`${a}-${m}`, (porAnoMes.get(`${a}-${m}`) ?? 0) + c.milimetros);
    if (a === ano && m <= ate) { grade[d - 1][m - 1] = (grade[d - 1][m - 1] ?? 0) + c.milimetros; dias++; }
  }
  const total = Array.from({ length: 12 }, (_, i) => (i + 1 <= ate ? porAnoMes.get(`${ano}-${i + 1}`) ?? 0 : null));
  let a = 0;
  const acumulado = total.map((t) => (t == null ? null : (a += t)));
  const anos = [...new Set([...porAnoMes.keys()].map((k) => Number(k.split('-')[0])))].filter((x) => x < ano).sort((x, y) => x - y).slice(-anosDeHistorico);
  const historico = [...anos, ano].map((y) => {
    const meses = Array.from({ length: 12 }, (_, i) => porAnoMes.get(`${y}-${i + 1}`) ?? null);
    return { ano: y, meses, total: meses.some((v) => v != null) ? soma(meses) : null };
  });
  return { grade, total, acumulado, diasComChuva: dias, historico };
}

/* ------------------------------------------------------------------ O caderno ------------------------------------------------------------------ */

export type FolhaDoCaderno = 'conciliacao' | 'mapa' | 'entradas' | 'saidas' | 'nascimentos' | 'mortes' | 'desmamas' | 'engorda' | 'pesagens' | 'chuva';

export const FOLHAS_DO_CADERNO: readonly { id: FolhaDoCaderno; rotulo: string }[] = [
  { id: 'conciliacao', rotulo: 'Conciliação do Rebanho' }, { id: 'mapa', rotulo: 'Mapa do Rebanho' }, { id: 'entradas', rotulo: 'Entradas' },
  { id: 'saidas', rotulo: 'Saídas' }, { id: 'nascimentos', rotulo: 'Nascimentos' }, { id: 'mortes', rotulo: 'Mortes, consumo e doação' },
  { id: 'desmamas', rotulo: 'Desmamas' }, { id: 'engorda', rotulo: 'Engorda e reclassificação' }, { id: 'pesagens', rotulo: 'Pesagens' },
  { id: 'chuva', rotulo: 'Chuva' },
];

export interface CadernoDoMes {
  cliente: string; fazenda: string; ano: number; mes: number; geradoEm: string; arquivo: string;
  folhas: readonly FolhaDoCaderno[];
  conciliacao: Conciliacao; mapa: MapaDoRebanho; listas: ListasDoAno; chuva: ChuvaDoAno;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function cadernoDoMes(e: {
  cliente: string; fazenda: string; ano: number; mes: number; geradoEm: string; folhas: readonly FolhaDoCaderno[];
  rebanho: readonly ZootCategoriaMensal[]; lancamentos: readonly Lancamento[]; vigentes: readonly Pasto[];
  mapa: ReadonlyMap<string, DadosDoPastoNoMes>; categorias: readonly CategoriaRebanho[]; chuvas: readonly Chuva[];
  /** a área do pasto no mês (`useAreaDosPastosNoMes`); sem ele, a do cadastro */
  areaDe?: AreaDoPastoNoMes;
}): CadernoDoMes {
  const mm = String(e.mes).padStart(2, '0');
  const nome = semAcento(e.fazenda).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    cliente: e.cliente, fazenda: e.fazenda, ano: e.ano, mes: e.mes, geradoEm: e.geradoEm,
    arquivo: `caderno-${nome}-${e.ano}-${mm}`,
    folhas: FOLHAS_DO_CADERNO.map((f) => f.id).filter((id) => e.folhas.includes(id)),
    conciliacao: conciliacaoDoAno(e.rebanho, e.mes),
    mapa: mapaDoRebanho(e.vigentes, e.mapa, e.categorias, `${e.ano}-${mm}`, e.areaDe),
    listas: listasDoAno(e.lancamentos, e.ano, e.mes),
    chuva: chuvaDoAno(e.chuvas, e.ano, e.mes),
  };
}

/** Célula de número no caderno: zero = vazio; ausente = "—". */
export const celula = (v: number | null | undefined, casas = 0): string =>
  v == null ? TRACO : v === 0 ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
