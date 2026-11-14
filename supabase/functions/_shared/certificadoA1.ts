/**
 * NOTAS-RECEITA-A1-01 · F2 (desenho de segurança aprovado pelo Gabriel 13/11; Chat 10:45) — o LEITOR do certificado A1. Puro: recebe os
 * bytes do arquivo e a senha, devolve SÓ metadados (documento, nome, emissor, série, validade, impressão digital) ou a RECUSA com a frase.
 * Roda na função de borda (`fiscal-certificado-subir`) e nos testes; a TELA nunca o chama (o navegador não lê o certificado).
 *
 *  · SÓ A1: aceita só PKCS#12 (.pfx/.p12) que abre com a senha E traz a chave privada. Certificado público solto (.cer/.crt/.pem/.p7b, o
 *    que se exporta de um cartão ou token) ou PKCS#12 sem chave = `nao_a1`, com a frase que explica que A3 não serve aqui.
 *  · O DOCUMENTO sai do certificado (ICP-Brasil): e-CPF no otherName 2.16.76.1.3.1 do SubjectAltName (nascimento ddmmaaaa + CPF), e-CNPJ no
 *    2.16.76.1.3.3; sem eles, o final do CN ("NOME:12345678901"). Tem de ser o do TITULAR (o erro que a SEFAZ daria — 472/593 — só que antes).
 *  · Vencido ou ainda não válido = recusa. Emissor fora da ICP-Brasil = AVISO (a cadeia de homologação passa), nunca recusa calada.
 *  · ⚠ Nunca devolve a chave, a senha nem os bytes; a impressão digital é o SHA-256 do certificado PÚBLICO (DER), em hex.
 */
import forge from 'node-forge';

export type RecusaDoCertificado = 'arquivo_ilegivel' | 'nao_a1' | 'senha' | 'sem_documento' | 'documento_diferente' | 'vencido' | 'ainda_nao_vale';

export interface CertificadoLido {
  documento: string;
  tipo: 'e-CPF' | 'e-CNPJ';
  nome: string | null;
  emissor: string | null;
  numeroSerie: string;
  validoDe: Date;
  validoAte: Date;
  impressaoDigital: string;
  icpBrasil: boolean;
}

export type ResultadoDoCertificado =
  | { ok: true; certificado: CertificadoLido; avisos: string[] }
  | { ok: false; recusa: RecusaDoCertificado; frase: string };

export const FRASE_A3_NAO_SERVE = 'Certificado em cartão ou token (A3) não funciona aqui: é preciso um A1 (arquivo .pfx ou .p12).';
export const FRASES_DA_RECUSA: Record<RecusaDoCertificado, string> = {
  arquivo_ilegivel: `Não consegui ler este arquivo como certificado. ${FRASE_A3_NAO_SERVE}`,
  nao_a1: `Este arquivo não é um certificado A1: não traz a chave. ${FRASE_A3_NAO_SERVE}`,
  senha: 'A senha não abre este certificado. Confira a senha e tente de novo.',
  sem_documento: 'O certificado não traz CPF nem CNPJ (não é um e-CPF/e-CNPJ da ICP-Brasil).',
  documento_diferente: 'O certificado é de outro CPF/CNPJ, não deste produtor.',
  vencido: 'O certificado está vencido.',
  ainda_nao_vale: 'O certificado ainda não começou a valer.',
};

const OID_E_CPF = '2.16.76.1.3.1';
const OID_E_CNPJ = '2.16.76.1.3.3';
const recusa = (r: RecusaDoCertificado, extra?: string): ResultadoDoCertificado =>
  ({ ok: false, recusa: r, frase: extra ? `${FRASES_DA_RECUSA[r]} ${extra}` : FRASES_DA_RECUSA[r] });
const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const dataBR = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

function bytesParaBinario(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
}

function atributo(attrs: forge.pki.CertificateField[], nome: string): string | null {
  const a = attrs.find((x) => x.shortName === nome || x.name === nome);
  return typeof a?.value === 'string' ? a.value : null;
}

/** os otherName da ICP-Brasil no SubjectAltName (o forge não decodifica o otherName). O valor da extensão vem em bytes (OCTET STRING):
 *  decodifica e anda: SEQUENCE { OID, [0] { texto } } */
function documentoNoSan(cert: forge.pki.Certificate): { documento: string; tipo: 'e-CPF' | 'e-CNPJ' } | null {
  const ext: unknown = cert.getExtension('subjectAltName');
  const valor = ext && typeof ext === 'object' && 'value' in ext && typeof ext.value === 'string' ? ext.value : null;
  if (!valor) return null;
  let certAsn1: forge.asn1.Asn1;
  try { certAsn1 = forge.asn1.fromDer(valor); } catch { return null; }
  let achado: { documento: string; tipo: 'e-CPF' | 'e-CNPJ' } | null = null;
  const texto = (n: forge.asn1.Asn1): string => (typeof n.value === 'string' ? n.value : n.value.map(texto).join(''));
  const andar = (n: forge.asn1.Asn1) => {
    if (achado || typeof n.value === 'string') return;
    const [primeiro, segundo] = n.value;
    if (primeiro && segundo && primeiro.type === forge.asn1.Type.OID && typeof primeiro.value === 'string') {
      const oid = forge.asn1.derToOid(primeiro.value);
      const digitos = soDigitos(texto(segundo));
      if (oid === OID_E_CPF && digitos.length >= 19) { achado = { documento: digitos.slice(8, 19), tipo: 'e-CPF' }; return; }
      if (oid === OID_E_CNPJ && digitos.length >= 14) { achado = { documento: digitos.slice(0, 14), tipo: 'e-CNPJ' }; return; }
    }
    n.value.forEach(andar);
  };
  andar(certAsn1);
  return achado;
}

function chavesCasam(cert: forge.pki.Certificate, chave: forge.pki.PrivateKey): boolean {
  const pub = cert.publicKey;
  return 'n' in pub && 'n' in chave && pub.n.equals(chave.n);
}

/** Lê o certificado A1. `documentoDoTitular` (só dígitos ou formatado) é conferido quando vem; `agora` existe para o teste. */
export function lerCertificadoA1(bytes: Uint8Array, senha: string, opcoes: { documentoDoTitular?: string | null; agora?: Date } = {}): ResultadoDoCertificado {
  const binario = bytesParaBinario(bytes);
  /* certificado público em texto (PEM) ou cadeia .p7b em texto: é o que um cartão/token exporta — não é A1 */
  if (/-----BEGIN (CERTIFICATE|PKCS7)-----/.test(binario)) return recusa('nao_a1');
  let asn1: forge.asn1.Asn1;
  try { asn1 = forge.asn1.fromDer(binario); } catch { return recusa('arquivo_ilegivel'); }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/MAC could not be verified|Invalid password/i.test(msg)) return recusa('senha');
    /* não é PKCS#12: um .cer em DER (o certificado só) ou um .p7b em DER também são "não A1" */
    try { forge.pki.certificateFromAsn1(asn1); return recusa('nao_a1'); } catch { /* segue */ }
    try { forge.pkcs7.messageFromAsn1(asn1); return recusa('nao_a1'); } catch { /* segue */ }
    return recusa('arquivo_ilegivel');
  }

  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ].flatMap((b) => (b.key ? [b.key] : []));
  if (chaves.length === 0) return recusa('nao_a1');
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).flatMap((b) => (b.cert ? [b.cert] : []));
  const folha = certs.find((c) => chaves.some((k) => chavesCasam(c, k)));
  if (!folha) return recusa('nao_a1');

  const certAsn1 = forge.pki.certificateToAsn1(folha);
  const cn = atributo(folha.subject.attributes, 'CN');
  const doSan = documentoNoSan(folha);
  const doCn = /:(\d{11}|\d{14})$/.exec(cn ?? '');
  const tipoDoDocumento = (d: string): 'e-CPF' | 'e-CNPJ' => (d.length === 11 ? 'e-CPF' : 'e-CNPJ');
  const lido = doSan ?? (doCn ? { documento: doCn[1], tipo: tipoDoDocumento(doCn[1]) } : null);
  if (!lido) return recusa('sem_documento');
  const titular = soDigitos(opcoes.documentoDoTitular);
  if (titular && titular !== lido.documento) return recusa('documento_diferente');

  const agora = opcoes.agora ?? new Date();
  if (agora < folha.validity.notBefore) return recusa('ainda_nao_vale', `Vale a partir de ${dataBR(folha.validity.notBefore)}.`);
  if (agora > folha.validity.notAfter) return recusa('vencido', `Venceu em ${dataBR(folha.validity.notAfter)}: suba o novo.`);

  const md = forge.md.sha256.create();
  md.update(forge.asn1.toDer(certAsn1).getBytes());
  const emissor = atributo(folha.issuer.attributes, 'CN');
  const orgsDoEmissor = folha.issuer.attributes.filter((a) => a.shortName === 'O').map((a) => String(a.value));
  const icpBrasil = orgsDoEmissor.some((o) => /ICP-Brasil/i.test(o));
  const avisos = icpBrasil ? [] : ['O emissor não é da ICP-Brasil: a SEFAZ de produção recusa (na homologação, com certificado de teste, passa).'];
  return {
    ok: true,
    avisos,
    certificado: {
      documento: lido.documento, tipo: lido.tipo, nome: cn ? cn.replace(/:(\d{11}|\d{14})$/, '') : null, emissor,
      numeroSerie: folha.serialNumber, validoDe: folha.validity.notBefore, validoAte: folha.validity.notAfter,
      impressaoDigital: md.digest().toHex(), icpBrasil,
    },
  };
}
