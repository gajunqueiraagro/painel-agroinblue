/**
 * NOTAS-RECEITA-A1-01 · Lambda mTLS — o protocolo de ponta a ponta (borda → Lambda → borda), com certificado SINTÉTICO e uma "KMS" local
 * (par RSA-OAEP do WebCrypto). Nenhum certificado real, nenhuma rede, nenhuma Receita.
 *   L1 a volta inteira · L2 assinatura errada · L3 relógio · L4 nonce repetido · L5 corpo mexido · L6 envelope torto · L7 certificado de
 *   outro CPF · L8 par preso ao nonce · L9 falha do POST · L10 resposta forjada · L11 o destino nunca vem do pedido · L12 troca de segredo ·
 *   L13 o LOG nunca tem conteúdo
 */
import { beforeAll, describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { atender, type EventoUrl, FalhaDoPost, type PecasLambda } from '../../../../infra/dfe-mtls/src/regra';
import { FalhaDaLambda, importarPublica, lerRespostaLambda, montarPedidoLambda } from '../../../../supabase/functions/_shared/dfe/clienteLambda';
import { CAB, DESTINOS, hmacHex, textoDoPedido } from '../../../../supabase/functions/_shared/dfe/protocoloLambda';
import { envelopeDistDFe } from '../../../../supabase/functions/_shared/dfe/distribuicaoDfe';

const CPF = '52998224725';
const SEGREDO = 'a'.repeat(64);
const ANTERIOR = 'b'.repeat(64);
const T = 1_794_900_000;
const RESPOSTA_RECEITA = '<soap>retDistDFeInt sintetico</soap>';
let par: { cert: string; key: string };
let parOutro: { cert: string; key: string };
let kms: CryptoKeyPair;
let publicaPem: string;
const logs: string[] = [];

function certSintetico(cn: string) {
  const k = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const c = forge.pki.createCertificate();
  c.publicKey = k.publicKey; c.serialNumber = '01';
  c.validity.notBefore = new Date('2025-01-01'); c.validity.notAfter = new Date('2030-01-01');
  c.setSubject([{ shortName: 'CN', value: cn }]); c.setIssuer([{ shortName: 'CN', value: 'AC SINTETICA' }]);
  c.sign(k.privateKey, forge.md.sha256.create());
  return { cert: forge.pki.certificateToPem(c), key: forge.pki.privateKeyToPem(k.privateKey) };
}
beforeAll(async () => {
  par = certSintetico(`PRODUTORA SINTETICA:${CPF}`);
  parOutro = certSintetico('OUTRA SINTETICA:11144477735');
  kms = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kms.publicKey));
  publicaPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(spki).toString('base64')}\n-----END PUBLIC KEY-----\n`;
}, 60000);

const envelope = (o: { ambiente?: 'producao' | 'homologacao'; documento?: string } = {}) =>
  envelopeDistDFe({ ambiente: o.ambiente ?? 'producao', uf: 35, documento: o.documento ?? CPF, pedido: { tipo: 'distNSU', ultNsu: 0 } });

function pecas(o: { agora?: number; postar?: PecasLambda['postar']; segredos?: string[] } = {}) {
  const vistos = new Set<string>();
  const chamadas = { kms: 0, postar: [] as { url: string; par: { cert: string; key: string }; envelope: string }[] };
  const p: PecasLambda = {
    segredos: async () => o.segredos ?? [SEGREDO],
    agoraSegundos: () => o.agora ?? T,
    registrarNonce: async (n) => { if (vistos.has(n)) return false; vistos.add(n); return true; },
    desembrulhar: async (c) => { chamadas.kms++; return new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, kms.privateKey, c)); },
    postar: o.postar ?? (async (url, pp, env) => { chamadas.postar.push({ url, par: { ...pp }, envelope: env }); return { status: 200, corpo: new TextEncoder().encode(RESPOSTA_RECEITA) }; }),
    log: (l) => { logs.push(JSON.stringify(l)); },
  };
  return { p, chamadas };
}
async function pedir(o: { ambiente?: 'producao' | 'homologacao'; env?: string; par?: { cert: string; key: string }; segredo?: string } = {}) {
  return montarPedidoLambda({ ambiente: o.ambiente ?? 'producao', envelope: o.env ?? envelope(), par: o.par ?? par, segredo: o.segredo ?? SEGREDO,
    publica: await importarPublica(publicaPem), agoraSegundos: T });
}
const evento = (ped: { corpo: string; headers: Record<string, string> }, mexer: Partial<{ corpo: string; headers: Record<string, string> }> = {}): EventoUrl => ({
  body: mexer.corpo ?? ped.corpo, rawPath: '/', requestContext: { http: { method: 'POST' }, requestId: 'r-teste' },
  headers: Object.fromEntries(Object.entries(mexer.headers ?? ped.headers).map(([k, v]) => [k.toLowerCase(), v])),
});
const ler = (r: { statusCode: number; headers: Record<string, string>; body: string }, nonce: string, agora = T) =>
  lerRespostaLambda({ status: r.statusCode, tempo: r.headers[CAB.tempo] ?? null, assinatura: r.headers[CAB.assinatura] ?? null, corpo: r.body, nonce, segredo: SEGREDO, agoraSegundos: agora });

describe('NOTAS-RECEITA-A1-01 — Lambda mTLS: o protocolo', () => {
  it('L1 a volta inteira: a Lambda abre o par, faz UM POST ao destino fixo e a borda recebe a resposta da Receita', async () => {
    const { p, chamadas } = pecas(); const ped = await pedir();
    const r = await atender(evento(ped), p);
    expect(r.statusCode).toBe(200);
    expect(await ler(r, ped.nonce)).toEqual({ status: 200, corpo: RESPOSTA_RECEITA });
    expect(chamadas.postar).toHaveLength(1);
    expect(chamadas.postar[0]).toEqual({ url: DESTINOS.producao, par, envelope: envelope() });
    expect(chamadas.kms).toBe(1);
    expect(ped.corpo).not.toContain('PRIVATE KEY');
    expect(ped.corpo).not.toContain('BEGIN CERTIFICATE');
  });
  it('L2 assinatura errada (outro segredo): 401 e NEM o KMS é tocado', async () => {
    const { p, chamadas } = pecas(); const ped = await pedir({ segredo: 'c'.repeat(64) });
    const r = await atender(evento(ped), p);
    expect(r.statusCode).toBe(401); expect(chamadas.kms).toBe(0); expect(chamadas.postar).toHaveLength(0);
    await expect(ler(r, ped.nonce)).rejects.toThrow(FalhaDaLambda);
  });
  it('L3 relógio fora de ±60 s: 401 sem KMS', async () => {
    for (const agora of [T + 61, T - 61]) {
      const { p, chamadas } = pecas({ agora }); const r = await atender(evento(await pedir()), p);
      expect(r.statusCode).toBe(401); expect(chamadas.kms).toBe(0);
    }
    const { p } = pecas({ agora: T + 60 }); expect((await atender(evento(await pedir()), p)).statusCode).toBe(200);
  });
  it('L4 o mesmo pedido duas vezes: o 2º é 401 e a Receita só é chamada uma vez', async () => {
    const { p, chamadas } = pecas(); const ped = await pedir();
    expect((await atender(evento(ped), p)).statusCode).toBe(200);
    expect((await atender(evento(ped), p)).statusCode).toBe(401);
    expect(chamadas.postar).toHaveLength(1);
  });
  it('L5 corpo mexido depois de assinado (outro ambiente): 401', async () => {
    const { p, chamadas } = pecas(); const ped = await pedir();
    const r = await atender(evento(ped, { corpo: ped.corpo.replace('"producao"', '"homologacao"') }), p);
    expect(r.statusCode).toBe(401); expect(chamadas.kms).toBe(0);
  });
  it('L6 envelope torto (ambiente trocado, conteúdo a mais, outro serviço): 422 "envelope", sem KMS e sem POST', async () => {
    const tortos = [
      { ambiente: 'homologacao' as const, env: envelope({ ambiente: 'producao' }) },
      { env: envelope().replace('</nfeDadosMsg>', '<x/></nfeDadosMsg>') },
      { env: envelope().replace('distNSU><ultNSU>000000000000000', 'distNSU><ultNSU>00000000000000') },
      { env: '<?xml version="1.0"?><outro/>' },
      { env: envelope() + ' ' },
    ];
    for (const t of tortos) {
      const { p, chamadas } = pecas(); const ped = await pedir(t);
      const r = await atender(evento(ped), p);
      expect(r.statusCode).toBe(422); expect(JSON.parse(r.body)).toEqual({ ok: false, falha: 'envelope' });
      expect(chamadas.kms).toBe(0); expect(chamadas.postar).toHaveLength(0);
      await expect(ler(r, ped.nonce)).rejects.toMatchObject({ falha: 'envelope' });
    }
  });
  it('L7 o certificado é de outro CPF que o do envelope: 422 "certificado", sem POST', async () => {
    const { p, chamadas } = pecas(); const r = await atender(evento(await pedir({ par: parOutro })), p);
    expect(r.statusCode).toBe(422); expect(JSON.parse(r.body)).toEqual({ ok: false, falha: 'certificado' }); expect(chamadas.postar).toHaveLength(0);
  });
  it('L8 o par cifrado é preso ao nonce: reassinar o mesmo corpo com outro nonce não abre', async () => {
    const { p, chamadas } = pecas(); const ped = await pedir();
    const outro = 'f'.repeat(32);
    const assinatura = await hmacHex(SEGREDO, await textoDoPedido(String(T), outro, ped.corpo));
    const r = await atender(evento(ped, { headers: { ...ped.headers, [CAB.nonce]: outro, [CAB.assinatura]: assinatura } }), p);
    expect(r.statusCode).toBe(422); expect(JSON.parse(r.body)).toEqual({ ok: false, falha: 'certificado' }); expect(chamadas.postar).toHaveLength(0);
  });
  it('L9 o POST falha (tempo/tls/conexão): 502 assinado e a borda recebe a falha (o NSU não anda)', async () => {
    for (const f of ['tempo', 'tls', 'conexao'] as const) {
      const { p } = pecas({ postar: async () => { throw new FalhaDoPost(f); } }); const ped = await pedir();
      const r = await atender(evento(ped), p);
      expect(r.statusCode).toBe(502);
      await expect(ler(r, ped.nonce)).rejects.toMatchObject({ falha: f });
    }
  });
  it('L10 resposta forjada: corpo trocado, nonce de outro pedido ou sem assinatura = recusa na borda', async () => {
    const { p } = pecas(); const ped = await pedir(); const r = await atender(evento(ped), p);
    await expect(ler({ ...r, body: r.body.replace('"http":200', '"http":201') }, ped.nonce)).rejects.toMatchObject({ falha: 'assinatura_da_resposta' });
    await expect(ler(r, 'e'.repeat(32))).rejects.toMatchObject({ falha: 'assinatura_da_resposta' });
    await expect(ler({ ...r, headers: {} }, ped.nonce)).rejects.toThrow(FalhaDaLambda);
    await expect(ler(r, ped.nonce, T + 500)).rejects.toMatchObject({ falha: 'relogio_da_resposta' });
  });
  it('L11 o destino nunca vem do pedido: um "url" no corpo é ignorado; homologação vai ao endereço de homologação', async () => {
    const { p, chamadas } = pecas(); const ped = await pedir({ ambiente: 'homologacao', env: envelope({ ambiente: 'homologacao' }) });
    const corpo = ped.corpo.replace('{', '{"url":"https://exemplo.invalido/",');
    const assinatura = await hmacHex(SEGREDO, await textoDoPedido(String(T), ped.nonce, corpo));
    const r = await atender(evento(ped, { corpo, headers: { ...ped.headers, [CAB.assinatura]: assinatura } }), p);
    expect(r.statusCode).toBe(200); expect(chamadas.postar.map((c) => c.url)).toEqual([DESTINOS.homologacao]);
  });
  it('L12 troca de segredo: a Lambda aceita o atual e o anterior; responde com o atual', async () => {
    const { p } = pecas({ segredos: [SEGREDO, ANTERIOR] }); const ped = await pedir({ segredo: ANTERIOR });
    const r = await atender(evento(ped), p);
    expect(r.statusCode).toBe(200); expect((await ler(r, ped.nonce)).corpo).toBe(RESPOSTA_RECEITA);
  });
  it('L13 o LOG (todas as chamadas acima) nunca tem CPF, envelope, par, chave, nonce, assinatura nem a resposta', () => {
    expect(logs.length).toBeGreaterThan(15);
    const tudo = logs.join('\n');
    for (const proibido of [CPF, '11144477735', 'distDFeInt', 'soap', 'PRIVATE', 'CERTIFICATE', SEGREDO, ANTERIOR, 'retDistDFeInt', 'x-agro']) {
      expect(tudo).not.toContain(proibido);
    }
    expect(tudo).not.toMatch(/[0-9a-f]{32}/);
    for (const l of logs) expect(Object.keys(JSON.parse(l)).every((k) => ['req', 'ambiente', 'resultado', 'motivo', 'ms', 'http', 'bytes_ida', 'bytes_volta'].includes(k))).toBe(true);
  });
});
