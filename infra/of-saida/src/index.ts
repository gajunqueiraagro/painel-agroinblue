/**
 * OF-IP-FIXO-01 · o ponto de entrada da Lambda `agro-of-saida` (Node.js 22, sa-east-1, numa sub-rede PRIVADA: sai pela NAT com o Elastic IP).
 * Liga as peças da AWS à `regra.ts`. Variáveis (nenhuma é segredo): SEGREDO_HMAC_ID (Secrets Manager: o HMAC, 1 linha; 2 = atual e anterior,
 * na troca), SEGREDO_PROVEDOR_ID (Secrets Manager: JSON { cabecalhos: {...}, cert?, key? } — o token do provedor), TABELA_NONCES (DynamoDB,
 * chave "nonce", TTL "expira"), DESTINO_BASE (https://<host do provedor>), CAMINHOS_PERMITIDOS (prefixos, separados por vírgula).
 * ⚠ Não loga corpo, cabeçalho, caminho, token, nonce nem assinatura: só o resultado, o status, os bytes e o tempo.
 */
import { request } from 'node:https';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient, PutItemCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { atender, FalhaDaChamada, lerCredenciais, MAX_RESPOSTA, type CredenciaisDoProvedor, type EventoUrl } from './regra.ts';

const regiao = 'sa-east-1';
const sm = new SecretsManagerClient({ region: regiao });
const ddb = new DynamoDBClient({ region: regiao });
let hmacEmCache: { lista: string[]; ate: number } | null = null;
let credEmCache: { cred: CredenciaisDoProvedor | null; ate: number } | null = null;
const TEMPO_MS = 25_000;

/** UMA chamada HTTPS: o certificado do servidor é sempre conferido (o padrão do Node; nunca `rejectUnauthorized: false`) */
function chamar(url: string, metodo: 'GET' | 'POST', cabecalhos: Record<string, string>, corpo: string | null,
  par: { cert: string; key: string } | null): Promise<{ status: number; corpo: Uint8Array }> {
  return new Promise((ok, falhou) => {
    const u = new URL(url);
    const r = request({ method: metodo, hostname: u.hostname, port: 443, path: `${u.pathname}${u.search}`, servername: u.hostname,
      headers: { ...cabecalhos, ...(corpo !== null ? { 'Content-Length': String(Buffer.byteLength(corpo)) } : {}) },
      ...(par ? { cert: par.cert, key: par.key } : {}), timeout: TEMPO_MS }, (res) => {
      const partes: Buffer[] = []; let total = 0;
      res.on('data', (b: Buffer) => { total += b.length; if (total > MAX_RESPOSTA + 1) { r.destroy(); return; } partes.push(b); });
      res.on('end', () => ok({ status: res.statusCode ?? 0, corpo: new Uint8Array(Buffer.concat(partes)) }));
      res.on('error', () => falhou(new FalhaDaChamada('conexao')));
    });
    r.on('timeout', () => { r.destroy(); falhou(new FalhaDaChamada('tempo')); });
    r.on('error', (e: NodeJS.ErrnoException) => falhou(new FalhaDaChamada(/CERT|SSL|TLS|self.signed|unable to verify/i.test(`${e.code ?? ''} ${e.message}`) ? 'tls' : 'conexao')));
    if (corpo !== null) r.write(corpo);
    r.end();
  });
}

export const handler = async (ev: EventoUrl) => {
  const hmacId = process.env.SEGREDO_HMAC_ID; const provId = process.env.SEGREDO_PROVEDOR_ID; const tabela = process.env.TABELA_NONCES;
  if (!hmacId || !provId || !tabela) {
    console.log(JSON.stringify({ resultado: 'configuracao' }));
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: '{"ok":false,"falha":"configuracao"}' };
  }
  try {
    return await atender(ev, {
      segredos: async () => {
        if (!hmacEmCache || hmacEmCache.ate < Date.now()) {
          const r = await sm.send(new GetSecretValueCommand({ SecretId: hmacId }));
          const lista = String(r.SecretString ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 32);
          hmacEmCache = { lista, ate: Date.now() + 5 * 60_000 };
        }
        return hmacEmCache.lista;
      },
      agoraSegundos: () => Math.floor(Date.now() / 1000),
      registrarNonce: async (nonce, expiraEm) => {
        try {
          await ddb.send(new PutItemCommand({ TableName: tabela, Item: { nonce: { S: nonce }, expira: { N: String(expiraEm) } },
            ConditionExpression: 'attribute_not_exists(nonce)' }));
          return true;
        } catch (e) { if (e instanceof ConditionalCheckFailedException) return false; throw e; }
      },
      credenciais: async () => {
        if (!credEmCache || credEmCache.ate < Date.now()) {
          const r = await sm.send(new GetSecretValueCommand({ SecretId: provId }));
          credEmCache = { cred: lerCredenciais(r.SecretString), ate: Date.now() + 5 * 60_000 };
        }
        return credEmCache.cred;
      },
      chamar,
      destinoBase: process.env.DESTINO_BASE,
      caminhosPermitidos: process.env.CAMINHOS_PERMITIDOS,
      log: (linha) => console.log(JSON.stringify(linha)),
    });
  } catch {
    /* nunca a pilha: pode carregar pedaço do pedido */
    console.log(JSON.stringify({ req: ev.requestContext?.requestId ?? null, resultado: 'interno' }));
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: '{"ok":false,"falha":"interno"}' };
  }
};
