/**
 * RATEIO-HIGINO-01 — o que a conferência lê e grava. NENHUM gravador novo:
 *  - lê os itens da conta comum (a conta de destino do pagamento) no mês do pagamento + os já ligados a um documento do pagamento;
 *  - grava as mudanças pela porta do "completar com a nota" (`completarComANota`: prévia, recusas, backup, Desfazer);
 *  - cria as linhas novas pelo writer do Novo lançamento (recebido pronto da tela: `criarItem`);
 *  - anexa a relação UMA vez e a liga a todos (`gravarDocumentosDoParcelamento`).
 * A recorrência nunca é tocada (D2): o item gerado só tem valor/nº/fazenda/conta atualizados quando o operador pede.
 */
import { supabase } from '@/integrations/supabase/client';
import { completarComANota, desfazerCompletar, cancelarCriados, registrarNaOperacao, type Consulta } from '@/lib/financeiro/nfeConsultas';
import { gravarDocumentosDoParcelamento, novoPendente } from '@/lib/financeiro/documentosPendentes';
import { rotuloDoPagamento, type ItemDoRateio, type ItemNovoDoRateio, type PedidoDoCompletar } from './conferirRateio';

/** O pagamento (a transferência para a conta comum), como a lista o conhece. Valor em CENTAVOS. */
export interface PagamentoDoRateio {
  id: string;
  descricao: string | null;
  valorCent: number;
  vencimento: string;
  contaDestinoId: string;
  status: string | null;
  dataPagamento: string | null;
}

export interface ItensDoRateio {
  /** os do mesmo rótulo do pagamento ou já ligados a um documento dele */
  desta: ItemDoRateio[];
  /** os outros itens do mês na conta comum (o operador puxa os que forem desta relação) */
  outros: ItemDoRateio[];
}

const PAGO = new Set(['realizado', 'conciliado']);
const cent = (v: unknown) => Math.round(Number(v ?? 0) * 100);

/** O mês do vencimento do pagamento: [1º dia, último dia]. */
export function mesDoPagamento(vencimento: string): { de: string; ate: string } {
  const [a, m] = vencimento.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { de: `${a}-${mm}-01`, ate: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

interface LinhaDoBanco {
  id: string; descricao: string | null; fazenda_id: string | null; plano_conta_id: string | null; valor: number | string | null;
  data_vencimento: string | null; data_competencia: string | null; numero_documento: string | null; tipo_documento: string | null;
  status_transacao: string | null; data_pagamento: string | null; conciliado_em: string | null;
}
function itemDe(l: LinhaDoBanco): ItemDoRateio {
  return {
    id: l.id, descricao: l.descricao, fazendaId: l.fazenda_id, planoContaId: l.plano_conta_id, valorCent: cent(l.valor),
    vencimento: l.data_vencimento, competencia: l.data_competencia, numeroDocumento: l.numero_documento, tipoDocumento: l.tipo_documento,
    pago: PAGO.has(l.status_transacao ?? '') || !!l.data_pagamento || !!l.conciliado_em,
  };
}

/** Separa os itens do mês: os desta relação (rótulo do pagamento ou ligados a um documento dele) e os outros. Pura. */
export function separarItens(linhas: readonly ItemDoRateio[], rotulo: string | null, ligados: ReadonlySet<string>): ItensDoRateio {
  const desta: ItemDoRateio[] = []; const outros: ItemDoRateio[] = [];
  for (const i of linhas) ((rotulo && i.numeroDocumento === rotulo) || ligados.has(i.id) ? desta : outros).push(i);
  return { desta, outros };
}

export async function lerItensDoRateio(clienteId: string, pagamento: PagamentoDoRateio): Promise<Consulta<ItensDoRateio>> {
  try {
    const { de, ate } = mesDoPagamento(pagamento.vencimento);
    const [itens, docs] = await Promise.all([
      supabase.from('financeiro_lancamentos_v2')
        .select('id, descricao, fazenda_id, plano_conta_id, valor, data_vencimento, data_competencia, numero_documento, tipo_documento, status_transacao, data_pagamento, conciliado_em')
        .eq('cliente_id', clienteId).eq('conta_bancaria_id', pagamento.contaDestinoId).eq('cancelado', false)
        .gte('data_vencimento', de).lte('data_vencimento', ate).order('data_vencimento').order('valor'),
      supabase.from('vw_lancamento_documentos').select('documento_id').eq('cliente_id', clienteId).eq('lancamento_id', pagamento.id).eq('cancelado', false),
    ]);
    if (itens.error) return { ok: false, motivo: 'Não consegui ler os itens da conta comum.' };
    if (docs.error) return { ok: false, motivo: 'Não consegui ler os documentos do pagamento.' };
    const docIds = [...new Set((docs.data ?? []).map((d) => d.documento_id).filter((x): x is string => typeof x === 'string'))];
    const ligados = new Set<string>();
    if (docIds.length) {
      const r = await supabase.from('vw_lancamento_documentos').select('lancamento_id').eq('cliente_id', clienteId).in('documento_id', docIds).eq('cancelado', false);
      if (r.error) return { ok: false, motivo: 'Não consegui ler os documentos do pagamento.' };
      for (const x of r.data ?? []) if (typeof x.lancamento_id === 'string') ligados.add(x.lancamento_id);
    }
    const linhas: LinhaDoBanco[] = itens.data ?? [];
    return { ok: true, valor: separarItens(linhas.map(itemDe), rotuloDoPagamento(pagamento.descricao), ligados) };
  } catch {
    return { ok: false, motivo: 'Não consegui ler os itens da conta comum.' };
  }
}

/** O writer do Novo lançamento, como a tela o entrega: devolve o id criado ou null (a recusa já dita por ele). */
export type CriarItem = (item: ItemNovoDoRateio) => Promise<string | null>;

export interface ResultadoDaGravacao { mudaram: number; criados: string[]; operacao: string | null; documentoGravado: boolean }

/**
 * Grava, nesta ordem e tudo ou nada no que é possível desfazer:
 *  1) a prévia do completar (recusa = nada grava, a frase volta);
 *  2) o completar de verdade (uma transação, com backup);
 *  3) as linhas novas (uma falha = cancela as criadas e desfaz o completar);
 *  4) o documento da relação, registrado no pagamento e ligado a todos; e o que nasceu entra na operação (o Desfazer leva junto).
 */
export async function gravarConferencia(
  clienteId: string, pagamentoId: string, pedido: readonly PedidoDoCompletar[], novos: readonly ItemNovoDoRateio[],
  conferidos: readonly string[], arquivo: File | null, criarItem: CriarItem,
): Promise<{ ok: true; valor: ResultadoDaGravacao } | { ok: false; motivo: string }> {
  let operacao: string | null = null;
  if (pedido.length) {
    const previa = await completarComANota(clienteId, pedido.map((p) => ({ ...p })), { juntar: false, chave: null, simular: true });
    if (previa.ok === false) return { ok: false, motivo: previa.motivo };
    if (!previa.valor.ok) return { ok: false, motivo: previa.valor.recusas[0] ?? 'O banco recusou a mudança.' };
    const r = await completarComANota(clienteId, pedido.map((p) => ({ ...p })), { juntar: false, chave: null, simular: false });
    if (r.ok === false) return { ok: false, motivo: r.motivo };
    if (!r.valor.ok) return { ok: false, motivo: r.valor.recusas[0] ?? 'O banco recusou a mudança.' };
    operacao = r.valor.operacao;
  }
  const criados: string[] = [];
  for (const n of novos) {
    const id = await criarItem(n);
    if (!id) {
      const naoCancelados = await cancelarCriados(criados, 'conferir rateio: uma linha nova não gravou');
      const desfeito = operacao ? await desfazerCompletar(operacao) : null;
      const resto = [naoCancelados ? `${naoCancelados} item(ns) novo(s) não cancelado(s)` : '', desfeito ? `o desfazer recusou: ${desfeito}` : ''].filter(Boolean).join(' · ');
      return { ok: false, motivo: `Uma linha nova não gravou; nada ficou valendo.${resto ? ` (${resto})` : ''}` };
    }
    criados.push(id);
  }
  let documentoGravado = false; const documentos: string[] = [];
  if (arquivo) {
    const todos = [pagamentoId, ...conferidos, ...criados];
    const pend = novoPendente({ especie: 'outro', nome: arquivo.name, observacao: 'Relação do rateio (conferida)' }, arquivo);
    const [g] = await gravarDocumentosDoParcelamento(clienteId, todos.map((lancamentoId, i) => ({ numero: i + 1, lancamentoId })), [pend]);
    documentoGravado = !!g?.gravado;
    if (g?.documentoId) documentos.push(g.documentoId);
  }
  if (operacao && (criados.length || documentos.length)) await registrarNaOperacao(operacao, criados, documentos);
  return { ok: true, valor: { mudaram: pedido.length, criados, operacao, documentoGravado } };
}
