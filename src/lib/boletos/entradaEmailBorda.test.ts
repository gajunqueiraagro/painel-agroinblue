/**
 * BOLETO D3b — as regras da borda do e-mail (`supabase/functions/_shared/entradaEmail.ts`) com storage e banco FALSOS: só a assinatura
 * certa e fresca entra; o tipo é o do CONTEÚDO; o caminho é sempre o do cliente do endereço (nunca o de fora); arquivo ausente não registra;
 * vírus não leva caminho; o 22023 do banco é recusa (422) e o resto é "tente de novo" (500).
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  assinar, assinaturaConfere, caminhoDoArquivo, localDoDestinatario, receber, tipoDoConteudo, type Pecas,
} from '../../../supabase/functions/_shared/entradaEmail';

const SEGREDO = 'segredo-sintetico-entrada-0123456789';
const CLIENTE = '43f32d07-dba8-4670-900c-bf645440c04a';
const LOCAL = 'teste-cliente-k3m9q2x7wa';
const DEST = `${LOCAL}@boletos.agroinblue.com.br`;
const AGORA = 1_800_000_000;
const PDF = new TextEncoder().encode('%PDF-1.4 boleto sintético');
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const md5 = (b: Uint8Array) => createHash('md5').update(b).digest('hex');

function falsas(extra: Partial<Pecas> = {}) {
  const objetos = new Map<string, Uint8Array>();
  const registros: Record<string, unknown>[] = [];
  const pecas: Pecas = {
    segredo: SEGREDO,
    agoraSegundos: () => AGORA,
    clienteDoEndereco: async (l) => (l === LOCAL ? CLIENTE : null),
    md5: async (b) => md5(b),
    gravarObjeto: async (c, b) => { if (!objetos.has(c)) objetos.set(c, b); },
    objetoExiste: async (c) => objetos.has(c),
    registrar: async (p) => { registros.push(p); return { ok: true, valor: { ok: true } }; },
    ...extra,
  };
  return { pecas, objetos, registros };
}
async function pedir(pecas: Pecas, corpo: Record<string, unknown>, t = AGORA, segredo = SEGREDO) {
  const texto = JSON.stringify(corpo);
  return receber(pecas, texto, await assinar(segredo, texto, t));
}

describe('assinatura', () => {
  it('A1 confere a certa; recusa a errada, a velha (> 5 min), a do futuro e o formato estranho', async () => {
    const c = await assinar(SEGREDO, '{}', AGORA);
    expect(await assinaturaConfere(SEGREDO, '{}', c, AGORA + 299)).toBe(true);
    expect(await assinaturaConfere(SEGREDO, '{"x":1}', c, AGORA)).toBe(false);
    expect(await assinaturaConfere('outro', '{}', c, AGORA)).toBe(false);
    expect(await assinaturaConfere(SEGREDO, '{}', c, AGORA + 301)).toBe(false);
    expect(await assinaturaConfere(SEGREDO, '{}', c, AGORA - 301)).toBe(false);
    expect(await assinaturaConfere(SEGREDO, '{}', null, AGORA)).toBe(false);
    expect(await assinaturaConfere(SEGREDO, '{}', c.toUpperCase(), AGORA)).toBe(false);
  });
  it('A2 sem segredo = 503; assinatura errada = 401 e nada gravado', async () => {
    const f = falsas({ segredo: null });
    expect((await pedir(f.pecas, { etapa: 'arquivo', destinatario: DEST, conteudo_b64: b64(PDF) })).status).toBe(503);
    const g = falsas();
    const r = await pedir(g.pecas, { etapa: 'arquivo', destinatario: DEST, conteudo_b64: b64(PDF) }, AGORA, 'segredo-errado');
    expect(r.status).toBe(401);
    expect(g.objetos.size).toBe(0);
  });
});

describe('endereço e tipo', () => {
  it('E1 só o nosso domínio e um local no formato', () => {
    expect(localDoDestinatario(` ${DEST.toUpperCase()} `)).toBe(LOCAL);
    expect(localDoDestinatario(`${LOCAL}@outro.com.br`)).toBeNull();
    expect(localDoDestinatario(`a@b@boletos.agroinblue.com.br`)).toBeNull();
    expect(localDoDestinatario(`../x@boletos.agroinblue.com.br`)).toBeNull();
    expect(localDoDestinatario(42)).toBeNull();
  });
  it('E2 o tipo vem do conteúdo, nunca do nome', () => {
    expect(tipoDoConteudo(PDF)).toBe('pdf');
    expect(tipoDoConteudo(new TextEncoder().encode('﻿  <?xml version="1.0"?><nfeProc/>'))).toBe('xml');
    expect(tipoDoConteudo(new TextEncoder().encode('MZ executável'))).toBeNull();
  });
});

describe('etapa arquivo', () => {
  it('F1 grava no caminho do cliente pelo md5 e devolve tipo/tamanho/md5; de novo, o mesmo caminho', async () => {
    const f = falsas();
    const r = await pedir(f.pecas, { etapa: 'arquivo', destinatario: DEST, nome: 'boleto.pdf', conteudo_b64: b64(PDF) });
    expect(r).toEqual({ status: 200, corpo: { ok: true, nome: 'boleto.pdf', tipo: 'pdf', tamanho: PDF.length, md5: md5(PDF) } });
    await pedir(f.pecas, { etapa: 'arquivo', destinatario: DEST, nome: 'outro-nome.pdf', conteudo_b64: b64(PDF) });
    expect([...f.objetos.keys()]).toEqual([caminhoDoArquivo(CLIENTE, md5(PDF), 'pdf')]);
  });
  it('F2 endereço desconhecido/revogado = 200 sem gravar (a Lambda não tenta de novo)', async () => {
    const f = falsas();
    const r = await pedir(f.pecas, { etapa: 'arquivo', destinatario: 'x-aaaaaaaaaa@boletos.agroinblue.com.br', conteudo_b64: b64(PDF) });
    expect(r).toEqual({ status: 200, corpo: { ok: false, motivo: 'endereco_desconhecido' } });
    expect(f.objetos.size).toBe(0);
  });
  it('F3 não é PDF/XML = 415; vazio = 413; storage falhou = 500', async () => {
    const f = falsas();
    expect((await pedir(f.pecas, { etapa: 'arquivo', destinatario: DEST, conteudo_b64: b64(new TextEncoder().encode('MZ...')) })).status).toBe(415);
    expect((await pedir(f.pecas, { etapa: 'arquivo', destinatario: DEST, conteudo_b64: '' })).status).toBe(413);
    const g = falsas({ gravarObjeto: async () => { throw new Error('x'); } });
    expect((await pedir(g.pecas, { etapa: 'arquivo', destinatario: DEST, conteudo_b64: b64(PDF) })).status).toBe(500);
    expect(f.objetos.size).toBe(0);
  });
});

describe('etapa mensagem', () => {
  const mensagem = (arquivos: unknown[], extra: Record<string, unknown> = {}) => ({
    etapa: 'mensagem', destinatario: DEST, mensagem_id: '<abc@mail.gmail.com>', remetente: 'Banco <cobranca@banco.com.br>',
    assunto: 'Seu boleto', recebido_em: '2026-11-16T15:00:00Z', verificacao: { spf: 'pass', virus: 'PASS' }, arquivos, recusas: [], ...extra,
  });
  it('M1 refaz o caminho (o de fora é ignorado) e registra com os vereditos em maiúsculas', async () => {
    const f = falsas();
    await pedir(f.pecas, { etapa: 'arquivo', destinatario: DEST, conteudo_b64: b64(PDF) });
    const r = await pedir(f.pecas, mensagem([{ nome: 'b.pdf', tipo: 'pdf', tamanho: PDF.length, md5: md5(PDF), storage_path: 'outro-cliente/entrada/x.pdf' }]));
    expect(r.status).toBe(200);
    expect(f.registros).toHaveLength(1);
    expect(f.registros[0]).toMatchObject({
      destinatario: DEST, mensagem_id: '<abc@mail.gmail.com>', verificacao: { spf: 'PASS', virus: 'PASS' }, confirmacao_gmail: false,
      arquivos: [{ nome: 'b.pdf', tipo: 'pdf', md5: md5(PDF), storage_path: caminhoDoArquivo(CLIENTE, md5(PDF), 'pdf') }],
    });
  });
  it('M2 arquivo que não está no storage = 409 e nada registrado', async () => {
    const f = falsas();
    const r = await pedir(f.pecas, mensagem([{ nome: 'b.pdf', tipo: 'pdf', tamanho: 3, md5: md5(PDF) }]));
    expect(r.status).toBe(409);
    expect(f.registros).toHaveLength(0);
  });
  it('M3 vírus: os arquivos vão só com o nome (sem caminho)', async () => {
    const f = falsas();
    await pedir(f.pecas, mensagem([{ nome: 'b.pdf', tipo: 'pdf', tamanho: 3, md5: md5(PDF) }], { verificacao: { virus: 'FAIL' } }));
    expect(f.registros[0].arquivos).toEqual([{ nome: 'b.pdf' }]);
  });
  it('M4 22023 do banco = 422 (recusa); outro erro = 500 (tente de novo)', async () => {
    const recusa = falsas({ registrar: async () => ({ ok: false, codigo: '22023' }) });
    expect((await pedir(recusa.pecas, mensagem([]))).status).toBe(422);
    const falha = falsas({ registrar: async () => ({ ok: false, codigo: '57014' }) });
    expect((await pedir(falha.pecas, mensagem([]))).status).toBe(500);
  });
  it('M5 sem Message-ID = 400; data inválida vai nula (o banco usa agora)', async () => {
    const f = falsas();
    expect((await pedir(f.pecas, mensagem([], { mensagem_id: ' ' }))).status).toBe(400);
    await pedir(f.pecas, mensagem([], { recebido_em: 'ontem' }));
    expect(f.registros[0].recebido_em).toBeNull();
  });
});
