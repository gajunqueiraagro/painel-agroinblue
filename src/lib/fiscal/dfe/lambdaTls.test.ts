/**
 * NOTAS-RECEITA-A1-01 · Lambda mTLS — a PROVA do motivo da Lambda: um servidor TLS local que se comporta como o da Receita (aperto de mão
 * SEM pedir certificado; depois do pedido, RENEGOCIA para cobrar o certificado do cliente). Tudo SINTÉTICO (AC, servidor e cliente de
 * teste gerados aqui); só localhost.
 *   N1 o `postarMtls` (Node/OpenSSL) passa pela renegociação e o servidor vê o certificado do cliente
 *   N2 servidor não confiável = "tls" · N3 servidor que não responde = "tempo" · N4 porta fechada = "conexao"
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { createServer, type Server, type TLSSocket } from 'node:tls';
import { constants } from 'node:crypto';
import { createServer as criarTcp } from 'node:net';
import type { AddressInfo } from 'node:net';
import { postarMtls } from '../../../../infra/dfe-mtls/src/tls';

type Par = { cert: string; key: string };
let ca: Par; let servidor: Par; let cliente: Par;
let srv: Server; let porta = 0;
const vistos: { renegociou: boolean; cn: string | null; corpo: string }[] = [];

function emitir(cn: string, emissor: { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey } | null, o: { ac?: boolean; dns?: string } = {}) {
  const k = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey; c.serialNumber = String(Math.floor(Math.random() * 1e8) + 10);
  c.validity.notBefore = new Date(Date.now() - 86400000); c.validity.notAfter = new Date(Date.now() + 86400000 * 30);
  c.setSubject([{ shortName: 'CN', value: cn }]);
  c.setIssuer(emissor ? emissor.cert.subject.attributes : [{ shortName: 'CN', value: cn }]);
  const ext: object[] = [{ name: 'basicConstraints', cA: !!o.ac }];
  if (o.dns) ext.push({ name: 'subjectAltName', altNames: [{ type: 2, value: o.dns }] });
  c.setExtensions(ext);
  c.sign(emissor ? emissor.key : k.privateKey, forge.md.sha256.create());
  return { obj: { cert: c, key: k.privateKey }, pem: { cert: forge.pki.certificateToPem(c), key: forge.pki.privateKeyToPem(k.privateKey) } };
}

beforeAll(async () => {
  const a = emitir('AC SINTETICA TESTE', null, { ac: true });
  ca = a.pem;
  servidor = emitir('localhost', a.obj, { dns: 'localhost' }).pem;
  cliente = emitir('PRODUTORA SINTETICA:52998224725', a.obj).pem;
  /* tls cru (o servidor HTTP do Node consome o socket e não deixa renegociar) e SEM ticket: com ticket a renegociação vira retomada de
     sessão e o certificado nunca é pedido — o IIS faz o aperto de mão completo */
  srv = createServer({ key: servidor.key, cert: servidor.cert, ca: ca.cert, requestCert: false, maxVersion: 'TLSv1.2',
    secureOptions: constants.SSL_OP_NO_TICKET }, (sock: TLSSocket) => {
    let buf = ''; let feito = false;
    sock.on('error', () => { /* o cliente que recusa fecha o socket */ });
    sock.on('data', (d: Buffer) => {
      buf += d.toString();
      const fimCab = buf.indexOf('\r\n\r\n');
      if (feito || fimCab < 0) return;
      if (buf.startsWith('POST /mudo')) { feito = true; return; } /* nunca responde */
      const tam = Number(buf.slice(0, fimCab).match(/content-length: (\d+)/i)?.[1] ?? 0);
      if (buf.length < fimCab + 4 + tam) return;
      feito = true;
      const corpo = buf.slice(fimCab + 4, fimCab + 4 + tam);
      const antes = sock.getPeerCertificate();
      const semCertNoInicio = !antes || Object.keys(antes).length === 0;
      sock.renegotiate({ requestCert: true, rejectUnauthorized: true }, (erro) => {
        const p = sock.getPeerCertificate();
        const cn = !erro && sock.authorized && p && p.subject ? String(p.subject.CN) : null;
        vistos.push({ renegociou: semCertNoInicio, cn, corpo });
        const r = cn ? '<retDistDFeInt>sintetico</retDistDFeInt>' : 'sem certificado';
        sock.end(`HTTP/1.1 ${cn ? 200 : 403} X\r\nContent-Type: application/soap+xml\r\nContent-Length: ${r.length}\r\nConnection: close\r\n\r\n${r}`);
      });
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  porta = (srv.address() as AddressInfo).port;
}, 60000);
afterAll(() => { srv?.close(); });

describe('NOTAS-RECEITA-A1-01 — Lambda mTLS: o POST passa pela renegociação TLS', () => {
  it('N1 o servidor não pede certificado no aperto de mão, renegocia depois do pedido, e o postarMtls entrega o certificado', async () => {
    const r = await postarMtls(`https://localhost:${porta}/servico`, cliente, '<envelope>sintetico</envelope>', { ca: ca.cert });
    expect(r.status).toBe(200);
    expect(new TextDecoder().decode(r.corpo)).toBe('<retDistDFeInt>sintetico</retDistDFeInt>');
    expect(vistos.at(-1)).toEqual({ renegociou: true, cn: 'PRODUTORA SINTETICA:52998224725', corpo: '<envelope>sintetico</envelope>' });
  }, 30000);
  it('N2 servidor fora das CAs confiáveis: "tls" (nada é enviado)', async () => {
    const n = vistos.length;
    await expect(postarMtls(`https://localhost:${porta}/servico`, cliente, '<x/>')).rejects.toMatchObject({ falha: 'tls' });
    expect(vistos.length).toBe(n);
  }, 30000);
  it('N3 servidor que não responde: "tempo"', async () => {
    await expect(postarMtls(`https://localhost:${porta}/mudo`, cliente, '<x/>', { ca: ca.cert, esperaMs: 500 })).rejects.toMatchObject({ falha: 'tempo' });
  }, 30000);
  it('N4 porta fechada: "conexao"', async () => {
    const t = criarTcp(); await new Promise<void>((r) => t.listen(0, '127.0.0.1', () => r()));
    const livre = (t.address() as AddressInfo).port; await new Promise<void>((r) => t.close(() => r()));
    await expect(postarMtls(`https://localhost:${livre}/`, cliente, '<x/>', { ca: ca.cert })).rejects.toMatchObject({ falha: 'conexao' });
  }, 30000);
});
