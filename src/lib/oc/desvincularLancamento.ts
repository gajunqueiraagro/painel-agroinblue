/**
 * TIRAR UM LANCAMENTO DE UMA OPERACAO COMERCIAL SEM CANCELA-LO — OC-DESVINCULAR-01.
 *
 * O inverso de `oc_vincular_lancamento`. O lancamento FICA (valor, pagamento, conciliacao); sai a
 * ligacao: a parte e' cancelada, a liquidacao automatica do titulo e' estornada, e o compromisso do
 * item e' cancelado (parcela unica) ou reduzido (varias). Opcional: reclassificar no mesmo gesto.
 * ⚠ O BANCO DECIDE TUDO, e o "o que vai acontecer" da tela e' a MESMA RPC com `p_simular` — o
 *   caminho da gravacao, desfeito. Neste arquivo so' mora apresentacao.
 */
import { supabase } from '@/integrations/supabase/client';
import { dataBr } from '@/lib/oc/vincularLancamento';

export interface ClassificacaoDesvinculo {
  plano_conta_id: string | null;
  subcentro: string | null;
  centro_custo: string | null;
  grupo_custo: string | null;
  macro_custo: string | null;
  escopo_negocio: string | null;
  fazenda_id: string | null;
  fazenda_nome: string | null;
  safra_id: string | null;
  compoe_dre: boolean | null;
}

export interface DesvinculoFeito {
  ok: true;
  acao: 'desvinculado' | 'simulado';
  simulado: boolean;
  operacao_id: string;
  operacao_versao: number;
  parte_id: string;
  compromisso: { id: string; acao: 'cancelado' | 'reduzido'; componente: string; descricao: string | null;
    valor_anterior: number; valor_total: number };
  recebido: { de: number; para: number };
  compromissos_total: { de: number; para: number };
  liquidacoes_estornadas: string[];
  lancamento: { id: string; valor: number; data_pagamento: string | null; status_transacao: string | null;
    conta_bancaria_id: string | null; origem_de: string | null; origem_para: string | null;
    era_da_oc: boolean; intacto: boolean };
  conciliacao: { vinculos_antes: number; vinculos_depois: number };
  classificacao: { mudou: boolean; de: ClassificacaoDesvinculo; para: ClassificacaoDesvinculo };
}

export interface DesvinculoRecusado {
  ok: false;
  acao: 'recusado';
  motivo: 'nao_vinculado';
  operacao_versao: number;
}

export type RespostaDesvinculo = DesvinculoFeito | DesvinculoRecusado;

/* TYPE GUARD pela mesma razao do vincular: sem `strictNullChecks` o TS nao estreita pelo literal. */
export const ehDesvinculo = (r: RespostaDesvinculo | null): r is DesvinculoFeito => !!r && r.ok === true;
export const ehRecusaDesvinculo = (r: RespostaDesvinculo | null): r is DesvinculoRecusado => !!r && r.ok === false;

export interface ParametrosDesvinculo {
  operacaoId: string;
  versao: number;
  lancamentoId: string;
  motivo: string | null;
  planoContaId?: string | null;
  simular?: boolean;
}

export async function desvincularLancamentoOC(p: ParametrosDesvinculo): Promise<RespostaDesvinculo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
  const { data, error } = await (supabase as any).rpc('oc_desvincular_lancamento', {
    p_operacao_id: p.operacaoId,
    p_versao_esperada: p.versao,
    p_lancamento_id: p.lancamentoId,
    p_motivo: p.motivo,
    p_plano_conta_id: p.planoContaId ?? null,
    p_simular: p.simular ?? false,
  });
  if (error) throw error;
  return data;
}

/**
 * O GESTO SO' APARECE COM PARTE VIVA DE OC e lancamento vivo. Titulo cancelado com parte viva (os
 * orfaos) nao se desvincula — o caminho dele e' o "Desfazer compromisso" (D2).
 * ⚠ ESPELHO PARA MOSTRAR O BOTAO, nao o controle: a RPC recusa de novo.
 */
export function podeOferecerDesvinculo(p: { lancamentoId: string | null | undefined; cancelado: boolean | null | undefined;
  temParteViva: boolean }): boolean {
  return !!p.lancamentoId && !p.cancelado && p.temParteViva;
}

/**
 * OS TITULOS DE UM COMPROMISSO QUE SE PODEM DESVINCULAR (menu da linha da aba Financeiro da OC).
 * Parcela com parte e titulo VIVO: `materializada` e' o derivado "existe titulo vivo?" da view, NAO a
 * coluna crua — com o titulo cancelado ele vira false e a parcela segue `status = 'materializada'`.
 * Titulo cancelado com parte viva (os orfaos) nao entra: o caminho dele e' o "Desfazer compromisso".
 */
export function titulosDesvinculaveis(
  c: { compromissoId: string | null; status: string },
  parcelas: ReadonlyArray<{ compromissoId: string | null; materializada: boolean; parteId: string | null;
    tituloId: string | null; tituloValor: number | null; valor: number; sequencia: number }>,
): Array<{ lancamentoId: string; sequencia: number; valor: number }> {
  if (c.status === 'cancelado') return [];
  return parcelas
    .filter(p => p.compromissoId === c.compromissoId && p.materializada && !!p.parteId && !!p.tituloId)
    .map(p => ({ lancamentoId: p.tituloId ?? '', sequencia: p.sequencia, valor: p.tituloValor ?? p.valor }));
}

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface LinhaResumoDesvinculo { rotulo: string; valor: string; tom?: 'ambar' }

/** Os campos que o operador reconhece: subcentro sempre; fazenda e DRE so' se mudarem. */
function classificacaoEmTexto(c: DesvinculoFeito['classificacao']): LinhaResumoDesvinculo[] {
  if (!c.mudou) return [{ rotulo: 'Classificação', valor: `mantida · ${c.de.subcentro ?? '—'}` }];
  const linhas: LinhaResumoDesvinculo[] = [
    { rotulo: 'Classificação', valor: `${c.de.subcentro ?? '—'} → ${c.para.subcentro ?? '—'}`, tom: 'ambar' },
  ];
  if (c.de.fazenda_id !== c.para.fazenda_id) {
    linhas.push({ rotulo: 'Fazenda', valor: `${c.de.fazenda_nome ?? '—'} → ${c.para.fazenda_nome ?? '—'}`, tom: 'ambar' });
  }
  if (c.de.safra_id && !c.para.safra_id) linhas.push({ rotulo: 'Safra', valor: 'sai (conta administrativa)', tom: 'ambar' });
  if (c.de.compoe_dre !== c.para.compoe_dre) {
    linhas.push({ rotulo: 'DRE', valor: c.para.compoe_dre ? 'passa a compor' : 'deixa de compor', tom: 'ambar' });
  }
  return linhas;
}

/**
 * O "o que vai acontecer", lido da simulacao, na ordem do briefing: o lancamento fica; sai da OC;
 * compromisso cancelado/reduzido; recebido X -> Y; classificacao mantida ou de A para B.
 */
export function resumoDoDesvinculo(s: DesvinculoFeito, rotuloOc: string): LinhaResumoDesvinculo[] {
  const l = s.lancamento;
  const c = s.compromisso;
  const conc = s.conciliacao.vinculos_antes > 0 ? 'mantida' : 'não conciliado';
  return [
    { rotulo: 'O lançamento fica', valor: `${brl(l.valor)} · pago ${dataBr(l.data_pagamento)} · conciliação ${conc}` },
    { rotulo: 'Sai da', valor: rotuloOc },
    c.acao === 'cancelado'
      ? { rotulo: 'Compromisso', valor: `${c.descricao ?? c.componente} · ${brl(c.valor_anterior)} — cancelado`, tom: 'ambar' }
      : { rotulo: 'Compromisso', valor: `${c.descricao ?? c.componente} · ${brl(c.valor_anterior)} → ${brl(c.valor_total)}`, tom: 'ambar' },
    { rotulo: 'Recebido da OC', valor: `${brl(s.recebido.de)} → ${brl(s.recebido.para)}` },
    ...classificacaoEmTexto(s.classificacao),
  ];
}
