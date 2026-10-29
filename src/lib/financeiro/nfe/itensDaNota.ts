/**
 * OS ITENS DO DOCUMENTO FISCAL — ITENS-NOTA-01 (Gabriel, 21/10/2026; mock aprovado: claude.ai/artifact/XEP27qurTx78MrDLqX9hEf). PURO.
 * Os itens sao da NOTA (do documento, pela chave), nunca da parcela: uma lista por chave, lida igual nas N parcelas e na OC.
 *
 *   XML -> `itensDoXml`: TODOS os campos do item (`det/prod` + `det/imposto` + `infAdProd` + `rastro`), o rateio que o EMITENTE fez
 *          (desconto, frete, seguro, outras ja' vem por item) e os totais (`ICMSTot`, `vTotTrib`, IBS/CBS). O XML sempre manda.
 *   PDF -> `itensDoPdf`: o que o DANFE mostra por item (codigo, descricao, NCM, CST, CFOP, unidade, qtd, unitario, total, BC/ICMS/IPI e
 *          aliquotas, lote); desconto/frete/seguro/outras so' existem no TOTAL e sao RATEADOS pelo valor do item (o ultimo leva a sobra),
 *          com a marca `rateado`.
 * LIQUIDO DO ITEM = produto - desconto + frete + seguro + outras + IPI + ST (+ FCP-ST). A soma dos liquidos fecha com o valor da nota
 * (`conferirSoma`: a prova da tela, o selo verde). Dinheiro em CENTAVOS inteiros; quantidade e unitario como texto decimal com ponto.
 * ⚠ So' le^: sem rede, sem banco, sem React.
 */
import { decodificarPeloCharsetDeclarado } from '@/lib/financeiro/parser/decodificarExtrato';
import { centavosDoTexto } from './centavos';
import type { NotaLida, ServicoDaNfse } from './tipos';

export interface ImpostoDoItem { cst?: string | null; bcCent?: number; aliquota?: string | null; valorCent?: number }

export interface ItemFiscal {
  nItem: number;
  codigo: string | null;
  ean: string | null;
  descricao: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  /** CST do ICMS (regime normal) ou CSOSN (Simples) — o que vier. */
  cst: string | null;
  csosn: string | null;
  unidade: string | null;
  quantidade: string | null;
  unitario: string | null;
  unidadeTrib: string | null;
  quantidadeTrib: string | null;
  unitarioTrib: string | null;
  produtoCent: number;
  descontoCent: number;
  freteCent: number;
  seguroCent: number;
  outrasCent: number;
  /** Desconto/frete/seguro/outras vieram do TOTAL (PDF) e foram repartidos pelo valor do item. */
  rateado: boolean;
  icms: ImpostoDoItem | null;
  icmsSt: ImpostoDoItem | null;
  fcp: ImpostoDoItem | null;
  fcpSt: ImpostoDoItem | null;
  ipi: ImpostoDoItem | null;
  pis: ImpostoDoItem | null;
  cofins: ImpostoDoItem | null;
  /** O grupo IBS/CBS da reforma (com `cClassTrib`), como veio: chaves e textos crus. */
  ibsCbs: Record<string, string> | null;
  /** Rastro (lote/validade): `[{lote, quantidade, fabricacao, validade}]`. */
  rastro: { lote: string | null; quantidade: string | null; fabricacao: string | null; validade: string | null }[];
  infoAdicional: string | null;
  liquidoCent: number;
}

export interface TotaisDaNota {
  produtosCent: number; descontoCent: number; freteCent: number; seguroCent: number; outrasCent: number;
  ipiCent: number; stCent: number; fcpStCent: number; icmsCent: number; pisCent: number; cofinsCent: number;
  notaCent: number;
  /** Lei 12.741 (`vTotTrib`): so' informacao. */
  tributosAproxCent: number | null;
  /** P174 — so' na NFS-e: o bruto, as retencoes e o liquido (Gabriel 29/10, T2: no `totais` da `nota_fiscal`, sem coluna nova).
   *  Aqui `notaCent` e' o bruto menos o desconto (a soma dos itens fecha); o lancamento nasce com `servico.liquidoCent`. */
  servico?: ServicoDaNfse | null;
}

export interface ItensLidos {
  origem: 'xml' | 'pdf';
  /** CRT do emitente: '1' Simples, '2' Simples excesso, '3' normal, '4' MEI (so' no XML). */
  regime: string | null;
  totais: TotaisDaNota;
  itens: ItemFiscal[];
}

/** O liquido do item: produto - desconto + frete + seguro + outras + IPI + ST + FCP-ST. */
export function liquidoDoItem(i: Pick<ItemFiscal, 'produtoCent' | 'descontoCent' | 'freteCent' | 'seguroCent' | 'outrasCent' | 'ipi' | 'icmsSt' | 'fcpSt'>): number {
  return i.produtoCent - i.descontoCent + i.freteCent + i.seguroCent + i.outrasCent
    + (i.ipi?.valorCent ?? 0) + (i.icmsSt?.valorCent ?? 0) + (i.fcpSt?.valorCent ?? 0);
}

/** A prova: a soma dos liquidos = o valor da nota (a diferenca, em centavos; 0 = confere). */
export function conferirSoma(l: Pick<ItensLidos, 'itens' | 'totais'>): { somaCent: number; notaCent: number; diferencaCent: number; confere: boolean } {
  const somaCent = l.itens.reduce((s, i) => s + i.liquidoCent, 0);
  const diferencaCent = somaCent - l.totais.notaCent;
  return { somaCent, notaCent: l.totais.notaCent, diferencaCent, confere: diferencaCent === 0 };
}

/** Reparte `totalCent` pelos pesos (centavos inteiros; o ultimo item com peso leva a sobra). */
export function ratear(totalCent: number, pesos: readonly number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (!totalCent || soma <= 0) return pesos.map(() => 0);
  const partes = pesos.map((p) => Math.floor((totalCent * p) / soma));
  const ultimo = pesos.map((p, i) => (p > 0 ? i : -1)).filter((i) => i >= 0).pop() ?? pesos.length - 1;
  partes[ultimo] += totalCent - partes.reduce((s, p) => s + p, 0);
  return partes;
}

/* ── XML ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function filhos(pai: Element | null, nome: string): Element[] {
  return pai ? Array.from(pai.children).filter((e) => e.localName === nome) : [];
}
const filho = (pai: Element | null, nome: string): Element | null => filhos(pai, nome)[0] ?? null;
function no(pai: Element | null, ...caminho: string[]): Element | null {
  let a = pai;
  for (const n of caminho) a = filho(a, n);
  return a;
}
function texto(pai: Element | null, ...caminho: string[]): string | null {
  const t = no(pai, ...caminho)?.textContent?.trim();
  return t ? t : null;
}
const cent = (pai: Element | null, ...caminho: string[]): number => centavosDoTexto(texto(pai, ...caminho)) ?? 0;
/** O primeiro filho de `pai` cujo nome comeca por `prefixo` (ICMS00, ICMSSN102, IPITrib, PISAliq…). */
const grupo = (pai: Element | null, prefixo: string): Element | null => (pai ? Array.from(pai.children).find((e) => e.localName.startsWith(prefixo)) ?? null : null);

function imposto(g: Element | null, bc: string, aliq: string, valor: string, cstTag = 'CST'): ImpostoDoItem | null {
  if (!g) return null;
  const temValor = texto(g, valor) != null || texto(g, bc) != null;
  const cst = texto(g, cstTag) ?? texto(g, 'CSOSN');
  if (!temValor && !cst) return null;
  return { cst, bcCent: cent(g, bc), aliquota: texto(g, aliq), valorCent: cent(g, valor) };
}

/** Le^ os itens e os totais de um XML de NF-e (os BYTES, pelo charset declarado). `null` se nao e' NF-e. */
export function itensDoXml(bytes: ArrayBuffer): ItensLidos | null {
  const xml = decodificarPeloCharsetDeclarado(bytes).replace(/^﻿/, '');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const inf = Array.from(doc.getElementsByTagNameNS('*', 'infNFe'))[0] ?? null;
  if (!inf) return null;
  const tot = no(inf, 'total', 'ICMSTot');
  const totais: TotaisDaNota = {
    produtosCent: cent(tot, 'vProd'), descontoCent: cent(tot, 'vDesc'), freteCent: cent(tot, 'vFrete'), seguroCent: cent(tot, 'vSeg'),
    outrasCent: cent(tot, 'vOutro'), ipiCent: cent(tot, 'vIPI'), stCent: cent(tot, 'vST'), fcpStCent: cent(tot, 'vFCPST'),
    icmsCent: cent(tot, 'vICMS'), pisCent: cent(tot, 'vPIS'), cofinsCent: cent(tot, 'vCOFINS'), notaCent: cent(tot, 'vNF'),
    tributosAproxCent: texto(tot, 'vTotTrib') != null ? cent(tot, 'vTotTrib') : null,
  };
  const itens: ItemFiscal[] = filhos(inf, 'det').map((d, i) => {
    const prod = filho(d, 'prod');
    const imp = filho(d, 'imposto');
    const icmsG = grupo(filho(imp, 'ICMS'), 'ICMS');
    const ipiG = filho(imp, 'IPI');
    const ipiTrib = filho(ipiG, 'IPITrib') ?? filho(ipiG, 'IPINT');
    const pisG = grupo(filho(imp, 'PIS'), 'PIS');
    const cofG = grupo(filho(imp, 'COFINS'), 'COFINS');
    const ibs = grupo(imp, 'IBSCBS') ?? filho(imp, 'IBSCBS');
    const ibsCbs: Record<string, string> | null = ibs
      ? Object.fromEntries(Array.from(ibs.getElementsByTagName('*')).filter((e) => e.children.length === 0 && e.textContent?.trim())
        .map((e) => [e.localName, e.textContent?.trim() ?? '']))
      : null;
    const base = {
      nItem: Number(d.getAttribute('nItem')) || i + 1,
      codigo: texto(prod, 'cProd'), ean: ((e) => (e && e !== 'SEM GTIN' ? e : null))(texto(prod, 'cEAN')),
      descricao: texto(prod, 'xProd') ?? '', ncm: texto(prod, 'NCM'), cest: texto(prod, 'CEST'), cfop: texto(prod, 'CFOP'),
      cst: texto(icmsG, 'CST'), csosn: texto(icmsG, 'CSOSN'),
      unidade: texto(prod, 'uCom'), quantidade: texto(prod, 'qCom'), unitario: texto(prod, 'vUnCom'),
      unidadeTrib: texto(prod, 'uTrib'), quantidadeTrib: texto(prod, 'qTrib'), unitarioTrib: texto(prod, 'vUnTrib'),
      produtoCent: cent(prod, 'vProd'), descontoCent: cent(prod, 'vDesc'), freteCent: cent(prod, 'vFrete'), seguroCent: cent(prod, 'vSeg'),
      outrasCent: cent(prod, 'vOutro'), rateado: false,
      icms: imposto(icmsG, 'vBC', 'pICMS', 'vICMS'),
      icmsSt: icmsG && (texto(icmsG, 'vICMSST') != null || texto(icmsG, 'vBCST') != null)
        ? { cst: null, bcCent: cent(icmsG, 'vBCST'), aliquota: texto(icmsG, 'pICMSST'), valorCent: cent(icmsG, 'vICMSST') } : null,
      fcp: icmsG && texto(icmsG, 'vFCP') != null ? { cst: null, bcCent: cent(icmsG, 'vBCFCP'), aliquota: texto(icmsG, 'pFCP'), valorCent: cent(icmsG, 'vFCP') } : null,
      fcpSt: icmsG && texto(icmsG, 'vFCPST') != null ? { cst: null, bcCent: cent(icmsG, 'vBCFCPST'), aliquota: texto(icmsG, 'pFCPST'), valorCent: cent(icmsG, 'vFCPST') } : null,
      ipi: imposto(ipiTrib, 'vBC', 'pIPI', 'vIPI'),
      pis: imposto(pisG, 'vBC', 'pPIS', 'vPIS'),
      cofins: imposto(cofG, 'vBC', 'pCOFINS', 'vCOFINS'),
      ibsCbs,
      rastro: filhos(prod, 'rastro').map((r) => ({ lote: texto(r, 'nLote'), quantidade: texto(r, 'qLote'), fabricacao: texto(r, 'dFab'), validade: texto(r, 'dVal') })),
      infoAdicional: texto(d, 'infAdProd'),
    };
    return { ...base, liquidoCent: liquidoDoItem(base) };
  });
  return { origem: 'xml', regime: texto(inf, 'emit', 'CRT'), totais, itens };
}

/* ── PDF ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/**
 * Os itens do DANFE (a `NotaLida` do PDF): desconto, frete, seguro e outras so' existem no TOTAL -> rateados pelo valor do item, com a
 * marca `rateado`. IPI e ST do DANFE ja' vem por item quando a coluna existe (`vIpiCent` em `fiscal`), senao rateados do total.
 */
export function itensDoPdf(nota: NotaLida, extras: { seguroCent?: number; outrasCent?: number; ipiCent?: number; stCent?: number; tributosAproxCent?: number | null } = {}): ItensLidos {
  const pesos = nota.itens.map((i) => i.valorCent);
  const desc = ratear(nota.totais.descontoCent, pesos);
  const frete = ratear(nota.totais.freteCent, pesos);
  const seguro = ratear(extras.seguroCent ?? 0, pesos);
  const outras = ratear(extras.outrasCent ?? 0, pesos);
  const temIpiPorItem = nota.itens.some((i) => (i.fiscal?.vIpiCent ?? 0) > 0);
  const ipi = temIpiPorItem ? nota.itens.map((i) => i.fiscal?.vIpiCent ?? 0) : ratear(extras.ipiCent ?? 0, pesos);
  const st = ratear(extras.stCent ?? 0, pesos);
  const algoRateado = [nota.totais.descontoCent, nota.totais.freteCent, extras.seguroCent ?? 0, extras.outrasCent ?? 0].some((v) => v > 0);
  const itens: ItemFiscal[] = nota.itens.map((i, k) => {
    const f = i.fiscal;
    const base = {
      nItem: k + 1, codigo: f?.codigo ?? null, ean: null, descricao: i.descricao, ncm: f?.ncm ?? null, cest: null, cfop: f?.cfop ?? null,
      cst: f?.cst && f.cst.length === 3 ? f.cst : null, csosn: f?.cst && f.cst.length === 4 ? f.cst : null,
      unidade: i.unidade || null, quantidade: i.quantidade || null,
      unitario: i.unitarioCent != null ? (i.unitarioCent / 100).toFixed(2) : null,
      unidadeTrib: null, quantidadeTrib: null, unitarioTrib: null,
      produtoCent: i.valorCent, descontoCent: desc[k], freteCent: frete[k], seguroCent: seguro[k], outrasCent: outras[k], rateado: algoRateado,
      icms: f && (f.bcIcmsCent || f.vIcmsCent) ? { cst: f.cst ?? null, bcCent: f.bcIcmsCent ?? 0, aliquota: f.aliqIcms ?? null, valorCent: f.vIcmsCent ?? 0 } : null,
      icmsSt: st[k] ? { cst: null, bcCent: 0, aliquota: null, valorCent: st[k] } : null, fcp: null, fcpSt: null,
      ipi: ipi[k] ? { cst: null, bcCent: 0, aliquota: f?.aliqIpi ?? null, valorCent: ipi[k] } : null,
      pis: null, cofins: null, ibsCbs: null,
      rastro: i.detalhe ? [loteDoDetalhe(i.detalhe)] : [],
      infoAdicional: i.detalhe ?? null,
    };
    return { ...base, liquidoCent: liquidoDoItem(base) };
  });
  return {
    origem: 'pdf', regime: null, itens,
    totais: {
      produtosCent: nota.totais.produtosCent, descontoCent: nota.totais.descontoCent, freteCent: nota.totais.freteCent,
      seguroCent: extras.seguroCent ?? 0, outrasCent: extras.outrasCent ?? 0, ipiCent: temIpiPorItem ? ipi.reduce((s, v) => s + v, 0) : extras.ipiCent ?? 0,
      stCent: extras.stCent ?? 0, fcpStCent: 0, icmsCent: 0, pisCent: 0, cofinsCent: 0,
      /* P174: na NFS-e o `notaCent` da nota e' o liquido (depois das retencoes); a nota guardada fecha com os itens: bruto - desconto */
      notaCent: nota.servico ? nota.servico.brutoCent - nota.totais.descontoCent : nota.totais.notaCent,
      tributosAproxCent: extras.tributosAproxCent ?? null,
      ...(nota.servico ? { servico: nota.servico } : {}),
    },
  };
}

/** "Lote: 069/24 D.Fab: 01/05/26 D.Val: 31/07/28" -> o rastro. */
export function loteDoDetalhe(t: string): ItemFiscal['rastro'][number] {
  const m = (re: RegExp) => re.exec(t)?.[1]?.trim() ?? null;
  return { lote: m(/Lote:?\s*([^\s|]+)/i), quantidade: null, fabricacao: m(/D\.?\s*Fab\.?:?\s*([\d/]+)/i), validade: m(/D\.?\s*Val\.?:?\s*([\d/]+)/i) };
}

/* ── O BANCO (formas puras: o que vai para `fn_nota_fiscal_gravar` e o que volta de `nota_fiscal`/`nota_fiscal_itens`) ─────────────── */
export interface CabecalhoDaNota {
  chave: string; origem: 'xml' | 'pdf'; numero: string | null; serie: string | null; emissao: string | null; natureza: string | null;
  regime: string | null; emitenteDocumento: string | null; emitenteNome: string | null;
}

/** O payload da RPC: o cabecalho (com os totais em centavos e o XML original) e os itens com as chaves da tabela. */
export function payloadDaNotaFiscal(nota: Pick<NotaLida, 'chave' | 'numero' | 'serie' | 'emissao' | 'naturezaOperacao' | 'emitente'>, l: ItensLidos, xmlOriginal: string | null) {
  const t = l.totais;
  return {
    nota: {
      chave_acesso: nota.chave, origem: l.origem, numero: nota.numero, serie: nota.serie, emissao: nota.emissao || null, natureza: nota.naturezaOperacao || null,
      regime: l.regime, emitente_documento: nota.emitente.documento, emitente_nome: nota.emitente.nome, xml_original: l.origem === 'xml' ? xmlOriginal : null,
      totais: {
        produtos_cent: t.produtosCent, desconto_cent: t.descontoCent, frete_cent: t.freteCent, seguro_cent: t.seguroCent, outras_cent: t.outrasCent,
        ipi_cent: t.ipiCent, st_cent: t.stCent, fcp_st_cent: t.fcpStCent, icms_cent: t.icmsCent, pis_cent: t.pisCent, cofins_cent: t.cofinsCent,
        nota_cent: t.notaCent, tributos_aprox_cent: t.tributosAproxCent,
        ...(t.servico ? { servico: servicoParaOBanco(t.servico) } : {}),
      },
    },
    itens: l.itens.map((i) => ({
      n_item: i.nItem, codigo: i.codigo, ean: i.ean, descricao: i.descricao, ncm: i.ncm, cest: i.cest, cfop: i.cfop, cst: i.cst, csosn: i.csosn,
      unidade: i.unidade, quantidade: i.quantidade, unitario: i.unitario, unidade_trib: i.unidadeTrib, quantidade_trib: i.quantidadeTrib, unitario_trib: i.unitarioTrib,
      produto_cent: i.produtoCent, desconto_cent: i.descontoCent, frete_cent: i.freteCent, seguro_cent: i.seguroCent, outras_cent: i.outrasCent, rateado: i.rateado,
      icms: i.icms, icms_st: i.icmsSt, fcp: i.fcp, fcp_st: i.fcpSt, ipi: i.ipi, pis: i.pis, cofins: i.cofins, ibs_cbs: i.ibsCbs, rastro: i.rastro,
      info_adicional: i.infoAdicional, liquido_cent: i.liquidoCent,
    })),
  };
}

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : 0);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null);
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null);
function impostoDoBanco(v: unknown): ImpostoDoItem | null {
  const o = objeto(v);
  return o ? { cst: txt(o.cst), bcCent: num(o.bcCent), aliquota: txt(o.aliquota), valorCent: num(o.valorCent) } : null;
}
function textosDoBanco(v: unknown): Record<string, string> | null {
  const o = objeto(v);
  return o ? Object.fromEntries(Object.entries(o).map(([k, x]) => [k, String(x ?? '')])) : null;
}

/** P174 — o servico da NFS-e no `totais` (jsonb) da `nota_fiscal`, nas chaves da casa (snake_case, centavos). */
function servicoParaOBanco(s: ServicoDaNfse) {
  return {
    competencia: s.competencia, codigo_tributacao: s.codigoTributacao, nbs: s.nbs, bruto_cent: s.brutoCent,
    retencoes: { iss_retido_cent: s.retencoes.issRetidoCent, irrf_cent: s.retencoes.irrfCent, previdencia_cent: s.retencoes.previdenciaCent,
      contribuicoes_sociais_cent: s.retencoes.contribuicoesSociaisCent },
    total_retido_cent: s.totalRetidoCent, liquido_cent: s.liquidoCent,
  };
}
function servicoDoBanco(v: unknown): ServicoDaNfse | null {
  const o = objeto(v);
  if (!o) return null;
  const r = objeto(o.retencoes) ?? {};
  return {
    competencia: txt(o.competencia) ?? '', codigoTributacao: txt(o.codigo_tributacao), nbs: txt(o.nbs), brutoCent: num(o.bruto_cent),
    retencoes: { issRetidoCent: num(r.iss_retido_cent), irrfCent: num(r.irrf_cent), previdenciaCent: num(r.previdencia_cent),
      contribuicoesSociaisCent: num(r.contribuicoes_sociais_cent) },
    totalRetidoCent: num(o.total_retido_cent), liquidoCent: num(o.liquido_cent),
  };
}

/** O que volta do banco -> as mesmas formas da leitura (a tela desenha igual o lido agora e o guardado). */
export function lidosDoBanco(nota: Record<string, unknown>, itens: readonly Record<string, unknown>[]): { cabecalho: CabecalhoDaNota; lidos: ItensLidos } {
  const t = objeto(nota.totais) ?? {};
  const origem = nota.origem === 'xml' ? 'xml' : 'pdf';
  return {
    cabecalho: {
      chave: txt(nota.chave_acesso) ?? '', origem, numero: txt(nota.numero), serie: txt(nota.serie), emissao: txt(nota.emissao), natureza: txt(nota.natureza),
      regime: txt(nota.regime), emitenteDocumento: txt(nota.emitente_documento), emitenteNome: txt(nota.emitente_nome),
    },
    lidos: {
      origem, regime: txt(nota.regime),
      totais: {
        produtosCent: num(t.produtos_cent), descontoCent: num(t.desconto_cent), freteCent: num(t.frete_cent), seguroCent: num(t.seguro_cent),
        outrasCent: num(t.outras_cent), ipiCent: num(t.ipi_cent), stCent: num(t.st_cent), fcpStCent: num(t.fcp_st_cent), icmsCent: num(t.icms_cent),
        pisCent: num(t.pis_cent), cofinsCent: num(t.cofins_cent), notaCent: num(t.nota_cent),
        tributosAproxCent: t.tributos_aprox_cent == null ? null : num(t.tributos_aprox_cent),
        ...((sv) => (sv ? { servico: sv } : {}))(servicoDoBanco(t.servico)),
      },
      itens: [...itens].sort((a, b) => num(a.n_item) - num(b.n_item)).map((r) => ({
        nItem: num(r.n_item), codigo: txt(r.codigo), ean: txt(r.ean), descricao: txt(r.descricao) ?? '', ncm: txt(r.ncm), cest: txt(r.cest), cfop: txt(r.cfop),
        cst: txt(r.cst), csosn: txt(r.csosn), unidade: txt(r.unidade), quantidade: txt(r.quantidade), unitario: txt(r.unitario),
        unidadeTrib: txt(r.unidade_trib), quantidadeTrib: txt(r.quantidade_trib), unitarioTrib: txt(r.unitario_trib),
        produtoCent: num(r.produto_cent), descontoCent: num(r.desconto_cent), freteCent: num(r.frete_cent), seguroCent: num(r.seguro_cent),
        outrasCent: num(r.outras_cent), rateado: r.rateado === true,
        icms: impostoDoBanco(r.icms), icmsSt: impostoDoBanco(r.icms_st), fcp: impostoDoBanco(r.fcp), fcpSt: impostoDoBanco(r.fcp_st),
        ipi: impostoDoBanco(r.ipi), pis: impostoDoBanco(r.pis), cofins: impostoDoBanco(r.cofins), ibsCbs: textosDoBanco(r.ibs_cbs),
        rastro: Array.isArray(r.rastro) ? r.rastro.map((x) => { const o = objeto(x) ?? {}; return { lote: txt(o.lote), quantidade: txt(o.quantidade), fabricacao: txt(o.fabricacao), validade: txt(o.validade) }; }) : [],
        infoAdicional: txt(r.info_adicional), liquidoCent: num(r.liquido_cent),
      })),
    },
  };
}
