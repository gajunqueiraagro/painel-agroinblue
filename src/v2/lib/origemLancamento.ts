/**
 * A ORIGEM DE UM LANÇAMENTO, EM UM LUGAR SÓ — PR-CONC-B-2.
 *
 * O classificador e a legenda nasceram dentro de `FinanceiroV2Tab` no B-1, quando a lista
 * era o único leitor. O minimodal virou o segundo e o Extrato Gerencial (B-3) será o
 * terceiro: importar regra de dentro de uma PÁGINA é o começo de uma segunda régua, porque
 * quem não quer arrastar a página inteira acaba reescrevendo a regra. O corpo desceu daqui
 * sem uma linha alterada.
 */
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';
import type { ConciliadoDoLancamento } from '@/hooks/useConciliacaoDoMes';

/**
 * QUAL VÍNCULO MANDA, QUANDO HÁ MAIS DE UM — PR-CONC-B-4.
 *
 * ⚠ ESTAVA ESCRITO TRÊS VEZES: no hook dos vínculos, no minimodal e no Extrato Gerencial,
 * nenhuma exportada. As três concordavam — e era esse o perigo, porque nada além da
 * coincidência as mantinha de acordo: quem mudasse uma não tinha como saber das outras.
 * Um lançamento pode ter vários vínculos ativos (parciais em movimentos diferentes) e o
 * ícone não pode depender de qual linha o PostgREST devolveu primeiro.
 *
 * ⚠ EMPATE FICA COM O PRIMEIRO, que é o que as três já faziam com o `>` estrito. Entre
 * `manual` e `agrupamento_legado` não há hierarquia — os dois são "alguém casou à mão" e
 * dão o mesmo ✓ —, então qualquer escolha serve desde que seja UMA. São 4 lançamentos no
 * proto com força empatada, medidos em 09/09/2026.
 */
export const FORCA_APROVACAO: Readonly<Record<string, number>> = { ofx_substituiu: 3, ofx_cru: 2 };

export function forcaAprovacao(tipo: string | null | undefined): number {
  return FORCA_APROVACAO[tipo ?? ''] ?? 1;
}

/** O mais forte entre dois tipos. Para quem acumula linha a linha, sem montar lista. */
export function tipoMaisForte(a: string | null, b: string | null): string | null {
  return forcaAprovacao(b) > forcaAprovacao(a) ? b : a;
}

/**
 * O vínculo vencedor de uma lista.
 *
 * ⚠ O ACESSOR NÃO É CERIMÔNIA: quem tem a linha crua do banco chama o campo
 * `tipo_aprovacao` e quem tem o mapa da tela chama `tipoAprovacao`. Exigir um nome só
 * obrigaria um dos dois a copiar o objeto inteiro para renomear um campo.
 */
export function vinculoVencedor<T>(
  vinculos: readonly T[],
  tipoDe: (v: T) => string | null,
): T | undefined {
  let melhor: T | undefined;
  for (const v of vinculos) {
    if (melhor === undefined) { melhor = v; continue; }
    if (forcaAprovacao(tipoDe(v)) > forcaAprovacao(tipoDe(melhor))) melhor = v;
  }
  return melhor;
}

/**
 * O ÍCONE DE ORIGEM — PR-CONC-B-1. Diz de onde o lançamento veio e se o banco o confirmou.
 *
 * ⚠ É ESTADO, NÃO ORIGEM. `origem_lancamento` tem 19 valores e NÃO entra aqui: o operador
 * não pergunta "que tela criou isto", pergunta "o banco confirmou?". A ordem abaixo é a
 * regra, e o primeiro que casa vence.
 *
 * ⚠ "!" SÓ QUANDO O BANCO TINHA COMO CONFIRMAR E NÃO CONFIRMOU. Conta de caixa, cartão ou
 * mês sem OFX carregado dá M, nunca "!": alarme que dispara onde não havia como acertar
 * ensina o operador a ignorar o alarme, e aí ele perde os 11 de julho que importam.
 *
 * ⚠ PREVISTO NÃO TEM ÍCONE. Dinheiro que ainda não andou não se concilia; a coluna fica
 * vazia, e ausência é traço, não símbolo.
 *
 * ⚠ SEM COBERTURA CARREGADA, SEM PALPITE: enquanto o mapa de extrato viaja, o não-vinculado
 * fica sem ícone em vez de afirmar "manual" — dizer M ali seria responder antes de olhar.
 */
export interface IconeOrigemLancamento {
  simbolo: string;
  cor: string;
  significado: string;
}

export function iconeOrigemLancamento(
  l: Pick<LancamentoV2, 'status_transacao' | 'editado_manual' | 'conta_bancaria_id' | 'data_pagamento'>,
  /* Só `tipoAprovacao` decide o ícone. Pedir o objeto inteiro obrigaria quem tem apenas o
     tipo — o Extrato Gerencial — a inventar `dataMovimento` e `valorAplicado` nulos. */
  vinculo: Pick<ConciliadoDoLancamento, 'tipoAprovacao'> | undefined,
  coberturaExtrato: ReadonlySet<string> | undefined,
): IconeOrigemLancamento | null {
  if (vinculo) {
    if (vinculo.tipoAprovacao === 'ofx_substituiu') {
      return { simbolo: '\u21ba', cor: 'text-warning', significado: 'Substituído pelo banco' };
    }
    if (vinculo.tipoAprovacao === 'ofx_cru' && l.editado_manual !== true) {
      return { simbolo: 'B', cor: 'text-primary', significado: 'Cru do banco' };
    }
    return { simbolo: '\u2713', cor: 'text-success', significado: 'Enriquecido / conciliado' };
  }

  if ((l.status_transacao || '').toLowerCase() !== 'realizado') return null;
  if (!coberturaExtrato) return null;

  const chave = l.conta_bancaria_id && l.data_pagamento
    ? `${l.conta_bancaria_id}|${l.data_pagamento.slice(0, 7)}`
    : null;

  return chave && coberturaExtrato.has(chave)
    ? { simbolo: '!', cor: 'text-destructive', significado: 'Sem par no banco' }
    : { simbolo: 'M', cor: 'text-muted-foreground', significado: 'Manual (sem extrato para conferir)' };
}

export const LEGENDA_ICONES: readonly { simbolo: string; cor: string; curto: string }[] = [
  { simbolo: 'B', cor: 'text-primary', curto: 'cru do banco' },
  { simbolo: '\u21ba', cor: 'text-warning', curto: 'substituído' },
  { simbolo: '\u2713', cor: 'text-success', curto: 'enriquecido' },
  { simbolo: 'M', cor: 'text-muted-foreground', curto: 'manual' },
  { simbolo: '!', cor: 'text-destructive', curto: 'sem par no banco' },
];

/**
 * DE ONDE O LANÇAMENTO VEIO — os 19 valores de `origem_lancamento`, conferidos no banco em
 * 09/09/2026 (18 valores mais as 5 linhas nulas; nenhum fora desta lista).
 *
 * ⚠ NÃO É O ÍCONE, e a diferença é o PR inteiro: origem responde "quem criou", o ícone
 * responde "o banco confirmou?". `ofx` e `extrato` são origens distintas e podem terminar
 * no mesmo ✓; `manual` pode terminar em M ou em !. Mapear origem para ícone teria dado 19
 * respostas para uma pergunta que tem cinco.
 */
export const ORIGEM_LANCAMENTO_LABEL: Readonly<Record<string, string>> = {
  importacao_incremental: 'Importação de planilha',
  ofx: 'Extrato OFX',
  manual: 'Lançado à mão',
  parcela_financiamento: 'Parcela de financiamento',
  migracao: 'Migração inicial',
  movimentacao_rebanho: 'Movimentação de rebanho',
  mesa_excel: 'Mesa de revisão (planilha)',
  recorrencia: 'Recorrência',
  extrato: 'Criado pelo banco',
  contrato: 'Contrato',
  operacao_comercial: 'Operação comercial (compra/venda/abate)',
  financiamento: 'Financiamento',
  excel: 'Planilha',
  mesa_split: 'Mesa de revisão (desdobrado)',
  referencia_operacional: 'Referência operacional',
  boitel: 'Boitel',
  conciliacao: 'Conciliação',
  conciliacao_transferencia: 'Conciliação (transferência)',
};

/** O que a origem diz quando não há origem. Sentinela do CLAUDE.md: ausência é traço. */
export const ORIGEM_SEM_REGISTRO = '\u2014';

export function rotuloOrigem(origem: string | null | undefined): string {
  if (!origem) return ORIGEM_SEM_REGISTRO;
  return ORIGEM_LANCAMENTO_LABEL[origem] ?? origem;
}

/**
 * O símbolo por extenso — título do minimodal.
 *
 * ⚠ MESMO TEXTO DO `significado` do classificador, e de propósito: o `title` do hover e o
 * título do minimodal dizem a MESMA frase. Duas redações para o mesmo estado ensinariam o
 * operador a achar que são dois estados.
 */
export const TITULO_ICONE: Readonly<Record<string, string>> = {
  B: 'Cru do banco',
  '\u21ba': 'Substituído pelo banco',
  '\u2713': 'Enriquecido',
  M: 'Manual',
  '!': 'Sem par no banco',
};
