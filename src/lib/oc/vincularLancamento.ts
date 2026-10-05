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
  /** OC-VINCULAR-CANDIDATAS-01: compromisso − soma das parcelas vivas, EXATA (nulo sem parcela); e a marca "pagas com diferença". */
  diferenca_parcelas?: number | null;
  pagas_com_diferenca?: boolean;
  /** VINCULAR-FIX-01: o compromisso e' do MESMO subcentro do lancamento (entra qualquer que seja o componente). */
  mesmo_subcentro?: boolean;
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
  /** VINCULAR-FIX-01: cabecas da OC (a do cabecalho; sem ela, a soma dos lotes). */
  qtd?: number | null;
  eh_boitel?: boolean;
  /** Todos os compromissos que cabem ja' estao liquidados — so' entao a OC fica bloqueada. */
  todos_liquidados?: boolean;
  pista_descricao?: number;
  compromissos: CompromissoCandidato[];
  acao_prevista: AcaoCandidata;
  tem_titulo_vivo_do_componente: boolean;
  valor_exato: boolean;
  competencia_nova: string;
  competencia_muda_de_mes: boolean;
  movimento_duplicado: { movimento_antigo: string; movimentos_da_oc: string[] } | null;
  /**
   * OC-VINCULAR-CANDIDATAS-01 — as MARCAS que o banco põe no que antes sumia da lista. ⚠ OPCIONAIS: a função antiga não as devolve
   * (e ela nem listava essas OCs).
   *   · `outra_fazenda`: a OC e o lançamento têm fazenda, e não é a mesma — pode ser escolhida, com o selo;
   *   · `fora_da_janela`: entre a janela e o limite de dias — fica sob o "mostrar", e pode ser escolhida;
   *   · `rascunho`: aparece APAGADA, com o motivo; não se escolhe.
   */
  outra_fazenda?: boolean;
  fora_da_janela?: boolean;
  rascunho?: boolean;
  /** Todas as parcelas pagas, mas o compromisso ≠ a soma das parcelas (ao centavo): NÃO é "todos liquidados". O valor é do banco. */
  pagas_com_diferenca?: boolean;
  /** compromisso − soma das parcelas vivas, dos compromissos pagos (positivo = pago a menos; negativo = pago a mais). */
  diferenca_parcelas?: number;
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
  /** OC-VINCULAR-CANDIDATAS-01 — os números da regra vêm do banco; a tela não escreve "60" nem "180". */
  janela_dias?: number;
  limite_dias?: number;
  /** OCs do mesmo tipo além do limite: só a contagem. */
  fora_do_limite?: number;
  /** OCs vivas de OUTRO tipo perto destas datas (recebimento em subcentro de venda x OC de abate): só a contagem. */
  outro_tipo?: { qtd: number; tipos: string[] } | null;
}

export interface AvisoVinculo {
  codigo: 'movimento_duplicado' | 'competencia_mudou_de_mes' | 'favorecido_diferente'
    | 'classificacao_diverge_do_compromisso' | 'principal_diverge_da_base' | 'safra_diverge_da_competencia'
    | 'principal_excede_acordado'
    | 'recebido_acima_do_saldo' | 'compromisso_reduzido' | 'mes_fechado' | 'fazenda_diferente';
  de?: string; para?: string; base?: number | null; soma_principal?: number;
  /** `recebido_acima_do_saldo` / `compromisso_reduzido` (OC-VINCULAR-RECEBIMENTO-PARCIAL-01): nada some em silêncio. */
  lado?: 'receber' | 'pagar'; recebido?: number; saldo?: number | null; diferenca?: number;
  compromisso_de?: number | null; compromisso_para?: number;
  /** `mes_fechado`: 'YYYY-MM'. Avisa e fica na trilha; não bloqueia. */
  mes?: string;
  /** `fazenda_diferente` (OC-VINCULAR-CANDIDATAS-01): os nomes vêm do banco. */
  operacao_fazenda?: string | null; lancamento_fazenda?: string | null;
  /** `principal_excede_acordado` (OC-VINCULAR-PARCELA-SEGUINTE-01). */
  acordado?: number; vinculado?: number; excedente?: number;
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
  parcela: { id: string; acao: 'criada' | 'preenchida' | 'substituida' | 'parcial' };
  titulo_substituido: { titulo_id: string | null; valor: number | null; status_transacao: string | null; ja_estava_cancelado: boolean } | null;
  lancamento: { id: string; competencia_anterior: string | null; competencia_nova: string;
    hash_preservado: boolean; movimentacao_rebanho_id_solto: string | null };
  avisos: AvisoVinculo[];
  /**
   * OC-VINCULAR-PARCELA-SEGUINTE-01 — a parte como ficou (ou ficaria, na simulação) e o principal da OC depois do vínculo.
   * ⚠ OPCIONAIS: a função antiga não os devolve, e a tela não pode quebrar com ela.
   */
  parte?: { sequencia: number; quantidade: number; parcela_seguinte: boolean; descricao: string | null };
  principal?: { acordado: number | null; vinculado: number | null; recebido: number | null } | null;
  /**
   * OC-VINCULAR-RECEBIMENTO-PARCIAL-01 — o recebimento é MENOR que a parcela: o compromisso mantém o valor e o saldo segue
   * numa parcela seguinte (com o título programado reduzido, quando havia). Nulo fora desse caso.
   */
  parcial?: {
    lado: 'receber' | 'pagar'; recebido: number; de: number; saldo: number;
    parcela_saldo: { id: string; sequencia: number; quantidade: number | null; vencimento: string | null;
      titulo_id: string | null; titulo_valor_antes: number | null };
  } | null;
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
    .eq('financeiro_lancamento_id', lancamentoId)
    /* OC-DESVINCULAR-01 (D1): o indice de parte por titulo virou parcial (`cancelada = false`). Parte
       cancelada e' historia; o lancamento desvinculado pode ser vinculado de novo. */
    .eq('cancelada', false);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/* ─── apresentacao (puro) ──────────────────────────────────────────────────────────────── */

/**
 * A ACAO SO' APARECE ONDE O BANCO ACEITARIA: subcentro no mapa, lancamento salvo, nao cancelado
 * e sem parte VIVA de OC (o indice unico de parte por titulo e' parcial desde o OC-DESVINCULAR-01).
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
  /* BOITEL-ABATE-PRODUTOR-01 — o boleto do boitel na modalidade B (subcentro 1155). */
  acerto_boitel: 'Acerto de boitel (despesas)',
};
export const rotuloComponente = (c: string) => ROTULO_COMPONENTE[c] ?? c;

/**
 * O compromisso de VALOR EXATO que ainda aceita o lancamento — VINCULAR-FIX-01. "Valor exato vence": ele
 * pode ser de outro componente, desde que do mesmo subcentro (Graxaria c80ebe9e: 5.056 a receber gravado
 * como `adiantamento_devolvido` no plano "Abates de Femeas").
 */
export function compromissoExato(c: OperacaoCandidata): CompromissoCandidato | null {
  return c.compromissos.find(k => k.valor_exato && k.acao_prevista !== 'recusar') ?? null;
}

/** O compromisso que a linha mostra: o exato; senao o do item escolhido; na falta, o primeiro da lista. */
export function compromissoDoItem(c: OperacaoCandidata, componente: string | null): CompromissoCandidato | null {
  return compromissoExato(c) ?? c.compromissos.find(k => k.componente === componente) ?? c.compromissos[0] ?? null;
}

export type TomSelo = 'verde' | 'ambar' | 'vermelho' | 'neutro';
export interface SituacaoCandidata { rotulo: string; tom: TomSelo; selecionavel: boolean; title?: string }

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * O SELO DE CADA CANDIDATA — VINCULAR-FIX-01c. NENHUMA CANDIDATA E' VERMELHA: o vermelho so' existiria por
 * direcao incompativel ou OC cancelada/rascunho, e as duas o banco ja' tira da lista.
 * ⚠ O VINCULAR NAO JULGA REPETICAO (Gabriel, 26/09/2026 05:38): ele nao mexe em valor, pagamento nem
 *   conciliacao — so' da' uma OC ao lancamento orfao. Vincular 20 guias iguais na mesma OC e' normal. Por isso
 *   "sem compromisso livre" e' so' "criar item", NEUTRO: sem cor de alerta, sem aviso, sem confirmacao.
 * A ordem importa:
 *  1. compromisso livre de valor exato -> verde "= valor" (vai escolhido);
 *  2. nenhum compromisso livre do item (nenhum, ou todos pagos) -> neutro "criar item";
 *  3. o livre do item tem titulo vivo e aberto -> ambar, com o status dele (esse titulo sera' substituido);
 *  4. mais de um livre do item -> neutro "escolher compromisso" (a lista oferece "criar item");
 *  5. um livre, sem titulo -> verde "sem título do item".
 */
export const MOTIVO_RASCUNHO = 'em rascunho — conclua a negociação';

/* OC-VINCULAR-CANDIDATAS-01 — TODAS AS PARCELAS PAGAS E O COMPROMISSO ≠ A SOMA DELAS (nunca "liquidado": R$ 0,01 já conta). O valor
   vem do banco, inteiro; o sinal é dito em palavras. A resolução é na OC (OC-AJUSTE-DIFERENCA-01), não por um vínculo novo. */
const ladoDaDiferenca = (d: number) => (d > 0 ? 'pago a menos' : 'pago a mais');
export function seloDaDiferenca(c: Pick<OperacaoCandidata, 'pagas_com_diferenca' | 'diferenca_parcelas'>): string | null {
  if (!c.pagas_com_diferenca) return null;
  const d = c.diferenca_parcelas ?? 0;
  /* curto de propósito: o selo longo (269px) espremia a coluna Operação de TODAS as linhas; a frase inteira vai no painel e no `title` */
  return `parcelas pagas · ${d > 0 ? 'falta' : 'sobra'} ${brl(Math.abs(d))}`;
}
export function motivoDaDiferenca(c: Pick<OperacaoCandidata, 'pagas_com_diferenca' | 'diferenca_parcelas'>): string | null {
  if (!c.pagas_com_diferenca) return null;
  const d = c.diferenca_parcelas ?? 0;
  return `Todas as parcelas deste compromisso estão pagas. Sobra uma diferença de ${brl(Math.abs(d))} entre o combinado e o pago (${ladoDaDiferenca(d)}); ela se resolve na OC.`;
}

export function situacaoDaCandidata(c: OperacaoCandidata, componente: string | null, _valorLancamento: number): SituacaoCandidata {
  /* OC-VINCULAR-CANDIDATAS-01 — RASCUNHO aparece e NÃO se escolhe: o motivo vai no selo e no `title` (o banco recusaria). */
  if (c.rascunho) return { rotulo: MOTIVO_RASCUNHO, tom: 'neutro', selecionavel: false, title: 'Operação em rascunho não recebe lançamento. Conclua a negociação na operação e volte aqui.' };
  const selo = seloDaDiferenca(c);
  if (selo) return { rotulo: selo, tom: 'ambar', selecionavel: false, title: motivoDaDiferenca(c) ?? undefined };
  const livres = c.compromissos.filter(k => k.componente === componente && k.acao_prevista !== 'recusar');
  const alvo = livres.length === 1 ? livres[0] : null;
  if (compromissoExato(c)) return { rotulo: '= valor', tom: 'verde', selecionavel: true };
  if (livres.length === 0) return { rotulo: 'criar item', tom: 'neutro', selecionavel: true };
  if (alvo && alvo.acao_prevista === 'substituir') {
    const st = alvo.parcelas.find(p => p.titulo_id && !p.titulo_cancelado)?.titulo_status ?? 'aberto';
    return { rotulo: `título ${st}`, tom: 'ambar', selecionavel: true };
  }
  if (livres.length > 1) return { rotulo: 'escolher compromisso', tom: 'neutro', selecionavel: true };
  return { rotulo: 'sem título do item', tom: 'verde', selecionavel: true };
}

/**
 * A LINHA DA CANDIDATA — VINCULAR-FIX-01, item 2: "{data} · {Tipo} · {Fazenda} · {N} cab · {contraparte}".
 * A data e' a de REFERENCIA (abate > embarque > operacao; no boitel, o envio), a mesma da distancia.
 * ⚠ SO' NA LINHA DA CANDIDATA: o Desvincular, o botao e o toast continuam com `rotuloOC`.
 * Ausente vira "—", nunca some: a posicao de cada parte na linha e' o que o olho aprende.
 */
export function linhaDaCandidata(c: Pick<OperacaoCandidata, 'data_referencia' | 'data_operacao' | 'tipo_operacao'
  | 'eh_boitel' | 'fazenda_nome' | 'qtd' | 'contraparte_nome'>): string {
  const tipo = c.eh_boitel ? 'Boitel' : (c.tipo_operacao ? c.tipo_operacao.charAt(0).toUpperCase() + c.tipo_operacao.slice(1) : '—');
  const cab = c.qtd == null ? '—' : `${Number(c.qtd).toLocaleString('pt-BR')} cab`;
  return [dataBr(c.data_referencia ?? c.data_operacao), tipo, c.fazenda_nome ?? '—', cab, c.contraparte_nome ?? '—'].join(' · ');
}

/** Pre-selecao: SO' a primeira, e so' se for valor exato e selecionavel. Senao, nenhuma. */
export function candidataInicial(cands: OperacaoCandidata[], componente: string | null, valorLancamento: number): string | null {
  const c = cands[0];
  /* OC-VINCULAR-CANDIDATAS-01: o que antes nem aparecia (outra fazenda, fora da janela, rascunho) NUNCA vai escolhido sozinho. */
  if (!c || !c.valor_exato || c.outra_fazenda || c.fora_da_janela || c.rascunho) return null;
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
    case 'principal_excede_acordado':
      return { codigo: a.codigo, tom: 'ambar', texto:
        `Com este lançamento a OC passa a ter ${brl(a.vinculado)} ligados ao principal, ${brl(a.excedente)} acima dos ${brl(a.acordado)} acordados. `
        + 'O vínculo não é bloqueado nem ajustado: confira antes de confirmar.' };
    case 'recebido_acima_do_saldo': {
      const verbo = a.lado === 'pagar' ? 'Pago' : 'Recebido';
      return { codigo: a.codigo, tom: 'vermelho', texto:
        `${verbo} ${brl(a.diferenca)} a mais que o saldo (${brl(a.saldo)}). O compromisso passa de ${brl(a.compromisso_de)} para ${brl(a.compromisso_para)}. `
        + 'A diferença não é ajustada sozinha: decida na OC o que ela é.' };
    }
    case 'compromisso_reduzido':
      return { codigo: a.codigo, tom: 'vermelho', texto:
        `O compromisso passa de ${brl(a.compromisso_de)} para ${brl(a.compromisso_para)} (diferença ${brl(a.diferenca)}). Confira antes de confirmar.` };
    case 'mes_fechado':
      return { codigo: a.codigo, tom: 'ambar', texto:
        `O mês ${a.mes ? `${a.mes.slice(5, 7)}/${a.mes.slice(0, 4)}` : ''} do rebanho está fechado. O vínculo não é bloqueado: fica registrado na auditoria da OC.` };
    case 'fazenda_diferente':
      return { codigo: a.codigo, tom: 'ambar', texto:
        `A OC é da ${a.operacao_fazenda ?? 'outra fazenda'}. O lançamento continua em ${a.lancamento_fazenda ?? 'sua fazenda'}; o vínculo não muda a fazenda.` };
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
  const pc = s.parcial ?? null;
  return [
    { rotulo: 'Compromisso', valor: comp },
    pc
      ? (pc.parcela_saldo.titulo_id
          ? { rotulo: 'Título da OC', valor: `fica · ${brl(pc.parcela_saldo.titulo_valor_antes)} → ${brl(pc.saldo)} · vence ${dataBr(pc.parcela_saldo.vencimento)}`, tom: 'ambar' as const }
          : { rotulo: 'Saldo', valor: `${brl(pc.saldo)} · parcela ${pc.parcela_saldo.sequencia}, sem título`, tom: 'ambar' as const })
    : t
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

/**
 * A frase do "O que vai acontecer" — OC-VINCULAR-PARCELA-SEGUINTE-01. Vem INTEIRA do que a simulação devolveu (`parte` e
 * `principal`); a tela não conta parcela nem soma recebido. Sem os campos (função antiga), nulo.
 *   · "Entra como parcela 2 de 2 da Venda 055 B." — só quando o item novo entrou como a parcela seguinte de um grupo;
 *   · "A OC passa a ter R$ X recebidos de R$ Y acordados." — sempre que o vínculo é do principal.
 */
export function fraseDaParcela(s: VinculoFeito): string | null {
  const partes: string[] = [];
  const p = s.parte;
  if (p?.parcela_seguinte) {
    partes.push(`Entra como parcela ${p.sequencia} de ${p.quantidade}${p.descricao ? ` da ${p.descricao}` : ''}.`);
  }
  const pr = s.principal;
  if (pr && pr.acordado != null && pr.vinculado != null) {
    const tudoRecebido = pr.recebido != null && Math.round(pr.recebido * 100) === Math.round(pr.vinculado * 100);
    partes.push(tudoRecebido
      ? `A OC passa a ter ${brl(pr.vinculado)} recebidos de ${brl(pr.acordado)} acordados.`
      : `A OC passa a ter ${brl(pr.vinculado)} ligados ao principal (${brl(pr.recebido)} já recebidos) de ${brl(pr.acordado)} acordados.`);
  }
  return partes.length > 0 ? partes.join(' ') : null;
}

/**
 * A frase do recebimento PARCIAL — OC-VINCULAR-RECEBIMENTO-PARCIAL-01. Inteira do que a simulação devolveu (`parcial`): a tela
 * não subtrai. "Recebido R$ 200.000,00 de R$ 294.595,00. Fica saldo a receber de R$ 94.595,00 nesta OC." (compra: Pago / a pagar)
 */
export function fraseDoParcial(s: VinculoFeito): string | null {
  const p = s.parcial;
  if (!p) return null;
  const pagar = p.lado === 'pagar';
  return `${pagar ? 'Pago' : 'Recebido'} ${brl(p.recebido)} de ${brl(p.de)}. Fica saldo a ${pagar ? 'pagar' : 'receber'} de ${brl(p.saldo)} nesta OC.`;
}

/** "OC 123" pelo documento; sem documento, so' "OC" + data — nunca UUID na tela. */
export function rotuloOC(c: Pick<OperacaoCandidata, 'numero_documento' | 'data_operacao'>): string {
  return c.numero_documento ? `OC ${c.numero_documento}` : `OC de ${dataBr(c.data_operacao)}`;
}

export const FRASE_COLISAO_DE_UNICIDADE = 'O vínculo colide com um registro que já existe na operação. Nada foi gravado.';

/* ─── TODA RECUSA CHEGA EM FRASE (OC-VINCULAR-CANDIDATAS-01) ──────────────────────────────────────────────────────────────
   Um lugar só: o motivo de inelegibilidade da lista (`FRASE_DO_INELEGIVEL`) e o texto que o banco levanta nas três funções
   (`FRASES_DO_BANCO`: vincular, recebimento de conta corrente, desvincular). Os três diálogos (Vincular, Desvincular,
   Reclassificar) passam por `mensagemDeErro`. Texto que não casa com nada passa como veio — e o teste lista os que casam. */
export const FRASE_DO_INELEGIVEL: Record<string, string> = {
  lancamento_nao_encontrado: 'Este lançamento não foi encontrado. Recarregue a lista.',
  cancelado: 'Este lançamento está cancelado; lançamento cancelado não se liga a operação.',
  meta: 'Este lançamento é de meta; só lançamento realizado ou programado se liga a operação.',
  ja_vinculado: 'Este lançamento já está ligado a uma operação. Desvincule antes de ligar a outra.',
  financiamento_ou_transferencia: 'Parcela de financiamento e transferência entre contas não se ligam a operação comercial.',
  subcentro_sem_regra: 'Este subcentro não se liga a operação comercial.',
  direcao_diverge_do_subcentro: 'A direção do lançamento (entrada ou saída) não combina com o subcentro dele. Corrija a classificação antes de vincular.',
  sem_valor: 'Lançamento sem valor não se liga a operação.',
};
export const fraseDoInelegivel = (motivo: string | null | undefined) =>
  FRASE_DO_INELEGIVEL[motivo ?? ''] ?? 'Este lançamento não pode ser vinculado a uma operação.';

export const FRASES_DO_BANCO: ReadonlyArray<readonly [RegExp, string]> = [
  [/Conflito de versao/i, 'A operação mudou enquanto você olhava. Reabra o vínculo para ver o estado novo.'],
  /* OC-VINCULAR-PARCELA-SEGUINTE-01 — violação de unicidade NUNCA chega crua (o erro do Postgres fala inglês e cita o índice). */
  [/duplicate key value violates unique constraint/i, FRASE_COLISAO_DE_UNICIDADE],
  [/exige motivo/i, 'Informe o motivo.'],
  [/Operacao .* nao encontrada/i, 'A operação não foi encontrada. Recarregue a lista.'],
  [/Sem permissao nesta operacao/i, 'Você não tem acesso a esta operação.'],
  [/Operacao em rascunho/i, 'A operação está em rascunho. Conclua a negociação antes.'],
  [/Operacao cancelada/i, 'A operação está cancelada.'],
  [/Lancamento .* nao encontrado neste cliente/i, 'O lançamento não foi encontrado neste cliente.'],
  [/Lancamento cancelado: use o Desfazer/i, 'O lançamento está cancelado: o caminho é o “Desfazer compromisso”, na operação.'],
  [/Lancamento cancelado nao pode ser vinculado/i, FRASE_DO_INELEGIVEL.cancelado],
  [/Lancamento de meta/i, FRASE_DO_INELEGIVEL.meta],
  [/financiamento ou transferencia/i, FRASE_DO_INELEGIVEL.financiamento_ou_transferencia],
  [/Lancamento sem valor positivo/i, FRASE_DO_INELEGIVEL.sem_valor],
  [/Lancamento ja esta ligado a uma operacao/i, FRASE_DO_INELEGIVEL.ja_vinculado],
  [/Subcentro ".*" nao se vincula/i, FRASE_DO_INELEGIVEL.subcentro_sem_regra],
  [/nao cabe numa operacao de/i, 'O subcentro deste lançamento não é do tipo desta operação (venda, compra ou abate).'],
  [/Direcao do lancamento .* nao confere/i, FRASE_DO_INELEGIVEL.direcao_diverge_do_subcentro],
  [/Direcao do compromisso .* nao confere/i, 'Este compromisso é de outra direção (entrada ou saída) que a do lançamento.'],
  [/Direcao da conta .* nao confere/i, 'A conta escolhida é de outra direção (entrada ou saída) que a do lançamento.'],
  [/Compromisso .* nao encontrado nesta operacao/i, 'O compromisso escolhido não é mais desta operação. Reabra o vínculo.'],
  [/Compromisso cancelado nao recebe vinculo/i, 'O compromisso escolhido está cancelado.'],
  [/Compromisso .* nao cabe no subcentro/i, 'O compromisso escolhido não é do subcentro deste lançamento.'],
  [/Componente informado .* diverge/i, 'O item escolhido não é o do compromisso. Reabra o vínculo.'],
  [/Informe o componente/i, 'Escolha o item da operação.'],
  [/Componente .* nao cabe no subcentro/i, 'O item escolhido não combina com o subcentro deste lançamento.'],
  [/inexistente ou inativo no catalogo/i, 'O item escolhido não existe mais no catálogo de itens.'],
  [/Parcela .* nao pertence a programacao ativa/i, 'A parcela escolhida não é mais deste compromisso. Reabra o vínculo.'],
  [/mudaria o hash de importacao/i, 'O vínculo mudaria a identidade de importação deste lançamento, e por isso não foi feito. Nada foi gravado.'],
  [/so em venda ou compra no modelo conta corrente/i, 'Esta operação não é de conta corrente.'],
  [/Pagamento tem de ser uma saida/i, 'Numa compra, o pagamento tem de ser um lançamento de saída.'],
  [/Recebimento tem de ser uma entrada/i, 'Numa venda, o recebimento tem de ser um lançamento de entrada.'],
  [/sem movimentacao de caixa nao e recebimento/i, 'Lançamento sem movimentação de caixa não é recebimento nem pagamento.'],
  [/nao muda o lancamento; valor, datas/i, 'O vínculo mudaria valor, data ou conta deste lançamento, e por isso não foi feito. Nada foi gravado.'],
  [/Competencia pela saida mudaria/i, 'O vínculo mudaria valor, pagamento ou conta deste lançamento, e por isso não foi feito. Nada foi gravado.'],
  [/fora do modelo vivo, nao se desvincula por aqui/i, 'Recebimento ou pagamento de operação em conta corrente ainda não se desvincula por aqui.'],
  [/liquidacao MANUAL ativa/i, 'Este título tem liquidação manual na operação. Estorne a liquidação antes de desvincular.'],
  [/Conta do plano .* inexistente ou inativa/i, 'A conta escolhida não existe ou está inativa.'],
  [/Conta do plano de outro cliente/i, 'A conta escolhida é de outro cliente.'],
];

export function mensagemDeErro(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String(e.message);
    for (const [padrao, frase] of FRASES_DO_BANCO) if (padrao.test(m)) return frase;
    return m;
  }
  return String(e);
}

/* ─── a lista de candidatas, como a tela a desenha (OC-VINCULAR-CANDIDATAS-01) ──────────────────────────────────────────
   O banco decide o que aparece, em que ordem e com que marca. Aqui só se REPARTE o retorno em dois blocos pela marca
   `fora_da_janela` (a ordem de cada bloco é a que veio) e se escrevem as frases — com os números do retorno. */
export function blocosDeCandidatas(cands: OperacaoCandidata[]): { naJanela: OperacaoCandidata[]; foraDaJanela: OperacaoCandidata[] } {
  return { naJanela: cands.filter(c => !c.fora_da_janela), foraDaJanela: cands.filter(c => !!c.fora_da_janela) };
}
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
/** "3 na janela de 60 dias" — o número da janela é o do banco; sem ele (função antiga), não se escreve número nenhum. */
export function fraseDaJanela(r: RespostaCandidatas, n: number): string {
  return r.janela_dias == null ? `${n} ${plural(n, 'candidata', 'candidatas')}` : `${n} na janela de ${r.janela_dias} dias`;
}
export function rotuloMostrarFora(r: RespostaCandidatas, n: number, aberto: boolean): string {
  const janela = r.janela_dias == null ? 'da janela' : `da janela de ${r.janela_dias} dias`;
  return `${aberto ? 'Ocultar' : 'Mostrar'} ${n} fora ${janela}`;
}
export function fraseForaDoLimite(r: RespostaCandidatas): string | null {
  const n = r.fora_do_limite ?? 0;
  if (n <= 0 || r.limite_dias == null) return null;
  return `${n} ${plural(n, 'operação', 'operações')} do mesmo tipo a mais de ${r.limite_dias} dias ${plural(n, 'fica', 'ficam')} fora da lista.`;
}
const NOME_DO_TIPO: Record<string, string> = { venda: 'venda', compra: 'compra', abate: 'abate' };
export function fraseOutroTipo(r: RespostaCandidatas): string | null {
  const o = r.outro_tipo;
  if (!o || o.qtd <= 0) return null;
  const outros = o.tipos.map(t => NOME_DO_TIPO[t] ?? t).join(', ');
  const deste = (r.regra?.tipos_oc ?? []).map(t => NOME_DO_TIPO[t] ?? t).join(' ou ');
  return `${o.qtd} ${plural(o.qtd, 'operação', 'operações')} de outro tipo (${outros}) perto destas datas — o subcentro deste lançamento é de ${deste}.`;
}
/** O aviso do painel para a OC fora da janela (a distância e a janela são do retorno). */
export function avisoForaDaJanela(c: OperacaoCandidata, r: RespostaCandidatas): string | null {
  if (!c.fora_da_janela) return null;
  return `Esta operação está a ${c.distancia_dias} dias do lançamento${r.janela_dias == null ? '' : `, fora da janela de ${r.janela_dias} dias`}. Confira se é mesmo ela.`;
}
/** O selo da linha de outra fazenda. */
export const seloOutraFazenda = (c: OperacaoCandidata) => (c.outra_fazenda ? `outra fazenda: ${c.fazenda_nome ?? '—'}` : null);
