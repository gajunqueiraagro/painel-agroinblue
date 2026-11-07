/**
 * UI-PERIODO-01 (Gabriel 04/11/2026, modelo AgriWebb) — as regras do componente único de período, sem tela: o intervalo de DATAS
 * (início e fim, inclusivos), os atalhos, o rótulo do gatilho, a grade do calendário e o clique no dia.
 *
 * ⚠ DATAS SÃO TEXTO 'AAAA-MM-DD', nunca `Date`: um `new Date('2026-07-01')` é meia-noite UTC e, no fuso de Brasília, vira 30/06 às 21h —
 *   o mês do início mudaria sozinho. A conta de calendário usa `Date` só com ano/mês/dia locais (`new Date(a, m, d)`), e volta para texto.
 * ⚠ A SAFRA NUNCA É FIXA AQUI: o "Esta safra / Última safra" sai do cadastro (`financeiro_safras`: data_inicio, data_fim, escopo), pela
 *   atividade da tela. Hoje todas as safras do proto vão de julho a junho; se o cadastro mudar, o atalho muda junto.
 */

export interface Intervalo {
  /** 'AAAA-MM-DD' */
  de: string;
  /** 'AAAA-MM-DD', inclusivo */
  ate: string;
  /** o nome do atalho que o escolheu ("Safra 26/27 · jul/26–jun/27"), para o gatilho; `null` = datas livres */
  nome?: string | null;
}

export type AtividadeDaSafra = 'pecuaria' | 'agricultura';

export interface SafraDoCadastro {
  id: string;
  /** o código do cadastro ("26/27-Pec") */
  codigo: string;
  atividade: AtividadeDaSafra;
  /** 'AAAA-MM-DD' (data_inicio e data_fim do cadastro) */
  de: string;
  ate: string;
}

export type ModoDoPeriodo = 'datas' | 'mes' | 'ano';

export interface AtalhoDoPeriodo {
  id: string;
  rotulo: string;
  /** o texto inteiro, quando o rótulo é curto (as datas da safra) */
  titulo?: string;
  intervalo: Intervalo;
}

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ROTULO_ATIVIDADE: Record<AtividadeDaSafra, string> = { pecuaria: 'Pecuária', agricultura: 'Lavoura' };

const p2 = (n: number) => String(n).padStart(2, '0');
/** a data local (ano, mês 0–11, dia) em texto; o `Date` normaliza o mês/dia fora da faixa (mês −1 = dezembro do ano anterior) */
export function dataTexto(ano: number, mes0: number, dia: number): string {
  const d = new Date(ano, mes0, dia);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export const partes = (t: string): { ano: number; mes0: number; dia: number } => ({
  ano: Number(t.slice(0, 4)), mes0: Number(t.slice(5, 7)) - 1, dia: Number(t.slice(8, 10)),
});
export const inicioDoMes = (ano: number, mes0: number) => dataTexto(ano, mes0, 1);
export const fimDoMes = (ano: number, mes0: number) => dataTexto(ano, mes0 + 1, 0);
export const intervaloDoMes = (ano: number, mes0: number): Intervalo => ({ de: inicioDoMes(ano, mes0), ate: fimDoMes(ano, mes0) });
export const intervaloDoAno = (ano: number): Intervalo => ({ de: `${ano}-01-01`, ate: `${ano}-12-31` });
/** "05/11/2026" */
export const dataCurta = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
/** "jul/26" */
export const mesAno = (t: string) => `${MESES_CURTOS[partes(t).mes0]}/${t.slice(2, 4)}`;

/** O código da safra sem o sufixo da atividade ("26/27-Pec" → "26/27"): dentro do rótulo a atividade já vem escrita. */
export const codigoCurto = (s: SafraDoCadastro) => s.codigo.replace(/-[A-Za-zÀ-ú]+$/, '');

/** "Safra 26/27 · jul/26–jun/27" (com "· Pecuária" no fim quando a tela tem mais de uma atividade) */
export function rotuloDaSafra(s: SafraDoCadastro, comAtividade = false): string {
  return `Safra ${codigoCurto(s)} · ${mesAno(s.de)}–${mesAno(s.ate)}${comAtividade ? ` · ${ROTULO_ATIVIDADE[s.atividade]}` : ''}`;
}

export const ehMesInteiro = (i: Intervalo) => i.de.slice(8) === '01' && i.ate === fimDoMes(partes(i.de).ano, partes(i.de).mes0);
export const ehAnoInteiro = (i: Intervalo) => i.de.slice(5) === '01-01' && i.ate.slice(5) === '12-31' && i.de.slice(0, 4) === i.ate.slice(0, 4);

/** O texto do gatilho: o nome do atalho; senão "out/2026", "2026" ou "01/09/2026 – 15/10/2026". */
export function rotuloDoIntervalo(i: Intervalo | null | undefined): string {
  if (!i) return 'Escolher período';
  if (i.nome) return i.nome;
  if (ehMesInteiro(i)) return `${MESES_CURTOS[partes(i.de).mes0]}/${i.de.slice(0, 4)}`;
  if (ehAnoInteiro(i)) return i.de.slice(0, 4);
  return `${dataCurta(i.de)} – ${dataCurta(i.ate)}`;
}

/** A safra que contém o dia (pelas datas do cadastro); a "anterior" é a de início mais recente antes dela. */
export function safraQueContem(safras: readonly SafraDoCadastro[], atividade: AtividadeDaSafra, dia: string): SafraDoCadastro | null {
  return safras.find((s) => s.atividade === atividade && s.de <= dia && dia <= s.ate) ?? null;
}
export function safraAnteriorA(safras: readonly SafraDoCadastro[], s: SafraDoCadastro): SafraDoCadastro | null {
  return safras.filter((x) => x.atividade === s.atividade && x.de < s.de).sort((a, b) => b.de.localeCompare(a.de))[0] ?? null;
}

/**
 * Os atalhos, na ordem do pedido: Este mês · Mês passado · Este ano · Último ano · Esta safra · Última safra · Últimos 12 meses.
 * ("Selecionar o ano" e "Redefinir" são gestos do popup, não intervalos.) No modo `mes` só os de um mês; no `ano`, os de ano.
 * Com mais de uma atividade, os de safra saem por atividade ("Esta safra · Pecuária", "Esta safra · Lavoura") — salvo quando as datas são
 * as mesmas nas atividades: aí um só ("Esta safra").
 */
export function atalhosDoPeriodo(e: {
  hoje: string; modo: ModoDoPeriodo; safras: readonly SafraDoCadastro[]; atividades: readonly AtividadeDaSafra[];
}): AtalhoDoPeriodo[] {
  const { ano, mes0 } = partes(e.hoje);
  const lista: AtalhoDoPeriodo[] = [];
  if (e.modo !== 'ano') {
    lista.push({ id: 'este-mes', rotulo: 'Este mês', intervalo: intervaloDoMes(ano, mes0) });
    lista.push({ id: 'mes-passado', rotulo: 'Mês passado', intervalo: intervaloDoMes(ano, mes0 - 1) });
  }
  if (e.modo === 'mes') return lista;
  lista.push({ id: 'este-ano', rotulo: 'Este ano', intervalo: intervaloDoAno(ano) });
  lista.push({ id: 'ultimo-ano', rotulo: 'Último ano', intervalo: intervaloDoAno(ano - 1) });
  if (e.modo === 'ano') return lista;
  /* UI-PERIODO-01b (Gabriel 04/11 18:03): telas com as duas atividades (Painel, CPR) — quando a safra de hoje e a anterior têm as MESMAS datas
     nas duas (hoje todas vão de julho a junho), um atalho só ("Esta safra"), sem o "· Pecuária"/"· Lavoura"; datas diferentes = um por atividade */
  const chave = (at: AtividadeDaSafra) => {
    const esta = safraQueContem(e.safras, at, e.hoje);
    const ant = esta ? safraAnteriorA(e.safras, esta) : null;
    return esta ? `${esta.de}|${esta.ate}|${ant?.de ?? ''}|${ant?.ate ?? ''}` : null;
  };
  const comSafra = e.atividades.filter((at) => chave(at) != null);
  const mesmas = comSafra.length > 1 && comSafra.every((at) => chave(at) === chave(comSafra[0]));
  const varias = e.atividades.length > 1 && !mesmas;
  for (const at of mesmas ? comSafra.slice(0, 1) : e.atividades) {
    const esta = safraQueContem(e.safras, at, e.hoje);
    if (!esta) continue;
    const suf = varias ? ` · ${ROTULO_ATIVIDADE[at]}` : '';
    lista.push({ id: `esta-safra-${at}`, rotulo: `Esta safra${suf}`, titulo: rotuloDaSafra(esta, varias),
      intervalo: { de: esta.de, ate: esta.ate, nome: rotuloDaSafra(esta, varias) } });
    const ant = safraAnteriorA(e.safras, esta);
    if (ant) lista.push({ id: `ultima-safra-${at}`, rotulo: `Última safra${suf}`, titulo: rotuloDaSafra(ant, varias),
      intervalo: { de: ant.de, ate: ant.ate, nome: rotuloDaSafra(ant, varias) } });
  }
  lista.push({ id: 'ultimos-12', rotulo: 'Últimos 12 meses', intervalo: { de: inicioDoMes(ano, mes0 - 11), ate: fimDoMes(ano, mes0) } });
  return lista;
}

/** As 42 casas do mês (6 semanas, começando na segunda-feira), cada uma com a data e se é do mês. */
export function gradeDoMes(ano: number, mes0: number): { data: string; doMes: boolean; dia: number }[] {
  const primeiro = new Date(ano, mes0, 1);
  const recuo = (primeiro.getDay() + 6) % 7; // segunda = 0
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(ano, mes0, 1 - recuo + i);
    return { data: dataTexto(d.getFullYear(), d.getMonth(), d.getDate()), doMes: d.getMonth() === mes0, dia: d.getDate() };
  });
}

/** O rascunho do popup enquanto se clica: o 1º clique marca o início; o 2º, o fim (antes do início = recomeça por ele). */
export interface Rascunho { de: string | null; ate: string | null; nome: string | null }
export function cliqueNoDia(r: Rascunho, dia: string, porMes = false): Rascunho {
  /* `porMes` (telas de dado MENSAL, como a DRE): o clique escolhe o MÊS do dia — o início vai ao dia 1, o fim ao último dia */
  const { ano, mes0 } = partes(dia);
  const ini = porMes ? inicioDoMes(ano, mes0) : dia;
  if (!r.de || r.ate || ini < r.de) return { de: ini, ate: null, nome: null };
  return { de: r.de, ate: porMes ? fimDoMes(ano, mes0) : dia, nome: null };
}

/** O nome do período quando ele bate com um atalho (o período lido da URL não traz nome: "Safra 25/26 · jul/25–jun/26" volta sozinho). */
export function nomePeloAtalho(i: Intervalo, atalhos: readonly AtalhoDoPeriodo[]): string | null {
  return i.nome ?? atalhos.find((a) => a.intervalo.nome && a.intervalo.de === i.de && a.intervalo.ate === i.ate)?.intervalo.nome ?? null;
}

/** Os anos da grade de "Selecionar o ano": do mais antigo com dado até o ano de hoje + 1 (nunca uma lista fixa no código). */
export function anosDaGrade(hoje: string, maisAntigo: number | null): number[] {
  const ate = partes(hoje).ano + 1;
  const de = Math.min(maisAntigo ?? ate - 5, ate - 1);
  return Array.from({ length: ate - de + 1 }, (_, i) => de + i);
}
