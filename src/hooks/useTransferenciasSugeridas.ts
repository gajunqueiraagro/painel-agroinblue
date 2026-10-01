/**
 * TRANSFERÊNCIAS ENTRE CONTAS — PR-CONC-TRANSFERENCIAS-01.
 *
 * ⚠ O MOTOR É DO BANCO: `fn_transferencias_sugeridas` acha os pares de OFX (contas diferentes, valor oposto exato,
 *   |dias| ≤ 1, as duas pontas livres) e resolve a ambiguidade pelo mesmo dia; `fn_transferencia_de_extratos` fecha as
 *   duas pontas num lançamento (ou na transferência já lançada), com `p_simular` para a prévia. Nenhuma régua é copiada
 *   aqui — a tela só mostra e escolhe.
 * ⚠ O PASSO É ANTES DO "Criar lançamentos em lote": sem ele, cada ponta vira um cru solto (saída num banco + entrada no
 *   outro) — dinheiro mudando de bolso contado como despesa e receita.
 * ⚠ E A MEIA TRANSFERÊNCIA (CONC-TRANSF-SEGUNDA-PONTA-01): uma ponta já conciliada, a outra solta (o backfill de jun/26
 *   deixou 58 assim). `fn_transferencias_meia_ponta` lista o extrato livre com a transferência que o espera, e
 *   `fn_transferencia_segunda_ponta` liga a segunda ponta pela dupla ponta do vincular. As duas espécies vêm na MESMA
 *   query (mesma chave, mesma invalidação) e o modal as mostra na mesma tabela.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

/** Uma ponta — uma linha do extrato. */
export interface PontaTransferencia {
  id: string;
  data: string;
  valor: number;
  conta_id: string;
  conta: string | null;
  descricao: string | null;
}

export interface CandidataTransferencia extends PontaTransferencia {
  /** A transferência já lançada em que este par casaria (null = cria uma nova). */
  existente_id: string | null;
}

/** Uma saída do banco e a sua entrada (ou as entradas possíveis, quando ambíguo). */
export interface LinhaTransferencia {
  saida: PontaTransferencia;
  /** 'limpo' = 1:1 dos dois lados; 'mesmo_dia' = o nó que só o mesmo dia resolve; 'ambiguo' = o operador escolhe. */
  como: 'limpo' | 'mesmo_dia' | 'ambiguo';
  entrada: PontaTransferencia | null;
  existente_id: string | null;
  candidatas: CandidataTransferencia[];
}

/** A ponta que a transferência já tem conciliada (a outra conta). */
export interface PontaLigada {
  extrato_id: string;
  data: string;
  valor: number;
  conta_id: string;
  conta: string | null;
}

/** Meia transferência: o extrato livre e a transferência (com uma ponta só) em que ele entra como segunda ponta. */
export interface LinhaMeiaPonta {
  extrato: PontaTransferencia;
  transferencia_id: string;
  ponta_ligada: PontaLigada;
}

export interface TransferenciasSugeridas {
  /** Pares de duas pontas livres (`fn_transferencias_sugeridas`). */
  total: number;
  linhas: LinhaTransferencia[];
  /** Meias transferências (`fn_transferencias_meia_ponta`) — o (N) do botão soma as duas espécies. */
  meias: LinhaMeiaPonta[];
}

export interface ResultadoTransferencia {
  ok: boolean;
  motivo?: string;
  acao?: 'criar' | 'casar_existente';
  lancamento_id?: string | null;
  valor?: number;
}

const VAZIO: TransferenciasSugeridas = { total: 0, linhas: [], meias: [] };

/** O motivo de recusa da RPC, dito para o operador. */
export const MOTIVO_TRANSFERENCIA: Record<string, string> = {
  extrato_nao_encontrado: 'movimento não encontrado',
  clientes_diferentes: 'clientes diferentes',
  mesma_conta: 'as duas pontas estão na mesma conta',
  sinais_nao_opostos: 'as pontas não são uma saída e uma entrada',
  valores_diferentes: 'valores diferentes',
  extrato_ignorado: 'um dos movimentos está ignorado',
  extrato_ja_conciliado: 'um dos movimentos já está conciliado',
  mes_fechado: 'mês fechado',
  sem_fazenda: 'sem fazenda para a transferência',
  /* CONC-TRANSF-SEGUNDA-PONTA-01 (`fn_transferencia_segunda_ponta`) */
  nao_e_transferencia: 'o lançamento não é uma transferência',
  direcao_errada: 'o movimento está na direção errada da transferência',
  fora_da_janela: 'mais de 1 dia entre o movimento e a transferência',
  ponta_ja_ligada: 'esta ponta da transferência já está conciliada',
  sem_outra_ponta: 'a transferência não tem a outra ponta conciliada',
};

export const textoMotivo = (m?: string | null) => (m ? MOTIVO_TRANSFERENCIA[m] ?? m : 'recusado');

export const chaveTransferencias = (clienteId: string | null, anoMes: string) =>
  ['transferencias-sugeridas', clienteId, anoMes] as const;

export function useTransferenciasSugeridas(clienteId: string | null, anoMes: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: chaveTransferencias(clienteId, anoMes),
    enabled: !!clienteId,
    staleTime: 30_000,
    queryFn: async (): Promise<TransferenciasSugeridas> => {
      const params = { p_cliente_id: clienteId, p_ano_mes: anoMes };
      const [pares, meias] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
        (supabase as any).rpc('fn_transferencias_sugeridas', params),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
        (supabase as any).rpc('fn_transferencias_meia_ponta', params),
      ]);
      if (pares.error) throw pares.error;
      if (meias.error) throw meias.error;
      const r: { total?: number; linhas?: LinhaTransferencia[] } = pares.data ?? {};
      const rm: { linhas?: LinhaMeiaPonta[] } = meias.data ?? {};
      return { total: r.total ?? 0, linhas: r.linhas ?? [], meias: rm.linhas ?? [] };
    },
  });

  /** Um par pela RPC: `simular` não grava nada. */
  const fechar = useCallback(async (saidaId: string, entradaId: string, simular: boolean): Promise<ResultadoTransferencia> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
    const { data, error } = await (supabase as any).rpc('fn_transferencia_de_extratos', {
      p_saida: saidaId, p_entrada: entradaId, p_simular: simular,
    });
    if (error) return { ok: false, motivo: error.message };
    const r: ResultadoTransferencia = data ?? { ok: false };
    return r;
  }, []);

  /** A segunda ponta de uma meia transferência pela RPC: `simular` não grava nada. */
  const fecharMeia = useCallback(async (extratoId: string, lancamentoId: string, simular: boolean): Promise<ResultadoTransferencia> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado do repo
    const { data, error } = await (supabase as any).rpc('fn_transferencia_segunda_ponta', {
      p_extrato: extratoId, p_lancamento: lancamentoId, p_simular: simular,
    });
    if (error) return { ok: false, motivo: error.message };
    const r: ResultadoTransferencia = data ?? { ok: false };
    return r;
  }, []);

  /** Depois de gravar: a lista relê, e quem mostra lançamento é avisado. Só no sucesso. */
  const depoisDeGravar = useCallback(async () => {
    if (clienteId) notificarLancamentosMudaram(clienteId);
    await qc.invalidateQueries({ queryKey: chaveTransferencias(clienteId, anoMes) });
  }, [clienteId, anoMes, qc]);

  return {
    dados: query.data ?? VAZIO,
    carregando: query.isLoading,
    erro: query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null,
    fechar,
    fecharMeia,
    depoisDeGravar,
  };
}
