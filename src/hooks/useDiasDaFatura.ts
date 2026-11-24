/**
 * CARTAO-VENC-FATURA-01 (Gabriel 23/11) — os dias da fatura de UM cartão, a MESMA leitura em toda porta (Novo lançamento, + Da nota,
 * Parcelar este lançamento): o cadastro (`diasCadastradosDoCartao`) e as faturas (`diasDoCartao`) juntos pela regra pura `diasDaFatura`.
 * Sem cartão: nada. Falha de leitura: sem dia (o vencimento não é sugerido; nunca um dia inventado).
 */
import { useEffect, useState } from 'react';
import { diasCadastradosDoCartao, diasDoCartao } from '@/lib/financeiro/diasDoCartao';
import { diasDaFatura, type DiasDaFatura } from '@/lib/financeiro/pagamentoNoCartao';

export const SEM_DIAS_DA_FATURA: DiasDaFatura = { vencimento: null, fechamento: null, aviso: null };

/** Lê os dois e junta (exportada para quem não é componente, como a importação). */
export async function lerDiasDaFatura(contaId: string): Promise<DiasDaFatura> {
  try {
    const [cad, faturas] = await Promise.all([diasCadastradosDoCartao(contaId), diasDoCartao(contaId)]);
    return diasDaFatura(cad, faturas);
  } catch {
    return SEM_DIAS_DA_FATURA;
  }
}

export function useDiasDaFatura(cartaoId: string | null): DiasDaFatura {
  const [dias, setDias] = useState<DiasDaFatura>(SEM_DIAS_DA_FATURA);
  useEffect(() => {
    let vivo = true;
    if (!cartaoId) { setDias(SEM_DIAS_DA_FATURA); return; }
    void lerDiasDaFatura(cartaoId).then((d) => { if (vivo) setDias(d); });
    return () => { vivo = false; };
  }, [cartaoId]);
  return dias;
}
