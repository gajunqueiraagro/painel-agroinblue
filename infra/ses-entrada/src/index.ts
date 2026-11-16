/**
 * BOLETO D3b — o ponto de entrada da Lambda `entrada-email` (Node.js 22, sa-east-1). Liga as peças reais à regra de `entrada.ts`.
 * Variáveis: ENTRADA_URL (a Edge Function `entrada-email` do proto), ENTRADA_HMAC (o Gabriel gera e cola só lá e no Supabase),
 * BUCKET (agroinblue-boletos-email), PREFIXO (entrada/). ⚠ Não loga corpo, anexo, assunto nem remetente: só as contagens.
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import PostalMime from 'postal-mime';
import { processar, type EventoSes } from './entrada';

const s3 = new S3Client({ region: 'sa-east-1' });

export const handler = async (evento: EventoSes) => {
  const url = process.env.ENTRADA_URL;
  const segredo = process.env.ENTRADA_HMAC;
  const bucket = process.env.BUCKET;
  if (!url || !segredo || !bucket) throw new Error('configuração da Lambda incompleta');
  const resumo = await processar({
    url, segredo,
    agoraSegundos: () => Math.floor(Date.now() / 1000),
    lerBruto: async (id) => {
      const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `${process.env.PREFIXO ?? 'entrada/'}${id}` }));
      if (!r.Body) throw new Error('e-mail bruto ausente no S3');
      return r.Body.transformToByteArray();
    },
    anexosDoMime: async (bruto) => {
      const email = await PostalMime.parse(bruto, { attachmentEncoding: 'arraybuffer' });
      return (email.attachments ?? []).map((a) => ({
        nome: a.filename ?? null, mime: a.mimeType ?? null,
        bytes: typeof a.content === 'string' ? new TextEncoder().encode(a.content) : new Uint8Array(a.content),
      }));
    },
    postar: async (u, headers, corpo) => {
      const r = await fetch(u, { method: 'POST', headers, body: corpo });
      return { status: r.status, json: () => r.json() };
    },
  }, evento);
  console.log(JSON.stringify(resumo.map((r) => ({ arquivos: r.arquivos, recusas: r.recusas, ignorado: r.ignorado }))));
  return { ok: true };
};
