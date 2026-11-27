/**
 * FOLHA-VERA-PACOTE-01 F2 (Gabriel 27/11) — as GUIAS do pacote da folha, ao lado do relatório analítico (`lerFolhaAnalitica`):
 *   o DARF (a composição: INSS dos segurados, terceiros — Salário-Educação e INCRA —, IRRF), a GFD (a guia do FGTS Digital, paga por PIX),
 *   a Relação de Trabalhadores do FGTS (o FGTS por trabalhador e por ESTABELECIMENTO, isto é, por fazenda) e o recibo da DCTFWeb.
 * PUROS. ⚠ Documento real NUNCA no repo, teste ou log — os testes usam dados inventados no formato do layout.
 * O que não for reconhecido com certeza devolve a frase de "não sei"; o que não fecha vai em `naoConfere` — nunca se acerta um valor.
 *
 * Layouts (a forma):
 * - DARF (SENDA/Receita): "Documento de Arrecadação" + "de Receitas Federais"; "Período de Apuração | Data de Vencimento | Número do Documento"
 *   e, abaixo, "Fevereiro/2025 | 20/03/2025 | 07.16.…"; "Valor Total do Documento" e o valor; "Nº Recibo Declaração: …"; a composição
 *   "<código 4> | <denominação…>" com o valor na linha seguinte ("<principal> | <total>", ou com multa e juros no meio).
 * - GFD: "GFD - Guia do FGTS Digital"; "Pagar este documento até" e a data; "Valor a recolher" e o valor; a composição
 *   "<mm/aaaa> | <trabalhadores> | <mensal> | <rescisório> | <indenização> | <encargos> | <total>"; "PIX Copia e Cola:" e o código
 *   (que o `montarLinhas` parte em células: junta-se com espaço e confere pelo CRC16 do próprio código).
 * - Relação de Trabalhadores (FGTS Digital, "Gestão de Guias"): página DEITADA — cada trabalhador é uma COLUNA de itens com o mesmo x
 *   (matrícula "<empresa>-<código>", competência, vencimento e os valores de cima para baixo: total, multa, atualização, juros, FGTS e,
 *   por último, a base); o estabelecimento (CAEPF) e as colunas "Total do Estabelecimento" e "Total FGTS" (a guia). Por isso lê ITENS
 *   (com posição), não linhas. Nomes e CPFs dos trabalhadores NÃO são lidos: a matrícula liga ao código do relatório analítico.
 * - Recibo da DCTFWeb: "Recibo de Entrega da Declaração … DCTFWeb"; "Período de apuração | 02/2025"; "<Tributo> | R$ <apurado> | R$ <a pagar>"
 *   e "TOTAL | R$ … | R$ …".
 */
import type { ItemDoDanfe } from '@/lib/financeiro/nfe/danfe';
import { valorDoRecibo } from './lerFolha';

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const celulas = (linha: string) => linha.split('|').map((c) => c.trim()).filter((c) => c !== '');
const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todas = (paginas: string[][]) => paginas.flat();
/** "20/03/2025" → '2025-03-20' (só data que existe) */
export function dataIso(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
/** "02/2025" → '2025-02' */
const competenciaMmAaaa = (s: string): string | null => {
  const m = s.trim().match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  return m ? `${m[2]}-${m[1]}` : null;
};
/** "Fevereiro/2025" → '2025-02' */
const competenciaPorExtenso = (s: string): string | null => {
  const m = semAcento(s).trim().match(/^([a-z]+)\/(\d{4})$/);
  const i = m ? MESES.indexOf(m[1]) : -1;
  return m && i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, '0')}` : null;
};
/** "R$ 3.085,19" → 3085.19 */
const valorComCifrao = (s: string) => valorDoRecibo(s.replace(/^R\$\s*/, ''));
/** a 1ª linha depois da que casa `re` cujo conteúdo passa em `f` (até 3 linhas adiante) */
function depois<T>(linhas: string[], re: RegExp, f: (c: string[]) => T | null): T | null {
  for (let i = 0; i < linhas.length; i++) {
    if (!re.test(semAcento(linhas[i]))) continue;
    for (let j = i + 1; j <= i + 3 && j < linhas.length; j++) {
      const v = f(celulas(linhas[j]));
      if (v !== null) return v;
    }
  }
  return null;
}

/* ═══ o DARF ═══ */
export type TipoNoDarf = 'inss_segurados' | 'inss_patronal' | 'terceiros' | 'irrf' | 'outro';
export interface ItemDoDarf { codigo: string; denominacao: string; tipo: TipoNoDarf; principal: number; total: number }
export interface DarfLido {
  /** 'AAAA-MM' */
  periodo: string;
  /** 'AAAA-MM-DD' */
  vencimento: string | null;
  numero: string | null;
  valor: number;
  /** o "Nº Recibo Declaração" (liga o DARF à DCTFWeb) */
  reciboDeclaracao: string | null;
  composicao: ItemDoDarf[];
  confere: boolean;
  naoConfere: string[];
}
export const FRASE_NAO_E_DARF = 'Não é um DARF que eu conheça.';

/** O tipo pela DENOMINAÇÃO da Receita (nunca pela posição): "CP SEGURADOS…", "CP PATRONAL…", "CP TERCEIROS…", "IRRF…". */
export function tipoNoDarf(denominacao: string): TipoNoDarf {
  const t = semAcento(denominacao);
  if (/^irrf\b/.test(t)) return 'irrf';
  /* "CP TERCEIROS - …" ou "CONTRIBUIÇÃO TERCEIROS - …" (o DARF de nov/2026 escreve por extenso) */
  const cp = /^(cp|contr|contribuicao)\b/.test(t);
  if (cp && /\bterceiros\b/.test(t)) return 'terceiros';
  if (cp && /\bsegurado/.test(t)) return 'inss_segurados';
  if (cp && /\bpatronal\b/.test(t)) return 'inss_patronal';
  return 'outro';
}

export function lerDarf(paginas: string[][]): { ok: true; darf: DarfLido } | { ok: false; frase: string } {
  const linhas = todas(paginas);
  const t = linhas.map(semAcento);
  const i0 = t.findIndex((l) => l.trim() === 'documento de arrecadacao');
  if (i0 < 0 || !/^de receitas federais$/.test((t[i0 + 1] ?? '').trim())) return { ok: false, frase: FRASE_NAO_E_DARF };
  /* período, vencimento e número: a 1ª linha "<Mês>/<aaaa> | dd/mm/aaaa | <número>" depois do cabeçalho */
  const cab = depois(linhas, /^periodo de apuracao \| data de vencimento/, (c) => {
    const p = competenciaPorExtenso(c[0] ?? '');
    return p ? { periodo: p, vencimento: dataIso(c[1] ?? ''), numero: c[2] ?? null } : null;
  });
  const valor = depois(linhas, /^valor total do documento$/, (c) => (c.length === 1 ? valorDoRecibo(c[0]) : null));
  if (!cab || valor === null) return { ok: false, frase: FRASE_NAO_E_DARF };
  const recibo = linhas.map((l) => l.match(/N[ºo°]\s*Recibo Declara[çc][ãa]o:\s*(\d+)/i)).find((m) => m)?.[1] ?? null;
  /* a composição: entre "Composição do Documento de Arrecadação" e "Totais" */
  const iIni = t.findIndex((l) => /^composicao do documento de arrecadacao/.test(l));
  const iFim = t.findIndex((l, i) => i > iIni && l.trim() === 'totais');
  const composicao: ItemDoDarf[] = [];
  const naoConfere: string[] = [];
  if (iIni >= 0 && iFim > iIni) {
    for (let i = iIni + 1; i < iFim; i++) {
      const c = celulas(linhas[i]);
      if (!/^\d{4}$/.test(c[0] ?? '')) continue;
      const v = celulas(linhas[i + 1] ?? '').map(valorDoRecibo);
      if (!v.length || v.some((x) => x === null)) { naoConfere.push(`O código ${c[0]} do DARF veio sem valor.`); continue; }
      const nums = v.filter((x): x is number => x !== null);
      const denominacao = c.slice(1).join(' ').replace(/\s+/g, ' ');
      composicao.push({ codigo: c[0], denominacao, tipo: tipoNoDarf(denominacao), principal: nums[0], total: nums[nums.length - 1] });
    }
  }
  if (!composicao.length) naoConfere.push('A composição do DARF não veio.');
  const soma = composicao.reduce((s, x) => s + centavos(x.total), 0);
  if (composicao.length && soma !== centavos(valor)) naoConfere.push(`A composição soma ${brl(reais(soma))}; o DARF diz ${brl(valor)}.`);
  return { ok: true, darf: { ...cab, valor, reciboDeclaracao: recibo, composicao, confere: naoConfere.length === 0, naoConfere } };
}

/* ═══ a GFD (guia do FGTS Digital) ═══ */
export interface GfdLida {
  /** 'AAAA-MM' */
  competencia: string;
  vencimento: string | null;
  valor: number;
  identificador: string | null;
  trabalhadores: number;
  mensal: number; rescisorio: number; indenizacao: number; encargos: number; total: number;
  /** o PIX copia e cola (só com o CRC certo); null = não veio ou não confere */
  pix: string | null;
  confere: boolean;
  naoConfere: string[];
}
export const FRASE_NAO_E_GFD = 'Não é uma guia do FGTS Digital que eu conheça.';

/** CRC16-CCITT (0x1021, início 0xFFFF) — o do BR Code do PIX: os 4 últimos caracteres, sobre tudo antes deles. */
export function crcDoPix(texto: string): string {
  let crc = 0xffff;
  for (const ch of texto) {
    crc ^= (ch.codePointAt(0) ?? 0) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export const pixConfere = (codigo: string): boolean =>
  /^000201/.test(codigo) && /6304[0-9A-F]{4}$/.test(codigo) && crcDoPix(codigo.slice(0, -4)) === codigo.slice(-4);

export function lerGfd(paginas: string[][]): { ok: true; gfd: GfdLida } | { ok: false; frase: string } {
  const linhas = todas(paginas);
  if (!linhas.some((l) => /^gfd - guia do fgts digital$/.test(semAcento(l).trim()))) return { ok: false, frase: FRASE_NAO_E_GFD };
  const vencimento = depois(linhas, /^pagar este documento ate$/, (c) => (c.length === 1 ? dataIso(c[0]) : null));
  const valor = depois(linhas, /^valor a recolher$/, (c) => (c.length === 1 ? valorDoRecibo(c[0]) : null));
  const identificador = linhas.map((l) => celulas(l)).find((c) => /^\d+$/.test(c[0] ?? '') && /^\d{16}-\d$/.test(c[1] ?? ''))?.[1] ?? null;
  const comp = linhas.map(celulas).find((c) => c.length === 7 && competenciaMmAaaa(c[0]) && /^\d+$/.test(c[1]) && c.slice(2).every((x) => valorDoRecibo(x) !== null));
  if (valor === null || !comp) return { ok: false, frase: FRASE_NAO_E_GFD };
  const [mensal, rescisorio, indenizacao, encargos, total] = comp.slice(2).map((x) => valorDoRecibo(x) ?? 0);
  /* o PIX: a linha depois de "PIX Copia e Cola:", as células juntas com espaço (o nome do recebedor tem espaços) */
  const iPix = linhas.findIndex((l) => /^pix copia e cola:?$/.test(semAcento(l).trim()));
  const bruto = iPix >= 0 ? celulas(linhas[iPix + 1] ?? '').join(' ') : '';
  const pix = bruto && pixConfere(bruto) ? bruto : null;
  const naoConfere: string[] = [];
  if (centavos(mensal) + centavos(rescisorio) + centavos(indenizacao) + centavos(encargos) !== centavos(total)) naoConfere.push('A composição da GFD não soma o total.');
  if (centavos(total) !== centavos(valor)) naoConfere.push(`A composição da GFD dá ${brl(total)}; o valor a recolher é ${brl(valor)}.`);
  if (!pix) naoConfere.push(bruto ? 'O PIX copia e cola da GFD não confere (CRC).' : 'O PIX copia e cola da GFD não veio.');
  return {
    ok: true,
    gfd: { competencia: competenciaMmAaaa(comp[0]) ?? '', vencimento, valor, identificador, trabalhadores: Number(comp[1]), mensal, rescisorio, indenizacao, encargos, total, pix,
      confere: naoConfere.length === 0, naoConfere },
  };
}

/* ═══ a Relação de Trabalhadores do FGTS (página deitada, por posição) ═══ */
export interface TrabalhadorDoFgts { matricula: string; codigo: string; base: number; fgts: number }
export interface EstabelecimentoDoFgts {
  /** o CAEPF/CNPJ do estabelecimento, só dígitos */
  caepf: string;
  trabalhadores: TrabalhadorDoFgts[];
  /** a coluna "Total do Estabelecimento" (null = não veio) */
  totalFgts: number | null;
  totalBase: number | null;
  somaFgts: number;
  somaBase: number;
  confere: boolean;
  paginas: number[];
}
export interface RelacaoFgtsLida {
  competencia: string;
  vencimento: string | null;
  /** a coluna "Total FGTS" (a guia inteira) */
  totalGuia: number | null;
  estabelecimentos: EstabelecimentoDoFgts[];
  confere: boolean;
  naoConfere: string[];
}
export const FRASE_NAO_E_RELACAO_FGTS = 'Não é uma relação de trabalhadores do FGTS que eu conheça.';

/** a mesma coluna da página deitada: o mesmo x (o pdfjs dá x/y do início do texto, que gira com a página) */
const MESMA_COLUNA = 3;
const CAEPF = /^\d{3}\.\d{3}\.\d{3}\/\d{3}-\d{2}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
const MATRICULA = /^(\d{3,6})-(\d{1,6})$/;

export function lerRelacaoFgts(paginas: ItemDoDanfe[][]): { ok: true; relacao: RelacaoFgtsLida } | { ok: false; frase: string } {
  const tem = (p: ItemDoDanfe[], re: RegExp) => p.some((i) => re.test(semAcento(i.str).trim()));
  if (!paginas.some((p) => tem(p, /^gestao de guias$/) && tem(p, /^relacao de trabalhadores$/))) return { ok: false, frase: FRASE_NAO_E_RELACAO_FGTS };
  const porCaepf = new Map<string, EstabelecimentoDoFgts>();
  let competencia: string | null = null;
  let vencimento: string | null = null;
  let totalGuia: number | null = null;
  const naoConfere: string[] = [];
  for (let p = 0; p < paginas.length; p++) {
    const itens = paginas[p];
    if (!tem(itens, /^relacao de trabalhadores$/)) continue;
    const coluna = (x: number) => itens.filter((i) => Math.abs(i.x - x) <= MESMA_COLUNA && i.str.trim() !== '');
    const valoresDe = (x: number) => coluna(x).map((i) => ({ y: i.y, v: valorDoRecibo(i.str) })).filter((i): i is { y: number; v: number } => i.v !== null)
      .sort((a, b) => b.y - a.y).map((i) => i.v);
    /* o estabelecimento: o CAEPF da coluna "Total do Estabelecimento" (o mesmo x do rótulo) */
    const rotuloEst = itens.find((i) => semAcento(i.str).trim() === 'total do estabelecimento');
    const doc = rotuloEst ? coluna(rotuloEst.x).find((i) => CAEPF.test(i.str.trim())) : undefined;
    if (!rotuloEst || !doc) return { ok: false, frase: FRASE_NAO_E_RELACAO_FGTS };
    const caepf = doc.str.replace(/\D/g, '');
    const est = porCaepf.get(caepf) ?? { caepf, trabalhadores: [], totalFgts: null, totalBase: null, somaFgts: 0, somaBase: 0, confere: false, paginas: [] };
    porCaepf.set(caepf, est);
    est.paginas.push(p + 1);
    const tot = valoresDe(rotuloEst.x);
    /* de cima para baixo: total, multa, atualização, juros, FGTS e a base por último */
    if (tot.length >= 2) { est.totalFgts = tot[0]; est.totalBase = tot[tot.length - 1]; }
    const rotuloGuia = itens.find((i) => semAcento(i.str).trim() === 'total fgts');
    const g = rotuloGuia ? valoresDe(rotuloGuia.x) : [];
    if (g.length >= 2) {
      if (totalGuia !== null && centavos(totalGuia) !== centavos(g[0])) naoConfere.push('As páginas da relação dizem totais da guia diferentes.');
      totalGuia = g[0];
    }
    for (const m of itens.filter((i) => MATRICULA.test(i.str.trim()))) {
      const col = coluna(m.x);
      const v = valoresDe(m.x);
      const mm = m.str.trim().match(MATRICULA);
      if (!mm || v.length < 2) { naoConfere.push(`A matrícula ${m.str.trim()} veio sem valores.`); continue; }
      const fgts = v[v.length - 2];
      const base = v[v.length - 1];
      if (centavos(v[0]) !== v.slice(1, -1).reduce((s, x) => s + centavos(x), 0)) naoConfere.push(`A matrícula ${mm[0]}: o total da coluna não é o FGTS mais os acréscimos.`);
      est.trabalhadores.push({ matricula: mm[0], codigo: mm[2].padStart(5, '0'), base, fgts });
      const c = col.map((i) => competenciaMmAaaa(i.str)).find((x) => x !== null);
      if (c) { if (competencia && competencia !== c) return { ok: false, frase: FRASE_NAO_E_RELACAO_FGTS }; competencia = c; }
      const d = col.map((i) => dataIso(i.str)).find((x) => x !== null);
      if (d && !vencimento) vencimento = d;
    }
  }
  const estabelecimentos = [...porCaepf.values()].map((e) => {
    const somaFgts = reais(e.trabalhadores.reduce((s, x) => s + centavos(x.fgts), 0));
    const somaBase = reais(e.trabalhadores.reduce((s, x) => s + centavos(x.base), 0));
    const confere = e.totalFgts !== null && centavos(e.totalFgts) === centavos(somaFgts);
    if (!confere) naoConfere.push(`O estabelecimento ${e.caepf}: os trabalhadores somam ${brl(somaFgts)}; o total diz ${e.totalFgts === null ? '—' : brl(e.totalFgts)}.`);
    return { ...e, somaFgts, somaBase, confere };
  });
  if (!competencia || !estabelecimentos.length || estabelecimentos.every((e) => !e.trabalhadores.length)) return { ok: false, frase: FRASE_NAO_E_RELACAO_FGTS };
  const soma = estabelecimentos.reduce((s, e) => s + centavos(e.totalFgts ?? e.somaFgts), 0);
  if (totalGuia === null) naoConfere.push('O total da guia não veio na relação.');
  else if (soma !== centavos(totalGuia)) naoConfere.push(`Os estabelecimentos somam ${brl(reais(soma))}; a guia diz ${brl(totalGuia)}.`);
  return { ok: true, relacao: { competencia, vencimento, totalGuia, estabelecimentos, confere: naoConfere.length === 0, naoConfere } };
}

/* ═══ o recibo da DCTFWeb ═══ */
export interface DctfwebLida {
  periodo: string;
  /** o saldo a pagar por tributo, com o nome da Receita ("Contribuição Previdenciária Segurados", "IRRF"…); só os diferentes de zero */
  tributos: { tributo: string; apurado: number; aPagar: number }[];
  total: number;
  confere: boolean;
  naoConfere: string[];
}
export const FRASE_NAO_E_DCTFWEB = 'Não é um recibo da DCTFWeb que eu conheça.';

export function lerDctfweb(paginas: string[][]): { ok: true; dctfweb: DctfwebLida } | { ok: false; frase: string } {
  const linhas = todas(paginas);
  if (!linhas.some((l) => /^recibo de entrega da declaracao .*dctfweb$/.test(semAcento(l).trim()))) return { ok: false, frase: FRASE_NAO_E_DCTFWEB };
  const per = linhas.map(celulas).find((c) => semAcento(c[0] ?? '') === 'periodo de apuracao');
  const periodo = per ? competenciaMmAaaa(per[1] ?? '') : null;
  const tributos: DctfwebLida['tributos'] = [];
  let total: number | null = null;
  for (const c of linhas.map(celulas)) {
    if (c.length !== 3 || !/^R\$/.test(c[1]) || !/^R\$/.test(c[2])) continue;
    const apurado = valorComCifrao(c[1]);
    const aPagar = valorComCifrao(c[2]);
    if (apurado === null || aPagar === null) continue;
    if (semAcento(c[0]) === 'total') { total = aPagar; continue; }
    if (apurado !== 0 || aPagar !== 0) tributos.push({ tributo: c[0], apurado, aPagar });
  }
  if (!periodo || total === null) return { ok: false, frase: FRASE_NAO_E_DCTFWEB };
  const soma = tributos.reduce((s, x) => s + centavos(x.aPagar), 0);
  const naoConfere = soma === centavos(total) ? [] : [`Os tributos somam ${brl(reais(soma))}; o total da DCTFWeb é ${brl(total)}.`];
  return { ok: true, dctfweb: { periodo, tributos, total, confere: naoConfere.length === 0, naoConfere } };
}
