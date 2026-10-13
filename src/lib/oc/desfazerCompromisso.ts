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

/** As tres mensagens de "ja' esta' desfeito" do banco (P0001, verbatim) — o mesmo teste do hook. */
export const REGEX_JA_DESFEITO = /j[áa] (est[áa] estornad|cancelad)/i;

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

export class ErroDesfazer extends Error {
  constructor(message: string, public feito: string[], public falta: string[]) { super(message); this.name = 'ErroDesfazer'; }
}

/**
 * O RETORNO DE `oc_desfazer_compromisso`, lido sem cast — OC-CC-MODAL-FINANCEIRO-01. Peca torta = nulo (nunca sucesso inventado).
 */
export interface RetornoDesfazer {
  estornoId: string;
  simulado: boolean;
  titulos: { sequencia: number; valor: number }[];
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
  return {
    estornoId: data.estorno_id, simulado: data.simulado === true, titulos,
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
  p_operacao_id: string; p_versao: number; p_compromisso_id: string; p_motivo: string; p_simular: boolean;
}) => Promise<{ data: unknown; error: { code?: string | null; message: string } | null }>;

const rpcDoBanco: RpcDesfazer = async (args) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
  const { data, error } = await (supabase as any).rpc('oc_desfazer_compromisso', args);
  return { data, error };
};

/** As frases de quem NAO e' regra de negocio; a regra (P0001) sobe com o texto do banco, como nos gestos avulsos. */
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
 * ⚠ MOTIVO VAZIO NAO VAI AO BANCO.
 */
export async function executarDesfazerCompromisso({ operacaoId, versao, compromissoId, motivo, simular = false, falta = [], rpc = rpcDoBanco }: {
  operacaoId: string; versao: number; compromissoId: string; motivo: string; simular?: boolean; falta?: string[]; rpc?: RpcDesfazer;
}): Promise<{ feito: string[]; retorno: RetornoDesfazer }> {
  const m = motivo.trim();
  if (m === '') throw new ErroDesfazer('Informe o motivo.', [], falta);
  const { data, error } = await rpc({
    p_operacao_id: operacaoId, p_versao: versao, p_compromisso_id: compromissoId, p_motivo: m, p_simular: simular,
  });
  if (error) throw new ErroDesfazer(fraseDoErroDoDesfazer(error), [], falta);
  const retorno = lerRetornoDoDesfazer(data);
  if (!retorno) throw new ErroDesfazer('O banco respondeu fora do esperado. Recarregue antes de continuar.', [], falta);
  return { feito: feitoDoRetorno(retorno), retorno };
}
