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
    ? `${banco} conectado. O aviso chega ao AGROinBLUE pelo webhook; as transações entram na próxima etapa.`
    : 'Banco conectado. O aviso chega ao AGROinBLUE pelo webhook; as transações entram na próxima etapa.';
}

export interface OpcoesDoWidget {
  connectToken: string;
  includeSandbox: boolean;
  connectorIds: number[];
  /** OF-ATUALIZAR-DO-BANCO-01: o Widget em MODO ATUALIZAÇÃO deste item (Reconectar) */
  updateItem?: string;
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

/**
 * OPENFINANCE-P3a — "Escolher contas": a lista que `openfinance-contas` devolve (tipo · banco · final · titular/documento mascarados) e
 * a escolha do admin. TUDO DESMARCADO na 1ª vez (só a já permitida vem marcada); só as marcadas entram, o resto nunca é lido nem gravado.
 */
export interface ContaDaConexao {
  accountId: string; tipoLegivel: string; banco: string; final4: string | null; titular: string | null; documento: string | null; permitida: boolean;
  /** PRONTO-NJ-01: 'BANK' (conta corrente/poupança: lança numa conta do sistema) ou 'CREDIT' (cartão); a agência, para a sugestão */
  tipo: 'BANK' | 'CREDIT' | null; agencia: string | null;
}
export function contasDaResposta(corpo: Record<string, unknown>): ContaDaConexao[] {
  const v = corpo.contas;
  if (!Array.isArray(v)) return [];
  return v.flatMap((c): ContaDaConexao[] => {
    const id = textoDe(c, 'account_id');
    if (!id || !ehObjeto(c)) return [];
    return [{ accountId: id, tipoLegivel: textoDe(c, 'tipo_legivel') ?? 'Conta', banco: textoDe(c, 'banco') ?? 'Banco',
      final4: textoDe(c, 'final4'), titular: textoDe(c, 'titular'), documento: textoDe(c, 'documento'), permitida: c.permitida === true,
      tipo: c.tipo === 'BANK' || c.tipo === 'CREDIT' ? c.tipo : null, agencia: textoDe(c, 'agencia') }];
  });
}
/** o conjunto marcado de partida: SÓ o que já está permitido (nada novo vem marcado) */
export const marcadasDePartida = (contas: readonly ContaDaConexao[]): Set<string> => new Set(contas.filter(c => c.permitida).map(c => c.accountId));
/** há o que gravar? (a escolha difere do que já está permitido) */
export function escolhaMudou(contas: readonly ContaDaConexao[], marcadas: ReadonlySet<string>): boolean {
  const antes = marcadasDePartida(contas);
  return antes.size !== marcadas.size || [...marcadas].some(id => !antes.has(id));
}
const inteiroDe = (o: Record<string, unknown>, k: string): number => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? Math.trunc(Number(o[k])) : 0);
export function frasePrevia(corpo: Record<string, unknown>): string {
  return `Entram ${inteiroDe(corpo, 'ligar')} · continuam ${inteiroDe(corpo, 'manter')} · saem ${inteiroDe(corpo, 'desligar')}. As não marcadas nunca são lidas.`;
}
export function fraseDoPermitir(corpo: Record<string, unknown>): string {
  const n = inteiroDe(corpo, 'ligar') + inteiroDe(corpo, 'manter');
  return n === 0 ? 'Nenhuma conta deste banco entra no AGROinBLUE.' : `Escolha gravada: ${n} ${n === 1 ? 'conta entra' : 'contas entram'} no AGROinBLUE; as outras nunca são lidas.`;
}
/** o item que o Widget acabou de conectar (para abrir "Escolher contas" logo depois) */
export function itemDoSucesso(dados: unknown): string | null {
  const item = ehObjeto(dados) ? dados.item : null;
  return textoDe(item, 'id');
}
export const FRASE_CONTAS_FALHOU = 'Não consegui ler as contas deste banco agora. Tente de novo.';
export const FRASE_PERMITIR_FALHOU = 'Não consegui gravar a escolha agora. Nada foi gravado; tente de novo.';

/**
 * OPENFINANCE-PRONTO-NJ-01 (8) — quem usa o Open Finance do cliente na tela (Gabriel 12:17 e 15:36; a mesma regra da borda):
 *   · VÊ (a coluna, o selo, "Bancos conectados" e a situação): o admin AGROinBLUE, o PROPRIETÁRIO e o GESTOR do cliente;
 *   · CONECTA, ESCOLHE AS CONTAS e RECONECTA: só o admin e o PROPRIETÁRIO (o gestor vê os botões desabilitados, com o motivo).
 * O financeiro não vê nem conecta (D3 do 118150). Desconectar e buscar o extrato seguem só o admin.
 */
export const podeVerOpenFinance = (isAdmin: boolean, perfil: string | null | undefined): boolean =>
  isAdmin || perfil === 'proprietario' || perfil === 'gestor_cliente';
export const podeConectarOpenFinance = (isAdmin: boolean, perfil: string | null | undefined): boolean => isAdmin || perfil === 'proprietario';
export const MOTIVO_SO_PROPRIETARIO = 'Só o proprietário conecta os bancos.';

/** (1)+(7) — a lista de "Bancos conectados" como a Pluggy a vê (`openfinance-contas` 'conexoes'), com as tentativas que não completaram */
export type SituacaoDaConexao = 'conectado' | 'lendo' | 'esperando' | 'erro';
export interface ConexaoDaJanela {
  itemId: string; banco: string; empresa: boolean; situacao: SituacaoDaConexao; frase: string | null; criadoEm: string | null;
}
const SITUACOES: readonly SituacaoDaConexao[] = ['conectado', 'lendo', 'esperando', 'erro'];
const ehSituacao = (v: unknown): v is SituacaoDaConexao => typeof v === 'string' && SITUACOES.some((x) => x === v);
export function conexoesDaResposta(corpo: Record<string, unknown>): ConexaoDaJanela[] {
  const v = corpo.conexoes;
  if (!Array.isArray(v)) return [];
  return v.flatMap((c): ConexaoDaJanela[] => {
    const id = textoDe(c, 'item_id');
    if (!id || !ehObjeto(c) || !ehSituacao(c.situacao)) return [];
    return [{ itemId: id, banco: textoDe(c, 'banco') ?? 'Banco', empresa: c.empresa === true, situacao: c.situacao,
      frase: textoDe(c, 'frase'), criadoEm: textoDe(c, 'criado_em') }];
  });
}
export const ROTULO_DA_SITUACAO: Record<SituacaoDaConexao, string> = {
  conectado: 'Conectado', lendo: 'Lendo o banco', esperando: 'Esperando o titular', erro: 'Não completou',
};
export const FRASE_CONEXOES_FALHOU = 'Não consegui ler as conexões deste cliente. Tente de novo.';

/** (1) — a Pluggy ainda lendo o banco logo depois do consentimento (a lista de contas pode vir vazia): a tela relê sozinha */
export const lendoDaResposta = (corpo: Record<string, unknown>): boolean => corpo.lendo === true;
export const bancoDaResposta = (corpo: Record<string, unknown>): string | null => textoDe(corpo, 'banco');
export const FRASE_AINDA_LENDO = 'A Pluggy ainda está lendo as contas deste banco. Espere um pouco e clique em "Ler de novo".';

/**
 * (1) — "Escolher contas" num passo só: o que marcar entra (permitir) e cada conta corrente marcada lança na conta do sistema escolhida
 * (ligar). `ligadaHoje` = a conta do sistema que cada conta do banco JÁ recebe. A mesma conta do sistema para duas contas do banco = bloqueia
 * (o banco recusaria a 2ª). O cartão não lança em conta corrente: a fatura entra pela regra da fonte da fatura (Code 5, 118730).
 */
export interface LigacaoPlanejada { accountId: string; contaId: string | null }
export interface PlanoDaGravacao { accountIds: string[]; ligacoes: LigacaoPlanejada[]; repetida: string | null }
export function planoDaGravacao(contas: readonly ContaDaConexao[], marcadas: ReadonlySet<string>,
  escolha: Readonly<Record<string, string>>, ligadaHoje: Readonly<Record<string, string | null>>): PlanoDaGravacao {
  const ligacoes: LigacaoPlanejada[] = [];
  const usadas = new Map<string, number>();
  for (const c of contas) {
    if (!marcadas.has(c.accountId) || c.tipo !== 'BANK') continue;
    const quer = escolha[c.accountId] || null;
    if (quer) usadas.set(quer, (usadas.get(quer) ?? 0) + 1);
    if (quer !== (ligadaHoje[c.accountId] ?? null)) ligacoes.push({ accountId: c.accountId, contaId: quer });
  }
  const repetida = [...usadas.entries()].find(([, n]) => n > 1)?.[0] ?? null;
  return { accountIds: contas.filter((c) => marcadas.has(c.accountId)).map((c) => c.accountId), ligacoes, repetida };
}
/** a frase das ligações na prévia, CURTA (o destino de cada conta já está na linha dela): "Liga 2 contas correntes às contas escolhidas." */
export function fraseDasLigacoes(plano: PlanoDaGravacao): string {
  const n = plano.ligacoes.length;
  return n === 0 ? '' : n === 1 ? 'Liga 1 conta corrente à conta escolhida.' : `Liga ${n} contas correntes às contas escolhidas.`;
}
export const FRASE_REPETIDA = 'Duas contas do banco estão indo para a mesma conta do sistema. Troque uma antes de gravar.';
