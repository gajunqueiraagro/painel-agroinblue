/**
 * OPENFINANCE-PILOTO-01 · P3 mínima (Gabriel 16/11 14:50) — as regras PURAS dos dois botões do admin em Contas bancárias:
 *  · "Registrar webhook" → `openfinance-webhook-registrar` pelo LOGIN do admin (o Test do painel do Supabase não tem papel);
 *  · "Conectar banco"   → `openfinance-conectar` com o cliente aberto → o Widget OFICIAL da Pluggy com o token de 30 min.
 * A tela nunca vê chave nem segredo: só o token de 30 min, que vai direto ao Widget.
 */

/** O Widget oficial, versão FIXA (conferida no CDN da Pluggy em 16/11/2026; "latest" mudaria sozinho). */
export const PLUGGY_CONNECT_URL = 'https://cdn.pluggy.ai/pluggy-connect/v2.8.0/pluggy-connect.js';

export type RespostaDaBorda = { ok: true; corpo: Record<string, unknown> } | { ok: false; frase: string };

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const textoDe = (o: unknown, k: string): string | null => {
  const v = ehObjeto(o) ? o[k] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

/** `supabase.functions.invoke` → o corpo da função; erro HTTP = a FRASE da função (nunca o erro cru); sem frase = a frase padrão. */
export async function lerRespostaDaBorda(res: { data: unknown; error: unknown }, frasePadrao: string): Promise<RespostaDaBorda> {
  let corpo: unknown = res.data;
  if (res.error != null) {
    const contexto: unknown = typeof res.error === 'object' ? Reflect.get(res.error, 'context') : null;
    corpo = null;
    if (contexto instanceof Response) { try { corpo = await contexto.clone().json(); } catch { corpo = null; } }
  }
  if (res.error == null && ehObjeto(corpo) && corpo.ok === true) return { ok: true, corpo };
  return { ok: false, frase: textoDe(corpo, 'frase') ?? frasePadrao };
}

export const FRASE_REGISTRO_FALHOU = 'Não consegui registrar o webhook agora. Nada foi criado; tente de novo.';
export const FRASE_CONECTAR_FALHOU = 'Não consegui abrir a conexão com o banco agora. Tente de novo.';

/** O que o admin lê depois do "Registrar webhook". */
export function fraseDoRegistro(corpo: Record<string, unknown>): string {
  return corpo.ja_existia === true
    ? 'O webhook já estava registrado na Pluggy (nada duplicado).'
    : 'Webhook registrado na Pluggy. Confira no passo 3 do dashboard.';
}

/** O token de 30 min que a função devolveu (ou nulo: não abre o Widget). */
export function tokenDaConexao(corpo: Record<string, unknown>): string | null {
  return textoDe(corpo, 'accessToken');
}

/** O que o admin lê quando o Widget termina: o banco conectado; os dados chegam pelo webhook (nada é gravado pela tela). */
export function fraseDoItem(dados: unknown): string {
  const item = ehObjeto(dados) ? dados.item : null;
  const banco = ehObjeto(item) && ehObjeto(item.connector) ? textoDe(item.connector, 'name') : null;
  return banco
    ? `${banco} conectado. O aviso chega ao AgroinBlue pelo webhook; as transações entram na próxima etapa.`
    : 'Banco conectado. O aviso chega ao AgroinBlue pelo webhook; as transações entram na próxima etapa.';
}

export interface OpcoesDoWidget {
  connectToken: string;
  includeSandbox: boolean;
  onSuccess: (dados: unknown) => void;
  onError: (erro: unknown) => void;
}
export type WidgetPluggy = new (o: OpcoesDoWidget) => { init: () => Promise<void> };

/** Carrega o script do Widget UMA vez (a mesma promessa para os cliques seguintes) e devolve o construtor `PluggyConnect`. */
let carregando: Promise<WidgetPluggy> | null = null;
export function carregarWidget(janela: Window = window): Promise<WidgetPluggy> {
  const ja: unknown = Reflect.get(janela, 'PluggyConnect');
  if (typeof ja === 'function') return Promise.resolve(Reflect.get(janela, 'PluggyConnect'));
  if (carregando) return carregando;
  carregando = new Promise<WidgetPluggy>((resolve, reject) => {
    const s = janela.document.createElement('script');
    s.src = PLUGGY_CONNECT_URL;
    s.async = true;
    s.onload = () => {
      const c: unknown = Reflect.get(janela, 'PluggyConnect');
      if (typeof c === 'function') resolve(Reflect.get(janela, 'PluggyConnect'));
      else { carregando = null; reject(new Error('widget')); }
    };
    s.onerror = () => { carregando = null; s.remove(); reject(new Error('widget')); };
    janela.document.head.appendChild(s);
  });
  return carregando;
}
export const FRASE_WIDGET_FALHOU = 'Não consegui abrir a janela da Pluggy (o navegador bloqueou o script?). Tente de novo.';
