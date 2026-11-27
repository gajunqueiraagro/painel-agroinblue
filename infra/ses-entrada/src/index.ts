/**
 * BOLETO D3b — o ponto de entrada da Lambda `entrada-email` (Node.js 22, sa-east-1). Liga as peças reais à regra de `entrada.ts`.
 * Variáveis: ENTRADA_URL (a Edge Function `entrada-email` do proto), ENTRADA_HMAC (o Gabriel gera e cola só lá e no Supabase),
 * BUCKET (agroinblue-boletos-email), PREFIXO (entrada/). ⚠ Não loga corpo, anexo, assunto nem remetente: só as contagens.
 * ENTRADA-CENTRAL-01 F1: lê cada PDF/XML com o leitor da caixa (`leitor.ts`) e manda o RESULTADO junto; LEITURA_TETO_MS (opcional,
 * padrão 20000) é o teto de cada leitura. Memória sugerida: 1024 MB; tempo limite: 3 min.
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import PostalMime from 'postal-mime';
import { processar, type EventoSes } from './entrada';
import { leitorDaLambda } from './leitor';

const s3 = new S3Client({ region: 'sa-east-1' });

export const handler = async (evento: EventoSes) => {
  const url = process.env.ENTRADA_URL;
  const segredo = process.env.ENTRADA_HMAC;
  const bucket = process.env.BUCKET;
  if (!url || !segredo || !bucket) throw new Error('configuração da Lambda incompleta');
  /* o leitor que não carrega NÃO para o e-mail: ele entra sem a leitura (a caixa lê no navegador) — no log, só o aviso */
  const ler = await leitorDaLambda().catch(() => { console.log(JSON.stringify({ leitor: 'indisponivel' })); return undefined; });
  const teto = Number(process.env.LEITURA_TETO_MS);
  const resumo = await processar({
    url, segredo, ...(ler ? { ler } : {}), ...(Number.isFinite(teto) && teto > 0 ? { tetoDaLeituraMs: teto } : {}),
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
