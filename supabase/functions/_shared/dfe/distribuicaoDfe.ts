/**
 * NOTAS-RECEITA-A1-01 · F3.0 — a conversa com a Distribuição DF-e da SEFAZ (NFeDistribuicaoDFe, NT 2014.002), SEM rede e SEM certificado:
 *  · `envelopeDistDFe`: o SOAP 1.2 do pedido (distNSU · consNSU · consChNFe), por CPF ou CNPJ do titular;
 *  · `lerRetornoDistDFe`: o retDistDFeInt (cStat, xMotivo, ultNSU, maxNSU e os docZip);
 *  · `abrirDocZip`: base64 + gzip → o XML do documento;
 *  · `lerDocumento`: resNFe / procNFe → a linha da caixa de entrada (`fiscal_dfe_recebidos`); resEvento / procEventoNFe → o evento
 *    (cancelamento 110111 marca a chave como cancelada na SEFAZ).
 * Roda igual no Deno (borda) e no Node (vitest): só `atob` e `DecompressionStream`. Nada de float em dinheiro: vNF vira centavos pelo texto.
 */

export const URL_DIST_DFE = {
  producao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
} as const;
export const ACAO_SOAP_DIST_DFE = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse';
export const CONTENT_TYPE_DIST_DFE = `application/soap+xml; charset=utf-8; action="${ACAO_SOAP_DIST_DFE}"`;

export type Ambiente = 'producao' | 'homologacao';
export type PedidoDistDFe =
  | { tipo: 'distNSU'; ultNsu: bigint | number }
  | { tipo: 'consNSU'; nsu: bigint | number }
  | { tipo: 'consChNFe'; chave: string };

const so = (s: string) => s.replace(/\D/g, '');
export const nsu15 = (n: bigint | number): string => {
  const t = BigInt(n).toString();
  if (BigInt(n) < 0n || t.length > 15) throw new Error('NSU fora da faixa (0 a 15 dígitos).');
  return t.padStart(15, '0');
};

/** o pedido inteiro (SOAP 1.2). `uf` = código IBGE do autor (MS = 50). Documento com 11 dígitos = CPF; 14 = CNPJ. */
export function envelopeDistDFe(p: { ambiente: Ambiente; uf: number; documento: string; pedido: PedidoDistDFe }): string {
  const doc = so(p.documento);
  if (doc.length !== 11 && doc.length !== 14) throw new Error('O titular precisa de CPF (11) ou CNPJ (14).');
  if (!Number.isInteger(p.uf) || p.uf < 11 || p.uf > 53) throw new Error('UF do autor inválida.');
  let corpo: string;
  if (p.pedido.tipo === 'distNSU') corpo = `<distNSU><ultNSU>${nsu15(p.pedido.ultNsu)}</ultNSU></distNSU>`;
  else if (p.pedido.tipo === 'consNSU') corpo = `<consNSU><NSU>${nsu15(p.pedido.nsu)}</NSU></consNSU>`;
  else {
    if (!/^\d{44}$/.test(p.pedido.chave)) throw new Error('A chave da NF-e tem 44 dígitos.');
    corpo = `<consChNFe><chNFe>${p.pedido.chave}</chNFe></consChNFe>`;
  }
  const tag = doc.length === 11 ? 'CPF' : 'CNPJ';
  const dist = `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${p.ambiente === 'producao' ? 1 : 2}</tpAmb>`
    + `<cUFAutor>${p.uf}</cUFAutor><${tag}>${doc}</${tag}>${corpo}</distDFeInt>`;
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
    + 'xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>'
    + '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">'
    + `<nfeDadosMsg>${dist}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}

/* ---------- leitura de XML (o esquema da SEFAZ é fixo: tags sem repetição ambígua dentro do bloco lido) ---------- */
const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTIDADES[e] ?? _)
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
/** o 1º bloco <nome …>…</nome> (com ou sem prefixo de namespace); null se não há */
export function bloco(xml: string, nome: string): string | null {
  const m = new RegExp(`<(?:[\\w.-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${nome}>`).exec(xml);
  return m ? m[1] : null;
}
const texto = (xml: string | null, nome: string): string | null => {
  if (xml === null) return null;
  const b = bloco(xml, nome);
  return b === null ? null : desescapar(b.trim());
};
const atributo = (abertura: string, nome: string): string | null => {
  const m = new RegExp(`\\s${nome}="([^"]*)"`).exec(abertura);
  return m ? desescapar(m[1]) : null;
};

export interface DocZip { nsu: bigint; esquema: string; base64: string }
export interface RetornoDistDFe {
  cStat: string; xMotivo: string; ultNsu: bigint | null; maxNsu: bigint | null; dhResp: string | null; docs: DocZip[];
}
/** o retorno da SEFAZ (o envelope inteiro ou só o retDistDFeInt). Retorno sem retDistDFeInt (SOAP Fault, HTML do IIS) = erro. */
export function lerRetornoDistDFe(xml: string): RetornoDistDFe {
  const ret = bloco(xml, 'retDistDFeInt');
  if (ret === null) {
    const falha = texto(xml, 'Text') ?? texto(xml, 'faultstring') ?? texto(xml, 'title');
    throw new Error(`A SEFAZ não devolveu o retorno da distribuição${falha ? `: ${falha.slice(0, 160)}` : '.'}`);
  }
  const cStat = texto(ret, 'cStat');
  if (!cStat) throw new Error('Retorno da distribuição sem cStat.');
  const n = (s: string | null) => (s && /^\d{1,15}$/.test(s) ? BigInt(s) : null);
  const docs: DocZip[] = [];
  for (const m of ret.matchAll(/<(?:[\w.-]+:)?docZip(\s[^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?docZip>/g)) {
    const nsu = n(atributo(m[1], 'NSU')); const esquema = atributo(m[1], 'schema');
    if (nsu === null || !esquema) throw new Error('docZip sem NSU ou sem schema.');
    docs.push({ nsu, esquema, base64: m[2].replace(/\s+/g, '') });
  }
  return { cStat, xMotivo: texto(ret, 'xMotivo') ?? '', ultNsu: n(texto(ret, 'ultNSU')), maxNsu: n(texto(ret, 'maxNSU')),
    dhResp: texto(ret, 'dhResp'), docs };
}

/** base64 + gzip → o XML (UTF-8) */
export async function abrirDocZip(base64: string): Promise<string> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const corpo = new Response(bytes).body;
  if (!corpo) throw new Error('docZip vazio.');
  const fluxo = corpo.pipeThrough(new DecompressionStream('gzip'));
  return await new Response(fluxo).text();
}

/* ---------- o documento → a caixa de entrada ---------- */
export type SituacaoNaCaixa = 'resumo' | 'xml' | 'cancelado_na_sefaz';
export interface LinhaDaCaixa {
  tipo: 'nfe'; chave: string; nsu: bigint; esquema: string; situacao: SituacaoNaCaixa;
  emitente_documento: string | null; emitente_nome: string | null; emissao: string | null; valor_cent: number | null;
  resumo: Record<string, string | null>; xml: string | null;
}
export interface EventoDaCaixa { chave: string; nsu: bigint; esquema: string; tpEvento: string; descricao: string | null; em: string | null }
export type DocumentoLido = { tipo: 'nota'; linha: LinhaDaCaixa } | { tipo: 'evento'; evento: EventoDaCaixa } | { tipo: 'outro'; esquema: string };

export const EVENTO_CANCELAMENTO = '110111';
/** "1234.5" → 123450 (sem float); texto torto → null */
export function centavos(v: string | null): number | null {
  if (v === null || !/^\d{1,13}(\.\d{1,2})?$/.test(v)) return null;
  const [i, d = ''] = v.split('.');
  return Number(i) * 100 + Number(d.padEnd(2, '0'));
}
const dataDe = (dh: string | null) => (dh && /^\d{4}-\d{2}-\d{2}/.test(dh) ? dh.slice(0, 10) : null);
const documentoDe = (xml: string | null) => texto(xml, 'CNPJ') ?? texto(xml, 'CPF');

export function lerDocumento(doc: { nsu: bigint; esquema: string }, xml: string): DocumentoLido {
  const esquema = doc.esquema;
  if (esquema.startsWith('resNFe')) {
    const r = bloco(xml, 'resNFe');
    const chave = texto(r, 'chNFe');
    if (!r || !chave || !/^\d{44}$/.test(chave)) throw new Error(`resNFe sem chave válida (NSU ${doc.nsu}).`);
    const cSit = texto(r, 'cSitNFe');
    const resumo = { cSitNFe: cSit, tpNF: texto(r, 'tpNF'), IE: texto(r, 'IE'), dhEmi: texto(r, 'dhEmi'), vNF: texto(r, 'vNF'),
      nProt: texto(r, 'nProt'), dhRecbto: texto(r, 'dhRecbto'), digVal: texto(r, 'digVal') };
    return { tipo: 'nota', linha: { tipo: 'nfe', chave, nsu: doc.nsu, esquema, situacao: cSit === '3' ? 'cancelado_na_sefaz' : 'resumo',
      emitente_documento: documentoDe(r), emitente_nome: texto(r, 'xNome'), emissao: dataDe(resumo.dhEmi), valor_cent: centavos(resumo.vNF),
      resumo, xml: null } };
  }
  if (esquema.startsWith('procNFe')) {
    const inf = /<(?:[\w.-]+:)?infNFe(\s[^>]*)>/.exec(xml);
    const idChave = inf ? atributo(inf[1], 'Id')?.replace(/^NFe/, '') ?? null : null;
    const prot = bloco(xml, 'infProt');
    const chave = texto(prot, 'chNFe') ?? idChave;
    if (!chave || !/^\d{44}$/.test(chave)) throw new Error(`procNFe sem chave válida (NSU ${doc.nsu}).`);
    const emit = bloco(xml, 'emit'); const ide = bloco(xml, 'ide'); const tot = bloco(xml, 'ICMSTot');
    const dhEmi = texto(ide, 'dhEmi') ?? texto(ide, 'dEmi');
    const resumo = { tpNF: texto(ide, 'tpNF'), nNF: texto(ide, 'nNF'), serie: texto(ide, 'serie'), dhEmi, vNF: texto(tot, 'vNF'),
      cStatProt: texto(prot, 'cStat'), nProt: texto(prot, 'nProt') };
    return { tipo: 'nota', linha: { tipo: 'nfe', chave, nsu: doc.nsu, esquema, situacao: 'xml', emitente_documento: documentoDe(emit),
      emitente_nome: texto(emit, 'xNome'), emissao: dataDe(dhEmi), valor_cent: centavos(resumo.vNF), resumo, xml } };
  }
  if (esquema.startsWith('resEvento') || esquema.startsWith('procEventoNFe')) {
    const ev = bloco(xml, 'resEvento') ?? bloco(xml, 'infEvento');
    const chave = texto(ev, 'chNFe'); const tp = texto(ev, 'tpEvento');
    if (!chave || !/^\d{44}$/.test(chave) || !tp) throw new Error(`evento sem chave ou tipo (NSU ${doc.nsu}).`);
    return { tipo: 'evento', evento: { chave, nsu: doc.nsu, esquema, tpEvento: tp, descricao: texto(ev, 'xEvento') ?? texto(ev, 'descEvento'),
      em: texto(ev, 'dhEvento') } };
  }
  return { tipo: 'outro', esquema };
}

/** a frase de cada cStat que a busca trata; os outros mostram o código e o motivo da SEFAZ */
export const FRASE_DO_CSTAT: Record<string, string> = {
  '137': 'Nenhum documento novo na Receita. A próxima busca pode ser daqui a 1 hora.',
  '138': 'Documentos encontrados.',
  '656': 'A Receita bloqueou as buscas deste CPF/CNPJ por 1 hora (consumo indevido). Esperando.',
  '472': 'O certificado é de outro CPF: a busca precisa do certificado do próprio produtor.',
  '593': 'O certificado é de outro CNPJ: a busca precisa do certificado da própria empresa.',
  '632': 'Essa nota tem mais de 90 dias: a Receita não entrega mais por este serviço.',
  '640': 'Este CPF/CNPJ não aparece nessa nota.',
  '217': 'A nota não consta na Receita.',
};
