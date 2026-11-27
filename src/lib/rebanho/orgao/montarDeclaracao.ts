/**
 * REBANHO-ORGAO-01 (F3) — a COLA pura entre o banco, os PDFs lidos e a conta (`propostaDaDeclaracao`). Nada aqui faz conta nova da
 * declaração: só traduz. As regras:
 * - os fatos chegam da `fn_rebanho_orgao_fatos` como json: lidos campo a campo (o que não tem a forma certa fica de fora — nunca cast);
 * - o PDF do órgão é guardado como as LINHAS lidas (o `montarLinhas`): ao abrir de novo, o MESMO leitor relê (uma leitura só no sistema);
 * - "desde" (a última declaração) = a última marcada como declarada no sistema; sem ela, a última declaração ("<n>/U") que o extrato
 *   mostra; sem as duas, null (a tela pede o extrato — nunca chuta uma data);
 * - o "já declarado" (R4) = as mortes e consumos que o extrato mostra DEPOIS de "desde" (o órgão já os tem);
 * - a etapa da tela = a de declaração da UF que está aberta hoje (até a prorrogação), senão a próxima; o prazo = a prorrogação, se houver;
 * - brucelose (DX7): as fêmeas nascidas que terão de 3 a 8 meses no fim da etapa de vacinação, menos as vacinadas que o extrato mostra
 *   depois do 1º desses nascimentos; sem extrato, "vacinadas" é null ("—").
 */
import { mesesCompletos, type Faixa, type PorFaixa, type PorSexo, type Sexo } from './tipos';
import type { ExtratoLido } from './lerExtratoIagro';
import type { MovimentoComGta } from './casarEgta';
import { nascimentosComSexo, type AjusteLancado, type JaDeclarado, type MorteOuConsumo, type NascimentoLancado, type ReclassificacaoLancada,
  type EntradaDaProposta } from './propostaDaDeclaracao';

/* ═══ leitura segura do json ═══ */
const ultimo = (xs: readonly string[]): string | null => (xs.length ? [...xs].sort()[xs.length - 1] : null);
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface FazendaDosFatos { id: string; nome: string; uf: string | null }
export interface MovimentoDosFatos { id: string; fazendaId: string; tipo: string; data: string; sentido: 'saida' | 'entrada'; categoria: string; cab: number; egtas: string[] }
export interface FatosDoBanco {
  desde: string; ate: string;
  fazendas: FazendaDosFatos[];
  nascimentos: NascimentoLancado[];
  reclassificacoes: ReclassificacaoLancada[];
  mortesConsumo: MorteOuConsumo[];
  ajustes: AjusteLancado[];
  movimentos: MovimentoDosFatos[];
  rebanhoHoje: { fazendaId: string; anoMes: string; categoria: string; cab: number }[];
}

export function fatosDaRpc(j: unknown): FatosDoBanco | null {
  if (!ehObj(j)) return null;
  const desde = txt(j.desde); const ate = txt(j.ate);
  if (!desde || !ate) return null;
  const fazendas: FazendaDosFatos[] = [];
  for (const f of lista(j.fazendas)) {
    if (!ehObj(f)) continue;
    const id = txt(f.id); const nome = txt(f.nome);
    if (id && nome) fazendas.push({ id, nome, uf: txt(f.uf) });
  }
  const base = (x: Record<string, unknown>) => {
    const fazendaId = txt(x.fazenda_id); const data = txt(x.data); const cab = num(x.cab);
    return fazendaId && data && cab !== null && cab > 0 ? { fazendaId, data, cab } : null;
  };
  const nascimentos: NascimentoLancado[] = [];
  for (const x of lista(j.nascimentos)) {
    if (!ehObj(x)) continue;
    const b = base(x); const categoria = txt(x.categoria);
    if (b && categoria) nascimentos.push({ ...b, categoria });
  }
  const reclassificacoes: ReclassificacaoLancada[] = [];
  for (const x of lista(j.reclassificacoes)) {
    if (!ehObj(x)) continue;
    const b = base(x); const de = txt(x.de); const para = txt(x.para);
    if (b && de && para) reclassificacoes.push({ ...b, de, para });
  }
  const mortesConsumo: MorteOuConsumo[] = [];
  for (const x of lista(j.mortes_consumo)) {
    if (!ehObj(x)) continue;
    const b = base(x); const categoria = txt(x.categoria); const tipo = x.tipo === 'morte' || x.tipo === 'consumo' ? x.tipo : null;
    if (b && categoria && tipo) mortesConsumo.push({ ...b, categoria, tipo });
  }
  const ajustes: AjusteLancado[] = [];
  for (const x of lista(j.ajustes)) {
    if (!ehObj(x)) continue;
    const b = base(x); const categoria = txt(x.categoria); const sentido = x.sentido === 'entrada' || x.sentido === 'saida' ? x.sentido : null;
    if (b && categoria && sentido) ajustes.push({ ...b, categoria, sentido });
  }
  const movimentos: MovimentoDosFatos[] = [];
  for (const x of lista(j.movimentos)) {
    if (!ehObj(x)) continue;
    const b = base(x); const id = txt(x.id); const tipo = txt(x.tipo); const categoria = txt(x.categoria) ?? '';
    const sentido = x.sentido === 'entrada' || x.sentido === 'saida' ? x.sentido : null;
    if (b && id && tipo && sentido) {
      movimentos.push({ id, fazendaId: b.fazendaId, tipo, data: b.data, sentido, categoria, cab: b.cab,
        egtas: lista(x.egtas).flatMap((g) => (typeof g === 'string' ? [g] : [])) });
    }
  }
  const rebanhoHoje: FatosDoBanco['rebanhoHoje'] = [];
  for (const x of lista(j.rebanho_hoje)) {
    if (!ehObj(x)) continue;
    const fazendaId = txt(x.fazenda_id); const anoMes = txt(x.ano_mes); const categoria = txt(x.categoria); const cab = num(x.cab);
    if (fazendaId && anoMes && categoria && cab !== null) rebanhoHoje.push({ fazendaId, anoMes, categoria, cab });
  }
  return { desde, ate, fazendas, nascimentos, reclassificacoes, mortesConsumo, ajustes, movimentos, rebanhoHoje };
}

/* ═══ o PDF guardado = as linhas lidas ═══ */
export const linhasGuardadas = (v: unknown): string[] | null => {
  if (!ehObj(v) || !Array.isArray(v.linhas)) return null;
  const l = v.linhas.flatMap((x) => (typeof x === 'string' ? [x] : []));
  return l.length ? l : null;
};

/* ═══ o editado por célula (o que a pessoa trocou; o sugerido fica para o ↺) ═══ */
export type EditadosDaFazenda = Partial<Record<Sexo, { nascimentos?: number; mortesConsumo?: Partial<Record<Faixa, number>>; passa?: Partial<Record<0 | 1 | 2, number>> }>>;
const inteiroNaoNegativo = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined);
export function editadosDoBanco(v: unknown): EditadosDaFazenda {
  const out: EditadosDaFazenda = {};
  if (!ehObj(v)) return out;
  for (const s of ['F', 'M'] as const) {
    const x = v[s];
    if (!ehObj(x)) continue;
    const e: NonNullable<EditadosDaFazenda[Sexo]> = {};
    const n = inteiroNaoNegativo(x.nascimentos);
    if (n !== undefined) e.nascimentos = n;
    if (ehObj(x.mortesConsumo)) {
      const mc: Partial<Record<Faixa, number>> = {};
      for (const k of [0, 1, 2, 3] as const) { const c = inteiroNaoNegativo(x.mortesConsumo[String(k)]); if (c !== undefined) mc[k] = c; }
      if (Object.keys(mc).length) e.mortesConsumo = mc;
    }
    if (ehObj(x.passa)) {
      const p: Partial<Record<0 | 1 | 2, number>> = {};
      for (const k of [0, 1, 2] as const) { const c = inteiroNaoNegativo(x.passa[String(k)]); if (c !== undefined) p[k] = c; }
      if (Object.keys(p).length) e.passa = p;
    }
    if (Object.keys(e).length) out[s] = e;
  }
  return out;
}
export type CelulaEditavel = { sexo: Sexo; campo: 'nascimentos' } | { sexo: Sexo; campo: 'mortesConsumo'; faixa: Faixa } | { sexo: Sexo; campo: 'passa'; faixa: 0 | 1 | 2 };
/** Troca UMA célula (valor null = volta ao sugerido, o ↺). Devolve um objeto novo; o vazio some. */
export function comEditado(ed: EditadosDaFazenda, c: CelulaEditavel, valor: number | null): EditadosDaFazenda {
  const s = { ...(ed[c.sexo] ?? {}) };
  if (c.campo === 'nascimentos') { if (valor === null) delete s.nascimentos; else s.nascimentos = valor; }
  else if (c.campo === 'mortesConsumo') {
    const m = { ...(s.mortesConsumo ?? {}) };
    if (valor === null) delete m[c.faixa]; else m[c.faixa] = valor;
    if (Object.keys(m).length) s.mortesConsumo = m; else delete s.mortesConsumo;
  } else {
    const p = { ...(s.passa ?? {}) };
    if (valor === null) delete p[c.faixa]; else p[c.faixa] = valor;
    if (Object.keys(p).length) s.passa = p; else delete s.passa;
  }
  const out = { ...ed };
  if (Object.keys(s).length) out[c.sexo] = s; else delete out[c.sexo];
  return out;
}

/* ═══ o extrato ═══ */
const zerosSexo = (): PorSexo<PorFaixa> => ({ F: [0, 0, 0, 0], M: [0, 0, 0, 0] });
/** R4: as mortes/consumos que o extrato mostra DEPOIS de `desde` (positivos). */
export function jaDeclaradoDoExtrato(ex: ExtratoLido, desde: string): JaDeclarado {
  const morte = zerosSexo(); const consumo = zerosSexo();
  for (const o of ex.operacoes) {
    if ((o.tipo !== 'morte' && o.tipo !== 'consumo') || !o.quando || o.quando.slice(0, 10) <= desde) continue;
    const alvo = o.tipo === 'morte' ? morte : consumo;
    for (const s of ['F', 'M'] as const) for (const k of [0, 1, 2, 3] as const) alvo[s][k] += Math.abs(o.mov[s][k]);
  }
  return { morte, consumo };
}
/** A data ('AAAA-MM-DD') da última declaração que o extrato mostra (documento "<n>/U"); null se não há. */
export function ultimaDeclaracaoNoExtrato(ex: ExtratoLido): string | null {
  const datas = ex.operacoes.filter((o) => o.documento?.toUpperCase().endsWith('/U') && o.quando).map((o) => (o.quando ?? '').slice(0, 10));
  return ultimo(datas);
}
/** "desde": a última marcada no sistema; sem ela, a do extrato (a mais recente dos extratos lidos); sem as duas, null. */
export function desdeDaDeclaracao(ultimaNoSistema: string | null, extratos: readonly (ExtratoLido | null)[]): { data: string | null; fonte: 'sistema' | 'extrato' | null } {
  if (ultimaNoSistema) return { data: ultimaNoSistema, fonte: 'sistema' };
  const doExtrato = ultimo(extratos.flatMap((x) => { const d = x ? ultimaDeclaracaoNoExtrato(x) : null; return d ? [d] : []; }));
  return doExtrato ? { data: doExtrato, fonte: 'extrato' } : { data: null, fonte: null };
}

/* ═══ a etapa ═══ */
export interface EtapaDoOrgao { id: string; uf: string; orgao: string; tipo: 'declaracao' | 'brucelose'; inicio: string; fim: string; prorrogadoAte: string | null }
export function etapasDoBanco(v: unknown): EtapaDoOrgao[] {
  return lista(v).flatMap((x) => {
    if (!ehObj(x)) return [];
    const id = txt(x.id); const uf = txt(x.uf); const orgao = txt(x.orgao); const inicio = txt(x.inicio); const fim = txt(x.fim);
    const tipo = x.tipo === 'declaracao' || x.tipo === 'brucelose' ? x.tipo : null;
    return id && uf && orgao && inicio && fim && tipo && x.ativo !== false ? [{ id, uf, orgao, tipo, inicio, fim, prorrogadoAte: txt(x.prorrogado_ate) }] : [];
  });
}
const prazoDe = (e: EtapaDoOrgao) => e.prorrogadoAte ?? e.fim;
/** A etapa de `tipo` da UF aberta em `hoje` (até a prorrogação); senão a próxima; senão null. */
export function etapaDaVez(etapas: readonly EtapaDoOrgao[], uf: string | null, tipo: EtapaDoOrgao['tipo'], hoje: string): EtapaDoOrgao | null {
  if (!uf) return null;
  const da = etapas.filter((e) => e.uf === uf && e.tipo === tipo).sort((a, b) => a.inicio.localeCompare(b.inicio));
  return da.find((e) => e.inicio <= hoje && hoje <= prazoDe(e)) ?? da.find((e) => e.inicio > hoje) ?? null;
}
export const prazoDaEtapa = prazoDe;
export function diasAte(hoje: string, data: string): number {
  return Math.round((Date.parse(`${data}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
}

/* ═══ a entrada da conta ═══ */
export interface PdfsDaFazenda { iagro: PorSexo<PorFaixa> | null; extrato: ExtratoLido | null }
export function entradaDaProposta(f: FatosDoBanco, pdfs: Record<string, PdfsDaFazenda>, editados: Record<string, EditadosDaFazenda>,
  referencia: string, desde: string): EntradaDaProposta {
  return {
    referencia, desde,
    fazendas: f.fazendas.map((fz) => {
      const p = pdfs[fz.id];
      return {
        id: fz.id,
        iagro: p?.iagro ?? null,
        rebanhoHoje: f.rebanhoHoje.filter((r) => r.fazendaId === fz.id).map((r) => ({ categoria: r.categoria, cab: r.cab })),
        jaDeclarado: p?.extrato ? jaDeclaradoDoExtrato(p.extrato, desde) : null,
      };
    }),
    nascimentos: f.nascimentos, reclassificacoes: f.reclassificacoes, mortesConsumo: f.mortesConsumo, ajustes: f.ajustes,
    editados,
  };
}
/** Os movimentos de uma fazenda para casar com as eGTAs (R6): só os da janela (desde, até] ± a folga que o banco já deu. */
export const movimentosParaCasar = (f: FatosDoBanco, fazendaId: string): MovimentoComGta[] =>
  f.movimentos.filter((m) => m.fazendaId === fazendaId)
    .map((m) => ({ id: m.id, data: m.data, sentido: m.sentido, cab: m.cab, numeroDocumento: m.egtas.length ? m.egtas.join(' + ') : null }));

/* ═══ brucelose (DX7) ═══ */
export interface Brucelose { candidatas: number; vacinadas: number | null; aVacinar: number | null; ultimaVacina: string | null; vacinarAte: string }
export function bruceloseDaFazenda(f: FatosDoBanco, fazendaId: string, vacinarAte: string, extrato: ExtratoLido | null,
  ultimaVacinaDoComprovante: string | null): Brucelose {
  const nasc = nascimentosComSexo(f.nascimentos, f.reclassificacoes).filter((n) => n.fazendaId === fazendaId && n.sexo === 'F');
  const naJanela = nasc.filter((n) => { const m = mesesCompletos(n.mes, vacinarAte); return m >= 3 && m <= 8; });
  const candidatas = naJanela.reduce((a, n) => a + n.cab, 0);
  const primeiro = naJanela.map((n) => n.mes).sort()[0] ?? null;
  const vacinadas = extrato && primeiro
    ? extrato.operacoes.filter((o) => o.tipo === 'brucelose' && (o.dataDaVacina ?? '') >= `${primeiro}-01`).reduce((a, o) => a + Math.abs(o.mov.F[0]) + Math.abs(o.mov.F[1]), 0)
    : extrato ? 0 : null;
  const ultimaDoExtrato = extrato ? ultimo(extrato.operacoes.flatMap((o) => (o.tipo === 'brucelose' && o.dataDaVacina ? [o.dataDaVacina] : []))) : null;
  return { candidatas, vacinadas, aVacinar: vacinadas === null ? null : Math.max(0, candidatas - vacinadas),
    ultimaVacina: ultimo([ultimaVacinaDoComprovante, ultimaDoExtrato].flatMap((x) => (x ? [x] : []))), vacinarAte };
}
