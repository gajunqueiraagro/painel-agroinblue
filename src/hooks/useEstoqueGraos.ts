/**
 * O ESTOQUE DE GRÃO EM MÃOS — PR-ESTOQUE-GRAOS-F1.
 *
 * ⚠ A RPC É FONTE ÚNICA: o saldo é `colhido − entregue` por classe, e essa conta mora em
 * `fn_estoque_graos`. Refazê-la aqui criaria um segundo saldo, e no dia em que os dois
 * divergissem ninguém saberia qual está certo — que é exatamente o problema que uma tela de
 * estoque existe para não ter.
 *
 * ⚠ A CULTURA FILTRA DOS DOIS LADOS, e são colunas DIFERENTES no banco: o colhido por
 * `agri_safra_area.cultura` — a área é que sabe o que foi plantado — e o entregue por
 * `agri_operacoes_comerciais.cultura` — a venda é que sabe o que foi negociado. Filtrar só um
 * lado daria saldo negativo numa cultura e inflado na outra.
 * ⚠ A ASSINATURA DE DOIS PARÂMETROS NÃO EXISTE MAIS: ela foi dropada no banco quando a cultura
 * entrou. Não há sobrecarga para cair por engano.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Uma classe de qualidade no estoque. */
export interface EstoqueClasse {
  /** `ate_20` | `acima_20` | `roca` — o mesmo vocabulário das entregas do barter. */
  classe: string;
  colhido: number;
  entregue: number;
  /**
   * O que sobrou em mãos.
   *
   * ⚠ MEIO SACO DE DIFERENÇA JÁ VEM ZERADO DA RPC. Medido na 23/24: a roça tem 620,63 colhidos
   * contra 620,64 entregues, porque o romaneio da entrega arredondou para cima. Sem a regra a
   * tela diria "−0,01 sc em estoque", que não é saldo negativo — é arredondamento.
   */
  saldo: number;
  /**
   * A perda física já baixada nesta classe — a soma das quebras ativas.
   *
   * ⚠ ELE ERA ZERO IMPRESSO NA TELA, não zero lido: até a F2 a coluna "Quebra" escrevia
   * `formatNum(0, 2)` fixo, porque a RPC não devolvia a chave. Agora devolve, e zero aqui é
   * VALOR — "não houve perda" —, não ausência. Por isso a tela mostra "0,00" e nunca "—".
   * ⚠ E ELE JÁ ESTÁ DENTRO DO `saldo`: `fn_estoque_graos` faz `colhido − entregue − quebra`.
   * Subtrair de novo no front contaria a perda duas vezes.
   */
  quebra: number;
  /** A média ponderada do que já se entregou daquela classe. Zero quando nunca se entregou. */
  preco_ref: number;
  /** `saldo × preco_ref`, com o saldo travado em zero para baixo. */
  valor: number;
  /**
   * O preço de MERCADO mais recente daquela classe — o que o grão vale HOJE.
   *
   * ⚠ ELE NÃO É O `preco_ref`, E A DIFERENÇA É O PONTO DA TELA: `preco_ref` é a média do que já
   * se VENDEU — um número do passado; este é a cotação lançada à mão, um número do presente. Os
   * dois lado a lado são a decisão de segurar ou vender; um só é meia informação.
   * ⚠ ZERO AQUI É "SEM COTAÇÃO", e não se pode distinguir isso pelo preço: a RPC faz
   * `coalesce(...,0)` porque o contrato do payload é numérico, e uma cotação de zero real é
   * registrável (o CHECK do banco admite `>= 0`). Quem precisa saber se HÁ cotação lê
   * `data_mercado`.
   */
  preco_mercado: number;
  /**
   * A data da cotação que está sendo usada — e a ÚNICA sentinela de ausência.
   *
   * ⚠ `null` SIGNIFICA "NUNCA FOI COTADA". É por este campo, nunca pelo preço, que a tela decide
   * entre mostrar o valor e mostrar "—".
   */
  data_mercado: string | null;
  /** `saldo × preco_mercado`, com o saldo travado em zero para baixo. */
  valor_mercado: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

export function useEstoqueGraos(
  clienteId: string | null | undefined, safraId: string | null, cultura: string | null,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['estoque-graos', clienteId ?? '', safraId ?? '', cultura ?? ''],
    /* ⚠ SEM CULTURA A CONSULTA NEM SAI: a RPC exige os três, e chamá-la com `null` devolveria
       erro em vez de "ainda não escolhi". O seletor abre preenchido, então isto só vale para o
       instante entre carregar as culturas e escolher a primeira. */
    enabled: !!clienteId && !!safraId && !!cultura,
    queryFn: async (): Promise<EstoqueClasse[]> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_estoque_graos', {
        p_cliente: clienteId,
        p_safra_id: safraId,
        p_cultura: cultura,
      });
      if (err) throw err;
      /**
       * ⚠ TUDO PASSA POR `Number`: `numeric` do Postgres chega como STRING no JSON do PostgREST
       * — "3219.65", não 3219.65. Sem a conversão, somar dois saldos concatenaria os textos e o
       * cartão do topo mostraria um número absurdo. É o mesmo cuidado de `usePainelSafra`.
       */
      return (Array.isArray(r) ? r : []).map((x: Record<string, unknown>) => ({
        classe: String(x?.classe ?? '—'),
        colhido: num(x?.colhido),
        entregue: num(x?.entregue),
        quebra: num(x?.quebra),
        saldo: num(x?.saldo),
        preco_ref: num(x?.preco_ref),
        valor: num(x?.valor),
        preco_mercado: num(x?.preco_mercado),
        /* ⚠ `null` ATRAVESSA INTACTO — é o único campo do payload que NÃO passa por `num`, e de
           propósito: transformá-lo em zero apagaria a diferença entre "cotada a zero" e "nunca
           cotada", que é justamente o que ele existe para dizer. */
        data_mercado: typeof x?.data_mercado === 'string' ? x.data_mercado : null,
        valor_mercado: num(x?.valor_mercado),
      }));
    },
  });

  return {
    linhas: data ?? [],
    carregando: isLoading,
    /* ⚠ O ERRO SOBE PARA A TELA — a mesma lição das listas do barter: sem ele, uma falha de
       leitura renderiza "nenhum grão em estoque", e uma tela de saldo que mente sobre estar
       vazia afirma que não há grão para vender. */
    erro: error as Error | null,
  };
}

/** Os três números do topo, somados do MESMO array que a tabela mostra. */
export function totaisDoEstoque(linhas: readonly EstoqueClasse[]) {
  const colhido = linhas.reduce((a, l) => a + l.colhido, 0);
  const saldo = linhas.reduce((a, l) => a + l.saldo, 0);
  const valor = linhas.reduce((a, l) => a + l.valor, 0);
  return {
    colhido,
    entregue: linhas.reduce((a, l) => a + l.entregue, 0),
    /* ⚠ SOMA O MESMO ARRAY QUE A TABELA MOSTRA, como os outros totais — nunca uma segunda
       consulta, para que o rodapé da coluna não possa discordar das linhas. */
    quebra: linhas.reduce((a, l) => a + l.quebra, 0),
    saldo,
    valor,
    /** A soma dos `valor_mercado` — o que o estoque vale ao preço de hoje. */
    valorMercado: linhas.reduce((a, l) => a + l.valor_mercado, 0),
    /**
     * A data da cotação mais recente entre as classes — o que o cartão do topo nomeia.
     *
     * ⚠ AS CLASSES PODEM TER DATAS DIFERENTES, e o cartão mostra a MAIS NOVA: cotar só a roça hoje
     * não invalida a cotação de ontem das outras duas, e o cartão responde "de quando é o preço
     * que estou vendo", cuja resposta honesta é a data mais recente em uso.
     * ⚠ COMPARAÇÃO DE STRING FUNCIONA porque o formato é ISO `YYYY-MM-DD`, de largura fixa e com
     * os campos em ordem decrescente de peso — a ordem lexicográfica É a cronológica. Converter
     * para `Date` aqui só acrescentaria fuso a uma comparação que não precisa dele.
     * ⚠ `null` QUANDO NENHUMA CLASSE FOI COTADA, nunca a data de hoje: o cartão mostra "—", e uma
     * data inventada afirmaria que existe um preço de mercado onde não existe.
     */
    dataMercado: linhas.reduce<string | null>(
      /* ⚠ SÓ CONTA A CLASSE COM PREÇO UTILIZÁVEL (`> 0`), e não bastar ter data é o que mantém o
         cartão de acordo com a tabela: uma cotação gravada a zero faz as colunas mostrarem "—", e
         um cartão dizendo "Cotação de 14/09" ao lado de três traços faria o operador procurar o
         preço que a tela estaria escondendo. */
      (a, l) => (l.data_mercado && l.preco_mercado > 0 && (!a || l.data_mercado > a)
        ? l.data_mercado : a), null),
    /**
     * ⚠ O PERCENTUAL PARADO É `saldo / colhido`, e o denominador é o COLHIDO, não o entregue:
     * a pergunta é "quanto da safra ainda está comigo", e o entregue já saiu da fazenda.
     * ⚠ SEM COLHEITA DÁ ZERO, não NaN: safra que não colheu não tem grão parado — ela não tem
     * grão nenhum.
     */
    pctParado: colhido > 0 ? (saldo / colhido) * 100 : 0,
  };
}

/** Uma cultura no resumo do estoque — o que a opção "Todas" lista. */
export interface EstoqueResumoCultura {
  cultura: string;
  saldo: number;
  /**
   * O valor do saldo A MERCADO: saldo POR CLASSE × a cotação mais recente daquela classe, somado.
   *
   * ⚠ ELE ERA O PREÇO MÉDIO DE VENDA ATÉ 15/09/2026, e a troca fechou um defeito: preço médio de
   * venda só existe depois da primeira entrega, então uma safra colhida e não vendida — a 25/26,
   * com 44.141,52 sacas — era avaliada em ZERO. A cotação não depende de ter vendido; é
   * justamente o número de quem ainda não vendeu.
   * ⚠ ZERO AQUI É "SEM COTAÇÃO", NÃO "SEM VALOR", e continua sem sentinela: o payload do resumo
   * não traz `data_mercado` (o do detalhe traz), então `valor > 0` é tudo o que a tela tem para
   * separar os dois casos. A tela mostra "—", porque "R$ 0,00" ao lado de 44 mil sacas afirmaria
   * que elas não valem nada.
   * ⚠ E CONTINUA SENDO ESTIMATIVA — de outro jeito: não é mais a média do que já se praticou, é a
   * última cotação lançada. Vale o que valia no dia em que alguém a registrou.
   */
  valor: number;
  /**
   * O colhido da cultura NAQUELA SAFRA, em sacas — o DENOMINADOR do "% parado".
   *
   * ⚠ ELE ENTROU NO PAYLOAD em 15/09/2026 só para isto: o cartão "% colhido parado" exibia "—"
   * na visão "Todas" porque o resumo dava saldo e valor e nunca o colhido. Sem denominador não
   * há percentual.
   * ⚠ E ELE NÃO VAI PARA A TABELA: a lista de "Todas" mostra saldo por unidade e valor, não
   * colhido. Uma coluna a mais responderia uma pergunta que ninguém fez ali.
   */
  colhido: number;
}

/**
 * O ESTOQUE DE TODAS AS CULTURAS DA SAFRA — a lista que a opção "Todas" mostra.
 *
 * ⚠ ELE PASSOU A BATER COM O DETALHE, e o aviso que morava aqui não vale mais. Dizia que os dois
 * divergiam por centavos de saca — medido na 23/24 amendoim, 3.219,64 no resumo contra 3.219,65
 * no detalhe, porque a roça tinha −0,01 que o detalhe zerava e o resumo não. O resumo agora
 * aplica `greatest(...,0)` POR CLASSE antes de somar, e aquela classe negativa zera nos dois.
 * MEDIDO EM 15/09/2026 SOBRE O PROTO INTEIRO, as três safras com colheita, em saldo E em valor:
 *     23/24 amendoim   3.219,65 sc   R$   273.670,25
 *     24/25 amendoim  16.579,57 sc   R$ 1.223.057,65
 *     25/26 amendoim  44.141,52 sc   R$ 3.694.571,40
 * diferença 0,0000 nas três, nas duas colunas. Clicar na linha e cair no detalhe não muda mais o
 * número.
 * ⚠ DUAS DIFERENÇAS RESTAM, e nenhuma é de valor: o detalhe arredonda por classe e a tela soma,
 * enquanto o resumo soma e arredonda no fim (centavos, zero hoje); e o SALDO ainda não é a mesma
 * conta — o detalhe zera a classe quando |colhido−entregue| < 0,5 e o resumo só impede o
 * negativo. Uma diferença POSITIVA de 0,3 saca apareceria como 0,00 lá e 0,30 aqui. Latente:
 * zero ocorrências no Proto hoje.
 */
export function useEstoqueGraosResumo(
  clienteId: string | null | undefined, safraId: string | null, ativo: boolean,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['estoque-graos-resumo', clienteId ?? '', safraId ?? ''],
    /* ⚠ SÓ CONSULTA QUANDO "TODAS" ESTÁ ABERTO: com uma cultura escolhida esta lista não aparece,
       e buscá-la assim mesmo seria uma ida ao banco por troca de cultura, sem ninguém para ler. */
    enabled: !!clienteId && !!safraId && ativo,
    queryFn: async (): Promise<EstoqueResumoCultura[]> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_estoque_graos_resumo', {
        p_cliente: clienteId,
        p_safra_id: safraId,
      });
      if (err) throw err;
      return (Array.isArray(r) ? r : []).map((x: Record<string, unknown>) => ({
        cultura: String(x?.cultura ?? '—'),
        saldo: num(x?.saldo),
        valor: num(x?.valor),
        colhido: num(x?.colhido),
      }));
    },
  });

  return { culturas: data ?? [], carregando: isLoading, erro: error as Error | null };
}

/** Uma safra no balanço plurianual — uma linha do extrato do grão. */
export interface BalancoSafraLinha {
  /** O código da safra, como o seletor a mostra ("25/26-Lav"). */
  safra: string;
  /**
   * O que entrou na safra vindo da anterior.
   *
   * ⚠ ELE É O `final` DA LINHA DE CIMA, sempre — quem encadeia é a RPC, não a tela. A primeira
   * safra abre em zero, e a tela mostra "—" ali porque não houve movimento anterior a mostrar.
   */
  inicial: number;
  /** Colhido na safra: sacas boas + roça. */
  producao: number;
  /** Entregas com `condicao_pagamento = 'dinheiro'`. */
  venda: number;
  /** Entregas com `condicao_pagamento = 'barter'`. */
  barter: number;
  /**
   * A quebra baixada naquela safra.
   *
   * ⚠ ELA ERA `0::numeric` FIXO NA RPC até a F2, e o front já lia a chave — por isso o modal do
   * balanço não mudou uma linha quando a quebra passou a existir de verdade. Ler a chave em vez
   * de imprimir zero foi a decisão que fez o custo desta fatia ser zero lá.
   */
  quebra: number;
  /** `inicial + producao − venda − barter − quebra`. Abre a safra seguinte. */
  final: number;
}

/**
 * O BALANÇO PLURIANUAL DE UMA CULTURA — o extrato do grão, safra a safra.
 *
 * ⚠ ELE NÃO É A TELA POR SAFRA, E OS NÚMEROS NÃO BATEM DE PROPÓSITO. `fn_estoque_graos` e
 * `fn_estoque_graos_resumo` respondem POR SAFRA; a RPC do balanço varre a CULTURA INTEIRA.
 * Medido em 15/09/2026, amendoim: balanço 63.940,73 sc / R$ 5.191.298,60 contra 44.141,52 sc /
 * R$ 3.694.571,40 da 25/26. São duas perguntas — "quanto tenho no armazém" e "quanto sobrou da
 * safra que estou olhando" —, e é por isso que os cartões dos dois lados dizem o escopo no
 * rótulo.
 * ⚠ O VALOR VEM SOLTO, NÃO POR LINHA, e não é esquecimento: o estoque encadeia, então avaliar
 * cada safra e somar contaria o mesmo grão duas vezes. As sacas descrevem MOVIMENTO; o valor
 * descreve INVENTÁRIO de hoje. Não somar as linhas em R$ — não há o que somar.
 * ⚠ SÓ CONSULTA COM UMA CULTURA ESCOLHIDA: a RPC é `(cliente, cultura)` e não existe balanço de
 * "todas" — o grão de culturas diferentes nem se mede na mesma unidade.
 */
export function useEstoqueGraosBalanco(
  clienteId: string | null | undefined, cultura: string | null, ativo: boolean,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['estoque-graos-balanco', clienteId ?? '', cultura ?? ''],
    enabled: !!clienteId && !!cultura && ativo,
    queryFn: async (): Promise<{ linhas: BalancoSafraLinha[]; valorMercadoTotal: number }> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_estoque_graos_balanco', {
        p_cliente: clienteId,
        p_cultura: cultura,
      });
      if (err) throw err;
      const bruto = (r ?? {}) as { linhas?: unknown; valor_mercado_total?: unknown };
      const linhas = Array.isArray(bruto.linhas) ? bruto.linhas : [];
      return {
        linhas: linhas.map((x: Record<string, unknown>) => ({
          safra: String(x?.safra ?? '—'),
          inicial: num(x?.inicial),
          producao: num(x?.producao),
          venda: num(x?.venda),
          barter: num(x?.barter),
          quebra: num(x?.quebra),
          final: num(x?.final),
        })),
        valorMercadoTotal: num(bruto.valor_mercado_total),
      };
    },
  });

  return {
    linhas: data?.linhas ?? [],
    valorMercadoTotal: data?.valorMercadoTotal ?? 0,
    carregando: isLoading,
    erro: error as Error | null,
  };
}

/** Uma movimentação do livro de estoque — hoje só `quebra`, ativa ou cancelada. */
export interface EstoqueMovimentacao {
  id: string;
  tipo: string;
  classe: string;
  quantidade: number;
  data: string;
  motivo: string;
  observacoes: string | null;
  /** `false` = cancelada. Ela CONTINUA na lista; o que sai é do saldo. */
  ativo: boolean;
  /** O nome de quem registrou, de `profiles`. String vazia quando não há perfil. */
  autor: string;
  criado_em: string;
  cancelado_em: string | null;
  cancelado_por: string;
  motivo_cancelamento: string | null;
}

/**
 * O LIVRO DE MOVIMENTAÇÕES DE UMA CULTURA NA SAFRA — o histórico da quebra.
 *
 * ⚠ ELE É O ÚNICO LUGAR ONDE A CANCELADA APARECE. As três leituras de saldo filtram `ativo`, de
 * propósito: uma baixa cancelada não deve pesar no estoque. Mas ela precisa ser VISÍVEL em algum
 * lugar, senão o estorno é invisível e uma baixa cancelada por engano não tem como ser conferida.
 * ⚠ NÃO É CACHE DO SALDO. Esta lista não alimenta número nenhum da tela — quem diz o saldo é
 * `fn_estoque_graos`. Somar as ativas aqui para conferir o saldo seria criar a segunda conta que
 * este módulo inteiro existe para não ter.
 * ⚠ CHAVE PRÓPRIA (`estoque-movimentacoes`): cancelar invalida ESTA e também `estoque-graos`,
 * porque o saldo muda; editar invalida só esta, porque data/motivo/observação não mexem no saldo.
 */
export function useEstoqueMovimentacoes(
  clienteId: string | null | undefined, safraId: string | null, cultura: string | null,
  ativo: boolean,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['estoque-movimentacoes', clienteId ?? '', safraId ?? '', cultura ?? ''],
    enabled: !!clienteId && !!safraId && !!cultura && ativo,
    queryFn: async (): Promise<EstoqueMovimentacao[]> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_estoque_movimentacoes', {
        p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
      });
      if (err) throw err;
      return (Array.isArray(r) ? r : []).map((x: Record<string, unknown>) => ({
        id: String(x?.id ?? ''),
        tipo: String(x?.tipo ?? 'quebra'),
        classe: String(x?.classe ?? '—'),
        quantidade: num(x?.quantidade),
        data: String(x?.data ?? ''),
        motivo: String(x?.motivo ?? ''),
        observacoes: (x?.observacoes as string | null) ?? null,
        ativo: x?.ativo !== false,
        autor: String(x?.autor ?? ''),
        criado_em: String(x?.criado_em ?? ''),
        cancelado_em: (x?.cancelado_em as string | null) ?? null,
        cancelado_por: String(x?.cancelado_por ?? ''),
        motivo_cancelamento: (x?.motivo_cancelamento as string | null) ?? null,
      }));
    },
  });

  return { movimentacoes: data ?? [], carregando: isLoading, erro: error as Error | null };
}

/** O contrato de armazenagem vigente de um local terceiro. `null` quando não há. */
export interface ContratoArmazenagem {
  id: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  quebra_tecnica_tipo: string;
  quebra_tecnica_pct: number | null;
  quebra_tecnica_base: string | null;
  taxa_armazenagem_valor: number | null;
  taxa_armazenagem_unidade: string | null;
  documento_ref: string | null;
  observacoes: string | null;
}

/** Um local de estoque — galpão próprio ou armazém de terceiro. */
export interface LocalEstoque {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  fazenda_id: string | null;
  fazenda_nome: string | null;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  codigo_externo: string | null;
  aliases: string[];
  observacoes: string | null;
  /**
   * ⚠ O CONTRATO VIGENTE, UM SÓ — e a escolha é da RPC, não do front: ela ordena por "ainda
   * vigente" e depois por início desc, `limit 1`. Não há constraint contra dois contratos
   * sobrepostos; o que a tela mostra é o que vale hoje.
   */
  contrato: ContratoArmazenagem | null;
}

/**
 * OS LOCAIS DE ESTOQUE DO CLIENTE — a leitura única do cadastro (EL-01).
 *
 * ⚠ A ORDEM VEM DO BANCO (`ativo desc, tipo, nome`) e a tela não reordena: reordenar aqui criaria
 * uma segunda regra de exibição que divergiria no dia em que a RPC mudasse a dela.
 */
export function useLocaisEstoque(clienteId: string | null | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['locais-estoque', clienteId ?? ''],
    enabled: !!clienteId,
    queryFn: async (): Promise<LocalEstoque[]> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_locais_estoque', {
        p_cliente: clienteId,
      });
      if (err) throw err;
      return (Array.isArray(r) ? r : []).map((x: Record<string, unknown>) => {
        const c = x?.contrato as Record<string, unknown> | null;
        return {
          id: String(x?.id ?? ''),
          nome: String(x?.nome ?? '—'),
          tipo: String(x?.tipo ?? 'terceiro'),
          ativo: x?.ativo !== false,
          fazenda_id: (x?.fazenda_id as string | null) ?? null,
          fazenda_nome: (x?.fazenda_nome as string | null) ?? null,
          fornecedor_id: (x?.fornecedor_id as string | null) ?? null,
          fornecedor_nome: (x?.fornecedor_nome as string | null) ?? null,
          codigo_externo: (x?.codigo_externo as string | null) ?? null,
          aliases: Array.isArray(x?.aliases) ? (x.aliases as unknown[]).map(a => String(a)) : [],
          observacoes: (x?.observacoes as string | null) ?? null,
          contrato: c ? {
            id: String(c.id ?? ''),
            vigencia_inicio: String(c.vigencia_inicio ?? ''),
            vigencia_fim: (c.vigencia_fim as string | null) ?? null,
            quebra_tecnica_tipo: String(c.quebra_tecnica_tipo ?? 'nenhuma'),
            quebra_tecnica_pct: c.quebra_tecnica_pct == null ? null : num(c.quebra_tecnica_pct),
            quebra_tecnica_base: (c.quebra_tecnica_base as string | null) ?? null,
            taxa_armazenagem_valor: c.taxa_armazenagem_valor == null ? null : num(c.taxa_armazenagem_valor),
            taxa_armazenagem_unidade: (c.taxa_armazenagem_unidade as string | null) ?? null,
            documento_ref: (c.documento_ref as string | null) ?? null,
            observacoes: (c.observacoes as string | null) ?? null,
          } : null,
        };
      });
    },
  });

  return { locais: data ?? [], carregando: isLoading, erro: error as Error | null };
}

/** Uma classe dentro de uma venda ou entrega. */
export interface VendaItem {
  classe: string;
  /** Até 4 casas — é o que o romaneio traz (F3). */
  sacas: number;
  preco_saca: number;
  /** `round(sacas × preço, 2)` — o dinheiro, sempre em duas. */
  valor: number;
}

/** O lançamento financeiro ligado à venda, quando há. */
export interface VendaLancamento {
  id: string;
  status: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  cancelado: boolean;
}

/** Um lançamento gerado pela venda — receita de uma parcela, o Senar ou um desconto. */
export interface VendaLancamentoLinha {
  id: string;
  /** `receita_venda` | `imposto` | `desconto`. */
  natureza: string;
  descricao: string | null;
  valor: number;
  sinal: string | null;
  status: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  conciliado: boolean;
  cancelado: boolean;
}

/** Uma saída do estoque COM contrapartida — venda avulsa ou entrega de barter. */
export interface VendaGrao {
  id: string;
  /** `venda_avulsa` | `barter`. Só a avulsa se cancela e edita por aqui. */
  tipo: string;
  contrato_barter_id: string | null;
  data: string;
  comprador_id: string | null;
  comprador: string | null;
  ativo: boolean;
  status_comercial: string | null;
  status_financeiro: string | null;
  observacoes: string | null;
  sacas: number;
  valor: number;
  /**
   * O DOCUMENTO EM TRÊS NÚMEROS — F3.1.
   *
   * ⚠ `valor` E `bruto` SÃO A MESMA COISA e convivem por compatibilidade: `valor` já era a soma
   * das entregas e continua sendo. O que faltava era o que vem DEPOIS dele — a dedução e o que
   * sobra —, e é isso que o Financeiro recebe parcelado.
   * ⚠ `liquido = bruto − senar − deducoes`, e quem faz essa conta é a RPC. O front a repete para
   * prever, nunca para decidir.
   */
  bruto: number;
  senar: number;
  deducoes: number;
  liquido: number;
  itens: VendaItem[];
  /** O primeiro lançamento de receita — mantido para quem já lia `lancamento`. */
  lancamento: VendaLancamento | null;
  /**
   * TODOS os lançamentos da venda: uma receita por parcela, mais Senar e descontos.
   *
   * ⚠ ELES SÃO N, NÃO UM — e é por isso que cancelar uma venda passou a ser um gesto de N: a RPC
   * de cancelamento trata a lista inteira, e recusa se QUALQUER um estiver conciliado.
   */
  lancamentos: VendaLancamentoLinha[];
  autor: string;
  criado_em: string;
  cancelado_em: string | null;
  cancelado_por: string;
  motivo_cancelamento: string | null;
}

/**
 * TUDO QUE COMPÕE A COLUNA "ENTREGUE" — venda avulsa e barter, ativos e cancelados (F3).
 *
 * ⚠ ELE É O ÚNICO LUGAR ONDE A VENDA CANCELADA APARECE. As três leituras de saldo passaram a
 * ignorar operação com `ativo=false` (migration 20261020120000), então a venda estornada some do
 * Entregue — que é certo — e ficaria invisível, que não é.
 * ⚠ O BARTER ENTRA SÓ PARA SER VISTO. Ele tem contrato, insumos e conta de permuta; cancelar e
 * editar continuam no Barter, e a RPC recusa aqui com `VENDA_NAO_AVULSA_*`. A lista mostra porque
 * o Entregue é a soma dos dois — esconder metade faria a conta não fechar na tela.
 * ⚠ NENHUM SALDO SE CALCULA AQUI: o topo soma as sacas ATIVAS desta lista, que é a lista falando
 * de si. Quem diz o saldo é `fn_estoque_graos`.
 */
export function useVendasGraos(
  clienteId: string | null | undefined, safraId: string | null, cultura: string | null,
  ativo: boolean,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendas-graos', clienteId ?? '', safraId ?? '', cultura ?? ''],
    enabled: !!clienteId && !!safraId && !!cultura && ativo,
    queryFn: async (): Promise<VendaGrao[]> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_vendas_graos', {
        p_cliente: clienteId, p_safra_id: safraId, p_cultura: cultura,
      });
      if (err) throw err;
      return (Array.isArray(r) ? r : []).map((x: Record<string, unknown>) => {
        const l = x?.lancamento as Record<string, unknown> | null;
        return {
          id: String(x?.id ?? ''),
          tipo: String(x?.tipo ?? 'venda_avulsa'),
          contrato_barter_id: (x?.contrato_barter_id as string | null) ?? null,
          data: String(x?.data ?? ''),
          comprador_id: (x?.comprador_id as string | null) ?? null,
          comprador: (x?.comprador as string | null) ?? null,
          ativo: x?.ativo !== false,
          status_comercial: (x?.status_comercial as string | null) ?? null,
          status_financeiro: (x?.status_financeiro as string | null) ?? null,
          observacoes: (x?.observacoes as string | null) ?? null,
          sacas: num(x?.sacas),
          valor: num(x?.valor),
          bruto: num(x?.bruto ?? x?.valor),
          senar: num(x?.senar),
          deducoes: num(x?.deducoes),
          liquido: num(x?.liquido ?? x?.valor),
          itens: Array.isArray(x?.itens) ? (x.itens as Record<string, unknown>[]).map(i => ({
            classe: String(i?.classe ?? '—'),
            sacas: num(i?.sacas),
            preco_saca: num(i?.preco_saca),
            valor: num(i?.valor),
          })) : [],
          lancamento: l ? {
            id: String(l.id ?? ''),
            status: String(l.status ?? ''),
            data_vencimento: (l.data_vencimento as string | null) ?? null,
            data_pagamento: (l.data_pagamento as string | null) ?? null,
            cancelado: l.cancelado === true,
          } : null,
          lancamentos: Array.isArray(x?.lancamentos)
            ? (x.lancamentos as Record<string, unknown>[]).map(li => ({
                id: String(li?.id ?? ''),
                natureza: String(li?.natureza ?? ''),
                descricao: (li?.descricao as string | null) ?? null,
                valor: num(li?.valor),
                sinal: (li?.sinal as string | null) ?? null,
                status: (li?.status as string | null) ?? null,
                data_vencimento: (li?.data_vencimento as string | null) ?? null,
                data_pagamento: (li?.data_pagamento as string | null) ?? null,
                conciliado: li?.conciliado === true,
                cancelado: li?.cancelado === true,
              }))
            : [],
          autor: String(x?.autor ?? ''),
          criado_em: String(x?.criado_em ?? ''),
          cancelado_em: (x?.cancelado_em as string | null) ?? null,
          cancelado_por: String(x?.cancelado_por ?? ''),
          motivo_cancelamento: (x?.motivo_cancelamento as string | null) ?? null,
        };
      });
    },
  });

  return { vendas: data ?? [], carregando: isLoading, erro: error as Error | null };
}

/** Um lançamento manual que a venda pode substituir. */
export interface LancamentoSubstituivel {
  id: string;
  descricao: string | null;
  valor: number;
  data_competencia: string | null;
  favorecido: string | null;
  status: string | null;
}

/**
 * OS LANÇAMENTOS DE RECEITA FEITOS À MÃO que esta venda vem substituir (F3.1, bloco 5).
 *
 * ⚠ NÃO HÁ HOOK NEM RPC PARA ISTO NA CASA — medido: nenhum lugar lista lançamento por
 * safra+cultura. As telas que precisam de lançamento fazem `select` direto em
 * `financeiro_lancamentos_v2` (é o que `useAnaliseTrimestral` faz), e é o que este faz.
 * ⚠ O FILTRO É ESTREITO DE PROPÓSITO: só receita (`sinal = '1'`), só origem manual ou de
 * importação, NÃO cancelado e NÃO conciliado. Conciliado é dinheiro já casado com o extrato —
 * substituí-lo apagaria a conciliação, e a RPC recusa com
 * `SUBSTITUIR_LANCAMENTO_CANCELADO_OU_CONCILIADO`. Mostrar aqui o que o banco vai recusar seria
 * oferecer um caminho que termina em erro.
 * ⚠ SÓ CONSULTA COM O MODAL ABERTO, como as outras listas desta tela.
 */
export function useLancamentosSubstituiveis(
  clienteId: string | null | undefined, safraId: string | null, cultura: string | null,
  ativo: boolean,
) {
  const { data, isLoading } = useQuery({
    queryKey: ['lancamentos-substituiveis', clienteId ?? '', safraId ?? '', cultura ?? ''],
    enabled: !!clienteId && !!safraId && !!cultura && ativo,
    queryFn: async (): Promise<LancamentoSubstituivel[]> => {
      const { data: r, error: err } = await (supabase as any)
        .from('financeiro_lancamentos_v2')
        .select('id, descricao, valor, data_competencia, status_transacao, financeiro_fornecedores(nome)')
        .eq('cliente_id', clienteId)
        .eq('safra_id', safraId)
        .eq('cultura', cultura)
        .eq('sinal', '1')
        .in('origem_lancamento', ['manual', 'importacao_incremental', 'importacao'])
        .eq('cancelado', false)
        .is('conciliado_em', null)
        .order('data_competencia', { ascending: false });
      if (err) throw err;
      return (Array.isArray(r) ? r : []).map((x: Record<string, unknown>) => ({
        id: String(x?.id ?? ''),
        descricao: (x?.descricao as string | null) ?? null,
        valor: num(x?.valor),
        data_competencia: (x?.data_competencia as string | null) ?? null,
        favorecido: ((x?.financeiro_fornecedores as { nome?: string } | null)?.nome) ?? null,
        status: (x?.status_transacao as string | null) ?? null,
      }));
    },
  });

  return { lancamentos: data ?? [], carregando: isLoading };
}
