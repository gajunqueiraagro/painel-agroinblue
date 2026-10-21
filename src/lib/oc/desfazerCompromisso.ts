/**
 * DESFAZER UM COMPROMISSO DA OC, UM MOTIVO SO' — OC-MOTIVO-UNICO-01.
 *
 * ⚠ NASCE DE TRES "erro" DIGITADOS EM 13 SEGUNDOS (8b211cae, 25/09/2026, compromisso 0fdec0eb):
 * estornar o titulo, cancelar a programacao e cancelar o compromisso eram tres dialogos, cada um de
 * duas etapas, cada um pedindo o motivo de novo — e cada evento saiu com um `estorno_id` diferente,
 * entao a trilha nem dizia que os tres eram um gesto so'.
 * ⚠ AS TRES RPCs NAO MUDAM, NEM AS GUARDAS DO BANCO. O que muda e' quem as chama: um gesto, na ordem
 * FOLHA -> RAIZ que o proprio banco impoe (a programacao recusa cancelar com titulo vivo; o
 * compromisso recusa com programacao ativa), com o MESMO motivo e o MESMO `p_estorno_id` — que as
 * tres ja' aceitavam e ninguem mandava.
 * ⚠ DESDE O OC-CC-MODAL-FINANCEIRO-01 E' TRANSACAO: quem encadeia e' o banco (`oc_desfazer_compromisso`), e uma
 * recusa (E3: titulo realizado, conciliado, liquidacao ativa) desfaz tudo. Contornar a recusa nao e' opcao.
 */
import { supabase } from '@/integrations/supabase/client';
import { fraseDoBancoOC } from '@/lib/oc/frasesDoBancoOC';

/** As tres mensagens de "ja' esta' desfeito" do banco (P0001, verbatim) — o mesmo teste do hook. OC-DESFAZER-PREVISTO-01b: o banco
 *  passou a escrever "Este lançamento já foi estornado." / "Esta programação já foi cancelada." / "Este compromisso já foi cancelado.";
 *  a forma antiga ("ja esta estornada", "ja cancelado") segue reconhecida. */
export const REGEX_JA_DESFEITO = /j[áa] (?:foi |est[áa] )?(?:estornad|cancelad)/i;

export interface TituloADesfazer {
  programacaoId: string;
  parcelaId: string;
  sequencia: number;
  valor: number;
  vencimento: string | null;
}

/** O que a tela conhece do compromisso: e' dele que sai o rol que a etapa 1 lista. */
export interface EstadoDoDesfazer {
  versao: number;
  titulos: TituloADesfazer[];
  programacaoAtivaId: string | null;
  compromissoCancelado: boolean;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : 'sem vencimento');
export const rotuloTitulo = (t: Pick<TituloADesfazer, 'valor' | 'vencimento'>) =>
  `título de ${brl(t.valor)} (venc. ${dataBr(t.vencimento)})`;

/** O rol do que falta, a partir de um estado — o que a etapa 1 lista e o que a recusa diz que falta. */
export function rolDoEstado(e: Omit<EstadoDoDesfazer, 'versao'>): string[] {
  const rol = e.titulos.map(t => `estornar o ${rotuloTitulo(t)}`);
  if (e.programacaoAtivaId) rol.push('cancelar a programação');
  if (!e.compromissoCancelado) rol.push('cancelar o compromisso');
  return rol;
}

/**
 * O LANÇAMENTO QUE TRAVA — OC-DESFAZER-PREVISTO-01b. Quando o banco recusa por um lançamento (realizado, conciliado ou agendado sem
 * confirmação), o id dele vem no DETAIL e o HINT traz, em JSON, o que a linha mostra (data, valor, status, conciliado, n/N, sinal).
 * ⚠ O ID SAI DO DETAIL, NUNCA DO TEXTO DA FRASE. Sem DETAIL de id, não há lançamento que trava (nulo); HINT torto só tira os extras.
 */
export interface LancamentoQueTrava {
  lancamentoId: string;
  data: string | null;
  valor: number | null;
  status: string | null;
  conciliado: boolean;
  sequencia: number | null;
  total: number | null;
  /** '1' entrada (recebimento) · '-1' saída (pagamento) */
  sinal: string | null;
}
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const numOuNulo = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export function lerLancamentoQueTrava(detail?: string | null, hint?: string | null): LancamentoQueTrava | null {
  const id = (detail ?? '').trim();
  if (id.length !== 36 || !UUID.test(id)) return null;
  let h: Record<string, unknown> = {};
  try { const j: unknown = hint ? JSON.parse(hint) : {}; if (j && typeof j === 'object' && !Array.isArray(j)) h = j as Record<string, unknown>; } catch { h = {}; }
  return {
    lancamentoId: id,
    data: typeof h.data === 'string' ? h.data : null,
    valor: numOuNulo(h.valor),
    status: typeof h.status === 'string' ? h.status : null,
    conciliado: h.conciliado === true,
    sequencia: numOuNulo(h.sequencia),
    total: numOuNulo(h.total),
    sinal: h.sinal == null ? null : String(h.sinal),
  };
}

export class ErroDesfazer extends Error {
  constructor(message: string, public feito: string[], public falta: string[], public trava: LancamentoQueTrava | null = null) {
    super(message); this.name = 'ErroDesfazer';
  }
}

/** O lançamento agendado que cai junto — a simulação o devolve em `agendados` (o bloco "será cancelado junto" do diálogo). */
export interface AgendadoADesfazer {
  lancamentoId: string;
  sequencia: number;
  total: number;
  valor: number;
  data: string | null;
  sinal: string | null;
}

/**
 * O RETORNO DE `oc_desfazer_compromisso`, lido sem cast — OC-CC-MODAL-FINANCEIRO-01. Peca torta = nulo (nunca sucesso inventado).
 */
export interface RetornoDesfazer {
  estornoId: string;
  simulado: boolean;
  titulos: { sequencia: number; valor: number }[];
  /** OC-DESFAZER-PREVISTO-01b — o que está agendado no banco e cai junto (vazio quando não há, ou quando o banco é anterior). */
  agendados: AgendadoADesfazer[];
  programacoesCanceladas: number;
  versao: number;
}
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function lerRetornoDoDesfazer(data: unknown): RetornoDesfazer | null {
  if (!ehObjeto(data) || data.ok !== true) return null;
  const versao = Number(data.operacao_versao);
  if (typeof data.estorno_id !== 'string' || !Number.isFinite(versao) || !Array.isArray(data.titulos_estornados)) return null;
  const titulos: RetornoDesfazer['titulos'] = [];
  for (const t of data.titulos_estornados) {
    if (!ehObjeto(t)) return null;
    const sequencia = Number(t.sequencia); const valor = Number(t.valor);
    if (!Number.isFinite(sequencia) || !Number.isFinite(valor)) return null;
    titulos.push({ sequencia, valor });
  }
  const agendados: AgendadoADesfazer[] = [];
  for (const a of Array.isArray(data.agendados) ? data.agendados : []) {
    if (!ehObjeto(a) || typeof a.lancamento_id !== 'string') return null;
    agendados.push({ lancamentoId: a.lancamento_id, sequencia: Number(a.sequencia) || 0, total: Number(a.total) || 0,
      valor: Number(a.valor) || 0, data: typeof a.data === 'string' ? a.data : null, sinal: a.sinal == null ? null : String(a.sinal) });
  }
  return {
    estornoId: data.estorno_id, simulado: data.simulado === true, titulos, agendados,
    programacoesCanceladas: Number(data.programacoes_canceladas) || 0, versao,
  };
}

/** O que o gesto fez, nas palavras de sempre — escrito do retorno do banco. */
export function feitoDoRetorno(r: RetornoDesfazer): string[] {
  const feito = r.titulos.map(t => `estornado o título de ${brl(t.valor)} (parcela ${t.sequencia})`);
  if (r.programacoesCanceladas > 0) feito.push('cancelada a programação');
  feito.push('cancelado o compromisso');
  return feito;
}

/** A chamada ao banco, injetavel para o teste. Devolve o que o PostgREST devolve. */
export type RpcDesfazer = (args: {
  p_operacao_id: string; p_versao: number; p_compromisso_id: string; p_motivo: string; p_simular: boolean; p_confirmar_agendado: boolean;
}) => Promise<{ data: unknown; error: { code?: string | null; message: string; details?: string | null; hint?: string | null } | null }>;

const rpcDoBanco: RpcDesfazer = async (args) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
  const { data, error } = await (supabase as any).rpc('oc_desfazer_compromisso', args);
  return { data, error };
};

/** As frases de quem NAO e' regra de negocio; a regra (P0001) sobe com o texto do banco, que desde o OC-DESFAZER-PREVISTO-01b vem
 *  pronto (português, acento, R$ e dd/mm/aaaa) — `fraseDoBancoOC` só cobre o que o banco ainda não escreve. */
export function fraseDoErroDoDesfazer(error: { code?: string | null; message: string }): string {
  switch (error.code) {
    case '40001': return 'A operação mudou enquanto você trabalhava. Recarregue e tente de novo.';
    case '42501': return 'Sem permissão para esta operação.';
    case 'P0002': return 'Operação não encontrada.';
    case 'P0001': return fraseDoBancoOC(error.message);
    default: return 'Não foi possível desfazer agora. Tente de novo.';
  }
}

/**
 * DESFAZ O COMPROMISSO NUM GESTO SO', ATOMICO — OC-CC-MODAL-FINANCEIRO-01 (Gabriel, 13/10/2026).
 *
 * ⚠ A CADEIA DE TRES IDAS QUE MORAVA AQUI SAIU: estornar cada titulo, cancelar a programacao e cancelar o compromisso eram
 *   tres RPCs, cada uma a sua transacao, e uma recusa no meio deixava o gesto pela metade ("o mesmo botao retoma"). Quem
 *   encadeia agora e' o BANCO (`oc_desfazer_compromisso`): os tres donos de sempre, um motivo, um `estorno_id`, UMA transacao —
 *   ou desfaz tudo, ou nada. Recusa de qualquer dono (titulo realizado, conciliado, liquidacao ativa) aborta a chamada inteira
 *   e sobe como `ErroDesfazer`, com `feito` VAZIO (nada foi feito) e `falta` = o rol que o chamador conhece.
 * ⚠ MOTIVO VAZIO NAO VAI AO BANCO — na GRAVACAO. A SIMULACAO (o diálogo simula ao abrir) vai sem motivo: o banco não o exige ali.
 * ⚠ AGENDADO SO' COM `confirmarAgendado` (OC-DESFAZER-PREVISTO-01b): sem ela, o banco recusa com a frase e o id no DETAIL.
 * ⚠ A RECUSA LEVA O LANCAMENTO QUE TRAVA (`trava`, do DETAIL/HINT) — e' por ele que o diálogo abre o lançamento.
 */
export async function executarDesfazerCompromisso({ operacaoId, versao, compromissoId, motivo, simular = false, confirmarAgendado = false, falta = [], rpc = rpcDoBanco }: {
  operacaoId: string; versao: number; compromissoId: string; motivo: string; simular?: boolean; confirmarAgendado?: boolean;
  falta?: string[]; rpc?: RpcDesfazer;
}): Promise<{ feito: string[]; retorno: RetornoDesfazer }> {
  const m = motivo.trim();
  if (m === '' && !simular) throw new ErroDesfazer('Informe o motivo.', [], falta);
  const { data, error } = await rpc({
    p_operacao_id: operacaoId, p_versao: versao, p_compromisso_id: compromissoId, p_motivo: m, p_simular: simular,
    p_confirmar_agendado: confirmarAgendado,
  });
  if (error) throw new ErroDesfazer(fraseDoErroDoDesfazer(error), [], falta, lerLancamentoQueTrava(error.details, error.hint));
  const retorno = lerRetornoDoDesfazer(data);
  if (!retorno) throw new ErroDesfazer('O banco respondeu fora do esperado. Recarregue antes de continuar.', [], falta);
  return { feito: feitoDoRetorno(retorno), retorno };
}
