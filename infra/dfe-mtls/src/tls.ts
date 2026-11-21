/**
 * NOTAS-RECEITA-A1-01 · Lambda `agro-dfe-mtls` — o POST com o certificado, em Node (`node:https`, OpenSSL). O motivo de existir: a Receita
 * pede o certificado do cliente por RENEGOCIAÇÃO TLS ("Hello request" depois do pedido), que o rustls do Deno não faz e o OpenSSL faz.
 * Só HTTP/1.1, mínimo TLS 1.2, servidor conferido (CAs padrão + nome), sem reaproveitar sessão, 30 s, UMA tentativa.
 */
import { Agent, request } from 'node:https';
import { FalhaDoPost, MAX_RESPOSTA } from './regra.ts';
import { CONTENT_TYPES, type ServicoLambda } from '../../../supabase/functions/_shared/dfe/protocoloLambda.ts';

/* Lambda v2: o tipo do pedido vem do SERVIÇO que a regra reconheceu no envelope (Distribuição ou Evento 210210) */
export const CONTENT_TYPE = CONTENT_TYPES.distribuicao;
const ESPERA_MS = 30_000;

/** `ca` só no teste (o servidor local sintético); em produção valem as CAs padrão do Node */
export function postarMtls(url: string, par: { cert: string; key: string }, envelope: string, opcoes: { ca?: string; esperaMs?: number; servico?: ServicoLambda } = {}):
  Promise<{ status: number; corpo: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const agente = new Agent({ keepAlive: false, maxCachedSessions: 0 });
    const corpo = Buffer.from(envelope, 'utf8');
    let feito = false;
    const fim = (f: () => void) => { if (!feito) { feito = true; agente.destroy(); f(); } };
    const req = request(url, {
      method: 'POST', agent: agente, cert: par.cert, key: par.key, ca: opcoes.ca, minVersion: 'TLSv1.2', rejectUnauthorized: true,
      headers: { 'Content-Type': CONTENT_TYPES[opcoes.servico ?? 'distribuicao'], 'Content-Length': String(corpo.length) }, timeout: opcoes.esperaMs ?? ESPERA_MS,
    }, (res) => {
      const partes: Buffer[] = []; let total = 0;
      res.on('data', (c: Buffer) => {
        total += c.length;
        if (total > MAX_RESPOSTA) { req.destroy(); fim(() => reject(new FalhaDoPost('conexao'))); return; }
        partes.push(c);
      });
      res.on('end', () => fim(() => resolve({ status: res.statusCode ?? 0, corpo: new Uint8Array(Buffer.concat(partes)) })));
      res.on('error', () => fim(() => reject(new FalhaDoPost('conexao'))));
    });
    req.on('timeout', () => { req.destroy(); fim(() => reject(new FalhaDoPost('tempo'))); });
    req.on('error', (e: NodeJS.ErrnoException) => {
      const c = String(e.code ?? '');
      fim(() => reject(new FalhaDoPost(/SSL|TLS|CERT|EPROTO|UNABLE_TO|SELF_SIGNED|HOSTNAME|ALTNAME/i.test(c) ? 'tls' : 'conexao')));
    });
    req.end(corpo);
  });
}
