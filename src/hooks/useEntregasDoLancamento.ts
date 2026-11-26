/**
 * NOTA-ENTREGA-FUTURA-01 (B) — a leitura ÚNICA do papel dos documentos e do saldo a entregar (`fn_lancamento_entregas`): o modal do lançamento
 * lê uma vez e dá à aba Documentos e ao Resumo. Relê quando os documentos vivos mudam (a assinatura = os ids) e no "Tentar de novo".
 */
import { useCallback, useEffect, useState } from 'react';
import { entregasDoLancamento, type EntregasDoLancamento } from '@/lib/financeiro/entregasDoLancamento';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';

export interface EntregasApi { entregas: Consulta<EntregasDoLancamento> | null; recarregar: () => void }

export function useEntregasDoLancamento(lancamentoId: string | null, documentos: readonly { id: string; cancelado: boolean }[],
  ler: typeof entregasDoLancamento = entregasDoLancamento): EntregasApi {
  const [entregas, setEntregas] = useState<Consulta<EntregasDoLancamento> | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const assinatura = documentos.filter((d) => !d.cancelado).map((d) => d.id).sort().join('|');
  useEffect(() => {
    if (!lancamentoId) { setEntregas(null); return; }
    let vivo = true;
    void ler(lancamentoId).then((r) => { if (vivo) setEntregas(r); });
    return () => { vivo = false; };
  }, [lancamentoId, assinatura, tentativa, ler]);
  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);
  return { entregas, recarregar };
}
