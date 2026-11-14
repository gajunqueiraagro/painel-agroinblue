/**
 * NOTAS-RECEITA-A1-01 · F2 — o leitor do certificado A1 com .pfx SINTÉTICOS gerados aqui (autoassinados, de ninguém; CPFs de teste válidos
 * pelo dígito). Nenhum certificado real entra no repositório.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { FRASE_A3_NAO_SERVE, FRASES_DA_RECUSA, lerCertificadoA1 } from '../../../supabase/functions/_shared/certificadoA1';

const CPF = '52998224725';
const OUTRO = '11144477735';
const SENHA = 'senha-de-teste-123';
const AGORA = new Date('2026-11-13T12:00:00Z');

let chaves: forge.pki.rsa.KeyPair;
beforeAll(() => { chaves = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 }); }, 30000);

function certificado(op: { cn?: string; de?: string; ate?: string; emissorO?: string; san?: { oid: string; texto: string } } = {}): forge.pki.Certificate {
  const c = forge.pki.createCertificate();
  c.publicKey = chaves.publicKey;
  c.serialNumber = '0a1b2c';
  c.validity.notBefore = new Date(op.de ?? '2026-01-01T00:00:00Z');
  c.validity.notAfter = new Date(op.ate ?? '2027-01-01T00:00:00Z');
  c.setSubject([{ shortName: 'CN', value: op.cn ?? `PRODUTORA DE TESTE:${CPF}` }]);
  c.setIssuer([{ shortName: 'CN', value: 'AC SINTETICA DE TESTE' }, { shortName: 'O', value: op.emissorO ?? 'ICP-Brasil' }]);
  if (op.san) {
    /* otherName [0] { OID, [0] EXPLICIT OCTET STRING } dentro do GeneralNames, como a ICP-Brasil grava o e-CPF/e-CNPJ */
    const { asn1 } = forge;
    const outro = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(op.san.oid).getBytes()),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, op.san.texto)]),
    ]);
    const nomes = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [outro]);
    c.setExtensions([{ id: '2.5.29.17', value: asn1.toDer(nomes).getBytes() }]);
  }
  c.sign(chaves.privateKey, forge.md.sha256.create());
  return c;
}
const bytes = (binario: string) => Uint8Array.from(binario, (ch) => ch.charCodeAt(0));
const pfx = (cert: forge.pki.Certificate, comChave = true, senha = SENHA) =>
  bytes(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(comChave ? chaves.privateKey : null, [cert], senha, { algorithm: '3des' })).getBytes());
const ler = (b: Uint8Array, senha = SENHA, titular: string | null = CPF) => lerCertificadoA1(b, senha, { documentoDoTitular: titular, agora: AGORA });

describe('lerCertificadoA1 — o A1 que serve', () => {
  it('abre com a senha e devolve SÓ metadados: documento do CN, nome, emissor, série, validade e a impressão digital do certificado público', () => {
    const cert = certificado();
    const r = ler(pfx(cert));
    if (r.ok === false) throw new Error(r.frase);
    const md = forge.md.sha256.create(); md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
    expect(r.certificado).toEqual({
      documento: CPF, tipo: 'e-CPF', nome: 'PRODUTORA DE TESTE', emissor: 'AC SINTETICA DE TESTE', numeroSerie: '0a1b2c',
      validoDe: new Date('2026-01-01T00:00:00Z'), validoAte: new Date('2027-01-01T00:00:00Z'), impressaoDigital: md.digest().toHex(), icpBrasil: true,
    });
    expect(r.avisos).toEqual([]);
    /* nada da chave nem da senha sai */
    expect(JSON.stringify(r)).not.toContain(SENHA);
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE|BEGIN/);
  }, 30000);
  it('o documento do SubjectAltName da ICP-Brasil manda sobre o CN: e-CPF (nascimento + CPF) e e-CNPJ', () => {
    const cpf = ler(pfx(certificado({ cn: 'NOME SEM DOCUMENTO', san: { oid: '2.16.76.1.3.1', texto: `01011980${CPF}00000000000` } })));
    expect(cpf.ok && [cpf.certificado.documento, cpf.certificado.tipo]).toEqual([CPF, 'e-CPF']);
    const cnpj = lerCertificadoA1(pfx(certificado({ cn: 'EMPRESA', san: { oid: '2.16.76.1.3.3', texto: '11222333000181' } })), SENHA, { agora: AGORA });
    expect(cnpj.ok && [cnpj.certificado.documento, cnpj.certificado.tipo]).toEqual(['11222333000181', 'e-CNPJ']);
  }, 30000);
  it('emissor fora da ICP-Brasil: aceita com AVISO (a homologação usa cadeia de teste), nunca em silêncio', () => {
    const r = ler(pfx(certificado({ emissorO: 'Outra AC' })));
    expect(r.ok && r.certificado.icpBrasil).toBe(false);
    expect(r.ok && r.avisos[0]).toMatch(/não é da ICP-Brasil/);
  }, 30000);
});

describe('lerCertificadoA1 — as recusas (nada passa calado)', () => {
  it('senha errada', () => {
    expect(ler(pfx(certificado()), 'outra-senha')).toEqual({ ok: false, recusa: 'senha', frase: FRASES_DA_RECUSA.senha });
  }, 30000);
  it('NÃO É A1 (Chat 10:45): PKCS#12 sem a chave (o que um cartão/token exporta), .cer em DER e .cer em PEM — a frase explica o A3', () => {
    const cert = certificado();
    const semChave = ler(pfx(cert, false));
    const der = ler(bytes(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()));
    const pem = ler(bytes(forge.pki.certificateToPem(cert)));
    for (const r of [semChave, der, pem]) expect(r).toEqual({ ok: false, recusa: 'nao_a1', frase: FRASES_DA_RECUSA.nao_a1 });
    expect(FRASES_DA_RECUSA.nao_a1).toContain(FRASE_A3_NAO_SERVE);
    expect(FRASE_A3_NAO_SERVE).toBe('Certificado em cartão ou token (A3) não funciona aqui: é preciso um A1 (arquivo .pfx ou .p12).');
  }, 30000);
  it('arquivo que não é certificado nenhum', () => {
    expect(ler(bytes('isto é um PDF qualquer')).ok).toBe(false);
    expect(ler(bytes('isto é um PDF qualquer'))).toMatchObject({ recusa: 'arquivo_ilegivel' });
  });
  it('certificado de OUTRO CPF que não o do produtor', () => {
    expect(ler(pfx(certificado()), SENHA, OUTRO)).toMatchObject({ ok: false, recusa: 'documento_diferente' });
    /* o titular formatado também confere */
    expect(ler(pfx(certificado()), SENHA, '529.982.247-25').ok).toBe(true);
  }, 30000);
  it('sem CPF/CNPJ no certificado', () => {
    expect(ler(pfx(certificado({ cn: 'SEM DOCUMENTO' })))).toMatchObject({ ok: false, recusa: 'sem_documento' });
  }, 30000);
  it('vencido e ainda não válido, com a data na frase', () => {
    const v = ler(pfx(certificado({ de: '2024-01-01T00:00:00Z', ate: '2025-06-30T12:00:00Z' })));
    expect(v).toEqual({ ok: false, recusa: 'vencido', frase: `${FRASES_DA_RECUSA.vencido} Venceu em 30/06/2025: suba o novo.` });
    const f = ler(pfx(certificado({ de: '2026-12-01T12:00:00Z', ate: '2028-01-01T00:00:00Z' })));
    expect(f).toMatchObject({ ok: false, recusa: 'ainda_nao_vale' });
  }, 30000);
});
