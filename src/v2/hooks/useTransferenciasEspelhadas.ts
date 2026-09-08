/**
 * As transferências entre contas do próprio cliente — [ENRIQUECER-GRAVAR-01] (133c item 3).
 *
 * ⚠ O QUE ELAS SÃO: dois lançamentos que o OFX trouxe como fatos separados — uma saída numa
 * conta e uma entrada em outra, mesmo valor, um dia de distância — e que são **um** movimento
 * só. Enquanto ficam separados, o mês conta o dinheiro duas vezes: uma despesa que não
 * existe e uma receita que não existe.
 *
 * ⚠ A DETECÇÃO É DO BANCO, e o front NÃO a reproduz. `fn_transferencias_espelhadas` já
 * exige valor igual (2 casas), |dias| ≤ 1, contas diferentes e **subcentro nulo** dos dois
 * lados — quem já foi classificado não é candidato. Uma segunda régua aqui discordaria dela
 * no dia em que a tolerância mudasse.
 *
 * ⚠ `ambiguo` NÃO É ERRO, É PERGUNTA: significa que a mesma saída casa com mais de uma
 * entrada (ou o contrário). Medido em agosto do NJ: três saídas de R$ 300.000 do Itaú no dia
 * 17 contra entradas no BB e na Lavoura. Quem escolhe é o operador.
 *
 * ⚠ A UNIÃO SIMULA ANTES DE GRAVAR. `fn_transferencia_unir(p_simular=true)` devolve
 * `vinculos_a_mover` sem escrever nada; é o número que a tela mostra antes de o operador
 * confirmar. Sem ele, "Unir" é um botão que promete um efeito invisível.
 */
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

/** Um par candidato, exatamente como a RPC o devolve. */
export interface ParEspelhado {
  saida_id: string;
  entrada_id: string;
  valor: number;
  dia_saida: string;
  dia_entrada: string;
  conta_saida_id: string;
  conta_saida: string | null;
  conta_entrada_id: string;
  conta_entrada: string | null;
  desc_saida: string | null;
  desc_entrada: string | null;
  /** A mesma saída casa com mais de uma entrada, ou a mesma entrada com mais de uma saída. */
  ambiguo: boolean;
}

export interface TransferenciasEspelhadas {
  total: number;
  unicos: number;
  pares: ParEspelhado[];
}

const VAZIO: TransferenciasEspelhadas = { total: 0, unicos: 0, pares: [] };

/** O que a simulação devolve — o número que a tela mostra antes de confirmar. */
export interface SimulacaoUniao {
  vinculos_a_mover: number;
  valor: number | null;
}

/**
 * Um estorno espelhado — 133f item 2. Saída e entrada na MESMA conta: o dinheiro saiu e
 * voltou, e enquanto os dois ficam soltos a DRE conta uma despesa que não existiu.
 */
export interface ParEstorno {
  saida_id: string;
  entrada_id: string;
  valor: number;
  dia_saida: string;
  dia_entrada: string;
  conta_id: string;
  conta: string | null;
  desc_saida: string | null;
  desc_entrada: string | null;
  ja_classificado: boolean;
  ambiguo: boolean;
}

/** Um candidato de cartão para uma fatura — a soma do mês daquele cartão e se ela bate. */
export interface CandidatoCartao {
  cartao_id: string;
  cartao: string | null;
  soma_mes: number;
  bate: boolean;
}

/**
 * Uma fatura de cartão — 133f item 2. A saída da conta corrente que paga o cartão não é
 * despesa: é transferência. Enquanto ela fica como saída, o mês conta o gasto duas vezes —
 * uma em cada compra do cartão, outra na fatura.
 */
export interface FaturaCartao {
  saida_id: string;
  valor: number;
  dia: string;
  conta_id: string;
  conta: string | null;
  descricao: string | null;
  ja_transferencia: boolean;
  candidatos: CandidatoCartao[];
  sugerido_cartao_id: string | null;
}

export interface EstornosEspelhados { total: number; pendentes: number; pares: ParEstorno[] }
export interface FaturasCartao { total: number; pendentes: number; faturas: FaturaCartao[] }

const VAZIO_EST: EstornosEspelhados = { total: 0, pendentes: 0, pares: [] };
const VAZIO_FAT: FaturasCartao = { total: 0, pendentes: 0, faturas: [] };

export function useTransferenciasEspelhadas(clienteId: string | null | undefined, anoMes: string | null) {
  const qc = useQueryClient();
  const [unindo, setUnindo] = useState(false);

  const query = useQuery({
    queryKey: ['transferencias-espelhadas', clienteId ?? null, anoMes ?? null],
    enabled: !!clienteId && !!anoMes,
    staleTime: 30_000,
    queryFn: async (): Promise<TransferenciasEspelhadas> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_transferencias_espelhadas', {
        p_cliente_id: clienteId, p_ano_mes: anoMes,
      });
      if (error) throw error;
      const r = (data ?? {}) as { total?: number; unicos?: number; pares?: ParEspelhado[] };
      return { total: r.total ?? 0, unicos: r.unicos ?? 0, pares: r.pares ?? [] };
    },
  });

  /** Simula a união — não escreve nada. */
  const simular = useCallback(async (saidaId: string, entradaId: string): Promise<SimulacaoUniao | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
    const { data, error } = await (supabase as any).rpc('fn_transferencia_unir', {
      p_saida_id: saidaId, p_entrada_id: entradaId, p_simular: true,
    });
    if (error) throw error;
    const r = (data ?? {}) as { ok?: boolean; vinculos_a_mover?: number; valor?: number; motivo?: string };
    if (!r.ok) throw new Error(r.motivo ?? 'não foi possível simular a união');
    return { vinculos_a_mover: r.vinculos_a_mover ?? 0, valor: r.valor ?? null };
  }, []);

  /** Une de verdade. O par sai da lista na releitura. */
  const unir = useCallback(async (saidaId: string, entradaId: string): Promise<{ vinculosMovidos: number }> => {
    setUnindo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_transferencia_unir', {
        p_saida_id: saidaId, p_entrada_id: entradaId, p_simular: false,
      });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; vinculos_movidos?: number; motivo?: string };
      if (!r.ok) throw new Error(r.motivo ?? 'não foi possível unir');
      if (clienteId) notificarLancamentosMudaram(clienteId);
      await qc.invalidateQueries({ queryKey: ['transferencias-espelhadas', clienteId ?? null, anoMes ?? null] });
      return { vinculosMovidos: r.vinculos_movidos ?? 0 };
    } finally {
      setUnindo(false);
    }
  }, [clienteId, anoMes, qc]);

  /* ══ ESTORNOS — 133f item 2 ═════════════════════════════════════════════════════ */
  const qEstornos = useQuery({
    queryKey: ['estornos-espelhados', clienteId ?? null, anoMes ?? null],
    enabled: !!clienteId && !!anoMes,
    staleTime: 30_000,
    queryFn: async (): Promise<EstornosEspelhados> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_estornos_espelhados', {
        p_cliente_id: clienteId, p_ano_mes: anoMes,
      });
      if (error) throw error;
      const r = (data ?? {}) as { total?: number; pendentes?: number; pares?: ParEstorno[] };
      return { total: r.total ?? 0, pendentes: r.pendentes ?? 0, pares: r.pares ?? [] };
    },
  });

  /* ══ FATURAS DE CARTÃO — 133f item 2 ════════════════════════════════════════════ */
  const qFaturas = useQuery({
    queryKey: ['faturas-cartao', clienteId ?? null, anoMes ?? null],
    enabled: !!clienteId && !!anoMes,
    staleTime: 30_000,
    queryFn: async (): Promise<FaturasCartao> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_faturas_cartao', {
        p_cliente_id: clienteId, p_ano_mes: anoMes,
      });
      if (error) throw error;
      const r = (data ?? {}) as { total?: number; pendentes?: number; faturas?: FaturaCartao[] };
      return { total: r.total ?? 0, pendentes: r.pendentes ?? 0, faturas: r.faturas ?? [] };
    },
  });

  const invalidarTudo = useCallback(async () => {
    if (clienteId) notificarLancamentosMudaram(clienteId);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['transferencias-espelhadas', clienteId ?? null, anoMes ?? null] }),
      qc.invalidateQueries({ queryKey: ['estornos-espelhados', clienteId ?? null, anoMes ?? null] }),
      qc.invalidateQueries({ queryKey: ['faturas-cartao', clienteId ?? null, anoMes ?? null] }),
    ]);
  }, [clienteId, anoMes, qc]);

  /**
   * ⚠ SIMULAR E APLICAR SÃO A MESMA RPC com `p_simular` — o mesmo idioma da união. A
   * simulação é obrigatória antes de aplicar (o botão só habilita depois): ela é o único
   * lugar onde o operador vê o efeito antes de ele acontecer.
   */
  const simularEstorno = useCallback(async (saidaId: string, entradaId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
    const { data, error } = await (supabase as any).rpc('fn_estorno_aplicar', {
      p_saida_id: saidaId, p_entrada_id: entradaId, p_simular: true,
    });
    if (error) throw error;
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    if (!r.ok) throw new Error(r.motivo ?? 'não foi possível simular o estorno');
    return r as Record<string, unknown>;
  }, []);

  const aplicarEstorno = useCallback(async (saidaId: string, entradaId: string) => {
    setUnindo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_estorno_aplicar', {
        p_saida_id: saidaId, p_entrada_id: entradaId, p_simular: false,
      });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; motivo?: string };
      if (!r.ok) throw new Error(r.motivo ?? 'não foi possível aplicar o estorno');
      await invalidarTudo();
    } finally { setUnindo(false); }
  }, [invalidarTudo]);

  const simularFatura = useCallback(async (saidaId: string, cartaoId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
    const { data, error } = await (supabase as any).rpc('fn_fatura_aplicar', {
      p_saida_id: saidaId, p_cartao_id: cartaoId, p_simular: true,
    });
    if (error) throw error;
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    if (!r.ok) throw new Error(r.motivo ?? 'não foi possível simular a fatura');
    return r as Record<string, unknown>;
  }, []);

  const aplicarFatura = useCallback(async (saidaId: string, cartaoId: string) => {
    setUnindo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
      const { data, error } = await (supabase as any).rpc('fn_fatura_aplicar', {
        p_saida_id: saidaId, p_cartao_id: cartaoId, p_simular: false,
      });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; motivo?: string };
      if (!r.ok) throw new Error(r.motivo ?? 'não foi possível unir a fatura');
      await invalidarTudo();
    } finally { setUnindo(false); }
  }, [invalidarTudo]);

  return {
    dados: query.data ?? VAZIO,
    carregando: query.isLoading,
    simular, unir, unindo,
    /* 133f item 2 — as duas famílias novas, no mesmo hook porque vivem no mesmo chip. */
    estornos: qEstornos.data ?? VAZIO_EST,
    faturas: qFaturas.data ?? VAZIO_FAT,
    carregandoOutros: qEstornos.isLoading || qFaturas.isLoading,
    simularEstorno, aplicarEstorno, simularFatura, aplicarFatura,
  };
}
