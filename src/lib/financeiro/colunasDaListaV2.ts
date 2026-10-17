/**
 * FIN-V2-COLUNAS-02 (Gabriel 16/10/2026, mock-lancamentos-colunas-v4) — o que as colunas novas da lista de Lançamentos Financeiros
 * MOSTRAM, numa lib pura. A tela só desenha.
 *
 * · CLASSIFICAÇÃO: uma coluna, no nível escolhido (Macro | Centro | Subcentro; padrão Centro), com o caminho inteiro no `title`.
 * · SEM CAIXA em três posições: Ocultar (só caixa — o de sempre) | Mostrar (caixa + a seção sem caixa — o "marcado" de antes) |
 *   Só c/ DRE (SÓ os lançamentos sem movimento de caixa que compõem o DRE: `sem_movimentacao_caixa = true` E `compoe_dre = true`).
 * · VÍNCULOS: os que JÁ existem no dado — OC (parte viva), financiamento (`financiamento_id` que não é parcela de compra
 *   parcelada), recorrência (`recorrencia_id`), parcelamento (parcela viva de contrato de natureza parcelamento). Nada deduzido.
 * · SAFRA em duas linhas: "25/26 Pec" (período do código + a atividade DA SAFRA) e, embaixo, a fase (pecuária) ou a cultura
 *   (agricultura) do LANÇAMENTO — SÓ quando existir. Sem fase / cultura, só a linha 1: sem fase NÃO é rateio (decisão do Chat,
 *   16/10; "rateio" volta quando houver fonte própria — FIN-V2-SAFRA-RATEIO-01). Sem safra, "—". Nunca pelo texto da descrição.
 * · PREFERÊNCIAS no navegador (localStorage com try/catch; sem dado ou erro = o padrão).
 */
import { FASES, CULTURAS_LANCAMENTO } from '@/lib/agri/rateioLancamento';

export type NivelClassificacao = 'macro' | 'centro' | 'subcentro';
export const NIVEIS_CLASSIFICACAO: readonly NivelClassificacao[] = ['macro', 'centro', 'subcentro'];
export const ROTULO_NIVEL: Record<NivelClassificacao, string> = { macro: 'Macro', centro: 'Centro', subcentro: 'Subcentro' };

export interface LinhaClassificada {
  macro_custo?: string | null;
  centro_custo?: string | null;
  subcentro?: string | null;
}

/** O texto da célula no nível escolhido ("-" sem dado, como a lista sempre mostrou). */
export function textoDaClassificacao(l: LinhaClassificada, nivel: NivelClassificacao): string {
  const v = nivel === 'macro' ? l.macro_custo : nivel === 'centro' ? l.centro_custo : l.subcentro;
  return (v ?? '').trim() || '-';
}

/** "Macro › Centro › Subcentro" — só os níveis preenchidos. */
export function caminhoDaClassificacao(l: LinhaClassificada): string {
  return [l.macro_custo, l.centro_custo, l.subcentro].map(v => (v ?? '').trim()).filter(Boolean).join(' › ');
}

export type ModoSemCaixa = 'ocultar' | 'mostrar' | 'so_dre';
export const MODOS_SEM_CAIXA: readonly ModoSemCaixa[] = ['ocultar', 'mostrar', 'so_dre'];

export interface LinhaDeCaixa {
  sem_movimentacao_caixa?: boolean | null;
  compoe_dre?: boolean | null;
}

/** As linhas da GRADE no modo. Ocultar e Mostrar: só caixa (o nulo conta como caixa). Só c/ DRE: sem caixa que compõe o DRE. */
export function linhasDaGradePorModo<T extends LinhaDeCaixa>(linhas: readonly T[], modo: ModoSemCaixa): T[] {
  if (modo === 'so_dre') return linhas.filter(l => l.sem_movimentacao_caixa === true && l.compoe_dre === true);
  return linhas.filter(l => l.sem_movimentacao_caixa !== true);
}

/** A seção "sem caixa" embaixo da grade só existe no Mostrar (no Só c/ DRE as linhas já estão na grade). */
export const secaoSemCaixaVisivel = (modo: ModoSemCaixa): boolean => modo === 'mostrar';

export type TipoVinculo = 'F' | 'R' | 'P' | 'O';
export interface Vinculo { tipo: TipoVinculo; titulo: string }
export const NOME_VINCULO: Record<TipoVinculo, string> = {
  F: 'Financiamento', R: 'Recorrência', P: 'Parcelamento', O: 'Operação comercial',
};

/** Os vínculos da linha, na ordem F · R · P · O. */
export function vinculosDaLinha(e: {
  financiamentoId?: string | null;
  recorrenciaId?: string | null;
  parcelaDeParcelamento?: string | null;   // "i/N" do contrato, quando é parcela viva de parcelamento
  oc?: string | null;                      // rótulo da OC, quando há parte viva
  contrato?: string | null;                // "<nº> · <descrição>" do contrato (FIN-LANC-DESCRICAO-CONTRATO-01)
}): Vinculo[] {
  const out: Vinculo[] = [];
  if (e.financiamentoId && !e.parcelaDeParcelamento) out.push({ tipo: 'F', titulo: e.contrato || NOME_VINCULO.F });
  if (e.recorrenciaId) out.push({ tipo: 'R', titulo: NOME_VINCULO.R });
  if (e.parcelaDeParcelamento) out.push({ tipo: 'P', titulo: `${NOME_VINCULO.P} · parcela ${e.parcelaDeParcelamento}` });
  if (e.oc) out.push({ tipo: 'O', titulo: e.oc });
  return out;
}

/**
 * FIN-LANC-DESCRICAO-CONTRATO-01 — o nome do contrato no selo "F": "<nº> · <descrição>", o nº só com dígito. ESPELHO DECLARADO de
 * `_fn_financiamento_descricao_lancamento` (o banco): quem mudar a regra do nº muda as duas.
 */
export function tituloDoContrato(numero: string | null | undefined, descricao: string | null | undefined): string {
  const n = numero && /\d/.test(numero) ? numero.trim() : '';
  const d = (descricao ?? '').trim();
  return [n, d].filter(Boolean).join(' · ') || NOME_VINCULO.F;
}

export interface SafraNaLista { linha1: string; linha2: string | null; titulo: string }

const SIGLA_ATIVIDADE: Record<string, string> = { pecuaria: 'Pec', agricultura: 'Agr' };

export function safraNaLista(e: {
  codigo?: string | null;          // o código da safra (ex.: "25/26-Pec", "25/26-MAND"); nulo = sem safra
  escopo?: string | null;          // a atividade DA SAFRA (financeiro_safras.escopo_negocio)
  fase?: string | null;            // do lançamento
  cultura?: string | null;         // do lançamento
}): SafraNaLista {
  const codigo = (e.codigo ?? '').trim();
  if (!codigo) return { linha1: '—', linha2: null, titulo: 'Sem safra' };
  const periodo = codigo.includes('/') ? codigo.split('-')[0] : codigo;
  const sigla = e.escopo ? SIGLA_ATIVIDADE[e.escopo] : undefined;
  const linha1 = sigla && periodo !== codigo ? `${periodo} ${sigla}` : codigo;
  let linha2: string | null = null;
  if (e.escopo === 'pecuaria' && e.fase) linha2 = FASES.find(f => f.valor === e.fase)?.label ?? null;
  else if (e.escopo === 'agricultura' && e.cultura) linha2 = CULTURAS_LANCAMENTO.find(c => c.valor === e.cultura)?.label ?? null;
  const titulo = [codigo, linha2].filter(Boolean).join(' · ');
  return { linha1, linha2, titulo };
}

/* ── preferências no navegador ── */
export const CHAVE_PREF = {
  nivel: 'financeiro_v2.classificacao_nivel',
  semCaixa: 'financeiro_v2.sem_caixa',
  contas: 'financeiro_v2.ampliada_contas',
} as const;

function chaveDoUsuario(chave: string, usuario?: string | null): string {
  return usuario ? `${chave}.${usuario}` : chave;
}

/** Lê a preferência; valor fora da lista, ausente ou storage indisponível = o padrão. */
export function lerPreferencia<T extends string>(chave: string, usuario: string | null | undefined, validos: readonly T[], padrao: T): T {
  try {
    const v = window.localStorage.getItem(chaveDoUsuario(chave, usuario));
    return validos.find(x => x === v) ?? padrao;
  } catch {
    return padrao;
  }
}

export function gravarPreferencia(chave: string, usuario: string | null | undefined, valor: string): void {
  try {
    window.localStorage.setItem(chaveDoUsuario(chave, usuario), valor);
  } catch {
    /* storage indisponível: a escolha vale só nesta tela */
  }
}

/** As duas posições de uma chave liga/desliga guardada no navegador. */
export const SIM_NAO: readonly ('sim' | 'nao')[] = ['sim', 'nao'];
