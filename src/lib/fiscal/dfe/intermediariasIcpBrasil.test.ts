/**
 * NOTAS-RECEITA-AGENDA-01 · F3 (Gabriel 27/11) — o pacote público das ACs intermediárias da ICP-Brasil completa a cadeia do .pfx que veio
 * sem ela (o caso da Santa Rita), e continua recusando o que não fecha.
 *   I1 cada AC do pacote: a impressão declarada = a do PEM, é AC, fecha (assinatura a assinatura) até uma raiz de RAIZES_ICP_BRASIL
 *   I2 a cadeia real da Safeweb: AC SAFEWEB RFB v5 → AC Secretaria da Receita Federal do Brasil v4 → AC Raiz Brasileira v5
 *   I3 folha sintética sem a AC no arquivo, com a AC no pacote: a credencial abre e o par mTLS leva a AC do pacote
 *   I4 o pacote não salva AC forjada (mesmo nome, outra chave): continua recusa
 */
import { beforeAll, describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { INTERMEDIARIAS_ICP_BRASIL } from '../../../../supabase/functions/_shared/dfe/intermediariasIcpBrasil';
import { RAIZES_ICP_BRASIL } from '../../../../supabase/functions/_shared/dfe/raizesIcpBrasil';
import { abrirCredencial, cadeiaDaSubida, conferirCadeia } from '../../../../supabase/functions/_shared/dfe/credencialA1';

const sha = (c: forge.pki.Certificate) => { const md = forge.md.sha256.create(); md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes()); return md.digest().toHex(); };
const AGORA = new Date('2026-11-27T12:00:00Z');
const cn = (c: forge.pki.Certificate) => String(c.subject.getField('CN')?.value ?? '');

describe('INTERMEDIARIAS_ICP_BRASIL', () => {
  it('I1 impressão, AC e cadeia até uma raiz conhecida, em todas', () => {
    const raizes = RAIZES_ICP_BRASIL.map((r) => ({ nome: r.nome, sha256: r.sha256, cert: forge.pki.certificateFromPem(r.pem) }));
    const pacote = INTERMEDIARIAS_ICP_BRASIL.map((i) => forge.pki.certificateFromPem(i.pem));
    expect(pacote.length).toBeGreaterThan(100);
    INTERMEDIARIAS_ICP_BRASIL.forEach((i, n) => {
      const c = pacote[n];
      expect(sha(c)).toBe(i.sha256);
      const bc: unknown = c.getExtension('basicConstraints');
      expect(bc && typeof bc === 'object' && Reflect.get(bc, 'cA')).toBe(true);
      const r = conferirCadeia(c, [], AGORA, raizes, pacote);
      expect(r.ok, `${i.nome}: ${r.ok === false ? r.motivo : ''}`).toBe(true);
      expect(r.ok && r.raiz).toBe(i.raiz);
    });
  }, 120_000);

  it('I2 a cadeia da Safeweb RFB v5 fecha na raiz v5 pela AC da Receita v4', () => {
    const safeweb = INTERMEDIARIAS_ICP_BRASIL.find((i) => i.nome === 'AC SAFEWEB RFB v5');
    expect(safeweb).toBeTruthy();
    const r = conferirCadeia(forge.pki.certificateFromPem(safeweb?.pem ?? ''), [], AGORA);
    expect(r.ok).toBe(true);
    expect(r.caminho.map((p) => p.nome)).toEqual(['AC SAFEWEB RFB v5', 'AC Secretaria da Receita Federal do Brasil v4', 'Autoridade Certificadora Raiz Brasileira v5']);
    expect(r.ok && r.raiz).toBe('AC Raiz Brasileira v5');
  });
});

describe('o pacote completa o .pfx sem a AC', () => {
  const CPF = '52998224725'; const SENHA = 'senha-de-teste-789';
  type Par = forge.pki.rsa.KeyPair;
  let kRaiz: Par; let kAc: Par; let kFolha: Par; let kOutra: Par;
  beforeAll(() => { const g = () => forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 }); kRaiz = g(); kAc = g(); kFolha = g(); kOutra = g(); }, 60_000);
  const nome = (v: string) => [{ shortName: 'CN', value: v }, { shortName: 'O', value: 'ICP-Brasil' }];
  const cert = (v: string, emissor: string, pub: forge.pki.PublicKey, assina: forge.pki.rsa.PrivateKey, ac: boolean, serie: string, san = false) => {
    const c = forge.pki.createCertificate(); c.publicKey = pub; c.serialNumber = serie;
    c.validity.notBefore = new Date('2025-01-01T00:00:00Z'); c.validity.notAfter = new Date('2030-01-01T00:00:00Z');
    c.setSubject(nome(v)); c.setIssuer(nome(emissor));
    const ext: object[] = [{ name: 'basicConstraints', cA: ac, critical: true }];
    if (san) {
      const { asn1 } = forge;
      const outro = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('2.16.76.1.3.1').getBytes()),
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, `01011980${CPF}`)]),
      ]);
      ext.push({ id: '2.5.29.17', value: asn1.toDer(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [outro])).getBytes() });
    }
    c.setExtensions(ext); c.sign(assina, forge.md.sha256.create()); return c;
  };
  const montar = () => {
    const raiz = cert('AC RAIZ SINTETICA', 'AC RAIZ SINTETICA', kRaiz.publicKey, kRaiz.privateKey, true, '01');
    const ac = cert('AC SINTETICA v1', 'AC RAIZ SINTETICA', kAc.publicKey, kRaiz.privateKey, true, '02');
    const forjada = cert('AC SINTETICA v1', 'AC RAIZ SINTETICA', kAc.publicKey, kOutra.privateKey, true, '09');
    const folha = cert(`PRODUTORA SINTETICA:${CPF}`, 'AC SINTETICA v1', kFolha.publicKey, kAc.privateKey, false, '03', true);
    const pfx = Uint8Array.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(kFolha.privateKey, [folha], SENHA, { algorithm: '3des' })).getBytes(), (c) => c.charCodeAt(0));
    return { raizes: [{ nome: 'AC RAIZ SINTETICA', sha256: sha(raiz), cert: raiz }], ac, forjada, folha, pfx };
  };

  it('I3 só a folha no arquivo + a AC no pacote: abre; o par mTLS leva a AC do pacote', () => {
    const m = montar();
    const r = abrirCredencial(m.pfx, SENHA, { documento: CPF, impressaoDigital: sha(m.folha) }, { agora: AGORA, raizes: m.raizes, doPacote: [m.ac] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.par.cert.match(/BEGIN CERTIFICATE/g)?.length).toBe(2);
    const semPacote = abrirCredencial(m.pfx, SENHA, { documento: CPF, impressaoDigital: sha(m.folha) }, { agora: AGORA, raizes: m.raizes, doPacote: [] });
    expect(semPacote.ok === false && semPacote.recusa).toBe('cadeia');
    expect(cadeiaDaSubida(m.pfx, SENHA, sha(m.folha), AGORA, { raizes: m.raizes, doPacote: [m.ac] })?.ok).toBe(true);
    expect(cadeiaDaSubida(m.pfx, SENHA, sha(m.folha), AGORA, { raizes: m.raizes, doPacote: [] })?.ok).toBe(false);
  });

  it('I4 AC forjada no pacote não fecha', () => {
    const m = montar();
    const r = cadeiaDaSubida(m.pfx, SENHA, sha(m.folha), AGORA, { raizes: m.raizes, doPacote: [m.forjada] });
    expect(r?.ok).toBe(false);
    expect(cn(m.forjada)).toBe('AC SINTETICA v1');
  });
});
