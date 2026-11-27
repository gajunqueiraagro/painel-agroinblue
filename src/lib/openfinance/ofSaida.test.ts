/**
 * OF-IP-FIXO-01 · a saída do Open Finance com IP fixo (Lambda `agro-of-saida`) — o protocolo de ponta a ponta (borda → Lambda → borda),
 * com o provedor FALSO e nenhuma rede. Nenhuma AWS, nenhuma TecnoSpeed.
 *   S1 a volta inteira (o token entra NA LAMBDA; a borda nunca o vê) · S2 assinatura errada · S3 relógio · S4 nonce repetido · S5 o
 *   caminho fora da lista, com "..", "//" ou host · S6 o host nunca vem do pedido · S7 sem configuração · S8 resposta forjada · S9 o LOG
 *   nunca tem conteúdo · S10 troca de segredo · S11 a chave OF_PROVEDOR (volta atrás sem deploy) · S12 as credenciais filtradas
 *   S13–S16 a SONDA (27/11): "caminho" só com a volta inteira de pé · só o admin · cada falha com a sua frase · nunca o segredo nem a URL
 */
import { describe, expect, it } from 'vitest';
import { atender, type EventoUrl, FalhaDaChamada, lerCredenciais, type PecasSaida } from '../../../infra/of-saida/src/regra';
import {
  CAMINHO_DA_SONDA, chamarPelaSaida, configuracaoDaSaida, FalhaDaSaida, lerRespostaSaida, montarPedidoSaida, type PecasDaSonda, provedorDoOF,
  sondarSaida,
} from '../../../supabase/functions/_shared/of/clienteSaida';
import { baseValida, caminhoPermitido, prefixosPermitidos } from '../../../supabase/functions/_shared/of/protocoloSaida';
import { CAB } from '../../../supabase/functions/_shared/dfe/protocoloLambda';

const SEGREDO = 'a'.repeat(64);
const ANTERIOR = 'b'.repeat(64);
const T = 1_794_900_000;
const TOKEN = 'Bearer token-sintetico-do-provedor';
const BASE = 'https://api.provedor.exemplo';

function lambda(o: Partial<PecasSaida> = {}, segredos = [SEGREDO]) {
  const chamadas: Array<{ url: string; metodo: string; cabecalhos: Record<string, string>; corpo: string | null }> = [];
  const logs: string[] = [];
  const nonces = new Set<string>();
  const pecas: PecasSaida = {
    segredos: async () => segredos,
    agoraSegundos: () => T,
    registrarNonce: async (n) => { if (nonces.has(n)) return false; nonces.add(n); return true; },
    credenciais: async () => ({ cabecalhos: { Authorization: TOKEN } }),
    chamar: async (url, metodo, cabecalhos, corpo) => { chamadas.push({ url, metodo, cabecalhos, corpo }); return { status: 200, corpo: new TextEncoder().encode('{"saldo":"sintetico"}') }; },
    destinoBase: BASE,
    caminhosPermitidos: '/openfinance/v1/',
    log: (l) => logs.push(JSON.stringify(l)),
    ...o,
  };
  return { pecas, chamadas, logs };
}
const evento = (p: { corpo: string; headers: Record<string, string> }): EventoUrl => ({
  body: p.corpo, rawPath: '/', headers: Object.fromEntries(Object.entries(p.headers).map(([k, v]) => [k.toLowerCase(), v])),
  requestContext: { http: { method: 'POST' }, requestId: 'req-1' },
});
async function volta(l: ReturnType<typeof lambda>, caminho = '/openfinance/v1/contas/123/extrato?de=2026-11-01', metodo: 'GET' | 'POST' = 'GET', corpo?: string) {
  return chamarPelaSaida({
    config: { url: 'https://abc.lambda-url.sa-east-1.on.aws/', segredo: SEGREDO }, metodo, caminho, corpo, agoraSegundos: () => T,
    busca: async (_url, init) => {
      const r = await atender(evento({ corpo: init.body, headers: init.headers }), l.pecas);
      return { status: r.statusCode, header: (n) => r.headers[n] ?? null, texto: async () => r.body };
    },
  });
}

describe('OF-IP-FIXO-01 — a saída com IP fixo', () => {
  it('S1 a volta inteira: o token entra NA LAMBDA (a borda não o manda) e a resposta volta assinada', async () => {
    const l = lambda();
    const r = await volta(l);
    expect(r).toEqual({ status: 200, corpo: '{"saldo":"sintetico"}' });
    expect(l.chamadas).toHaveLength(1);
    expect(l.chamadas[0]).toMatchObject({ url: `${BASE}/openfinance/v1/contas/123/extrato?de=2026-11-01`, metodo: 'GET', corpo: null });
    expect(l.chamadas[0].cabecalhos.Authorization).toBe(TOKEN);
    const p = await montarPedidoSaida({ metodo: 'GET', caminho: '/openfinance/v1/x', segredo: SEGREDO, agoraSegundos: T });
    expect(p.corpo).not.toContain('Bearer');
    expect(Object.keys(p.headers).map((k) => k.toLowerCase())).not.toContain('authorization');
  });

  it('S2 assinatura errada (outro segredo): 401 e nada sai', async () => {
    const l = lambda();
    const p = await montarPedidoSaida({ metodo: 'GET', caminho: '/openfinance/v1/x', segredo: 'c'.repeat(64), agoraSegundos: T });
    const r = await atender(evento(p), l.pecas);
    expect(r.statusCode).toBe(401);
    expect(l.chamadas).toHaveLength(0);
  });

  it('S3 relógio fora da janela (60 s): 401', async () => {
    const l = lambda();
    const p = await montarPedidoSaida({ metodo: 'GET', caminho: '/openfinance/v1/x', segredo: SEGREDO, agoraSegundos: T - 120 });
    expect((await atender(evento(p), l.pecas)).statusCode).toBe(401);
    expect(l.chamadas).toHaveLength(0);
  });

  it('S4 o mesmo pedido de novo (nonce repetido): 401 na 2ª vez', async () => {
    const l = lambda();
    const p = await montarPedidoSaida({ metodo: 'GET', caminho: '/openfinance/v1/x', segredo: SEGREDO, agoraSegundos: T });
    expect((await atender(evento(p), l.pecas)).statusCode).toBe(200);
    expect((await atender(evento(p), l.pecas)).statusCode).toBe(401);
    expect(l.chamadas).toHaveLength(1);
  });

  it('S5 o caminho fora da lista, com "..", "//" ou host: recusado (422) e nada sai; lista vazia = nada passa', async () => {
    for (const c of ['/admin/x', '/openfinance/v1/../admin', '/openfinance/v1//x', 'https://outro.host/openfinance/v1/x', '//outro.host/x']) {
      const l = lambda();
      await expect(volta(l, c)).rejects.toMatchObject({ falha: 'caminho' });
      expect(l.chamadas).toHaveLength(0);
    }
    const vazia = lambda({ caminhosPermitidos: '' });
    await expect(volta(vazia)).rejects.toMatchObject({ falha: 'caminho' });
    expect(caminhoPermitido('/openfinance/v1/x', prefixosPermitidos(''))).toBe(false);
  });

  it('S6 o host nunca vem do pedido: a base é a fixa da função; base torta = configuração', async () => {
    const l = lambda();
    await volta(l, '/openfinance/v1/x');
    expect(l.chamadas[0].url.startsWith(`${BASE}/`)).toBe(true);
    expect(baseValida('http://api.x.com')).toBeNull();
    expect(baseValida('https://api.x.com/caminho')).toBeNull();
    expect(baseValida('https://user:pass@api.x.com')).toBeNull();
    expect(baseValida('https://api.x.com')).toBe('https://api.x.com');
    await expect(volta(lambda({ destinoBase: 'http://api.x.com' }))).rejects.toMatchObject({ falha: 'configuracao' });
  });

  it('S7 sem as credenciais do provedor: configuração (nada sai)', async () => {
    const l = lambda({ credenciais: async () => null });
    await expect(volta(l)).rejects.toMatchObject({ falha: 'configuracao' });
    expect(l.chamadas).toHaveLength(0);
  });

  it('S8 resposta forjada (assinatura de outro segredo) ou de outro nonce: FalhaDaSaida', async () => {
    const p = await montarPedidoSaida({ metodo: 'GET', caminho: '/openfinance/v1/x', segredo: SEGREDO, agoraSegundos: T });
    const r = await atender(evento(p), lambda().pecas);
    await expect(lerRespostaSaida({ status: 200, tempo: r.headers[CAB.tempo], assinatura: r.headers[CAB.assinatura], corpo: r.body,
      nonce: 'f'.repeat(32), segredo: SEGREDO, agoraSegundos: T })).rejects.toBeInstanceOf(FalhaDaSaida);
    await expect(lerRespostaSaida({ status: 200, tempo: r.headers[CAB.tempo], assinatura: r.headers[CAB.assinatura], corpo: r.body.replace('true', 'true '),
      nonce: p.nonce, segredo: SEGREDO, agoraSegundos: T })).rejects.toMatchObject({ falha: 'assinatura_da_resposta' });
  });

  it('S9 o LOG nunca tem conteúdo: nem caminho, nem corpo, nem token, nem nonce', async () => {
    const l = lambda();
    await volta(l, '/openfinance/v1/contas/123/extrato', 'POST', '{"conta":"123-4"}');
    await volta(lambda({ chamar: async () => { throw new FalhaDaChamada('tls'); } }), '/openfinance/v1/x').catch(() => null);
    const tudo = l.logs.join('\n');
    expect(tudo).toContain('"resultado":"ok"');
    for (const proibido of ['contas/123', '123-4', 'Bearer', 'token', 'extrato']) expect(tudo).not.toContain(proibido);
  });

  it('S10 troca de segredo: o pedido assinado com o ANTERIOR ainda passa durante a troca', async () => {
    const l = lambda({}, [SEGREDO, ANTERIOR]);
    const p = await montarPedidoSaida({ metodo: 'GET', caminho: '/openfinance/v1/x', segredo: ANTERIOR, agoraSegundos: T });
    expect((await atender(evento(p), l.pecas)).statusCode).toBe(200);
  });

  it('S11 OF_PROVEDOR: só "tecnospeed" liga a saída nova; vazio ou qualquer outro valor = o caminho de hoje (pluggy)', () => {
    expect(provedorDoOF('tecnospeed')).toBe('tecnospeed');
    expect(provedorDoOF(' TecnoSpeed ')).toBe('tecnospeed');
    for (const v of [undefined, null, '', 'pluggy', 'outro']) expect(provedorDoOF(v)).toBe('pluggy');
    expect(configuracaoDaSaida({ url: 'https://abc.lambda-url.sa-east-1.on.aws/', hmac: SEGREDO })).toEqual({ url: 'https://abc.lambda-url.sa-east-1.on.aws/', segredo: SEGREDO });
    expect(configuracaoDaSaida({ url: 'https://evil.example.com/', hmac: SEGREDO })).toBeNull();
    expect(configuracaoDaSaida({ url: 'https://abc.lambda-url.sa-east-1.on.aws/', hmac: 'curto' })).toBeNull();
  });

  it('S12 as credenciais do provedor: só cabeçalho válido; Host/Content-Length/Proxy-Authorization fora; o par PEM só se vier inteiro', () => {
    expect(lerCredenciais('{"cabecalhos":{"Authorization":"Bearer x","Host":"evil","Proxy-Authorization":"y","x y":"z"}}'))
      .toEqual({ cabecalhos: { Authorization: 'Bearer x' } });
    expect(lerCredenciais('{}')).toBeNull();
    expect(lerCredenciais('não é json')).toBeNull();
    const c = lerCredenciais('{"cabecalhos":{"x-api-key":"k"},"cert":"-----BEGIN CERTIFICATE-----x","key":"-----BEGIN PRIVATE KEY-----y"}');
    expect(c?.cert && c.key).toBeTruthy();
  });
});

const URL_LAMBDA = 'https://abc.lambda-url.sa-east-1.on.aws/';
/** a sonda contra a Lambda de verdade (a regra `atender`), com os caminhos da pilha no ar: VAZIOS */
function sonda(o: Partial<PecasDaSonda> = {}, l = lambda({ caminhosPermitidos: '' })) {
  const pecas: PecasDaSonda = {
    token: 'jwt-sintetico', autorDoToken: async () => 'admin-1', ehAdmin: async () => true,
    config: { url: URL_LAMBDA, segredo: SEGREDO }, agoraSegundos: () => T,
    busca: async (_url, init) => {
      const r = await atender(evento({ corpo: init.body, headers: init.headers }), l.pecas);
      return { status: r.statusCode, header: (n) => r.headers[n] ?? null, texto: async () => r.body };
    },
    ...o,
  };
  return { pecas, l };
}
const semAssinatura = (status: number, body: string): PecasDaSonda['busca'] => async () => ({ status, header: () => null, texto: async () => body });

describe('OF-IP-FIXO-01 — a SONDA da saída (o teste de ponta a ponta sem provedor)', () => {
  it('S13 caminho fechado: "caminho" (ok) e a Lambda NÃO lê o provedor nem chama ninguém; caminho aberto = alerta', async () => {
    let leuProvedor = false;
    const s = sonda({}, lambda({ caminhosPermitidos: '', credenciais: async () => { leuProvedor = true; return null; } }));
    const r = await sondarSaida(s.pecas);
    expect(r).toMatchObject({ status: 200, corpo: { ok: true, resultado: 'caminho' } });
    expect(leuProvedor).toBe(false);
    expect(s.l.chamadas).toHaveLength(0);
    expect(s.l.logs.join('\n')).toContain('"resultado":"caminho"');
    const aberto = sonda({}, lambda({ caminhosPermitidos: CAMINHO_DA_SONDA }));
    expect((await sondarSaida(aberto.pecas)).corpo).toMatchObject({ ok: false, resultado: 'caminho_aberto' });
  });

  it('S14 só o admin: sem login 401, sem admin 403 — e a Lambda nem é chamada', async () => {
    let chamou = false;
    const busca: PecasDaSonda['busca'] = async () => { chamou = true; return { status: 500, header: () => null, texto: async () => '' }; };
    expect((await sondarSaida(sonda({ token: null, busca }).pecas)).status).toBe(401);
    expect((await sondarSaida(sonda({ autorDoToken: async () => null, busca }).pecas)).status).toBe(401);
    expect((await sondarSaida(sonda({ ehAdmin: async () => false, busca }).pecas))).toMatchObject({ status: 403, corpo: { resultado: 'so_admin' } });
    expect(chamou).toBe(false);
  });

  it('S15 cada falha com a sua frase: segredos faltando, HMAC errado, sem código, Forbidden, interno, rede', async () => {
    const caso = async (o: Partial<PecasDaSonda>, l?: ReturnType<typeof lambda>) => (await sondarSaida(sonda(o, l).pecas)).corpo;
    expect(await caso({ config: configuracaoDaSaida({ url: null, hmac: SEGREDO }) })).toMatchObject({ ok: false, resultado: 'configuracao_supabase' });
    expect(await caso({ config: { url: URL_LAMBDA, segredo: ANTERIOR } })).toMatchObject({ ok: false, resultado: 'nao_autorizado' });
    expect(await caso({ busca: semAssinatura(503, '{"ok":false,"falha":"sem_codigo"}') })).toMatchObject({ resultado: 'sem_assinatura_503' });
    expect(await caso({ busca: semAssinatura(403, '{"Message":"Forbidden"}') })).toMatchObject({ resultado: 'sem_assinatura_403' });
    expect(await caso({ busca: semAssinatura(500, '{"ok":false,"falha":"interno"}') })).toMatchObject({ resultado: 'sem_assinatura_500' });
    expect(await caso({ busca: async () => { throw new Error('rede'); } })).toMatchObject({ resultado: 'conexao' });
    expect(await caso({ busca: semAssinatura(418, '') })).toMatchObject({ ok: false, resultado: 'sem_assinatura_418' });
    for (const r of ['nao_autorizado', 'sem_assinatura_500', 'sem_assinatura_418']) {
      expect((await caso({ busca: semAssinatura(r === 'nao_autorizado' ? 401 : Number(r.slice(-3)), '') })).frase.length).toBeGreaterThan(20);
    }
  });

  it('S16 a resposta da sonda nunca traz o segredo, a URL da Lambda nem o caminho', async () => {
    const tudo = JSON.stringify([
      await sondarSaida(sonda().pecas),
      await sondarSaida(sonda({ config: { url: URL_LAMBDA, segredo: ANTERIOR } }).pecas),
      await sondarSaida(sonda({ busca: semAssinatura(500, '') }).pecas),
    ]);
    for (const proibido of [SEGREDO, ANTERIOR, 'lambda-url', CAMINHO_DA_SONDA]) expect(tudo).not.toContain(proibido);
  });
});
