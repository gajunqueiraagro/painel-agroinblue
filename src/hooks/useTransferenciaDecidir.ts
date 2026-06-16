import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ParOfx } from './useExtratoParesOfx';

interface Params {
  clienteId: string | null;
  anoMes: string | null; // 'YYYY-MM'
}

type DecisaoStatus = 'confirmado' | 'rejeitado';

/** Monta a linha de transferencia_ofx_pares a partir de um ParOfx + decisão. */
function parToRow(
  par: ParOfx,
  clienteId: string,
  anoMes: string,
  status: DecisaoStatus,
  motivo: string | null,
  decididoPor: string | null,
) {
  return {
    cliente_id: clienteId,
    ano_mes: anoMes,
    ofx_saida_id: par.saidaId,
    ofx_entrada_id: par.entradaId,
    conta_origem_id: par.contaOrigemId,
    conta_destino_id: par.contaDestinoId,
    valor: par.valor,
    data_saida: par.dataSaida,
    data_entrada: par.dataEntrada,
    status,
    confianca: par.confianca,
    motivo_rejeicao: motivo,
    decidido_em: new Date().toISOString(),
    decidido_por: decididoPor,
  };
}

/**
 * useTransferenciaDecidir — grava decisões humanas em transferencia_ofx_pares.
 * Inerte até consumido (4b). Não toca extrato_bancario_v2.status (D7).
 *
 * - confirmar(par, concorrentes): grava `par` como 'confirmado' e os
 *   `concorrentes` (outros candidatos do MESMO OFX) como 'rejeitado' com
 *   motivo 'auto:concorrente'. Um OFX participa de no máximo 1 par confirmado
 *   (garantido pelos índices uq_tofx_*_confirm da tabela).
 * - rejeitar(par, motivo): grava `par` como 'rejeitado' (motivo manual ou null).
 *
 * Upsert por (ofx_saida_id, ofx_entrada_id) — idempotente; re-decidir atualiza.
 */
export function useTransferenciaDecidir({ clienteId, anoMes }: Params) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const invalidar = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['transferencias-decididas', clienteId, anoMes] });
  }, [qc, clienteId, anoMes]);

  const upsertRows = useCallback(async (rows: ReturnType<typeof parToRow>[]) => {
    const { error: upErr } = await supabase
      .from('transferencia_ofx_pares' as any)
      .upsert(rows, { onConflict: 'ofx_saida_id,ofx_entrada_id' });
    if (upErr) throw upErr;
  }, []);

  const getDecididoPor = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }, []);

  const confirmar = useCallback(
    async (par: ParOfx, concorrentes: ParOfx[]) => {
      if (!clienteId || !anoMes) return;
      setSalvando(true);
      setError(null);
      try {
        const decididoPor = await getDecididoPor();
        const rows = [
          parToRow(par, clienteId, anoMes, 'confirmado', null, decididoPor),
          ...concorrentes.map((c) =>
            parToRow(c, clienteId, anoMes, 'rejeitado', 'auto:concorrente', decididoPor),
          ),
        ];
        await upsertRows(rows);
        invalidar();
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setSalvando(false);
      }
    },
    [clienteId, anoMes, getDecididoPor, upsertRows, invalidar],
  );

  const rejeitar = useCallback(
    async (par: ParOfx, motivo: string | null) => {
      if (!clienteId || !anoMes) return;
      setSalvando(true);
      setError(null);
      try {
        const decididoPor = await getDecididoPor();
        await upsertRows([parToRow(par, clienteId, anoMes, 'rejeitado', motivo, decididoPor)]);
        invalidar();
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setSalvando(false);
      }
    },
    [clienteId, anoMes, getDecididoPor, upsertRows, invalidar],
  );

  return { confirmar, rejeitar, salvando, error };
}
