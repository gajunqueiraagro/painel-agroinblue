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
      }));
    },
  });

  return { culturas: data ?? [], carregando: isLoading, erro: error as Error | null };
}
