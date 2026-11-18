/**
 * NOTAS-RECEITA-A1-01 · o ponto de entrada da Lambda `agro-dfe-mtls` (Node.js 22, sa-east-1, Function URL). Liga as peças da AWS à `regra.ts`.
 * Variáveis (nenhuma é segredo): SEGREDO_ID (Secrets Manager: o HMAC; 2 linhas = atual e anterior, na troca), CHAVE_KMS_ID (a chave
 * assimétrica RSA-4096 que só esta função abre), TABELA_NONCES (DynamoDB, chave "nonce", TTL "expira").
 * ⚠ Não loga corpo, cabeçalho, envelope, CPF, par, chave, nonce nem assinatura: só o resultado, o status, os bytes e o tempo.
 */
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient, PutItemCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { atender, type EventoUrl } from './regra.ts';
import { postarMtls } from './tls.ts';

const regiao = 'sa-east-1';
const kms = new KMSClient({ region: regiao });
const sm = new SecretsManagerClient({ region: regiao });
const ddb = new DynamoDBClient({ region: regiao });
let segredosEmCache: { lista: string[]; ate: number } | null = null;

export const handler = async (ev: EventoUrl) => {
  const segredoId = process.env.SEGREDO_ID; const chaveId = process.env.CHAVE_KMS_ID; const tabela = process.env.TABELA_NONCES;
  if (!segredoId || !chaveId || !tabela) {
    console.log(JSON.stringify({ resultado: 'configuracao' }));
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: '{"ok":false,"falha":"interno"}' };
  }
  try {
    return await atender(ev, {
      segredos: async () => {
        if (!segredosEmCache || segredosEmCache.ate < Date.now()) {
          const r = await sm.send(new GetSecretValueCommand({ SecretId: segredoId }));
          const lista = String(r.SecretString ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 32);
          segredosEmCache = { lista, ate: Date.now() + 5 * 60_000 };
        }
        return segredosEmCache.lista;
      },
      agoraSegundos: () => Math.floor(Date.now() / 1000),
      registrarNonce: async (nonce, expiraEm) => {
        try {
          await ddb.send(new PutItemCommand({ TableName: tabela, Item: { nonce: { S: nonce }, expira: { N: String(expiraEm) } },
            ConditionExpression: 'attribute_not_exists(nonce)' }));
          return true;
        } catch (e) { if (e instanceof ConditionalCheckFailedException) return false; throw e; }
      },
      desembrulhar: async (chave) => {
        const r = await kms.send(new DecryptCommand({ KeyId: chaveId, CiphertextBlob: chave, EncryptionAlgorithm: 'RSAES_OAEP_SHA_256' }));
        if (!r.Plaintext) throw new Error('kms');
        return r.Plaintext;
      },
      postar: (url, par, envelope, servico) => postarMtls(url, par, envelope, { servico }),
      log: (linha) => console.log(JSON.stringify(linha)),
    });
  } catch {
    /* nunca a pilha: pode carregar pedaço do pedido */
    console.log(JSON.stringify({ req: ev.requestContext?.requestId ?? null, resultado: 'interno' }));
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: '{"ok":false,"falha":"interno"}' };
  }
};
