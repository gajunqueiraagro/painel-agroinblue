/**
 * O PAYLOAD DE NASCIMENTO DE UM PARCELAMENTO — uma montagem, dois botões. PAR-02.
 *
 * ⚠ EXISTE PORQUE O SEGUNDO CHAMADOR CHEGOU. A montagem das 19 chaves nasceu inline no
 * `useFinanciamentoCadastro` (PAR-01c), quando só a tela de Parcelamentos chamava
 * `fn_parcelamento_cadastrar`. Agora o "parcelada" do modal do financeiro chama a MESMA RPC, e
 * duas montagens do mesmo payload divergiriam na primeira chave nova — exatamente como as três
 * listas de forma de pagamento divergiram em `financeiro-v2`.
 *
 * ⚠ UM WRITER, DOIS BOTÕES — e é isso que faz o modal não ser uma "segunda forma de escrever".
 * O writer é a RPC; este arquivo é a única tradução de tela para payload. Quem acrescentar uma
 * chave mexe aqui e os dois caminhos a ganham juntos.
 *
 * ⚠ FUNÇÃO PURA, SEM `supabase`: ela monta e devolve. Quem chama é que decide como despachar e
 * o que fazer com o erro — a tela e o modal mostram a recusa de formas diferentes.
 */

/** Os quatro campos da classificação que a RPC aceita — o resto é derivado por trigger. */
export interface ClassificacaoDoParcelamento {
  /**
   * ⚠ VEM DE LUGARES DIFERENTES NOS DOIS CHAMADORES, e por isso é parâmetro e não é lido de
   * dentro: na tela de Parcelamentos é `form.plano_conta_parcela_id` (a coluna que o contrato
   * grava, espelhada do cluster); no modal do financeiro é o `plano_conta_id` do cluster
   * direto. Resolver isso aqui exigiria este módulo conhecer as duas telas.
   */
  plano_conta_id: string | null;
  safra_id: string | null;
  cultura: string | null;
  fase: string | null;
}

/** Os campos gerais do contrato — o que não é classificação. */
export interface DadosGeraisParcelamento {
  fazendaId: string;
  descricao: string;
  valorTotal: number;
  totalParcelas: number;
  /** A data da 1ª parcela. A RPC escalona o VENCIMENTO a partir dela. */
  dataPrimeiraParcela: string;
  /**
   * ⚠ FIXA EM TODAS AS PARCELAS, e é decisão registrada: nenhuma das duas telas tem campo de
   * competência própria, então ela é a data do contrato (tela) ou a competência do lançamento
   * aberto (modal). Quem escalona é o vencimento.
   */
  dataCompetencia: string;
  /** 1 = mensal. A RPC usa `make_interval(months => …)`, não dias. */
  intervaloMeses: number;
  favorecidoId: string | null;
  formaPagamento: string | null;
  contaBancariaId: string | null;
  /** 'pecuaria' | 'agricultura' | … — o escopo. Nulo é aceito pela coluna. */
  tipoFinanciamento: string | null;
  numeroContrato: string | null;
  observacao: string | null;
}

/** O objeto que viaja como `p_payload` da RPC. */
export interface PayloadParcelamento {
  cliente_id: string;
  fazenda_id: string;
  descricao: string;
  valor_total: number;
  total_parcelas: number;
  data_primeira_parcela: string;
  data_competencia: string;
  intervalo_meses: number;
  tipo_operacao: string;
  plano_conta_id: string | null;
  safra_id: string | null;
  cultura: string | null;
  fase: string | null;
  favorecido_id: string | null;
  forma_pagamento: string | null;
  conta_bancaria_id: string | null;
  tipo_financiamento: string | null;
  numero_contrato: string | null;
  observacao: string | null;
}

/**
 * ⚠ SEMPRE SAÍDA: um parcelamento é uma despesa dividida em N vezes, nunca uma entrada. É deste
 * prefixo que a RPC deriva o sinal do lançamento de cada parcela.
 */
export const TIPO_OPERACAO_PARCELAMENTO = '2-Saídas';

export function montarPayloadParcelamento(
  clienteId: string,
  gerais: DadosGeraisParcelamento,
  classificacao: ClassificacaoDoParcelamento,
): PayloadParcelamento {
  return {
    cliente_id: clienteId,
    fazenda_id: gerais.fazendaId,
    descricao: gerais.descricao.trim(),
    valor_total: gerais.valorTotal,
    total_parcelas: gerais.totalParcelas,
    data_primeira_parcela: gerais.dataPrimeiraParcela,
    data_competencia: gerais.dataCompetencia,
    intervalo_meses: gerais.intervaloMeses,
    tipo_operacao: TIPO_OPERACAO_PARCELAMENTO,
    plano_conta_id: classificacao.plano_conta_id,
    safra_id: classificacao.safra_id || null,
    cultura: classificacao.cultura || null,
    fase: classificacao.fase || null,
    favorecido_id: gerais.favorecidoId || null,
    forma_pagamento: gerais.formaPagamento || null,
    conta_bancaria_id: gerais.contaBancariaId || null,
    tipo_financiamento: gerais.tipoFinanciamento,
    numero_contrato: gerais.numeroContrato || null,
    observacao: gerais.observacao || null,
    /* ⚠ `valor_entrada` NÃO VIAJA, e o campo some da tela no parcelamento: a prévia divide o
       total cheio por N, e a RPC também. Mandá-lo faria os dois discordarem. */
  };
}

/**
 * A PRÉVIA — o que a RPC VAI gravar, calculado igual a ela. PAR-02.
 *
 * ⚠ ELA NÃO ESCREVE NADA, e essa é a mudança: o `generateParcelas` que ela substitui no modal
 * era o WRITER — a grade que o operador editava virava, linha a linha, N lançamentos soltos. A
 * grade agora é display, e quem grava é a RPC.
 *
 * ⚠ ESPELHA A ARITMÉTICA DA RPC, não uma parecida. Três diferenças que o `generateParcelas`
 * tinha e que faziam a tela mentir sobre o que seria gravado:
 *   1. `addDays(i * 30)` — 30 DIAS. A RPC usa `make_interval(months => …)`. Medido no proto: um
 *      plano de 8x a partir de 06/08 saiu 06/08, 05/09, 05/10, 04/11 … 04/03 — o dia derivou de
 *      6 para 2. Com mês de verdade, todo vencimento cai no dia 6.
 *   2. `Math.floor` na base. A RPC usa `round`. Em R$ 1,00 / 8 dá 0,12 contra 0,13, e a última
 *      parcela absorve a diferença — os dois fecham no total, mas com parcelas diferentes.
 *   3. A data escalonada ia para o PAGAMENTO, sob um cabeçalho escrito "Vencimento". A RPC
 *      escalona o vencimento e deixa o pagamento NULO, que é o que 'programado' significa.
 */
export interface ParcelaPrevista {
  numero: number;
  dataVencimento: string;
  valor: number;
}

export function preverParcelas(
  valorTotal: number,
  totalParcelas: number,
  dataPrimeira: string,
  intervaloMeses = 1,
): ParcelaPrevista[] {
  if (!(totalParcelas >= 1) || !(valorTotal > 0)) return [];
  const abs = Math.abs(valorTotal);
  /* `round`, como a RPC — ver a nota 2 acima. */
  const base = Math.round((abs / totalParcelas) * 100) / 100;
  const linhas: ParcelaPrevista[] = [];
  for (let i = 0; i < totalParcelas; i++) {
    linhas.push({
      numero: i + 1,
      dataVencimento: somarMeses(dataPrimeira, i * intervaloMeses),
      /* A última absorve o arredondamento — a mesma linha do `case` da RPC. */
      valor: i === totalParcelas - 1
        ? Math.round((abs - base * (totalParcelas - 1)) * 100) / 100
        : base,
    });
  }
  return linhas;
}

/**
 * Soma meses a uma data `YYYY-MM-DD`, do jeito que o Postgres soma.
 *
 * ⚠ O DIA QUE NÃO EXISTE NO MÊS DESTINO CAI PARA O ÚLTIMO DIA DELE — 31/01 + 1 mês é 28/02, não
 * 03/03. É o que `make_interval` faz; o `new Date(...).setMonth()` do JS ESTOURA para o mês
 * seguinte, e a prévia mostraria um vencimento que o banco não vai gravar.
 */
function somarMeses(iso: string, meses: number): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return '';
  const totalMes = (m - 1) + meses;
  const anoAlvo = a + Math.floor(totalMes / 12);
  const mesAlvo = ((totalMes % 12) + 12) % 12;
  /* Dia 0 do mês seguinte = último dia do mês alvo. */
  const ultimoDia = new Date(Date.UTC(anoAlvo, mesAlvo + 1, 0)).getUTCDate();
  const diaAlvo = Math.min(d, ultimoDia);
  return `${String(anoAlvo).padStart(4, '0')}-${String(mesAlvo + 1).padStart(2, '0')}-${String(diaAlvo).padStart(2, '0')}`;
}
