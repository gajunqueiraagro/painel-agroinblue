/**
 * BOLETO D3b — a borda do e-mail de boletos (Gabriel 16/11 11:11: SES São Paulo, `<slug>-<token>@boletos.agroinblue.com.br`, qualquer
 * e-mail entra "a conferir", sem anexo útil = linha dispensável, o CORPO NÃO É LIDO NEM GUARDADO).
 * As REGRAS moram aqui, puras (o banco e o storage entram como peças) e são provadas no vitest (`src/lib/boletos/entradaEmailBorda.test.ts`).
 * O `entrada-email/index.ts` só liga as peças reais; a Lambda (`infra/ses-entrada/`) usa daqui a MESMA assinatura.
 *
 * Duas etapas, cada uma um POST assinado (HMAC-SHA256 de "<t>.<corpo>", segredo `ENTRADA_EMAIL_HMAC`, relógio ±5 min):
 *  · `arquivo`  — UM anexo (base64). A função acha o cliente pelo endereço ATIVO, confere o tipo PELO CONTEÚDO (%PDF- / XML), o tamanho
 *    (1 B a 10 MB) e grava em `fin-documentos/<cliente>/entrada/<md5>.<pdf|xml>` (caminho determinístico: a reentrega não gera órfão).
 *  · `mensagem` — os dados do e-mail (destinatário, Message-ID, remetente, assunto, data, vereditos do SES) + a lista do que a etapa
 *    `arquivo` devolveu + as recusas. A função refaz cada caminho (nunca o aceita de fora), confere que o arquivo está lá e chama a
 *    `_fn_entrada_registrar` (118110, só service_role), que é a autoridade final (domínio, endereço revogado, vírus, sem anexo).
 * ⚠ Nada aqui loga corpo, anexo, assunto, remetente nem a assinatura.
 */

export const DOMINIO_ENTRADA = 'boletos.agroinblue.com.br';
export const CABECALHO_ASSINATURA = 'x-entrada-assinatura';
export const TAMANHO_MAXIMO = 10 * 1024 * 1024;
export const RELOGIO_SEGUNDOS = 300;

export type Tipo = 'pdf' | 'xml';
export type Resposta = { status: number; corpo: Record<string, unknown> };

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const ehTipo = (v: unknown): v is Tipo => v === 'pdf' || v === 'xml';

/** compara sem vazar pelo tempo onde a diferença está (o tamanho diferente já recusa) */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const hex = (b: ArrayBuffer): string => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

/** a assinatura de um corpo: "t=<segundos>,v1=<hex>" (a Lambda assina, a função confere — o MESMO código) */
export async function assinar(segredo: string, corpo: string, segundos: number): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`${segundos}.${corpo}`));
  return `t=${segundos},v1=${hex(mac)}`;
}

/** confere a assinatura e o relógio (±5 min: um corpo velho capturado não serve de novo depois) */
export async function assinaturaConfere(segredo: string, corpo: string, cabecalho: string | null, agoraSegundos: number): Promise<boolean> {
  const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec((cabecalho ?? '').trim());
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(agoraSegundos - t) > RELOGIO_SEGUNDOS) return false;
  const esperado = await assinar(segredo, corpo, t);
  return iguaisEmTempoConstante(esperado, `t=${m[1]},v1=${m[2]}`);
}

/** o local do endereço, se o domínio é o nosso (minúsculas; o resto quem decide é o banco) */
export function localDoDestinatario(destinatario: unknown): string | null {
  const d = texto(destinatario, 320)?.toLowerCase() ?? '';
  const [local, dominio, ...resto] = d.split('@');
  if (resto.length || dominio !== DOMINIO_ENTRADA || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(local ?? '')) return null;
  return local;
}

/** o tipo PELO CONTEÚDO (o nome e o mime do e-mail não decidem): PDF começa por %PDF-; XML por "<" (depois do BOM/espaço) */
export function tipoDoConteudo(bytes: Uint8Array): Tipo | null {
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && i < 64 && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  const cabeca = Array.from(bytes.subarray(i, i + 5), (c) => String.fromCharCode(c)).join('');
  if (cabeca === '%PDF-') return 'pdf';
  if (cabeca.startsWith('<?xml') || cabeca.startsWith('<')) return 'xml';
  return null;
}

export const caminhoDoArquivo = (clienteId: string, md5: string, tipo: Tipo): string => `${clienteId}/entrada/${md5}.${tipo}`;

export function base64ParaBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/\s+/g, ''));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch { return null; }
}

export type Pecas = {
  segredo: string | null;
  agoraSegundos: () => number;
  /** o cliente do endereço ATIVO (null = desconhecido ou revogado) */
  clienteDoEndereco: (local: string) => Promise<string | null>;
  md5: (bytes: Uint8Array) => Promise<string>;
  /** grava sem sobrescrever; já existir é sucesso (mesmo md5 = mesmo arquivo) */
  gravarObjeto: (caminho: string, bytes: Uint8Array, tipo: Tipo) => Promise<void>;
  objetoExiste: (caminho: string) => Promise<boolean>;
  /** a `_fn_entrada_registrar`; erro do banco vem com o código (22023 = recusa, não adianta tentar de novo) */
  registrar: (p: Record<string, unknown>) => Promise<{ ok: true; valor: Record<string, unknown> } | { ok: false; codigo: string | null }>;
};

const NAO_E_NOSSO: Resposta = { status: 200, corpo: { ok: false, motivo: 'endereco_desconhecido' } };

/** a porta das duas etapas. 401 = assinatura (a Lambda não tenta de novo); 5xx = tente de novo; 4xx de conteúdo = recusa do arquivo. */
export async function receber(p: Pecas, corpo: string, cabecalho: string | null): Promise<Resposta> {
  if (!p.segredo) return { status: 503, corpo: { ok: false, motivo: 'configuracao' } };
  if (!(await assinaturaConfere(p.segredo, corpo, cabecalho, p.agoraSegundos()))) return { status: 401, corpo: { ok: false, motivo: 'assinatura' } };
  let dado: unknown;
  try { dado = JSON.parse(corpo); } catch { return { status: 400, corpo: { ok: false, motivo: 'pedido' } }; }
  if (!ehObjeto(dado)) return { status: 400, corpo: { ok: false, motivo: 'pedido' } };
  const local = localDoDestinatario(dado.destinatario);
  if (!local) return NAO_E_NOSSO;
  if (dado.etapa === 'arquivo') return receberArquivo(p, local, dado);
  if (dado.etapa === 'mensagem') return receberMensagem(p, local, dado);
  return { status: 400, corpo: { ok: false, motivo: 'pedido' } };
}

async function receberArquivo(p: Pecas, local: string, dado: Record<string, unknown>): Promise<Resposta> {
  const b64 = typeof dado.conteudo_b64 === 'string' ? dado.conteudo_b64 : '';
  const bytes = base64ParaBytes(b64);
  if (!bytes) return { status: 400, corpo: { ok: false, motivo: 'pedido' } };
  if (bytes.length < 1 || bytes.length > TAMANHO_MAXIMO) return { status: 413, corpo: { ok: false, motivo: 'tamanho', frase: 'maior que 10 MB (ou vazio)' } };
  const tipo = tipoDoConteudo(bytes);
  if (!tipo) return { status: 415, corpo: { ok: false, motivo: 'tipo', frase: 'não é PDF nem XML' } };
  const cliente = await p.clienteDoEndereco(local);
  if (!cliente) return NAO_E_NOSSO;
  const md5 = await p.md5(bytes);
  const caminho = caminhoDoArquivo(cliente, md5, tipo);
  try { await p.gravarObjeto(caminho, bytes, tipo); } catch { return { status: 500, corpo: { ok: false, motivo: 'storage' } }; }
  return { status: 200, corpo: { ok: true, nome: texto(dado.nome, 255), tipo, tamanho: bytes.length, md5 } };
}

/** ENTRADA-CENTRAL-01 F1: um objeto de até 32 KB (o teto do banco); o resto vai sem leitura (a caixa lê no navegador) */
export const LEITURA_MAX_BYTES = 32768;
export function leituraDoPedido(x: unknown): Record<string, unknown> | null {
  if (!ehObjeto(x)) return null;
  return new TextEncoder().encode(JSON.stringify(x)).length <= LEITURA_MAX_BYTES ? x : null;
}

async function receberMensagem(p: Pecas, local: string, dado: Record<string, unknown>): Promise<Resposta> {
  const mensagemId = texto(dado.mensagem_id, 512);
  if (!mensagemId) return { status: 400, corpo: { ok: false, motivo: 'pedido' } };
  const cliente = await p.clienteDoEndereco(local);
  if (!cliente) return NAO_E_NOSSO;
  const ver = ehObjeto(dado.verificacao) ? dado.verificacao : {};
  const verificacao: Record<string, string> = {};
  for (const k of ['spf', 'dkim', 'dmarc', 'spam', 'virus']) {
    const v = texto(ver[k], 32);
    if (v) verificacao[k] = v.toUpperCase();
  }
  const virus = verificacao.virus === 'FAIL';
  const arquivos: Record<string, unknown>[] = [];
  for (const a of Array.isArray(dado.arquivos) ? dado.arquivos : []) {
    if (!ehObjeto(a)) return { status: 400, corpo: { ok: false, motivo: 'pedido' } };
    const nome = texto(a.nome, 255);
    if (virus) { arquivos.push({ nome }); continue; }   // o banco recusa todos; nenhum caminho entra
    const md5 = typeof a.md5 === 'string' && /^[0-9a-f]{32}$/.test(a.md5) ? a.md5 : null;
    const tamanho = typeof a.tamanho === 'number' && Number.isInteger(a.tamanho) ? a.tamanho : null;
    if (!md5 || !ehTipo(a.tipo) || tamanho === null) return { status: 400, corpo: { ok: false, motivo: 'pedido' } };
    const caminho = caminhoDoArquivo(cliente, md5, a.tipo);   // refeito aqui: o caminho de fora nunca entra
    if (!(await p.objetoExiste(caminho))) return { status: 409, corpo: { ok: false, motivo: 'arquivo_ausente' } };
    /* ENTRADA-CENTRAL-01 F1: a leitura que a Lambda fez (só o resultado; a forma quem confere é o banco, `_fn_entrada_leitura_valida`) */
    const leitura = leituraDoPedido(a.leitura);
    arquivos.push({ nome, tipo: a.tipo, tamanho, md5, storage_path: caminho, ...(leitura ? { leitura } : {}) });
  }
  const recusas: Record<string, unknown>[] = [];
  for (const r of Array.isArray(dado.recusas) ? dado.recusas : []) {
    if (ehObjeto(r)) recusas.push({ nome: texto(r.nome, 255), motivo: texto(r.motivo, 300) ?? 'recusado' });
  }
  const recebido = texto(dado.recebido_em, 40);
  const r = await p.registrar({
    destinatario: `${local}@${DOMINIO_ENTRADA}`,
    mensagem_id: mensagemId,
    remetente: texto(dado.remetente, 320),
    assunto: texto(dado.assunto, 300),
    recebido_em: recebido && !Number.isNaN(Date.parse(recebido)) ? recebido : null,
    verificacao,
    arquivos,
    recusas,
    confirmacao_gmail: dado.confirmacao_gmail === true,
  });
  if (r.ok === false) return r.codigo === '22023' ? { status: 422, corpo: { ok: false, motivo: 'recusado_pelo_banco' } } : { status: 500, corpo: { ok: false, motivo: 'banco' } };
  return { status: 200, corpo: { ok: r.valor.ok === true, motivo: r.valor.motivo ?? null, n: arquivos.length } };
}
