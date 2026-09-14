/**
 * O ESTOQUE DE GRÃO EM MÃOS — PR-ESTOQUE-GRAOS-F1.
 *
 * ⚠ A RPC É FONTE ÚNICA: o saldo é `colhido − entregue` por classe, e essa conta mora em
 * `fn_estoque_graos`. Refazê-la aqui criaria um segundo saldo, e no dia em que os dois
 * divergissem ninguém saberia qual está certo — que é exatamente o problema que uma tela de
 * estoque existe para não ter.
 *
 * ⚠ ELA NÃO RECEBE CULTURA, e isso é do contrato, não omissão: a assinatura é
 * `(p_cliente, p_safra_id)`. O estoque é da SAFRA INTEIRA. A tela não oferece filtro de cultura
 * por causa disto — um seletor que não muda número nenhum é pior que seletor nenhum.
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
}

const num = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

export function useEstoqueGraos(clienteId: string | null | undefined, safraId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['estoque-graos', clienteId ?? '', safraId ?? ''],
    enabled: !!clienteId && !!safraId,
    queryFn: async (): Promise<EstoqueClasse[]> => {
      const { data: r, error: err } = await (supabase as any).rpc('fn_estoque_graos', {
        p_cliente: clienteId,
        p_safra_id: safraId,
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
    /**
     * ⚠ O PERCENTUAL PARADO É `saldo / colhido`, e o denominador é o COLHIDO, não o entregue:
     * a pergunta é "quanto da safra ainda está comigo", e o entregue já saiu da fazenda.
     * ⚠ SEM COLHEITA DÁ ZERO, não NaN: safra que não colheu não tem grão parado — ela não tem
     * grão nenhum.
     */
    pctParado: colhido > 0 ? (saldo / colhido) * 100 : 0,
  };
}
