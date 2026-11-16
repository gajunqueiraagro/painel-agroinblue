/**
 * NOTAS-RECEITA-A1-01 · F3.2 — a CREDENCIAL da busca: o A1 do cofre aberto SÓ NA MEMÓRIA da borda, conferido ANTES de falar com a Receita
 * (OK do Chat 16/11 14:43). Puro: recebe os bytes do .pfx (já decifrado), a senha e o que o banco guardou; devolve o par PEM para o mTLS e a
 * CADEIA conferida — ou a recusa com a frase. Nada sai daqui para log ou resposta além de `CadeiaConferida` (nomes, datas, motivo).
 *  1. o certificado abre, é A1, é do titular e está valendo (`lerCertificadoA1`, o MESMO leitor da subida);
 *  2. é o MESMO que subiu: a impressão digital bate com a guardada no banco (arquivo trocado no bucket = recusa);
 *  3. a CADEIA por assinatura: folha → AC intermediárias (do próprio .pfx) → uma AC Raiz da ICP-Brasil embutida (`RAIZES_ICP_BRASIL`, pela
 *     impressão SHA-256); cada AC no caminho é AC (basicConstraints) e está valendo hoje. Falta de intermediária = recusa (o aperto de mão
 *     mTLS também precisaria dela);
 *  4. o par para o `Deno.createHttpClient`: `cert` = folha + intermediárias (sem a raiz), `key` = a chave da folha.
 */
import forge from 'node-forge';
import { lerCertificadoA1 } from '../certificadoA1.ts';
import { RAIZES_ICP_BRASIL } from './raizesIcpBrasil.ts';

export interface PassoDaCadeia { nome: string | null; ate: string }
export type MotivoDaCadeia = 'sem_intermediaria' | 'assinatura' | 'ac_vencida' | 'nao_e_ac' | 'raiz_desconhecida' | 'longa_demais';
export type CadeiaConferida =
  | { ok: true; caminho: PassoDaCadeia[]; raiz: string }
  | { ok: false; caminho: PassoDaCadeia[]; motivo: MotivoDaCadeia; frase: string };

export type RecusaDaCredencial = 'certificado' | 'impressao_diferente' | 'cadeia';
export type ResultadoDaCredencial =
  | { ok: true; par: { cert: string; key: string }; cadeia: Extract<CadeiaConferida, { ok: true }>; impressaoDigital: string }
  | { ok: false; recusa: RecusaDaCredencial; frase: string; cadeia: CadeiaConferida | null };

export const FRASES_DA_CADEIA: Record<MotivoDaCadeia, string> = {
  sem_intermediaria: 'A cadeia do certificado não veio inteira no arquivo (falta a AC que o emitiu). Peça à certificadora o .pfx com a cadeia.',
  assinatura: 'A assinatura de uma AC da cadeia não confere: o certificado não é confiável.',
  ac_vencida: 'Uma AC da cadeia do certificado está vencida.',
  nao_e_ac: 'Um certificado da cadeia não é de autoridade certificadora.',
  raiz_desconhecida: 'A cadeia do certificado não termina numa AC Raiz da ICP-Brasil: a Receita recusaria.',
  longa_demais: 'A cadeia do certificado é longa demais para ser da ICP-Brasil.',
};
export const FRASE_IMPRESSAO_DIFERENTE = 'O arquivo do cofre não é o certificado que subiu (a impressão digital não bate). Suba o certificado de novo.';
const MAX_PASSOS = 6;

const binario = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return s; };
const sha256 = (c: forge.pki.Certificate) => {
  const md = forge.md.sha256.create(); md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes()); return md.digest().toHex();
};
const cn = (c: forge.pki.Certificate) => { const a = c.subject.getField('CN'); return a && typeof a.value === 'string' ? a.value : null; };
const passo = (c: forge.pki.Certificate): PassoDaCadeia => ({ nome: cn(c), ate: c.validity.notAfter.toISOString() });
const ehAc = (c: forge.pki.Certificate) => {
  const bc: unknown = c.getExtension('basicConstraints');
  return !!bc && typeof bc === 'object' && Reflect.get(bc, 'cA') === true;
};
const assinou = (pai: forge.pki.Certificate, filho: forge.pki.Certificate) => {
  try { return pai.verify(filho); } catch { return false; }
};
const raizesPadrao = () => RAIZES_ICP_BRASIL.map((r) => ({ nome: r.nome, sha256: r.sha256, cert: forge.pki.certificateFromPem(r.pem) }));

/** a cadeia da folha até uma raiz conhecida. `outros` = os certificados do .pfx além da folha (as intermediárias). */
export function conferirCadeia(
  folha: forge.pki.Certificate, outros: readonly forge.pki.Certificate[], agora: Date,
  raizes: readonly { nome: string; sha256: string; cert: forge.pki.Certificate }[] = raizesPadrao(),
): CadeiaConferida {
  const caminho: PassoDaCadeia[] = [passo(folha)];
  const recusa = (motivo: MotivoDaCadeia): CadeiaConferida => ({ ok: false, caminho, motivo, frase: FRASES_DA_CADEIA[motivo] });
  let atual = folha;
  for (let i = 0; i < MAX_PASSOS; i++) {
    /* 1º a raiz conhecida que assinou o atual */
    const raiz = raizes.find((r) => atual.isIssuer(r.cert) && assinou(r.cert, atual));
    if (raiz) {
      if (agora > raiz.cert.validity.notAfter || agora < raiz.cert.validity.notBefore) { caminho.push(passo(raiz.cert)); return recusa('ac_vencida'); }
      caminho.push(passo(raiz.cert));
      return { ok: true, caminho, raiz: raiz.nome };
    }
    /* o atual é autoassinado e não é raiz conhecida: a cadeia acaba fora da ICP-Brasil */
    if (atual.isIssuer(atual) && assinou(atual, atual)) return recusa('raiz_desconhecida');
    const candidatos = outros.filter((o) => o !== atual && atual.isIssuer(o));
    /* o nome do emissor é o de uma raiz conhecida, mas ela não assinou: forjado (nunca "falta a AC") */
    if (candidatos.length === 0) return recusa(raizes.some((r) => atual.isIssuer(r.cert)) ? 'assinatura' : 'sem_intermediaria');
    const pai = candidatos.find((o) => assinou(o, atual));
    if (!pai) return recusa('assinatura');
    caminho.push(passo(pai));
    if (!ehAc(pai)) return recusa('nao_e_ac');
    if (agora > pai.validity.notAfter || agora < pai.validity.notBefore) return recusa('ac_vencida');
    atual = pai;
  }
  return recusa('longa_demais');
}

/** abre o A1 do cofre e confere tudo antes da chamada. `raizes` existe para o teste (a cadeia sintética). */
export function abrirCredencial(
  bytes: Uint8Array, senha: string,
  esperado: { documento: string; impressaoDigital: string },
  opcoes: { agora?: Date; raizes?: readonly { nome: string; sha256: string; cert: forge.pki.Certificate }[] } = {},
): ResultadoDaCredencial {
  const agora = opcoes.agora ?? new Date();
  const lido = lerCertificadoA1(bytes, senha, { documentoDoTitular: esperado.documento, agora });
  if (lido.ok === false) return { ok: false, recusa: 'certificado', frase: lido.frase, cadeia: null };
  if (lido.certificado.impressaoDigital !== esperado.impressaoDigital.toLowerCase()) {
    return { ok: false, recusa: 'impressao_diferente', frase: FRASE_IMPRESSAO_DIFERENTE, cadeia: null };
  }
  /* o leitor já provou que abre e tem a chave da folha: aqui só se pegam os objetos */
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(binario(bytes)), senha);
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ].flatMap((b) => (b.key ? [b.key] : []));
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).flatMap((b) => (b.cert ? [b.cert] : []));
  const folha = certs.find((c) => sha256(c) === lido.certificado.impressaoDigital);
  const chave = folha ? chaves.find((k) => 'n' in folha.publicKey && 'n' in k && folha.publicKey.n.equals(k.n)) : undefined;
  if (!folha || !chave) return { ok: false, recusa: 'certificado', frase: 'O certificado não abriu com a chave.', cadeia: null };

  const outros = certs.filter((c) => c !== folha);
  const cadeia = conferirCadeia(folha, outros, agora, opcoes.raizes);
  if (cadeia.ok === false) return { ok: false, recusa: 'cadeia', frase: cadeia.frase, cadeia };

  /* o que vai no aperto de mão: a folha e as intermediárias do caminho (a raiz o servidor já tem) */
  const doCaminho = outros.filter((o) => cadeia.caminho.slice(1).some((p) => p.nome === cn(o) && p.ate === o.validity.notAfter.toISOString()));
  const cert = [folha, ...doCaminho.filter((o) => !opcoesEhRaiz(o, opcoes.raizes))].map((c) => forge.pki.certificateToPem(c)).join('');
  return { ok: true, par: { cert, key: forge.pki.privateKeyToPem(chave) }, cadeia, impressaoDigital: lido.certificado.impressaoDigital };
}

function opcoesEhRaiz(c: forge.pki.Certificate, raizes?: readonly { sha256: string }[]): boolean {
  const lista = raizes ?? RAIZES_ICP_BRASIL;
  const d = sha256(c);
  return lista.some((r) => r.sha256 === d);
}
