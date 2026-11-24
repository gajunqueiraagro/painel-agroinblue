/**
 * REBANHO-ORGAO-01 (F2) — A CONTA da declaração do rebanho ao órgão (a tela e a planilha usam esta, e só esta). PURA.
 * FONTE = SÓ O SISTEMA (Gabriel 23/11): nada estimado — o que o sistema não sabe fica em BRANCO (null) ou num BLOCO, nunca num número
 * inventado. As regras (as da declaração de nov/26 da Vera, feita à mão e conferida):
 * R1 a faixa pelo MÊS DE NASCIMENTO lançado, em meses completos na data de referência (`tipos.ts`).
 * R2 troca de faixa (bovinos, por sexo, uma faixa por vez): da faixa k do órgão passa quem completou a idade da seguinte; FICAM os nascidos
 *    REGISTRADOS que ainda estão na faixa (primeiro na fazenda onde nasceram; o que sobra vai para a outra fazenda do cliente, na ordem dada).
 *    Se a janela de quem fica começa antes do 1º nascimento lançado, não há número: null (o Gabriel preenche — decisão de 23/11).
 * R3 nascimento da etapa: categoria pelo TEXTO; o par "nascimento em X + reclassificação X → mamote, mesma fazenda/mês/quantidade" é
 *    nascimento de mamote (N1=B); a reclassificação mamote F → mamote M (ou o inverso) depois do nascimento corrige o SEXO do nascido.
 * R4 morte e consumo: na faixa em que o órgão tem o animal (mamote/desmama → 0-12; garrote → 13-24; vaca/touro → 37+); novilha e boi não
 *    têm faixa certa → ficam de fora com aviso (o Gabriel escolhe). O que o extrato já mostra declarado (DB-MORTE/DB-CONSUMO depois da
 *    última declaração) sai da coluna; sem extrato, "não sei se já foi declarado".
 * R5 o sistema hoje por faixa: mamote → 0-12; desmama → 0-12 até os nascidos registrados de 0-12 (pela R2), o resto 13-24; touro → 37+;
 *    novilha, vaca, garrote e boi não têm mês de nascimento → as faixas 13-24…37+ viram UM BLOCO (a Dif. sai no bloco).
 * R7 as explicações da Dif. que o sistema conhece: (b) ajuste de contagem lançado; (c) movimento sem eGTA; (d) troca de sexo depois de
 *    declarado; (a) morte/consumo não declarado. O resto: "sem explicação no sistema".
 * Uma faixa NUNCA fica negativa: o editado que passa mais do que há vira a frase de recusa.
 */
import { FAIXAS, faixaNaData, indiceDoMes, zeros, type Faixa, type PorFaixa, type PorSexo, type Sexo } from './tipos';

export interface NascimentoLancado { fazendaId: string; /** 'AAAA-MM-DD' */ data: string; categoria: string; cab: number }
export interface ReclassificacaoLancada { fazendaId: string; data: string; de: string; para: string; cab: number }
export interface MorteOuConsumo { fazendaId: string; data: string; tipo: 'morte' | 'consumo'; categoria: string; cab: number }
export interface AjusteLancado { fazendaId: string; data: string; sentido: 'entrada' | 'saida'; categoria: string; cab: number }
/** O que o extrato mostra declarado depois da última declaração (DB-MORTE / DB-CONSUMO), por sexo × faixa (positivo). */
export type JaDeclarado = { morte: PorSexo<PorFaixa>; consumo: PorSexo<PorFaixa> } | null;

export interface FazendaDaDeclaracao {
  id: string;
  /** o comprovante do órgão (bovinos); null = não lido ("—") */
  iagro: PorSexo<PorFaixa> | null;
  /** o rebanho do sistema HOJE (último fechamento + lançado depois), por categoria */
  rebanhoHoje: { categoria: string; cab: number }[];
  /** o extrato depois da última declaração; null = sem extrato */
  jaDeclarado: JaDeclarado;
}
export interface EntradaDaProposta {
  /** o fim da etapa, 'AAAA-MM-DD' */
  referencia: string;
  /** a data da última declaração, 'AAAA-MM-DD' */
  desde: string;
  fazendas: FazendaDaDeclaracao[];
  /** TODOS os nascimentos lançados do cliente (realizado), para as coortes */
  nascimentos: NascimentoLancado[];
  reclassificacoes: ReclassificacaoLancada[];
  /** as mortes e consumos lançados depois de `desde` */
  mortesConsumo: MorteOuConsumo[];
  ajustes: AjusteLancado[];
  /** o que o usuário editou (fica amarelo com ↺); a conta usa o editado no lugar do sugerido */
  editados?: Record<string, Partial<Record<Sexo, { nascimentos?: number; mortesConsumo?: Partial<Record<Faixa, number>>; passa?: Partial<Record<0 | 1 | 2, number>> }>>>;
}

export interface LinhaDaProposta {
  faixa: Faixa;
  iagro: number | null;
  /** só na 0-12 */
  nascimentos: number | null;
  mortesConsumo: number;
  /** o que passa para a próxima faixa (não existe na 37+); null = o sistema não sabe (célula em branco) */
  passa: number | null;
  entra: number;
  proposto: number | null;
  /** os valores que a conta sugeriu (para o ↺) */
  sugerido: { nascimentos: number | null; mortesConsumo: number; passa: number | null };
}
export interface GrupoDoSistema { de: Faixa; ate: Faixa; cab: number; proposto: number | null; dif: number | null }
export interface PropostaDaFazenda {
  fazendaId: string;
  linhas: PorSexo<LinhaDaProposta[]>;
  /** o sistema hoje: uma faixa por grupo, ou o bloco que o sistema não separa */
  sistema: PorSexo<GrupoDoSistema[]>;
  /** frases de recusa (faixa negativa) e avisos */
  recusas: string[];
  avisos: string[];
}
export interface Explicacao { classe: 'a' | 'b' | 'c' | 'd'; fazendaId: string; sexo: Sexo | null; cab: number; texto: string }

const SEXO_DA_CATEGORIA: Record<string, Sexo> = {
  mamotes_f: 'F', desmama_f: 'F', novilhas: 'F', vacas: 'F',
  mamotes_m: 'M', desmama_m: 'M', garrotes: 'M', bois: 'M', touros: 'M',
};
export const sexoDaCategoria = (c: string): Sexo | null => SEXO_DA_CATEGORIA[c] ?? null;
const ehMamote = (c: string) => c === 'mamotes_f' || c === 'mamotes_m';
/** R4: a faixa do órgão pela categoria; null = não há faixa certa */
export function faixaDaCategoria(c: string): Faixa | null {
  if (c.startsWith('mamotes_') || c.startsWith('desmama_')) return 0;
  if (c === 'garrotes') return 1;
  if (c === 'vacas' || c === 'touros') return 3;
  return null;
}
const mesDe = (data: string) => data.slice(0, 7);
const ROT: Record<Faixa, string> = { 0: '0-12', 1: '13-24', 2: '25-36', 3: '37+' };
const NOME: Record<Sexo, string> = { F: 'Fêmeas', M: 'Machos' };

/** R3: os nascimentos com a categoria FINAL (o par N1=B vira mamote) e o sexo de hoje. Devolve um nascimento por linha. */
export function nascimentosComSexo(nasc: readonly NascimentoLancado[], recl: readonly ReclassificacaoLancada[]):
  { fazendaId: string; data: string; mes: string; sexo: Sexo; cab: number; parcial: boolean }[] {
  const usadas = new Set<number>();
  const base = nasc.map((n) => {
    let categoria = n.categoria; let parcial = false;
    if (!ehMamote(categoria)) {
      const i = recl.findIndex((r, k) => !usadas.has(k) && r.fazendaId === n.fazendaId && mesDe(r.data) === mesDe(n.data) && r.de === n.categoria && ehMamote(r.para) && r.cab === n.cab);
      if (i >= 0) { usadas.add(i); categoria = recl[i].para; }
      else parcial = recl.some((r) => r.fazendaId === n.fazendaId && mesDe(r.data) === mesDe(n.data) && r.de === n.categoria && ehMamote(r.para));
    }
    return { fazendaId: n.fazendaId, data: n.data, mes: mesDe(n.data), sexo: sexoDaCategoria(categoria) ?? 'F', cab: n.cab, parcial };
  });
  /* a troca de sexo mamote → mamote do outro sexo, depois do nascimento, corrige o nascido mais recente da fazenda (no mesmo mês ou antes) */
  const out = base.map((b) => ({ ...b }));
  recl.forEach((r, k) => {
    if (usadas.has(k) || !ehMamote(r.de) || !ehMamote(r.para) || r.de === r.para) return;
    const de = sexoDaCategoria(r.de); const para = sexoDaCategoria(r.para);
    if (!de || !para) return;
    let falta = r.cab;
    for (const b of out.filter((x) => x.fazendaId === r.fazendaId && x.sexo === de && x.mes <= mesDe(r.data)).sort((a, c) => c.mes.localeCompare(a.mes))) {
      if (falta === 0) break;
      const tira = Math.min(falta, b.cab);
      b.cab -= tira; falta -= tira;
      out.push({ fazendaId: b.fazendaId, data: b.data, mes: b.mes, sexo: para, cab: tira, parcial: false });
    }
  });
  return out.filter((b) => b.cab > 0);
}

/** Distribui `porOrigem` (o registrado por fazenda de nascimento) pelas capacidades: a própria fazenda primeiro, a sobra nas outras. */
function distribuir(ids: readonly string[], porOrigem: Record<string, number>, capacidade: Record<string, number>): Record<string, number> {
  const fica: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  let sobra = 0;
  for (const id of ids) {
    const n = porOrigem[id] ?? 0;
    const cabe = Math.max(0, capacidade[id] ?? 0);
    fica[id] = Math.min(n, cabe); sobra += n - fica[id];
  }
  for (const id of ids) {
    if (sobra === 0) break;
    const cabe = Math.max(0, (capacidade[id] ?? 0) - fica[id]);
    const vai = Math.min(cabe, sobra); fica[id] += vai; sobra -= vai;
  }
  return fica;
}

export function propostaDaDeclaracao(e: EntradaDaProposta): { fazendas: PropostaDaFazenda[]; explicacoes: Explicacao[] } {
  const ids = e.fazendas.map((f) => f.id);
  const nasc = nascimentosComSexo(e.nascimentos, e.reclassificacoes);
  const primeiroMes = nasc.length ? nasc.map((n) => n.mes).sort()[0] : null;
  /* pela DATA (a declaração é num dia: o nascido em 14/05 é desta etapa se a última foi em 04/05) */
  const novos = nasc.filter((n) => n.data > e.desde && n.data <= e.referencia);
  const antigos = nasc.filter((n) => n.data <= e.desde);

  /* R4: mortes/consumo por fazenda × sexo × faixa; novilha/boi ficam de fora com aviso */
  const mc: Record<string, PorSexo<PorFaixa>> = Object.fromEntries(ids.map((id) => [id, { F: zeros(), M: zeros() }]));
  const mcNovos: Record<string, PorSexo<number>> = Object.fromEntries(ids.map((id) => [id, { F: 0, M: 0 }]));
  const avisos: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]));
  for (const m of e.mortesConsumo) {
    const s = sexoDaCategoria(m.categoria); const f = faixaDaCategoria(m.categoria);
    if (!mc[m.fazendaId]) continue;
    if (!s || f === null) { avisos[m.fazendaId].push(`${m.tipo === 'morte' ? 'Morte' : 'Consumo'} de ${m.cab} ${m.categoria} em ${m.data}: o sistema não sabe a faixa — escolha na tabela.`); continue; }
    mc[m.fazendaId][s][f] += m.cab;
    /* o mamote que morreu depois de nascer na etapa sai dos nascimentos da etapa, não da faixa antiga */
    if (ehMamote(m.categoria) && novos.some((n) => n.fazendaId === m.fazendaId && n.sexo === s && n.data <= m.data)) mcNovos[m.fazendaId][s] += m.cab;
  }
  for (const f of e.fazendas) {
    if (!f.jaDeclarado) { if (e.mortesConsumo.some((m) => m.fazendaId === f.id)) avisos[f.id].push('Sem o extrato do órgão: não sei se alguma destas mortes/consumos já foi declarada.'); continue; }
    for (const s of ['F', 'M'] as const) for (const k of FAIXAS) {
      const ja = f.jaDeclarado.morte[s][k] + f.jaDeclarado.consumo[s][k];
      if (ja > 0) { const tira = Math.min(ja, mc[f.id][s][k]); mc[f.id][s][k] -= tira; if (tira) avisos[f.id].push(`${NOME[s]} ${ROT[k]}: ${tira} morte(s)/consumo(s) já declarado(s) no extrato — fora da coluna.`); }
    }
  }

  /* R2: quem FICA na faixa k (nascido registrado), por fazenda de nascimento; null se a janela começa antes do 1º nascimento lançado */
  const ficaPorOrigem = (s: Sexo, k: 0 | 1 | 2): Record<string, number> | null => {
    const ficam = antigos.filter((n) => n.sexo === s && faixaNaData(n.mes, e.desde) === k && faixaNaData(n.mes, e.referencia) === k);
    /* a janela de quem fica: nascidos de (ref − 12(k+1) + 1) meses até `desde`; começa antes do 1º lançamento = sem número */
    const inicioDaJanela = indiceDoMes(mesDe(e.referencia)) - 12 * (k + 1);
    if (!primeiroMes || inicioDaJanela < indiceDoMes(primeiroMes)) return null;
    const r: Record<string, number> = {};
    for (const n of ficam) r[n.fazendaId] = (r[n.fazendaId] ?? 0) + n.cab;
    return r;
  };

  const saida: PropostaDaFazenda[] = e.fazendas.map((f) => ({ fazendaId: f.id, linhas: { F: [], M: [] }, sistema: { F: [], M: [] }, recusas: [], avisos: avisos[f.id] }));
  for (const s of ['F', 'M'] as const) {
    /* o balde de cada faixa do órgão, depois de mortes/consumo da faixa (as dos nascidos na etapa saem dos nascimentos) */
    const balde = (f: FazendaDaDeclaracao, k: Faixa) => (f.iagro ? f.iagro[s][k] - mc[f.id][s][k] + (k === 0 ? mcNovos[f.id][s] : 0) : 0);
    const passaSug: Record<string, (number | null)[]> = Object.fromEntries(ids.map((id) => [id, [null, null, null]]));
    for (const k of [0, 1, 2] as const) {
      const porOrigem = ficaPorOrigem(s, k);
      if (!porOrigem) continue;
      const cap = Object.fromEntries(e.fazendas.map((f) => [f.id, balde(f, k)]));
      const fica = distribuir(ids, porOrigem, cap);
      for (const f of e.fazendas) passaSug[f.id][k] = f.iagro ? Math.max(0, cap[f.id] - fica[f.id]) : null;
    }
    /* R5: o sistema hoje — 0-12 = os nascidos registrados que ainda têm até 12 meses na referência: 1º os da etapa, na fazenda onde
       nasceram (bezerro não muda de fazenda sem a mãe), até o nº de mamotes; depois os mais antigos, a própria fazenda primeiro e a sobra
       nas outras, até o que sobra de mamote+desmama */
    const cat = (f: FazendaDaDeclaracao, c: string) => f.rebanhoHoje.filter((r) => r.categoria === c).reduce((a, r) => a + r.cab, 0);
    const mam = s === 'F' ? 'mamotes_f' : 'mamotes_m'; const des = s === 'F' ? 'desmama_f' : 'desmama_m';
    const capJovem = Object.fromEntries(e.fazendas.map((f) => [f.id, cat(f, mam) + cat(f, des)]));
    const novosVivos: Record<string, number> = {};
    for (const n of novos) if (n.sexo === s) novosVivos[n.fazendaId] = (novosVivos[n.fazendaId] ?? 0) + n.cab;
    const novosFicam = Object.fromEntries(e.fazendas.map((f) => [f.id, Math.min(cat(f, mam), Math.max(0, (novosVivos[f.id] ?? 0) - mcNovos[f.id][s]))]));
    const velhosJovens: Record<string, number> = {};
    for (const n of antigos) if (n.sexo === s && faixaNaData(n.mes, e.referencia) === 0) velhosJovens[n.fazendaId] = (velhosJovens[n.fazendaId] ?? 0) + n.cab;
    const capVelhos = Object.fromEntries(e.fazendas.map((f) => [f.id, capJovem[f.id] - novosFicam[f.id]]));
    const velhosFicam = distribuir(ids, velhosJovens, capVelhos);
    const jovensFicam = Object.fromEntries(ids.map((id) => [id, novosFicam[id] + velhosFicam[id]]));

    e.fazendas.forEach((f, i) => {
      const ed = e.editados?.[f.id]?.[s];
      const out = saida[i];
      const nascSug = f.iagro ? novos.filter((n) => n.fazendaId === f.id && n.sexo === s).reduce((a, n) => a + n.cab, 0) : null;
      const linhas: LinhaDaProposta[] = [];
      let entra = 0;
      for (const k of FAIXAS) {
        const nascimentos = k === 0 ? (ed?.nascimentos ?? nascSug) : null;
        const mcSug = mc[f.id][s][k];
        const mortesConsumo = ed?.mortesConsumo?.[k] ?? mcSug;
        const sugPassa = k < 3 ? passaSug[f.id][k] : null;
        const passa = k < 3 ? (ed?.passa?.[k as 0 | 1 | 2] ?? sugPassa) : null;
        const iagro = f.iagro ? f.iagro[s][k] : null;
        const disponivel = iagro === null ? null : iagro + (nascimentos ?? 0) - mortesConsumo + entra;
        const proposto = disponivel === null ? null : disponivel - (passa ?? 0);
        if (disponivel !== null && proposto !== null && proposto < 0) {
          out.recusas.push(`${NOME[s]} ${ROT[k]}: passa ${passa ?? 0}, mas só há ${disponivel}.`);
        }
        linhas.push({ faixa: k, iagro, nascimentos, mortesConsumo, passa, entra, proposto,
          sugerido: { nascimentos: k === 0 ? nascSug : null, mortesConsumo: mcSug, passa: sugPassa } });
        entra = passa ?? 0;
      }
      out.linhas[s] = linhas;
      /* o sistema hoje por grupo */
      const zero = Math.max(cat(f, mam), Math.min(capJovem[f.id], jovensFicam[f.id]));
      const desmamaVelha = capJovem[f.id] - zero;
      const semFaixa = s === 'F' ? cat(f, 'novilhas') + cat(f, 'vacas') : cat(f, 'garrotes') + cat(f, 'bois');
      const touros = s === 'M' ? cat(f, 'touros') : 0;
      const grupos: { de: Faixa; ate: Faixa; cab: number }[] = [{ de: 0, ate: 0, cab: zero }];
      if (semFaixa > 0) grupos.push({ de: 1, ate: 3, cab: desmamaVelha + semFaixa + touros });
      else grupos.push({ de: 1, ate: 1, cab: desmamaVelha }, { de: 2, ate: 2, cab: 0 }, { de: 3, ate: 3, cab: touros });
      out.sistema[s] = grupos.map((g) => {
        const props = linhas.filter((l) => l.faixa >= g.de && l.faixa <= g.ate).map((l) => l.proposto);
        const proposto = props.some((p) => p === null) ? null : props.reduce<number>((a, p) => a + (p ?? 0), 0);
        return { ...g, proposto, dif: proposto === null ? null : g.cab - proposto };
      });
      if (linhas.some((l) => l.passa === null && l.faixa < 3 && f.iagro)) {
        out.avisos.push(`${NOME[s]}: a troca de faixa sem nascimento lançado (antes de ${primeiroMes ?? '—'}) fica em branco — preencha.`);
      }
    });
  }
  for (const n of nasc.filter((x) => x.parcial)) {
    const p = saida.find((o) => o.fazendaId === n.fazendaId);
    p?.avisos.push(`Nascimento fora de mamote em ${n.mes} sem a reclassificação de mesma quantidade: confira.`);
  }

  /* R7: as explicações que o sistema conhece */
  const explicacoes: Explicacao[] = [];
  for (const a of e.ajustes.filter((x) => x.data > e.desde)) {
    explicacoes.push({ classe: 'b', fazendaId: a.fazendaId, sexo: sexoDaCategoria(a.categoria), cab: a.sentido === 'entrada' ? a.cab : -a.cab,
      texto: `Ajuste de contagem de ${a.categoria} (${a.sentido === 'entrada' ? '+' : '−'}${a.cab}) em ${a.data}: lance a causa (nascimento, morte, saída).` });
  }
  for (const r of e.reclassificacoes.filter((x) => x.data > e.desde)) {
    const de = sexoDaCategoria(r.de); const para = sexoDaCategoria(r.para);
    if (!de || !para || de === para) continue;
    const nascidoNaEtapa = ehMamote(r.de) && ehMamote(r.para);
    if (nascidoNaEtapa) continue;   // a R3 já declara o nascido com o sexo de hoje
    explicacoes.push({ classe: 'd', fazendaId: r.fazendaId, sexo: de, cab: r.cab,
      texto: `${r.cab} ${r.de} viraram ${r.para} em ${r.data}: o órgão os tem com o sexo antigo — retificar.` });
  }
  return { fazendas: saida, explicacoes };
}

/** R7 (c): os movimentos do sistema sem eGTA no extrato (saída sem GTA, ou eGTA de número/data fora). */
export function explicacoesDeGta(fazendaId: string, semEgta: readonly { id: string; data: string; cab: number; sentido: 'saida' | 'entrada' }[]): Explicacao[] {
  return semEgta.map((m) => ({ classe: 'c', fazendaId, sexo: null, cab: m.sentido === 'saida' ? -m.cab : m.cab,
    texto: `${m.sentido === 'saida' ? 'Saída' : 'Entrada'} de ${m.cab} cab em ${m.data} sem eGTA no extrato: confira a GTA.` }));
}
