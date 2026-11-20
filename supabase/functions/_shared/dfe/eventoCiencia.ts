/**
 * NOTAS-RECEITA · CIÊNCIA DA OPERAÇÃO (evento 210210) — FASE 0 18/11 09:14, desenho da Lambda v2 aprovado pelo Gabriel.
 * SEM rede: monta o `envEvento` 1.00 (NFeRecepcaoEvento4, Ambiente Nacional, cOrgao 91), ASSINA o `infEvento` (XMLDSig enveloped,
 * C14N inclusiva, RSA-SHA1 / SHA-1 — o padrão da NF-e) com o par PEM que a borda já abre, e lê o `retEnvEvento`.
 * ⚠ SÓ o 210210: Confirmação (210200), Desconhecimento (210220) e Não realizada (210240) NÃO se montam aqui (e a Lambda também recusa).
 * ⚠ A forma canônica é escrita à mão porque o XML é NOSSO e fixo: sem espaço, sem comentário, atributos na ordem da C14N, só ASCII nos
 *    textos (dígitos, data e "Ciencia da Operacao"). O `infEvento` herda o xmlns da NF-e do `envEvento`: na C14N ele aparece no topo.
 * Roda igual no Deno (borda) e no Node (vitest).
 */
import forge from 'node-forge';
import type { Ambiente } from './distribuicaoDfe.ts';
import { bloco } from './distribuicaoDfe.ts';

export const URL_EVENTO = {
  producao: 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
} as const;
export const ACAO_SOAP_EVENTO = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento';
export const TP_CIENCIA = '210210';
export const DESC_CIENCIA = 'Ciencia da Operacao';
const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';
const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const ALG_C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

/** dhEvento no horário de Brasília (UTC−3, sem horário de verão desde 2019): AAAA-MM-DDThh:mm:ss-03:00 */
export function dhEventoBrasilia(agora: Date): string {
  const b = new Date(agora.getTime() - 3 * 3_600_000);
  const d2 = (n: number) => String(n).padStart(2, '0');
  return `${b.getUTCFullYear()}-${d2(b.getUTCMonth() + 1)}-${d2(b.getUTCDate())}T${d2(b.getUTCHours())}:${d2(b.getUTCMinutes())}:${d2(b.getUTCSeconds())}-03:00`;
}

/** o miolo do infEvento (o mesmo texto no documento e na forma canônica) */
function mioloDoInfEvento(p: { ambiente: Ambiente; documento: string; chave: string; dhEvento: string }): string {
  const tag = p.documento.length === 11 ? 'CPF' : 'CNPJ';
  return `<cOrgao>91</cOrgao><tpAmb>${p.ambiente === 'producao' ? 1 : 2}</tpAmb><${tag}>${p.documento}</${tag}><chNFe>${p.chave}</chNFe>`
    + `<dhEvento>${p.dhEvento}</dhEvento><tpEvento>${TP_CIENCIA}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>`
    + `<detEvento versao="1.00"><descEvento>${DESC_CIENCIA}</descEvento></detEvento>`;
}

const b64 = (bytes: string) => forge.util.encode64(bytes);
/** o certificado da FOLHA (o 1º do PEM; o par da borda traz a folha e as intermediárias) em base64 do DER, numa linha */
export function folhaEmBase64(certPem: string): string {
  const m = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(certPem);
  if (!m) throw new Error('certificado ausente no par');
  return m[1].replace(/\s+/g, '');
}

/**
 * O envelope SOAP 1.2 do evento 210210, assinado. `idLote` = até 15 dígitos (o da borda: o tempo em ms, único por titular na prática).
 * Devolve também o Id e o DigestValue (para o teste e a trilha).
 */
export function envelopeCiencia(p: {
  ambiente: Ambiente; documento: string; chave: string; agora: Date; idLote: string; par: { cert: string; key: string };
}): { envelope: string; id: string; digest: string } {
  const doc = p.documento.replace(/\D/g, '');
  if (doc.length !== 11 && doc.length !== 14) throw new Error('O titular precisa de CPF (11) ou CNPJ (14).');
  if (!/^\d{44}$/.test(p.chave)) throw new Error('A chave da NF-e tem 44 dígitos.');
  if (!/^\d{1,15}$/.test(p.idLote)) throw new Error('idLote fora do formato.');
  const id = `ID${TP_CIENCIA}${p.chave}01`;
  const miolo = mioloDoInfEvento({ ambiente: p.ambiente, documento: doc, chave: p.chave, dhEvento: dhEventoBrasilia(p.agora) });

  /* 1. o digest do infEvento na forma canônica (o xmlns herdado vem antes do Id: namespace primeiro, depois atributos) */
  const canonInf = `<infEvento xmlns="${NS_NFE}" Id="${id}">${miolo}</infEvento>`;
  const md = forge.md.sha1.create(); md.update(canonInf, 'utf8');
  const digest = b64(md.digest().getBytes());

  /* 2. o SignedInfo (o mesmo miolo no documento e na forma canônica, com o xmlns do dsig no topo) */
  const mioloSi = `<CanonicalizationMethod Algorithm="${ALG_C14N}"></CanonicalizationMethod>`
    + `<SignatureMethod Algorithm="${NS_DSIG}rsa-sha1"></SignatureMethod>`
    + `<Reference URI="#${id}"><Transforms><Transform Algorithm="${NS_DSIG}enveloped-signature"></Transform>`
    + `<Transform Algorithm="${ALG_C14N}"></Transform></Transforms>`
    + `<DigestMethod Algorithm="${NS_DSIG}sha1"></DigestMethod><DigestValue>${digest}</DigestValue></Reference>`;
  const canonSi = `<SignedInfo xmlns="${NS_DSIG}">${mioloSi}</SignedInfo>`;
  const chave = forge.pki.privateKeyFromPem(p.par.key);
  const mdSi = forge.md.sha1.create(); mdSi.update(canonSi, 'utf8');
  const assinatura = b64(chave.sign(mdSi));

  const evento = `<evento versao="1.00"><infEvento Id="${id}">${miolo}</infEvento>`
    + `<Signature xmlns="${NS_DSIG}"><SignedInfo>${mioloSi}</SignedInfo><SignatureValue>${assinatura}</SignatureValue>`
    + `<KeyInfo><X509Data><X509Certificate>${folhaEmBase64(p.par.cert)}</X509Certificate></X509Data></KeyInfo></Signature></evento>`;
  const envelope = '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
    + 'xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>'
    + '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">'
    + `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${p.idLote}</idLote>${evento}</envEvento>`
    + '</nfeDadosMsg></soap12:Body></soap12:Envelope>';
  return { envelope, id, digest };
}

/** o retEnvEvento: o cStat do LOTE (128 = processado) e o do EVENTO (135 = registrado e vinculado; 573 = duplicidade; o resto é recusa) */
export interface RetornoDoEvento {
  cStatLote: string | null; xMotivoLote: string | null;
  cStat: string | null; xMotivo: string | null; nProt: string | null; dhRegEvento: string | null;
}
export function lerRetornoEvento(xml: string): RetornoDoEvento {
  const ret = bloco(xml, 'retEnvEvento');
  if (ret === null) throw new Error('retEnvEvento ausente na resposta');
  const t = (x: string | null, n: string) => (x === null ? null : bloco(x, n));
  /* o cStat/xMotivo do lote vêm ANTES do 1º retEvento */
  const antes = ret.split(/<(?:[\w.-]+:)?retEvento[\s>]/)[0];
  const inf = t(ret, 'infEvento');
  return {
    cStatLote: bloco(antes, 'cStat'), xMotivoLote: bloco(antes, 'xMotivo'),
    cStat: t(inf, 'cStat'), xMotivo: t(inf, 'xMotivo'), nProt: t(inf, 'nProt'), dhRegEvento: t(inf, 'dhRegEvento'),
  };
}
/** a ciência ficou na Receita: registrada agora (135) ou já estava (573) */
export const comCiencia = (cStat: string | null) => cStat === '135' || cStat === '573';
