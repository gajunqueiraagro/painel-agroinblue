/**
 * VINCULAR UM LANCAMENTO JA EXISTENTE A UMA OPERACAO COMERCIAL — VINCULAR-LANC-OC-01.
 *
 * O banco decide tudo: `oc_candidatas_vinculo` diz QUAIS OCs (e em que ordem — valor exato ao
 * centavo primeiro) e `oc_vincular_lancamento` grava. O "o que vai acontecer" da tela vem da
 * MESMA RPC com `p_simular = true`: ela percorre o caminho da gravacao e o desfaz no fim, entao
 * o resumo e' a conta que a gravacao faria — nenhuma regra copiada aqui.
 * ⚠ O QUE MORA NESTE ARQUIVO E' APRESENTACAO: o selo de cada candidata, a pre-selecao, o texto
 * dos avisos. Quem decide se o vinculo passa continua sendo a RPC.
 */
import { supabase } from '@/integrations/supabase/client';

export type AcaoCompromisso = 'preencher' | 'substituir' | 'recusar' | 'escolher_parcela';
export type AcaoCandidata = 'criar' | 'usar_compromisso' | 'escolher_compromisso';

export interface ParcelaCandidata {
  parcela_id: string;
  sequencia: number;
  valor: number;
  status: string;
  titulo_id: string | null;
  titulo_status: string | null;
  titulo_cancelado: boolean | null;
  titulo_conciliado: boolean | null;
  titulo_liquidado: boolean | null;
}

export interface CompromissoCandidato {
  id: string;
  componente: string;
  descricao: string | null;
  valor_total: number;
  status: string;
  lote_id: string | null;
  parcelas: ParcelaCandidata[];
  diferenca: number;
  valor_exato: boolean;
  acao_prevista: AcaoCompromisso;
}

export interface OperacaoCandidata {
  operacao_id: string;
  tipo_operacao: string;
  numero_documento: string | null;
  status_comercial: string;
  versao: number;
  data_operacao: string;
  data_referencia: string;
  distancia_dias: number;
  fazenda_id: string | null;
  fazenda_nome: string | null;
  mesma_fazenda: boolean;
  contraparte_id: string | null;
  contraparte_nome: string | null;
  valor_acordado: number | null;
  compromissos: CompromissoCandidato[];
  acao_prevista: AcaoCandidata;
  tem_titulo_vivo_do_componente: boolean;
  valor_exato: boolean;
  competencia_nova: string;
  competencia_muda_de_mes: boolean;
  movimento_duplicado: { movimento_antigo: string; movimentos_da_oc: string[] } | null;
}

export interface CabecalhoLancamento {
  id: string;
  descricao: string | null;
  valor: number;
  tipo_operacao: string;
  subcentro: string | null;
  data_competencia: string | null;
  data_pagamento: string | null;
  status_transacao: string | null;
  fazenda_nome: string | null;
  favorecido_nome: string | null;
  conciliado: boolean;
  origem_lancamento: string | null;
  importado: boolean;
  movimentacao_rebanho_id: string | null;
}

export interface SugestaoComponente { codigo: string; rotulo: string | null; fonte: 'subcentro' | 'descricao' }

export interface RespostaCandidatas {
  elegivel: boolean;
  motivo?: string | null;
  lancamento?: CabecalhoLancamento;
  regra?: { natureza: string; componentes: string[]; tipos_oc: string[] };
  componente_sugerido?: SugestaoComponente | null;
  candidatas?: OperacaoCandidata[];
}

export interface AvisoVinculo {
  codigo: 'movimento_duplicado' | 'competencia_mudou_de_mes' | 'favorecido_diferente'
    | 'classificacao_diverge_do_compromisso' | 'principal_diverge_da_base' | 'safra_diverge_da_competencia';
  de?: string; para?: string; base?: number | null; soma_principal?: number;
  compromisso?: string; lancamento?: string;
  movimento_antigo?: string; movimentos_da_oc?: string[];
}

export interface VinculoFeito {
  ok: true;
  acao: 'vinculado' | 'simulado';
  simulado: boolean;
  operacao_versao: number;
  titulos_vivos_do_compromisso: number;
  conciliado: boolean;
  compromisso: { id: string; acao: 'criado' | 'ajustado' | 'mantido'; valor_anterior: number | null; valor_total: number };
  parcela: { id: string; acao: 'criada' | 'preenchida' | 'substituida' };
  titulo_substituido: { titulo_id: string | null; valor: number | null; status_transacao: string | null; ja_estava_cancelado: boolean } | null;
  lancamento: { id: string; competencia_anterior: string | null; competencia_nova: string;
    hash_preservado: boolean; movimentacao_rebanho_id_solto: string | null };
  avisos: AvisoVinculo[];
}

export interface VinculoRecusado {
  ok: false;
  acao: 'recusado';
  motivo: 'escolher_compromisso' | 'escolher_parcela' | 'titulo_oc_liquidado';
  pode_criar_novo?: boolean;
  compromissos?: Array<{ id: string; componente?: string; descricao: string | null; valor_total: number; status: string }>;
  parcelas?: Array<{ id: string; sequencia: number; valor: number; vencimento: string | null; status: string; titulo_id: string | null; titulo_status: string | null }>;
  titulo_oc?: { id: string; valor: number; status_transacao: string; data_pagamento: string | null; conciliado: boolean };
  lancamento?: { id: string; valor: number; status_transacao: string; data_pagamento: string | null; conciliado: boolean };
  compromisso_id?: string;
  operacao_versao: number;
}

export type RespostaVinculo = VinculoFeito | VinculoRecusado;

/* ⚠ TYPE GUARD, nao `!r.ok`: o tsconfig roda sem `strictNullChecks`, e ai' o TS nao estreita a
   uniao pelo literal booleano. */
export const ehRecusa = (r: RespostaVinculo | null): r is VinculoRecusado => !!r && r.ok === false;
export const ehVinculo = (r: RespostaVinculo | null): r is VinculoFeito => !!r && r.ok === true;

export interface ParametrosVinculo {
  operacaoId: string;
  versao: number;
  lancamentoId: string;
  componente: string | null;
  motivo: string | null;
  compromissoId?: string | null;
  parcelaId?: string | null;
  criarNovo?: boolean;
  simular?: boolean;
}

/* ─── chamadas ─────────────────────────────────────────────────────────────────────────── */

export async function buscarCandidatasVinculo(lancamentoId: string): Promise<RespostaCandidatas> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
  const { data, error } = await (supabase as any).rpc('oc_candidatas_vinculo', { p_lancamento_id: lancamentoId });
  if (error) throw error;
  return data;
}

export async function vincularLancamentoOC(p: ParametrosVinculo): Promise<RespostaVinculo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
  const { data, error } = await (supabase as any).rpc('oc_vincular_lancamento', {
    p_operacao_id: p.operacaoId,
    p_versao_esperada: p.versao,
    p_lancamento_id: p.lancamentoId,
    p_componente: p.componente,
    p_motivo: p.motivo,
    p_compromisso_id: p.compromissoId ?? null,
    p_parcela_id: p.parcelaId ?? null,
    p_criar_novo: p.criarNovo ?? false,
    p_simular: p.simular ?? false,
  });
  if (error) throw error;
  return data;
}

/* O MAPA E' DO BANCO (`_oc_vinculo_mapa`) e muda so' por migration: lido uma vez por sessao. */
let mapaEmCache: Promise<Set<string>> | null = null;
export function subcentrosVinculaveis(): Promise<Set<string>> {
  if (!mapaEmCache) {
    mapaEmCache = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('_oc_vinculo_mapa');
      if (error) { mapaEmCache = null; throw error; }
      const linhas: Array<{ subcentro: string }> = data ?? [];
      return new Set(linhas.map(l => l.subcentro));
    })();
  }
  return mapaEmCache;
}

export async function lancamentoTemParteOC(lancamentoId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('zoo_operacao_partes')
    .select('id', { count: 'exact', head: true })
    .eq('financeiro_lancamento_id', lancamentoId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/* ─── apresentacao (puro) ──────────────────────────────────────────────────────────────── */

/**
 * A ACAO SO' APARECE ONDE O BANCO ACEITARIA: subcentro no mapa, lancamento salvo, nao cancelado
 * e sem parte de OC (nem cancelada — o indice unico de parte por titulo inclui as canceladas).
 * ⚠ E' ESPELHO PARA ESCONDER O BOTAO, nao o controle: a RPC recusa de novo se algo mudar.
 */
export function podeOferecerVinculo(p: {
  lancamentoId: string | null | undefined;
  subcentro: string | null | undefined;
  cancelado: boolean | null | undefined;
  temParte: boolean;
  subcentros: Set<string> | null;
}): boolean {
  return !!p.lancamentoId && !!p.subcentro && !p.cancelado && !p.temParte
    && !!p.subcentros && p.subcentros.has(p.subcentro);
}

/* Os nomes do catalogo `zoo_componentes_financeiros` (natureza obrigacao/principal, ativos). */
const ROTULO_COMPONENTE: Record<string, string> = {
  principal: 'Principal',
  taxas_impostos: 'Taxas e Impostos',
  frete: 'Frete',
  comissao: 'Comissão',
  taxa_aquisicao: 'Taxa de aquisição',
  adiantamento: 'Adiantamento ao Boitel',
  adiantamento_devolvido: 'Adiantamento devolvido',
};
export const rotuloComponente = (c: string) => ROTULO_COMPONENTE[c] ?? c;

/** O compromisso que a linha mostra: o do item escolhido; na falta, o primeiro da lista. */
export function compromissoDoItem(c: OperacaoCandidata, componente: string | null): CompromissoCandidato | null {
  return c.compromissos.find(k => k.componente === componente) ?? c.compromissos[0] ?? null;
}

export type TomSelo = 'verde' | 'ambar' | 'vermelho';
export interface SituacaoCandidata { rotulo: string; tom: TomSelo; selecionavel: boolean; title?: string }

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * O SELO DE CADA CANDIDATA. A ordem importa:
 *  1. titulo do item ja' realizado/conciliado -> vermelho e NAO selecionavel (a RPC recusaria;
 *     o `title` mostra os dois titulos);
 *  2. valor exato ao centavo -> verde "= valor";
 *  3. titulo do item vivo e aberto -> ambar, com o status dele (sera' substituido);
 *  4. mais de um compromisso do item -> ambar "escolher compromisso";
 *  5. resto -> verde "sem título do item".
 */
export function situacaoDaCandidata(c: OperacaoCandidata, componente: string | null, valorLancamento: number): SituacaoCandidata {
  const doItem = c.compromissos.filter(k => k.componente === componente);
  const alvo = doItem.length === 1 ? doItem[0] : null;
  if (alvo && alvo.acao_prevista === 'recusar') {
    const tit = alvo.parcelas.find(p => p.titulo_liquidado || p.titulo_conciliado || p.titulo_status === 'realizado');
    const conc = !!tit?.titulo_conciliado;
    return {
      rotulo: conc ? 'título conciliado' : 'título realizado', tom: 'vermelho', selecionavel: false,
      title: `Título da OC: ${tit?.titulo_status ?? 'realizado'} ${brl(tit?.valor ?? alvo.valor_total)}${conc ? ' · conciliado' : ''}`
        + ` — este lançamento: ${brl(valorLancamento)}. Os dois já são dinheiro real; desfaça um antes.`,
    };
  }
  if (c.valor_exato) return { rotulo: '= valor', tom: 'verde', selecionavel: true };
  if (alvo && alvo.acao_prevista === 'substituir') {
    const st = alvo.parcelas.find(p => p.titulo_id && !p.titulo_cancelado)?.titulo_status ?? 'aberto';
    return { rotulo: `título ${st}`, tom: 'ambar', selecionavel: true };
  }
  if (doItem.length > 1) return { rotulo: 'escolher compromisso', tom: 'ambar', selecionavel: true };
  return { rotulo: 'sem título do item', tom: 'verde', selecionavel: true };
}

/** Pre-selecao: SO' a primeira, e so' se for valor exato e selecionavel. Senao, nenhuma. */
export function candidataInicial(cands: OperacaoCandidata[], componente: string | null, valorLancamento: number): string | null {
  const c = cands[0];
  if (!c || !c.valor_exato) return null;
  return situacaoDaCandidata(c, componente, valorLancamento).selecionavel ? c.operacao_id : null;
}

const mesAno = (iso: string | null | undefined) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

export interface AvisoTela { codigo: AvisoVinculo['codigo']; tom: 'ambar' | 'vermelho'; texto: string }

export function textoDoAviso(a: AvisoVinculo): AvisoTela {
  switch (a.codigo) {
    case 'movimento_duplicado':
      return { codigo: a.codigo, tom: 'vermelho', texto:
        'Rebanho possivelmente em dobro: o lançamento vinha de uma movimentação antiga e a OC já tem a sua. '
        + 'O vínculo não mexe no rebanho — resolva a movimentação à parte.' };
    case 'principal_diverge_da_base': {
      const dif = a.base == null || a.soma_principal == null ? null : Math.round((a.soma_principal - a.base) * 100) / 100;
      return { codigo: a.codigo, tom: 'ambar', texto:
        `O principal da OC passa a ${brl(a.soma_principal)}, e o valor acordado é ${brl(a.base)}`
        + (dif == null ? '.' : ` (diferença ${brl(dif)}).`) };
    }
    case 'favorecido_diferente':
      return { codigo: a.codigo, tom: 'ambar', texto: 'O favorecido do lançamento é diferente do favorecido do compromisso da OC.' };
    case 'competencia_mudou_de_mes':
      return { codigo: a.codigo, tom: 'ambar', texto:
        `A competência muda de mês (${mesAno(a.de)} → ${mesAno(a.para)}): o DRE passa a contar o lançamento no mês da OC.` };
    case 'classificacao_diverge_do_compromisso':
      return { codigo: a.codigo, tom: 'ambar', texto:
        `O subcentro do lançamento (${a.lancamento ?? '—'}) é diferente do compromisso (${a.compromisso ?? '—'}). Cada um mantém o seu.` };
    case 'safra_diverge_da_competencia':
      return { codigo: a.codigo, tom: 'ambar', texto: 'A safra do lançamento não é a sugerida para a nova competência; ela não muda.' };
    default:
      return { codigo: a.codigo, tom: 'ambar', texto: a.codigo };
  }
}

export interface LinhaResumo { rotulo: string; valor: string; tom?: 'ambar' }

/** O "o que vai acontecer", lido da simulacao — na ordem do mock aprovado. */
export function resumoDoVinculo(s: VinculoFeito): LinhaResumo[] {
  const c = s.compromisso;
  const comp = c.acao === 'criado' ? `criado · ${brl(c.valor_total)}`
    : c.acao === 'ajustado' ? `${brl(c.valor_anterior)} → ${brl(c.valor_total)}`
    : `mantido · ${brl(c.valor_total)}`;
  const t = s.titulo_substituido;
  return [
    { rotulo: 'Compromisso', valor: comp },
    t
      ? { rotulo: 'Título da OC', valor: `${t.ja_estava_cancelado ? 'já cancelado' : `${t.status_transacao ?? '—'} · ${brl(t.valor)} — será cancelado`}`, tom: 'ambar' }
      : { rotulo: 'Título da OC', valor: 'nenhum a cancelar' },
    { rotulo: 'Competência', valor: s.lancamento.competencia_anterior === s.lancamento.competencia_nova
        ? `mantida · ${dataBr(s.lancamento.competencia_nova)}`
        : `${dataBr(s.lancamento.competencia_anterior)} → ${dataBr(s.lancamento.competencia_nova)}` },
    { rotulo: 'Rebanho antigo', valor: s.lancamento.movimentacao_rebanho_id_solto ? 'elo solto (o rebanho não muda)' : 'não há' },
    { rotulo: 'Conciliação', valor: s.conciliado ? 'mantida' : 'não conciliado' },
    { rotulo: 'A OC soma o item', valor: `${s.titulos_vivos_do_compromisso} ${s.titulos_vivos_do_compromisso === 1 ? 'vez' : 'vezes'}` },
  ];
}

/** "OC 123" pelo documento; sem documento, so' "OC" + data — nunca UUID na tela. */
export function rotuloOC(c: Pick<OperacaoCandidata, 'numero_documento' | 'data_operacao'>): string {
  return c.numero_documento ? `OC ${c.numero_documento}` : `OC de ${dataBr(c.data_operacao)}`;
}

export function mensagemDeErro(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String(e.message);
    if (/Conflito de versao/i.test(m)) return 'A operação mudou enquanto você olhava. Reabra o vínculo para ver o estado novo.';
    return m;
  }
  return String(e);
}
