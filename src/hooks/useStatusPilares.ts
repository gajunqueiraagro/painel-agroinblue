/**
 * Hook: useStatusPilares
 *
 * Consome get_status_pilares_fechamento(fazenda_id, ano_mes) do banco
 * e retorna o status de cada pilar de governança.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type StatusPilar = 'oficial' | 'provisorio' | 'bloqueado';

export interface PilarInfo {
  status: StatusPilar;
  detalhe?: Record<string, unknown>;
  modo_transitorio?: boolean;
}

export interface StatusPilares {
  p1_mapa_pastos: PilarInfo;
  p2_valor_rebanho: PilarInfo;
  p3_financeiro_caixa: PilarInfo;
  p4_competencia: PilarInfo;
  p5_economico_consolidado: PilarInfo;
}

const DEFAULT_PILAR: PilarInfo = { status: 'provisorio' };

const DEFAULT_STATUS: StatusPilares = {
  p1_mapa_pastos: DEFAULT_PILAR,
  p2_valor_rebanho: DEFAULT_PILAR,
  p3_financeiro_caixa: DEFAULT_PILAR,
  p4_competencia: DEFAULT_PILAR,
  p5_economico_consolidado: DEFAULT_PILAR,
};

function parsePilar(raw: unknown): PilarInfo {
  if (!raw || typeof raw !== 'object') return DEFAULT_PILAR;
  const obj = raw as Record<string, unknown>;
  const status = (obj.status as string) || 'provisorio';
  return {
    status: (['oficial', 'provisorio', 'bloqueado'].includes(status) ? status : 'provisorio') as StatusPilar,
    detalhe: obj.detalhe as Record<string, unknown> | undefined,
    modo_transitorio: obj.modo_transitorio as boolean | undefined,
  };
}

export function useStatusPilares(fazendaId: string | undefined, anoMes: string | undefined) {
  const [data, setData] = useState<StatusPilares>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!fazendaId || !anoMes || fazendaId === '__global__') {
      setData(DEFAULT_STATUS);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: result, error: err } = await supabase.rpc(
        'get_status_pilares_fechamento',
        { _fazenda_id: fazendaId, _ano_mes: anoMes }
      );

      if (err) {
        setError(err.message);
        setData(DEFAULT_STATUS);
        return;
      }

      if (result && typeof result === 'object') {
        const r = result as Record<string, unknown>;
        setData({
          p1_mapa_pastos: parsePilar(r.p1_mapa_pastos),
          p2_valor_rebanho: parsePilar(r.p2_valor_rebanho),
          p3_financeiro_caixa: parsePilar(r.p3_financeiro_caixa),
          p4_competencia: parsePilar(r.p4_competencia),
          p5_economico_consolidado: parsePilar(r.p5_economico_consolidado),
        });
      }
    } catch (e) {
      setError(String(e));
      setData(DEFAULT_STATUS);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, anoMes]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { status: data, loading, error, refetch };
}

/**
 * Map bloco name → pilar key
 */
export const BLOCO_PILAR_MAP: Record<string, keyof StatusPilares> = {
  'Rebanho': 'p1_mapa_pastos',
  'Peso': 'p1_mapa_pastos',
  'Valor do Rebanho': 'p2_valor_rebanho',
  'Desempenho': 'p1_mapa_pastos',
  'Produção': 'p1_mapa_pastos',
  'Estrutura': 'p1_mapa_pastos',
  'Desempenho Médio': 'p1_mapa_pastos',
  'Produção Média': 'p1_mapa_pastos',
  'Financeiro no Caixa': 'p3_financeiro_caixa',
  'Financeiro por Competência': 'p4_competencia',
  'Financeiro Médio': 'p3_financeiro_caixa',
};

/**
 * Badge config per status
 */
export function getPilarBadgeConfig(status: StatusPilar): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'oficial':
      return { label: 'Oficial', className: 'bg-emerald-600/15 text-emerald-700 border-emerald-600/30' };
    case 'provisorio':
      return { label: 'Provisório', className: 'bg-amber-500/15 text-amber-700 border-amber-500/30' };
    case 'bloqueado':
      return { label: 'Bloqueado', className: 'bg-red-500/15 text-red-700 border-red-500/30' };
  }
}

/**
 * Build a human-readable tooltip from PilarInfo.detalhe
 */
export function getPilarTooltipText(pilarKey: keyof StatusPilares, info: PilarInfo): string | null {
  const d = info.detalhe as Record<string, unknown> | undefined;

  if (pilarKey === 'p1_mapa_pastos') {
    if (info.status === 'bloqueado' && d) {
      const motivo = d.motivo as string | undefined;
      const divs = d.divergencias as unknown[] | undefined;
      if (motivo === 'divergencia_rebanho' && divs) {
        return `Bloqueado — divergência de rebanho em ${divs.length} categoria(s)`;
      }
      if (motivo === 'sem_pastos_fechados') {
        return 'Bloqueado — nenhum pasto fechado neste mês';
      }
      if (motivo) return `Bloqueado — ${motivo}`;
      return 'Bloqueado';
    }
    if (info.status === 'provisorio' && d) {
      const fechados = d.pastos_fechados as number | undefined;
      const total = d.pastos_total as number | undefined;
      if (typeof fechados === 'number' && typeof total === 'number' && total > 0) {
        return `Provisório — ${fechados} de ${total} pastos fechados`;
      }
      return 'Provisório — fechamento pendente';
    }
    if (info.status === 'oficial') {
      return 'Oficial — conciliado e fechado';
    }
  }

  if (info.modo_transitorio) {
    return 'Oficial transitório — fechamento formal ainda não implementado';
  }

  if (info.status === 'oficial') return 'Oficial';
  if (info.status === 'provisorio') return 'Provisório — fechamento pendente';
  if (info.status === 'bloqueado') {
    const motivo = d?.motivo as string | undefined;
    return motivo ? `Bloqueado — ${motivo}` : 'Bloqueado — dependência pendente';
  }
  return null;
}
