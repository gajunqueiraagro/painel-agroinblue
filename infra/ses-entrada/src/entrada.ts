/**
 * BOLETO D3b — a Lambda do SES (sa-east-1), a REGRA pura: o SES já guardou o e-mail bruto no S3 e chama esta função (assíncrona).
 * Ela separa os anexos PDF/XML e DESCARTA O CORPO (nunca é lido como texto, nunca sai daqui); para cada destinatário do nosso domínio:
 * um POST assinado por anexo (etapa `arquivo`) e um POST da mensagem (etapa `mensagem`) para a Edge Function `entrada-email`.
 * O MIME, o S3 e a rede entram como peças (provadas no vitest: `src/lib/boletos/sesEntrada.test.ts`); o `index.ts` liga as reais.
 * Erro que vale tentar de novo (rede, 5xx) LANÇA: o SES/Lambda assíncrona tenta mais 2 vezes; a reentrega não duplica (md5 e Message-ID).
 */
import { assinar, DOMINIO_ENTRADA, CABECALHO_ASSINATURA, TAMANHO_MAXIMO } from '../../../supabase/functions/_shared/entradaEmail';

export type Anexo = { nome: string | null; mime: string | null; bytes: Uint8Array };
export type Veredito = { status?: string };
export type EventoSes = {
  Records?: {
    ses?: {
      mail?: { messageId?: string; timestamp?: string; source?: string; commonHeaders?: { from?: string[]; subject?: string; messageId?: string } };
      receipt?: {
        recipients?: string[];
        spfVerdict?: Veredito; dkimVerdict?: Veredito; dmarcVerdict?: Veredito; spamVerdict?: Veredito; virusVerdict?: Veredito;
      };
    };
  }[];
};

export type PecasLambda = {
  url: string;
  segredo: string;
  agoraSegundos: () => number;
  /** o e-mail bruto que o SES guardou (bucket/prefixo + messageId) */
  lerBruto: (sesMessageId: string) => Promise<Uint8Array>;
  /** só os ANEXOS (o corpo nem sai do parser) */
  anexosDoMime: (bruto: Uint8Array) => Promise<Anexo[]>;
  postar: (url: string, headers: Record<string, string>, corpo: string) => Promise<{ status: number; json: () => Promise<unknown> }>;
};

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** anexo útil: PDF ou XML pelo mime OU pelo nome (a função confere de novo pelo conteúdo) */
export function anexoUtil(a: Anexo): boolean {
  const mime = (a.mime ?? '').toLowerCase();
  const nome = (a.nome ?? '').toLowerCase();
  return mime === 'application/pdf' || mime === 'application/xml' || mime === 'text/xml' || nome.endsWith('.pdf') || nome.endsWith('.xml');
}

const GMAIL_CONFIRMACAO = /^forwarding-noreply@google\.com$/i;
/** a confirmação do encaminhamento do Gmail: pelo REMETENTE (o código vem no assunto; o corpo não é lido) */
export function ehConfirmacaoGmail(remetente: string | null): boolean {
  const m = /<([^>]+)>/.exec(remetente ?? '');
  return GMAIL_CONFIRMACAO.test((m ? m[1] : remetente ?? '').trim());
}

export function nossosDestinatarios(recipients: string[] | undefined): string[] {
  const vistos = new Set<string>();
  for (const r of recipients ?? []) {
    const d = r.trim().toLowerCase();
    if (d.endsWith(`@${DOMINIO_ENTRADA}`)) vistos.add(d);
  }
  return [...vistos];
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

class TenteDeNovo extends Error {}

async function enviar(p: PecasLambda, corpo: Record<string, unknown>): Promise<{ status: number; dado: Record<string, unknown> }> {
  const texto = JSON.stringify(corpo);
  const assinatura = await assinar(p.segredo, texto, p.agoraSegundos());
  let r;
  try { r = await p.postar(p.url, { 'Content-Type': 'application/json', [CABECALHO_ASSINATURA]: assinatura }, texto); }
  catch { throw new TenteDeNovo('rede'); }
  if (r.status >= 500 || r.status === 409) throw new TenteDeNovo(`status ${r.status}`);
  if (r.status === 401) throw new Error('assinatura recusada: confira ENTRADA_HMAC = ENTRADA_EMAIL_HMAC');   // não adianta repetir
  let dado: unknown = {};
  try { dado = await r.json(); } catch { dado = {}; }
  return { status: r.status, dado: ehObjeto(dado) ? dado : {} };
}

export type Resumo = { destinatario: string; arquivos: number; recusas: number; ignorado: boolean };

export async function processar(p: PecasLambda, evento: EventoSes): Promise<Resumo[]> {
  const saida: Resumo[] = [];
  for (const rec of evento.Records ?? []) {
    const mail = rec.ses?.mail;
    const receipt = rec.ses?.receipt;
    const sesId = mail?.messageId;
    if (!sesId) continue;
    const destinos = nossosDestinatarios(receipt?.recipients);
    if (!destinos.length) continue;
    const remetente = mail?.commonHeaders?.from?.[0] ?? mail?.source ?? null;
    const verificacao = {
      spf: receipt?.spfVerdict?.status, dkim: receipt?.dkimVerdict?.status, dmarc: receipt?.dmarcVerdict?.status,
      spam: receipt?.spamVerdict?.status, virus: receipt?.virusVerdict?.status,
    };
    const virus = (verificacao.virus ?? '').toUpperCase() === 'FAIL';
    const anexos = (await p.anexosDoMime(await p.lerBruto(sesId))).filter(anexoUtil);

    for (const destinatario of destinos) {
      const base = { destinatario, mensagem_id: mail?.commonHeaders?.messageId || sesId };
      const arquivos: Record<string, unknown>[] = [];
      const recusas: { nome: string | null; motivo: string }[] = [];
      let ignorado = false;
      for (const a of anexos) {
        if (virus) { arquivos.push({ nome: a.nome }); continue; }   // não sobe: o banco marca "recusado"
        if (a.bytes.length > TAMANHO_MAXIMO) { recusas.push({ nome: a.nome, motivo: 'maior que 10 MB' }); continue; }
        if (a.bytes.length === 0) { recusas.push({ nome: a.nome, motivo: 'arquivo vazio' }); continue; }
        const r = await enviar(p, { ...base, etapa: 'arquivo', nome: a.nome, conteudo_b64: base64(a.bytes) });
        if (r.dado.motivo === 'endereco_desconhecido') { ignorado = true; break; }
        if (r.status === 200 && r.dado.ok === true) {
          arquivos.push({ nome: r.dado.nome ?? a.nome, tipo: r.dado.tipo, tamanho: r.dado.tamanho, md5: r.dado.md5 });
        } else {
          recusas.push({ nome: a.nome, motivo: typeof r.dado.frase === 'string' ? r.dado.frase : 'arquivo recusado' });
        }
      }
      if (!ignorado) {
        const r = await enviar(p, {
          ...base, etapa: 'mensagem', remetente, assunto: mail?.commonHeaders?.subject ?? null, recebido_em: mail?.timestamp ?? null,
          verificacao, arquivos, recusas, confirmacao_gmail: ehConfirmacaoGmail(remetente),
        });
        ignorado = r.dado.motivo === 'endereco_desconhecido';
      }
      saida.push({ destinatario, arquivos: arquivos.length, recusas: recusas.length, ignorado });
    }
  }
  return saida;
}
