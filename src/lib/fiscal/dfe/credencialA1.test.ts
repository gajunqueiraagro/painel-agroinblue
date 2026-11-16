/**
 * NOTAS-RECEITA-A1-01 · F3.2 — a credencial da busca e a CADEIA ICP, com uma cadeia SINTÉTICA gerada aqui (raiz → AC → folha e-CPF de teste;
 * de ninguém). Nenhum certificado real entra no repositório; as raízes reais da ICP-Brasil (públicas) são conferidas pela impressão.
 *   K1 cadeia inteira: confere, o par mTLS leva folha + AC (sem a raiz) e a chave
 *   K2 sem a AC no arquivo · K3 raiz fora da lista · K4 AC forjada (mesmo nome, outra chave) · K5 AC vencida · K6 "AC" sem cA
 *   K7 impressão diferente da guardada · K8 CPF de outro · K9 as raízes reais da ICP-Brasil: impressão = a declarada, autoassinadas
 */
import { beforeAll, describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { abrirCredencial, conferirCadeia, FRASE_IMPRESSAO_DIFERENTE, FRASES_DA_CADEIA } from '../../../../supabase/functions/_shared/dfe/credencialA1';
import { RAIZES_ICP_BRASIL } from '../../../../supabase/functions/_shared/dfe/raizesIcpBrasil';

const CPF = '52998224725';
const SENHA = 'senha-de-teste-456';
const AGORA = new Date('2026-11-16T15:00:00Z');
type Par = forge.pki.rsa.KeyPair;
let kRaiz: Par; let kAc: Par; let kFolha: Par; let kOutra: Par;
beforeAll(() => {
  const g = () => forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  kRaiz = g(); kAc = g(); kFolha = g(); kOutra = g();
}, 60000);

const nome = (cn: string) => [{ shortName: 'CN', value: cn }, { shortName: 'O', value: 'ICP-Brasil' }];
function cert(o: { cn: string; emissor: string; pub: forge.pki.PublicKey; assina: forge.pki.rsa.PrivateKey; ac: boolean; serie: string;
  ate?: string; san?: boolean; semBc?: boolean }): forge.pki.Certificate {
  const c = forge.pki.createCertificate();
  c.publicKey = o.pub; c.serialNumber = o.serie;
  c.validity.notBefore = new Date('2025-01-01T00:00:00Z');
  c.validity.notAfter = new Date(o.ate ?? '2030-01-01T00:00:00Z');
  c.setSubject(nome(o.cn)); c.setIssuer(nome(o.emissor));
  const ext: object[] = [];
  if (!o.semBc) ext.push({ name: 'basicConstraints', cA: o.ac, critical: true });
  if (o.san) {
    const { asn1 } = forge;
    const outro = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('2.16.76.1.3.1').getBytes()),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, `01011980${CPF}`)]),
    ]);
    ext.push({ id: '2.5.29.17', value: asn1.toDer(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [outro])).getBytes() });
  }
  c.setExtensions(ext);
  c.sign(o.assina, forge.md.sha256.create());
  return c;
}
const raiz = () => cert({ cn: 'AC RAIZ SINTETICA', emissor: 'AC RAIZ SINTETICA', pub: kRaiz.publicKey, assina: kRaiz.privateKey, ac: true, serie: '01' });
const ac = (o: { ate?: string; semBc?: boolean; assina?: forge.pki.rsa.PrivateKey } = {}) =>
  cert({ cn: 'AC SINTETICA v1', emissor: 'AC RAIZ SINTETICA', pub: kAc.publicKey, assina: o.assina ?? kRaiz.privateKey, ac: !o.semBc, serie: '02', ...o });
const folha = () => cert({ cn: `PRODUTORA SINTETICA:${CPF}`, emissor: 'AC SINTETICA v1', pub: kFolha.publicKey, assina: kAc.privateKey, ac: false,
  serie: '03', san: true });

const sha = (c: forge.pki.Certificate) => { const md = forge.md.sha256.create(); md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes()); return md.digest().toHex(); };
const pfx = (certs: forge.pki.Certificate[]) =>
  Uint8Array.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(kFolha.privateKey, certs, SENHA, { algorithm: '3des' })).getBytes(), (ch) => ch.charCodeAt(0));
const raizesDoTeste = () => { const r = raiz(); return [{ nome: 'AC RAIZ SINTETICA', sha256: sha(r), cert: r }]; };
const abrir = (certs: forge.pki.Certificate[], o: { impressao?: string; documento?: string; raizes?: ReturnType<typeof raizesDoTeste> } = {}) => {
  const f = certs[0];
  return abrirCredencial(pfx(certs), SENHA, { documento: o.documento ?? CPF, impressaoDigital: o.impressao ?? sha(f) },
    { agora: AGORA, raizes: o.raizes ?? raizesDoTeste() });
};

describe('NOTAS-RECEITA-A1-01 F3.2 — a credencial e a cadeia ICP', () => {
  it('K1 cadeia inteira: confere até a raiz; o par mTLS = folha + AC (sem a raiz) e a chave da folha', () => {
    const r = abrir([folha(), ac(), raiz()]);
    if (r.ok === false) throw new Error(r.frase);
    expect(r.cadeia.raiz).toBe('AC RAIZ SINTETICA');
    expect(r.cadeia.caminho.map((p) => p.nome)).toEqual([`PRODUTORA SINTETICA:${CPF}`, 'AC SINTETICA v1', 'AC RAIZ SINTETICA']);
    expect(r.par.cert.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
    expect(forge.pki.certificateFromPem(r.par.cert).subject.getField('CN').value).toBe(`PRODUTORA SINTETICA:${CPF}`);
    expect(r.par.key).toMatch(/BEGIN RSA PRIVATE KEY/);
  });
  it('K2 sem a AC no arquivo: recusa "sem_intermediaria" (e o aperto de mão também falharia)', () => {
    const r = abrir([folha()]);
    expect(r).toMatchObject({ ok: false, recusa: 'cadeia', frase: FRASES_DA_CADEIA.sem_intermediaria, cadeia: { motivo: 'sem_intermediaria' } });
  });
  it('K3 a cadeia acaba numa raiz que não é da lista: "raiz_desconhecida"', () => {
    const outra = cert({ cn: 'OUTRA RAIZ', emissor: 'OUTRA RAIZ', pub: kOutra.publicKey, assina: kOutra.privateKey, ac: true, serie: '09' });
    const r = abrir([folha(), ac(), raiz()], { raizes: [{ nome: 'OUTRA RAIZ', sha256: sha(outra), cert: outra }] });
    expect(r).toMatchObject({ ok: false, recusa: 'cadeia', cadeia: { motivo: 'raiz_desconhecida' } });
  });
  it('K4 AC forjada (mesmo nome, assinada por outra chave): "assinatura"', () => {
    const r = abrir([folha(), ac({ assina: kOutra.privateKey })]);
    expect(r).toMatchObject({ ok: false, recusa: 'cadeia', cadeia: { motivo: 'assinatura' } });
  });
  it('K5 AC vencida: "ac_vencida"', () => {
    const r = abrir([folha(), ac({ ate: '2026-06-01T00:00:00Z' })]);
    expect(r).toMatchObject({ ok: false, recusa: 'cadeia', cadeia: { motivo: 'ac_vencida' } });
  });
  it('K6 "AC" sem basicConstraints cA: "nao_e_ac"', () => {
    const r = abrir([folha(), ac({ semBc: true })]);
    expect(r).toMatchObject({ ok: false, recusa: 'cadeia', cadeia: { motivo: 'nao_e_ac' } });
  });
  it('K7 a impressão do arquivo não é a guardada: recusa antes da cadeia', () => {
    expect(abrir([folha(), ac()], { impressao: 'f'.repeat(64) })).toMatchObject({ ok: false, recusa: 'impressao_diferente', frase: FRASE_IMPRESSAO_DIFERENTE });
  });
  it('K8 o certificado é de outro CPF: a recusa do leitor da subida', () => {
    expect(abrir([folha(), ac()], { documento: '11144477735' })).toMatchObject({ ok: false, recusa: 'certificado' });
  });
  it('conferirCadeia direto: sem raízes conhecidas e sem AC = sem_intermediaria; a folha entra no caminho', () => {
    const c = conferirCadeia(folha(), [], AGORA, []);
    expect(c).toMatchObject({ ok: false, motivo: 'sem_intermediaria', caminho: [{ nome: `PRODUTORA SINTETICA:${CPF}` }] });
  });
});

describe('NOTAS-RECEITA-A1-01 F3.2 — K9 as AC Raiz reais da ICP-Brasil embutidas', () => {
  it('v5, v10, v11, v12: a impressão SHA-256 do PEM = a declarada; autoassinadas; ICP-Brasil; a v5 vale hoje', () => {
    expect(RAIZES_ICP_BRASIL.map((r) => r.nome)).toEqual(['AC Raiz Brasileira v5', 'AC Raiz Brasileira v10', 'AC Raiz Brasileira v11', 'AC Raiz Brasileira v12']);
    for (const r of RAIZES_ICP_BRASIL) {
      const c = forge.pki.certificateFromPem(r.pem);
      expect(sha(c)).toBe(r.sha256);
      expect(c.isIssuer(c) && c.verify(c)).toBe(true);
      expect(c.subject.getField('O').value).toBe('ICP-Brasil');
    }
    const v5 = forge.pki.certificateFromPem(RAIZES_ICP_BRASIL[0].pem);
    expect(v5.validity.notAfter > AGORA && v5.validity.notBefore < AGORA).toBe(true);
    expect(RAIZES_ICP_BRASIL[0].sha256).toBe('caa53fc6091c6951887c976e378f6ef89aa6377c55d97b6475422b71ed7e9b17');
  });
});
