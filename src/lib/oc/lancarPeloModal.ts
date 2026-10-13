/**
 * A OC LANCA PELO MODAL DO FINANCEIRO — OC-CC-MODAL-FINANCEIRO-01 (Gabriel, 13/10/2026).
 *
 * "Programar recebimento/pagamento" (o principal) e "Nova despesa" da OC em conta corrente abrem o MESMO
 * `LancamentoV2Dialog`, em MODO OC. Este arquivo e' o dono do modo: o que trava, o que sugere, o que vai ao banco e
 * as frases. O modal so' le daqui.
 *
 * ⚠ QUEM GRAVA E' O BANCO, NUMA CHAMADA: `oc_lancar_pelo_modal` (compromisso -> programacao com as N parcelas da
 *   PROPRIA OC -> um titulo programado por parcela). No modo OC o Salvar NUNCA passa pelo `onSave` do Financeiro nem
 *   pelo `fn_parcelamento_cadastrar`.
 * ⚠ SIMULACAO = GRAVACAO (`p_simular`): o aviso de "acima do saldo" e a classificacao do principal vem dela.
 * ⚠ NENHUMA REGRA DE DRE AQUI: o principal sai do DRE pela parte viva, no banco; a despesa entra pela linha do plano.
 */
import { supabase } from '@/integrations/supabase/client';
import { CENTRO_CUSTO_COMPRA_BOVINOS } from '@/hooks/useOperacaoLiquidacao';
import { fraseDoBancoOC } from '@/lib/oc/frasesDoBancoOC';

export type NaturezaDoModalOC = 'principal' | 'obrigacao';
export type TipoDaOC = 'venda' | 'compra' | 'abate';

/** Os campos que o modal sabe travar por `lockedFields` — a uniao e' UMA, a do modal. */
export type CampoTravavelDoModal =
  | 'valor' | 'data_pagamento' | 'conta_bancaria_id' | 'conta_destino_id' | 'tipo_operacao'
  | 'fazenda_id' | 'favorecido_id' | 'classificacao' | 'status_transacao';

/**
 * O QUE O MODO OC TRAVA. Principal: tipo, fazenda, favorecido (a contraparte), classificacao (a conta da OC) e o status
 * (Programado). Despesa: tipo, fazenda e status — classificacao e favorecido sao do operador.
 */
export const TRAVAS_DO_MODO_OC: Record<NaturezaDoModalOC, readonly CampoTravavelDoModal[]> = {
  principal: ['tipo_operacao', 'fazenda_id', 'favorecido_id', 'classificacao', 'status_transacao'],
  obrigacao: ['tipo_operacao', 'fazenda_id', 'status_transacao'],
};
export const STATUS_DO_MODO_OC = 'programado';

/** A compra PAGA o principal; venda e abate RECEBEM. Despesa e' sempre saida. */
export function tipoDoLancamentoOC(natureza: NaturezaDoModalOC, tipo: TipoDaOC): '1-Entradas' | '2-Saídas' {
  return natureza === 'principal' && tipo !== 'compra' ? '1-Entradas' : '2-Saídas';
}

/**
 * O VALOR QUE O PRINCIPAL SUGERE: o saldo em aberto = acordado − ja' recebido/pago − ja' programado (a mesma conta do aviso
 * "acima do saldo" do banco, com os numeros que `oc_conta_corrente` ja' devolve). Sem acordado, ou sem saldo: nada sugere.
 */
export function saldoAProgramar(cc: { valorAcordado: number | null; recebido: number; programado: number } | null): number | null {
  if (!cc || cc.valorAcordado == null) return null;
  const v = Math.round((cc.valorAcordado - Math.abs(cc.recebido) - Math.abs(cc.programado)) * 100) / 100;
  return v > 0 ? v : null;
}

/** O PRINCIPAL JA' ESTA' COBERTO: a MESMA conta da sugestao deu zero ou menos — nao ha' o que programar. Sem acordado, nao se afirma. */
export function principalJaCoberto(cc: { valorAcordado: number | null; recebido: number; programado: number } | null): boolean {
  return !!cc && cc.valorAcordado != null && saldoAProgramar(cc) === null;
}
export const MOTIVO_PRINCIPAL_COBERTO = 'Principal já programado até o valor da operação';

export interface ItemDaOperacao { codigo: string; nome: string }

/** O que o hospedeiro entrega ao modal para ele entrar em modo OC. */
export interface OrigemOC {
  operacaoId: string;
  versao: number;
  natureza: NaturezaDoModalOC;
  tipoOperacao: TipoDaOC;
  /** "OC #e8fec78b · Venda 140 N" — a faixa de origem. */
  rotulo: string;
  /** Catalogo do "Item da operação" (so' na despesa): o mesmo do "Nova despesa". */
  itens: readonly ItemDaOperacao[];
  /** O link de volta da faixa de origem (fecha o modal e fica na OC). */
  onVoltar?: () => void;
  /** Depois de gravar: a OC rele e sobe a versao. */
  aoLancar: (retorno: RetornoLancarPeloModal) => void | Promise<void>;
}

export function tituloDoModoOC(natureza: NaturezaDoModalOC, tipo: TipoDaOC): string {
  if (natureza === 'obrigacao') return 'Nova despesa da operação';
  return tipo === 'compra' ? 'Programar pagamento' : 'Programar recebimento';
}
export const rotuloDaOrigemOC = (operacaoId: string, descricao: string): string =>
  `OC #${operacaoId.slice(0, 8)}${descricao ? ` · ${descricao}` : ''}`;

export const MOTIVO_ITEM_OBRIGATORIO = 'Escolha o item da operação.';
export const MOTIVO_VENCIMENTO_OBRIGATORIO = 'Informe o vencimento.';
export const MOTIVO_STATUS_TRAVADO_OC = 'Pela operação o lançamento nasce programado; o pagamento se registra depois, no Financeiro.';
export const MOTIVO_CLASSIFICACAO_DA_OC = 'A conta do principal é a da operação (a do lote de maior valor).';

/**
 * AS CLASSIFICACOES QUE A DESPESA OFERECE — a regra do "Nova despesa": na COMPRA, so' as contas do centro "Compra de
 * Bovinos" (se o filtro esvaziar a lista, vale a lista inteira: nunca um seletor vazio); venda e abate, a lista como veio.
 * A direcao (saida) quem filtra e' o proprio seletor do modal, pelo tipo travado.
 */
export function classificacoesDaDespesa<T extends { centro_custo?: string | null }>(todas: readonly T[], tipo: TipoDaOC): readonly T[] {
  if (tipo !== 'compra') return todas;
  const doCentro = todas.filter(c => c.centro_custo === CENTRO_CUSTO_COMPRA_BOVINOS);
  return doCentro.length > 0 ? doCentro : todas;
}

export interface ParcelaParaRpc { valor: number; vencimento: string; conta_id: string | null }
/** As parcelas como a RPC as recebe: valor em duas casas, vencimento ISO, a conta escolhida no modal em todas. */
export function parcelasParaRpc(linhas: readonly { valor: number; vencimento: string | null | undefined }[], contaId: string | null): ParcelaParaRpc[] {
  return linhas.map(l => ({ valor: Math.round(Math.abs(l.valor) * 100) / 100, vencimento: l.vencimento ?? '', conta_id: contaId || null }));
}

export interface AvisoAcimaDoSaldo { excesso: number; base: number; recebido: number; programado: number }
export interface RetornoLancarPeloModal {
  simulado: boolean;
  natureza: NaturezaDoModalOC;
  componente: string;
  compromissoId: string | null;
  parcelas: { sequencia: number; tituloId: string | null; valor: number; vencimento: string | null }[];
  total: number;
  acimaDoSaldo: AvisoAcimaDoSaldo | null;
  classificacao: { subcentro: string | null; planoContaId: string | null };
  versao: number;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Le o retorno de `oc_lancar_pelo_modal` sem cast. Peca torta = nulo: nunca sucesso inventado. */
export function lerRetornoLancarPeloModal(data: unknown): RetornoLancarPeloModal | null {
  if (!ehObjeto(data) || data.ok !== true) return null;
  const versao = Number(data.operacao_versao);
  const total = Number(data.total);
  if (!Number.isFinite(versao) || !Number.isFinite(total) || !Array.isArray(data.parcelas)) return null;
  if (data.natureza !== 'principal' && data.natureza !== 'obrigacao') return null;
  const parcelas: RetornoLancarPeloModal['parcelas'] = [];
  for (const p of data.parcelas) {
    if (!ehObjeto(p)) return null;
    const sequencia = Number(p.sequencia); const valor = Number(p.valor);
    if (!Number.isFinite(sequencia) || !Number.isFinite(valor)) return null;
    parcelas.push({ sequencia, tituloId: texto(p.titulo_id), valor, vencimento: texto(p.vencimento) });
  }
  let acimaDoSaldo: AvisoAcimaDoSaldo | null = null;
  for (const a of Array.isArray(data.avisos) ? data.avisos : []) {
    if (!ehObjeto(a) || a.codigo !== 'acima_do_saldo') continue;
    const excesso = Number(a.excesso);
    if (!Number.isFinite(excesso) || excesso <= 0) continue;
    acimaDoSaldo = { excesso, base: Number(a.base) || 0, recebido: Number(a.recebido) || 0, programado: Number(a.programado) || 0 };
  }
  const cls = ehObjeto(data.classificacao) ? data.classificacao : {};
  return {
    simulado: data.simulado === true, natureza: data.natureza, componente: texto(data.componente) ?? '',
    compromissoId: texto(data.compromisso_id), parcelas, total, acimaDoSaldo,
    classificacao: { subcentro: texto(cls.subcentro), planoContaId: texto(cls.plano_conta_id) },
    versao,
  };
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** O aviso AMBAR do modal: acima do saldo em aberto AVISA com o valor do excesso, nunca bloqueia. */
export function fraseAcimaDoSaldo(aviso: AvisoAcimaDoSaldo, tipo: TipoDaOC): string {
  const verbo = tipo === 'compra' ? 'pagar' : 'receber';
  return `${brl(aviso.excesso)} acima do saldo a ${verbo} da operação — pode salvar, fica registrado.`;
}

/** P0001 e' regra de negocio: passa pelo mapa de frases (`frasesDoBancoOC.ts`); fora dele, sobe como veio. O resto vira frase da casa. */
export function fraseDoErroAoLancar(error: { code?: string | null; message: string }): string {
  switch (error.code) {
    case '40001': return 'A operação mudou enquanto você trabalhava. Recarregue e tente de novo.';
    case '42501': return 'Sem permissão para esta operação.';
    case 'P0002': return 'Operação não encontrada.';
    case 'P0001': return fraseDoBancoOC(error.message);
    default: return 'Não foi possível gravar agora. Tente de novo.';
  }
}

export interface PedidoLancarPeloModal {
  operacaoId: string; versao: number; natureza: NaturezaDoModalOC;
  /** O item da operacao (despesa). No principal vai nulo: o banco usa 'recebimento'. */
  componente: string | null;
  planoContaId: string | null;
  favorecidoId: string | null;
  parcelas: readonly ParcelaParaRpc[];
  forma: string | null; dadosPagamento: string | null; documento: string | null; observacao: string | null; descricao: string | null;
  simular: boolean;
}
export type RpcLancarPeloModal = (args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string | null; message: string } | null }>;

const rpcDoBanco: RpcLancarPeloModal = async (args) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: RPC fora de types.ts
  const { data, error } = await (supabase as any).rpc('oc_lancar_pelo_modal', args);
  return { data, error };
};

/** Os argumentos da RPC, num lugar so' — simulacao e gravacao mandam a MESMA coisa, salvo `p_simular`. */
export function argsDoLancar(p: PedidoLancarPeloModal): Record<string, unknown> {
  const principal = p.natureza === 'principal';
  return {
    p_operacao_id: p.operacaoId, p_versao: p.versao, p_natureza: p.natureza,
    p_componente: principal ? null : (p.componente || null),
    p_plano_conta_id: principal ? null : (p.planoContaId || null),
    p_favorecido_id: principal ? null : (p.favorecidoId || null),
    p_parcelas: p.parcelas,
    p_forma: p.forma || null, p_dados_pagamento: p.dadosPagamento || null, p_documento: p.documento || null,
    p_observacao: p.observacao || null, p_descricao: p.descricao || null, p_simular: p.simular,
  };
}

export type ResultadoLancar = { ok: true; retorno: RetornoLancarPeloModal } | { ok: false; erro: string };
export async function lancarPeloModal(p: PedidoLancarPeloModal, rpc: RpcLancarPeloModal = rpcDoBanco): Promise<ResultadoLancar> {
  const { data, error } = await rpc(argsDoLancar(p));
  if (error) return { ok: false, erro: fraseDoErroAoLancar(error) };
  const retorno = lerRetornoLancarPeloModal(data);
  if (!retorno) return { ok: false, erro: 'O banco respondeu fora do esperado. Recarregue antes de continuar.' };
  return { ok: true, retorno };
}
