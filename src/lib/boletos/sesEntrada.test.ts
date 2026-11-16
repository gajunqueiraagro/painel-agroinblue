/**
 * BOLETO D3b — a regra da Lambda do SES (`infra/ses-entrada/src/entrada.ts`) com S3, MIME e Edge Function FALSOS: só anexos PDF/XML
 * sobem; o corpo nunca vai no POST; um POST por anexo e um da mensagem, assinados; vírus não sobe arquivo; > 10 MB vira recusa; endereço
 * desconhecido para tudo; 5xx/409/rede LANÇA (a Lambda tenta de novo); a confirmação do Gmail é reconhecida pelo remetente.
 */
import { describe, expect, it } from 'vitest';
import { anexoUtil, ehConfirmacaoGmail, nossosDestinatarios, processar, type Anexo, type EventoSes, type PecasLambda } from '../../../infra/ses-entrada/src/entrada';
import { assinaturaConfere, CABECALHO_ASSINATURA } from '../../../supabase/functions/_shared/entradaEmail';

const SEGREDO = 'segredo-sintetico-entrada-0123456789';
const DEST = 'teste-cliente-k3m9q2x7wa@boletos.agroinblue.com.br';
const CORPO_SECRETO = 'texto do corpo do e-mail que nunca sai daqui';
const pdf = (n: string): Anexo => ({ nome: n, mime: 'application/pdf', bytes: new TextEncoder().encode(`%PDF-1.4 ${n}`) });

function evento(extra: { virus?: string; from?: string; recipients?: string[] } = {}): EventoSes {
  return { Records: [{ ses: {
    mail: { messageId: 'ses-1', timestamp: '2026-11-16T15:00:00Z', commonHeaders: { from: [extra.from ?? 'Banco <cobranca@banco.com.br>'], subject: 'Boleto', messageId: '<m1@banco>' } },
    receipt: { recipients: extra.recipients ?? [DEST], spfVerdict: { status: 'PASS' }, virusVerdict: { status: extra.virus ?? 'PASS' } },
  } }] };
}

function falsas(anexos: Anexo[], responder?: (corpo: Record<string, unknown>) => { status: number; corpo: unknown }) {
  const posts: { headers: Record<string, string>; texto: string; corpo: Record<string, unknown> }[] = [];
  const pecas: PecasLambda = {
    url: 'https://proto.example/functions/v1/entrada-email', segredo: SEGREDO, agoraSegundos: () => 1_800_000_000,
    lerBruto: async () => new TextEncoder().encode(CORPO_SECRETO),
    anexosDoMime: async () => anexos,
    postar: async (_u, headers, texto) => {
      const corpo = JSON.parse(texto);
      posts.push({ headers, texto, corpo });
      const r = responder?.(corpo) ?? (corpo.etapa === 'arquivo'
        ? { status: 200, corpo: { ok: true, nome: corpo.nome, tipo: 'pdf', tamanho: 10, md5: 'a'.repeat(32) } }
        : { status: 200, corpo: { ok: true } });
      return { status: r.status, json: async () => r.corpo };
    },
  };
  return { pecas, posts };
}

describe('Lambda do SES', () => {
  it('L1 só PDF/XML; um POST por anexo + o da mensagem, todos assinados; o corpo nunca vai', async () => {
    const f = falsas([pdf('a.pdf'), { nome: 'logo.png', mime: 'image/png', bytes: new Uint8Array([1]) }, pdf('b.pdf')]);
    const r = await processar(f.pecas, evento());
    expect(r).toEqual([{ destinatario: DEST, arquivos: 2, recusas: 0, ignorado: false }]);
    expect(f.posts.map((p) => p.corpo.etapa)).toEqual(['arquivo', 'arquivo', 'mensagem']);
    for (const p of f.posts) {
      expect(await assinaturaConfere(SEGREDO, p.texto, p.headers[CABECALHO_ASSINATURA], 1_800_000_000)).toBe(true);
      expect(p.texto).not.toContain(CORPO_SECRETO);
    }
    expect(f.posts[2].corpo).toMatchObject({ mensagem_id: '<m1@banco>', recebido_em: '2026-11-16T15:00:00Z', confirmacao_gmail: false });
  });
  it('L2 vírus: nenhum arquivo sobe; a mensagem leva só os nomes', async () => {
    const f = falsas([pdf('a.pdf')]);
    await processar(f.pecas, evento({ virus: 'FAIL' }));
    expect(f.posts.map((p) => p.corpo.etapa)).toEqual(['mensagem']);
    expect(f.posts[0].corpo.arquivos).toEqual([{ nome: 'a.pdf' }]);
  });
  it('L3 maior que 10 MB vira recusa nomeada, sem subir', async () => {
    const f = falsas([{ nome: 'grande.pdf', mime: 'application/pdf', bytes: new Uint8Array(10 * 1024 * 1024 + 1) }]);
    await processar(f.pecas, evento());
    expect(f.posts.map((p) => p.corpo.etapa)).toEqual(['mensagem']);
    expect(f.posts[0].corpo.recusas).toEqual([{ nome: 'grande.pdf', motivo: 'maior que 10 MB' }]);
  });
  it('L4 endereço desconhecido no 1º arquivo: para (nem o 2º, nem a mensagem)', async () => {
    const f = falsas([pdf('a.pdf'), pdf('b.pdf')], () => ({ status: 200, corpo: { ok: false, motivo: 'endereco_desconhecido' } }));
    const r = await processar(f.pecas, evento());
    expect(f.posts).toHaveLength(1);
    expect(r[0].ignorado).toBe(true);
  });
  it('L5 5xx e 409 lançam (a Lambda tenta de novo); 415 vira recusa com a frase', async () => {
    await expect(processar(falsas([pdf('a.pdf')], () => ({ status: 503, corpo: {} })).pecas, evento())).rejects.toThrow();
    await expect(processar(falsas([], () => ({ status: 409, corpo: {} })).pecas, evento())).rejects.toThrow();
    const f = falsas([pdf('a.pdf')], (c) => (c.etapa === 'arquivo' ? { status: 415, corpo: { ok: false, frase: 'não é PDF nem XML' } } : { status: 200, corpo: { ok: true } }));
    await processar(f.pecas, evento());
    expect(f.posts[1].corpo.recusas).toEqual([{ nome: 'a.pdf', motivo: 'não é PDF nem XML' }]);
  });
  it('L6 sem anexo útil = só a mensagem; a confirmação do Gmail pelo remetente', async () => {
    const f = falsas([], undefined);
    await processar(f.pecas, evento({ from: 'Equipe do Gmail <forwarding-noreply@google.com>' }));
    expect(f.posts).toHaveLength(1);
    expect(f.posts[0].corpo).toMatchObject({ etapa: 'mensagem', arquivos: [], confirmacao_gmail: true });
    expect(ehConfirmacaoGmail('forwarding-noreply@google.com.evil.com')).toBe(false);
  });
  it('L7 destinatários: só o nosso domínio, sem repetir; anexo útil pelo mime ou pelo nome', () => {
    expect(nossosDestinatarios([DEST, DEST.toUpperCase(), 'outro@gmail.com'])).toEqual([DEST]);
    expect(anexoUtil({ nome: 'NF.XML', mime: 'application/octet-stream', bytes: new Uint8Array() })).toBe(true);
    expect(anexoUtil({ nome: 'foto.jpg', mime: 'image/jpeg', bytes: new Uint8Array() })).toBe(false);
  });
});
