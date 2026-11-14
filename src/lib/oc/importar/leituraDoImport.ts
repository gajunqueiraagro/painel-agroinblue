/**
 * IMPORTAR-ABATE-01 — a TELA de importar lê os PDFs do frigorífico (NF, acerto, romaneio) SEM OC ainda. Puro: sem banco e sem React.
 *
 *  - cada PDF é lido pelo MESMO leitor da aba Documentos (`lerPdfDoAbate`); a espécie é a que o PDF diz ser (`especieSugerida`);
 *  - o CNPJ do frigorífico sai da NF (ou do acerto) lida: é ele que libera os layouts sem CNPJ no texto (o romaneio Minerva);
 *  - os documentos do pacote são os payloads de SEMPRE (`formAbateVazio` → `aplicarLeitura` → `payloadDoFormAbate` → `payloadJson`):
 *    o que a importação grava é o que a aba Documentos gravaria com o mesmo PDF. Sem `lotes` (a `oc_importar_abate` põe os da OC).
 */
import { aplicarLeitura } from '@/lib/oc/leitura/aplicarLeitura';
import { lerPdfDoAbate, type CamposLidos, type LeituraDoAbate } from '@/lib/oc/leitura/layoutsAbate';
import { formAbateVazio, payloadDoFormAbate } from '@/lib/oc/formDocumentoAbate';
import { payloadJson, type EspecieDoc } from '@/hooks/useOperacaoDocumentos';
import { detalhesDoAcertoMinerva, detalhesDoRomaneioMinerva } from './detalhesMinerva';
import type { AcertoDaEntrada, EntradaDoPacote } from './pacoteDoAbate';
import { fazendaPeloEndereco, type FazendaComIE } from '@/lib/financeiro/nfe/proporLancamento';
import { SEPARADOR_DE_CELULA } from '@/lib/oc/leitura/montarLinhas';

export interface PdfDoImport { nome: string; linhas: string[]; temTexto: boolean }
export interface DocumentoDoImport { nome: string; linhas: string[]; especie: EspecieDoc | null; leitura: LeituraDoAbate }

const PRIMEIRA: EspecieDoc = 'nf_principal';

function lerUm(pdf: PdfDoImport, cnpj: string | null): DocumentoDoImport {
  let especie: EspecieDoc = PRIMEIRA;
  let r = lerPdfDoAbate(pdf, { especie, cnpjContraparte: cnpj });
  if (r.tipo === 'nao_lido' && r.motivo === 'especie_trocada' && r.especieSugerida) {
    especie = r.especieSugerida;
    r = lerPdfDoAbate(pdf, { especie, cnpjContraparte: cnpj });
  }
  const conhecida = r.tipo === 'lido' || (r.motivo !== 'desconhecido' && r.motivo !== 'sem_texto' && r.motivo !== 'dois_layouts');
  return { nome: pdf.nome, linhas: pdf.linhas, especie: conhecida ? especie : null, leitura: r };
}

/** Lê todos: 1ª passada sem CNPJ; com o CNPJ do frigorífico achado na NF/acerto, relê os que pediram a contraparte. */
export function lerDocumentosDoImport(pdfs: PdfDoImport[]): { documentos: DocumentoDoImport[]; cnpjFrigorifico: string | null; nomeFrigorifico: string | null } {
  const primeira = pdfs.map(p => lerUm(p, null));
  const comFrig = primeira.find(d => d.leitura.tipo === 'lido' && (d.leitura.frigorifico?.cnpj || d.leitura.campos.emitenteCnpj));
  const lido = comFrig?.leitura.tipo === 'lido' ? comFrig.leitura : null;
  const cnpj = lido ? (lido.frigorifico?.cnpj ?? lido.campos.emitenteCnpj ?? null) : null;
  const nome = lido ? (lido.frigorifico?.nome ?? lido.campos.emitenteNome ?? null) : null;
  const documentos = cnpj
    ? primeira.map((d, i) => (d.leitura.tipo === 'nao_lido' && d.leitura.motivo === 'contraparte' ? lerUm(pdfs[i], cnpj) : d))
    : primeira;
  return { documentos, cnpjFrigorifico: cnpj, nomeFrigorifico: nome };
}

const lidoDo = (docs: DocumentoDoImport[], grupo: 'nf' | 'acerto' | 'romaneio') =>
  docs.find(d => d.leitura.tipo === 'lido' && d.leitura.grupo === grupo);

/** O payload do documento como a aba Documentos o registraria (sem `lotes`; o emitente da NF = o frigorífico escolhido). */
export function payloadDoDocumentoLido(d: DocumentoDoImport, emitente: { id: string; nome: string; documento: string | null } | null): Record<string, unknown> | null {
  if (d.leitura.tipo !== 'lido' || !d.especie) return null;
  const base = formAbateVazio(d.especie, 'abate');
  const comEmitente = emitente ? { ...base, emitenteId: emitente.id, emitenteNome: emitente.nome, emitenteDocumento: emitente.documento ?? '' } : base;
  const { form } = aplicarLeitura(comEmitente, d.leitura.campos, d.leitura.dados);
  const { lotes: _lotes, ...semLotes } = payloadJson(payloadDoFormAbate(form));
  return semLotes;
}

export type FaltaNoImport = 'acerto' | 'acerto_sem_faixas';
export interface Respostas { fazendaId: string | null; contraparteId: string | null; contraparteNome: string | null; categoria: string | null; pesoVivoMedioKg: number | null;
  categoriasPorLote?: Record<number, string | null>;
  /** 117539: o peso vivo de um lote (pela ordem); sem ele, o geral */
  pesosPorLote?: Record<number, number | null> }

const camposDe = (d: DocumentoDoImport): CamposLidos | null => (d.leitura.tipo === 'lido' ? d.leitura.campos : null);
const centKg = (n: number | undefined) => (n == null ? null : Math.round(n * 100));
/** O documento (NF ou romaneio) é DESTE acerto? Pela ordem de compra quando os dois a trazem; senão pelas cabeças e kg (a NF da
    Fortunceres não traz a ordem); senão pelo bruto. */
function eDoAcerto(c: CamposLidos, a: CamposLidos): boolean {
  if (c.ordemCompra && a.ordemCompra) return c.ordemCompra === a.ordemCompra;
  if (c.cab != null && a.cab != null && c.pesoKg != null && a.pesoKg != null) return c.cab === a.cab && centKg(c.pesoKg) === centKg(a.pesoKg);
  return c.bruto != null && a.bruto != null && centKg(c.bruto) === centKg(a.bruto);
}

/** A entrada do `montarPacoteDoAbate`: o acerto é obrigatório (é ele que tem as faixas e o líquido); NF e romaneio, se vierem.
    117537 (proposta A): VÁRIOS acertos no mesmo abate (Fortunceres: um por ordem de compra) → `maisAcertos`, o de mais cabeças primeiro;
    cada NF e romaneio vai ao acerto dele (`eDoAcerto`); o que não casa com nenhum fica de todos. */
export function entradaDoImport(docs: DocumentoDoImport[], r: Respostas, cnpjFrigorifico: string | null): { entrada: EntradaDoPacote | null; falta: FaltaNoImport | null } {
  const acertos = docs.filter(d => d.leitura.tipo === 'lido' && d.leitura.grupo === 'acerto');
  if (acertos.length > 1) return entradaDeVariosAcertos(docs, acertos, r, cnpjFrigorifico);
  const acerto = lidoDo(docs, 'acerto');
  if (!acerto || acerto.leitura.tipo !== 'lido') return { entrada: null, falta: 'acerto' };
  const detalhes = detalhesDoAcertoMinerva(acerto.linhas);
  if (!detalhes || detalhes.faixas.length === 0) return { entrada: null, falta: 'acerto_sem_faixas' };
  const nf = lidoDo(docs, 'nf');
  const rom = lidoDo(docs, 'romaneio');
  const camposNf: CamposLidos | null = nf && nf.leitura.tipo === 'lido' ? nf.leitura.campos : null;
  const emitente = r.contraparteId ? { id: r.contraparteId, nome: r.contraparteNome ?? '', documento: cnpjFrigorifico } : null;
  const documentos = docs.map(d => payloadDoDocumentoLido(d, emitente)).filter((p): p is Record<string, unknown> => p != null);
  return {
    entrada: {
      nf: camposNf, acerto: acerto.leitura.campos, detalhes, romaneio: rom ? detalhesDoRomaneioMinerva(rom.linhas) : null, documentos,
      fazendaId: r.fazendaId, contraparteId: r.contraparteId, categoria: r.categoria, pesoVivoMedioKg: r.pesoVivoMedioKg,
      categoriasPorLote: r.categoriasPorLote, pesosPorLote: r.pesosPorLote,
    },
    falta: null,
  };
}

function entradaDeVariosAcertos(docs: DocumentoDoImport[], acertos: DocumentoDoImport[], r: Respostas, cnpjFrigorifico: string | null): { entrada: EntradaDoPacote | null; falta: FaltaNoImport | null } {
  const grupos: (AcertoDaEntrada & { doc: DocumentoDoImport })[] = [];
  for (const a of acertos) {
    const campos = camposDe(a);
    const detalhes = detalhesDoAcertoMinerva(a.linhas);
    if (!campos) return { entrada: null, falta: 'acerto' };
    if (!detalhes || detalhes.faixas.length === 0) return { entrada: null, falta: 'acerto_sem_faixas' };
    grupos.push({ doc: a, acerto: campos, detalhes, nf: null, romaneio: null });
  }
  grupos.sort((x, y) => (y.acerto.cab ?? 0) - (x.acerto.cab ?? 0) || (x.acerto.ordemCompra ?? '').localeCompare(y.acerto.ordemCompra ?? ''));
  const grupoDe = (d: DocumentoDoImport): number | null => {
    if (d.leitura.tipo !== 'lido') return null;
    const i = grupos.findIndex(g => g.doc === d);
    if (i >= 0) return i;
    if (d.leitura.grupo !== 'nf' && d.leitura.grupo !== 'romaneio') return null;
    const c = d.leitura.campos;
    const k = grupos.findIndex(g => eDoAcerto(c, g.acerto));
    return k >= 0 ? k : null;
  };
  for (const d of docs) {
    const k = grupoDe(d);
    if (k == null || d.leitura.tipo !== 'lido') continue;
    if (d.leitura.grupo === 'nf' && !grupos[k].nf) grupos[k].nf = d.leitura.campos;
    if (d.leitura.grupo === 'romaneio' && !grupos[k].romaneio) grupos[k].romaneio = detalhesDoRomaneioMinerva(d.linhas);
  }
  const emitente = r.contraparteId ? { id: r.contraparteId, nome: r.contraparteNome ?? '', documento: cnpjFrigorifico } : null;
  const documentos: Record<string, unknown>[] = [];
  const acertoDoDocumento: (number | null)[] = [];
  for (const d of docs) {
    const p = payloadDoDocumentoLido(d, emitente);
    if (!p) continue;
    documentos.push(p);
    acertoDoDocumento.push(grupoDe(d));
  }
  const [g0, ...resto] = grupos.map(({ doc: _doc, ...g }) => g);
  return {
    entrada: {
      ...g0, documentos, acertoDoDocumento, maisAcertos: resto,
      fazendaId: r.fazendaId, contraparteId: r.contraparteId, categoria: r.categoria, pesoVivoMedioKg: r.pesoVivoMedioKg,
      categoriasPorLote: r.categoriasPorLote, pesosPorLote: r.pesosPorLote,
    },
    falta: null,
  };
}

/* ── A FAZENDA PELA NF DO FRIGORÍFICO (Chat 12/11 17:15, ajuste 4) ─────────────────────────────────────────────────────────────── */
export interface RemetenteDaNf { nome: string | null; ie: string | null; endereco: string | null }
const celulasDa = (l: string) => l.split(SEPARADOR_DE_CELULA).map(c => c.trim());
/** No DANFE de entrada do frigorífico o PRODUTOR é o remetente: o quadro "DESTINATÁRIO / REMETENTE" traz nome, endereço e IE.
    Lido pelo rótulo da coluna na linha de cabeçalho e o valor na MESMA coluna da linha de baixo (a regra das células do leitor). */
export function remetenteDaNfFrigorifico(linhas: readonly string[]): RemetenteDaNf {
  const i0 = linhas.findIndex(l => /DESTINAT[ÁA]RIO\s*\/\s*REMETENTE/i.test(l));
  if (i0 < 0) return { nome: null, ie: null, endereco: null };
  const valor = (rotulo: RegExp): string | null => {
    for (let i = i0 + 1; i < Math.min(linhas.length - 1, i0 + 10); i++) {
      const cab = celulasDa(linhas[i]);
      const k = cab.findIndex(c => rotulo.test(c));
      if (k >= 0) { const v = celulasDa(linhas[i + 1])[k]; return v && v !== '' ? v : null; }
    }
    return null;
  };
  return { nome: valor(/^NOME\s*\/\s*RAZ/i), ie: valor(/^INSCRI[ÇC][ÃA]O ESTADUAL$/i), endereco: valor(/^ENDERE[ÇC]O$/i) };
}

export interface FazendaSugerida { fazenda: FazendaComIE; pela: 'ie' | 'endereco' }
/** A fazenda do cadastro pela IE do remetente (`fazenda_cadastros.ie`); sem IE que case, pelo nome no endereço — só quando é UMA. */
export function fazendaPelaNf(r: RemetenteDaNf, fazendas: readonly FazendaComIE[]): FazendaSugerida | null {
  const ie = (r.ie ?? '').replace(/\D/g, '');
  if (ie) {
    const pelaIe = fazendas.filter(f => (f.ie ?? '').replace(/\D/g, '') === ie);
    if (pelaIe.length === 1) return { fazenda: pelaIe[0], pela: 'ie' };
  }
  const pelaEnd = fazendaPeloEndereco(r.endereco, fazendas);
  return pelaEnd ? { fazenda: pelaEnd, pela: 'endereco' } : null;
}

/* ── O PDF NO DOCUMENTO CERTO (117537) ─────────────────────────────────────────────────────────────────────────────────────────────
   Depois de criar, cada PDF sobe no documento registrado DELE. Com 2 acertos e 2 romaneios a espécie não basta (e a lista do banco não
   vem em ordem): casa pela espécie + número + cabeças + kg do que foi lido; sem nada disso, o 1º livre da espécie. */
export interface MarcaDoPdf { especie: string; numero: string | null; cab: number | null; pesoKg: number | null }
export function marcaDoPdf(d: DocumentoDoImport): MarcaDoPdf | null {
  if (!d.especie) return null;
  const c = d.leitura.tipo === 'lido' ? d.leitura.campos : null;
  return { especie: d.especie, numero: c?.numero ?? null, cab: c?.cab ?? null, pesoKg: c?.pesoKg ?? null };
}
export function documentoDoPdf<T extends { documentoId: string; especie: string; numero: string | null; cab?: number | null; pesoKg?: number | null; cancelado: boolean }>(
  m: MarcaDoPdf, docs: readonly T[], usados: ReadonlySet<string>): T | null {
  const livres = docs.filter(d => d.especie === m.especie && !d.cancelado && !usados.has(d.documentoId));
  const casa = (d: T) => (m.numero == null || d.numero === m.numero) && (m.cab == null || d.cab === m.cab)
    && (m.pesoKg == null || (d.pesoKg != null && Math.round(d.pesoKg * 100) === Math.round(m.pesoKg * 100)));
  return livres.find(casa) ?? livres[0] ?? null;
}
