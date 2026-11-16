/**
 * NOTAS-RECEITA-A1-01 · F3.2 — a ordem da busca na Receita com PEÇAS FALSAS (nenhuma rede, nenhum certificado, nenhum banco). OK do Chat 16/11 14:43:
 *   Q1 quem chama (sem token 401 · sem permissão 403 sem abrir pedido · ambiente explícito · service_role passa sem usuário)
 *   Q2 ensaio: confere a credencial e NÃO abre pedido, NÃO chama, NÃO grava
 *   Q3 relógio: pedido em espera = 409 sem ler o certificado
 *   Q4 cadeia/credencial recusada: fecha "não chamou" com a cadeia e NUNCA chama a Receita
 *   Q5 sem resposta (rede) e resposta que não se lê: fecha, não registra, o NSU não anda
 *   Q6 137 · 656 · 138: UMA chamada, o relógio e o registro (documentos e eventos só no 138; ha_mais quando ult < max)
 */
import { describe, expect, it } from 'vitest';
import { buscarDfe, type Pecas, type Pedido, type Registro } from '../../../../supabase/functions/_shared/dfe/buscarDfe';
import type { ResultadoDaCredencial } from '../../../../supabase/functions/_shared/dfe/credencialA1';

const TIT = '11111111-1111-1111-1111-111111111111';
const CLI = '22222222-2222-2222-2222-222222222222';
const CERT = '33333333-3333-3333-3333-333333333333';
const CPF = '52998224725';
const CHAVE = '35261112345678000190550010000012341000012345';
const AGORA = new Date('2026-11-16T18:00:00Z');
const CADEIA_OK = { ok: true as const, caminho: [{ nome: 'FOLHA', ate: '2027-11-16T00:00:00.000Z' }, { nome: 'AC', ate: '2030-01-01T00:00:00.000Z' },
  { nome: 'RAIZ', ate: '2029-03-02T00:00:00.000Z' }], raiz: 'AC Raiz Brasileira v5' };

async function zipar(xml: string): Promise<string> {
  const corpo = new Response(new TextEncoder().encode(xml)).body;
  if (!corpo) throw new Error('sem corpo');
  const bytes = new Uint8Array(await new Response(corpo.pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
const RES_NFE = `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>${CHAVE}</chNFe><CNPJ>12345678000190</CNPJ>`
  + '<xNome>CASA AGRO SINTETICA</xNome><IE>1</IE><dhEmi>2026-11-10T09:15:00-03:00</dhEmi><tpNF>1</tpNF><vNF>100.50</vNF><digVal>a=</digVal>'
  + '<dhRecbto>2026-11-10T09:16:00-03:00</dhRecbto><nProt>135260000000001</nProt><cSitNFe>1</cSitNFe></resNFe>';
const RES_EVENTO = `<resEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><cOrgao>35</cOrgao><CNPJ>12345678000190</CNPJ><chNFe>${CHAVE}</chNFe>`
  + '<dhEvento>2026-11-11T08:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><xEvento>Cancelamento</xEvento></resEvento>';
const ret = (cStat: string, ult: string, max: string, docs = '') => '<soap:Envelope><soap:Body><retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">'
  + `<tpAmb>1</tpAmb><cStat>${cStat}</cStat><xMotivo>motivo ${cStat}</xMotivo><dhResp>2026-11-16T15:00:00-03:00</dhResp>`
  + `<ultNSU>${ult}</ultNSU><maxNSU>${max}</maxNSU>${docs ? `<loteDistDFeInt>${docs}</loteDistDFeInt>` : ''}</retDistDFeInt></soap:Body></soap:Envelope>`;

interface Diario { chamadas: string[]; fechados: Array<{ motivo: string; detalhe: Record<string, unknown> }>; registros: Registro[]; envelopes: string[] }
function pecas(o: {
  credencial?: ResultadoDaCredencial; resposta?: () => Promise<{ status: number; corpo: string }>; pedido?: 'espera' | 'ok'; permitido?: boolean;
  uf?: string | null; ultNsu?: bigint;
} = {}): { p: Pecas; d: Diario } {
  const d: Diario = { chamadas: [], fechados: [], registros: [], envelopes: [] };
  const anota = (n: string) => d.chamadas.push(n);
  const p: Pecas = {
    ehServico: (t) => t === 'chave-servico',
    autorDoToken: async (t) => { anota('autor'); return t === 'token-gabriel' ? 'u-gabriel' : null; },
    lerTitular: async (id) => { anota('titular'); return id === TIT ? { id: TIT, cliente_id: CLI } : null; },
    podeBuscar: async () => { anota('pode'); return o.permitido ?? true; },
    abrirPedido: async () => { anota('abrir'); return o.pedido === 'espera' ? { pode: false, motivo: 'espera', ate: '2026-11-16T19:00:00Z' } : { pode: true, ultNsu: o.ultNsu ?? 0n }; },
    fecharPedido: async (_t, motivo, _c, detalhe) => { anota('fechar'); d.fechados.push({ motivo, detalhe }); },
    lerCredencial: async () => { anota('credencial'); return { certificadoId: CERT, documento: CPF, uf: o.uf === undefined ? 'SP' : o.uf, objeto: 'x/y.pfx.enc', senha: 's', impressaoDigital: 'ab' }; },
    baixarEDecifrar: async () => { anota('baixar'); return new Uint8Array([1]); },
    abrirCredencial: () => { anota('abrirCredencial'); return o.credencial ?? { ok: true, par: { cert: 'C', key: 'K' }, cadeia: CADEIA_OK, impressaoDigital: 'ab' }; },
    postarComCertificado: async (_u, _par, env) => { anota('post'); d.envelopes.push(env); return (o.resposta ?? (async () => ({ status: 200, corpo: ret('137', '000000000000000', '000000000000000') })))(); },
    registrar: async (r) => { anota('registrar'); d.registros.push(r); return { novos: r.documentos.length, atualizados: 0, eventos: r.eventos.length }; },
    url: (a) => `https://${a}.falso`,
    agora: () => AGORA,
  };
  return { p, d };
}
const pedido = (o: Partial<Pedido> = {}): Pedido => ({ token: 'token-gabriel', titularId: TIT, ambiente: 'producao', ensaio: undefined, ...o });

describe('F3.2 buscarDfe — Q1 quem chama', () => {
  it('sem token = 401; token que não é de ninguém = 401; nada lido', async () => {
    const a = pecas(); expect((await buscarDfe(pedido({ token: null }), a.p)).status).toBe(401); expect(a.d.chamadas).toEqual([]);
    const b = pecas(); expect((await buscarDfe(pedido({ token: 'lixo' }), b.p)).status).toBe(401); expect(b.d.chamadas).toEqual(['autor']);
  });
  it('sem permissão = 403 e o pedido NÃO se abre; ambiente tem de ser dito', async () => {
    const a = pecas({ permitido: false });
    expect((await buscarDfe(pedido(), a.p)).status).toBe(403);
    expect(a.d.chamadas).not.toContain('abrir');
    const b = pecas(); expect((await buscarDfe(pedido({ ambiente: undefined }), b.p)).corpo).toMatchObject({ recusa: 'ambiente' });
    expect(b.d.chamadas).not.toContain('titular');
  });
  it('a chave service_role passa sem usuário (nem autor, nem permissão)', async () => {
    const a = pecas();
    expect((await buscarDfe(pedido({ token: 'chave-servico' }), a.p)).status).toBe(200);
    expect(a.d.chamadas).not.toContain('autor'); expect(a.d.chamadas).not.toContain('pode');
  });
});

describe('F3.2 buscarDfe — Q2 ensaio', () => {
  it('abre e confere a credencial, monta o pedido; NÃO abre pedido, NÃO chama a Receita, NÃO grava nada', async () => {
    const a = pecas();
    const r = await buscarDfe(pedido({ ensaio: true }), a.p);
    expect(r).toMatchObject({ status: 200, corpo: { ok: true, ensaio: true, uf: 35, cadeia: { ok: true, raiz: 'AC Raiz Brasileira v5' } } });
    expect(a.d.chamadas).toEqual(['autor', 'titular', 'pode', 'credencial', 'baixar', 'abrirCredencial']);
  });
  it('ensaio com a cadeia recusada: diz o motivo e também não grava', async () => {
    const a = pecas({ credencial: { ok: false, recusa: 'cadeia', frase: 'falta a AC', cadeia: { ok: false, caminho: [], motivo: 'sem_intermediaria', frase: 'x' } } });
    expect((await buscarDfe(pedido({ ensaio: true }), a.p)).corpo).toMatchObject({ ok: false, recusa: 'cadeia', cadeia: { motivo: 'sem_intermediaria' } });
    expect(a.d.chamadas).not.toContain('fechar');
  });
});

describe('F3.2 buscarDfe — Q3 relógio', () => {
  it('pedido em espera = 409 com o "até"; o certificado nem é lido', async () => {
    const a = pecas({ pedido: 'espera' });
    expect(await buscarDfe(pedido(), a.p)).toMatchObject({ status: 409, corpo: { recusa: 'espera', ate: '2026-11-16T19:00:00Z' } });
    expect(a.d.chamadas).not.toContain('credencial');
  });
});

describe('F3.2 buscarDfe — Q4 recusa antes de chamar', () => {
  it('cadeia recusada: fecha "cadeia" COM a cadeia no detalhe e nunca chama a Receita', async () => {
    const cadeia = { ok: false as const, caminho: [{ nome: 'FOLHA', ate: 'x' }], motivo: 'raiz_desconhecida' as const, frase: 'fora da ICP' };
    const a = pecas({ credencial: { ok: false, recusa: 'cadeia', frase: 'fora da ICP', cadeia } });
    expect((await buscarDfe(pedido(), a.p)).status).toBe(422);
    expect(a.d.chamadas).not.toContain('post');
    expect(a.d.fechados).toEqual([{ motivo: 'cadeia', detalhe: expect.objectContaining({ cadeia: { ok: false, caminho: cadeia.caminho, motivo: 'raiz_desconhecida' } }) }]);
  });
  it('impressão diferente = fecha "certificado"; UF vazia = fecha e não chama', async () => {
    const a = pecas({ credencial: { ok: false, recusa: 'impressao_diferente', frase: 'outro arquivo', cadeia: null } });
    await buscarDfe(pedido(), a.p);
    expect(a.d.fechados.map((f) => f.motivo)).toEqual(['certificado']); expect(a.d.chamadas).not.toContain('post');
    const b = pecas({ uf: null });
    expect((await buscarDfe(pedido(), b.p)).corpo).toMatchObject({ recusa: 'uf' }); expect(b.d.chamadas).not.toContain('post');
  });
});

describe('F3.2 buscarDfe — Q5 sem resposta', () => {
  it('a conexão cai: fecha "conexao" com o erro, não registra', async () => {
    const a = pecas({ resposta: async () => { throw new TypeError('connection reset by peer'); } });
    expect(await buscarDfe(pedido(), a.p)).toMatchObject({ status: 502, corpo: { recusa: 'conexao' } });
    expect(a.d.fechados[0]).toMatchObject({ motivo: 'conexao', detalhe: { erro: 'TypeError: connection reset by peer' } });
    expect(a.d.chamadas).not.toContain('registrar');
  });
  it('um docZip que não abre: fecha "leitura" e NADA da resposta é gravado (o NSU não anda)', async () => {
    const a = pecas({ resposta: async () => ({ status: 200, corpo: ret('138', '000000000000002', '000000000000002',
      `<docZip NSU="000000000000001" schema="resNFe_v1.01.xsd">${await zipar(RES_NFE)}</docZip><docZip NSU="000000000000002" schema="resNFe_v1.01.xsd">naoegzip</docZip>`) }) });
    expect((await buscarDfe(pedido(), a.p)).corpo).toMatchObject({ recusa: 'leitura' });
    expect(a.d.registros).toEqual([]); expect(a.d.fechados.map((f) => f.motivo)).toEqual(['leitura']);
  });
  it('a página de erro do servidor (sem retDistDFeInt) = leitura', async () => {
    const a = pecas({ resposta: async () => ({ status: 403, corpo: '<html><title>403 - Forbidden</title></html>' }) });
    expect((await buscarDfe(pedido(), a.p)).corpo).toMatchObject({ recusa: 'leitura', http: 403 });
  });
});

describe('F3.2 buscarDfe — Q6 a resposta', () => {
  it('137: UMA chamada, envelope de produção da UF 35 a partir do NSU guardado, registra sem documentos e espera 1 h', async () => {
    const a = pecas({ ultNsu: 7n });
    const r = await buscarDfe(pedido(), a.p);
    expect(r.corpo).toMatchObject({ ok: true, cstat: '137', ha_mais: false, nao_antes_de: '2026-11-16T19:00:00.000Z' });
    expect(a.d.chamadas.filter((c) => c === 'post')).toHaveLength(1);
    expect(a.d.envelopes[0]).toContain(`<tpAmb>1</tpAmb><cUFAutor>35</cUFAutor><CPF>${CPF}</CPF><distNSU><ultNSU>000000000000007</ultNSU>`);
    expect(a.d.registros[0]).toMatchObject({ cstat: '137', documentos: [], eventos: [], certificadoId: CERT, ultNsu: 7n,
      detalhe: expect.objectContaining({ ambiente: 'producao', cadeia: expect.objectContaining({ ok: true }), xMotivo: 'motivo 137' }) });
  });
  it('656: registra o bloqueio de 1 h; o NSU não é mandado (não anda)', async () => {
    const a = pecas({ resposta: async () => ({ status: 200, corpo: ret('656', '000000000000000', '000000000000000') }) });
    await buscarDfe(pedido(), a.p);
    expect(a.d.registros[0]).toMatchObject({ cstat: '656', ultNsu: null, maxNsu: null, naoAntesDe: '2026-11-16T19:00:00.000Z' });
  });
  it('138 com uma nota e o cancelamento dela, ult < max: grava os dois, diz que há mais, e NÃO pede a 2ª página', async () => {
    const a = pecas({ resposta: async () => ({ status: 200, corpo: ret('138', '000000000000002', '000000000000090',
      `<docZip NSU="000000000000001" schema="resNFe_v1.01.xsd">${await zipar(RES_NFE)}</docZip>`
      + `<docZip NSU="000000000000002" schema="resEvento_v1.01.xsd">${await zipar(RES_EVENTO)}</docZip>`) }) });
    const r = await buscarDfe(pedido(), a.p);
    expect(r.corpo).toMatchObject({ ok: true, cstat: '138', documentos: 1, eventos: 1, ult_nsu: '2', max_nsu: '90', ha_mais: true, nao_antes_de: null });
    expect(a.d.chamadas.filter((c) => c === 'post')).toHaveLength(1);
    expect(a.d.registros[0].documentos[0]).toMatchObject({ chave: CHAVE, situacao: 'resumo', valor_cent: 10050, emitente_documento: '12345678000190' });
    expect(a.d.registros[0].eventos[0]).toMatchObject({ chave: CHAVE, tpEvento: '110111' });
    expect(a.d.registros[0]).toMatchObject({ ultNsu: 2n, maxNsu: 90n });
  });
  it('outro cStat (ex.: 215 erro de esquema): registra o código, ok=false, o NSU não é mandado', async () => {
    const a = pecas({ resposta: async () => ({ status: 200, corpo: ret('215', '000000000000000', '000000000000000') }) });
    const r = await buscarDfe(pedido(), a.p);
    expect(r.corpo).toMatchObject({ ok: false, cstat: '215' });
    expect(a.d.registros[0]).toMatchObject({ cstat: '215', ultNsu: null, documentos: [] });
  });
});
