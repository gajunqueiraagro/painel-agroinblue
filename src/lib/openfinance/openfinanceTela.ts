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

/**
 * OPENFINANCE-SEG-01 (a) — os bancos do Open Finance REGULADO que a função devolveu (consentimento no app do banco; nunca senha).
 * Vazio = o Widget NÃO abre: sem a lista ele mostraria também os conectores diretos, que pedem login/senha.
 */
export function conectoresDaConexao(corpo: Record<string, unknown>): number[] {
  const v = corpo.connectorIds;
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0) : [];
}
export const FRASE_SEM_REGULADOS = 'A Pluggy não devolveu os bancos do Open Finance; por segurança a janela não abre. Tente de novo.';

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
  connectorIds: number[];
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

/**
 * OPENFINANCE-SEG-01 (c) — a conexão é PRESA A UM CLIENTE. O vínculo item × cliente nasce SÓ do `item/created` que veio da Pluggy com o
 * `clientUserId` = id de um cliente (o que o NOSSO connect token gravou; a fila o traduz para `cliente_id`). Aviso de item sem esse vínculo
 * (outro app, painel da Pluggy, cliente apagado) fica registrado na fila e é IGNORADO aqui. `agroinblue/item_desconectado` do mesmo
 * cliente, depois, desliga o vínculo (o item some da lista; os extratos já importados ficam).
 */
export interface EventoDaFila {
  evento: string; item_id: string | null; cliente_id: string | null; client_user_id: string | null; connector_id: string | null; recebido_em: string;
}
export interface ConexaoDoCliente { itemId: string; connectorId: string | null; desde: string }
export function conexoesDoCliente(eventos: readonly EventoDaFila[], clienteId: string): ConexaoDoCliente[] {
  const ordem = [...eventos].sort((a, b) => a.recebido_em.localeCompare(b.recebido_em));
  const vivas = new Map<string, ConexaoDoCliente>();
  const dono = new Map<string, string>();
  for (const e of ordem) {
    if (!e.item_id) continue;
    if (e.evento === 'item/created' && e.cliente_id) {
      if (!dono.has(e.item_id)) dono.set(e.item_id, e.cliente_id);
      if (dono.get(e.item_id) === clienteId && e.cliente_id === clienteId) {
        vivas.set(e.item_id, { itemId: e.item_id, connectorId: e.connector_id, desde: e.recebido_em });
      }
    } else if (e.evento === 'agroinblue/item_desconectado' && e.client_user_id === clienteId) {
      vivas.delete(e.item_id);
    }
  }
  return [...vivas.values()];
}

export const FRASE_DESCONECTAR_FALHOU = 'Não consegui desconectar agora. Nada foi apagado; tente de novo.';
export function fraseDoDesconectar(corpo: Record<string, unknown>): string {
  return corpo.ja_nao_existia === true
    ? 'A conexão já não existia na Pluggy; ficou registrada como desconectada.'
    : 'Banco desconectado: a Pluggy apagou a conexão. Os extratos já importados ficam.';
}
