/**
 * Hook: useStatusPilares
 *
 * Consome get_status_pilares_fechamento(fazenda_id, ano_mes) do banco
 * e retorna o status de cada pilar de governança.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/* PR-PILARES-CALCULO-01 — vocabulario alinhado ao que a funcao EMITE.
   Antes o tipo era oficial|provisorio|bloqueado e a funcao emitia oficial|pendente:
   a unica palavra em comum era 'oficial', e todo o resto virava provisorio no parse.
   provisorio SAIU — nenhuma versao da funcao o emitiu. 'bloqueado' FICA: e o estado
   previsto para quando o P5 virar derivado real. 'nao_implementado' entra porque o
   banco passou a declara-lo. */
export type StatusPilar = 'oficial' | 'pendente' | 'nao_aplicavel' | 'nao_iniciado' | 'nao_implementado' | 'bloqueado';

export interface PilarInfo {
  status: StatusPilar;
  detalhe?: Record<string, unknown>;
}

export interface StatusPilares {
  p1_mapa_pastos: PilarInfo;
  p2_valor_rebanho: PilarInfo;
  p3_financeiro_caixa: PilarInfo;
  p4_competencia: PilarInfo;
  p5_economico_consolidado: PilarInfo;
}

/* Default e 'pendente': na ausencia de informacao nunca afirmar fechamento. */
const DEFAULT_PILAR: PilarInfo = { status: 'pendente' };

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
  const status = (obj.status as string) || 'pendente';
  return {
    status: (['oficial', 'pendente', 'nao_aplicavel', 'nao_iniciado', 'nao_implementado', 'bloqueado'].includes(status) ? status : 'pendente') as StatusPilar,
    detalhe: obj.detalhe as Record<string, unknown> | undefined,
  };
}

export function useStatusPilares(fazendaId: string | undefined, anoMes: string | undefined, enabled = true) {
  const [data, setData] = useState<StatusPilares>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled || !fazendaId || !anoMes || fazendaId === '__global__') {
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
  }, [enabled, fazendaId, anoMes]);

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
    case 'pendente':
      return { label: 'Pendente', className: 'bg-amber-500/15 text-amber-700 border-amber-500/30' };
    /* Cinza inerte, e nao ambar: nao_implementado NAO e pendencia do operador — e
       funcionalidade que nao existe. Pintado de ambar junto com pendencia real, treina
       o olho a ignorar o ambar inteiro, e ai a pendencia verdadeira some no meio.
       O switch segue EXAUSTIVO sobre o union, sem default: estado novo no futuro vira
       erro de compilacao em vez de undefined silencioso. */
    /* 'nao_aplicavel' e 'nao_implementado' compartilham a caixa cinza por serem a mesma
       classe de coisa para o olho — nao ha o que fazer ali —, mas dizem coisas
       diferentes: um e "nao havia rebanho neste mes", o outro e "esta tela nao existe".
       Na faixa da Home o P2 nao aplicavel nem chega a ser renderizado; o case existe
       porque outras telas usam este badge e o switch e EXAUSTIVO, sem default. */
    case 'nao_aplicavel':
      return { label: 'Não se aplica', className: 'bg-muted text-muted-foreground border-border' };
    /* Terceiro cinza, e cada um diz uma coisa: 'nao_aplicavel' e "nao havia rebanho
       neste mes"; 'nao_iniciado' e "ninguem abriu este mes"; 'nao_implementado' e "esta
       tela nao existe". Para o olho sao iguais — nao ha o que fazer em nenhum —, e e por
       isso que compartilham a caixa. */
    case 'nao_iniciado':
      return { label: 'Não iniciado', className: 'bg-muted text-muted-foreground border-border' };
    case 'nao_implementado':
      return { label: 'Não implementado', className: 'bg-muted text-muted-foreground border-border' };
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
    if (info.status === 'pendente' && d) {
      const fechados = d.pastos_fechados as number | undefined;
      const total = d.pastos_total as number | undefined;
      if (typeof fechados === 'number' && typeof total === 'number' && total > 0) {
        return `Pendente — ${fechados} de ${total} pastos fechados`;
      }
      return 'Pendente — fechamento não concluído';
    }
    if (info.status === 'oficial') {
      return 'Oficial — conciliado e fechado';
    }
  }

  /* modo_transitorio saiu inteiro — tipo, leitura e ramo. A funcao o emitia fixo no P4,
     entao descrevia transitoriedade de um valor que era constante; a migration deste PR
     remove o unico emissor. Campo sem emissor mas com tipo e consumidor e' o pior dos
     estados: o proximo leitor conclui que existe. */
  if (info.status === 'oficial') return 'Oficial';
  if (info.status === 'pendente') return 'Pendente — fechamento não concluído';
  if (info.status === 'nao_aplicavel') {
    return 'Não se aplica — nenhum pasto de pecuária neste mês';
  }
  if (info.status === 'nao_iniciado') {
    return 'Não iniciado — nenhum card de pasto neste mês';
  }
  if (info.status === 'nao_implementado') {
    return 'Não implementado — este pilar ainda não tem fechamento no sistema';
  }
  if (info.status === 'bloqueado') {
    const motivo = d?.motivo as string | undefined;
    return motivo ? `Bloqueado — ${motivo}` : 'Bloqueado — dependência pendente';
  }
  return null;
}
