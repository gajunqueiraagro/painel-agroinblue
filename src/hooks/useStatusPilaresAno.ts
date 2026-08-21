/**
 * Hook: useStatusPilaresAno
 *
 * Grade de status de fechamento do ANO INTEIRO — uma linha por fazenda × mês, 12 meses
 * sempre, inclusive células 'nao_iniciado'. Alimenta a régua de meses da Visão Geral.
 *
 * POR QUE AQUI A RPC AGREGADA É CERTA, E EM useStatusPilaresLote NÃO.
 * Aquele hook argumenta contra a RPC agregada, e o argumento dele CONTINUA VÁLIDO PARA
 * ELE: é o hook do mês corrente, 3 a 12 chamadas, e a regra tem que morar num lugar só.
 *
 * Aqui a escala é outra: 12 meses × N fazendas. No NJ Pecuária seriam 60 round-trips a
 * cada troca de ano. Medido no banco em 2026-08-21: o trabalho de DADO da grade inteira
 * é ~6,7 ms; todo o resto é custo de invocação — e pelo front cada invocação pagaria
 * ainda a latência de rede.
 *
 * E a regra CONTINUA num lugar só: get_status_pilares_ano ENVOLVE
 * get_status_pilares_fechamento, não a reimplementa. É essa diferença — envolver em vez
 * de duplicar — que torna a agregada aceitável aqui e inaceitável lá.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { StatusPilar } from '@/hooks/useStatusPilares';
import { normalizarStatusPilar } from '@/hooks/useStatusPilaresLote';

export interface StatusCelulaAno {
  fazendaId: string;
  fazendaNome: string;
  anoMes: string;   // 'YYYY-MM'
  mes: number;      // 1..12 — derivado, porque a régua indexa por mês
  p1: StatusPilar;
  p2: StatusPilar;
}

export function useStatusPilaresAno(
  clienteId: string | undefined,
  ano: number | undefined,
  enabled = true,
): { data: StatusCelulaAno[]; loading: boolean; error: string | null } {
  const [data, setData] = useState<StatusCelulaAno[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !clienteId || !ano) {
      setData([]); setLoading(false); setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        /* `(supabase as any).rpc` é a exceção zero-cast autorizada pelo CLAUDE.md, e o
           idioma já usado em DiagFechamentoPanel, useSistemaNaoExplicado e outros:
           get_status_pilares_ano nasceu hoje e não está em types.ts. */
        const { data: linhas, error: err } = await (supabase as any).rpc(
          'get_status_pilares_ano',
          { p_cliente_id: clienteId, p_ano: ano },
        );
        if (cancelled) return;

        if (err) {
          // Erro NUNCA vira grade: célula inventada é pior que grade vazia.
          setError(err.message ?? String(err));
          setData([]);
          return;
        }

        const celulas: StatusCelulaAno[] = [];
        for (const l of Array.isArray(linhas) ? linhas : []) {
          const anoMes = String(l?.ano_mes ?? '');
          const mes = Number(anoMes.slice(5, 7));
          if (!Number.isInteger(mes) || mes < 1 || mes > 12) continue;
          celulas.push({
            fazendaId: String(l?.fazenda_id ?? ''),
            fazendaNome: String(l?.fazenda_nome ?? ''),
            anoMes,
            mes,
            /* p1 e p2 chegam como TEXT SOLTO (RETURNS TABLE(... p1 text, p2 text)), e não
               como o objeto {status} do get_status_pilares_fechamento. Por isso o miolo
               é que foi compartilhado, e não o lerStatus inteiro. */
            p1: normalizarStatusPilar(l?.p1),
            p2: normalizarStatusPilar(l?.p2),
          });
        }
        setData(celulas);
      } catch (e) {
        if (!cancelled) { setError(String(e)); setData([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Guarda de corrida: cliente ou ano mudaram durante o fetch -> resultado obsoleto.
    return () => { cancelled = true; };
    // Dependências ESCALARES — sem a armadilha do array que obrigou useRef no hook do
    // lote. Não há motivo para ref aqui.
  }, [clienteId, ano, enabled]);

  return { data, loading, error };
}
