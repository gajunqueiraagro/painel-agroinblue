/**
 * NOTAS-RECEITA · CIÊNCIA DA OPERAÇÃO (210210) — o evento assinado, a Lambda v2 e a ordem de um envio. Certificado SINTÉTICO, "KMS" local,
 * nenhuma rede, nenhuma Receita.
 *   E1 o envelope casa com a regra da Lambda (serviço "evento", o documento do titular) · E2 a ASSINATURA se confere (digest do infEvento
 *   canônico e RSA-SHA1 do SignedInfo com a pública do certificado) · E3 SÓ o 210210: Confirmação/Desconhecimento/Não realizada, texto
 *   trocado, chave diferente no chNFe ou na Reference, ambiente trocado e conteúdo a mais = 422 sem KMS nem POST · E4 a volta inteira vai ao
 *   destino FIXO da Recepção de Evento com o tipo do evento (a Distribuição segue no dela) · E5 o retEnvEvento (135 · 573 · recusa do lote)
 *   · E6 a ordem (ensaio não envia nem grava; permissão; conexão e leitura viram trilha) · E7 o dhEvento em Brasília.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { atender, conferirEnvelope, type EventoUrl, type PecasLambda } from '../../../../infra/dfe-mtls/src/regra';
import { importarPublica, lerRespostaLambda, montarPedidoLambda } from '../../../../supabase/functions/_shared/dfe/clienteLambda';
import { CAB, DESTINOS, DESTINOS_EVENTO } from '../../../../supabase/functions/_shared/dfe/protocoloLambda';
import { envelopeDistDFe } from '../../../../supabase/functions/_shared/dfe/distribuicaoDfe';
import { dhEventoBrasilia, envelopeCiencia, lerRetornoEvento } from '../../../../supabase/functions/_shared/dfe/eventoCiencia';
import { cienciaDfe, type PecasCiencia, type RegistroDoEvento } from '../../../../supabase/functions/_shared/dfe/cienciaDfe';

const CPF = '52998224725';
const CHAVE = '35261199999999000191550040012266161157868177';
const SEGREDO = 'a'.repeat(64);
const T = 1_794_900_000;
const AGORA = new Date('2026-11-18T12:30:00Z');
let par: { cert: string; key: string };
let kms: CryptoKeyPair;
let publicaPem: string;

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
  kms = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kms.publicKey));
  publicaPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(spki).toString('base64')}\n-----END PUBLIC KEY-----\n`;
}, 60000);

const ciencia = (o: { ambiente?: 'producao' | 'homologacao'; chave?: string; documento?: string } = {}) =>
  envelopeCiencia({ ambiente: o.ambiente ?? 'producao', documento: o.documento ?? CPF, chave: o.chave ?? CHAVE, agora: AGORA, idLote: '1794900000123', par });

function pecasLambda() {
  const chamadas = { kms: 0, postar: [] as { url: string; envelope: string; servico: string }[] };
  const p: PecasLambda = {
    segredos: async () => [SEGREDO], agoraSegundos: () => T,
    registrarNonce: async () => true,
    desembrulhar: async (c) => { chamadas.kms++; return new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, kms.privateKey, c)); },
    postar: async (url, _par, envelope, servico) => { chamadas.postar.push({ url, envelope, servico }); return { status: 200, corpo: new TextEncoder().encode('<ret/>') }; },
    log: () => {},
  };
  return { p, chamadas };
}
async function volta(env: string, ambiente: 'producao' | 'homologacao' = 'producao') {
  const ped = await montarPedidoLambda({ ambiente, envelope: env, par, segredo: SEGREDO, publica: await importarPublica(publicaPem), agoraSegundos: T });
  const ev: EventoUrl = { body: ped.corpo, rawPath: '/', requestContext: { http: { method: 'POST' }, requestId: 'r' },
    headers: Object.fromEntries(Object.entries(ped.headers).map(([k, v]) => [k.toLowerCase(), v])) };
  const { p, chamadas } = pecasLambda();
  const r = await atender(ev, p);
  return { r, chamadas, ler: () => lerRespostaLambda({ status: r.statusCode, tempo: r.headers[CAB.tempo] ?? null, assinatura: r.headers[CAB.assinatura] ?? null,
    corpo: r.body, nonce: ped.nonce, segredo: SEGREDO, agoraSegundos: T }) };
}

describe('CIÊNCIA 210210 — o evento e a Lambda v2', () => {
  it('E1 o envelope casa com a regra da Lambda: serviço "evento", o documento do titular; cabe no teto', () => {
    const { envelope, id } = ciencia();
    expect(id).toBe(`ID210210${CHAVE}01`);
    expect(conferirEnvelope(envelope, 'producao')).toEqual({ ok: true, documento: CPF, servico: 'evento' });
    expect(conferirEnvelope(envelopeDistDFe({ ambiente: 'producao', uf: 35, documento: CPF, pedido: { tipo: 'distNSU', ultNsu: 0 } }), 'producao'))
      .toEqual({ ok: true, documento: CPF, servico: 'distribuicao' });
  });

  it('E2 a assinatura se confere: digest SHA-1 do infEvento canônico e RSA-SHA1 do SignedInfo canônico com a pública do certificado', () => {
    const { envelope, digest } = ciencia();
    const inf = /<infEvento Id="([^"]+)">([\s\S]*?)<\/infEvento>/.exec(envelope)!;
    const canonInf = `<infEvento xmlns="http://www.portalfiscal.inf.br/nfe" Id="${inf[1]}">${inf[2]}</infEvento>`;
    const md = forge.md.sha1.create(); md.update(canonInf, 'utf8');
    expect(forge.util.encode64(md.digest().getBytes())).toBe(digest);
    expect(envelope).toContain(`<DigestValue>${digest}</DigestValue>`);
    const si = /<SignedInfo>([\s\S]*?)<\/SignedInfo>/.exec(envelope)![1];
    const canonSi = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">${si}</SignedInfo>`;
    const valor = forge.util.decode64(/<SignatureValue>([^<]+)<\/SignatureValue>/.exec(envelope)![1]);
    const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(/<X509Certificate>([^<]+)<\/X509Certificate>/.exec(envelope)![1])));
    const mdSi = forge.md.sha1.create(); mdSi.update(canonSi, 'utf8');
    expect((cert.publicKey as forge.pki.rsa.PublicKey).verify(mdSi.digest().getBytes(), valor)).toBe(true);
    /* sem chave privada nem PEM no envelope */
    expect(envelope).not.toMatch(/PRIVATE KEY|BEGIN CERTIFICATE/);
  });

  it('E3 SÓ o 210210 passa: outro evento, outro texto, outra chave, ambiente trocado ou conteúdo a mais = 422 sem KMS nem POST', async () => {
    const { envelope } = ciencia();
    const outra = '41261199999999000191550040012266161157868100';
    const tortos: [string, 'producao' | 'homologacao'][] = [
      [envelope.replace('<tpEvento>210210</tpEvento>', '<tpEvento>210200</tpEvento>'), 'producao'],
      [envelope.replace('<tpEvento>210210</tpEvento>', '<tpEvento>210220</tpEvento>'), 'producao'],
      [envelope.replace('<tpEvento>210210</tpEvento>', '<tpEvento>210240</tpEvento>'), 'producao'],
      [envelope.replace('Ciencia da Operacao', 'Confirmacao da Operacao'), 'producao'],
      [envelope.replace(`<chNFe>${CHAVE}</chNFe>`, `<chNFe>${outra}</chNFe>`), 'producao'],
      [envelope.replace(`URI="#ID210210${CHAVE}01"`, `URI="#ID210210${outra}01"`), 'producao'],
      [envelope.replace('<nSeqEvento>1</nSeqEvento>', '<nSeqEvento>2</nSeqEvento>'), 'producao'],
      [envelope.replace('<cOrgao>91</cOrgao>', '<cOrgao>35</cOrgao>'), 'producao'],
      [envelope, 'homologacao'],
      [envelope.replace('</evento>', '</evento><evento/>'), 'producao'],
      [envelope + ' ', 'producao'],
    ];
    for (const [env, amb] of tortos) {
      expect(conferirEnvelope(env, amb)).toEqual({ ok: false });
      const { r, chamadas } = await volta(env, amb);
      expect(r.statusCode).toBe(422);
      expect(chamadas.kms).toBe(0); expect(chamadas.postar).toHaveLength(0);
    }
  });

  it('E4 a volta inteira: o evento vai ao destino FIXO da Recepção de Evento (com o tipo dele); a Distribuição segue no dela', async () => {
    const ev = await volta(ciencia().envelope);
    expect(ev.r.statusCode).toBe(200);
    expect(ev.chamadas.postar).toEqual([{ url: DESTINOS_EVENTO.producao, envelope: ciencia().envelope, servico: 'evento' }]);
    expect(await ev.ler()).toEqual({ status: 200, corpo: '<ret/>' });
    const hom = await volta(ciencia({ ambiente: 'homologacao' }).envelope, 'homologacao');
    expect(hom.chamadas.postar[0].url).toBe(DESTINOS_EVENTO.homologacao);
    const dist = await volta(envelopeDistDFe({ ambiente: 'producao', uf: 35, documento: CPF, pedido: { tipo: 'distNSU', ultNsu: 0 } }));
    expect(dist.chamadas.postar[0]).toMatchObject({ url: DESTINOS.producao, servico: 'distribuicao' });
  });
});

const RET = (cStat: string, xMotivo: string, nProt = '') => '<soap:Envelope><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">'
  + '<retEnvEvento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote><tpAmb>1</tpAmb><verAplic>AN</verAplic><cOrgao>91</cOrgao>'
  + `<cStat>128</cStat><xMotivo>Lote de evento processado</xMotivo><retEvento versao="1.00"><infEvento Id="ID1"><tpAmb>1</tpAmb><verAplic>AN</verAplic>`
  + `<cOrgao>91</cOrgao><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo><chNFe>${CHAVE}</chNFe><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento>`
  + `<dhRegEvento>2026-11-18T09:30:01-03:00</dhRegEvento>${nProt ? `<nProt>${nProt}</nProt>` : ''}</infEvento></retEvento></retEnvEvento></nfeResultMsg></soap:Body></soap:Envelope>`;

describe('CIÊNCIA 210210 — a resposta e a ordem do envio', () => {
  it('E5 o retEnvEvento: 135 registrado (com protocolo), 573 duplicidade, recusa do lote sem retEvento', () => {
    expect(lerRetornoEvento(RET('135', 'Evento registrado e vinculado a NF-e', '891260000000001'))).toEqual({
      cStatLote: '128', xMotivoLote: 'Lote de evento processado', cStat: '135', xMotivo: 'Evento registrado e vinculado a NF-e',
      nProt: '891260000000001', dhRegEvento: '2026-11-18T09:30:01-03:00' });
    expect(lerRetornoEvento(RET('573', 'Rejeicao: Duplicidade de evento')).cStat).toBe('573');
    const lote = lerRetornoEvento('<retEnvEvento><cStat>215</cStat><xMotivo>Rejeicao: Falha no schema XML</xMotivo></retEnvEvento>');
    expect(lote).toMatchObject({ cStatLote: '215', cStat: null });
    expect(() => lerRetornoEvento('<html>erro</html>')).toThrow();
  });

  function pecasCiencia(o: { postar?: PecasCiencia['postarEvento']; pode?: boolean } = {}) {
    const trilha: RegistroDoEvento[] = []; const posts: string[] = [];
    const p: PecasCiencia = {
      ehServico: (t) => t === 'servico', autorDoToken: async (t) => (t === 'usuario' ? 'u-1' : null),
      lerTitular: async (id) => (id === 'tit' ? { id: 'tit', cliente_id: 'cli' } : null),
      podeBuscar: async () => o.pode ?? true,
      lerCredencial: async () => ({ certificadoId: 'cert-1', documento: CPF, uf: 'SP', objeto: 'o', senha: 's', impressaoDigital: 'x' }),
      baixarEDecifrar: async () => new Uint8Array([1]),
      abrirCredencial: () => ({ ok: true, par, cadeia: { ok: true, caminho: [], raiz: 'R' }, impressaoDigital: 'x' }),
      postarEvento: o.postar ?? (async (_a, _p, env) => { posts.push(env); return { status: 200, corpo: RET('135', 'Evento registrado e vinculado a NF-e', '891') }; }),
      registrarEvento: async (r) => { trilha.push(r); return { id: trilha.length, com_ciencia: r.cStat === '135' || r.cStat === '573' }; },
      agora: () => AGORA,
    };
    return { p, trilha, posts };
  }

  it('E6 a ordem: ensaio não envia nem grava; sem permissão 403; 135 grava a trilha; conexão e leitura viram trilha com a falha', async () => {
    const pedido = { token: 'usuario', titularId: 'tit', ambiente: 'producao', chave: CHAVE };
    let x = pecasCiencia();
    let r = await cienciaDfe({ ...pedido, ensaio: true }, x.p);
    expect(r.corpo).toMatchObject({ ok: true, ensaio: true }); expect(x.posts).toHaveLength(0); expect(x.trilha).toHaveLength(0);

    x = pecasCiencia({ pode: false });
    r = await cienciaDfe(pedido, x.p);
    expect(r.status).toBe(403); expect(x.posts).toHaveLength(0);

    expect((await cienciaDfe({ ...pedido, chave: '123' }, pecasCiencia().p)).status).toBe(400);
    expect((await cienciaDfe({ ...pedido, token: null }, pecasCiencia().p)).status).toBe(401);

    x = pecasCiencia();
    r = await cienciaDfe({ ...pedido, via: 'automatica' }, x.p);
    expect(r.corpo).toMatchObject({ ok: true, cstat: '135', n_prot: '891', com_ciencia: true });
    expect(x.posts).toHaveLength(1);
    /* o usuário nunca grava "automatica": só a service_role */
    expect(x.trilha).toEqual([expect.objectContaining({ chave: CHAVE, cStat: '135', cStatLote: '128', via: 'manual', autor: 'u-1', falha: null })]);
    x = pecasCiencia();
    await cienciaDfe({ ...pedido, token: 'servico', via: 'automatica' }, x.p);
    expect(x.trilha[0]).toMatchObject({ via: 'automatica', autor: null });

    x = pecasCiencia({ postar: async () => { throw new Error('tempo'); } });
    r = await cienciaDfe(pedido, x.p);
    expect(r.status).toBe(502); expect(x.trilha[0]).toMatchObject({ falha: 'conexao', cStat: null });

    x = pecasCiencia({ postar: async () => ({ status: 500, corpo: '<html>fora</html>' }) });
    r = await cienciaDfe(pedido, x.p);
    expect(r.status).toBe(502); expect(x.trilha[0]).toMatchObject({ falha: 'leitura', bruto: '<html>fora</html>' });

    x = pecasCiencia({ postar: async () => ({ status: 200, corpo: RET('596', 'Rejeicao: Evento apresentado apos o prazo') }) });
    r = await cienciaDfe(pedido, x.p);
    expect(r.corpo).toMatchObject({ ok: false, cstat: '596', com_ciencia: false });
    expect(String(r.corpo.frase)).toContain('596');
  });

  it('E7 o dhEvento sai no horário de Brasília (UTC−3)', () => {
    expect(dhEventoBrasilia(new Date('2026-11-18T12:30:05Z'))).toBe('2026-11-18T09:30:05-03:00');
    expect(dhEventoBrasilia(new Date('2026-11-19T01:00:00Z'))).toBe('2026-11-18T22:00:00-03:00');
  });
});
